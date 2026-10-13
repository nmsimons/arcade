import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm, link } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { devStressLevelsMiddleware, devStressLevelsPlugin } from '../scripts/dev-stress-levels.ts'
import { FIRST_LEVEL } from './helpers/jumping-fixtures.mjs'

test('stress middleware serves only manifest-listed read-only JSON assets under the configured base', async t => {
  const root = await mkdtemp(join(tmpdir(), 'arcade-stress-'))
  const directory = join(root, 'dev/levels/jumping')
  await mkdir(directory, { recursive: true })
  t.after(() => rm(root, { recursive: true, force: true }))
  const level = JSON.stringify(FIRST_LEVEL)
  const index = JSON.stringify({ version: 1, levels: ['Try Me.json'] })
  await writeFile(join(directory, 'index.json'), index)
  await writeFile(join(directory, 'Try Me.json'), level)
  await writeFile(join(directory, 'unlisted.json'), level)
  const middleware = devStressLevelsMiddleware(root, '/arcade/')
  const request = (name, method = 'GET') => new Promise(resolve => {
    const req = { method, url: `/arcade/__arcade/jumping-stress-levels/${name}` }
    const res = { writeHead(status, headers) { this.status = status; this.headers = headers }, end(text) { resolve({ status: this.status, text, headers: this.headers }) } }
    middleware(req, res, () => resolve({ status: 0 }))
  })
  assert.equal((await request('index.json')).text, index)
  assert.equal((await request('Try%20Me.json')).text, level)
  assert.equal((await request('Try%20Me.json', 'HEAD')).text, undefined)
  assert.equal((await request('Try%20Me.json', 'POST')).status, 405)
  for (const name of ['unlisted.json', '..%2findex.json', '%', 'Try%20Me.json/other']) assert.equal((await request(name)).status, 404)
  assert.equal((await request('index.json')).headers['Cache-Control'], 'no-store')
  const original = join(root, 'linked.json')
  await writeFile(original, level)
  await link(original, join(directory, 'linked.json'))
  await writeFile(join(directory, 'index.json'), JSON.stringify({ version: 1, levels: ['linked.json'] }))
  assert.equal((await request('linked.json')).status, 404)
})

test('production and preview never install the stress asset middleware', () => {
  const plugin = devStressLevelsPlugin()
  assert.equal(plugin.apply, 'serve')
  assert.equal(plugin.configurePreviewServer, undefined)
  const installed = []
  for (const isProduction of [true, false]) {
    plugin.configureServer({ config: { isProduction, root: process.cwd(), base: '/' }, middlewares: { use(value) { installed.push(value) } } })
    assert.equal(installed.length, isProduction ? 0 : 1)
  }
})
