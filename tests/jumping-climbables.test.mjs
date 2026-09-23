import test from 'node:test'
import assert from 'node:assert/strict'
import { createPlayer, NEUTRAL_INPUT, PLATFORMS, STEP, stepPlayer } from '../src/games/jumping/model.ts'
import { CLIMBABLES, climbContact, createRope, ropeImpulse, ropePoint, stepRope } from '../src/games/jumping/climbables.ts'
import { athletePose } from '../src/games/jumping/athlete.ts'

function advance(p, seconds, input = {}, world = PLATFORMS) {
  for (let i = 0; i < Math.round(seconds / STEP); i++) stepPlayer(p, { ...NEUTRAL_INPUT, ...input }, STEP, world)
}
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])

test('a ladder climbs, holds, descends, transfers onto the platform and returns to the ground', () => {
  const p = createPlayer(); p.x = CLIMBABLES.ladders[0].x
  advance(p, .7, { climb: true }); assert.equal(p.climbing.kind, 'ladder'); assert.ok(p.y < 580)
  const y = p.y; advance(p, .3); assert.equal(p.y, y)
  advance(p, .3, { descend: true }); assert.ok(p.y > y + 25)
  advance(p, 3, { climb: true }); assert.equal(p.climbing, null); assert.equal(p.mantle, null)
  assert.equal(p.y, 400); assert.equal(p.grounded, true)
  advance(p, 3.5, { descend: true }); assert.equal(p.y, 620); assert.equal(p.grounded, true); assert.equal(p.climbing, null)
  advance(p, .5, { descend: true }); assert.equal(p.climbing, null, 'holding down at the bottom must not repeatedly reattach')
})

test('back-view ladder contacts alternate on fixed rungs and keep the limbs their proper lengths', () => {
  const p = createPlayer(); p.x = CLIMBABLES.ladders[0].x; advance(p, .2, { climb: true })
  let previous, anchored = 0
  for (let i = 0; i < 110; i++) {
    advance(p, STEP, { climb: true })
    const pose = athletePose(p), c = p.climbing
    assert.ok(pose.frontArm.root[0] < pose.shoulder[0] && pose.backArm.root[0] > pose.shoulder[0])
    assert.ok(pose.frontLeg.root[0] < pose.hip[0] && pose.backLeg.root[0] > pose.hip[0])
    const limbs = [pose.frontArm, pose.backArm, pose.frontLeg, pose.backLeg], contacts = [4, 18, 46, 60].map(offset => climbContact(c.distance, offset))
    const points = limbs.map(limb => [p.x + limb.end[0] * p.facing, p.y + limb.end[1]])
    for (let j = 0; j < 4; j++) {
      assert.ok(Math.abs(Math.hypot(distance(limbs[j].root, limbs[j].joint), limbs[j].jointDepth) - (j < 2 ? 10 : 15)) < 1e-6)
      assert.ok(Math.abs(Math.hypot(distance(limbs[j].joint, limbs[j].end), limbs[j].jointDepth - (limbs[j].endDepth ?? 0)) - (j < 2 ? 9 : 14.5)) < 1e-6)
      if (contacts[j].planted && previous?.contacts[j].planted) {
        assert.ok(distance(points[j], previous.points[j]) < .01, 'a gripping limb must not slide along its rung'); anchored++
      }
    }
    previous = { contacts, points }
  }
  assert.ok(anchored > 100)
})

