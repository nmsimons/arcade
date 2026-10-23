import test from 'node:test'
import assert from 'node:assert/strict'
import { createPlayer, stepPlayer, NEUTRAL_INPUT, STEP, TUNING, gaitPose } from '../src/games/jumping/model.ts'
import { athletePose, dryLedgeReach, dryLedgeReachPose, reflectAthletePose } from '../src/games/jumping/athlete.ts'
import { anticipatePush, playerContacts, updatePushingPose } from '../src/games/jumping/playerContacts.ts'
import { ballShape, boxShape } from '../src/games/jumping/propGeometry.ts'
import { mirrorPlatform, mirrorPlayerState } from '../src/games/jumping/gravityFrame.ts'

const lip = { x: 500, y: 400, w: 400, h: 800 }
const falling = values => Object.assign(createPlayer({ x: 470, y: 444 }),
  { grounded: false, coyote: 0, facing: 1, vy: 0, gait: gaitPose(200, true) }, values)
for (const inverted of [false, true]) {
  test(`dry ledge preparation leaves unreachable and departing lips alone: inverted=${inverted}`, () => {
    for (const values of [{ x: 460 }, { y: 500 }, { vx: -100 }]) {
      const p = falling(values)
      if (inverted) { mirrorPlayerState(p); p.inverted = true }
      stepPlayer(p, NEUTRAL_INPUT, STEP, [inverted ? mirrorPlatform(lip) : lip], undefined, undefined, undefined, undefined, inverted ? -TUNING.gravity : TUNING.gravity)
      assert.equal(p.hang, null)
      assert.equal(p.ledgeReach, null, 'a nearby root is not enough to justify a hand reach')
    }
  })
  test(`a dry turn cannot prepare a lip behind the visible body: inverted=${inverted}`, () => {
    const p = falling({ x: 460 })
    p.dryTurn = { pose: reflectAthletePose(athletePose(p)), facing: 1, target: 1, time: 0, departure: false }
    if (inverted) { mirrorPlayerState(p); p.inverted = true }
    stepPlayer(p, NEUTRAL_INPUT, STEP, [inverted ? mirrorPlatform(lip) : lip], undefined, undefined, undefined, undefined, inverted ? -TUNING.gravity : TUNING.gravity)
    assert.equal(p.ledgeReach, null)
  })
  test(`ledge preparation chooses the same usable lip regardless of platform order: inverted=${inverted}`, () => {
    const second = { x: 510, y: 390, w: 400, h: 800 }
    const selected = []
    for (const platforms of [[lip, second], [second, lip]]) {
      const p = falling({ vx: 200 })
      if (inverted) { mirrorPlayerState(p); p.inverted = true }
      stepPlayer(p, NEUTRAL_INPUT, STEP, inverted ? platforms.map(mirrorPlatform) : platforms, undefined, undefined, undefined, undefined, inverted ? -TUNING.gravity : TUNING.gravity)
      assert.equal(p.hang, null)
      assert.ok(p.ledgeReach?.amount > 0, 'a close forward lip still prepares the hands')
      selected.push(p.ledgeReach)
    }
    assert.deepEqual(selected[0], selected[1])
    assert.equal(selected[0].x, 500)
  })
}

for (const side of [-1, 1]) {
  test(`unloaded object preparation gathers gradually without moving the player or planted feet: side=${side}`, () => {
    for (const gap of [20, 30, 38, 45]) {
      const p = Object.assign(createPlayer({ x: 500, y: 920 }), { vx: side * 200, facing: side, gait: gaitPose(200) })
      const prop = { kind: 'box', x: 500 + side * (gap + 40), y: 920, size: 80, angle: 0, vx: 0, vy: 0 }
      const platform = boxShape(prop), world = { platforms: [platform], colliders: [{ id: 'prop:0', platform, prop }] }
      const contact = anticipatePush(p, { ...NEUTRAL_INPUT, move: side }, world)
      assert.ok(contact)
      const free = athletePose(p)
      const before = structuredClone(p)
      updatePushingPose(p, contact, STEP)
      const prepared = athletePose(p)
      for (const point of ['hip', 'waist', 'shoulder', 'head']) assert.ok(
        Math.hypot(...prepared[point].map((v, i) => v - free[point][i])) < 1.5, 'a newly seen grip cannot snap the trunk into its working stance')
      for (const leg of ['frontLeg', 'backLeg']) for (let i = 0; i < 2; i++) assert.ok(
        Math.abs(prepared[leg].end[i] - free[leg].end[i]) < 1e-6, 'preparation preserves the gait ankles')
      assert.equal(p.pushing.effort, 0)
      assert.equal(p.pushing.load, 0)
      assert.equal(p.pushing.amount, 0)
      assert.deepEqual({ ...p, pushing: before.pushing }, before, 'preparation only changes presentation')
    }
  })
  test(`distant and overhead objects cannot attract a dry preparation: side=${side}`, () => {
    for (const [gap, bottom] of [[140, 920], [20, 820]]) {
      const p = Object.assign(createPlayer({ x: 500, y: 920 }), { vx: side * 200, facing: side })
      const prop = { kind: 'box', x: 500 + side * (gap + 40), y: bottom, size: 80, angle: 0, vx: 0, vy: 0 }
      const platform = boxShape(prop), world = { platforms: [platform], colliders: [{ id: 'prop:0', platform, prop }] }
      assert.equal(anticipatePush(p, { ...NEUTRAL_INPUT, move: side }, world), null)
    }
  })
  test(`a turn does not reach for an object behind the visible body: side=${side}`, () => {
    const p = Object.assign(createPlayer({ x: 500, y: 920 }), { vx: side * 200, facing: side })
    p.dryTurn = { pose: reflectAthletePose(athletePose(p)), facing: side, target: side, time: 0, departure: false }
    const prop = { kind: 'box', x: 500 + side * 70, y: 920, size: 80, angle: 0, vx: 0, vy: 0 }
    const platform = boxShape(prop), world = { platforms: [platform], colliders: [{ id: 'prop:0', platform, prop }] }
    assert.equal(anticipatePush(p, { ...NEUTRAL_INPUT, move: side }, world), null)
  })
}

