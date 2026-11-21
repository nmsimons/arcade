import test from 'node:test'
import assert from 'node:assert/strict'
import { prepareLightingGeometry, PREVIEW_LIGHTING_WORKERS } from '../src/games/jumping/lightingPreparation.ts'
import { LEVEL_PREPARATION_TIMEOUT, LEVEL_WORKER_START_TIMEOUT } from '../src/games/jumping/levelPreparation.ts'
import { blankTrial } from '../src/games/jumping/level.ts'

function workers(t) {
  const original = globalThis.Worker, list = []
  globalThis.Worker = class { constructor() { list.push(this) } postMessage(value) { this.request = value } terminate() { this.terminated = true } }
  t.after(() => { globalThis.Worker = original })
  t.mock.timers.enable({ apis: ['setTimeout'] })
  return list
}

test('lighting worker loading is separate from its geometry deadline and snapshots the requested draft', async t => {
  const list = workers(t), level = blankTrial(), original = structuredClone(level)
  const pending = prepareLightingGeometry(level, new AbortController().signal), worker = list[0]
  t.mock.timers.tick(LEVEL_PREPARATION_TIMEOUT + 1000)
  assert.equal(worker.request, undefined); assert.equal(worker.terminated, undefined)
  level.name = 'A newer draft'
  worker.onmessage({ data: { ready: true } })
  assert.deepEqual(worker.request, original)
  t.mock.timers.tick(LEVEL_PREPARATION_TIMEOUT - 1)
  worker.onmessage({ data: { groups: [] } })
  assert.deepEqual(await pending, []); assert.equal(worker.terminated, true)
})

test('lighting startup and geometry overruns terminate the worker without posting late work', async t => {
  const list = workers(t)
  for (const ready of [false, true]) {
    const pending = prepareLightingGeometry(blankTrial(), new AbortController().signal), worker = list.at(-1)
    const rejected = assert.rejects(pending, ready ? /too long/ : /could not start/)
    if (ready) worker.onmessage({ data: { ready: true } })
    t.mock.timers.tick(ready ? LEVEL_PREPARATION_TIMEOUT : LEVEL_WORKER_START_TIMEOUT)
    await rejected
    const request = worker.request
    worker.onmessage({ data: { ready: true } })
    assert.equal(worker.terminated, true); assert.equal(worker.request, request)
  }
})

test('duplicate lighting readiness cannot reset the solve budget; abort cancels either phase', async t => {
  const list = workers(t)
  const pending = prepareLightingGeometry(blankTrial(), new AbortController().signal), worker = list[0]
  const rejected = assert.rejects(pending, /too long/)
  worker.onmessage({ data: { ready: true } }); t.mock.timers.tick(LEVEL_PREPARATION_TIMEOUT / 2)
  worker.onmessage({ data: { ready: true } }); t.mock.timers.tick(LEVEL_PREPARATION_TIMEOUT / 2)
  await rejected
  for (const ready of [false, true]) {
    const controller = new AbortController(), pending = prepareLightingGeometry(blankTrial(), controller.signal), worker = list.at(-1)
    const rejected = assert.rejects(pending, { name: 'AbortError' })
    if (ready) worker.onmessage({ data: { ready: true } })
    controller.abort(); await rejected
    assert.equal(worker.terminated, true)
  }
})

test('level previews share a few lighting workers; queued drafts keep their snapshot, cancel cleanly and fill freed slots', async t => {
  const list = workers(t), limit = PREVIEW_LIGHTING_WORKERS, flush = () => new Promise(resolve => setImmediate(resolve))
  const drafts = Array.from({ length: limit + 2 }, (_, i) => ({ ...blankTrial(), name: `Preview ${i}` }))
  const controllers = drafts.map(() => new AbortController())
  const pending = drafts.map((level, i) => prepareLightingGeometry(level, controllers[i].signal, { preview: true }))
  await flush()
  // A library full of cards must not start every solve at once.
  assert.equal(list.length, limit)
  drafts[limit].name = 'Edited while queued'
  const cancelled = assert.rejects(pending[limit + 1], { name: 'AbortError' })
  controllers[limit + 1].abort(); await cancelled
  // A failed solve frees its slot as surely as a finished one.
  const failed = assert.rejects(pending[0], /too long/)
  list[0].onmessage({ data: { ready: true } }); t.mock.timers.tick(LEVEL_PREPARATION_TIMEOUT); await failed
  await flush()
  assert.equal(list.length, limit + 1)
  list[limit].onmessage({ data: { ready: true } })
  assert.equal(list[limit].request.name, 'Preview ' + limit)
  for (const worker of list.slice(1)) { worker.onmessage({ data: { ready: true } }); worker.onmessage({ data: { groups: [] } }) }
  for (const result of pending.slice(1, limit + 1)) assert.deepEqual(await result, [])
  await flush()
  // The cancelled request never started a worker.
  assert.equal(list.length, limit + 1)
})
