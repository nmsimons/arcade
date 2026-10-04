import test from 'node:test'
import assert from 'node:assert/strict'
import { athletePose } from '../src/games/jumping/athlete.ts'
import { createPlayer, NEUTRAL_INPUT, respawn, STEP, stepPlayer, TUNING } from '../src/games/jumping/model.ts'
import { mirrorPlatform } from '../src/games/jumping/gravityFrame.ts'
import { createGravityField, updateGravityField } from '../src/games/jumping/gravity.ts'
import { createRope } from '../src/games/jumping/climbables.ts'

const floor = [{ x: -2000, y: 1200, w: 4000, h: 100 }]
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
const points = pose => [pose.hip, pose.waist, pose.shoulder, pose.head,
  ...[pose.frontArm, pose.backArm, pose.frontLeg, pose.backLeg].flatMap(limb => [limb.root, limb.joint, limb.end])]
const proneActive = p => (p.freeFall?.amount ?? 0) > 0

test('ordinary jumps and short drops keep steering and their upright landing', () => {
  for (const height of [0, 24, 140, 360, 600]) {
    const p = createPlayer({ x: 0, y: 1200 - height })
    p.grounded = !height
    if (!height) stepPlayer(p, { ...NEUTRAL_INPUT, jump: true, climb: true }, STEP, floor)
    let landed = false
    for (let i = 0; i < 180; i++) {
      stepPlayer(p, { ...NEUTRAL_INPUT, move: .2 }, STEP, floor)
      assert.equal(proneActive(p), false)
      if (p.grounded) { landed = true; break }
    }
    assert.equal(landed, true)
    assert.ok(p.vx > 0)
    assert.ok(athletePose(p).shoulder[1] < -35)
  }
})

test('a long fall lands flat and gets up smoothly in either direction', () => {
  for (const facing of [-1, 1]) {
    const p = createPlayer({ x: 0, y: 100 })
    Object.assign(p, { grounded: false, facing, vx: facing * 200 })
    let previous, hadProneFlight = false, impact = false, gotUp = false
    for (let i = 0; i < 400; i++) {
      const wasGrounded = p.grounded
      stepPlayer(p, NEUTRAL_INPUT, STEP, floor)
      const pose = athletePose(p), current = points(pose)
      if (previous) for (let j = 0; j < current.length; j++) assert.ok(distance(previous[j], current[j]) < 5,
        `joint ${j} snapped at frame ${i}: ${distance(previous[j], current[j])}`)
      for (const limb of [pose.frontArm, pose.backArm, pose.frontLeg, pose.backLeg]) {
        const leg = 'footAngle' in limb
        assert.ok(Math.abs(Math.hypot(...limb.joint.map((v, j) => v - limb.root[j]), limb.jointDepth ?? 0) - (leg ? 15 : 10)) < 1e-6)
        assert.ok(Math.abs(Math.hypot(...limb.end.map((v, j) => v - limb.joint[j]), (limb.endDepth ?? 0) - (limb.jointDepth ?? 0)) - (leg ? 14.5 : 9)) < 1e-6)
      }
      if (p.freeFall?.amount === 1 && !p.grounded) {
        hadProneFlight = true
        assert.ok(Math.abs(pose.shoulder[1] - pose.hip[1]) < 2)
        assert.ok(pose.frontLeg.end[0] < pose.hip[0] - 20)
        assert.ok(pose.frontLeg.joint[1] > pose.hip[1], 'prone knees bend toward the ground')
        assert.ok(pose.backArm.joint[1] > pose.shoulder[1], 'prone elbows face the ground')
        assert.ok(pose.frontLeg.footAngle > 1, 'trailing toes point down instead of standing flat')
        assert.ok(pose.headTilt > 1, 'the neck follows the horizontal body')
      }
      if (!wasGrounded && p.grounded) {
        impact = true
        assert.equal(p.freeFall?.recovery, 0)
        assert.ok(pose.head[1] > -12 && pose.head[1] < -6.2)
        assert.ok(Math.abs(pose.shoulder[1] - pose.hip[1]) < 2)
        assert.ok(p.footwork, 'ordinary contact footwork continues beneath the presentation')
      }
      if (impact && !p.freeFall) { gotUp = true; break }
      previous = current
    }
    assert.ok(hadProneFlight && impact && gotUp)
    assert.ok(athletePose(p).head[1] < -50)
    assert.ok(p.footwork.feet.every(foot => foot.planted))
    stepPlayer(p, { ...NEUTRAL_INPUT, jump: true, move: facing }, STEP, floor)
    assert.ok(p.vy < 0 && p.vx * facing > 0, 'normal movement and jumping return')
  }
})

