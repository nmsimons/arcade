import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { gameStorage, selectProfile, scopedStorage, SAVE_SLOTS, LEVELS_SLOT } from '../src/accounts/profileStorage.ts'
import { emptyWorkspace, readWorkspace, parseWorkspace, replaceWorkspace, serializeWorkspace, digest } from '../src/accounts/data.ts'
import { createSync, cloudHeads } from '../src/accounts/sync.ts'
import { accountLevelRepository } from '../src/accounts/levelLibrary.ts'
import { boundedText, createCloudStore, oneDriveDownloadUrl } from '../src/accounts/cloudStore.ts'
import { createExpeditionSaveSession } from '../src/games/hardVacuum/expeditionSave.ts'
import { freshExpedition } from '../src/games/hardVacuum/expedition.ts'
import { oneDrive } from './helpers/oneDrive.mjs'
import { CLOUD_BASELINE_SLOT } from '../src/accounts/profileStorage.ts'
import { confirmedLevelHash, levelSaveState } from '../src/accounts/levelSaveState.ts'

function memory() {
  const data = new Map()
  return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) }
}
function cloudMemory() {
  const entries = [], files = new Map()
  return { entries, files,
    async list() { return [...entries] }, async read(entry) { return files.get(entry.fileId) },
    async create(meta, text, signal) { signal?.throwIfAborted(); const entry = { ...meta, fileId: crypto.randomUUID() }; entries.push(entry); files.set(entry.fileId, text); return entry },
  }
}

test('long histories and shared ancestry are checked without exhausting the call stack', () => {
  const entries = Array.from({ length: 20000 }, (_, n) => ({ id: String(n), parents: n ? [String(n - 1)] : [], at: '2026-01-01' }))
  entries.push({ id: 'merge', parents: ['19999', '19998'], at: '2026-01-01' })
  assert.deepEqual(cloudHeads(entries.toReversed()).map(entry => entry.id), ['merge'])
  entries[0].parents = ['merge']
  assert.throws(() => cloudHeads(entries), /cycle/)
})
const signal = () => new AbortController().signal
const put = (store, amount) => store.setItem(SAVE_SLOTS[0], JSON.stringify({ ...freshExpedition(), banked: amount }))
const amount = store => JSON.parse(store.getItem(SAVE_SLOTS[0])).banked
const fixture = () => JSON.parse(readFileSync(new URL('./fixtures/jumping/00-json-test-lab.json', import.meta.url), 'utf8'))

test('file confirmation records only bytes actually published, including edits during upload', async () => {
  const local = memory(), cloud = cloudMemory(), repo = accountLevelRepository(local)
  const first = await repo.save('First.json', fixture())
  const second = await repo.save('Second.json', { ...fixture(), id: 'second' })
  let fail = true
  cloud.publish = async () => { if (fail) throw new Error('Upload failed') }
  const sync = createSync(local, cloud)
  await assert.rejects(sync.sync(signal()), /Upload failed/)
  assert.equal(confirmedLevelHash(local.getItem(CLOUD_BASELINE_SLOT), 'First.json'), undefined)
  fail = false
  cloud.publish = async () => { await repo.save('Second.json', { ...fixture(), id: 'second', name: 'Edited during upload' }, second.text) }
  await sync.sync(signal())
  const receipt = local.getItem(CLOUD_BASELINE_SLOT)
  assert.equal(confirmedLevelHash(receipt, 'First.json'), await digest(first.text))
  assert.equal(confirmedLevelHash(receipt, 'Second.json'), await digest(second.text))
  assert.notEqual(confirmedLevelHash(receipt, 'Second.json'), await digest(readWorkspace(local).levels.files['Second.json']))
  assert.equal(confirmedLevelHash('{broken', 'First.json'), undefined)
})

test('file status distinguishes unsaved, local, pending, syncing, confirmed and blocked files', () => {
  const base = { connected: true, confirmed: true, activity: 'idle' }
  assert.equal(levelSaveState(base), 'synced')
  assert.equal(levelSaveState({ ...base, dirty: true }), 'unsaved')
  assert.equal(levelSaveState({ ...base, dirty: true, saving: true }), 'saving')
  assert.equal(levelSaveState({ ...base, connected: false }), 'local')
  assert.equal(levelSaveState({ ...base, confirmed: false }), 'pending')
  assert.equal(levelSaveState({ ...base, confirmed: false, activity: 'uploading' }), 'syncing')
  assert.equal(levelSaveState({ ...base, activity: 'uploading' }), 'synced')
  assert.equal(levelSaveState({ ...base, activity: 'attention' }), 'attention')
})

