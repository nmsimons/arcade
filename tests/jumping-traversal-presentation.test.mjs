import test from 'node:test'
import assert from 'node:assert/strict'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { blankTrial } from '../src/games/jumping/level.ts'
import { createPlayer, NEUTRAL_INPUT, STEP, stepPlayer, TUNING } from '../src/games/jumping/model.ts'
import { athletePose, handOutline } from '../src/games/jumping/athlete.ts'
import { nearestBoundary, pointInside } from '../src/games/jumping/geometry.ts'
import { mirrorPlatform, mirrorPlayerState } from '../src/games/jumping/gravityFrame.ts'

function pushingRun(direction = 1, blocked = true) {
  const level = blankTrial()
  level.spawn = { x: 540 - direction * 65.5, y: 920 }
  level.props = [{ kind: 'box', x: 540, y: 920, size: 80 }]
  level.platforms = blocked ? [{ x: direction === 1 ? 580 : 380, y: 650, w: 120, h: 270 }] : []
  return createRun(level)
}
function advance(run, frames, input) {
  for (let i = 0; i < frames; i++) stepRun(run, { ...NEUTRAL_INPUT, ...input })
}
const worldPoint = (p, point) => [p.x + point[0] * p.facing, p.y + point[1] * (p.inverted ? -1 : 1)]
function clearPoint(p, point, radius, solids) {
  const [x, y] = worldPoint(p, point)
  for (const solid of solids) {
    assert.equal(pointInside(solid, x, y), false, 'the visible point stays outside a solid')
    assert.ok(nearestBoundary(solid, x, y).distance >= radius - .02, 'the visible outline clears the surface')
  }
}
function clearSegment(p, a, b, radius, solids) {
  for (let i = 0; i <= 10; i++) clearPoint(p, a.map((v,j) => v + (b[j] - v) * i / 10), radius, solids)
}
function limbLengths(pose) {
  for (const limb of [pose.frontArm, pose.backArm, pose.frontLeg, pose.backLeg]) {
    const leg = 'footAngle' in limb
    assert.ok(Math.abs(Math.hypot(...limb.joint.map((v, i) => v - limb.root[i]), limb.jointDepth ?? 0) - (leg ? 15 : 10)) < 1e-5)
    assert.ok(Math.abs(Math.hypot(...limb.end.map((v, i) => v - limb.joint[i]), (limb.endDepth ?? 0) - (limb.jointDepth ?? 0)) - (leg ? 14.5 : 9)) < 1e-5)
  }
}

test('crouched prop pushing keeps reachable palms and the final head outside the box', () => {
  for (const direction of [-1, 1]) {
    const run = pushingRun(direction)
    for (let i = 0; i < 360; i++) {
      stepRun(run, { ...NEUTRAL_INPUT, move: direction, crouch: true })
      if (i < 30) continue
      const p = run.player, pose = athletePose(p)
      clearPoint(p, pose.head, 6.2, run.platforms)
      clearSegment(p, pose.hip, pose.waist, 2.8, run.platforms)
      clearSegment(p, pose.waist, pose.shoulder, 2.8, run.platforms)
      limbLengths(pose)
      assert.ok(p.pushing.height < 35, 'crouched palms use the lowered working height')
      for (const [j, arm] of [pose.frontArm, pose.backArm].entries()) {
        const palm = p.pushing.palms[j], hand = worldPoint(p, arm.hand)
        assert.ok(Math.hypot(hand[0] - palm.x - palm.nx * 1.6, hand[1] - palm.y - palm.ny * 1.6) < .1)
      }
    }
  }
})

