import { createPlayer, stepPlayer } from './helpers/jumping-fixtures.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { createRope, rappelFrame, ropePoint, stepRope, updateRopeWall } from '../src/games/jumping/climbables.ts'
import { athletePose } from '../src/games/jumping/athlete.ts'
import { FOOT_CONTACT, footPoint } from '../src/games/jumping/footwork.ts'
import { bodyIntersects } from '../src/games/jumping/geometry.ts'

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
const setup = (side, anchorGap = 2) => {
  const terrain = [{ x: side === 1 ? 400 : 0, y: 100, w: 400, h: 900 }]
  const world = { ladders: [], ropes: [{ x: 400 - side * anchorGap, y: 0, length: 900, segments: 42 }] }
  const p = createPlayer(); Object.assign(p, { x: 400 - side * Math.max(24, anchorGap), y: 620, facing: side, grounded: false })
  const tick = input => {
    stepPlayer(p, { ...NEUTRAL_INPUT, ...input }, STEP, terrain, world, { checkpoints: [], fallY: Infinity })
    assert.equal(p.climbing?.kind, 'rope', 'the hands must retain the rope through release and return')
    assert.ok(!terrain.some(b => bodyIntersects(p.x, p.y, b)), 'swinging cannot clip the body through terrain')
  }
  return { p, terrain, tick }
}
const posePoints = p => {
  const a = athletePose(p)
  return [a.head, a.hip, ...[a.frontLeg, a.backLeg, a.frontArm, a.backArm].flatMap(l => [l.root, l.joint, l.end])]
    .map(pt => [p.x + pt[0] * p.facing, p.y + pt[1]])
}

test('a wall contact can push the loaded rope outward but cannot attract an already distant rope', () => {
  for (const side of [-1, 1]) {
    const rope = createRope({ x: 400 - side * 40, y: 0, length: 700, segments: 32 }), free = structuredClone(rope)
    for (let i = 0; i < 120; i++) {
      stepRope(rope, STEP, [], { distance: 400, move: 0, wall: { x: 400, side } })
      stepRope(free, STEP, [], { distance: 400, move: 0 })
    }
    assert.deepEqual(rope.nodes, free.nodes, 'wall bracing must exert no attractive force')
  }
})

test('ropes anchored outside a cliff hang freely, and outward rope tension releases an existing foothold', () => {
  for (const side of [-1, 1]) {
    const { p, terrain, tick } = setup(side, 40)
    for (let i = 0; i < 180; i++) { tick({}); assert.equal(p.climbing.wall, undefined) }
    const pose = athletePose(p)
    for (const leg of [pose.frontLeg, pose.backLeg]) {
      const foot = [p.x + leg.end[0] * side, p.y + leg.end[1]]
      assert.ok((400 - foot[0]) * side > 30, 'feet should hang under the body, not reach sideways for the cliff')
    }
    const c = p.climbing
    // A rope drawn toward a nearby wall still pulls outward if its support is outside.
    c.rope.nodes.forEach((node, i) => { node.x = 400 - side * (40 - i / c.rope.nodes.length * 30) })
    c.wall = { x: 400, side }
    updateRopeWall(c, terrain)
    assert.equal(c.wall, undefined)
  }
})