test('anonymous and provider identities are isolated, and a running save session retains its owner', () => {
  const raw = memory(), anonymous = scopedStorage(raw, ''), alice = scopedStorage(raw, 'google:alice'), bob = scopedStorage(raw, 'microsoft:alice')
  put(anonymous, 5); put(alice, 10); put(bob, 15)
  assert.deepEqual([amount(anonymous), amount(alice), amount(bob)], [5, 10, 15])
  const oldWindow = globalThis.window
  globalThis.window = { localStorage: raw }
  try {
    selectProfile('google:alice'); const session = createExpeditionSaveSession(); session.activate()
    selectProfile('microsoft:alice'); assert.equal(session.save({ ...freshExpedition(), banked: 20 }).status, 'saved')
    assert.equal(amount(alice), 20); assert.equal(amount(bob), 15); assert.equal(amount(gameStorage()), 15)
  } finally { selectProfile(''); globalThis.window = oldWindow }
})

test('first sync creates a version, second device downloads it, unchanged sync writes nothing', async () => {
  const a = memory(), b = memory(), cloud = cloudMemory(); put(a, 100)
  assert.equal((await createSync(a, cloud).sync(signal())).status, 'synced')
  await createSync(b, cloud).sync(signal()); assert.equal(amount(b), 100)
  await createSync(a, cloud).sync(signal()); assert.equal(cloud.entries.length, 1)
  put(b, 200); await createSync(b, cloud).sync(signal()); await createSync(a, cloud).sync(signal())
  assert.equal(amount(a), 200); assert.equal(cloud.entries.length, 2)
})

test('background sync uploads local saves but defers incoming changes during active play', async () => {
  const a = memory(), b = memory(), cloud = cloudMemory()
  put(a, 1); await createSync(a, cloud).sync(signal())
  let safe = false
  const sync = createSync(b, cloud, () => {}, () => safe)
  assert.equal((await sync.sync(signal())).status, 'deferred')
  assert.equal(b.getItem(SAVE_SLOTS[0]), null)
  safe = true; await sync.sync(signal()); assert.equal(amount(b), 1)
  safe = false; put(b, 2)
  assert.equal((await sync.sync(signal())).status, 'synced')
  await createSync(a, cloud).sync(signal()); assert.equal(amount(a), 2)
  put(a, 3); await createSync(a, cloud).sync(signal())
  const read = cloud.read
  safe = true; cloud.read = async entry => { safe = false; return read(entry) }
  assert.equal((await sync.sync(signal())).status, 'deferred')
  assert.equal(amount(b), 2)
})

test('diverging devices preserve both saves and explicitly resolve to local', async () => {
  const a = memory(), b = memory(), cloud = cloudMemory(); put(a, 1)
  const syncA = createSync(a, cloud), syncB = createSync(b, cloud)
  await syncA.sync(signal()); await syncB.sync(signal())
  put(a, 2); put(b, 3); await syncA.sync(signal())
  assert.equal((await syncB.sync(signal())).status, 'conflict'); assert.equal(amount(b), 3)
  const result = await syncB.resolve('local', signal())
  assert.equal(result.heads.length, 1); assert.equal(cloud.entries.length, 3)
  await syncA.sync(signal()); assert.equal(amount(a), 3)
  assert.equal(JSON.parse(JSON.parse(cloud.files.get(cloud.entries[1].fileId)).slots[SAVE_SLOTS[0]]).banked, 2)
})

test('choosing remote first backs up unsynced local progress and leaves a local recovery copy', async () => {
  const a = memory(), b = memory(), cloud = cloudMemory(); put(a, 1)
  const syncA = createSync(a, cloud), syncB = createSync(b, cloud)
  await syncA.sync(signal()); await syncB.sync(signal()); put(a, 2); put(b, 3)
  const remote = (await syncA.sync(signal())).heads[0]
  await syncB.resolve(remote, signal())
  assert.equal(amount(b), 2); assert.equal(cloud.entries.length, 4)
  const values = [...cloud.files.values()].map(text => JSON.parse(JSON.parse(text).slots[SAVE_SLOTS[0]]).banked)
  assert.ok(values.includes(3)); assert.equal(cloudHeads(cloud.entries).length, 1)
  assert.equal(JSON.parse(JSON.parse(b.getItem('arcade.cloud.recovery.v1')).slots[SAVE_SLOTS[0]]).banked, 3)
})

