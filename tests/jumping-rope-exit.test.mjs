import test from 'node:test'
import assert from 'node:assert/strict'
import { createPlayer, NEUTRAL_INPUT, STEP, stepPlayer } from '../src/games/jumping/model.ts'
import { climbGait, createRope, ropePoint } from '../src/games/jumping/climbables.ts'
import { athletePose } from '../src/games/jumping/athlete.ts'
import { bodyIntersects } from '../src/games/jumping/geometry.ts'

function setup(side, thickness = 20, polygon = false, anchorY = 0, lower = true, tilt = .18) {
  const ledge = { x: side === 1 ? 400 : 0, y: 200, w: 400, h: thickness }
  if (polygon) ledge.polygon = [[0, 0], [400, 0], [400, thickness], [0, thickness]]
  const terrain = [ledge]
  if (lower) terrain.push({ x: side === 1 ? 340 : 0, y: 400, w: 460, h: 400 })
  const world = { ladders: [], ropes: [{ x: 400, y: 200 + anchorY, length: 520, segments: 28, anchor: { platform: 0, x: side === 1 ? 0 : 400, y: anchorY } }] }
  const rope = createRope(world.ropes[0])
  for (const [i, n] of rope.nodes.entries()) {
    const d = i * 520 / 28
    n.x = n.oldX = 400 - side * Math.sin(tilt) * d
    n.y = n.oldY = 200 + anchorY + Math.cos(tilt) * d
  }
  const p = createPlayer()
  Object.assign(p, { x: 400 - side * (tilt ? 35 : 20), y: 350, facing: side, grounded: false, ropes: [rope] })
  return { p, world, terrain }
}
function tick(scene, input = {}) {
  stepPlayer(scene.p, { ...NEUTRAL_INPUT, ...input }, STEP, scene.terrain, scene.world, { checkpoints: [], fallY: Infinity })
  if (!scene.p.mantle) assert.ok(!scene.terrain.some(b => bodyIntersects(scene.p.x, scene.p.y, b)), 'the transfer stays outside solid terrain')
}
function landmarks(p) {
  const pose = athletePose(p)
  return [pose.head, pose.hip, pose.shoulder, ...[pose.frontArm, pose.backArm, pose.frontLeg, pose.backLeg].flatMap(l => [l.root, l.joint, l.end])]
    .map(a => [p.x + a[0] * p.facing, p.y + a[1]])
}

test('climbing a rope anchored at a thin platform lip transfers from a free hang onto either side', () => {
  for (const side of [-1, 1]) for (const thickness of [12, 20, 40]) for (const polygon of [false, true]) {
    const scene = setup(side, thickness, polygon), { p } = scene
    let hanging = false, climbing = false, released = false, previous, transferring = false
    for (let i = 0; i < 400; i++) {
      const wasOnRope = !!p.climbing
      tick(scene, { climb: true })
      hanging ||= !!p.hang; climbing ||= !!p.mantle
      if (wasOnRope && !p.climbing && !p.hang) released = true
      if (p.hang) assert.equal(p.hang.braced, false, 'feet cannot brace against empty space under a thin ledge')
      const points = landmarks(p)
      if (previous && (p.hang || p.mantle || transferring)) points.forEach((a, j) => {
        const step = Math.hypot(a[0] - previous[j][0], a[1] - previous[j][1])
        assert.ok(step < 7, `rope-to-ledge pose: side ${side}, thickness ${thickness}, polygon ${polygon}, frame ${i}, point ${j}, step ${step}`)
      })
      previous = points; transferring = !!(p.hang || p.mantle)
    }
    assert.ok(hanging && climbing, 'Up must initiate the ledge transfer without requiring a bracing wall')
    assert.equal(released, false, 'the player transfers directly without falling and recatching')
    assert.equal(p.climbing, null); assert.equal(p.hang, null); assert.equal(p.mantle, null)
    assert.equal(p.grounded, true); assert.equal(p.y, 200); assert.equal(p.x, 400 + side * 20)
  }
})

test('ropes at the underside corner or hanging straight below the lip clear the overhang before lifting', () => {
  for (const side of [-1, 1]) for (const anchorY of [0, 20]) for (const lower of [false, true]) for (const tilt of [0, .18]) {
    if (lower && !tilt) continue // The lower cliff deflects the rope; a straight initial rope would be embedded inside it.
    const scene = setup(side, 20, false, anchorY, lower, tilt), { p } = scene
    let transferred = false
    for (let i = 0; i < 480; i++) {
      tick(scene, { climb: true })
      transferred ||= !!p.hang
    }
    assert.ok(transferred, `transfer from side ${side}, anchorY ${anchorY}, lower ${lower}, tilt ${tilt}`)
    assert.equal(p.climbing, null); assert.equal(p.hang, null); assert.equal(p.mantle, null)
    assert.equal(p.grounded, true); assert.equal(p.y, 200); assert.equal(p.x, 400 + side * 20)
  }
})

