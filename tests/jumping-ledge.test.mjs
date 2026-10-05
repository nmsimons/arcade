import { createPlayer, stepPlayer } from './helpers/jumping-fixtures.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { athletePose } from '../src/games/jumping/athlete.ts'
import { NEUTRAL_INPUT, STEP, TUNING, cancelJumpInput } from '../src/games/jumping/model.ts'
import { BACK_GRIP, FRONT_GRIP, KNEE_CONTACT, climbFrame, LEDGE_CATCH_TIME, LEDGE_CLIMB_TIME } from '../src/games/jumping/ledge.ts'
import { FOOT_CONTACT, footPoint } from '../src/games/jumping/footwork.ts'

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
const landmarks = pose => [pose.hip, pose.waist, pose.shoulder, pose.head,
  ...[pose.frontArm, pose.backArm, pose.frontLeg, pose.backLeg].flatMap(limb => [limb.root, limb.joint, limb.end])]
const close = (a, b, message) => assert.ok(distance(a, b) < 1e-6, message)

test('compact pull-up poses keep their supports, limb lengths and corner clearance', () => {
  for (const inset of [8, 12, 16]) for (const braced of [false, true]) {
    let previous
    for (let i = 0; i <= 2000; i++) {
      const t = i / 2000, frame = climbFrame(t, braced, 0, false, inset), p = createPlayer()
      Object.assign(p, { x: frame.root[0], y: frame.root[1], facing: 1, grounded: false,
        mantle: { edgeX: 0, edgeY: 0, side: 1, toX: inset, toY: 0, time: t * LEDGE_CLIMB_TIME, braced, inset } })
      const pose = athletePose(p), edge = a => [a[0] + p.x, a[1] + p.y]
      assert.ok(distance(pose.hip, pose.shoulder) > 12)
      for (const [j, prefix] of ['front', 'back'].entries()) {
        const arm = pose[`${prefix}Arm`], leg = pose[`${prefix}Leg`]
        for (const [limb, upper, lower] of [[arm, 10, 9], [leg, 15, 14.5]]) {
          assert.ok(Math.abs(distance(limb.root, limb.joint) - upper) < 1e-6)
          assert.ok(Math.abs(distance(limb.joint, limb.end) - lower) < 1e-6)
        }
        if (frame[`${prefix}Release`] === 0) close(edge(arm.hand), j ? BACK_GRIP : FRONT_GRIP)
        close(edge(leg.end), frame[`${prefix}Foot`], 'the foot target remains reachable')
        if (leg.planted) close(edge(leg.end), [inset + (j ? -2 : 2), -2.8], 'planted feet do not slide')
        for (const point of FOOT_CONTACT) {
          const offset = footPoint(point, leg.footAngle, leg.toeAngle), ankle = edge(leg.end)
          assert.ok(ankle[0] + offset[0] <= .03 || ankle[1] + offset[1] <= .03, 'feet clear the ledge corner')
        }
      }
      if (frame.kneePlanted) close(edge(pose.frontLeg.joint), KNEE_CONTACT)
      const points = landmarks(pose).map(edge)
      if (previous) points.forEach((point, j) => assert.ok(distance(point, previous[j]) < .8, `compact pose discontinuity at ${t}`))
      previous = points
    }
  }
})

