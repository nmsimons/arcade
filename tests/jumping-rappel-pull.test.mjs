import test from 'node:test'
import assert from 'node:assert/strict'
import { createPlayer, NEUTRAL_INPUT, STEP, stepPlayer } from '../src/games/jumping/model.ts'
import { createRope, rappelFrame } from '../src/games/jumping/climbables.ts'
import { athletePose } from '../src/games/jumping/athlete.ts'
import { bodyIntersects } from '../src/games/jumping/geometry.ts'

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
const points = p => {
  const pose = athletePose(p)
  return [pose.head, pose.shoulder, pose.hip, ...[pose.frontArm, pose.backArm, pose.frontLeg, pose.backLeg].flatMap(l => [l.root, l.joint, l.end])]
    .map(a => [p.x + a[0] * p.facing, p.y + a[1]])
}

test('ascending a wall rope alternates planted hand grips and hauls the body through them without stretching', () => {
  for (const side of [-1, 1]) {
    const p = createPlayer(), rope = createRope({ x: 400 - side * 10, y: 0, length: 800, segments: 40 })
    const c = { kind: 'rope', index: 0, distance: 450, time: 1, direction: 1, swing: 0, lean: 0, hangBlend: 0, swingVelocity: 0,
      ladder: null, rope, wall: { x: 400, side }, rappelPull: 1, caught: { ...p } }
    Object.assign(p, { grounded: false, facing: side, climbing: c })
    let previous, hauls = [0, 0], exchanges = [0, 0], reachMin = Infinity, reachMax = -Infinity
    for (let i = 0; i < 240; i++) {
      c.distance = 450 - i * 85 * STEP
      const frame = rappelFrame(c)
      p.x = frame.hip[0]; p.y = frame.hip[1] + 32
      const pose = athletePose(p)
      for (const [j, arm] of [pose.frontArm, pose.backArm].entries()) {
        const wrist = [p.x + arm.end[0] * side, p.y + arm.end[1]]
        assert.ok(distance(wrist, frame.hands[j]) < 1e-6, 'the hand grip must be reachable by its actual arm')
        assert.ok(Math.abs(Math.hypot(distance(arm.root, arm.joint), arm.jointDepth ?? 0) - 10) < 1e-6)
        assert.ok(Math.abs(Math.hypot(distance(arm.joint, arm.end), (arm.endDepth ?? 0) - (arm.jointDepth ?? 0)) - 9) < 1e-6)
        assert.ok(Math.abs(arm.jointDepth ?? 0) < 1e-6, 'the elbow must stay in the side-view pulling plane')
        assert.ok(arm.joint[1] > arm.end[1], 'the elbow must tuck below the grip instead of folding over it')
        const opening = Math.acos((10 ** 2 + 9 ** 2 - distance(arm.root, arm.end) ** 2) / (2 * 10 * 9))
        assert.ok(opening > Math.PI * 35 / 180 && opening < Math.PI * 175 / 180, 'the elbow must retain a comfortable bend')
        reachMin = Math.min(reachMin, frame.hands[j][1] - frame.shoulder[1])
        reachMax = Math.max(reachMax, frame.hands[j][1] - frame.shoulder[1])
        if (previous && distance(frame.hands[j], previous.hands[j]) < 1e-6 && frame.shoulder[1] < previous.shoulder[1] - .05) hauls[j]++
        if (previous && frame.hands[j][1] < previous.hands[j][1] - .5 && Math.abs(frame.hands[1 - j][1] - previous.hands[1 - j][1]) < 1e-6) exchanges[j]++
      }
      if (previous) assert.ok(frame.hands.some((hand, j) => distance(hand, previous.hands[j]) < 1e-6), 'at least one hand bears weight during each regrip')
      previous = frame
    }
    assert.ok(hauls.every(count => count > 60), 'each arm must pull the moving torso past a fixed grip')
    assert.ok(exchanges.every(count => count > 60), 'both hands must take alternating reaches')
    assert.ok(reachMin > -18 && reachMax < 5, 'pulls must stay between overhead reach and the upper chest')
  }
})

test('upward pulling blends into and out of the established rappel descent while remaining clear of the wall', () => {
  for (const side of [-1, 1]) {
    const terrain = [{ x: side === 1 ? 400 : 0, y: 100, w: 400, h: 900 }]
    const world = { ladders: [], ropes: [{ x: 400 - side * 2, y: 100, length: 780, segments: 36 }] }
    const p = createPlayer(); Object.assign(p, { x: 400 - side * 24, y: 620, facing: side, grounded: false })
    let previous, maxStep = 0
    for (const [frames, input] of [[40, {}], [100, { climb: true }], [35, {}], [100, { descend: true }], [65, { climb: true }]]) {
      for (let i = 0; i < frames; i++) {
        stepPlayer(p, { ...NEUTRAL_INPUT, ...input }, STEP, terrain, world, { checkpoints: [], fallY: Infinity })
        assert.equal(p.climbing?.kind, 'rope'); assert.ok(p.climbing.wall)
        assert.ok(!terrain.some(b => bodyIntersects(p.x, p.y, b)))
        if (p.climbing.rappelPull === 1) {
          const frame = rappelFrame(p.climbing), pose = athletePose(p)
          for (const [j, arm] of [pose.frontArm, pose.backArm].entries()) {
            const wrist = [p.x + arm.end[0] * p.facing, p.y + arm.end[1]]
            assert.ok(distance(wrist, frame.hands[j]) < 1e-6, 'moving rope grips must remain within arm reach')
          }
        }
        const current = points(p)
        if (previous) current.forEach((point, j) => { maxStep = Math.max(maxStep, distance(point, previous[j])) })
        previous = current
      }
      assert.equal(p.climbing.rappelPull ?? 0, input.climb ? 1 : 0)
      if (input.descend) {
        const c = p.climbing, frame = rappelFrame(c)
        assert.deepEqual(frame, rappelFrame({ ...c, rappelPull: undefined }), 'steady descent must retain the original pose')
        assert.equal(frame.hands[1][1] - frame.hands[0][1], 5)
      }
    }
    assert.ok(maxStep < 6, `changing direction should blend instead of snapping, largest step ${maxStep}`)
  }
})

