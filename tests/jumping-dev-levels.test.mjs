import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { devLevelsMiddleware, devLevelsPlugin } from '../scripts/dev-levels.ts'
import { FIRST_LEVEL } from './helpers/jumping-fixtures.mjs'

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'arcade-dev-levels-')), assets = join(root, 'public/levels/jumping')
  await mkdir(assets, { recursive: true })
  await writeFile(join(assets, 'first.json'), JSON.stringify(FIRST_LEVEL))
  await writeFile(join(assets, 'index.json'), JSON.stringify({ version: 1, levels: ['first.json'] }))
  t.after(() => rm(root, { recursive: true, force: true }))
  const middleware = devLevelsMiddleware(root)
  function request(method = 'GET', payload, headers = {}, address = '127.0.0.1') {
    return new Promise(resolve => {
      const req = Readable.from(payload === undefined ? [] : [Buffer.from(JSON.stringify(payload))])
      Object.assign(req, { method, url: '/__arcade/jumping-levels', headers: { host: 'localhost:5173', ...headers }, socket: { remoteAddress: address } })
      const responseHeaders = {}
      const res = { status: 0, setHeader(k, v) { responseHeaders[k] = v }, writeHead(status, headers) { this.status = status; Object.assign(responseHeaders, headers) },
        end(text) { resolve({ status: this.status, data: JSON.parse(text), headers: responseHeaders }) } }
      middleware(req, res, () => resolve({ status: 404 }))
    })
  }
  const token = (await request()).data.token
  const call = (method, ...args) => request('POST', { method, args }, { 'content-type': 'application/json', 'x-arcade-level-token': token, origin: 'http://localhost:5173', 'sec-fetch-site': 'same-origin' })
  return { root, assets, request, call }
}

test('development edits, renames, order and recovery update real Git-tracked assets', async t => {
  const f = await fixture(t)
  execFileSync('git', ['init', '-q', f.root])
  execFileSync('git', ['-C', f.root, 'add', 'public'])
  const original = (await f.call('read')).data
  const saved = await f.call('save', 'first.json', { ...FIRST_LEVEL, name: 'Edited built-in' }, original.files[0].sourceText, 'first.json')
  assert.equal(saved.status, 200)
  assert.equal(JSON.parse(await readFile(join(f.assets, 'first.json'), 'utf8')).name, 'Edited built-in')
  assert.match(execFileSync('git', ['-C', f.root, 'diff', '--name-only'], { encoding: 'utf8' }), /public\/levels\/jumping\/first.json/)
  const renamed = await f.call('save', 'renamed.json', { ...FIRST_LEVEL, name: 'Edited built-in' }, saved.data.text, 'first.json')
  assert.equal(renamed.status, 200)
  assert.deepEqual((await readdir(f.assets)).sort(), ['index.json', 'renamed.json'])
  assert.deepEqual(JSON.parse(await readFile(join(f.assets, 'index.json'), 'utf8')).levels, ['renamed.json'])
  const created = await f.call('save', 'new.json', { ...FIRST_LEVEL, id: 'new', name: 'New built-in' })
  assert.equal(created.status, 200)
  const ordered = await f.call('reorder', [{ fileName: 'new.json' }, { fileName: 'renamed.json' }], created.data.manifestSource, 'listed')
  assert.equal(ordered.status, 200)
  assert.deepEqual((await f.call('read')).data.files.map(file => file.fileName), ['new.json', 'renamed.json'])
  const removed = await f.call('remove', { fileName: 'renamed.json', sourceText: renamed.data.text }, ordered.data.manifestSource)
  assert.equal(removed.status, 200)
  assert.deepEqual((await readdir(f.assets)).sort(), ['index.json', 'new.json'])
  const entry = (await f.call('deleted')).data.deleted[0]
  assert.equal(entry.level.id, FIRST_LEVEL.id)
  assert.ok((await readdir(join(f.root, '.local/jumping-recycle-bin'))).length)
  const restored = await f.call('restore', entry, 'restored.json', removed.data.manifestSource)
  assert.equal(restored.status, 200)
  assert.equal((await f.call('deleted')).data.deleted.length, 0)
  assert.equal(JSON.parse(await readFile(join(f.assets, 'restored.json'), 'utf8')).name, 'Edited built-in')
})

test('dev file operations preserve external edits and reject traversal and symlinks', async t => {
  const f = await fixture(t), before = (await f.call('read')).data.files[0].sourceText
  await writeFile(join(f.assets, 'first.json'), JSON.stringify({ ...FIRST_LEVEL, name: 'External change' }))
  assert.equal((await f.call('save', 'first.json', FIRST_LEVEL, before)).status, 400)
  for (const name of ['../outside.json', '/outside.json', 'x\\outside.json', 'index.json']) assert.equal((await f.call('save', name, FIRST_LEVEL)).status, 400)
  const outside = join(f.root, 'outside.json')
  await writeFile(outside, 'private')
  await symlink(outside, join(f.assets, 'linked.json'))
  assert.equal((await f.call('read')).status, 400)
  assert.equal((await f.call('save', 'linked.json', FIRST_LEVEL, 'private')).status, 400)
  assert.equal(await readFile(outside, 'utf8'), 'private')
  assert.equal(JSON.parse(await readFile(join(f.assets, 'first.json'), 'utf8')).name, 'External change')
})

test('dev API requires a loopback connection, matching origin, JSON and a per-server token', async t => {
  const f = await fixture(t), payload = { method: 'read', args: [] }
  for (const headers of [{ host: 'evil.example:5173' }, { origin: 'https://evil.example' }, { origin: 'http://localhost:4000' }, { origin: 'https://localhost:5173' }, { 'sec-fetch-site': 'cross-site' }]) {
    assert.equal((await f.request('GET', undefined, headers)).status, 403)
  }
  assert.equal((await f.request('GET', undefined, {}, '192.168.1.2')).status, 403)
  assert.equal((await f.request('POST', payload)).status, 403)
  assert.equal((await f.request('POST', payload, { 'content-type': 'application/json', 'x-arcade-level-token': 'wrong' })).status, 403)
  assert.equal((await f.request('OPTIONS')).status, 405)
  assert.equal((await f.call('unknown')).status, 400)
  assert.equal(devLevelsPlugin().apply, 'serve')
  assert.equal(devLevelsPlugin().configurePreviewServer, undefined)
  let mounted = false
  devLevelsPlugin().configureServer({ config: { isProduction: true }, middlewares: { use() { mounted = true } } })
  assert.equal(mounted, false)
})

test('recycle-bin deletion and missing-file cleanup retain local-library semantics', async t => {
  const f = await fixture(t), initial = (await f.call('read')).data
  const removed = await f.call('remove', initial.files[0], initial.manifestSource)
  assert.equal(removed.status, 200)
  const bin = (await f.call('deleted')).data
  assert.equal((await f.call('empty', bin.deleted)).status, 200)
  assert.deepEqual((await f.call('deleted')).data.deleted, [])
  await writeFile(join(f.assets, 'index.json'), JSON.stringify({ version: 1, levels: ['missing.json'] }))
  const missing = (await f.call('read')).data
  assert.equal(missing.missing.length, 1)
  assert.equal((await f.call('remove', missing.missing[0], missing.manifestSource)).status, 200)
  assert.deepEqual((await f.call('read')).data.missing, [])
})
