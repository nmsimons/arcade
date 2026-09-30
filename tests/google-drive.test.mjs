import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { googleDrive } from './helpers/googleDrive.mjs'
import { createCloudStore } from '../src/accounts/cloudStore.ts'
import { accountLevelRepository } from '../src/accounts/levelLibrary.ts'
import { cloudHeads, createSync } from '../src/accounts/sync.ts'
import { digest, emptyWorkspace, readWorkspace, serializeWorkspace } from '../src/accounts/data.ts'
import { LEVEL_FOLDER } from '../src/accounts/cloudLayout.ts'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/jumping/00-json-test-lab.json', import.meta.url)))
const signal = () => new AbortController().signal
const memory = () => { const data = new Map(); return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) } }
const connect = drive => createCloudStore('google', async () => 'google-test-token', drive.fetch)
const progress = (store, n) => store.setItem('arcade.jumping.times.v1', JSON.stringify({ Tower: n }))

test('Google Drive publishes ordinary per-game files and reports the actual visible folder', async () => {
  const local = memory(), drive = googleDrive(), locations = [], stages = []
  const repo = accountLevelRepository(local), saved = await repo.save('Portable.json', fixture)
  progress(local, 123)
  const cloud = createCloudStore('google', async () => 'token', drive.fetch, folder => locations.push(folder), stage => stages.push(stage))
  await createSync(local, cloud).sync(signal())
  assert.equal(drive.find(`${LEVEL_FOLDER}/Portable.json`).text, saved.text)
  assert.equal(drive.find(`${LEVEL_FOLDER}/index.json`).text, readWorkspace(local).levels.files['index.json'])
  assert.equal(drive.find('Untitled Jumping Game/personal-bests.json').text, '{"Tower":123}')
  assert.equal(locations[0].name, 'Dream Large Arcade')
  assert.match(locations[0].webUrl, /^https:\/\/drive.google.com\/drive\/folders\//)
  assert.ok(stages.some(stage => stage.stage === 'publishing' && stage.fileName === 'Portable.json'))
  assert.equal(stages.at(-1).stage, 'verifying')
  const other = memory()
  assert.equal((await createSync(other, connect(drive)).sync(signal())).status, 'synced')
  assert.equal(serializeWorkspace(readWorkspace(other)), serializeWorkspace(readWorkspace(local)))
  assert.ok(drive.requests.every(r => !r.url.href.includes('appDataFolder')))
})

test('Google sync reuses unchanged level history and unchanged checks never upload', async () => {
  const local = memory(), drive = googleDrive(), cloud = connect(drive), sync = createSync(local, cloud)
  await accountLevelRepository(local).save('Level.json', fixture)
  const entries = []
  for (let n = 1; n <= 5; n++) { progress(local, n); entries.push((await sync.sync(signal())).heads[0]) }
  assert.equal(drive.paths().filter(path => /^Untitled Jumping Game\/History\/[^/]+\/Levels\/Level.json$/.test(path)).length, 1)
  for (const entry of entries) assert.equal(await digest(await cloud.read(entry, signal())), entry.hash)
  drive.requests.length = 0
  await sync.sync(signal())
  assert.ok(drive.requests.every(r => r.method === 'GET'))
  assert.ok(drive.requests.length <= 45, `Unchanged check used ${drive.requests.length} requests`)
})

test('diverging Google browsers preserve both histories and an explicit choice resolves them', async () => {
  const a = memory(), b = memory(), drive = googleDrive(), sa = createSync(a, connect(drive)), sb = createSync(b, connect(drive))
  progress(a, 1); await sa.sync(signal()); await sb.sync(signal())
  progress(a, 2); progress(b, 3); await sa.sync(signal())
  assert.equal((await sb.sync(signal())).status, 'conflict')
  await sb.resolve('local', signal()); await sa.sync(signal())
  assert.equal(a.getItem('arcade.jumping.times.v1'), '{"Tower":3}')
  assert.equal(cloudHeads(await connect(drive).list(signal())).length, 1)
})

test('Google interrupted renames can recover either local or complete cloud files', async () => {
  for (const choice of ['local', 'cloud']) {
    const local = memory(), drive = googleDrive(), cloud = connect(drive), sync = createSync(local, cloud), repo = accountLevelRepository(local)
    const first = await repo.save('A.json', fixture), initial = (await sync.sync(signal())).heads[0]
    const old = drive.find(`${LEVEL_FOLDER}/A.json`)
    await repo.save('B.json', fixture, first.text, 'A.json')
    drive.before = request => {
      if (request.method === 'PATCH' && request.url.pathname.endsWith('/' + old.id)) { drive.before = undefined; return new Response('', { status: 503 }) }
    }
    await assert.rejects(sync.sync(signal()), /503/)
    assert.equal((await sync.sync(signal())).recovery, true)
    await sync.resolve(choice === 'local' ? 'local' : initial, signal())
    assert.equal(drive.find(`${LEVEL_FOLDER}/${choice === 'local' ? 'B' : 'A'}.json`).text, first.text)
    assert.equal(drive.find(`${LEVEL_FOLDER}/${choice === 'local' ? 'A' : 'B'}.json`), undefined)
    assert.ok(drive.paths().some(path => path.includes('/History/Replaced/')))
  }
})

test('Google conditional moves preserve edits made externally during publication', async () => {
  const local = memory(), drive = googleDrive(), sync = createSync(local, connect(drive))
  progress(local, 1); await sync.sync(signal()); progress(local, 2)
  const path = 'Untitled Jumping Game/personal-bests.json', file = drive.find(path)
  drive.before = request => {
    if (request.method === 'PATCH' && request.url.pathname.endsWith('/' + file.id)) { drive.before = undefined; drive.put(path, '{"Tower":3}') }
  }
  await assert.rejects(sync.sync(signal()), /changed during sync/)
  assert.equal(drive.find(path).text, '{"Tower":3}')
  assert.equal((await sync.sync(signal())).status, 'conflict')
  await sync.resolve('local', signal())
  assert.ok(drive.paths().some(path => path.includes('/History/Replaced/') && drive.find(path).text === '{"Tower":3}'))
})

test('Google history beyond 2,000 versions compacts with all recovery bytes intact', async () => {
  const drive = googleDrive(), cloud = connect(drive)
  await cloud.list(signal())
  const hash = await digest(serializeWorkspace(emptyWorkspace())), entries = []
  for (let i = 0; i < 2001; i++) {
    const entry = { id: crypto.randomUUID(), hash, parents: i ? [entries.at(-1).id] : [], at: new Date(i).toISOString() }
    const file = drive.put(`Sync history/Versions/${entry.id}.json`, JSON.stringify({ version: 2, entry, files: [] }))
    file.description = 'Dream Large Arcade v2 ' + JSON.stringify(entry)
    entries.push({ ...entry, fileId: file.id })
  }
  drive.find('Sync history').description = JSON.stringify({ version: 2, current: entries.at(-1).id, hash })
  const listed = await cloud.list(signal())
  assert.equal(listed.length, 100)
  assert.deepEqual(cloudHeads(listed).map(entry => entry.id), [entries.at(-1).id])
  assert.equal(await cloud.read(entries[0], signal()), serializeWorkspace(emptyWorkspace()))
})

test('Google rejects duplicate current filenames and metadata without a version', async () => {
  const drive = googleDrive(), local = memory(), sync = createSync(local, connect(drive))
  progress(local, 1); await sync.sync(signal())
  const file = drive.find('Untitled Jumping Game/personal-bests.json')
  drive.items.set('duplicate', { ...file, id: 'duplicate' })
  await assert.rejects(sync.sync(signal()), /duplicate filenames/)
  drive.items.delete('duplicate'); delete file.etag
  await assert.rejects(sync.sync(signal()), /version information/)
  assert.equal(local.getItem('arcade.jumping.times.v1'), '{"Tower":1}')
})

test('Google finds a renamed app folder and stops safely if multiple app folders exist', async () => {
  const drive = googleDrive(), local = memory(), locations = []
  progress(local, 1)
  const cloud = createCloudStore('google', async () => 'token', drive.fetch, folder => locations.push(folder))
  const sync = createSync(local, cloud)
  await sync.sync(signal())
  const root = drive.find('')
  root.title = 'My Arcade'
  await sync.sync(signal())
  assert.equal(locations.at(-1).name, 'My Arcade')
  drive.items.set('extra-root', { ...root, id: 'extra-root', title: 'Arcade copy' })
  drive.requests.length = 0
  await assert.rejects(sync.sync(signal()), /multiple Arcade folders.*Trash/)
  assert.ok(drive.requests.every(request => request.method === 'GET'))
  assert.equal(local.getItem('arcade.jumping.times.v1'), '{"Tower":1}')
  drive.items.get('extra-root').trashed = true
  assert.equal((await sync.sync(signal())).status, 'synced')
})

test('Google picker grants expose copied levels without uploading duplicate files', async () => {
  const drive = googleDrive(), cloud = connect(drive), local = memory(), sync = createSync(local, cloud)
  await sync.sync(signal())
  const text = JSON.stringify(fixture), file = drive.put(`${LEVEL_FOLDER}/Copied.json`, text)
  file.appAccessible = false
  await sync.sync(signal())
  assert.equal(readWorkspace(local).levels.files['Copied.json'], undefined)
  const { createGoogleDriveStore } = await import('../src/accounts/googleDriveStore.ts')
  const access = createGoogleDriveStore(async () => 'token', drive.fetch)
  await assert.rejects(access.pickedFiles([file.id], signal()), /404/)
  file.appAccessible = true
  assert.deepEqual(await access.pickedFiles([file.id], signal()), [{ name: 'Copied.json', text, inLibrary: true }])
  await sync.sync(signal())
  assert.equal(readWorkspace(local).levels.files['Copied.json'], text)
  assert.equal(drive.find(`${LEVEL_FOLDER}/Copied.json`).id, file.id)
  assert.equal([...drive.items.values()].filter(item => item.title === 'Copied.json' && item.parents.some(p => p.id === drive.find(LEVEL_FOLDER).id)).length, 1)
})

test('Google picker reads external files safely and rejects ambiguous or unsafe selections', async () => {
  const drive = googleDrive()
  const { createGoogleDriveStore } = await import('../src/accounts/googleDriveStore.ts')
  const access = createGoogleDriveStore(async () => 'token', drive.fetch)
  const first = drive.put('Elsewhere/A.json', JSON.stringify(fixture))
  assert.equal((await access.pickedFiles([first.id], signal()))[0].inLibrary, false)
  const duplicate = drive.put('Another/A.json', JSON.stringify(fixture))
  await assert.rejects(access.pickedFiles([first.id, duplicate.id], signal()), /filename only once/)
  await assert.rejects(access.pickedFiles(['https://evil.example/file'], signal()), /Invalid.*selection/)
  const invalid = drive.put('Elsewhere/Bad.json', 'not JSON')
  await assert.rejects(access.pickedFiles([invalid.id], signal()))
  invalid.title = '../Bad.json'
  await assert.rejects(access.pickedFiles([invalid.id], signal()), /level JSON files|filename/)
  invalid.title = 'Bad.json'; invalid.fileSize = '1000001'
  await assert.rejects(access.pickedFiles([invalid.id], signal()), /1 MB/)
  assert.ok(drive.requests.every(request => request.url.origin === 'https://www.googleapis.com'))
})

test('Google rejects malformed responses and never follows a download or pagination URL with a token', async () => {
  const drive = googleDrive()
  drive.before = () => new Response('not JSON')
  await assert.rejects(connect(drive).list(signal()), /response could not be read/)
  let calls = 0
  drive.before = request => {
    assert.equal(request.url.origin, 'https://www.googleapis.com')
    if (++calls < 3) return Response.json({ items: [], nextPageToken: 'https://evil.example/token' })
    return Response.json({ items: [] })
  }
  await assert.rejects(connect(drive).list(signal()), /pagination|listing/)
  assert.ok(drive.requests.every(request => request.url.origin === 'https://www.googleapis.com'))
})
