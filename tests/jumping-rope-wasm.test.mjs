import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createRope, ropeImpulse, stepRope } from '../src/games/jumping/climbables.ts'
import { prepareRope } from '../src/games/jumping/ropeLayout.ts'
import { lineBlocked } from '../src/games/jumping/geometry.ts'
import { createGravityField, updateGravityField } from '../src/games/jumping/gravity.ts'
import { STEP } from '../src/games/jumping/model.ts'
import { installRopeWasm, setRopeWasmEnabled, ropeWasmStatus, stepUnattachedRopeWasm } from '../src/games/jumping/ropeWasm.ts'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { parseLevel } from '../src/games/jumping/level.ts'
import { NEUTRAL_INPUT } from '../src/games/jumping/model.ts'
import { ballShape } from '../src/games/jumping/propGeometry.ts'

const bytes = readFileSync(new URL('../public/wasm/lab-rope.wasm', import.meta.url))
await installRopeWasm(bytes)
test('committed Wasm build records the current source and binary', () => {
  const record = JSON.parse(readFileSync(new URL('../public/wasm/lab-rope.build.json', import.meta.url)))
  const hash = path => {
    const bytes = readFileSync(new URL(path, import.meta.url))
    return createHash('sha256').update(path.endsWith('.wasm') ? bytes : bytes.toString('utf8').replace(/\r\n/g, '\n')).digest('hex')
  }
  assert.equal(record.abi, 2)
  for (const [key, path] of [['source', '../native/lab-rope/src/lib.rs'], ['manifest', '../native/lab-rope/Cargo.toml'],
    ['lock', '../native/lab-rope/Cargo.lock'], ['wasm', '../public/wasm/lab-rope.wasm']]) {
    assert.equal(record[key], hash(path), `Rebuild the Rust artifact: npm run build:lab-rope (${key})`)
  }
})
test('rope binary has the expected interface and no per-contact host imports', () => {
  assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)), [])
  assert.equal(ropeWasmStatus().installed, true)
})

