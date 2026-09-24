import { createPlayer, stepPlayer } from './helpers/jumping-fixtures.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { STEP, NEUTRAL_INPUT, TUNING, playerState, respawn } from '../src/games/jumping/model.ts'
import { athletePose } from '../src/games/jumping/athlete.ts'
import { FOOT_CONTACT, footPoint } from '../src/games/jumping/footwork.ts'

const floor = { x: 0, y: 620, w: 1000, h: 400 }
const wall = { x: 350, y: 0, w: 100, h: 620 }
const world = [floor, wall]
const airborne = (values = {}) => Object.assign(createPlayer(), { x: 338, y: 400, grounded: false, coyote: 0, vy: 100 }, values)
function advance(p, seconds, input = {}, platforms = world) {
  for (let t = 0; t < seconds - STEP / 2; t += STEP) stepPlayer(p, { ...NEUTRAL_INPUT, ...input }, STEP, platforms)
}
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])

test('airborne contact braces on either side while gravity continues unchanged', () => {
  for (const direction of [-1, 1]) {
    const p = airborne({ x: direction === 1 ? 338 : 462, facing: direction }), falling = { ...p }
    advance(p, .25, { move: direction })
    advance(falling, .25, {}, [])
    assert.equal(playerState(p), 'Bracing')
    assert.deepEqual(p.wallBrace.hands, [1, 1])
    assert.deepEqual(p.wallBrace.feet, [1, 1])
    assert.equal(p.x, direction === 1 ? 338 : 462)
    assert.equal(p.vx, 0)
    assert.equal(p.y, falling.y)
    assert.equal(p.vy, falling.vy)
  }
})

test('holding jump before touching a wall braces and falls without an automatic kick', () => {
  const p = airborne({ vy: -300, jumpHeld: true }), falling = { ...p }
  for (let frame = 0; frame < 50; frame++) {
    advance(p, STEP, { jump: true, move: 1 })
    advance(falling, STEP, {}, [])
    assert.equal(p.y, falling.y)
    assert.equal(p.vy, falling.vy)
    assert.equal(p.vx, 0)
  }
  assert.equal(p.wallBrace.active, true)
  assert.ok(p.vy > 0)
})

test('steering away releases the brace, and landing or respawn clears it', () => {
  const p = airborne()
  advance(p, .1, { move: 1 })
  advance(p, .1, { move: -1 })
  assert.equal(p.wallBrace, null)
  assert.ok(p.x < 337 && p.vx < 0)
  const q = airborne()
  advance(q, .8)
  assert.equal(q.grounded, true)
  assert.equal(q.wallBrace, null)
  Object.assign(q, airborne())
  advance(q, .1)
  assert.ok(q.wallBrace)
  respawn(q)
  assert.equal(q.wallBrace, null)
})

test('grounded pushing and charged jumping keep their existing behavior', () => {
  const p = createPlayer(); p.x = 324.5
  advance(p, .4, { jump: true, move: 1 })
  assert.equal(p.grounded, true)
  assert.equal(p.charge, 1)
  assert.equal(p.wallBrace, null)
  assert.ok(p.pushing)
  advance(p, STEP, { move: 1 })
  assert.ok(p.vy < -TUNING.chargedJumpSpeed + 20)
})

test('bracing requires contact with an exposed wall, never a slope, ceiling, or internal seam', () => {
  const cases = [
    { platforms: [], x: 338, y: 500 },
    { platforms: [wall], x: 336, y: 500 },
    { platforms: [{ x: 350, y: 400, w: 100, h: 20 }], x: 338, y: 484 },
    { platforms: [{ x: 350, y: 400, w: 200, h: 100, profile: [[0, 100], [200, 0]] }], x: 338, y: 498 },
    { platforms: [wall, { x: 300, y: 0, w: 150, h: 620 }], x: 338, y: 500 },
  ]
  for (const { platforms, x, y } of cases) {
    const p = airborne({ x, y, vy: 0 })
    advance(p, STEP, {}, platforms)
    assert.equal(p.wallBrace, null)
  }
})

test('short faces only brace the limbs that actually meet their surface', () => {
  const p = airborne({ y: 500, vy: 0 })
  advance(p, STEP, {}, [{ x: 350, y: 456, w: 100, h: 14 }])
  assert.ok(p.wallBrace.hands[0] > 0)
  assert.equal(p.wallBrace.hands[1], 0)
  assert.deepEqual(p.wallBrace.feet, [0, 0])
  const q = airborne({ y: 500, vy: 0 })
  advance(q, STEP, {}, [{ x: 350, y: 482, w: 100, h: 28 }])
  assert.deepEqual(q.wallBrace.hands, [0, 0])
  assert.ok(q.wallBrace.feet[0] > 0)
  assert.equal(q.wallBrace.feet[1], 0)
})

test('brace animation keeps forward knees, natural ankles and foot contact against the wall', () => {
  for (const direction of [-1, 1]) for (const vy of [-600, 0, 600]) {
    const p = airborne({ x: direction === 1 ? 338 : 462, facing: direction, vy })
    for (let frame = 0; frame < 18; frame++) {
      advance(p, STEP, { move: direction })
      const pose = athletePose(p)
      for (const limb of [pose.frontArm, pose.backArm, pose.frontLeg, pose.backLeg]) {
        const leg = 'footAngle' in limb
        assert.ok(Math.abs(distance(limb.root, limb.joint) - (leg ? 15 : 10)) < 1e-6)
        assert.ok(Math.abs(distance(limb.joint, limb.end) - (leg ? 14.5 : 9)) < 1e-6)
      }
      for (const leg of [pose.frontLeg, pose.backLeg]) for (const point of FOOT_CONTACT) {
        assert.ok(leg.end[0] + footPoint(point, leg.footAngle, leg.toeAngle)[0] <= 12.01, 'the approaching foot must not pass through the wall')
      }
      for (const leg of [pose.frontLeg, pose.backLeg]) {
        const thigh = [leg.joint[0] - leg.root[0], leg.joint[1] - leg.root[1]]
        const shin = [leg.end[0] - leg.joint[0], leg.end[1] - leg.joint[1]]
        assert.ok(thigh[0] * shin[1] - thigh[1] * shin[0] > 0, 'the knee must bend forward, never backward')
        const neutral = Math.atan2(shin[1], shin[0]) - Math.PI / 2
        const flex = Math.atan2(Math.sin(leg.footAngle - neutral), Math.cos(leg.footAngle - neutral))
        assert.ok(flex >= -.35 - 1e-6 && flex <= .7 + 1e-6, 'ankle flex stays within the normal rig limits')
      }
      if (frame > 10) {
        for (const arm of [pose.frontArm, pose.backArm]) assert.ok(Math.abs(arm.hand[0] + 1.6 - 12) < 1e-6)
        for (const leg of [pose.frontLeg, pose.backLeg]) {
          const sole = Math.max(...FOOT_CONTACT.map(point => leg.end[0] + footPoint(point, leg.footAngle, leg.toeAngle)[0]))
          assert.ok(Math.abs(sole - 12) < .01)
        }
        assert.ok(pose.head[0] + 6.2 < 12, 'the face stays clear of the wall')
        assert.ok(pose.shoulder[0] - pose.hip[0] > 10, 'the torso leans toward the wall')
      }
    }
  }
})