test('steering away pushes off either wall, frees the feet smoothly and rebraces on the return swing', () => {
  for (const side of [-1, 1]) for (const strength of [.4, 1]) {
    const { p, tick } = setup(side)
    for (let i = 0; i < 80; i++) tick({})
    assert.ok(p.climbing.wall)
    const rope = p.climbing.rope, gripDistance = p.climbing.distance
    let previous = posePoints(p), maxStep = 0, peakGap = 0, returned = false
    for (let i = 0; i < 720; i++) {
      tick(i < 60 ? { move: -side * strength } : {})
      assert.equal(p.climbing.rope, rope)
      assert.equal(p.climbing.distance, gripDistance, 'pushing away must not drop or climb along the rope')
      if (i < 60) assert.equal(p.climbing.wall, undefined, 'held away input must not immediately reattach the feet')
      if (i === 40) {
        const pose = athletePose(p)
        for (const leg of [pose.frontLeg, pose.backLeg]) {
          assert.ok((400 - p.x - leg.end[0] * p.facing) * side > 10, 'both feet must leave the cliff')
        }
      }
      peakGap = Math.max(peakGap, (400 - ropePoint(rope, gripDistance)[0]) * side)
      returned ||= i > 120 && !!p.climbing.wall
      const current = posePoints(p)
      current.forEach((point, j) => { maxStep = Math.max(maxStep, distance(point, previous[j])) })
      previous = current
    }
    assert.ok(peakGap > (strength === 1 ? 30 : 20), 'the push must create an outward swing proportional to stick input')
    assert.ok(returned, 'feet may brace again when the swing brings the player back into contact')
    assert.ok(maxStep < 6, `feet, torso and hands should release and settle smoothly, largest step ${maxStep}`)
  }
})

test('drop releases either rappel wall without a push; jump alone still leaps outward', () => {
  for (const side of [-1, 1]) for (const dropping of [false, true]) {
    const { p, terrain, tick } = setup(side)
    for (let i = 0; i < 80; i++) tick({})
    assert.ok(p.climbing.wall)
    const rope = p.climbing.rope, { vx, y } = p
    const world = { ladders: [], ropes: [rope.definition] }, rules = { checkpoints: [], fallY: Infinity }
    // Drop takes precedence if both face buttons are held together.
    const input = { ...NEUTRAL_INPUT, jump: true, detach: dropping, drop: dropping }
    stepPlayer(p, input, STEP, terrain, world, rules)
    if (!dropping) {
      assert.ok(p.climbing)
      stepPlayer(p, NEUTRAL_INPUT, STEP, terrain, world, rules)
    }
    assert.equal(p.climbing, null)
    if (dropping) {
      assert.equal(p.vx, vx); assert.ok(p.vy > 0)
      for (let i = 0; i < 60; i++) {
        stepPlayer(p, input, STEP, terrain, world, rules)
        assert.equal(p.climbing, null)
        assert.ok(!terrain.some(b => bodyIntersects(p.x, p.y, b)))
      }
      assert.ok(p.y > y + 100)
    } else assert.ok(p.vx * side < -120 && p.vy < -300, 'jump without steering must launch away from the rappel wall')
  }
})

test('neutral keeps the last grip, but continuing Down climbs off the rope end', () => {
  for (const side of [-1, 1]) for (const gap of [2, 40]) {
    const { p, terrain, tick } = setup(side, gap)
    for (let i = 0; i < 80; i++) tick({})
    for (let i = 0; i < 620 && p.climbing.distance < p.climbing.rope.definition.length - 12; i++) tick({ descend: true })
    const c = p.climbing
    const at = c.distance
    for (let i = 0; i < 180; i++) tick({})
    assert.equal(p.climbing, c)
    assert.equal(c.distance, at, 'neutral should not feed rope through the hands')
    const world = { ladders: [], ropes: [c.rope.definition] }, rules = { checkpoints: [], fallY: Infinity }
    for (let i = 0; i < 12 && p.climbing; i++) stepPlayer(p, { ...NEUTRAL_INPUT, descend: true }, STEP, terrain, world, rules)
    assert.equal(p.climbing, null)
    assert.ok(p.vy > 0 && p.grabCooldown > 0, 'the last handhold should release into a controlled drop')
    const y = p.y
    for (let i = 0; i < 60; i++) {
      stepPlayer(p, { ...NEUTRAL_INPUT, descend: true }, STEP, terrain, world, rules)
      assert.equal(p.climbing, null, 'the free end must not immediately recatch the descending player')
    }
    assert.ok(p.y > y + 60)
  }
})

