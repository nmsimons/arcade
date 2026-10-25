import test from 'node:test'
import assert from 'node:assert/strict'
import { athletePose } from '../src/games/jumping/athlete.ts'
import { createPlayer, NEUTRAL_INPUT, respawn, STEP, stepPlayer, TUNING } from '../src/games/jumping/model.ts'
import { repulsePlayer } from '../src/games/jumping/actorImpulse.ts'
import { mirrorPlatform } from '../src/games/jumping/gravityFrame.ts'
import { createImpactRagdoll, stepImpactRagdoll } from '../src/games/jumping/impactRagdoll.ts'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { blankTrial } from '../src/games/jumping/level.ts'
import { createGravityField, updateGravityField } from '../src/games/jumping/gravity.ts'

const floor = [{ x: -3000, y: 1400, w: 6000, h: 100 }]
function lengths(pose) {
  for (const name of ['frontArm', 'backArm', 'frontLeg', 'backLeg']) {
    const limb = pose[name], leg = name.endsWith('Leg')
    const upper = Math.hypot(limb.joint[0] - limb.root[0], limb.joint[1] - limb.root[1], limb.jointDepth ?? 0)
    const lower = Math.hypot(limb.end[0] - limb.joint[0], limb.end[1] - limb.joint[1], (limb.endDepth ?? 0) - (limb.jointDepth ?? 0))
    assert.ok(Math.abs(upper - (leg ? 15 : 10)) < 1e-6, name + ' upper length')
    assert.ok(Math.abs(lower - (leg ? 14.5 : 9)) < 1e-6, name + ' lower length')
  }
}

test('hard landing recoil is visible, bounded and read-only, with identical normal and inverted motor trajectories', () => {
  for (const inverted of [false, true]) for (const direction of [-1, 1]) {
    const p = createPlayer({ x: 0, y: inverted ? -100 : 100 })
    Object.assign(p, { grounded: false, coyote: 0, facing: direction, inverted })
    const baseline = structuredClone(p), ground = inverted ? floor.map(mirrorPlatform) : floor
    const gravity = (inverted ? -1 : 1) * TUNING.gravity
    let sawImpact = false, maxRecoil = 0
    for (let frame = 0; frame < 350; frame++) {
      stepPlayer(p, NEUTRAL_INPUT, STEP, ground, undefined, undefined, undefined, undefined, gravity)
      stepPlayer(baseline, NEUTRAL_INPUT, STEP, ground, undefined, undefined, undefined, undefined, gravity)
      baseline.ragdoll = null
      for (const name of ['x', 'y', 'vx', 'vy', 'grounded', 'facing']) assert.equal(p[name], baseline[name], name)
      const before = structuredClone(p), pose = athletePose(p)
      assert.deepEqual(p, before, 'rendering does not integrate physics')
      lengths(pose)
      if (p.ragdoll) {
        sawImpact = true
        assert.equal(p.ragdoll.kind, 'landing')
        assert.equal(p.grounded, true)
        assert.ok(pose.head[1] <= -6.2, 'the head stays outside support')
        const ordinary = athletePose(baseline)
        maxRecoil = Math.max(maxRecoil, Math.hypot(pose.frontLeg.end[0] - ordinary.frontLeg.end[0], pose.frontLeg.end[1] - ordinary.frontLeg.end[1]))
      }
    }
    assert.ok(sawImpact && maxRecoil > 4, 'hard impacts visibly articulate the limbs')
    assert.equal(p.ragdoll, null)
    assert.equal(p.freeFall, null)
  }
})

test('short drops and light shoves do not ragdoll; a strong impulse scales recoil with its strength', () => {
  const short = createPlayer({ x: 0, y: 1100 }); short.grounded = false
  for (let frame = 0; frame < 180; frame++) { stepPlayer(short, NEUTRAL_INPUT, STEP, floor); assert.equal(short.ragdoll, null) }
  repulsePlayer(short, [.3, 0]); assert.equal(short.ragdoll, null)
  const pose = athletePose(short)
  const weak = createImpactRagdoll(pose, 1, 'repulsor', 800, 0), strong = createImpactRagdoll(pose, 1, 'repulsor', 1300, 0)
  stepImpactRagdoll(weak, STEP); stepImpactRagdoll(strong, STEP)
  assert.ok(Math.abs(strong.joints.frontShoulder.angle) > Math.abs(weak.joints.frontShoulder.angle))
})

