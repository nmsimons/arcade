import test from 'node:test'
import assert from 'node:assert/strict'
import { createPlayer, stepPlayer, STEP, NEUTRAL_INPUT } from '../src/games/jumping/model.ts'
import { createGravityField, updateGravityField } from '../src/games/jumping/gravity.ts'
import { athletePose, handOutline } from '../src/games/jumping/athlete.ts'
import { nearestBoundary, pointInside } from '../src/games/jumping/geometry.ts'
import { mirrorPlayerState } from '../src/games/jumping/gravityFrame.ts'

const fixture = () => {
  const field = createGravityField()
  updateGravityField(field, [{ id: 'water', x: 0, y: 300, w: 3000, h: 700, effect: 'water', power: 'always' }], new Map(), true)
  const player = createPlayer({ x: 1400, y: 650 })
  player.grounded = false; player.coyote = 0
  return { player, field, floor: [{ x: 0, y: 920, w: 3000, h: 80 }] }
}
const rigPoints = pose => [pose.hip, pose.waist, pose.shoulder, pose.head,
  ...[pose.frontArm, pose.backArm, pose.frontLeg, pose.backLeg].flatMap(limb => [limb.joint, limb.end])]

for (const dt of [STEP, 1 / 30]) for (const direction of [-1, 1]) for (const diagonal of [false, true]) {
  test(`a ${diagonal ? 'diagonal' : 'head-first'} dive touches a hand before gathering onto the floor (${direction}, ${dt})`, () => {
    const { player: p, field, floor } = fixture(); p.facing = direction
    const input = { ...NEUTRAL_INPUT, drop: true, move: diagonal ? direction : 0 }
    let touch, complete, before, shortest = Infinity, handsFirst = false, handContact = false
    for (let time = 0; time < 6; time += dt) {
      stepPlayer(p, input, dt, floor, undefined, undefined, undefined, field)
      const pose = athletePose(p)
      if (920 - p.y > 25 && time > 1) {
        assert.equal(p.waterMotion.bottom, 0, 'the torso keeps swimming above the final approach')
        assert.ok(pose.head[1] > pose.hip[1], 'the head still leads down toward the floor')
      }
      const landing = p.waterMotion.landing
      if (landing && !touch) {
        touch = time
        assert.ok(920 - p.y < 10, 'the hand touch starts close to the real floor')
        assert.ok(pose.head[1] > pose.hip[1], 'touching does not instantly stand the torso up')
        assert.equal(pose.frontLeg.planted || pose.backLeg.planted, false)
        handsFirst = p.y + pose.frontLeg.end[1] < 890 && p.y + pose.backLeg.end[1] < 890
      }
      if (landing) {
        const tip = Math.max(...handOutline(pose.frontArm).map(point => p.y + point[1]))
        handContact ||= tip > 919.5
        shortest = Math.min(shortest, Math.hypot(...pose.frontLeg.end.map((v, i) => v - pose.frontLeg.root[i]), pose.frontLeg.endDepth ?? 0))
        assert.ok(Math.hypot(pose.shoulder[0] - pose.hip[0], pose.shoulder[1] - pose.hip[1]) > 12, 'the curling torso retains its span')
        const lower = pose.waist.map((v, i) => v - pose.hip[i]), upper = pose.shoulder.map((v, i) => v - pose.waist[i])
        const bend = Math.atan2(lower[0] * upper[1] - lower[1] * upper[0], lower[0] * upper[0] + lower[1] * upper[1])
        assert.ok(bend > -.1 && bend < .85, 'the spine curls forward gently instead of arching backward or kinking')
      }
      const points = rigPoints(pose).map(([x, y]) => [p.x + x * p.facing, p.y + y])
      if (before) for (const [i, point] of points.entries()) assert.ok(Math.hypot(point[0] - before[i][0], point[1] - before[i][1]) < 600 * dt + .5, 'landing joints remain continuous')
      before = points
      for (const limb of [pose.frontArm, pose.backArm, pose.frontLeg, pose.backLeg]) {
        const leg = 'footAngle' in limb
        assert.ok(Math.abs(Math.hypot(...limb.joint.map((v, i) => v - limb.root[i]), limb.jointDepth ?? 0) - (leg ? 15 : 10)) < 1e-5)
        assert.ok(Math.abs(Math.hypot(...limb.end.map((v, i) => v - limb.joint[i]), (limb.endDepth ?? 0) - (limb.jointDepth ?? 0)) - (leg ? 14.5 : 9)) < 1e-5)
      }
      for (const [point, radius] of [[pose.head, 6.2], [pose.hip, 2.8], [pose.waist, 2.8], [pose.shoulder, 2.8]]) {
        const x = p.x + point[0] * p.facing, y = p.y + point[1]
        assert.equal(pointInside(floor[0], x, y), false)
        assert.ok(nearestBoundary(floor[0], x, y).distance >= radius - .05)
      }
      if (touch !== undefined && !landing && p.grounded) { complete = time; break }
    }
    assert.ok(handsFirst && handContact, 'the drawn hand meets the floor while both feet still trail above')
    assert.ok(shortest < 20, 'the knees gather before extending into support')
    assert.ok(complete - touch > .6 && complete - touch < .85)
    const pose = athletePose(p)
    assert.ok(pose.head[1] < pose.hip[1] - 20)
    assert.ok(pose.frontLeg.planted || pose.backLeg.planted)
    assert.equal(p.waterMotion.bottom, 1)
    const root = p.y
    for (let t = 0; t < .5; t += dt) stepPlayer(p, NEUTRAL_INPUT, dt, floor, undefined, undefined, undefined, field)
    assert.equal(p.y, root, 'the completed landing rests without buoyant bouncing')
  })
}

