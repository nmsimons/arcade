import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { decodeLevelFile, loadLocalLevelFiles, loadLevelCatalog } from '../src/games/jumping/levelAssets.ts'
import { MAX_COLLECTION_BYTES, MAX_LEVEL_BYTES, readLevelResponse, readInBatches } from '../src/games/jumping/levelLimits.ts'
import { prepareLevelInWorker, clonePreparedLevel, LEVEL_PREPARATION_TIMEOUT } from '../src/games/jumping/levelPreparation.ts'
import { blankTrial, levelProblems, prepareLevelRopes } from '../src/games/jumping/level.ts'
import { createRun, createPreviewRun } from '../src/games/jumping/challenge.ts'
import { ropeCanSleep } from '../src/games/jumping/ropeSleep.ts'
import { FIRST_LEVEL, CAMPAIGN } from './helpers/jumping-fixtures.mjs'

test('collection budgets reject before reading any file, including manifest bytes', async () => {
  let reads = 0
  const file = (name, size) => ({ name, size, text: async () => { reads++; return '{}' } })
  const levels = Array.from({ length: 25 }, (_, i) => file(`${i}.json`, MAX_LEVEL_BYTES))
  await assert.rejects(loadLocalLevelFiles([...levels, file('index.json', 1)]), /25 MB/)
  await assert.rejects(loadLocalLevelFiles(Array.from({ length: 501 }, (_, i) => file(`${i}.json`, 1))), /500/)
  assert.equal(reads, 0)
})

test('file limits count UTF-8 bytes rather than JavaScript characters', () => {
  const text = JSON.stringify({ ...FIRST_LEVEL, ignoredMetadata: 'é'.repeat(500_000) })
  assert.ok(text.length < MAX_LEVEL_BYTES)
  assert.throws(() => decodeLevelFile(text), /1 MB/)
})

test('bounded reads preserve ordering and isolate errors with at most four active reads', async () => {
  let active = 0, maximum = 0
  const result = await readInBatches(Array.from({ length: 13 }, (_, i) => i), async i => {
    maximum = Math.max(maximum, ++active)
    await new Promise(resolve => setImmediate(resolve))
    active--
    if (i === 3) throw new Error('Unreadable file')
    return i
  })
  assert.equal(maximum, 4)
  assert.equal(result[3].status, 'rejected')
  assert.deepEqual(result.filter(r => r.status === 'fulfilled').map(r => r.value), [0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12])
})

test('streamed file limits ignore missing or dishonest content length and cancel overflow', async () => {
  for (const headers of [{}, { 'content-length': '10' }, { 'content-length': `${MAX_LEVEL_BYTES + 1}` }]) {
    let cancelled = false
    const stream = new ReadableStream({ pull(c) { c.enqueue(new Uint8Array(100_000)) }, cancel() { cancelled = true } })
    await assert.rejects(readLevelResponse(new Response(stream, { headers }), () => {}), /1 MB/)
    assert.ok(cancelled)
  }
})

test('HTTP failures cancel their response body instead of downloading an error page', async () => {
  let cancelled = false
  await assert.rejects(loadLevelCatalog('/', async () => new Response(new ReadableStream({
    pull(c) { c.enqueue(new Uint8Array(100_000)) }, cancel() { cancelled = true },
  }), { status: 503 })), /HTTP 503/)
  assert.equal(cancelled, true)
})

test('remote collections enforce the cumulative budget without trusting response headers', async () => {
  const levels = Array.from({ length: 30 }, (_, i) => `${i}.json`)
  let active = 0, maximum = 0
  const catalog = await loadLevelCatalog('/', async url => {
    if (url.endsWith('/index.json')) return new Response(JSON.stringify({ version: 1, levels }))
    maximum = Math.max(maximum, ++active)
    await new Promise(resolve => setImmediate(resolve))
    active--
    const text = JSON.stringify({ ...FIRST_LEVEL, id: url })
    return new Response(text.padEnd(MAX_LEVEL_BYTES, ' '))
  })
  assert.ok(maximum <= 4)
  assert.equal(catalog.files.length, 24)
  assert.ok(catalog.files.reduce((sum, file) => sum + file.sourceText.length, 0) < MAX_COLLECTION_BYTES)
  assert.ok(catalog.errors.every(error => error.includes('25 MB')))
})

function mockWorker(t) {
  const original = globalThis.Worker, instances = []
  globalThis.Worker = class {
    constructor() { this.terminated = false; instances.push(this) }
    postMessage(message) { this.message = message }
    terminate() { this.terminated = true }
  }
  t.after(() => { globalThis.Worker = original })
  return instances
}

test('preparation deadlines terminate the worker instead of just ignoring its result', async t => {
  const workers = mockWorker(t)
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const pending = prepareLevelInWorker(FIRST_LEVEL, { play: true })
  const rejected = assert.rejects(pending, /too long/)
  assert.equal(workers[0].message.play, true)
  t.mock.timers.tick(LEVEL_PREPARATION_TIMEOUT)
  await rejected
  assert.equal(workers[0].terminated, true)
})