test('repulsor recoil survives a wall impact without body penetration or growing energy', () => {
  for (const inverted of [false, true]) for (const direction of [-1, 1]) {
    const p = createPlayer({ x: 0, y: inverted ? -500 : 500 })
    Object.assign(p, { grounded: false, inverted, facing: direction })
    const world = [{ x: direction > 0 ? 100 : -120, y: -100, w: 20, h: 1500 }]
    const ground = inverted ? world.map(mirrorPlatform) : world
    repulsePlayer(p, [direction, 0])
    assert.equal(p.ragdoll.kind, 'repulsor')
    let maxSpeed = 0
    for (let frame = 0; frame < 100; frame++) {
      stepPlayer(p, NEUTRAL_INPUT, STEP, ground, undefined, undefined, undefined, undefined, (inverted ? -1 : 1) * TUNING.gravity)
      const pose = athletePose(p); lengths(pose)
      assert.ok((p.x + pose.head[0] * p.facing) * direction + 6.2 <= 100.06)
      if (p.ragdoll) for (const joint of Object.values(p.ragdoll.joints)) {
        assert.ok(Number.isFinite(joint.angle) && Math.abs(joint.angle) <= 1)
        maxSpeed = Math.max(maxSpeed, Math.abs(joint.speed))
      }
    }
    assert.ok(maxSpeed < 24)
    assert.equal(p.ragdoll, null)
  }
})

test('jump, water entry, a real rope catch and respawn release recoil immediately', () => {
  for (const action of ['jump', 'water', 'rope', 'respawn']) {
    const p = createPlayer({ x: 0, y: 1400 })
    repulsePlayer(p, [1, 0]); assert.ok(p.ragdoll)
    if (action === 'respawn') respawn(p)
    else if (action === 'jump') stepPlayer(p, { ...NEUTRAL_INPUT, jump: true }, STEP, floor)
    else if (action === 'water') stepPlayer(p, NEUTRAL_INPUT, STEP, [], undefined, undefined, undefined, undefined, TUNING.gravity, 1,
      { floatDrag: 1, swimStrength: 1, swimDepth: 1, swimAcceleration: 0, orientationGravity: TUNING.gravity })
    else {
      p.grounded = false; p.grabCooldown = 0; p.vx = 0
      stepPlayer(p, NEUTRAL_INPUT, STEP, [], { ropes: [{ x: 0, y: 0, length: 1800 }], ladders: [] })
      assert.equal(p.climbing?.kind, 'rope')
    }
    assert.equal(p.ragdoll, null, action)
  }
})

test('a rope catch retains the loose outgoing rig after live recoil is released', () => {
  const p = createPlayer({ x: 300, y: 500 })
  p.grounded = false
  repulsePlayer(p, [1, 0])
  for (let i = 0; i < 12; i++) stepPlayer(p, NEUTRAL_INPUT, STEP)
  p.grabCooldown = 0; p.vx = 0
  const source = athletePose(p), ropes = { ropes: [{ x: p.x, y: 0, length: 1800 }], ladders: [] }
  stepPlayer(p, NEUTRAL_INPUT, STEP, [], ropes)
  assert.equal(p.climbing?.kind, 'rope')
  assert.ok(p.climbing.caught.ragdoll)
  assert.equal(p.ragdoll, null)
  const caught = athletePose(p)
  assert.ok(Math.hypot(caught.head[0] - source.head[0], caught.head[1] - source.head[1]) < 6)
  lengths(caught)
})

test('rapid repeat hits add bounded momentum without restarting recovery from a displaced rig', () => {
  const p = createPlayer({ x: 0, y: 500 }); p.grounded = false
  repulsePlayer(p, [1, 0])
  for (let i = 0; i < 12; i++) stepPlayer(p, NEUTRAL_INPUT, STEP)
  const motion = p.ragdoll, time = motion.time, source = structuredClone(motion.source)
  for (let i = 0; i < 20; i++) repulsePlayer(p, [i % 2 ? -1 : 1, 0])
  assert.equal(p.ragdoll, motion)
  assert.equal(motion.time, time)
  assert.deepEqual(motion.source, source)
  assert.ok(Object.values(motion.joints).every(joint => Math.abs(joint.speed) <= 24))
  for (let i = 0; i < 80; i++) { stepPlayer(p, NEUTRAL_INPUT, STEP); lengths(athletePose(p)) }
  assert.equal(p.ragdoll, null)
})

