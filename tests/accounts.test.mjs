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
const signal = () => new AbortController().signal
const put = (store, amount) => store.setItem(SAVE_SLOTS[0], JSON.stringify({ ...freshExpedition(), banked: amount }))
const amount = store => JSON.parse(store.getItem(SAVE_SLOTS[0])).banked
const fixture = () => JSON.parse(readFileSync(new URL('./fixtures/jumping/00-json-test-lab.json', import.meta.url), 'utf8'))

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

test('failed local restore retains recovery and rolls back previous slots', () => {
  const store = memory(); put(store, 7); const before = serializeWorkspace(readWorkspace(store)), next = { ...emptyWorkspace(), slots: { [SAVE_SLOTS[0]]: JSON.stringify({ ...freshExpedition(), banked: 9 }) } }
  const set = store.setItem; let failed = false
  store.setItem = (key, value) => { if (key === LEVELS_SLOT && !failed) { failed = true; throw new Error('quota') }; set(key, value) }
  assert.throws(() => replaceWorkspace(store, next, before), /recovery copy/)
  assert.equal(amount(store), 7); assert.equal(store.getItem('arcade.cloud.recovery.v1'), before)
})

test('account library preserves rename, conflicts, ordering, recycle and restore semantics', async () => {
  const store = memory(), repo = accountLevelRepository(store), level = fixture()
  const first = await repo.save('first.json', level)
  await assert.rejects(repo.save('first.json', level), /changed/)
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
  await assert.rejects(boundedText(Response.json({ error: { message: 'secret provider detail' } }, { status: 401 })), /Reconnect/)
})

test('hostile pagination cannot receive a bearer token', async () => {
  const calls = []
  const fetcher = async (url, init) => { calls.push({ url, init }); return Response.json(url.includes('approot') ? { id: 'root' } : { value: [], '@odata.nextLink': 'https://evil.example/steal' }) }
  const store = createCloudStore('microsoft', async () => 'secret', fetcher)
  await assert.rejects(store.list(signal()), /endpoint/)
  assert.equal(calls.length, 2); assert.ok(calls.every(call => new URL(call.url).origin === 'https://graph.microsoft.com'))
})

test('OneDrive downloads allow only known HTTPS hosts and never forward Authorization', async () => {
  for (const url of ['http://files.1drv.com/a', 'https://evil1drv.com/a', 'https://files.1drv.com.evil.test/a', 'https://user:secret@files.1drv.com/a']) assert.throws(() => oneDriveDownloadUrl(url))
  const calls = []
  const fetcher = async (url, init) => { calls.push({ url, init }); return url.startsWith('https://graph.') ? Response.json({ '@microsoft.graph.downloadUrl': 'https://files.1drv.com/private' }) : new Response('{}') }
  const store = createCloudStore('microsoft', async () => 'secret', fetcher)
  await store.read({ fileId: 'test' }, signal())
  assert.equal(calls[0].init.headers.Authorization, 'Bearer secret'); assert.equal(calls[1].init.headers, undefined); assert.equal(calls[1].init.credentials, 'omit')
})

test('Google uploads only to appDataFolder and do not mutate existing save IDs', async () => {
  const calls = [], store = createCloudStore('google', async () => 'token', async (url, init) => { calls.push({ url, init }); return Response.json({ id: 'created' }) })
  const text = serializeWorkspace(emptyWorkspace())
  await store.create({ id: crypto.randomUUID(), hash: await digest(text), parents: [], at: new Date().toISOString() }, text, signal())
  assert.equal(calls.length, 1); assert.match(calls[0].init.body, /"parents":\["appDataFolder"\]/)
  assert.equal(calls[0].init.method, 'POST'); assert.equal(calls[0].init.redirect, 'error')
})

test('production hosts apply restrictive scripts, frame protection, and matching config copies', () => {
  const config = readFileSync(new URL('../public/staticwebapp.config.json', import.meta.url), 'utf8')
  assert.equal(config, readFileSync(new URL('../staticwebapp.config.json', import.meta.url), 'utf8'))
  const headers = JSON.parse(config).globalHeaders, policy = headers['Content-Security-Policy']
  assert.match(policy, /frame-ancestors 'none'/); assert.match(policy, /object-src 'none'/)
  assert.doesNotMatch(policy.split(';').find(part => part.trim().startsWith('script-src')), /unsafe-inline|unsafe-eval|\*/)
  assert.equal(headers['X-Content-Type-Options'], 'nosniff'); assert.equal(headers['Cross-Origin-Opener-Policy'], undefined)
})