test('descending onto ground steps off a rope and holding Down does not regrab it', () => {
  for (const side of [-1, 1]) for (const gap of [2, 40]) {
    const { p, terrain, tick } = setup(side, gap)
    terrain.push({ x: 0, y: 800, w: 800, h: 200 })
    for (let i = 0; i < 80; i++) tick({})
    const world = { ladders: [], ropes: [p.climbing.rope.definition] }, rules = { checkpoints: [], fallY: Infinity }
    for (let i = 0; i < 500; i++) stepPlayer(p, { ...NEUTRAL_INPUT, descend: true }, STEP, terrain, world, rules)
    assert.equal(p.climbing, null)
    assert.ok(p.grounded && Math.abs(p.y - 800) < .01)
    assert.ok(!terrain.some(b => bodyIntersects(p.x, p.y, b)))
    for (let i = 0; i < 30; i++) stepPlayer(p, { ...NEUTRAL_INPUT, move: -side }, STEP, terrain, world, rules)
    assert.equal(p.climbing, null)
    assert.ok(p.grounded && p.vx * side < -50, 'normal walking resumes on the ground')
  }
})

test('contact with a cliff during a rope climb braces the feet while upward movement continues', () => {
  for (const side of [-1, 1]) {
    const terrain = [{ x: side === 1 ? 400 : 0, y: 200, w: 400, h: 800 }]
    const world = { ladders: [], ropes: [{ x: 400 - side * 20, y: 180, length: 700, segments: 34 }] }
    const p = createPlayer(); Object.assign(p, { x: 400 - side * 20, y: 650, facing: side, grounded: false })
    let braced = 0, feetOnWall = 0, previous, maxStep = 0, startY, transitions = 0, wasBraced = false
    for (let i = 0; i < 200; i++) {
      stepPlayer(p, { ...NEUTRAL_INPUT, climb: i >= 60, move: i >= 60 ? side : 0 }, STEP, terrain, world, { checkpoints: [], fallY: Infinity })
      assert.equal(p.climbing?.kind, 'rope')
      assert.ok(!terrain.some(b => bodyIntersects(p.x, p.y, b)))
      if (i === 60) startY = p.y
      if (!!p.climbing.wall !== wasBraced) transitions++
      wasBraced = !!p.climbing.wall
      if (p.climbing.wall) braced++
      if (p.climbing.wallBlend === 1) {
        const pose = athletePose(p), frame = rappelFrame(p.climbing)
        for (const [j, leg] of [pose.frontLeg, pose.backLeg].entries()) if (frame.steps[j].planted) {
          assert.ok(Math.abs(p.x + leg.end[0] * p.facing - (400 - side * 3)) < .01)
        }
        feetOnWall++
      }
      const current = posePoints(p)
      if (previous) current.forEach((point, j) => { maxStep = Math.max(maxStep, distance(point, previous[j])) })
      previous = current
    }
    assert.ok(braced > 30 && feetOnWall > 10, 'actual wall contact should become a supported bracing pose')
    assert.ok(p.y < startY - 70, 'the player must continue ascending beside the cliff')
    assert.ok(maxStep < 6, 'wall contact should not snap the limbs between poses')
    assert.ok(transitions <= 5, 'small tension changes must not flicker in and out of bracing')
  }
})