test('rope simulation stays anchored, resists stretching and continues swinging after the load is released', () => {
  const rope = createRope(CLIMBABLES.ropes[0]), spacing = rope.definition.length / rope.definition.segments
  ropeImpulse(rope, 240, 300, 0, STEP)
  for (let i = 0; i < 300; i++) stepRope(rope, STEP, [], { distance: 240, move: i < 80 ? 1 : 0 })
  assert.equal(rope.nodes[0].x, rope.definition.x); assert.equal(rope.nodes[0].y, rope.definition.y)
  assert.ok(Math.abs(rope.nodes.at(-1).x - rope.definition.x) > 30)
  const before = rope.nodes.at(-1).x
  for (let i = 0; i < 60; i++) stepRope(rope, STEP, [], null)
  assert.ok(Math.abs(rope.nodes.at(-1).x - before) > 10, 'the released rope must retain its own momentum')
  for (let i = 1; i < rope.nodes.length; i++) {
    const a = rope.nodes[i - 1], b = rope.nodes[i]
    assert.ok(Number.isFinite(b.x) && Number.isFinite(b.y))
    assert.ok(Math.abs(Math.hypot(b.x - a.x, b.y - a.y) - spacing) < .6)
  }
})

test('ropes climb and descend, carry the player during a swing, and transfer velocity on release', () => {
  const p = createPlayer(); p.x = 1535
  advance(p, .8, { climb: true }); assert.equal(p.climbing.kind, 'rope'); const height = p.y
  advance(p, .2, { descend: true }); assert.ok(p.y > height + 15)
  advance(p, .6, { climb: true, move: 1 }); assert.ok(p.x > 1570)
  const velocity = p.vx; advance(p, STEP, { jump: true, move: 1 })
  assert.equal(p.climbing, null); assert.ok(p.vx >= velocity); assert.ok(p.vy < -350)
  const x = p.x; advance(p, .1, { move: 1 }); assert.ok(p.x > x + 10)
  assert.equal(p.climbing, null, 'the release cooldown prevents immediately grabbing again')
})

test('holding a swing direction cannot suspend the rope to one side', () => {
  for (const distance of [80, 240]) for (const move of [-1, -.5, .5, 1]) {
    const rope = createRope(CLIMBABLES.ropes[0])
    let side = 0, crossings = 0, firstPeak = 0, returned = false
    for (let i = 0; i < 12 / STEP; i++) {
      stepRope(rope, STEP, [], { distance, move })
      const x = ropePoint(rope, distance)[0] - rope.definition.x
      firstPeak = Math.max(firstPeak, x * Math.sign(move))
      if (firstPeak > 5 && x * Math.sign(move) < -2) returned = true
      if (Math.abs(x) > 2 && Math.sign(x) !== side) { side = Math.sign(x); crossings++ }
    }
    assert.ok(firstPeak > 5, 'weight shift must start a swing from rest')
    assert.ok(returned, 'gravity must bring the rope back past center despite held input')
    assert.ok(crossings >= 4, 'held input must permit repeated pendulum motion')
  }
})

test('timed weight shifts build a larger swing than holding one side, and neutral input coasts', () => {
  const amplitude = strategy => {
    const rope = createRope(CLIMBABLES.ropes[0])
    let move = 1, peak = 0
    for (let i = 0; i < 6 / STEP; i++) {
      const current = ropePoint(rope, 240), previous = ropePoint(rope, 240, true)
      if (strategy === 'coast' && i > 36) move = 0
      if (strategy === 'timed' && Math.abs(current[0] - previous[0]) > .025) move = Math.sign(current[0] - previous[0])
      stepRope(rope, STEP, [], { distance: 240, move })
      if (i > 4 / STEP) peak = Math.max(peak, Math.abs(ropePoint(rope, 240)[0] - rope.definition.x))
    }
    return peak
  }
  const coasting = amplitude('coast'), held = amplitude('held'), timed = amplitude('timed')
  assert.ok(coasting > 5, 'releasing the stick preserves pendulum momentum')
  assert.ok(held > coasting * 2, 'pumping adds useful swing energy')
  assert.ok(timed > held * 1.1, 'alternating with the swing rewards good timing')
})

