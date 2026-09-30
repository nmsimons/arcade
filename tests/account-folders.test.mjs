import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { oneDrive, escapeDescription } from './helpers/oneDrive.mjs'
import { createCloudStore } from '../src/accounts/cloudStore.ts'
import { createSync, cloudHeads } from '../src/accounts/sync.ts'
import { emptyWorkspace, readWorkspace, serializeWorkspace, digest } from '../src/accounts/data.ts'
import { SAVE_SLOTS } from '../src/accounts/profileStorage.ts'
import { workspaceFiles, filesWorkspace, LEVEL_FOLDER } from '../src/accounts/cloudLayout.ts'
import { loadLocalLevelFiles } from '../src/games/jumping/levelAssets.ts'
import { accountLevelRepository, importLevelCollection } from '../src/accounts/levelLibrary.ts'
import { ACTIVE_HISTORY_LIMIT } from '../src/accounts/oneDriveStore.ts'

const signal = () => new AbortController().signal
const fixture = readFileSync(new URL('./fixtures/jumping/00-json-test-lab.json', import.meta.url), 'utf8')
const store = () => { const data = new Map(); return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) } }
const connect = drive => createCloudStore('microsoft', async () => 'test-token', drive.fetch)
const setSave = (local, n) => local.setItem(SAVE_SLOTS[0], JSON.stringify({ banked: n }))
const save = local => JSON.parse(local.getItem(SAVE_SLOTS[0]))?.banked

test('downloads use full item metadata when Graph field projection omits the download URL', async () => {
  const drive = oneDrive(), local = store(), cloud = connect(drive)
  const file = drive.put('Hard Vacuum/expedition.json', '{"banked":81}')
  const projected = await drive.fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${file.id}?$select=id,eTag,size,@microsoft.graph.downloadUrl`, { headers: { Authorization: 'Bearer test' } })
  assert.equal((await projected.json())['@microsoft.graph.downloadUrl'], undefined)
  drive.requests.length = 0
  assert.equal((await createSync(local, cloud).sync(signal())).status, 'synced')
  assert.equal(save(local), 81)
  const downloadInfo = drive.requests.filter(request => request.url.pathname === `/v1.0/me/drive/items/${file.id}`)
  assert.ok(downloadInfo.length > 0)
  assert.ok(downloadInfo.every(request => !request.url.search))
  const downloads = drive.requests.filter(request => request.url.host === 'files.1drv.com')
  assert.ok(downloads.length > 0)
  assert.ok(downloads.every(request => !request.headers.has('authorization')))
})

test('escaped OneDrive descriptions round-trip sync state and history without changing file bytes', async () => {
  const local = store(), drive = oneDrive(), cloud = connect(drive), sync = createSync(local, cloud)
  const text = '{"banked":42,"note":"literal &quot; and &#123; stay as written"}'
  local.setItem(SAVE_SLOTS[0], text)
  const entry = (await sync.sync(signal())).heads[0]
  const response = await drive.fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${drive.find('Sync history').id}`, { headers: { Authorization: 'Bearer test' } })
  assert.match((await response.json()).description, /^&#123;&quot;version&quot;/)
  assert.equal(drive.find('Hard Vacuum/expedition.json').text, text)
  assert.equal(JSON.parse(await cloud.read(entry, signal())).slots[SAVE_SLOTS[0]], text)
  const other = store(); await createSync(other, connect(drive)).sync(signal())
  assert.equal(other.getItem(SAVE_SLOTS[0]), text)
  drive.requests.length = 0
  await sync.sync(signal())
  assert.ok(drive.requests.every(request => request.method === 'GET'))
})

test('description parsing accepts plain, decimal and hexadecimal metadata and rejects damaged descriptions without writes', async () => {
  for (const descriptionResponse of [text => text, text => [...text].map(character => `&#${character.codePointAt(0)};`).join(''), text => [...text].map(character => `&#x${character.codePointAt(0).toString(16)};`).join('')]) {
    const drive = oneDrive({ descriptionResponse }), local = store(), other = store()
    setSave(local, 7); await createSync(local, connect(drive)).sync(signal())
    await createSync(other, connect(drive)).sync(signal()); assert.equal(save(other), 7)
  }
  for (const damaged of ['{invalid', '&#1114112;', '&#xD800;', '<script>invalid</script>', 'x'.repeat(16001)]) {
    const local = store(), drive = oneDrive(), sync = createSync(local, connect(drive))
    setSave(local, 9); await sync.sync(signal())
    drive.find('Sync history').description = damaged
    drive.requests.length = 0
    await assert.rejects(sync.sync(signal()), /sync information could not be read/)
    assert.equal(save(local), 9)
    assert.ok(drive.requests.every(request => request.method === 'GET'))
  }
  // Decode only one provider-escaping layer, never repeatedly until it parses.
  const twice = oneDrive({ descriptionResponse: text => escapeDescription(escapeDescription(text)) }), local = store()
  setSave(local, 1)
  await assert.rejects(createSync(local, connect(twice)).sync(signal()), /could not be read/)
})

