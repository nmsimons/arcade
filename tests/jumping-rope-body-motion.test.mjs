import test from 'node:test'
import assert from 'node:assert/strict'
import { createPlayer, stepPlayer, NEUTRAL_INPUT, TUNING } from '../src/games/jumping/model.ts'
import { climbRoot, ropeGripDistance, ropeImpulse, ropePoint } from '../src/games/jumping/climbables.ts'
import { athletePose } from '../src/games/jumping/athlete.ts'
import { stepRopeBodyMotion } from '../src/games/jumping/ropeBodyMotion.ts'
import { createGravityField, updateGravityField } from '../src/games/jumping/gravity.ts'
import { finishGravityTurn } from '../src/games/jumping/ropeGravity.ts'
import { bodyPolygon, polygonIntersects } from '../src/games/jumping/geometry.ts'

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
function scene(facing = 1, dt = 1 / 120, terrain = []) {
  const p = createPlayer({ x: 500 - facing * 10, y: 480 }), field = createGravityField()
  const world = { ladders: [], ropes: [{ x: 500, y: 100, length: 600, segments: 75 }] }
  const plate = { id: 'g', x: -2000, y: -2000, w: 5000, h: 5000, gravity: 1, power: 'always' }
  Object.assign(p, { grounded: false, facing })
  let revision = 0
  const gravity = value => { plate.gravity = value; updateGravityField(field, [plate], new Map(), true, ++revision) }
  gravity(1)
  const tick = (input = {}) => stepPlayer(p, { ...NEUTRAL_INPUT, ...input }, dt, terrain, world, undefined, undefined, field)
  for (let i = 0; i < 1 / dt; i++) tick()
  assert.equal(p.climbing?.kind, 'rope')
  return { p, gravity, tick }
}
function rig(p) {
  const pose = athletePose(p), limbs = [pose.frontArm, pose.backArm, pose.frontLeg, pose.backLeg]
  for (const [i, limb] of limbs.entries()) {
    assert.ok(Math.abs(Math.hypot(distance(limb.root, limb.joint), limb.jointDepth ?? 0) - (i < 2 ? 10 : 15)) < 1e-6)
    assert.ok(Math.abs(Math.hypot(distance(limb.joint, limb.end), (limb.jointDepth ?? 0) - (limb.endDepth ?? 0)) - (i < 2 ? 9 : 14.5)) < 1e-6)
  }
  assert.ok(Math.abs(distance(pose.shoulder, pose.waist) - 10.1) < 1e-6)
  assert.ok(Math.abs(distance(pose.waist, pose.hip) - 6.5) < 1e-6)
  const worldPoint = ([x, y]) => [p.x + x * p.facing, p.y + y * (p.inverted ? -1 : 1)]
  const grip = ropePoint(p.climbing.rope, ropeGripDistance(p.climbing))
  for (const arm of limbs.slice(0, 2)) assert.ok(distance(worldPoint(arm.end), grip) < 1.2, 'the hand retains its material grip')
  return { pose, grip, points: [pose.hip, pose.waist, pose.shoulder, pose.head, ...limbs.flatMap(l => [l.joint, l.end])].map(worldPoint) }
}

test('a resting hang has loaded but soft elbows, bent knees and staggered feet without idle fidgeting', () => {
  for (const facing of [-1, 1]) {
    const { p, tick } = scene(facing), { pose } = rig(p)
    for (const arm of [pose.frontArm, pose.backArm]) {
      assert.ok(distance(arm.root, arm.end) > 18 && distance(arm.root, arm.end) < 18.6)
      assert.ok(arm.end[1] < pose.head[1] - 8)
    }
    for (const leg of [pose.frontLeg, pose.backLeg]) assert.ok(distance(leg.root, leg.end) < 28)
    assert.ok(Math.abs(pose.frontLeg.end[1] - pose.backLeg.end[1]) > 1)
    assert.ok(pose.frontLeg.end[0] < pose.backLeg.end[0], 'relaxed ankles do not cross')
    for (let i = 0; i < 240; i++) tick()
    const before = rig(p).pose
    for (let i = 0; i < 120; i++) tick()
    const after = rig(p).pose
    assert.ok(distance(before.hip, after.hip) < .01 && distance(before.frontLeg.end, after.frontLeg.end) < .01)
  }
})

