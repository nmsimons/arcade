import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createRope, ropeImpulse, ropePoint, stepRope } from '../src/games/jumping/climbables.ts'
import { prepareRope } from '../src/games/jumping/ropeLayout.ts'
import { lineBlocked } from '../src/games/jumping/geometry.ts'
import { STEP, createPlayer, stepPlayer, NEUTRAL_INPUT } from '../src/games/jumping/model.ts'
import { installRopeWasm, setRopeWasmEnabled, setRopeChainEnabled, ropeWasmStatus, stepUnattachedRopeWasm } from '../src/games/jumping/ropeWasm.ts'

const probe = './fixtures/jumping/lab-rope-chain-probe/'
await installRopeWasm(readFileSync(new URL(probe + 'lab-rope.wasm', import.meta.url)))
test.afterEach(() => { setRopeChainEnabled(false); setRopeWasmEnabled(false) })

test('archived chain probe matches its rejected source and build provenance', () => {
  const record = JSON.parse(readFileSync(new URL(probe + 'build.json', import.meta.url)))
  for (const [key, file] of [['source', 'src/lib.rs'], ['chain', 'src/chain.rs'], ['manifest', 'Cargo.toml'], ['lock', 'Cargo.lock'], ['wasm', 'lab-rope.wasm']]) {
    const bytes = readFileSync(new URL(probe + file, import.meta.url))
    const input = file.endsWith('.wasm') ? bytes : bytes.toString('utf8').replace(/\r\n/g, '\n')
    assert.equal(createHash('sha256').update(input).digest('hex'), record[key])
  }
})

for (const length of [240, 760]) test(`chain ${length}-unit free swing retains amplitude and return timing`, () => {
  const curves = []
  for (const chain of [false, true]) {
    const rope = createRope({ x: 0, y: 0, length, segments: Math.ceil(length / 8) })
    ropeImpulse(rope, length * .8, 250, -80, STEP)
    setRopeWasmEnabled(true); setRopeChainEnabled(chain)
    const xs = []
    for (let tick = 0; tick < 600; tick++) {
      stepRope(rope, STEP, [], null); xs.push(rope.nodes.at(-1).x)
      assert.deepEqual([rope.nodes[0].x, rope.nodes[0].y], [0, 0])
      const arc = rope.nodes.slice(1).reduce((sum, n, i) => sum + Math.hypot(n.x - rope.nodes[i].x, n.y - rope.nodes[i].y), 0)
      assert.ok(arc < length * 1.02)
    }
    curves.push({ positive: Math.max(...xs), negative: Math.min(...xs), firstReturn: xs.findIndex((x, i) => i > 30 && x < 0) })
  }
  for (const peak of ['positive', 'negative']) assert.ok(Math.abs(curves[1][peak] / curves[0][peak] - 1) < .05, JSON.stringify(curves))
  assert.ok(Math.abs(curves[1].firstReturn - curves[0].firstReturn) <= 3, JSON.stringify(curves))
  const [ticks, passes, budget] = ropeWasmStatus().chainStats
  assert.equal(ticks, 600); assert.ok(passes < budget * .5, 'global propagation must reduce actual passes')
})

test('chain wall and corner paths remain clear through movement and obstacle removal', () => {
  const wall = { x: 0, y: 180, w: 200, h: 500 }
  const definition = prepareRope({ x: 202, y: 80, length: 400, segments: 50 }, [wall])
  const rope = createRope(definition); ropeImpulse(rope, 350, -220, 0, STEP)
  setRopeWasmEnabled(true); setRopeChainEnabled(true)
  for (let tick = 0; tick < 360; tick++) {
    if (tick === 120) wall.x -= 2
    const terrain = tick < 240 ? [wall] : []
    stepRope(rope, STEP, terrain, null)
    for (let i = 1; i < rope.nodes.length; i++) {
      const a = [rope.nodes[i - 1].x, rope.nodes[i - 1].y], b = [rope.nodes[i].x, rope.nodes[i].y]
      const bend = rope.bends[i - 1], path = bend ? [a, bend, b] : [a, b]
      let span = 0
      for (let j = 1; j < path.length; j++) {
        assert.equal(lineBlocked(path[j - 1], path[j], terrain), false, `tick ${tick}, span ${i}`)
        span += Math.hypot(path[j][0] - path[j - 1][0], path[j][1] - path[j - 1][1])
      }
      assert.ok(span / 8 < 1.1, `tick ${tick}: stretched span ${span}`)
    }
  }
  assert.ok(rope.bends.every(b => b === null))
  assert.equal(ropeWasmStatus().failures, 0)
})