test('archived contact reference matches the original ABI 2 stress build', () => {
  const record = JSON.parse(readFileSync(new URL('./fixtures/jumping/lab-rope-contact-reference.build.json', import.meta.url)))
  const reference = readFileSync(new URL('./fixtures/jumping/lab-rope-contact-reference.wasm', import.meta.url))
  const source = readFileSync(new URL('./fixtures/jumping/lab-rope-contact-reference.rs', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
  const original = JSON.parse(readFileSync(new URL('../docs/performance/2026-10-12-lab-browser-stress.json', import.meta.url)))
  assert.equal(record.abi, 2)
  assert.equal(createHash('sha256').update(reference).digest('hex'), record.wasm)
  assert.equal(createHash('sha256').update(source).digest('hex'), record.source)
  assert.equal(record.wasm, original.wasmHash)
  assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(reference)), [])
  assert.equal(new WebAssembly.Instance(new WebAssembly.Module(reference)).exports.abi_version(), 2)
})
function compare(a, b, tolerance = 1e-6) {
  assert.equal(a.nodes.length, b.nodes.length)
  for (let i = 0; i < a.nodes.length; i++) for (const key of ['x', 'y', 'oldX', 'oldY']) {
    assert.ok(Math.abs(a.nodes[i][key] - b.nodes[i][key]) <= tolerance,
      `node ${i} ${key}: TS=${a.nodes[i][key]}, Wasm=${b.nodes[i][key]}`)
  }
  assert.equal(a.pumpInput, b.pumpInput)
  for (let i = 0; i < a.bends.length; i++) {
    assert.equal(!!a.bends[i], !!b.bends[i], `bend presence ${i}`)
    if (a.bends[i]) for (let axis = 0; axis < 2; axis++) assert.ok(Math.abs(a.bends[i][axis] - b.bends[i][axis]) <= tolerance)
  }
}
function pairedTick(a, b, terrain, load = null, field, direction = 1) {
  setRopeWasmEnabled(false); stepRope(a, STEP, terrain, load, field, direction)
  setRopeWasmEnabled(true); stepRope(b, STEP, terrain, load, field, direction)
  compare(a, b)
}
for (const length of [24, 243, 920]) test(`Wasm matches a swinging ${length}-unit rope over 240 ticks`, () => {
  const a = createRope({ x: 40, y: 20, length, segments: Math.ceil(length / 8) }), b = structuredClone(a)
  for (const rope of [a, b]) ropeImpulse(rope, length * .8, 250, -80, STEP)
  const start = ropeWasmStatus().wasmSteps
  for (let tick = 0; tick < 240; tick++) pairedTick(a, b, [])
  assert.ok(ropeWasmStatus().wasmSteps > start, 'exercise Wasm rather than the fallback')
})
test('Wasm retains wall contacts and clears the entire path', () => {
  const shape = { x: 0, y: 180, w: 200, h: 500 }
  setRopeWasmEnabled(false)
  const definition = prepareRope({ x: 202, y: 80, length: 400, segments: 50 }, [shape])
  const a = createRope(definition), b = createRope(structuredClone(definition))
  for (const rope of [a, b]) ropeImpulse(rope, 350, -220, 0, STEP)
  const start = ropeWasmStatus().wasmSteps
  for (let tick = 0; tick < 180; tick++) {
    pairedTick(a, b, [shape])
    for (let i = 1; i < b.nodes.length; i++) {
      const p = [b.nodes[i - 1].x, b.nodes[i - 1].y], q = [b.nodes[i].x, b.nodes[i].y], bend = b.bends[i - 1]
      assert.equal(bend ? lineBlocked(p, bend, [shape]) || lineBlocked(bend, q, [shape]) : lineBlocked(p, q, [shape]), false)
    }
  }
  assert.ok(ropeWasmStatus().wasmSteps > start)
})
test('Wasm matches concave terrain, moving shapes and in-place outline edits', () => {
  const shape = { x: 0, y: 200, w: 400, h: 300, polygon: [[0, 0], [100, 0], [100, 250], [300, 250], [300, 0], [400, 0], [400, 300], [0, 300]] }
  const a = createRope({ x: 200, y: 20, length: 320, segments: 40 }), b = structuredClone(a)
  for (const rope of [a, b]) ropeImpulse(rope, 290, 180, 0, STEP)
  for (let tick = 0; tick < 120; tick++) {
    if (tick === 40) shape.x += 10
    if (tick === 80) shape.polygon[3][0] = shape.polygon[4][0] = 220
    pairedTick(a, b, [shape])
  }
})
test('Wasm keeps corner bends and releases removed terrain', () => {
  const shape = { x: 0, y: 100, w: 80, h: 30 }
  setRopeWasmEnabled(false)
  const definition = prepareRope({ x: 20, y: 0, length: 240, segments: 30 }, [shape])
  const a = createRope(definition), b = createRope(structuredClone(definition))
  for (const rope of [a, b]) ropeImpulse(rope, 200, 120, 0, STEP)
  for (let tick = 0; tick < 90; tick++) pairedTick(a, b, tick < 45 ? [shape] : [])
  assert.ok(b.bends.every(bend => bend === null))
})
test('per-particle switched gravity and the inverted frame retain their trajectories', () => {
  const field = createGravityField(), plate = { id: 'g', x: -400, y: -600, w: 800, h: 1200, gravity: -.4, power: 'always' }
  updateGravityField(field, [plate], new Map(), true)
  const a = createRope({ x: 0, y: 0, length: 240, segments: 30 }), b = structuredClone(a)
  for (let tick = 0; tick < 120; tick++) {
    if (tick === 60) { plate.gravity = .3; updateGravityField(field, [plate], new Map(), true, 1) }
    pairedTick(a, b, [], null, field, -1)
  }
})
test('sleeping ropes remain asleep and impulses wake the Wasm solver', () => {
  const definition = { x: 0, y: 0, length: 240, segments: 30, rest: { key: 'test', points: Array.from({ length: 31 }, (_, i) => [0, i * 8]) } }
  const rope = createRope(definition), before = structuredClone(rope), start = ropeWasmStatus().wasmSteps
  setRopeWasmEnabled(true); stepRope(rope, STEP, [], null)
  assert.deepEqual(rope, before); assert.equal(ropeWasmStatus().wasmSteps, start)
  ropeImpulse(rope, 220, 100, 0, STEP); stepRope(rope, STEP, [], null)
  assert.ok(ropeWasmStatus().wasmSteps > start)
})
test('loaded ropes use the unchanged TypeScript solver', () => {
  const a = createRope({ x: 0, y: 0, length: 240, segments: 30 }), b = structuredClone(a)
  const start = ropeWasmStatus().wasmSteps
  for (let tick = 0; tick < 30; tick++) pairedTick(a, b, [], { distance: 220, move: 1 })
  assert.equal(ropeWasmStatus().wasmSteps, start)
})
test('growing the workspace between ropes does not retain detached memory views', () => {
  for (const length of [24, 4000, 80, 920]) {
    const a = createRope({ x: 0, y: 0, length, segments: Math.ceil(length / 8) }), b = structuredClone(a)
    for (const rope of [a, b]) ropeImpulse(rope, length * .8, 100, 0, STEP)
    pairedTick(a, b, [])
  }
})

test('many-edge hull queries retain exact contacts during motion and outline edits', () => {
  for (const offset of [0, 500000]) for (const concave of [false, true]) {
    const shape = concave ? { x: 136, y: 212, w: 128, h: 128,
      polygon: Array.from({ length: 32 }, (_, i) => {
        const angle = i * Math.PI / 16, radius = i % 2 ? 38 : 64
        return [64 + Math.cos(angle) * radius, 64 + Math.sin(angle) * radius]
      }) } : structuredClone(ballShape({ x: 200, y: 340, size: 128 }))
    shape.x += offset; shape.y += offset
    const a = createRope({ x: 126 + offset, y: 20 + offset, length: 440, segments: 55 }), b = structuredClone(a)
    for (const rope of [a, b]) ropeImpulse(rope, 350, 200, 30, STEP)
    for (let tick = 0; tick < 120; tick++) {
      if (tick === 40) shape.x -= 8
      if (tick === 80) shape.polygon[3][0] += .001
      pairedTick(a, b, [shape])
      assert.deepEqual(b.nodes, a.nodes, `many-edge nodes ${concave}/${tick}`)
      assert.deepEqual(b.bends, a.bends, `many-edge bends ${concave}/${tick}`)
    }
  }
})