test('a rope cannot transfer through a ceiling, across an unreachable gap or without climb input', () => {
  for (const side of [-1, 1]) for (const kind of ['ceiling', 'distant', 'holding']) {
    const scene = setup(side)
    if (kind === 'ceiling') scene.terrain.push({ x: 360, y: 100, w: 80, h: 60 })
    if (kind === 'distant') scene.terrain[0].x += side * 100
    for (let i = 0; i < 260; i++) {
      tick(scene, { climb: kind !== 'holding' })
      assert.equal(scene.p.hang, null, kind); assert.equal(scene.p.mantle, null, kind)
      if (kind === 'ceiling' && i > 20) assert.equal(scene.p.climbing?.kind, 'rope', 'a blocked climb must hold its grip')
    }
    assert.ok(scene.p.y > 200, 'the player cannot reach an inaccessible platform')
  }
})

test('holding beside an anchor keeps the player clear without holding the loose rope sideways', () => {
  for (const side of [-1, 1]) for (const distance of [12, 18]) {
    const terrain = [{ x: side === 1 ? 400 : 0, y: 200, w: 400, h: 20 }]
    const world = { ladders: [], ropes: [{ x: 400, y: 200, length: 160, segments: 12 }] }
    const rope = createRope(world.ropes[0]), p = createPlayer()
    const c = { kind: 'rope', index: 0, distance, time: 1, direction: 0, swing: 0, lean: 0, hangBlend: 1, swingVelocity: 0,
      ladder: null, rope, caught: { ...p, x: 400 - side * 12, y: 270 } }
    Object.assign(p, { x: 400 - side * 12, y: 270, facing: side, grounded: false, ropes: [rope], climbing: c })
    for (let i = 0; i < 2400; i++) {
      stepPlayer(p, NEUTRAL_INPUT, STEP, terrain, world, { checkpoints: [], fallY: Infinity })
      assert.equal(p.climbing, c, 'waiting beside the lip must keep the grip')
      assert.ok(!terrain.some(b => bodyIntersects(p.x - side * 1e-4, p.y, b)), 'the hull may touch the lip within numerical tolerance, never enter it')
      if (i > 120) for (let j = 1; j < rope.nodes.length; j++) {
        const a = rope.nodes[j - 1], b = rope.nodes[j]
        assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 160 / 12 * 1.06, 'clearing the ledge must not stretch the rope to reach an impossible grip')
      }
    }
    const grip = ropePoint(rope, climbGait(c.distance, rope.definition.length).grip), tail = rope.nodes.at(-1)
    assert.ok(Math.abs(tail.x - grip[0]) < 5, 'the unweighted tail must settle beneath the hand rather than remain bowed sideways')
    assert.ok(tail.y > grip[1] + 135, 'gravity must draw the free section downward')
    assert.ok(Math.abs(p.x - rope.definition.x) < 3, 'a resting body must settle below its anchor instead of being held beside the lip')
    assert.ok(p.y + athletePose(p).head[1] - 6.2 >= 220, 'the slight regrip must clear the head below the overhang')
    assert.ok(c.distance <= distance + 10, 'clearing the lip must adjust only the nearby handhold')
    for (const arm of [athletePose(p).frontArm, athletePose(p).backArm]) {
      assert.ok(Math.hypot(p.x + arm.end[0] * side - grip[0], p.y + arm.end[1] - grip[1]) < 1.1, 'hands must remain on the actual rope')
    }
  }
})

test('a thick overhang blocks straight ascent but a small outward swing allows climbing around its edge', () => {
  for (const side of [-1, 1]) {
    const terrain = [{ x: side === 1 ? 400 : 0, y: 200, w: 400, h: 40 }]
    const world = { ladders: [], ropes: [{ x: 400, y: 200, length: 160, segments: 12 }] }
    const rope = createRope(world.ropes[0]), p = createPlayer()
    const c = { kind: 'rope', index: 0, distance: 50, time: 1, direction: 0, swing: 0, lean: 0, hangBlend: 1, swingVelocity: 0,
      ladder: null, rope, caught: { ...p, x: 400, y: 322 } }
    Object.assign(p, { x: 400, y: 322, facing: side, grounded: false, ropes: [rope], climbing: c })
    const scene = { p, world, terrain }
    for (let i = 0; i < 120; i++) tick(scene, { climb: true })
    assert.equal(p.climbing?.kind, 'rope', 'the solid underside should block an ascent directly through it')
    assert.ok(p.y >= 302 - .01)
    for (let i = 0; i < 60; i++) tick(scene, { move: -side })
    let transferred = false
    for (let i = 0; i < 360; i++) {
      tick(scene, { climb: true, move: p.climbing ? -side : 0 })
      transferred ||= !!p.hang || !!p.mantle
    }
    assert.ok(transferred, 'the player must be able to swing clear and reach the lip')
    assert.ok(p.grounded && p.y === 200)
  }
})