test('chain flag retains the exact loaded-rope solve', () => {
  const a = createRope({ x: 0, y: 0, length: 760, segments: 95 }), b = structuredClone(a)
  for (const r of [a, b]) ropeImpulse(r, 700, 250, 0, STEP)
  const before = ropeWasmStatus().wasmSteps
  for (let tick = 0; tick < 240; tick++) {
    setRopeWasmEnabled(true); setRopeChainEnabled(false); stepRope(a, STEP, [], { distance: 700, move: tick % 40 < 20 ? 1 : -1 })
    setRopeChainEnabled(true); stepRope(b, STEP, [], { distance: 700, move: tick % 40 < 20 ? 1 : -1 })
    assert.deepEqual(b.nodes, a.nodes); assert.deepEqual(b.bends, a.bends)
  }
  assert.equal(ropeWasmStatus().wasmSteps, before)
})

test('a moving solid intruding around an anchor restores the same ordered tick', () => {
  const a = createRope({ x: 0, y: 0, length: 240, segments: 30 }), b = structuredClone(a)
  const terrain = [{ x: -10, y: -1, w: 20, h: 50 }]
  setRopeWasmEnabled(true); setRopeChainEnabled(false); stepRope(a, STEP, terrain, null)
  setRopeChainEnabled(true); stepRope(b, STEP, terrain, null)
  assert.equal(ropeWasmStatus().chainStats[4], 1, 'exercise the guard, not just a fast solve')
  assert.deepEqual(b.nodes, a.nodes); assert.deepEqual(b.bends, a.bends)
})

test('a chain swing can be caught and dropped without a new impulse', () => {
  const definition = { x: 500, y: 100, length: 760, segments: 95 }
  const rope = createRope(definition); ropeImpulse(rope, 700, 250, 0, STEP)
  setRopeWasmEnabled(true); setRopeChainEnabled(true)
  for (let tick = 0; tick < 180; tick++) stepRope(rope, STEP, [], null)
  const grip = ropePoint(rope, 700), p = createPlayer({ x: grip[0] - 10, y: grip[1] + 56 })
  Object.assign(p, { grounded: false, ropes: [rope] })
  const world = { ladders: [], ropes: [definition] }
  stepPlayer(p, NEUTRAL_INPUT, STEP, [], world)
  assert.equal(p.climbing?.rope, rope)
  for (let tick = 0; tick < 50; tick++) stepPlayer(p, NEUTRAL_INPUT, STEP, [], world)
  const { x, y, vx } = p
  stepPlayer(p, { ...NEUTRAL_INPUT, detach: true }, STEP, [], world)
  assert.equal(p.climbing, null); assert.deepEqual([p.x, p.y], [x, y]); assert.equal(p.vx, vx)
  const before = ropeWasmStatus().wasmSteps
  for (let tick = 0; tick < 8; tick++) stepPlayer(p, { ...NEUTRAL_INPUT, move: -1 }, STEP, [], world)
  assert.ok(ropeWasmStatus().wasmSteps > before, 'released rope returns to the chain solve')
})

test('the shipped kernel declines a chain request without publishing partial state', async () => {
  await installRopeWasm(readFileSync(new URL('../public/wasm/lab-rope.wasm', import.meta.url)))
  const rope = createRope({ x: 0, y: 0, length: 240, segments: 30 }), before = structuredClone(rope)
  setRopeWasmEnabled(true); setRopeChainEnabled(true)
  assert.equal(stepUnattachedRopeWasm(rope, STEP, [], () => 1400), false)
  assert.deepEqual(rope, before); assert.equal(ropeWasmStatus().enabled, false)
})