test('ordered contacts retain corrections into later colliders across terrain sizes', () => {
  const start = ropeWasmStatus().wasmSteps
  for (const count of [8, 65, 128, 129]) {
    // The first slab moves a point into the final slab, which was outside the
    // initial point query. Dummy solids retain the higher collider indices.
    const terrain = [{ x: -1, y: 80, w: 8, h: 260 },
      ...Array.from({ length: count - 2 }, (_, i) => ({ x: 70 + i * .02, y: 200, w: 1, h: 1 })),
      { x: -8, y: 80, w: 6, h: 260 }]
    const a = createRope({ x: 0, y: 0, length: 240, segments: 30 }), b = structuredClone(a)
    for (let tick = 0; tick < 24; tick++) {
      pairedTick(a, b, terrain)
      assert.deepEqual(b.nodes, a.nodes, `ordered spatial correction ${count}/${tick}`)
      assert.deepEqual(b.bends, a.bends)
    }
  }
  assert.ok(ropeWasmStatus().wasmSteps > start)
})

test('shared moving-hull preparation remains bounded through cache eviction', () => {
  const rope = createRope({ x: 0, y: 0, length: 240, segments: 30 })
  const outline = structuredClone(ballShape({ x: 200, y: 340, size: 32 }).polygon)
  const before = ropeWasmStatus().memoryBytes
  let middle = 0
  setRopeWasmEnabled(true)
  for (let tick = 0; tick < 180; tick++) {
    const shapes = Array.from({ length: 16 }, (_, i) => ({ x: 1000 + tick * .01 + i * 40, y: 200, w: 32, h: 32, polygon: outline }))
    assert.equal(stepUnattachedRopeWasm(rope, STEP, shapes, () => 1400), true)
    if (tick === 89) middle = ropeWasmStatus().memoryBytes
  }
  const after = ropeWasmStatus().memoryBytes
  assert.ok(after <= before + 8 * 1024 ** 2, `unexpected retained geometry: ${after - before}`)
  assert.ok(after <= middle + 1024 ** 2, `cache keeps growing after eviction: ${after - middle}`)
})
test('Spelunk historical replay retains completion, medal, clock and rope trajectories', () => {
  const level = JSON.parse(readFileSync(new URL('../public/levels/jumping/spelunk1.jump-level.json', import.meta.url)))
  const recording = JSON.parse(readFileSync(new URL('./fixtures/jumping-builtin-medal-runs.json', import.meta.url))).runs.find(run => run.file === 'spelunk1.jump-level.json')
  setRopeWasmEnabled(false)
  const a = createRun(parseLevel(structuredClone(level))), b = createRun(parseLevel(structuredClone(level)))
  const start = ropeWasmStatus().wasmSteps
  for (const { frames, input } of recording.trace) {
    const controls = { ...NEUTRAL_INPUT, ...input }
    for (let frame = 0; frame < frames; frame++) {
      setRopeWasmEnabled(false); stepRun(a, controls)
      setRopeWasmEnabled(true); stepRun(b, controls)
    }
    for (const key of ['x', 'y', 'vx', 'vy']) assert.ok(Math.abs(a.player[key] - b.player[key]) < 1e-6, `player ${key}`)
    for (let i = 0; i < a.player.ropes.length; i++) compare(a.player.ropes[i], b.player.ropes[i])
    assert.deepEqual(a.mechanisms.map(m => [m.x, m.y, m.active]), b.mechanisms.map(m => [m.x, m.y, m.active]))
  }
  assert.equal(a.finished, true); assert.equal(b.finished, true)
  assert.equal(b.medal, 'Gold'); assert.equal(b.coinsCollected, recording.coins)
  assert.equal(b.elapsed, a.elapsed); assert.equal(b.activeTime, a.activeTime)
  assert.ok(Math.abs(b.elapsed - recording.elapsed) < STEP)
  assert.ok(ropeWasmStatus().wasmSteps > start)
})
test('adapter failures leave state intact and disable the experiment', () => {
  const rope = createRope({ x: 0, y: 0, length: 240, segments: 30 }), before = structuredClone(rope)
  setRopeWasmEnabled(true)
  assert.equal(stepUnattachedRopeWasm(rope, STEP, [], () => { throw new Error('test failure') }), false)
  assert.deepEqual(rope, before)
  assert.equal(ropeWasmStatus().enabled, false)
  assert.equal(ropeWasmStatus().failures, 1)
})