test('airborne rope catches work from either side, rising or falling, without directional input', () => {
  for (const side of [-1, 1]) for (const vy of [-200, 250]) for (const jump of [false, true]) {
    const p = createPlayer()
    Object.assign(p, { x: 1535 - side * 70, y: 500, vx: side * 350, vy, facing: side, grounded: false })
    for (let i = 0; i < 40 && !p.climbing; i++) advance(p, STEP, { move: side, jump })
    assert.equal(p.climbing?.kind, 'rope')
    assert.ok(p.climbing.caught.vx * side > 300, 'the catch must retain arrival momentum')
    const rope = p.climbing.rope
    advance(p, .2, { jump })
    assert.equal(p.climbing?.rope, rope, 'holding jump through the catch must not immediately release it')
    assert.equal(p.climbing.direction, 0)
    assert.ok(Math.abs(ropePoint(rope, p.climbing.distance)[0] - rope.definition.x) > 2, 'the arriving player must set the rope in motion')
  }
})

test('automatic catches use the moving rope and consume a jump press on the catch frame', () => {
  const p = createPlayer(), rope = createRope(CLIMBABLES.ropes[0])
  ropeImpulse(rope, 240, 300, 0, STEP)
  for (let i = 0; i < 80; i++) stepRope(rope, STEP, [], { distance: 240, move: 1 })
  const hand = ropePoint(rope, 240)
  assert.ok(hand[0] > rope.definition.x + 30)
  Object.assign(p, { x: hand[0] - 10, y: hand[1] + 56, grounded: false, ropes: [rope], vx: 160, vy: -200 })
  advance(p, STEP, { jump: true })
  assert.equal(p.climbing?.rope, rope)
  advance(p, .1, { jump: true }); assert.equal(p.climbing?.rope, rope)
  advance(p, STEP); advance(p, STEP, { jump: true, move: 1 })
  assert.equal(p.climbing, null); assert.ok(p.vy < 0)
  advance(p, .2, { move: 1 }); assert.equal(p.climbing, null)
})

test('grounded players and ladders still require climb input, and action preserves an existing rope grip', () => {
  const p = createPlayer(); p.x = 1535
  advance(p, .3); assert.equal(p.climbing, null)
  advance(p, .4, { jump: true }); assert.equal(p.climbing, null); assert.equal(p.grounded, true)
  advance(p, .15); assert.equal(p.climbing?.kind, 'rope', 'jumping from below must catch without holding up')
  for (let i = 0; i < 60; i++) {
    advance(p, STEP, { detach: true })
    assert.equal(p.climbing?.kind, 'rope', 'action must not release an existing rope grip')
  }
  const byLadder = createPlayer(); Object.assign(byLadder, { x: 1134, y: 550, grounded: false, vy: -100 })
  advance(byLadder, .1); assert.equal(byLadder.climbing, null)
})

test('rope rest hangs from overhead grips and swinging turns smoothly into a profile with extended arms', () => {
  for (const facing of [-1, 1]) {
    const p = createPlayer(); Object.assign(p, { x: 1535, facing })
    advance(p, .8, { climb: true }); advance(p, .35)
    let pose = athletePose(p)
    for (const arm of [pose.frontArm, pose.backArm]) {
      assert.ok(arm.hand[1] < pose.head[1] - 8, 'both hands rest above the head')
      assert.ok(distance(arm.root, arm.end) > 18.5, 'the resting arms bear weight almost straight')
    }
    let previous
    for (const input of [{ move: -1 }, { move: 1 }, { climb: true }]) {
      for (let i = 0; i < 60; i++) {
        advance(p, STEP, input); pose = athletePose(p)
        const limbs = [pose.frontArm, pose.backArm, pose.frontLeg, pose.backLeg]
        const points = [pose.hip, pose.head, ...limbs.flatMap(limb => [limb.root, limb.joint, limb.end])]
          .map(point => [p.x + point[0] * facing, p.y + point[1]])
        if (previous) for (let j = 0; j < points.length; j++) assert.ok(distance(points[j], previous[j]) < 5, 'turns and regrips must stay smooth')
        for (const [j, limb] of limbs.entries()) {
          assert.ok(Math.abs(Math.hypot(distance(limb.root, limb.joint), limb.jointDepth) - (j < 2 ? 10 : 15)) < 1e-6)
          assert.ok(Math.abs(Math.hypot(distance(limb.joint, limb.end), limb.jointDepth - (limb.endDepth ?? 0)) - (j < 2 ? 9 : 14.5)) < 1e-6)
        }
        previous = points
      }
      if (input.move) {
        assert.equal(pose.sideView, 1)
        assert.ok(distance(pose.frontArm.root, pose.backArm.root) < .01, 'the shoulders coincide in profile')
        assert.ok((pose.hip[0] - pose.frontArm.hand[0]) * facing * input.move > 10, 'the body leans toward the input')
        assert.ok(Math.abs(pose.hip[0]) < 1, 'the camera follows the body, not the loose rope tail')
        for (const arm of [pose.frontArm, pose.backArm]) {
          assert.ok(distance(arm.root, arm.end) > 18.7)
          assert.ok(arm.hand[1] < pose.head[1] - 8)
        }
      } else {
        assert.ok(pose.sideView < .01)
        assert.ok(distance(pose.frontArm.root, pose.backArm.root) > 7, 'climbing returns to the back view')
      }
    }
  }
})