test('the climb preserves limb lengths, ledge supports and clearance on either side', () => {
  for (const braced of [false, true]) for (const side of [-1, 1]) {
    let previous
    for (let i = 0; i <= 1000; i++) {
      const t = i / 1000, frame = climbFrame(t, braced), p = createPlayer()
      Object.assign(p, { x: 500 + frame.root[0] * side, y: 400 + frame.root[1], facing: side, grounded: false,
        mantle: { edgeX: 500, edgeY: 400, side, toX: 500 + 20 * side, toY: 400, time: t * LEDGE_CLIMB_TIME, braced } })
      const pose = athletePose(p), edge = a => [a[0] + frame.root[0], a[1] + frame.root[1]]
      assert.ok(distance(pose.hip, pose.shoulder) > 12, 'the torso must keep its length while folding over the edge')
      for (const [index, prefix] of ['front', 'back'].entries()) {
        const arm = pose[`${prefix}Arm`], leg = pose[`${prefix}Leg`]
        for (const [limb, lengths] of [[arm, [10, 9]], [leg, [15, 14.5]]]) {
          assert.ok(Math.abs(distance(limb.root, limb.joint) - lengths[0]) < 1e-6)
          assert.ok(Math.abs(distance(limb.joint, limb.end) - lengths[1]) < 1e-6)
        }
        if (frame[`${prefix}Release`] === 0) close(edge(arm.hand), index ? BACK_GRIP : FRONT_GRIP, 'a supporting hand must remain fixed')
        for (const point of [arm.joint, arm.end, arm.hand]) {
          const [x, y] = edge(point)
          assert.ok(x <= .03 || y <= .4, `the hand must lift off the top at ${t}`)
        }
        close(edge(leg.end), frame[`${prefix}Foot`], 'the foot target must be reachable without stretching')
        if (leg.planted) close(edge(leg.end), index ? [18, -2.8] : [22, -2.8], 'the standing foot must not slide')
        // The drawn knees and ankles have volume, not just point contacts.
        for (const [point, radius] of [[leg.joint, 1.7], [leg.end, 1.3]]) {
          const [x, y] = edge(point)
          assert.ok(x <= -radius + .03 || y <= -radius + .03, `joint crossed the corner at ${t}`)
        }
        for (const point of FOOT_CONTACT) {
          const offset = footPoint(point, leg.footAngle, leg.toeAngle), ankle = edge(leg.end)
          assert.ok(ankle[0] + offset[0] <= .03 || ankle[1] + offset[1] <= .03, `foot crossed the corner at ${t}`)
        }
      }
      if (frame.kneePlanted) close(edge(pose.frontLeg.joint), KNEE_CONTACT, 'the knee must carry weight at a fixed point')
      const current = landmarks(pose).map(edge)
      if (previous) current.forEach((point, j) => assert.ok(distance(point, previous[j]) < .8, `pose snapped at ${t}`))
      previous = current
    }
  }
})

test('a real catch settles into wall bracing or a straight hang, then stands without a pose snap', () => {
  for (const braced of [false, true]) for (const side of [-1, 1]) {
    const p = createPlayer(), world = [{ x: 0, y: 620, w: 2600, h: 400 }, { x: 500, y: 400, w: 220, h: braced ? 220 : 12 }]
    Object.assign(p, { x: side === 1 ? 420 : 800, facing: side })
    let hangTime = 0, stable, previous, didCatch = false, didClimb = false, didStand = false
    for (let time = 0; time < 3.5; time += STEP) {
      if (p.hang) hangTime += STEP
      const wasClimbing = !!p.mantle
      // Keep this pose regression's 710-unit entry impulse independent of control tuning.
      stepPlayer(p, { ...NEUTRAL_INPUT, jump: time === 0, jumpStrength: .775, move: hangTime === 0 ? side : 0, climb: time === 0 || hangTime > .65 }, STEP, world)
      const pose = athletePose(p), worldPoint = a => [p.x + a[0] * side, p.y + a[1]]
      if (p.hang?.time > .2) {
        didCatch = true; assert.equal(p.hang.braced, braced)
        if (stable) landmarks(pose).forEach((point, i) => close(worldPoint(point), stable[i], 'the hanging body and contacts must settle'))
        stable = landmarks(pose).map(worldPoint)
        if (braced) for (const leg of [pose.frontLeg, pose.backLeg]) {
          assert.equal(leg.footAngle, -Math.PI / 2)
          for (const point of [[-1.8, 2.8], [4.5, 2.8]]) {
            const offset = footPoint(point, leg.footAngle, leg.toeAngle), soleX = p.x + (leg.end[0] + offset[0]) * side
            assert.ok(Math.abs(soleX - p.hang.edgeX) < 1e-6, 'the soles must press against the wall')
          }
        }
        else {
          assert.ok(Math.abs(pose.hip[0] - pose.shoulder[0]) < .01)
          for (const leg of [pose.frontLeg, pose.backLeg]) assert.ok(Math.abs(leg.end[0] - pose.hip[0]) <= 1.01)
        }
      }
      if (p.mantle) didClimb = true
      if (wasClimbing && p.grounded) {
        didStand = true
        landmarks(pose).forEach((point, i) => assert.ok(distance(worldPoint(point), previous[i]) < .05, `standing must continue the final climb pose: ${distance(worldPoint(point), previous[i])}`))
        assert.ok(p.footwork.feet.every(foot => foot.planted))
      }
      previous = landmarks(pose).map(worldPoint)
    }
    assert.ok(didCatch && didClimb && didStand)
    assert.equal(p.y, 400); assert.equal(p.x, side === 1 ? 520 : 700)
  }
})

