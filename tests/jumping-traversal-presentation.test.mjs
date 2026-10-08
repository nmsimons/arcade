import test from 'node:test'
import assert from 'node:assert/strict'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { blankTrial } from '../src/games/jumping/level.ts'
import { createPlayer, NEUTRAL_INPUT, playerState, STEP, stepPlayer, TUNING } from '../src/games/jumping/model.ts'
import { athletePose, handOutline } from '../src/games/jumping/athlete.ts'
import { nearestBoundary, pointInside } from '../src/games/jumping/geometry.ts'
import { mirrorPlatform, mirrorPlayerState } from '../src/games/jumping/gravityFrame.ts'
import { anticipatePush, staticContactWorld } from '../src/games/jumping/playerContacts.ts'
import { JumpingAudioState } from '../src/games/jumping/audioState.ts'
import { FOOT_CONTACT, footPoint } from '../src/games/jumping/footwork.ts'
import { groundAt } from '../src/games/jumping/terrain.ts'

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

test('a blocked brace adapts to narrow real footing and stays settled through recontact', () => {
  for (const direction of [-1, 1]) for (const width of [16, 24, 40, 80, 'concave']) {
    const rect = (x, y, w, h) => ({ x: direction === 1 ? x : 900 - x - w, y, w, h })
    const span = width === 'concave' ? 16 : width
    const footing = rect(414.5 - span / 2, 500, span, 20)
    const platform = width === 'concave' ? { ...rect(374.5, 500, 80, 70),
      polygon: [[0, 35], [32, 35], [32, 0], [48, 0], [48, 35], [80, 35], [80, 70], [0, 70]] } : footing
    const level = { ...blankTrial(), width: 900, height: 700, floor: 650,
      spawn: { x: direction === 1 ? 414.5 : 485.5, y: 500 },
      goal: { x: direction === 1 ? 100 : 800, y: 650, flipX: direction === -1 },
      platforms: [platform, rect(440, 500, 80, 20), rect(520, 350, 100, 300)],
      props: [{ kind: 'box', x: direction === 1 ? 480 : 420, y: 500, size: 80 }] }
    const run = createRun(level)
    let supported = 0
    for (let tick = 0; tick < 360; tick++) {
      stepRun(run, { ...NEUTRAL_INPUT, move: direction })
      const p = run.player
      assert.equal(p.grounded, true, `${width}: the actual motor remains on its narrow ledge`)
      for (const foot of p.footwork.feet) if (foot.planted) {
        assert.ok(foot.anchorX >= footing.x - .02 && foot.anchorX <= footing.x + span + .02,
          `${width}: a force-bearing brace anchor cannot be planted beyond the actual support`)
        assert.ok(Math.abs(foot.anchorY - 500) < .02)
        supported++
      }
      assert.ok(p.footwork.feet.some(foot => foot.planted), 'stance establishment keeps a supporting foot')
      const pose = athletePose(p)
      limbLengths(pose)
      for (const [index, leg] of [pose.frontLeg, pose.backLeg].entries()) if (p.footwork.feet[index].planted) {
        let gap = Infinity
        for (const point of FOOT_CONTACT) {
          const sole = footPoint(point, leg.footAngle * leg.footFacing, leg.toeAngle * leg.footFacing)
          const [x, y] = worldPoint(p, [leg.end[0] + sole[0] * leg.footFacing * (1 - (leg.rear ?? 0)), leg.end[1] + sole[1]])
          const surface = groundAt(p.terrain, x, p.y)
          if (surface) {
            const distance = surface.y - y
            assert.ok(distance >= -.02, 'the drawn sole does not sink through its footing')
            gap = Math.min(gap, distance)
          }
        }
        assert.ok(gap <= .02, 'a loaded visible sole actually touches the narrow footing')
      }
    }
    assert.ok(supported > 360)
    assert.ok(run.player.footwork.feet.every(foot => foot.planted), 'both feet finish establishing their supported base')
    assert.ok(Math.abs(run.player.footwork.feet[0].anchorX - run.player.footwork.feet[1].anchorX) >= (span >= 24 ? 8 : 7) - .02,
      `${direction}/${width}: the base retains useful stagger within its actual available tread (${run.player.footwork.feet.map(foot => foot.anchorX)})`)
    const anchors = run.player.footwork.feet.map(foot => [foot.anchorX, foot.anchorY])
    advance(run, 1200, { move: direction })
    assert.deepEqual(run.player.footwork.feet.map(foot => [foot.anchorX, foot.anchorY]), anchors,
      'ten seconds of blocked effort does not restart stance adjustment')
    for (let cycle = 0; cycle < 3; cycle++) {
      for (let tick = 0; tick < 13; tick++) {
        advance(run, 1, { move: tick === 0 ? 0 : direction })
        assert.ok(run.player.footwork.feet.every(foot => foot.planted), 'briefly easing hand pressure does not lift a settled foot')
      }
      assert.deepEqual(run.player.footwork.feet.map(foot => [foot.anchorX, foot.anchorY]), anchors,
        'a brief release and recontact does not repeatedly widen or shuffle the brace')
    }
    advance(run, 120, { move: 0 })
    assert.ok(run.player.footwork.feet.every(foot => foot.planted), 'full release completes normal resting steps')
    assert.ok(run.player.footwork.feet.every(foot => Math.abs(foot.anchorX - run.player.x) <= 2.02),
      'full release returns the base under the quiet body')
    stepRun(run, { ...NEUTRAL_INPUT, jump: true })
    assert.equal(run.player.grounded, false, 'stance presentation does not delay a fresh jump')
    assert.ok(run.player.vy < 0)
    assert.equal(run.player.footwork, null)
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

test('prop motion starts with both palms on the face, including fresh low and tall encounters', () => {
  for (const direction of [-1, 1]) for (const kind of ['box', 'ball']) for (const size of [30, 80]) {
    const level = blankTrial()
    level.spawn = { x: 540 - direction * (size / 2 + 25.5), y: 920 }
    level.props = [{ kind, x: 540, y: 920, size }]
    const run = createRun(level)
    for (let frame = 0; frame < 30; frame++) {
      stepRun(run, { ...NEUTRAL_INPUT, move: direction })
      if (Math.abs(run.props[0].x - 540) <= .5) continue
      const p = run.player, pose = athletePose(p)
      assert.ok(p.pushing?.palms, 'moving a prop establishes a visible working contact')
      for (const [index, arm] of [pose.frontArm, pose.backArm].entries()) {
        const palm = p.pushing.palms[index], hand = worldPoint(p, arm.hand)
        assert.ok(Math.hypot(hand[0] - palm.x - palm.nx * 1.6, hand[1] - palm.y - palm.ny * 1.6) < .5,
          `${kind} ${size}, direction ${direction}, frame ${frame}: the palm leads the shove`)
      }
      limbLengths(pose)
    }
  }
})

test('short-object pushing hinges over working legs rather than staying in a full squat', () => {
  for (const direction of [-1, 1]) for (const kind of ['box', 'ball']) {
    const level = blankTrial()
    level.spawn = { x: 540 - direction * 40.5, y: 920 }
    level.props = [{ kind, x: 540, y: 920, size: 30 }]
    const run = createRun(level), supports = new Set(), ankles = []
    advance(run, 120, { move: direction })
    for (let frame = 0; frame < 240; frame++) {
      stepRun(run, { ...NEUTRAL_INPUT, move: direction })
      const p = run.player, pose = athletePose(p)
      assert.ok(pose.hip[1] < -23, 'the working pelvis leaves room for a leg drive')
      assert.ok(pose.shoulder[0] - pose.hip[0] > 9, 'the torso hinges toward the low grips')
      assert.ok(p.footwork.feet.some(foot => foot.planted), 'one foot supports each working step')
      supports.add(p.footwork.feet.findIndex(foot => foot.planted))
      ankles.push(pose.frontLeg.end[0] - pose.backLeg.end[0])
      clearPoint(p, pose.head, 6.2, run.platforms)
      limbLengths(pose)
    }
    assert.ok(supports.has(0) && supports.has(1))
    assert.ok(Math.min(...ankles) < -3 && Math.max(...ankles) > 3, 'the advancing foot passes its partner')
  }
})

test('the first playable frame has real idle support without advancing the challenge', () => {
  const level = blankTrial(), run = createRun(level), p = run.player, pose = athletePose(p)
  assert.equal(run.elapsed, 0)
  assert.equal(run.started, false)
  assert.ok(p.contacts?.support, 'the ready frame already knows its support')
  assert.ok(p.footwork?.feet.every(foot => foot.planted))
  assert.ok(Math.abs(pose.frontLeg.end[0] - pose.backLeg.end[0]) >= 3, 'idle soles are distinct')
  assert.ok(Math.hypot(...pose.frontArm.end.map((v, i) => v - pose.backArm.end[i])) > 6, 'relaxed hands clear the torso silhouette')
  const unsupported = blankTrial()
  unsupported.spawn.y -= 100
  const airborne = createRun(unsupported).player
  assert.equal(airborne.grounded, false)
  assert.equal(airborne.footwork, null)
  assert.ok(athletePose(airborne).frontLeg.planted === false)
})

test('a running approach reaches before the shove and cannot anticipate through a wall', () => {
  for (const direction of [-1, 1]) for (const kind of ['box', 'ball']) {
    const level = blankTrial()
    level.spawn = { x: 540 - direction * 140, y: 920 }
    level.props = [{ kind, x: 540, y: 920, size: 80 }]
    const run = createRun(level)
    let prepared = false, loaded = false
    for (let frame = 0; frame < 80; frame++) {
      stepRun(run, { ...NEUTRAL_INPUT, move: direction })
      const p = run.player
      if (p.pushing?.ready && !p.pushing.effort) {
        prepared = true
        assert.ok(Math.abs(run.props[0].x - 540) < .001, 'the approaching hands do not apply force')
      }
      if (p.pushing?.effort && Math.abs(run.props[0].x - 540) > .5) {
        loaded = true
        const pose = athletePose(p)
        for (const [index, arm] of [pose.frontArm, pose.backArm].entries()) {
          const palm = p.pushing.palms[index], hand = worldPoint(p, arm.hand)
          assert.ok(Math.hypot(hand[0] - palm.x - palm.nx * 1.6, hand[1] - palm.y - palm.ny * 1.6) < .5)
        }
      }
    }
    assert.ok(prepared && loaded, 'the approach includes preparation followed by a real shove')
  }
  const p = createPlayer({ x: 500, y: 920 }), prop = { kind: 'box', x: 600, y: 920, size: 80, angle: 0 }
  const wall = { x: 530, y: 800, w: 8, h: 120 }, floor = { x: 0, y: 920, w: 1000, h: 40 }
  const world = staticContactWorld([floor, wall, { x: 560, y: 840, w: 80, h: 80 }])
  world.colliders[2].prop = prop
  assert.equal(anticipatePush(p, { ...NEUTRAL_INPUT, move: 1 }, world), null)
})

test('held movement springs a long-fall landing into the actual supported gait', () => {
  const floor = [{ x: -2000, y: 1400, w: 6000, h: 100 }]
  for (const direction of [-1, 1]) {
    const p = createPlayer({ x: 500, y: 100 })
    p.grounded = false; p.coyote = 0
    for (let i = 0; i < 400 && !p.grounded; i++) stepPlayer(p, { ...NEUTRAL_INPUT, move: direction }, STEP, floor)
    const landedX = p.x
    let supported = false
    for (let i = 0; i < 24; i++) {
      stepPlayer(p, { ...NEUTRAL_INPUT, move: direction }, STEP, floor)
      const pose = athletePose(p)
      if (!p.freeFall) supported ||= pose.frontLeg.planted || pose.backLeg.planted
      limbLengths(pose)
    }
    assert.ok(Math.abs(p.x - landedX - direction * 82) < .01, 'the motor remains immediately responsive')
    assert.equal(p.freeFall, null, 'the spring hands off promptly instead of skating prone')
    assert.ok(supported, 'the final gait uses visible real support')
    const pose = athletePose(p)
    assert.ok(pose.hip[1] - pose.shoulder[1] > 10 && pose.head[1] < -35)
  }
})

test('movement introduced throughout get-up keeps its joints continuous and its step audio honest', () => {
  const floor = [{ x: -2000, y: 1400, w: 6000, h: 100 }]
  const joints = pose => [pose.hip, pose.shoulder, pose.head,
    ...[pose.frontArm, pose.backArm, pose.frontLeg, pose.backLeg].flatMap(limb => [limb.joint, limb.end])]
  for (const recovery of [.05, .3, .6, .8]) {
    const p = createPlayer({ x: 500, y: 100 }), audio = new JumpingAudioState()
    p.grounded = false; p.coyote = 0
    for (let i = 0; i < 400 && !p.grounded; i++) stepPlayer(p, NEUTRAL_INPUT, STEP, floor)
    while (p.freeFall.recovery < recovery) stepPlayer(p, NEUTRAL_INPUT, STEP, floor)
    audio.reset(p, null)
    let previous = joints(athletePose(p)), footsteps = 0
    for (let i = 0; i < 60; i++) {
      const recovering = !!p.freeFall
      stepPlayer(p, { ...NEUTRAL_INPUT, move: 1 }, STEP, floor)
      audio.step(p, null, STEP)
      const cues = audio.drain().cues
      if (p.freeFall) {
        assert.equal(playerState(p), 'Recovering')
        assert.ok(!cues.some(cue => cue.kind === 'footstep'))
      }
      footsteps += cues.filter(cue => cue.kind === 'footstep').length
      const pose = athletePose(p), current = joints(pose)
      if (recovering || p.freeFall) for (let j = 0; j < current.length; j++) assert.ok(Math.hypot(...current[j].map((v, k) => v - previous[j][k])) < 6,
        `recovery ${recovery}, frame ${i}, joint ${j} remains continuous`)
      limbLengths(pose); previous = current
    }
    assert.equal(p.freeFall, null)
    assert.ok(footsteps > 0, 'ordinary steps resume with the visible support gait')
  }
})

test('moving recovery preserves mirrored trajectories, crouch clearance, and a fresh jump', () => {
  const base = [{ x: -2000, y: 1400, w: 6000, h: 100, polygon: [[0,0],[6000,0],[6000,100],[0,100]] }]
  for (const inverted of [false, true]) for (const direction of [-1, 1]) for (const crouch of [false, true]) {
    const floor = inverted ? base.map(mirrorPlatform) : base
    const p = createPlayer({ x: 500, y: inverted ? -100 : 100 })
    Object.assign(p, { grounded: false, coyote: 0, inverted, facing: direction })
    const baseline = structuredClone(p), gravity = inverted ? -TUNING.gravity : TUNING.gravity
    for (let frame = 0; frame < 260; frame++) {
      const input = { ...NEUTRAL_INPUT, move: direction, crouch }
      stepPlayer(p, input, STEP, floor, undefined, undefined, undefined, undefined, gravity)
      baseline.freeFall = null
      stepPlayer(baseline, input, STEP, floor, undefined, undefined, undefined, undefined, gravity)
      for (const key of ['x','y','vx','vy','grounded','facing']) assert.equal(p[key], baseline[key], 'presentation preserves '+key)
      const pose = athletePose(p)
      limbLengths(pose)
      clearPoint(p, pose.head, 6.2, floor)
      if (!p.grounded) continue
      const before = structuredClone(p)
      athletePose(p)
      assert.deepEqual(p, before, 'recovery rendering stays read-only')
      if (frame < 195) continue
      stepPlayer(p, { ...input, jump: true }, STEP, floor, undefined, undefined, undefined, undefined, gravity)
      assert.ok(p.vy * (inverted ? -1 : 1) < 0)
      assert.equal(p.freeFall, null, 'a fresh jump releases the recovery immediately')
      break
    }
  }
})

test('a moving carrier transports a stationary get-up without starting the locomotion spring', () => {
  const level = blankTrial(); level.floor = 1700; level.height = 1800; level.goal.y = 1700
  level.spawn = { x: 500, y: 100 }
  level.mechanisms = [{ id: 'carrier', kind: 'lift', x: 400, y: 1400, w: 260, h: 20,
    travel: 120, orientation: 'horizontal', power: 'always' }]
  const run = createRun(level)
  stepRun(run, { ...NEUTRAL_INPUT, move: .02 })
  for (let i = 0; i < 500 && !run.player.freeFall?.recovery && !run.player.grounded; i++) stepRun(run, NEUTRAL_INPUT)
  const p = run.player
  assert.ok(p.freeFall && p.grounded && p.freeFall.recovery !== null)
  // Begin the carrier's normal return stroke during this recovery, rather
  // than testing the wait at its turnaround point.
  run.mechanisms[0].wait = 0; run.mechanisms[0].direction = 1
  const x = p.x
  for (let i = 0; i < 60; i++) {
    stepRun(run, NEUTRAL_INPUT)
    assert.equal(p.freeFall?.moving, undefined, 'transport never counts as a requested step')
    assert.ok(Math.abs(p.contacts.motion.x) < .001)
  }
  assert.ok(Math.abs(p.x - x) > 1, 'the support really moved during the recovery')
})

test('crouched working silhouettes clear tilted and round props under a low ceiling', () => {
  for (const direction of [-1, 1]) for (const kind of ['box', 'ball']) for (const size of [30,80,140]) {
    for (const angle of kind === 'box' ? [-.2,0,.2] : [0]) for (const ceiling of [false,true]) {
      const level = blankTrial()
      level.spawn = { x: 540 - direction * (size / 2 + 25.5), y: 920 }
      level.props = [{ kind, x: 540, y: 920, size }]
      level.platforms = [{ x: direction === 1 ? 540 + size / 2 : 540 - size / 2 - 120, y: 650, w: 120, h: 270 }]
      if (ceiling) level.platforms.push({ x: direction === 1 ? level.spawn.x - 100 : 540 + size / 2 + 2, y: 840, w: 120, h: 40 })
      const run = createRun(level)
      run.props[0].angle = angle
      for (let frame = 0; frame < 240; frame++) {
        stepRun(run, { ...NEUTRAL_INPUT, move: direction, crouch: true })
        if (frame < 30) continue
        const p = run.player, pose = athletePose(p)
        clearPoint(p, pose.head, 6.2, run.platforms)
        clearSegment(p, pose.hip, pose.waist, 2.8, run.platforms)
        clearSegment(p, pose.waist, pose.shoulder, 2.8, run.platforms)
        limbLengths(pose)
      }
      const mirrored = structuredClone(run.player)
      mirrorPlayerState(mirrored); mirrored.inverted = true
      const pose = athletePose(mirrored), solids = run.platforms.map(mirrorPlatform)
      clearPoint(mirrored, pose.head, 6.2, solids)
      clearSegment(mirrored, pose.hip, pose.waist, 2.8, solids)
      clearSegment(mirrored, pose.waist, pose.shoulder, 2.8, solids)
    }
  }
})
