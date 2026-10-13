import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import Matter from 'matter-js'
import { ActivePropContacts, copyBounds } from '../src/games/jumping/activePropContacts.ts'
import { setLabSolverEnabled, labSolverStatus } from '../src/games/jumping/labSolver.ts'
import { installRopeWasm, setRopeWasmEnabled, ropeWasmStatus } from '../src/games/jumping/ropeWasm.ts'
import { createRope, stepRope, ropeImpulse } from '../src/games/jumping/climbables.ts'
import { prepareRope } from '../src/games/jumping/ropeLayout.ts'
import { lineBlocked } from '../src/games/jumping/geometry.ts'
import { STEP, NEUTRAL_INPUT } from '../src/games/jumping/model.ts'
import { stressRun, stressSnapshot } from './bench/labStressScene.mjs'
import { stepRun } from '../src/games/jumping/challenge.ts'

await installRopeWasm(readFileSync(new URL('../public/wasm/lab-rope.wasm', import.meta.url)))
test.afterEach(() => { setLabSolverEnabled(false); setRopeWasmEnabled(false) })

test('a collider moving into or out of a quiet query reactivates both sides', () => {
  const a = Matter.Bodies.rectangle(0, 0, 32, 32), b = Matter.Bodies.rectangle(100, 0, 32, 32)
  const active = new ActivePropContacts([a, b])
  setLabSolverEnabled(true)
  assert.deepEqual(active.collides(a, [b]), [])
  assert.deepEqual(active.collides(a, [b]), [])
  assert.equal(labSolverStatus().propSkipped, 1)
  const before = copyBounds(b)
  Matter.Body.translate(b, { x: -80, y: 0 }); active.changed(b, before)
  assert.equal(active.collides(a, [b]).length, 1)
  const touching = copyBounds(b)
  Matter.Body.translate(b, { x: 200, y: 0 }); active.changed(b, touching)
  assert.deepEqual(active.collides(a, [b]), [])
})

test('a corrected query is revisited while a distant quiet prop stays inactive', () => {
  const a = Matter.Bodies.rectangle(0, 0, 32, 32), b = Matter.Bodies.rectangle(20, 0, 32, 32)
  const c = Matter.Bodies.rectangle(1000, 0, 32, 32), active = new ActivePropContacts([a, b, c])
  assert.equal(active.collides(a, [b, c]).length, 1)
  active.collides(c, [a, b])
  const before = copyBounds(a)
  Matter.Body.translate(a, { x: -1, y: 0 }); active.changed(a, before)
  assert.equal(active.collides(a, [b, c]).length, 1)
  assert.deepEqual(active.collides(c, [a, b]), [])
})

test('selective rope work retains exact nodes, bends and clearance through contact changes', () => {
  const wall = { x: 0, y: 180, w: 200, h: 500 }
  const definition = prepareRope({ x: 202, y: 80, length: 400, segments: 50 }, [wall])
  const a = createRope(definition), b = structuredClone(a)
  for (const rope of [a, b]) ropeImpulse(rope, 350, -220, 0, STEP)
  let skips = 0
  for (let tick = 0; tick < 240; tick++) {
    const terrain = tick < 180 ? [wall] : []
    if (tick === 80) wall.x -= 2
    setLabSolverEnabled(false); setRopeWasmEnabled(true); stepRope(a, STEP, terrain, null)
    setLabSolverEnabled(true); stepRope(b, STEP, terrain, null)
    assert.deepEqual(b.nodes, a.nodes, `nodes ${tick}`); assert.deepEqual(b.bends, a.bends, `bends ${tick}`)
    const status = ropeWasmStatus(); assert.equal(status.active, true)
    skips += status.activeStats[1] + status.activeStats[3]
    if (tick < 80) for (let i = 1; i < b.nodes.length; i++) {
      const p = [b.nodes[i - 1].x, b.nodes[i - 1].y], q = [b.nodes[i].x, b.nodes[i].y], bend = b.bends[i - 1]
      assert.equal(bend ? lineBlocked(p, bend, terrain) || lineBlocked(bend, q, terrain) : lineBlocked(p, q, terrain), false)
    }
  }
  assert.ok(skips > 0, 'exercise selective work, not only the default path')
})

test('active mixed contacts retain every tick through the sustained slow period', () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/jumping/lab-stress.json', import.meta.url)))
  const scenario = fixture.cases.find(c => c.id === 'mixed-medium')
  setLabSolverEnabled(false)
  const a = stressRun(fixture, scenario), b = stressRun(fixture, scenario)
  let skipped = 0
  for (let tick = 0; tick < 440; tick++) {
    setLabSolverEnabled(false); setRopeWasmEnabled(true); stepRun(a, NEUTRAL_INPUT, STEP)
    setLabSolverEnabled(true); stepRun(b, NEUTRAL_INPUT, STEP)
    assert.deepEqual(stressSnapshot(b), stressSnapshot(a), `mixed tick ${tick}`)
    skipped += labSolverStatus().propSkipped
  }
  assert.ok(skipped > 0)
})