test('steering against a repulsor hit gathers the loose rig into a continuous supported turn', () => {
  for (const inverted of [false, true]) for (const direction of [-1, 1]) for (const dt of [STEP, 1 / 30]) {
    const p = createPlayer({ x: 0, y: inverted ? -1400 : 1400 })
    Object.assign(p, { inverted, facing: direction })
    const ground = inverted ? floor.map(mirrorPlatform) : floor
    repulsePlayer(p, [direction, 0])
    let previous
    for (let frame = 0; frame < Math.ceil(1.2 / dt); frame++) {
      const input = { ...NEUTRAL_INPUT, move: frame * dt < .1 ? 0 : -direction }
      const turning = !!p.dryTurn?.recoil
      stepPlayer(p, input, dt, ground, undefined, undefined, undefined, undefined, (inverted ? -1 : 1) * TUNING.gravity)
      const pose = athletePose(p); lengths(pose)
      const current = [pose.hip, pose.waist, pose.shoulder, pose.head,
        ...[pose.frontArm, pose.backArm, pose.frontLeg, pose.backLeg].flatMap(limb => [limb.joint, limb.end])]
        .map(([x, y]) => [x * p.facing, y])
      if (previous && (turning || p.dryTurn?.recoil)) for (let i = 0; i < current.length; i++) assert.ok(Math.hypot(current[i][0] - previous[i][0], current[i][1] - previous[i][1]) < 750 * dt,
        `joint ${i}, frame ${frame}, dt ${dt}: the recoil handoff cannot snap`)
      previous = current
    }
    assert.equal(p.ragdoll, null)
    assert.equal(p.dryTurn, null)
    assert.ok(p.vx * direction < 0 && p.grounded)
  }
})

test('a working push takes over recoil with its real palms and supported feet', () => {
  for (const blocked of [false, true]) for (const direction of [-1, 1]) {
    const level = blankTrial()
    level.entrance = { x: 540 - direction * 65.5, y: 920 }
    level.props = [{ kind: 'box', x: 540, y: 920, size: 80 }]
    level.platforms = blocked ? [{ x: direction === 1 ? 580 : 380, y: 650, w: 120, h: 270 }] : []
    const run = createRun(level), p = run.player
    p.facing = direction
    for (let i = 0; i < 100; i++) stepRun(run, NEUTRAL_INPUT)
    repulsePlayer(p, [direction, 0])
    assert.ok(p.ragdoll)
    let contacts = 0
    const from = run.props[0].x
    for (let frame = 0; frame < 90; frame++) {
      stepRun(run, { ...NEUTRAL_INPUT, move: direction })
      if (!p.contacts?.push?.hands || !p.pushing?.palms) continue
      contacts++
      assert.equal(p.ragdoll, null, 'working contacts own the rig as soon as they apply force')
      const pose = athletePose(p)
      lengths(pose)
      assert.ok(pose.frontLeg.planted || pose.backLeg.planted, 'a loaded push has a supporting shoe')
      for (const [index, arm] of [pose.frontArm, pose.backArm].entries()) {
        const palm = p.pushing.palms[index]
        assert.ok(Math.hypot(p.x + arm.hand[0] * p.facing - palm.x - palm.nx * 1.6,
          p.y + arm.hand[1] - palm.y - palm.ny * 1.6) < .1, 'the visible palm stays on its working contact')
      }
    }
    assert.ok(contacts > 30)
    assert.ok(blocked ? Math.abs(run.props[0].x - from) < 1 : (run.props[0].x - from) * direction > 5)
  }
})