test('collection imports preserve supplied manifest bytes and append new files to existing indexes', () => {
  const index = '{ "version": 1, "order": "listed", "levels": ["B.json", "A.json"], "chapter": "Mine" }\n'
  const other = JSON.stringify({ ...JSON.parse(fixture), id: 'second' })
  const imported = importLevelCollection(emptyWorkspace().levels, { 'A.json': fixture, 'B.json': other, 'index.json': index })
  assert.equal(imported.files['index.json'], index)
  assert.equal(imported.files['A.json'], fixture)
  const appended = importLevelCollection(imported, { 'C.json': JSON.stringify({ ...JSON.parse(fixture), id: 'third' }) })
  assert.deepEqual(JSON.parse(appended.files['index.json']).levels, ['B.json', 'A.json', 'C.json'])
  assert.equal(JSON.parse(appended.files['index.json']).chapter, 'Mine')
  assert.throws(() => importLevelCollection(imported, { 'A.json': fixture }), /already exists/)
})

test('OneDrive layout is per game and level collections load unchanged with the local loader', async () => {
  const local = store(), drive = oneDrive(), repo = accountLevelRepository(local)
  setSave(local, 42); local.setItem('arcade.jumping.times.v1', '{"tower":12.3}')
  await repo.save('My level.jump-level.json', JSON.parse(fixture))
  const before = readWorkspace(local)
  await createSync(local, connect(drive)).sync(signal())
  assert.equal(drive.find('Hard Vacuum/expedition.json').text, before.slots[SAVE_SLOTS[0]])
  assert.equal(drive.find('Untitled Jumping Game/personal-bests.json').text, '{"tower":12.3}')
  for (const [name, text] of Object.entries(before.levels.files)) assert.equal(drive.find(`${LEVEL_FOLDER}/${name}`).text, text)
  const collection = await loadLocalLevelFiles(Object.entries(before.levels.files).map(([name, text]) => ({ name, size: Buffer.byteLength(text), text: async () => text })))
  assert.deepEqual(collection.errors, []); assert.equal(collection.files.length, 1)
  assert.ok(drive.paths().every(path => path.startsWith('Hard Vacuum/') || path.startsWith('Untitled Jumping Game/') || path.startsWith('Sync history/')))
  assert.ok(drive.paths().filter(path => path.startsWith('Sync history/')).every(path => !drive.find(path).text.includes('banked')))
  const remote = store(); await createSync(remote, connect(drive)).sync(signal())
  assert.equal(save(remote), 42)
  assert.equal(serializeWorkspace(readWorkspace(remote)), serializeWorkspace(before))
})

test('plain level additions, edits, manifest order and removals in OneDrive synchronize back', async () => {
  const local = store(), drive = oneDrive(), sync = createSync(local, connect(drive))
  const index = '{ "version": 1, "order": "listed", "levels": ["Copied.json"], "chapter": "Mine" }\n'
  drive.put(`${LEVEL_FOLDER}/Copied.json`, fixture); drive.put(`${LEVEL_FOLDER}/index.json`, index)
  await sync.sync(signal())
  assert.equal(readWorkspace(local).levels.files['Copied.json'], fixture)
  assert.equal(readWorkspace(local).levels.files['index.json'], index)
  const edited = JSON.stringify({ ...JSON.parse(fixture), name: 'Edited outside Arcade' }, null, 2)
  drive.put(`${LEVEL_FOLDER}/Copied.json`, edited)
  await sync.sync(signal()); assert.equal(readWorkspace(local).levels.files['Copied.json'], edited)
  drive.remove(`${LEVEL_FOLDER}/Copied.json`)
  await sync.sync(signal()); assert.equal(readWorkspace(local).levels.files['Copied.json'], undefined)
  // Match local folders: a missing indexed file keeps its manifest position.
  assert.equal(readWorkspace(local).levels.files['index.json'], index)
})