test('down near either edge lowers smoothly into a stable hang without dropping through', () => {
  for (const braced of [false, true]) for (const side of [-1, 1]) for (const inset of [8, 30]) {
    const p = createPlayer(), world = [{ x: 0, y: 620, w: 2600, h: 400 }, { x: 500, y: 400, w: 220, h: braced ? 220 : 12 }]
    const edgeX = side === 1 ? 500 : 720, down = { ...NEUTRAL_INPUT, descend: true, drop: true }
    Object.assign(p, { x: edgeX + inset * side, y: 400, facing: -side })
    stepPlayer(p, NEUTRAL_INPUT, STEP, world)
    const start = [p.x, p.y]
    stepPlayer(p, down, STEP, world)
    assert.ok(p.mantle?.descending); close([p.x, p.y], start, 'entering the descent must not teleport')
    let previous, previousRoot, landedInHang = false
    for (let time = 0; time < 1.6; time += STEP) {
      const wasLowering = !!p.mantle
      stepPlayer(p, down, STEP, world)
      const pose = athletePose(p), points = landmarks(pose).map(a => [p.x + a[0] * p.facing, p.y + a[1]])
      if (previousRoot) assert.ok(distance([p.x, p.y], previousRoot) < 3, 'lowering must move continuously around the edge')
      if (wasLowering && p.hang) {
        landedInHang = true
        points.forEach((point, i) => assert.ok(distance(point, previous[i]) < .1, 'lowering must finish in the hanging pose'))
      }
      previous = points; previousRoot = [p.x, p.y]
    }
    assert.ok(landedInHang && p.hang, 'the same held down input must leave the figure hanging')
    assert.equal(p.hang.braced, braced); assert.equal(p.facing, side)
    close([p.x, p.y], [edgeX - 14 * side, 474], 'the hands must settle on the selected edge')
    stepPlayer(p, NEUTRAL_INPUT, STEP, world)
    if (inset === 8) {
      for (let time = 0; time < LEDGE_CATCH_TIME + LEDGE_CLIMB_TIME + .1; time += STEP) stepPlayer(p, { ...NEUTRAL_INPUT, climb: true }, STEP, world)
      assert.equal(p.grounded, true); close([p.x, p.y], [edgeX + 20 * side, 400], 'up must climb back onto the same platform')
    } else {
      stepPlayer(p, down, STEP, world)
      assert.equal(p.hang, null); assert.ok(p.vy > 0, 'a fresh down press lets go')
    }
  }
})

