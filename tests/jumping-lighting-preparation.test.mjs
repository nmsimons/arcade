import test from 'node:test'
import assert from 'node:assert/strict'
import { prepareLightingGeometry } from '../src/games/jumping/lightingPreparation.ts'
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