for (const dt of [STEP, 1 / 30]) test(`the planted hand absorbs a dive then pushes the chest upward (${dt})`, () => {
  const arrivals = []
  for (const vertical of [.35, 1]) {
    const { player: p, field, floor } = fixture()
    const input = { ...NEUTRAL_INPUT, swimVertical: vertical }
    for (let time = 0; !p.waterMotion?.landing && time < 12; time += dt) stepPlayer(p, input, dt, floor, undefined, undefined, undefined, field)
    assert.ok(p.waterMotion?.landing)
    const samples = []
    for (const age of [0, .09, .26]) {
      while (p.waterMotion.landing.time + 1e-8 < age) stepPlayer(p, input, dt, floor, undefined, undefined, undefined, field)
      const snapshot = structuredClone(p), pose = athletePose(p), arm = pose.frontArm, palm = arm.hand ?? arm.end
      assert.deepEqual(p, snapshot, 'rendering the push does not advance or modify the player')
      samples.push({ x: p.x + palm[0] * p.facing, y: p.y + palm[1], chestY: p.y + arm.root[1],
        reach: Math.hypot(arm.end[0] - arm.root[0], arm.end[1] - arm.root[1], arm.endDepth ?? 0) })
      assert.ok(Math.max(...handOutline(arm).map(point => p.y + point[1])) > 919.5, 'the palm stays against the floor throughout the push')
    }
    const [touch, loaded, extended] = samples
    for (const sample of samples) assert.ok(Math.hypot(sample.x - touch.x, sample.y - touch.y) < .2, 'the supporting hand stays planted while the body moves')
    assert.ok(touch.reach - loaded.reach > 2, 'the elbow bends to receive the arrival')
    assert.ok(extended.reach - loaded.reach > 2, 'the arm extends to make a visible push')
    assert.ok(loaded.chestY - extended.chestY > 2, 'the extension lifts the chest away from the floor')
    arrivals.push(touch.reach - loaded.reach)
  }
  assert.ok(arrivals[1] > arrivals[0] + 1, 'a faster arrival produces more compression than a gentle approach')
})

for (const dt of [STEP, 1 / 30]) test(`turning during the planted push preserves the body arc (${dt})`, () => {
  const { player: p, field, floor } = fixture()
  const dive = { ...NEUTRAL_INPUT, drop: true }
  for (let time = 0; !p.waterMotion?.landing && time < 6; time += dt) stepPlayer(p, dive, dt, floor, undefined, undefined, undefined, field)
  assert.ok(p.waterMotion?.landing)
  while (p.waterMotion.landing.time < .15) stepPlayer(p, dive, dt, floor, undefined, undefined, undefined, field)
  let previous = rigPoints(athletePose(p)).map(([x, y]) => [p.x + x * p.facing, p.y + y])
  for (let time = 0; time < 1; time += dt) {
    stepPlayer(p, { ...dive, move: -1 }, dt, floor, undefined, undefined, undefined, field)
    const current = rigPoints(athletePose(p)).map(([x, y]) => [p.x + x * p.facing, p.y + y])
    for (const [i, point] of current.entries()) assert.ok(Math.hypot(point[0] - previous[i][0], point[1] - previous[i][1]) < 600 * dt + .5, 'changing direction does not reverse the captured curl')
    previous = current
  }
  assert.equal(p.facing, -1); assert.equal(p.waterMotion.landing, undefined)
})