test('recycle files use the local timestamp/UUID directory and restore without conversion', async () => {
  const local = store(), repo = accountLevelRepository(local), drive = oneDrive(), sync = createSync(local, connect(drive))
  const initial = await repo.save('Level.json', JSON.parse(fixture))
  await repo.remove((await repo.read()).files[0], initial.manifestSource)
  const deleted = readWorkspace(local).levels.deleted[0]
  await sync.sync(signal())
  const name = `${new Date(deleted.at).toISOString().replace(/[:.]/g, '-')}-${deleted.id}`
  assert.equal(drive.find(`${LEVEL_FOLDER}/Deleted levels/${name}/Level.json`).text, deleted.text)
  const other = store(); await createSync(other, connect(drive)).sync(signal())
  const otherRepo = accountLevelRepository(other), entry = (await otherRepo.deleted()).deleted[0]
  await otherRepo.restore(entry, 'Restored.json', (await otherRepo.read()).manifestSource)
  await createSync(other, connect(drive)).sync(signal())
  assert.equal(drive.find(`${LEVEL_FOLDER}/Restored.json`).text, deleted.text)
  assert.equal(drive.find(`${LEVEL_FOLDER}/Deleted levels/${name}/Level.json`), undefined)
})

test('diverging device and external edits stay in separate recoverable heads', async () => {
  const local = store(), drive = oneDrive(), cloud = connect(drive), sync = createSync(local, cloud)
  setSave(local, 1); await sync.sync(signal())
  setSave(local, 2); drive.put('Hard Vacuum/expedition.json', '{"banked":3}')
  assert.equal((await sync.sync(signal())).status, 'conflict'); assert.equal(save(local), 2)
  await sync.resolve('local', signal())
  assert.equal(drive.find('Hard Vacuum/expedition.json').text, '{"banked":2}')
  const entries = await cloud.list(signal()), history = await Promise.all(entries.map(entry => cloud.read(entry, signal())))
  assert.ok(history.some(text => JSON.parse(text).slots[SAVE_SLOTS[0]] === '{"banked":3}'))
  assert.equal(cloudHeads(entries).length, 1)
})

test('conditional moves preserve a file edited during publication', async () => {
  const local = store(), drive = oneDrive(), sync = createSync(local, connect(drive))
  setSave(local, 1); await sync.sync(signal()); setSave(local, 2)
  const original = drive.find('Hard Vacuum/expedition.json')
  drive.before = request => {
    if (request.method === 'PATCH' && request.url.pathname.endsWith('/' + original.id)) {
      drive.before = undefined; drive.put('Hard Vacuum/expedition.json', '{"banked":3}')
    }
  }
  await assert.rejects(sync.sync(signal()), /changed during sync/)
  assert.equal(drive.find('Hard Vacuum/expedition.json').text, '{"banked":3}')
  assert.equal(save(local), 2)
  assert.equal((await sync.sync(signal())).status, 'conflict')
  await sync.resolve('local', signal())
  assert.equal(drive.find('Hard Vacuum/expedition.json').text, '{"banked":2}')
})

test('failed file creation after a move cannot be accepted as a complete remote save', async () => {
  const local = store(), drive = oneDrive(), cloud = connect(drive), sync = createSync(local, cloud)
  setSave(local, 1); await sync.sync(signal()); setSave(local, 2)
  const gameId = drive.find('Hard Vacuum').id
  drive.before = request => {
    if (request.method === 'PUT' && request.url.pathname === `/v1.0/me/drive/items/${gameId}:/expedition.json:/content`) {
      drive.before = undefined; return Response.json({ error: { code: 'quotaLimitReached' } }, { status: 507 })
    }
  }
  await assert.rejects(sync.sync(signal()), /drive is full/)
  assert.equal(save(local), 2)
  const fresh = store(), next = createSync(fresh, connect(drive))
  assert.equal((await next.sync(signal())).status, 'conflict')
  assert.equal(fresh.getItem(SAVE_SLOTS[0]), null)
  await sync.resolve('local', signal())
  assert.equal(drive.find('Hard Vacuum/expedition.json').text, '{"banked":2}')
  assert.ok(drive.paths().some(path => path.includes('/History/Replaced/') && drive.find(path).text === '{"banked":1}'))
})