test('rappelling alternates substantial lifted steps with fixed wall footholds in both directions', () => {
  for (const side of [-1, 1]) for (const direction of [-1, 1]) {
    const p = createPlayer(), rope = createRope({ x: 400 - side * 10, y: 0, length: 900, segments: 45 })
    const c = { kind: 'rope', index: 0, distance: 450, time: 1, direction, swing: 0, lean: 0, hangBlend: 0, swingVelocity: 0,
      ladder: null, rope, wall: { x: 400, side }, rappelPull: direction > 0 ? 1 : 0, caught: { ...p } }
    Object.assign(p, { grounded: false, facing: side, climbing: c, terrain: [{ x: side === 1 ? 400 : 0, y: 0, w: 400, h: 1000 }] })
    let previous, maxStep = 0, previousPoints
    const planted = [0, 0], lifted = [0, 0], extremes = [[Infinity, -Infinity], [Infinity, -Infinity]]
    for (let i = 0; i < 240; i++) {
      c.distance = 450 - direction * i * (direction > 0 ? 85 : 105) * STEP
      const frame = rappelFrame(c)
      p.x = frame.hip[0]; p.y = frame.hip[1] + 32
      const pose = athletePose(p)
      assert.ok(frame.steps.some(step => step.planted), 'one foot must always carry the load')
      for (const [j, leg] of [pose.frontLeg, pose.backLeg].entries()) {
        const ankle = [p.x + leg.end[0] * side, p.y + leg.end[1]]
        assert.ok(distance(ankle, frame.feet[j]) < 1e-6, 'each planted or stepping target must be anatomically reachable')
        assert.ok(Math.abs(Math.hypot(distance(leg.root, leg.joint), leg.jointDepth ?? 0) - 15) < 1e-6)
        assert.ok(Math.abs(Math.hypot(distance(leg.joint, leg.end), leg.jointDepth ?? 0) - 14.5) < 1e-6)
        const opening = Math.acos((15 ** 2 + 14.5 ** 2 - distance(leg.root, leg.end) ** 2) / (2 * 15 * 14.5))
        assert.ok(opening > Math.PI / 4, 'the recovery must tuck the knee without folding it unnaturally')
        extremes[j][0] = Math.min(extremes[j][0], ankle[1] - frame.hip[1])
        extremes[j][1] = Math.max(extremes[j][1], ankle[1] - frame.hip[1])
        if ((400 - ankle[0]) * side > 8) lifted[j]++
        if (frame.steps[j].planted && previous?.steps[j].planted) {
          assert.ok(distance(frame.feet[j], previous.feet[j]) < 1e-6, 'the supporting sole must stay fixed on the wall')
          planted[j]++
        }
      }
      const current = points(p)
      if (previousPoints) current.forEach((point, j) => { maxStep = Math.max(maxStep, distance(point, previousPoints[j])) })
      previous = frame; previousPoints = current
    }
    assert.ok(planted.every(n => n > 90) && lifted.every(n => n > 40), 'both legs must alternate between support and a distinct recovery')
    assert.ok(extremes.every(([low, high]) => high - low > 20), 'each stride must visibly gather and extend the leg')
    assert.ok(maxStep < 6, 'the larger steps must remain smooth')
    c.direction = 0; c.rappelMotion = 0
    assert.ok(rappelFrame(c).steps.every(step => step.planted && step.lift === 0), 'pausing places both feet back against the wall')
  }
})

test('stopping anywhere in a rappel stride smoothly rests both soles against the wall', () => {
  for (const side of [-1, 1]) for (const direction of [-1, 1]) for (const stopAt of [26, 34, 42, 50, 58, 66]) {
    const terrain = [{ x: side === 1 ? 400 : 0, y: 100, w: 400, h: 900 }]
    const world = { ladders: [], ropes: [{ x: 400 - side * 2, y: 0, length: 900, segments: 42 }] }
    const p = createPlayer(); Object.assign(p, { x: 400 - side * 24, y: 620, facing: side, grounded: false })
    const tick = input => stepPlayer(p, { ...NEUTRAL_INPUT, ...input }, STEP, terrain, world, { checkpoints: [], fallY: Infinity })
    for (let i = 0; i < 80; i++) tick({})
    for (let i = 0; i < stopAt; i++) tick(direction > 0 ? { climb: true } : { descend: true })
    let previous = points(p), maxStep = 0
    for (let i = 0; i < 60; i++) {
      tick({})
      assert.ok(p.climbing?.wall)
      const current = points(p)
      current.forEach((point, j) => { maxStep = Math.max(maxStep, distance(point, previous[j])) })
      previous = current
      if (i >= 30) for (const leg of [athletePose(p).frontLeg, athletePose(p).backLeg]) {
        assert.ok(Math.abs(p.x + leg.end[0] * side - (400 - side * 3)) < .01, 'both ankles must settle against the wall')
        assert.ok(Math.abs(leg.footAngle + Math.PI / 2) < .01, 'both soles should lie flat against the face')
      }
    }
    assert.ok(maxStep < 6, 'the raised foot should settle instead of snapping to the wall')
  }
})