test('concurrent first writes become two heads, never last-writer-wins', async () => {
  const a = memory(), b = memory(), cloud = cloudMemory(); put(a, 1); put(b, 2)
  const list = cloud.list, reads = []
  cloud.list = () => new Promise(resolve => { reads.push(resolve); if (reads.length === 2) reads.forEach(resolve => resolve([])) })
  await Promise.all([createSync(a, cloud).sync(signal()), createSync(b, cloud).sync(signal())])
  cloud.list = list
  assert.equal(cloudHeads(cloud.entries).length, 2)
  assert.equal((await createSync(a, cloud).sync(signal())).status, 'conflict')
})

test('removed remote history requires an explicit choice to recreate it', async () => {
  const a = memory(), cloud = cloudMemory(); put(a, 1); const sync = createSync(a, cloud)
  await sync.sync(signal()); cloud.entries.length = 0
  assert.equal((await sync.sync(signal())).status, 'conflict'); assert.equal(cloud.entries.length, 0)
})

test('cancelled downloads cannot apply after leaving an account/menu', async () => {
  const a = memory(), b = memory(), cloud = cloudMemory(); put(a, 5); await createSync(a, cloud).sync(signal())
  const controller = new AbortController(), read = cloud.read
  cloud.read = async entry => { controller.abort(); return read(entry) }
  await assert.rejects(createSync(b, cloud).sync(controller.signal), { name: 'AbortError' })
  assert.equal(b.getItem(SAVE_SLOTS[0]), null)
})

test('concurrent local changes during a cloud download cannot be overwritten', async () => {
  const a = memory(), b = memory(), cloud = cloudMemory(); put(a, 5); await createSync(a, cloud).sync(signal())
  const read = cloud.read; cloud.read = async entry => { put(b, 7); return read(entry) }
  await assert.rejects(createSync(b, cloud).sync(signal()), /changed in another tab/)
  assert.equal(amount(b), 7)
})

test('malformed, oversized and tampered cloud data never replaces local progress', async () => {
  const cloud = cloudMemory(), a = memory(), b = memory(); put(a, 5); await createSync(a, cloud).sync(signal())
  cloud.files.set(cloud.entries[0].fileId, '{}')
  await assert.rejects(createSync(b, cloud).sync(signal()), /integrity/); assert.equal(b.data.size, 0)
  assert.throws(() => parseWorkspace(' '.repeat(4_000_001)), /4 MB/)
  assert.throws(() => parseWorkspace(JSON.stringify({ ...emptyWorkspace(), version: 99 })), /Unsupported/)
  assert.throws(() => parseWorkspace(JSON.stringify({ ...emptyWorkspace(), slots: { access_token: 'secret' } })), /Invalid/)
  assert.throws(() => parseWorkspace(JSON.stringify({ ...emptyWorkspace(), slots: { 'arcade.jumping.times.v1': '{"x":-5}' } })), /Invalid/)
  assert.throws(() => parseWorkspace(JSON.stringify({ ...emptyWorkspace(), levels: { files: { '../escape.json': '{}' }, deleted: [] } })), /filename/)
})

test('cyclic cloud history is rejected instead of treated as empty', () => {
  assert.throws(() => cloudHeads([{ id: 'a', parents: ['b'] }, { id: 'b', parents: ['a'] }]), /cycle/)
})

test('failed local restore retains recovery and rolls back previous slots', async () => {
  const store = memory(); put(store, 7); const before = serializeWorkspace(readWorkspace(store)), next = { ...emptyWorkspace(), slots: { [SAVE_SLOTS[0]]: JSON.stringify({ ...freshExpedition(), banked: 9 }) } }
  const set = store.setItem; let failed = false
  store.setItem = (key, value) => { if (key === LEVELS_SLOT && !failed) { failed = true; throw new Error('quota') }; set(key, value) }
  await assert.rejects(replaceWorkspace(store, next, before), /recovery copy/)
  assert.equal(amount(store), 7); assert.equal(store.getItem('arcade.cloud.recovery.v1'), before)
})

test('account library preserves rename, conflicts, ordering, recycle and restore semantics', async () => {
  const store = memory(), repo = accountLevelRepository(store), level = fixture()
  const first = await repo.save('first.json', level)
  await assert.rejects(repo.save('first.json', level), /already exists.*different File name/)
  await assert.rejects(repo.save('first.json', level, 'stale'), /changed/)
  const renamed = await repo.save('renamed.json', { ...level, name: 'Renamed' }, first.text, 'first.json')
  assert.deepEqual((await repo.read()).files.map(f => f.fileName), ['renamed.json'])
  await assert.rejects(repo.reorder([{ fileName: 'renamed.json' }], 'stale'), /changed/)
  await repo.remove((await repo.read()).files[0], renamed.manifestSource)
  const bin = (await repo.deleted()).deleted; assert.equal(bin.length, 1)
  await repo.restore(bin[0], 'restored.json', (await repo.read()).manifestSource)
  assert.equal((await repo.deleted()).deleted.length, 0); assert.equal((await repo.read()).files[0].level.name, 'Renamed')
  const roundtrip = parseWorkspace(serializeWorkspace(readWorkspace(store)))
  assert.ok(roundtrip.levels.files['restored.json'])
})