test('a dry lip hidden behind another solid cannot receive hand preparation', () => {
  const p = falling()
  const pose = dryLedgeReachPose(p), before = structuredClone(p)
  assert.ok(dryLedgeReach(p, 500, 400, pose) > 0)
  // A sub-unit obstruction between contour samples still blocks the reach.
  p.terrain = [{ x: 486.2, y: 394, w: .1, h: 9 }]
  assert.equal(dryLedgeReach(p, 500, 400, pose), 0)
  const { terrain, ...after } = p
  assert.equal(terrain.length, 1)
  assert.deepEqual(after, before, 'selection remains read-only')
})

test('a crouched round approach and its first shove measure proximity from the same motor face', () => {
  const p = Object.assign(createPlayer({ x: 887, y: 650 }), { facing: -1, crouch: 1, crouching: true })
  const prop = { kind: 'ball', x: 800, y: 650, size: 100, angle: 0, vx: 0, vy: 0 }
  const platform = ballShape(prop), floor = { x: 0, y: 650, w: 1500, h: 100 }
  const world = { platforms: [platform, floor], colliders: [{ id: 'prop:0', platform, prop }, { id: 'floor', platform: floor }] }
  const input = { ...NEUTRAL_INPUT, move: -1, crouch: true }
  const prepared = anticipatePush(p, input, world), loaded = playerContacts(p, input, world, STEP).push
  assert.ok(prepared?.hands && loaded?.hands)
  assert.equal(prepared.wallX, loaded.wallX, 'a low palm on a round face cannot delay preparation past the first working contact')
  assert.equal(prepared.anticipation, 1, 'the existing physical pushing window completes the approach target')
  assert.equal(prepared.effort, 0)
})

test('an unloaded approach releases old force-bearing pose weight instead of pinning its brace', () => {
  const p = Object.assign(createPlayer({ x: 500, y: 920 }), { vx: 200 })
  const prop = { kind: 'box', x: 570, y: 920, size: 80, angle: 0, vx: 0, vy: 0 }
  const platform = boxShape(prop), collider = { id: 'prop:0', platform, prop }, world = { platforms: [platform], colliders: [collider] }
  const unloaded = anticipatePush(p, { ...NEUTRAL_INPUT, move: 1 }, world)
  assert.ok(unloaded)
  updatePushingPose(p, { ...unloaded, anticipation: undefined, effort: 1 }, .14)
  assert.equal(p.pushing.amount, 1)
  const body = structuredClone(prop)
  let previous = athletePose(p)
  for (let i = 0; i < 24; i++) {
    updatePushingPose(p, unloaded, STEP)
    const pose = athletePose(p)
    for (const point of ['hip', 'waist', 'shoulder', 'head']) {
      assert.ok(Math.hypot(...pose[point].map((n, axis) => n - previous[point][axis])) < 3,
        'retaining a free reach cannot defer body relaxation to a final-frame snap')
    }
    previous = pose
  }
  assert.equal(p.pushing.amount, 0, 'the actual load releases within its normal fade duration')
  assert.ok(p.pushing.ready > .9, 'the valid free preparation can continue')
  assert.equal(p.pushing.effort, 0)
  assert.deepEqual(prop, body, 'presentation supplies no force')
})

test('dry ledge and object preparations cannot own the same arms simultaneously', () => {
  const p = falling({ y: 470, vx: 100 })
  const prop = { kind: 'box', x: 540, y: 500, size: 80, angle: 0, vx: 0, vy: 0, grounded: true }
  const platform = boxShape(prop), world = { platforms: [platform], colliders: [{ id: 'prop:0', platform, prop }] }
  stepPlayer(p, { ...NEUTRAL_INPUT, move: 1 }, STEP, world.platforms, undefined, undefined, world)
  assert.equal(p.hang, null)
  assert.ok(p.ledgeReach?.amount > 0, 'the usable top lip owns preparation before the catch opens')
  assert.equal(p.pushing, null, 'object preparation cannot also distort its torso and arms')
})