test('swinging toward a cliff meets it with the soles even when the rope is outside body-contact range', () => {
  for (const side of [-1, 1]) for (const gap of [20, 30, 40]) {
    const terrain = [{ x: side === 1 ? 400 : 0, y: 100, w: 400, h: 900 }]
    const world = { ladders: [], ropes: [{ x: 400 - side * gap, y: 100, length: 700, segments: 34 }] }
    const p = createPlayer(); Object.assign(p, { x: 400 - side * gap, y: 620, facing: side, grounded: false })
    let previous, maxStep = 0, braced = 0, transitions = 0, wasBraced = false, firstContactGap = 0
    for (let i = 0; i < 500; i++) {
      stepPlayer(p, { ...NEUTRAL_INPUT, move: i >= 60 && i < 280 ? side : 0 }, STEP, terrain, world, { checkpoints: [], fallY: Infinity })
      const c = p.climbing
      assert.equal(c?.kind, 'rope')
      assert.ok(!terrain.some(b => bodyIntersects(p.x, p.y, b)))
      if (c.wall) {
        if (!braced) firstContactGap = (400 - ropePoint(c.rope, c.distance)[0]) * side
        braced++
      }
      if (!!c.wall !== wasBraced) transitions++
      wasBraced = !!c.wall
      const pose = athletePose(p)
      for (const leg of [pose.frontLeg, pose.backLeg]) {
        const profile = 1 - (leg.rear ?? 0)
        const soles = FOOT_CONTACT.map(point => {
          const v = footPoint(point, leg.footAngle * leg.footFacing, leg.toeAngle * leg.footFacing)
          return [leg.end[0] + v[0] * leg.footFacing * profile, leg.end[1] + v[1]]
        })
        const samples = [...soles, [leg.joint[0] + side * p.facing * 1.7, leg.joint[1]],
          [leg.end[0] + side * p.facing * Math.max(1.3, 2.1 * (leg.rear ?? 0)), leg.end[1]]]
        for (const point of samples) assert.ok((p.x + point[0] * p.facing - 400) * side < .01,
          `the knees, heels and toes must stay outside the cliff, side ${side}, gap ${gap}, frame ${i}`)
        assert.ok(Math.abs(Math.hypot(distance(leg.root, leg.joint), leg.jointDepth ?? 0) - 15) < 1e-6)
        assert.ok(Math.abs(Math.hypot(distance(leg.joint, leg.end), leg.jointDepth ?? 0) - 14.5) < 1e-6)
      }
      const current = posePoints(p)
      if (previous) current.forEach((point, j) => { maxStep = Math.max(maxStep, distance(point, previous[j])) })
      previous = current
    }
    assert.ok(maxStep < 6, 'feet-first wall contact must blend without snapping the body')
    if (gap === 20) {
      assert.ok(firstContactGap > 16, 'the feet must establish support before the rope reaches the old contact threshold')
      assert.ok(braced > 200 && transitions <= 4, 'a loaded foothold must settle instead of flickering as the rope flexes')
    }
  }
})

test('a blocked rope climb keeps the loose tail moving and can descend again without letting go', () => {
  const terrain = [{ x: 300, y: 100, w: 200, h: 60 }]
  const world = { ladders: [], ropes: [{ x: 400, y: 160, length: 600, segments: 30 }] }
  const p = createPlayer(); Object.assign(p, { x: 400, y: 420, grounded: false })
  const tick = input => {
    stepPlayer(p, { ...NEUTRAL_INPUT, ...input }, STEP, terrain, world, { checkpoints: [], fallY: Infinity })
    assert.equal(p.climbing?.kind, 'rope')
    assert.ok(!terrain.some(b => bodyIntersects(p.x, p.y, b)))
  }
  for (let i = 0; i < 360; i++) tick({ climb: true })
  const rope = p.climbing.rope, tail = rope.nodes.at(-1), tailX = tail.x, holdingY = p.y
  tail.oldX -= 4
  let excursion = 0
  for (let i = 0; i < 120; i++) {
    tick({ climb: true })
    excursion = Math.max(excursion, Math.abs(rope.nodes.at(-1).x - tailX))
  }
  assert.ok(excursion > 15, 'body contact must not freeze the unblocked rope tail')
  assert.ok(p.y >= 222 - .01, 'the player must hold below the ceiling')
  for (let i = 0; i < 90; i++) tick({ descend: true })
  assert.ok(p.y > holdingY + 30, 'reversing direction should climb away from the obstruction')
})