test('ledge descent ignores distant edges and refuses a blocked hanging space', () => {
  const platform = { x: 500, y: 400, w: 220, h: 160 }
  for (const [x, extra] of [[610, []], [520, [{ x: 460, y: 400, w: 40, h: 160 }]], [700, [{ x: 720, y: 450, w: 200, h: 170 }]]]) {
    const p = createPlayer(); Object.assign(p, { x, y: 400 })
    const world = [platform, ...extra]
    for (let i = 0; i < 60; i++) stepPlayer(p, { ...NEUTRAL_INPUT, descend: true, drop: true }, STEP, world)
    assert.equal(p.mantle, null); assert.equal(p.hang, null); assert.equal(p.grounded, true)
    close([p.x, p.y], [x, 400], 'down must leave the figure standing when no safe nearby edge exists')
  }
})

function hangingPlayer(side, braced) {
  const p = createPlayer(), world = [{ x: 500, y: 400, w: 220, h: braced ? 220 : 12 }]
  const edgeX = side === 1 ? 500 : 720
  Object.assign(p, { x: edgeX + 8 * side, y: 400, facing: -side })
  for (let time = 0; time < 1.6; time += STEP) stepPlayer(p, { ...NEUTRAL_INPUT, descend: true }, STEP, world)
  stepPlayer(p, NEUTRAL_INPUT, STEP, world)
  assert.ok(p.hang)
  return { p, world }
}

test('hanging jumps launch on press regardless of direction or Up input', () => {
  for (const braced of [false, true]) for (const side of [-1, 1]) for (const move of [-1, 0, 1]) for (const climb of [false, true]) {
    const { p, world } = hangingPlayer(side, braced), startX = p.x, startY = p.y
    const input = { ...NEUTRAL_INPUT, jump: true, move, climb }
    stepPlayer(p, input, STEP, world)
    assert.equal(p.hang, null); assert.equal(p.mantle, null)
    assert.equal(p.vy, -TUNING.jumpSpeed); assert.ok(p.vx * side < 0)
    for (let i = 0; i < 12; i++) {
      stepPlayer(p, input, STEP, world)
      assert.equal(p.hang, null); assert.equal(p.mantle, null)
    }
    assert.ok(p.y < startY && (p.x - startX) * side < 0)
  }
})

test('Up alone starts the pull-up and Jump cancels a queued pull-up', () => {
  for (const braced of [false, true]) for (const side of [-1, 1]) {
    const { p, world } = hangingPlayer(side, braced)
    for (const move of [-1, 0, 1]) for (let i = 0; i < 30; i++) {
      stepPlayer(p, { ...NEUTRAL_INPUT, move }, STEP, world)
      assert.ok(p.hang); assert.equal(p.mantle, null)
    }
    // A short Up press during the catch queues a pull-up; Jump must override it.
    p.hang.time = 0
    stepPlayer(p, { ...NEUTRAL_INPUT, climb: true }, STEP, world)
    assert.ok(p.hang.queued)
    stepPlayer(p, { ...NEUTRAL_INPUT, jump: true }, STEP, world)
    assert.equal(p.hang, null); assert.equal(p.mantle, null); assert.ok(p.vy < 0)

    const next = hangingPlayer(side, braced)
    stepPlayer(next.p, { ...NEUTRAL_INPUT, climb: true }, STEP, next.world)
    assert.ok(next.p.mantle); assert.equal(next.p.hang, null)
    for (let time = 0; time < LEDGE_CLIMB_TIME + .1; time += STEP) stepPlayer(next.p, NEUTRAL_INPUT, STEP, next.world)
    assert.ok(next.p.grounded); assert.equal(next.p.mantle, null); assert.equal(next.p.y, 400)
  }
})

test('canceling input while hanging does not jump on release', () => {
  const { p, world } = hangingPlayer(1, true)
  p.jumpHeld = true
  cancelJumpInput(p)
  for (let i = 0; i < 60; i++) stepPlayer(p, NEUTRAL_INPUT, STEP, world)
  assert.ok(p.hang); assert.equal(p.mantle, null); assert.equal(p.vy, 0)
})