test('a moving rope produces passive hip and leg follow-through with neutral controls', () => {
  for (const facing of [-1, 1]) {
    const { p, tick } = scene(facing), rope = p.climbing.rope
    ropeImpulse(rope, ropeGripDistance(p.climbing), facing * 250, 0, 1 / 120)
    let bend = 0, lag = 0
    for (let i = 0; i < 200; i++) {
      tick(); rig(p)
      assert.equal(p.climbing.lean, 0, 'no input-driven pump')
      const m = p.climbing.bodyMotion
      bend = Math.max(bend, Math.abs(m.angle)); lag = Math.max(lag, Math.abs(m.legs - m.angle))
    }
    assert.ok(bend > .08, 'rope acceleration bends the body without input')
    assert.ok(lag > .03, 'the legs settle later than the torso')
  }
})

test('steady travel settles the body and zero gravity softens the load at 120 and 30 Hz', () => {
  const results = []
  for (const dt of [1 / 120, 1 / 30]) {
    const { p } = scene(1, dt), c = p.climbing
    delete c.bodyMotion
    for (let i = 0; i <= .5 / dt; i++) stepRopeBodyMotion(c, Math.min(i * dt, .2) * 1000, 0, TUNING.gravity, dt)
    assert.ok(c.bodyMotion.angle < -.08, 'the hips lag a rightward acceleration')
    results.push(c.bodyMotion.angle)
    const angle = c.bodyMotion.angle
    for (let i = 0; i < 1 / dt; i++) stepRopeBodyMotion(c, 200, 0, 0, dt)
    assert.ok(Math.abs(c.bodyMotion.angle) > .005 && Math.abs(c.bodyMotion.angle) < Math.abs(angle), 'weak gravity permits damped drift')
    const reach = distance(athletePose(p).frontArm.root, athletePose(p).frontArm.end)
    assert.ok(reach < 17.8, 'near-zero load relaxes the elbows')
    for (let i = 0; i < 4 / dt; i++) stepRopeBodyMotion(c, 200, 0, TUNING.gravity, dt)
    assert.ok(Math.abs(c.bodyMotion.angle) < .001 && Math.abs(c.bodyMotion.legs) < .001, 'constant velocity does not sustain a lean')
  }
  assert.ok(Math.abs(results[0] - results[1]) < .035, 'the follow-through is comparable at different update rates')
})

test('gravity reversals gather and unfold the limbs, retain their lengths and allow interrupted turns', () => {
  for (const dt of [1 / 120, 1 / 30]) for (const facing of [-1, 1]) {
    const { p, gravity, tick } = scene(facing, dt), rest = rig(p).pose
    const span = distance(rest.hip, rest.backLeg.end)
    gravity(-1)
    let folded = false, curved = false, previous = rig(p)
    for (let i = 0; i < 1 / dt; i++) {
      tick(); const current = rig(p), { pose, points, grip } = current
      folded ||= distance(pose.hip, pose.backLeg.end) < span - 8
      const a = [pose.waist[0] - pose.shoulder[0], pose.waist[1] - pose.shoulder[1]]
      const b = [pose.hip[0] - pose.waist[0], pose.hip[1] - pose.waist[1]]
      curved ||= Math.abs(a[0] * b[1] - a[1] * b[0]) > 10
      for (let j = 0; j < points.length; j++) {
        const travel = distance(points[j].map((v, k) => v - grip[k]), previous.points[j].map((v, k) => v - previous.grip[k]))
        assert.ok(travel < 1000 * dt, `joints stay continuous through reflection: ${dt}, ${facing}, step ${i}, joint ${j}, travel ${travel}`)
      }
      previous = current
    }
    assert.ok(folded && curved, 'the turn articulates through the knees and spine')
    assert.equal(p.inverted, true)
    assert.ok(distance(athletePose(p).hip, athletePose(p).backLeg.end) > span - 5, 'the legs extend after the turn while retaining load-dependent softness')
    gravity(1)
    for (let i = 0; i < .2 / dt; i++) { tick(); rig(p) }
    gravity(-1)
    for (let i = 0; i < 1 / dt; i++) { tick(); rig(p) }
    assert.equal(p.inverted, true, 'a field change can reverse an unfinished turn')
  }
})