test('library mutations serialize with whole-workspace imports and retain independent files', async () => {
  const local = memory(), a = accountLevelRepository(local), b = accountLevelRepository(local)
  await Promise.all([a.save('A.json', { ...fixture(), id: 'a' }), b.save('B.json', { ...fixture(), id: 'b' })])
  assert.deepEqual((await a.read()).files.map(file => file.fileName), ['A.json', 'B.json'])
  const before = serializeWorkspace(readWorkspace(local))
  const saved = a.save('C.json', { ...fixture(), id: 'c' })
  const imported = replaceWorkspace(local, emptyWorkspace(), before)
  await saved
  await assert.rejects(imported, /changed in another tab/)
  assert.deepEqual((await a.read()).files.map(file => file.fileName), ['A.json', 'B.json', 'C.json'])
})

test('autosaves made while listing cloud history are included without starving uploads', async () => {
  const local = memory(), cloud = cloudMemory(), sync = createSync(local, cloud)
  put(local, 1); await sync.sync(signal())
  const list = cloud.list
  cloud.list = async () => { const entries = await list(); put(local, 2); return entries }
  const result = await sync.sync(signal())
  assert.equal(result.status, 'synced')
  assert.equal(result.hash, await digest(serializeWorkspace(readWorkspace(local))))
  assert.equal(JSON.parse(JSON.parse(await cloud.read(result.heads[0])).slots[SAVE_SLOTS[0]]).banked, 2)
})

test('account library rejects duplicate IDs, unsafe filenames and stale deletion', async () => {
  const store = memory(), repo = accountLevelRepository(store), level = fixture()
  await repo.save('first.json', level)
  await assert.rejects(repo.save('duplicate.json', level), /unique IDs/)
  await assert.rejects(repo.save('../bad.json', level), /filename/)
  const file = (await repo.read()).files[0]
  await assert.rejects(repo.remove({ ...file, sourceText: 'stale' }, (await repo.read()).manifestSource), /changed/)
  assert.equal((await repo.read()).files.length, 1)
})

test('streaming enforces actual byte limits even without Content-Length', async () => {
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(10)); controller.enqueue(new Uint8Array(10)); controller.close() } })
  await assert.rejects(boundedText(new Response(stream), 12), /size limit/)
})

test('Google quota and rate errors do not incorrectly request broader permissions', async () => {
  await assert.rejects(boundedText(Response.json({ error: { errors: [{ reason: 'storageQuotaExceeded' }] } }, { status: 403 })), /drive is full/)
  await assert.rejects(boundedText(Response.json({ error: { errors: [{ reason: 'userRateLimitExceeded' }] } }, { status: 403 })), /provider is busy/)
  await assert.rejects(boundedText(Response.json({ error: { errors: [{ reason: 'accessNotConfigured' }] } }, { status: 403 })), /Google Drive API is not enabled/)
  await assert.rejects(boundedText(Response.json({ error: { message: 'secret provider detail' } }, { status: 401 })), /Reconnect/)
})

test('hostile pagination cannot receive a bearer token', async () => {
  const drive = oneDrive(); drive.put('Hard Vacuum/expedition.json', '{}')
  drive.before = request => request.method === 'GET' && request.url.pathname.endsWith('/children') ? Response.json({ value: [], '@odata.nextLink': 'https://evil.example/steal' }) : undefined
  const store = createCloudStore('microsoft', async () => 'secret', drive.fetch)
  await assert.rejects(store.list(signal()), /endpoint/)
  assert.ok(drive.requests.every(call => call.url.origin === 'https://graph.microsoft.com'))
})

test('OneDrive downloads allow only known HTTPS hosts and never forward Authorization', async () => {
  for (const url of ['http://files.1drv.com/a', 'https://evil1drv.com/a', 'https://files.1drv.com.evil.test/a', 'https://user:secret@files.1drv.com/a']) assert.throws(() => oneDriveDownloadUrl(url))
  const drive = oneDrive(); drive.put('Hard Vacuum/expedition.json', '{}')
  const store = createCloudStore('microsoft', async () => 'secret', drive.fetch)
  await store.list(signal())
  assert.ok(drive.requests.filter(call => call.url.host === 'files.1drv.com').every(call => !call.headers.has('authorization')))
  assert.ok(drive.requests.filter(call => call.url.host === 'graph.microsoft.com').every(call => call.headers.get('authorization') === 'Bearer secret'))
})