test('pumping gathers the legs and bends the waist before the rope has built speed', () => {
  for (const move of [-1, 1]) {
    const p = createPlayer(); p.x = 1535
    advance(p, .8, { climb: true }); advance(p, .35)
    const resting = athletePose(p)
    advance(p, .12, { move })
    const early = athletePose(p)
    assert.ok(early.frontLeg.end[1] - early.hip[1] < resting.frontLeg.end[1] - resting.hip[1] - 8)
    const chest = Math.atan2(early.waist[0] - early.shoulder[0], early.waist[1] - early.shoulder[1])
    const pelvis = Math.atan2(early.hip[0] - early.waist[0], early.hip[1] - early.waist[1])
    assert.ok((pelvis - chest) * move > .25, 'the early tuck must flex through the waist')
    for (const arm of [early.frontArm, early.backArm]) assert.ok(distance(arm.root, arm.end) > 18.5)
  }
})

test('jump and drop release a ladder without producing another grounded jump', () => {
  for (const input of [{ jump: true, move: -1 }, { detach: true }]) {
    const p = createPlayer(); p.x = 1134; advance(p, .7, { climb: true }); advance(p, STEP, input)
    assert.equal(p.climbing, null); assert.equal(p.grounded, false); assert.ok(p.grabCooldown > 0)
    if (input.jump) assert.ok(p.vy < 0 && p.vx < 0)
    else assert.ok(p.vy > 0)
  }
})

test('pushing extends the arms when space permits and bends them in a confined space', () => {
  for (const confined of [false, true]) for (const side of [-1, 1]) {
    const p = createPlayer(), wall = { x: 500, y: 400, w: 100, h: 220 }, floor = { x: 0, y: 620, w: 2600, h: 400 }
    p.x = side === 1 ? 488 : 612; p.facing = side
    const world = [floor, wall]
    if (confined) world.push({ x: side === 1 ? 450 : 624, y: 400, w: 26, h: 220 })
    advance(p, .7, { move: side * .6 }, world)
    assert.equal(p.vx, 0); assert.ok(p.pushing); assert.equal(p.pushing.effort, .6)
    const pose = athletePose(p), arms = [pose.frontArm, pose.backArm], wallX = side === 1 ? 500 : 600
    for (const arm of arms) {
      assert.ok(Math.abs(p.x + arm.hand[0] * side - (wallX - 1.6 * side)) < 1e-6, 'the palm must press against the wall')
      assert.ok(confined ? distance(arm.root, arm.end) < 12 : distance(arm.root, arm.end) > 18.5)
    }
    assert.equal(p.x, side === 1 ? confined ? 488 : 474.5 : confined ? 612 : 625.5)
    const stopped = p.x; advance(p, .5, {}, world)
    assert.equal(p.x, stopped); assert.equal(p.pushing, null)
  }
})