for (const dt of [STEP, 1 / 30]) test(`holding Down lands into a crouch without reversing the back bend (${dt})`, () => {
  const { player: p, field, floor } = fixture()
  let touched = false
  for (let time = 0; time < 5; time += dt) {
    stepPlayer(p, { ...NEUTRAL_INPUT, drop: true, crouch: true }, dt, floor, undefined, undefined, undefined, field)
    touched ||= !!p.waterMotion.landing
    if (!touched) continue
    const pose = athletePose(p), lower = pose.waist.map((v, i) => v - pose.hip[i]), upper = pose.shoulder.map((v, i) => v - pose.waist[i])
    const bend = Math.atan2(lower[0] * upper[1] - lower[1] * upper[0], lower[0] * upper[0] + lower[1] * upper[1])
    assert.ok(bend > -.1 && bend < .85, 'the curl stays forward and gradual through the crouch handoff')
  }
  assert.ok(touched); assert.equal(p.waterMotion.landing, undefined); assert.equal(p.crouch, 1)
  assert.ok(athletePose(p).frontLeg.planted || athletePose(p).backLeg.planted)
  for (let time = 0; time < .5; time += dt) stepPlayer(p, NEUTRAL_INPUT, dt, floor, undefined, undefined, undefined, field)
  assert.equal(p.crouch, 0); assert.equal(p.grounded, true)
  const pose = athletePose(p)
  assert.ok(pose.head[1] < pose.hip[1] - 20)
})

for (const dt of [STEP, 1 / 30]) for (const up of [{ climb: true }, { swimVertical: -.35 }]) test(`Up leaves a partially gathered floor landing continuously (${dt}, ${JSON.stringify(up)})`, () => {
  const { player: p, field, floor } = fixture()
  while (!p.waterMotion?.landing) stepPlayer(p, { ...NEUTRAL_INPUT, drop: true }, dt, floor, undefined, undefined, undefined, field)
  for (let t = 0; t < .35; t += dt) stepPlayer(p, { ...NEUTRAL_INPUT, drop: true }, dt, floor, undefined, undefined, undefined, field)
  let previous = rigPoints(athletePose(p)).map(([x, y]) => [p.x + x * p.facing, p.y + y])
  const y = p.y
  for (let t = 0; t < .7; t += dt) {
    stepPlayer(p, { ...NEUTRAL_INPUT, ...up }, dt, floor, undefined, undefined, undefined, field)
    const current = rigPoints(athletePose(p)).map(([x, y]) => [p.x + x * p.facing, p.y + y])
    for (const [i, point] of current.entries()) assert.ok(Math.hypot(point[0] - previous[i][0], point[1] - previous[i][1]) < 600 * dt + .5)
    previous = current
  }
  assert.equal(p.grounded, false); assert.ok(p.y < y - (up.climb ? 25 : 10))
  assert.equal(p.waterMotion.landing, undefined)
})

for (const dt of [STEP, 1 / 30]) for (const direction of [-1, 1]) {
  test(`hand-first landings stay clear beside a pool wall (${direction}, ${dt})`, () => {
    const { player: p, field } = fixture()
    // The wall and floor are parts of the same concave terrain block.
    const floor = [{ x: 0, y: 300, w: 3000, h: 700,
      polygon: [[0, 0], [900, 0], [900, 620], [1900, 620], [1900, 0], [3000, 0], [3000, 700], [0, 700]] }]
    p.x = direction > 0 ? 1888 : 912; p.facing = direction
    let touched = false, previous
    for (let time = 0; time < 5; time += dt) {
      stepPlayer(p, { ...NEUTRAL_INPUT, drop: true }, dt, floor, undefined, undefined, undefined, field)
      const pose = athletePose(p), points = rigPoints(pose).map(([x, y]) => [p.x + x * p.facing, p.y + y])
      if (previous) for (const [i, point] of points.entries()) assert.ok(Math.hypot(point[0] - previous[i][0], point[1] - previous[i][1]) < 600 * dt + .5)
      previous = points
      touched ||= !!p.waterMotion.landing
      const x = p.x + pose.head[0] * p.facing, y = p.y + pose.head[1]
      assert.equal(pointInside(floor[0], x, y), false)
      assert.ok(nearestBoundary(floor[0], x, y).distance >= 6.15)
      if (p.waterMotion.landing) {
        const snapshot = structuredClone(p)
        mirrorPlayerState(p); mirrorPlayerState(p)
        assert.deepEqual(p, snapshot, 'nested contact and captured pose survive gravity reflection')
      }
    }
    assert.ok(touched)
    assert.equal(p.waterMotion.landing, undefined); assert.equal(p.grounded, true)
  })
}