test('interrupted renames recover through local or cloud choice even with duplicate IDs and external edits', async () => {
  for (const choice of ['local', 'cloud']) {
    const local = store(), drive = oneDrive(), cloud = connect(drive), sync = createSync(local, cloud), repo = accountLevelRepository(local)
    const level = JSON.parse(fixture), first = await repo.save('A.json', level)
    const initial = (await sync.sync(signal())).heads[0]
    const old = drive.find(`${LEVEL_FOLDER}/A.json`)
    await repo.save('B.json', level, first.text, 'A.json')
    drive.before = request => {
      if (request.method === 'PATCH' && request.url.pathname.endsWith('/' + old.id)) {
        drive.before = undefined; return new Response('', { status: 503 })
      }
    }
    await assert.rejects(sync.sync(signal()), /503/)
    assert.ok(drive.find(`${LEVEL_FOLDER}/A.json`)); assert.ok(drive.find(`${LEVEL_FOLDER}/B.json`))
    const external = JSON.stringify({ ...level, name: 'External edit after interruption' })
    drive.put(`${LEVEL_FOLDER}/B.json`, external)
    const result = await sync.sync(signal())
    assert.equal(result.status, 'conflict'); assert.equal(result.recovery, true)
    await sync.resolve(choice === 'local' ? 'local' : initial, signal())
    const kept = choice === 'local' ? 'B.json' : 'A.json', removed = choice === 'local' ? 'A.json' : 'B.json'
    assert.equal(drive.find(`${LEVEL_FOLDER}/${kept}`).text, first.text)
    assert.equal(drive.find(`${LEVEL_FOLDER}/${removed}`), undefined)
    assert.ok(drive.paths().some(path => path.includes('/History/Replaced/') && drive.find(path).text === external))
    assert.equal((await createSync(store(), connect(drive)).sync(signal())).status, 'synced')
  }
})

test('progress-only snapshots reuse unchanged level history and every version remains readable', async () => {
  const local = store(), drive = oneDrive(), cloud = connect(drive), sync = createSync(local, cloud)
  await accountLevelRepository(local).save('Level.json', JSON.parse(fixture))
  const entries = []
  for (let n = 0; n < 8; n++) { setSave(local, n); entries.push((await sync.sync(signal())).heads[0]) }
  const levelCopies = drive.paths().filter(path => /^Untitled Jumping Game\/History\/[^/]+\/Levels\/Level.json$/.test(path))
  assert.equal(levelCopies.length, 1)
  for (const [n, entry] of entries.entries()) {
    const text = await cloud.read(entry, signal())
    assert.equal(await digest(text), entry.hash)
    assert.equal(JSON.parse(JSON.parse(text).slots[SAVE_SLOTS[0]]).banked, n)
    assert.equal(JSON.parse(text).levels.files['Level.json'], readWorkspace(local).levels.files['Level.json'])
  }
})

test('history beyond 2,000 versions is archived without deleting payloads or inventing heads', async () => {
  const drive = oneDrive(), cloud = connect(drive)
  await cloud.list(signal())
  const hash = await digest(serializeWorkspace(emptyWorkspace())), entries = []
  function version(parents, i) {
    const entry = { id: crypto.randomUUID(), hash, parents, at: new Date(i % 2 ? 0 : 2_000_000_000_000).toISOString() }
    const file = drive.put(`Sync history/Versions/${entry.id}.json`, JSON.stringify({ version: 2, entry, files: [] }))
    file.description = 'Dream Large Arcade v2 ' + JSON.stringify(entry)
    return { ...entry, fileId: file.id }
  }
  for (let i = 0; i < 2001; i++) entries.push(version(i ? [entries[i - 1].id] : [], i))
  const fork = version([entries[0].id], 1)
  drive.find('Sync history').description = JSON.stringify({ version: 2, current: entries.at(-1).id, hash })
  const listed = await cloud.list(signal())
  assert.equal(listed.length, ACTIVE_HISTORY_LIMIT)
  assert.deepEqual(new Set(cloudHeads(listed).map(entry => entry.id)), new Set([entries.at(-1).id, fork.id]))
  assert.equal(drive.paths().filter(path => path.startsWith('Sync history/Older versions/')).length, 2002 - ACTIVE_HISTORY_LIMIT)
  assert.equal(await cloud.read(entries[0], signal()), serializeWorkspace(emptyWorkspace()))
  assert.equal((await createSync(store(), cloud).resolve('local', signal())).status, 'synced')
  assert.equal(cloudHeads(await cloud.list(signal())).length, 1)
})

