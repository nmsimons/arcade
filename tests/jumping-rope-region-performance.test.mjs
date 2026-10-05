import test from 'node:test'
import assert from 'node:assert/strict'
import { createRope, ropeImpulse, stepRope } from '../src/games/jumping/climbables.ts'
import { prepareRope } from '../src/games/jumping/ropeLayout.ts'
import { lineBlocked } from '../src/games/jumping/geometry.ts'
import { STEP } from '../src/games/jumping/model.ts'

const terrain = () => ({ x: 0, y: 880, w: 8000, h: 520, polygon: [
  [0,0], [540,0], [540,500], [780,500], [780,0], [1640,0], [1640,500], [2100,500], [2100,0],
  [2900,0], [2900,500], [4060,500], [4060,0], [4840,0], [4840,500], [6600,500], [6600,0], [8000,0], [8000,520], [0,520],
] })

test('three active ropes in empty pits keep free-swing motion without distant terrain contact work', t => {
  const shape = terrain(), definitions = [
    { x: 3390, y: 130, length: 920, segments: 115 }, { x: 5375, y: 70, length: 920, segments: 115 },
    { x: 6045, y: 80, length: 905, segments: 114 },
  ]
  const ropes = definitions.map(createRope), controls = definitions.map(createRope)
  for (const rope of [...ropes, ...controls]) ropeImpulse(rope, 760, 250, 0, STEP)
  const initial = structuredClone(ropes.map(r => r.nodes))
  let roots = 0
  const hypot = Math.hypot
  t.mock.method(Math, 'hypot', (...values) => { roots++; return hypot(...values) })
  for (let tick = 0; tick < 30; tick++) for (let i = 0; i < ropes.length; i++) {
    const load = i === 2 ? { distance: 760, move: 1 } : null
    stepRope(ropes[i], STEP, [shape], load); stepRope(controls[i], STEP, [], load)
    assert.deepEqual(ropes[i], controls[i], 'an empty pit must preserve every particle and its stored velocity')
  }
  assert.notDeepEqual(ropes.map(r => r.nodes), initial, 'earlier ropes still simulate after release')
  assert.ok(roots < 1000, `remote terrain must not cause per-particle contact searches: ${roots} square roots`)
})

test('terrain culling retains the wall beside a swinging rope and resolves every span', () => {
  const shape = terrain(), rope = createRope(prepareRope({ x: 560, y: 760, length: 240, segments: 30 }, [shape]))
  ropeImpulse(rope, 220, -250, 0, STEP)
  let metWall = false
  for (let tick = 0; tick < 90; tick++) {
    stepRope(rope, STEP, [shape], { distance: 220, move: -1 })
    metWall ||= rope.nodes.some(n => n.y > 881 && n.x < 543)
    for (let i = 1; i < rope.nodes.length; i++) {
      const a = [rope.nodes[i - 1].x, rope.nodes[i - 1].y], b = [rope.nodes[i].x, rope.nodes[i].y], bend = rope.bends[i - 1]
      assert.equal(bend ? lineBlocked(a, bend, [shape]) || lineBlocked(bend, b, [shape]) : lineBlocked(a, b, [shape]), false)
    }
  }
  assert.ok(metWall, 'exercise a real wall contact rather than only a free swing')
})

test('an in-place outline edit entering an empty pit wakes its saved resting rope', () => {
  const shape = terrain(), rope = createRope(prepareRope({ x: 3390, y: 130, length: 920, segments: 115 }, [shape]))
  const before = structuredClone(rope)
  stepRope(rope, STEP, [shape], null)
  assert.deepEqual(rope, before)
  shape.polygon[9][0] = shape.polygon[10][0] = 3500
  stepRope(rope, STEP, [shape], null)
  assert.notDeepEqual(rope.nodes, before.nodes, 'the newly intersecting solid must participate immediately')
})

test('leaving all terrain releases old corner bends during the normal solve', () => {
  const rope = createRope({ x: 0, y: 0, length: 240, segments: 30 })
  rope.bends[4] = [1.5, 36]
  stepRope(rope, STEP, [], null)
  assert.ok(rope.bends.every(b => b === null), 'a removed corner must not retain its old constraint')
  assert.ok(rope.nodes.every(n => Number.isFinite(n.x) && Number.isFinite(n.y)))
})