test('prone flight clears a neighboring wall in both directions and gravity frames', () => {
  for (const direction of [-1, 1]) for (const inverted of [false, true]) {
    const wall = { x: direction === 1 ? 520 : 280, y: 0, w: 200, h: 1400 }
    const p = createPlayer({ x: 500, y: 500 })
    Object.assign(p, { grounded: false, coyote: 0, vy: 300, facing: direction, freeFall: { time: 2, amount: 1, recovery: null } })
    stepPlayer(p, NEUTRAL_INPUT, STEP, [wall])
    if (inverted) { mirrorPlayerState(p); p.inverted = true }
    const solids = inverted ? [mirrorPlatform(wall)] : [wall]
    for (let frame = 0; frame < 30; frame++) {
      const before = structuredClone(p), pose = athletePose(p)
      clearPoint(p, pose.head, 6.2, solids)
      clearSegment(p, pose.hip, pose.waist, 2.8, solids)
      clearSegment(p, pose.waist, pose.shoulder, 2.8, solids)
      for (const limb of [pose.frontArm, pose.backArm, pose.frontLeg, pose.backLeg]) {
        clearSegment(p, limb.root, limb.joint, 1.5, solids)
        clearSegment(p, limb.joint, limb.end, 1.5, solids)
      }
      for (const arm of [pose.frontArm, pose.backArm]) for (const point of handOutline(arm)) clearPoint(p, point, .01, solids)
      limbLengths(pose)
      assert.deepEqual(p, before, 'drawing clearance never changes the physical player')
      stepPlayer(p, NEUTRAL_INPUT, STEP, solids, undefined, undefined, undefined, undefined, inverted ? -TUNING.gravity : TUNING.gravity)
    }
  }
})

test('a blocked push establishes its brace once and then keeps its soles still', () => {
  for (const direction of [-1, 1]) {
    const run = pushingRun(direction)
    advance(run, 360, { move: direction })
    const p = run.player, feet = p.footwork.feet
    assert.ok(Math.abs(feet[0].anchorX - feet[1].anchorX) >= 8, 'the blocked shove establishes a staggered base')
    assert.ok(feet.every(foot => foot.planted))
    const anchors = feet.map(foot => [foot.anchorX, foot.anchorY])
    advance(run, 1200, { move: direction })
    assert.deepEqual(p.footwork.feet.map(foot => [foot.anchorX, foot.anchorY]), anchors)
  }
})

test('a moving push transfers torso weight while its load-bearing palms stay fixed', () => {
  const run = pushingRun(1, false)
  advance(run, 180, { move: 1 })
  const hips = [], chest = [], supports = new Set()
  for (let i = 0; i < 180; i++) {
    stepRun(run, { ...NEUTRAL_INPUT, move: 1 })
    const p = run.player, pose = athletePose(p)
    hips.push(pose.hip[1]); chest.push(pose.shoulder[0])
    supports.add(p.footwork.feet.findIndex(foot => foot.planted))
    limbLengths(pose)
    for (const [j, arm] of [pose.frontArm, pose.backArm].entries()) {
      const palm = p.pushing.palms[j], hand = worldPoint(p, arm.hand)
      assert.ok(Math.hypot(hand[0] - palm.x - palm.nx * 1.6, hand[1] - palm.y - palm.ny * 1.6) < .1)
    }
  }
  assert.ok(supports.has(0) && supports.has(1), 'the sequence includes both support legs')
  assert.ok(Math.max(...hips) - Math.min(...hips) > .5, 'the torso participates in the steps')
  assert.ok(Math.max(...chest) - Math.min(...chest) > .2, 'the chest follows the supporting body')
})

test('light and full blocked efforts have different supported body loading', () => {
  const low = pushingRun(), full = pushingRun()
  advance(low, 360, { move: .2 }); advance(full, 360, { move: 1 })
  const lightPose = athletePose(low.player), fullPose = athletePose(full.player)
  assert.ok(fullPose.hip[1] - lightPose.hip[1] > 1, 'full opposition loads the hips more than a light press')
  assert.ok(fullPose.shoulder[0] - lightPose.shoulder[0] > .5, 'the chest conveys the stronger shove')
  assert.ok(Math.abs(full.player.x - low.player.x) < .01, 'load presentation does not displace the physical player')
})