test('two writers cannot publish over each other and both histories remain recoverable', async () => {
  const drive = oneDrive(), a = store(), b = store(), ca = connect(drive), cb = connect(drive)
  await ca.list(signal()); await cb.list(signal())
  setSave(a, 1); setSave(b, 2)
  const prepare = async (cloud, local) => { const text = serializeWorkspace(readWorkspace(local)); return [await cloud.create({ id: crypto.randomUUID(), hash: await digest(text), at: new Date().toISOString(), parents: [] }, text, signal()), text] }
  const [ea, ta] = await prepare(ca, a), [eb, tb] = await prepare(cb, b)
  const results = await Promise.allSettled([ca.publish(ea, ta, signal()), cb.publish(eb, tb, signal())])
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
  assert.equal(cloudHeads(await ca.list(signal())).length, 2)
})

test('interrupted history archiving preserves the original heads on the next check', async () => {
  const drive = oneDrive(), cloud = connect(drive)
  await cloud.list(signal())
  const hash = await digest(serializeWorkspace(emptyWorkspace())), entries = []
  for (let i = 0; i < 130; i++) {
    const entry = { id: crypto.randomUUID(), hash, parents: i ? [entries[i - 1].id] : [], at: new Date(i * 1000).toISOString() }
    entries.push(entry)
  }
  // OneDrive listing order is not guaranteed to match ancestry or timestamps.
  for (const entry of entries.toReversed()) {
    const file = drive.put(`Sync history/Versions/${entry.id}.json`, JSON.stringify({ version: 2, entry, files: [] }))
    file.description = 'Dream Large Arcade v2 ' + JSON.stringify(entry)
  }
  drive.find('Sync history').description = JSON.stringify({ version: 2, current: entries.at(-1).id, hash })
  let moves = 0
  drive.before = request => {
    if (request.method === 'PATCH' && JSON.parse(request.body).parentReference && ++moves === 12) return new Response('', { status: 503 })
  }
  await assert.rejects(cloud.list(signal()), /503/)
  drive.before = undefined
  const listed = await connect(drive).list(signal())
  assert.deepEqual(cloudHeads(listed).map(entry => entry.id), [entries.at(-1).id])
  assert.equal(drive.paths().filter(path => path.startsWith('Sync history/Older versions/')).length, 11)
})

test('unchanged sync creates no versions, moves or uploads', async () => {
  const local = store(), drive = oneDrive(), sync = createSync(local, connect(drive))
  setSave(local, 1); await sync.sync(signal())
  drive.requests.length = 0
  await sync.sync(signal())
  assert.ok(drive.requests.every(request => request.method === 'GET'))
  assert.ok(drive.requests.length <= 18, `Unchanged sync made ${drive.requests.length} requests`)
})

test('publishing a second level avoids repeated downloads and reports actual file upload completion', async () => {
  const local = store(), drive = oneDrive(), repo = accountLevelRepository(local)
  await repo.save('First.json', JSON.parse(fixture))
  await createSync(local, connect(drive)).sync(signal())
  await repo.save('Second.json', { ...JSON.parse(fixture), id: 'second', name: 'Second' })
  drive.requests.length = 0
  const phases = []
  const cloud = createCloudStore('microsoft', async () => 'test', drive.fetch, undefined, value => phases.push(value))
  await createSync(local, cloud).sync(signal())
  assert.equal(drive.find(`${LEVEL_FOLDER}/Second.json`).text, readWorkspace(local).levels.files['Second.json'])
  assert.ok(drive.requests.length <= 56, `Second level made ${drive.requests.length} requests`)
  // Current files plus one small version manifest, used to reuse unchanged history.
  assert.equal(drive.requests.filter(r => r.url.host === 'files.1drv.com').length, 3)
  assert.ok(phases.some(p => p.stage === 'publishing' && p.fileName === 'Second.json' && p.completed === 0 && p.total === 2))
  assert.ok(phases.some(p => p.stage === 'publishing' && p.completed === 2 && p.total === 2))
  assert.equal(phases.at(-1).stage, 'verifying')
})

test('final verification rejects an external edit made after successful upload responses', async () => {
  const local = store(), drive = oneDrive()
  setSave(local, 1); await createSync(local, connect(drive)).sync(signal())
  setSave(local, 2)
  const cloud = createCloudStore('microsoft', async () => 'test', drive.fetch, undefined, value => {
    if (value.stage === 'verifying') drive.put('Hard Vacuum/expedition.json', '{"banked":3}')
  })
  await assert.rejects(createSync(local, cloud).sync(signal()), /changed during sync/)
  assert.equal(save(local), 2)
  assert.equal(drive.find('Hard Vacuum/expedition.json').text, '{"banked":3}')
})

