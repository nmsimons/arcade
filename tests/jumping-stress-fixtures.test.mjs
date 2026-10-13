import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stressLevel, stressRun, stressSnapshot } from './bench/labStressScene.mjs'
import { stepRun } from '../src/games/jumping/challenge.ts'
import { NEUTRAL_INPUT } from '../src/games/jumping/model.ts'
import { installRopeWasm, setRopeWasmEnabled, ropeWasmStatus } from '../src/games/jumping/ropeWasm.ts'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/jumping/lab-stress.json', import.meta.url)))
await installRopeWasm(readFileSync(new URL('../public/wasm/lab-rope.wasm', import.meta.url)))
test('every stress workload is a valid runtime JSON level within current authoring limits', () => {
  assert.equal(new Set(fixture.cases.map(c => c.id)).size, fixture.cases.length)
  for (const scenario of fixture.cases) {
    const level = stressLevel(fixture, scenario)
    assert.equal(level.climbables.ropes.length, scenario.ropes ?? 0)
    assert.equal(level.props.length, scenario.props ?? 0)
    assert.equal(level.lighting.lights.length, scenario.lights ?? 0)
    assert.equal(level.mechanisms.length, scenario.lifts ?? 0)
    assert.ok(level.climbables.ropes.length <= 40)
    assert.ok(level.props.length <= 80); assert.ok(level.lighting.lights.length <= 16)
  }
})
test('max ropes start awake and every loose object receives the declared initial impulse', () => {
  const scenario = fixture.cases.find(c => c.id === 'mixed-max'), run = stressRun(fixture, scenario)
  assert.equal(run.started, true); assert.equal(run.entrance, null)
  assert.equal(run.player.ropes.length, 40)
  assert.ok(run.player.ropes.every(r => r.nodes.some(n => n.x !== n.oldX || n.y !== n.oldY)))
  assert.ok(run.props.every(p => Math.abs(p.vx) === fixture.layout.prop.vx && p.vy === fixture.layout.prop.vy))
})
test('fresh stress runs produce identical physics under the fixed benchmark workload', () => {
  const scenario = fixture.cases.find(c => c.id === 'mixed-medium')
  const a = stressRun(fixture, scenario), b = stressRun(fixture, scenario)
  setRopeWasmEnabled(false)
  for (let tick = 0; tick < 12; tick++) { stepRun(a, NEUTRAL_INPUT); stepRun(b, NEUTRAL_INPUT) }
  assert.deepEqual(stressSnapshot(a), stressSnapshot(b))
  assert.equal(a.finished, false)
  assert.ok(a.props.some(p => Math.abs(p.vy) > 1))
  assert.ok(a.mechanisms.some(m => m.y !== m.definition.y))
})
test('mixed rope/prop contacts retain exact trajectories across nearest-face ties', () => {
  const scenario = fixture.cases.find(c => c.id === 'mixed-medium')
  const a = stressRun(fixture, scenario), b = stressRun(fixture, scenario), start = ropeWasmStatus().wasmSteps
  // The original libm norm first changed a contact at tick 16. Continue through
  // many later prop/rope contacts rather than checking only the first correction.
  for (let tick = 0; tick < 120; tick++) {
    setRopeWasmEnabled(false); stepRun(a, NEUTRAL_INPUT)
    setRopeWasmEnabled(true); stepRun(b, NEUTRAL_INPUT)
    assert.deepEqual(stressSnapshot(a), stressSnapshot(b), `mixed contact tick ${tick}`)
  }
  assert.ok(ropeWasmStatus().wasmSteps > start)
  setRopeWasmEnabled(false)
})