test('preparation cancellation terminates work, ignores late replies, and handles pre-aborted requests', async t => {
  const workers = mockWorker(t), controller = new AbortController()
  const pending = prepareLevelInWorker(FIRST_LEVEL, { signal: controller.signal })
  const rejected = assert.rejects(pending, { name: 'AbortError' })
  controller.abort()
  workers[0].onmessage({ data: { result: {} } })
  await rejected
  assert.equal(workers[0].terminated, true)
  await assert.rejects(prepareLevelInWorker(FIRST_LEVEL, { signal: controller.signal }), { name: 'AbortError' })
  assert.equal(workers.length, 1)
})

test('success, validation failures and worker failures all release the worker', async t => {
  const workers = mockWorker(t)
  for (const mode of ['success', 'validation', 'crash', 'decode']) {
    const pending = prepareLevelInWorker(FIRST_LEVEL), worker = workers.at(-1)
    const checked = mode === 'success' ? pending : assert.rejects(pending, /invalid|could not/)
    if (mode === 'success') worker.onmessage({ data: { result: { level: FIRST_LEVEL, run: null, player: null } } })
    if (mode === 'validation') worker.onmessage({ data: { error: 'invalid level' } })
    if (mode === 'crash') worker.onerror({ preventDefault() {} })
    if (mode === 'decode') worker.onmessageerror()
    await checked
    assert.equal(worker.terminated, true)
  }
})

test('worker transfers and restarts preserve settled rope geometry and player identity', () => {
  const level = prepareLevelRopes(CAMPAIGN[1]), run = createRun(level)
  const transferred = structuredClone({ level, run, player: run.player })
  const world = clonePreparedLevel(transferred)
  assert.equal(world.player, world.run.player)
  for (const rope of world.player.ropes) assert.equal(ropeCanSleep(rope, world.run.terrain, false), true)
  world.player.x += 10
  assert.notEqual(world.player.x, transferred.player.x)
  assert.deepEqual(clonePreparedLevel(transferred).player, transferred.player)
})

test('a pathological but valid rope uses a cheap sketch in previews', () => {
  const level = blankTrial()
  level.width = 4000; level.goal.x = 3800
  level.climbables.ropes = [{ x: 1200, y: 100, length: 2000, segments: 250 }]
  level.platforms = Array.from({ length: 12 }, (_, i) => ({ x: 900 + i % 2 * 40, y: 200 + i * 5, w: 600, h: 20 }))
  assert.deepEqual(levelProblems(level), [])
  const start = performance.now(), preview = createPreviewRun(prepareLevelRopes(level, true))
  assert.ok(performance.now() - start < 500, 'preview must not route or settle ropes')
  assert.ok(preview.player.ropes[0].definition.rest.key.startsWith('preview:'))
})

test('asset publishing rejects HTML, directories, symlinks and invalid JSON before publishing', async () => {
  const script = resolve('scripts/jumping-levels.mjs')
  for (const mode of ['html', 'directory', 'symlink', 'invalid-json']) {
    const root = await mkdtemp(join(tmpdir(), 'jumping-security-')), source = join(root, 'public/levels/jumping'), target = join(root, 'deployed')
    try {
      await mkdir(source, { recursive: true }); await mkdir(target)
      await writeFile(join(source, 'level.json'), JSON.stringify(FIRST_LEVEL))
      await writeFile(join(source, 'index.json'), JSON.stringify({ version: 1, levels: ['level.json'] }))
      await writeFile(join(target, 'sentinel.txt'), 'untouched')
      if (mode === 'html') await writeFile(join(source, 'payload.html'), '<script>alert(1)</script>')
      if (mode === 'directory') await mkdir(join(source, 'nested'))
      if (mode === 'symlink') await symlink(join(source, 'level.json'), join(source, 'linked.json'))
      if (mode === 'invalid-json') await writeFile(join(source, 'bad.json'), '{}')
      for (const command of ['index', 'check', 'sync']) {
        const args = [script, command, ...(command === 'sync' ? [target] : [])]
        assert.throws(() => execFileSync(process.execPath, args, { cwd: root, stdio: 'pipe' }), /Unexpected level asset|level|Level/)
        assert.equal(await readFile(join(target, 'sentinel.txt'), 'utf8'), 'untouched')
      }
      // Calling Vite directly must also fail before it copies public assets.
      if (mode === 'html') {
        await symlink(resolve('scripts'), join(root, 'scripts'))
        await writeFile(join(root, 'index.html'), '<p>test</p>')
        assert.throws(() => execFileSync(process.execPath, [resolve('node_modules/vite/bin/vite.js'), 'build', '--config', resolve('vite.config.ts')], { cwd: root, stdio: 'pipe' }), /Unexpected level asset/)
      }
    } finally { await rm(root, { recursive: true, force: true }) }
  }
})