test('a downward-accelerating grip unloads the arms instead of keeping the hanging pose stretched', () => {
  for (const dt of [1 / 120, 1 / 30]) {
    const { p } = scene(1, dt), c = p.climbing
    delete c.bodyMotion
    for (let i = 0; i < .6 / dt; i++) stepRopeBodyMotion(c, 0, i * dt * 2000, TUNING.gravity, dt)
    const pose = athletePose(p)
    assert.ok(distance(pose.frontArm.root, pose.frontArm.end) < 17.8)
    assert.ok(distance(pose.backLeg.root, pose.backLeg.end) < 23, 'the knees soften as the grip drops away')
  }
})

test('finishing a gravity turn retains a loaded passive pose without a snap', () => {
  for (const facing of [-1, 1]) {
    const { p } = scene(facing), c = p.climbing
    Object.assign(c.bodyMotion, { angle: .3, velocity: .4, legs: .4, legVelocity: -.2 })
    c.swing = .7
    c.turn = { angle: facing * Math.PI, target: facing * Math.PI, grip: ropeGripDistance(c) }
    ;[p.x, p.y] = climbRoot(c, p.facing)
    const before = rig(p).points
    finishGravityTurn(p)
    assert.equal(c.swing, .7, 'changing the pose frame cannot supply a physical pumping input')
    const after = rig(p).points
    for (let j = 0; j < before.length; j++) assert.ok(distance(before[j], after[j]) < 2.1)
    const snapshot = structuredClone(p)
    for (let i = 0; i < 5; i++) athletePose(p)
    assert.deepEqual(p, snapshot, 'rendering cannot advance or mutate the passive motion')
  }
})

test('passive settling cannot manufacture release momentum', () => {
  const { p, tick } = scene()
  ropeImpulse(p.climbing.rope, ropeGripDistance(p.climbing), 220, 0, 1 / 120)
  for (let i = 0; i < 40; i++) tick()
  const release = (angle, jump) => {
    const copy = structuredClone(p)
    Object.assign(copy.climbing.bodyMotion, { angle, velocity: angle * 3, legs: -angle, legVelocity: angle * 4 })
    const world = { ladders: [], ropes: copy.ropes.map(r => r.definition) }
    stepPlayer(copy, { ...NEUTRAL_INPUT, detach: !jump, jump }, 1 / 120, [], world)
    return [copy.vx, copy.vy]
  }
  for (const jump of [false, true]) assert.deepEqual(release(-.3, jump), release(.3, jump))
})

test('passive articulation and a blocked turn keep the body and visible rig inside a narrow passage', () => {
  for (const dt of [1 / 120, 1 / 30]) for (const facing of [-1, 1]) {
    const terrain = [{ x: 400, y: -2000, w: 76, h: 4000 }, { x: 524, y: -2000, w: 100, h: 4000 }]
    const { p, tick, gravity } = scene(facing, dt, terrain)
    Object.assign(p.climbing.bodyMotion, { angle: facing * .3, velocity: facing, legs: facing * .4 })
    gravity(-1)
    for (let i = 0; i < 2 / dt; i++) {
      tick(); const { points } = rig(p)
      const hull = bodyPolygon(p.x, p.y, 62, p.inverted ? -1 : 1, p.climbing.turn?.angle ?? 0)
      assert.ok(!terrain.some(b => polygonIntersects(hull, b, .01)))
      for (const [j, point] of points.entries()) {
        const radius = j === 3 ? 6.2 : 2.2
        assert.ok(point[0] - radius > 476 && point[0] + radius < 524, 'the visible head and limbs clear both walls')
      }
    }
    assert.ok(p.climbing.turn, 'the turn waits for clearance')
    tick({ detach: true }); assert.equal(p.climbing, null, 'release remains available while blocked')
  }
})