test('recoil cannot hyperextend a supported knee in either gravity frame or facing', () => {
  for (const inverted of [false, true]) for (const direction of [-1, 1]) for (const dt of [STEP, 1 / 30]) {
    const p = createPlayer({ x: 0, y: inverted ? -1400 : 1400 })
    Object.assign(p, { inverted, facing: direction })
    const ground = inverted ? floor.map(mirrorPlatform) : floor
    const gravity = (inverted ? -1 : 1) * TUNING.gravity
    for (let i = 0; i < 60; i++) stepPlayer(p, NEUTRAL_INPUT, dt, ground, undefined, undefined, undefined, undefined, gravity)
    repulsePlayer(p, [direction, 0])
    let samples = 0
    for (let frame = 0; frame < Math.ceil(.6 / dt); frame++) {
      stepPlayer(p, NEUTRAL_INPUT, dt, ground, undefined, undefined, undefined, undefined, gravity)
      if (!p.ragdoll) continue
      samples++
      const pose = athletePose(p)
      lengths(pose)
      for (const leg of [pose.frontLeg, pose.backLeg]) {
        const upper = [leg.joint[0] - leg.root[0], leg.joint[1] - leg.root[1]]
        const lower = [leg.end[0] - leg.joint[0], leg.end[1] - leg.joint[1]]
        assert.ok(upper[0] * lower[1] - upper[1] * lower[0] >= -1e-6,
          `frame ${frame}, dt ${dt}: the knee keeps its forward bend`)
      }
    }
    assert.ok(samples > 10)
  }
})

test('entering reverse gravity transfers the loose pose to the turn in the same tick', () => {
  for (const inverted of [false, true]) for (const direction of [-1, 1]) for (const dt of [STEP, 1 / 30]) {
    const field = createGravityField()
    updateGravityField(field, [{ id: 'flip', x: -3000, y: -3000, w: 6000, h: 6000,
      gravity: inverted ? 1 : -1, power: 'always' }], new Map(), true)
    const p = createPlayer({ x: 0, y: inverted ? -500 : 500 })
    Object.assign(p, { grounded: false, inverted, facing: direction })
    repulsePlayer(p, [direction, 0])
    for (let i = 0; i < Math.round(.3 / dt); i++) {
      stepPlayer(p, NEUTRAL_INPUT, dt, [], undefined, undefined, undefined, undefined, (inverted ? -1 : 1) * TUNING.gravity)
    }
    assert.ok(p.ragdoll)
    stepPlayer(p, NEUTRAL_INPUT, dt, [], undefined, undefined, undefined, field)
    assert.ok(p.releaseTurn)
    assert.equal(p.ragdoll, null, 'the gravity turn is the sole owner of the captured pose')
    const pose = athletePose(p), source = p.releaseTurn.pose
    const points = rig => [rig.hip, rig.waist, rig.shoulder, rig.head,
      ...[rig.frontArm, rig.backArm, rig.frontLeg, rig.backLeg].flatMap(limb => [limb.joint, limb.end])]
    points(pose).forEach((point, i) => assert.ok(Math.hypot(point[0] - points(source)[i][0], point[1] - points(source)[i][1]) < 1,
      'the first turn frame displays its captured rig without another layer of recoil'))
    lengths(pose)
  }
})

test('distant solids do not change loose clearance near a real floor and wall', () => {
  for (const inverted of [false, true]) for (const direction of [-1, 1]) for (const kind of ['landing', 'repulsor']) {
    const shapes = [...floor, { x: direction > 0 ? 100 : -120, y: 0, w: 20, h: 1400 }]
    const distant = Array.from({ length: 50 }, (_, i) => ({ x: 5000 + i * 100, y: 0, w: 20, h: 1400 }))
    const near = inverted ? shapes.map(mirrorPlatform) : shapes
    const all = [...near, ...(inverted ? distant.map(mirrorPlatform) : distant)]
    const p = createPlayer({ x: direction * 60, y: (inverted ? -1 : 1) * (kind === 'landing' ? 100 : 500) })
    Object.assign(p, { inverted, facing: direction, grounded: false, coyote: 0, terrain: near })
    const extended = structuredClone(p)
    extended.terrain = all
    if (kind === 'repulsor') { repulsePlayer(p, [direction, 0]); repulsePlayer(extended, [direction, 0]) }
    let sawRecoil = false
    for (let frame = 0; frame < 300; frame++) {
      const gravity = (inverted ? -1 : 1) * TUNING.gravity
      stepPlayer(p, NEUTRAL_INPUT, STEP, near, undefined, undefined, undefined, undefined, gravity)
      stepPlayer(extended, NEUTRAL_INPUT, STEP, all, undefined, undefined, undefined, undefined, gravity)
      sawRecoil ||= !!p.ragdoll
      assert.deepEqual(athletePose(extended), athletePose(p), 'only reachable surfaces can change the final rig')
    }
    assert.ok(sawRecoil, `${kind}, facing ${direction}, inverted ${inverted}: exercise loose clearance`)
  }
})