test('a landing during the prone blend completes the flattening without a snap', () => {
  const p = createPlayer({ x: 0, y: 500 })
  p.grounded = false
  let previous, impact = false
  for (let i = 0; i < 240; i++) {
    stepPlayer(p, NEUTRAL_INPUT, STEP, floor)
    const current = points(athletePose(p))
    if (previous) for (let j = 0; j < current.length; j++) assert.ok(distance(previous[j], current[j]) < 5)
    if (p.freeFall?.recovery === 0) {
      impact = true
      assert.ok(p.freeFall.amount > 0 && p.freeFall.amount < 1)
    }
    previous = current
  }
  assert.ok(impact)
})

test('recovery uses swept polygon support and mirrored gravity, and respawn clears it', () => {
  for (const inverted of [false, true]) {
    const platforms = [{ x: -2000, y: 1200, w: 4000, h: 100, polygon: [[0, 0], [4000, 0], [4000, 100], [0, 100]] }]
      .map(b => inverted ? mirrorPlatform(b) : b)
    const p = createPlayer({ x: 0, y: inverted ? -100 : 100 })
    Object.assign(p, { grounded: false, inverted })
    for (let i = 0; i < 200 && !p.grounded; i++) stepPlayer(p, NEUTRAL_INPUT, STEP, platforms, undefined, undefined, undefined, undefined,
      inverted ? -TUNING.gravity : TUNING.gravity)
    assert.equal(p.grounded, true)
    assert.equal(p.freeFall?.recovery, 0)
    assert.ok(athletePose(p).head[1] > -12)
    respawn(p)
    assert.equal(p.freeFall, null)
  }
})

test('prone flight and recovery preserve ordinary steering and jump buffering', () => {
  const p = createPlayer({ x: 0, y: 100 }), baseline = createPlayer({ x: 0, y: 100 })
  p.grounded = baseline.grounded = false
  let prone = false, buffered = false, jumped = false
  for (let i = 0; i < 220; i++) {
    const jump = p.y > 1140
    const input = { ...NEUTRAL_INPUT, move: i < 140 ? 1 : -1, jump }
    baseline.freeFall = null
    stepPlayer(p, input, STEP, floor); stepPlayer(baseline, input, STEP, floor)
    for (const key of ['x', 'y', 'vx', 'vy', 'facing', 'grounded', 'buffer', 'coyote', 'jumpHeld']) assert.equal(p[key], baseline[key], key)
    if (proneActive(p)) prone = true
    if (proneActive(p) && p.buffer > 0) buffered = true
    if (buffered && p.vy < 0) { jumped = true; assert.equal(p.freeFall, null); break }
  }
  assert.ok(prone && buffered && jumped)
  const recovering = createPlayer({ x: 0, y: 1200 })
  recovering.freeFall = { time: 1.5, amount: 1, recovery: .2 }
  stepPlayer(recovering, { ...NEUTRAL_INPUT, move: 1, jump: true }, STEP, floor)
  assert.ok(recovering.vx > 0 && recovering.vy < 0)
  assert.equal(recovering.freeFall, null)
})

test('sustained upward grav lifts become prone without changing steering or ceiling support', () => {
  const field = createGravityField(), plate = { id: 'lift', x: -2000, y: -2000, w: 4000, h: 4000, gravity: -1, power: 'always' }
  updateGravityField(field, [plate], new Map(), true)
  const ceiling = [{ x: -2000, y: -100, w: 4000, h: 100 }]
  const p = createPlayer({ x: 0, y: 1700 })
  p.grounded = false
  let floating = false
  for (let i = 0; i < 300; i++) {
    stepPlayer(p, { ...NEUTRAL_INPUT, move: i < 160 ? 1 : -1 }, STEP, ceiling, undefined, undefined, undefined, field)
    if (i === 100) assert.equal(proneActive(p), false, 'the lift retains the later transition')
    if (p.freeFall?.amount === 1) {
      floating = true
      assert.ok(p.vy < 0)
      const pose = athletePose(p)
      assert.ok(Math.abs(pose.shoulder[1] - pose.hip[1]) < 2)
      if (i >= 160) assert.equal(p.facing, -1, 'lift steering stays responsive during the floating pose')
    }
    if (p.grounded) break
  }
  assert.ok(floating)
  assert.equal(p.grounded, true)
  assert.equal(p.inverted, true)
  assert.equal(p.freeFall, null)
})

test('a rope catch remembers the prone source pose after live flight ends', () => {
  const p = createPlayer({ x: 300, y: 500 }), rope = { x: 300, y: 0, length: 800 }
  Object.assign(p, { grounded: false, vy: 1100, freeFall: { time: 1.5, amount: 1, recovery: null }, ropes: [createRope(rope)] })
  stepPlayer(p, NEUTRAL_INPUT, STEP, [], { ropes: [rope], ladders: [] })
  assert.equal(p.climbing?.kind, 'rope')
  assert.equal(p.climbing.caught.freeFall.amount, 1)
  const before = athletePose(p).head
  stepPlayer(p, NEUTRAL_INPUT, STEP, [], { ropes: [rope], ladders: [] })
  assert.equal(p.freeFall, null)
  const after = athletePose(p).head
  assert.ok(distance(before, after) < 4, 'clearing live flight does not replace the captured prone pose')
})