test('abandoned uploads wait for the lease, then surface a conflict without applying partial data', async () => {
  const local = store(), drive = oneDrive(), cloud = connect(drive), sync = createSync(local, cloud)
  setSave(local, 1); await sync.sync(signal()); setSave(local, 2)
  const controller = new AbortController(), original = drive.find('Hard Vacuum/expedition.json')
  drive.before = request => {
    if (request.method === 'PATCH' && request.url.pathname.endsWith('/' + original.id)) {
      drive.before = undefined; controller.abort(); controller.signal.throwIfAborted()
    }
  }
  await assert.rejects(sync.sync(controller.signal), { name: 'AbortError' })
  await assert.rejects(connect(drive).list(signal()), /Another device/)
  const control = drive.find('Sync history'), state = JSON.parse(control.description)
  state.pending.at = Date.now() - 120001; control.description = JSON.stringify(state)
  const other = store()
  assert.equal((await createSync(other, connect(drive)).sync(signal())).status, 'conflict')
  assert.equal(other.getItem(SAVE_SLOTS[0]), null)
})

test('a completed upload whose final marker fails is finalized on retry', async () => {
  const local = store(), drive = oneDrive(), sync = createSync(local, connect(drive))
  setSave(local, 1)
  drive.before = request => {
    if (request.method === 'PATCH' && JSON.parse(request.body).description) {
      const description = JSON.parse(request.body).description
      if (description.startsWith('{')) {
        const state = JSON.parse(description)
        if (state.current && !state.pending) { drive.before = undefined; return new Response('', { status: 503 }) }
      }
    }
  }
  await assert.rejects(sync.sync(signal()), /503/)
  assert.equal((await sync.sync(signal())).status, 'synced')
  assert.equal((await connect(drive).list(signal())).length, 1)
})

test('tampered recovery files and manifests cannot restore or read outside the game folders', async () => {
  const local = store(), drive = oneDrive(), cloud = connect(drive), sync = createSync(local, cloud)
  setSave(local, 1); const entry = (await sync.sync(signal())).heads[0]
  drive.put(`Hard Vacuum/History/${entry.id}/expedition.json`, '{"banked":99}')
  await assert.rejects(cloud.read(entry, signal()), /integrity/)
  const path = `Sync history/Versions/${entry.id}.json`, original = JSON.parse(drive.find(path).text)
  original.files[0].path = 'Hard Vacuum/../../other.json'
  drive.put(path, JSON.stringify(original))
  await assert.rejects(cloud.read(entry, signal()), /path/)
})

test('current and archive files reject unsafe paths, duplicates, oversized and malformed levels', async () => {
  const data = emptyWorkspace(); data.levels.files = { 'x.json': fixture, 'X.json': JSON.stringify({ ...JSON.parse(fixture), id: 'other' }) }
  assert.throws(() => workspaceFiles(data), /capitalization/)
  assert.throws(() => filesWorkspace(new Map([['Untitled Jumping Game/Levels/../escape.json', fixture]])), /filename/)
  const drive = oneDrive(); drive.put(`${LEVEL_FOLDER}/bad.json`, '{}')
  await assert.rejects(connect(drive).list(signal()))
  drive.put(`${LEVEL_FOLDER}/bad.json`, ' '.repeat(4_000_001))
  await assert.rejects(connect(drive).list(signal()), /size limit/)
})

test('OneDrive never sends tokens to downloads or hostile pagination', async () => {
  const drive = oneDrive(); drive.put(`${LEVEL_FOLDER}/Level.json`, fixture)
  const cloud = connect(drive); await cloud.list(signal())
  assert.ok(drive.requests.filter(r => r.url.host === 'files.1drv.com').every(r => !r.headers.has('authorization')))
  drive.before = request => request.method === 'GET' && request.url.pathname.endsWith('/children') ? Response.json({ value: [], '@odata.nextLink': 'https://evil.example/steal' }) : undefined
  await assert.rejects(cloud.list(signal()), /endpoint/)
  assert.ok(drive.requests.every(r => ['files.1drv.com', 'graph.microsoft.com'].includes(r.url.host)))
})