test('personal-content downloads preserve signed URLs and omit credentials', async () => {
  const origin = 'https://my.microsoftpersonalcontent.com'
  const signed = `${origin}/personal/test/_layouts/15/download.aspx?UniqueId=file&tempauth=test%2Bonly%3D`
  assert.equal(oneDriveDownloadUrl(signed), signed)
  const drive = oneDrive({ downloadOrigin: origin }); drive.put('Hard Vacuum/expedition.json', '{}')
  const downloads = []
  const cloud = createCloudStore('microsoft', async () => 'graph-only-token', async (url, init) => {
    if (new URL(url).origin === origin) downloads.push(init)
    return drive.fetch(url, init)
  })
  await cloud.list(signal())
  assert.ok(downloads.length > 0)
  for (const request of downloads) {
    assert.equal(new Headers(request.headers).has('authorization'), false)
    assert.equal(request.credentials, 'omit')
    assert.equal(request.redirect, 'error')
    assert.equal(request.referrerPolicy, 'no-referrer')
  }
  for (const invalid of [
    'http://my.microsoftpersonalcontent.com/file',
    'https://my.microsoftpersonalcontent.com:444/file',
    'https://user:secret@my.microsoftpersonalcontent.com/file',
    'https://my.microsoftpersonalcontent.com.evil.test/file',
    'https://evilmy.microsoftpersonalcontent.com/file',
    'https://my-microsoftpersonalcontent.com/file',
    'https://127.0.0.1/file',
  ]) assert.throws(() => oneDriveDownloadUrl(invalid))
  assert.throws(() => oneDriveDownloadUrl('https://unknown.example/private-file?tempauth=secret'), error => {
    assert.match(error.message, /unknown\.example/)
    assert.doesNotMatch(error.message, /private-file|tempauth|secret/)
    return true
  })
})

test('OneDrive reports the actual app folder and checks independent folders concurrently', async () => {
  const drive = oneDrive(), locations = []
  drive.items.get('root').name = 'Original registration name'
  let active = 0, peak = 0
  drive.before = async request => {
    if (request.method !== 'GET' || !/\/items\/root:\//.test(request.url.pathname) || request.url.pathname.includes('Sync%20history')) return
    active++; peak = Math.max(peak, active)
    await new Promise(resolve => setTimeout(resolve, 10))
    active--
  }
  const cloud = createCloudStore('microsoft', async () => 'secret', drive.fetch, folder => locations.push(folder))
  await cloud.list(signal())
  assert.deepEqual(locations, [{ name: 'Original registration name', webUrl: 'https://onedrive.live.com/?id=test-app-folder' }])
  assert.ok(peak >= 2 && peak <= 4, `Expected bounded parallel folder checks, got ${peak}`)
  for (const webUrl of ['javascript:alert(1)', 'http://example.test/folder', 'https://user:secret@example.test/folder']) {
    drive.items.get('root').webUrl = webUrl
    const received = []
    await createCloudStore('microsoft', async () => 'secret', drive.fetch, folder => received.push(folder)).list(signal())
    assert.deepEqual(received, [{ name: 'Original registration name', webUrl: undefined }])
  }
})

test('production hosts apply restrictive scripts, frame protection, and matching config copies', () => {
  const config = readFileSync(new URL('../public/staticwebapp.config.json', import.meta.url), 'utf8')
  assert.equal(config, readFileSync(new URL('../staticwebapp.config.json', import.meta.url), 'utf8'))
  const headers = JSON.parse(config).globalHeaders, policy = headers['Content-Security-Policy']
  const connections = policy.split(';').find(part => part.trim().startsWith('connect-src'))
  assert.ok(connections.split(/\s+/).includes('https://my.microsoftpersonalcontent.com'))
  assert.ok(!connections.split(/\s+/).includes('https:'))
  assert.match(policy, /frame-ancestors 'none'/); assert.match(policy, /object-src 'none'/)
  assert.doesNotMatch(policy.split(';').find(part => part.trim().startsWith('script-src')), /unsafe-inline|unsafe-eval|\*/)
  assert.equal(headers['X-Content-Type-Options'], 'nosniff'); assert.equal(headers['Cross-Origin-Opener-Policy'], undefined)
})
