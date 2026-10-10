import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createPlayer, stepPlayer, NEUTRAL_INPUT, STEP, TUNING } from '../src/games/jumping/model.ts'
import { createGravityField, updateGravityField, playerWaterCenterOffset } from '../src/games/jumping/gravity.ts'
import { athletePose } from '../src/games/jumping/athlete.ts'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { parseLevel, levelProblems } from '../src/games/jumping/level.ts'
import { createJumpController } from '../src/games/jumping/input.ts'
import { mirrorPlayerState } from '../src/games/jumping/gravityFrame.ts'

const field = () => {
  const f = createGravityField()
  updateGravityField(f, [{ id: 'water', x: 0, y: 400, w: 3000, h: 1200, effect: 'water', power: 'always' }], new Map(), true)
  return f
}
const center = p => p.y + playerWaterCenterOffset(p)
const swimmer = () => { const p = createPlayer({ x: 1500, y: 650 }); p.grounded = false; p.coyote = 0; return p }
const advance = (p, f, seconds, intent, dt, terrain = []) => {
  for (let i = 0; i < Math.round(seconds / dt); i++) stepPlayer(p, { ...NEUTRAL_INPUT, ...intent }, dt, terrain, undefined, undefined, undefined, f)
}

for (const dt of [STEP, 1 / 60, 1 / 30]) for (const side of [-1, 1]) for (const start of ['surface', 'submerged']) {
  test(`Down from an upright float folds the limbs then extends into a dive: ${start}, side=${side}, dt=${dt}`, () => {
    const p = swimmer(), f = field(); p.facing = side
    if (start === 'surface') p.y = 450.34
    else p.waterMotion = { amount: 0, dive: 0, phase: 0, underwater: true }
    advance(p, f, 3, {}, dt)
    assert.equal(p.waterMotion.amount, 0)
    assert.ok(athletePose(p).head[1] < athletePose(p).hip[1] - 20, 'the route begins floating upright')
    let shortestLeg = Infinity, shortestArm = Infinity, deepestTuck = 0, previous
    for (let i = 0; i < Math.round(1.5 / dt); i++) {
      const before = center(p)
      stepPlayer(p, { ...NEUTRAL_INPUT, descend: true, swimVertical: 1 }, dt, [], undefined, undefined, undefined, f)
      assert.ok(Math.abs(center(p) - before - p.vy * dt) < .001, 'folding cannot teleport the displaced body')
      assert.ok(p.vy <= TUNING.diveSpeed + .01, 'extension cannot add a launch impulse')
      const pose = athletePose(p), leg = pose.frontLeg, arm = pose.frontArm
      if (i * dt < .65) {
        shortestLeg = Math.min(shortestLeg, Math.hypot(...leg.end.map((v, j) => v - leg.root[j]), leg.endDepth ?? 0))
        shortestArm = Math.min(shortestArm, Math.hypot(...arm.end.map((v, j) => v - arm.root[j]), arm.endDepth ?? 0))
        deepestTuck = Math.max(deepestTuck, p.waterMotion.gather)
      }
      const points = [pose.hip, pose.waist, pose.shoulder, pose.head,
        ...[pose.frontArm, pose.backArm, pose.frontLeg, pose.backLeg].flatMap(limb => [limb.root, limb.joint, limb.end])]
        .map(([x, y]) => [p.x + x * p.facing, p.y + y])
      if (previous) for (const [j, point] of points.entries()) {
        assert.ok(Math.hypot(point[0] - previous[j][0], point[1] - previous[j][1]) < 450 * dt + .02, `continuous dive joint ${j}`)
      }
      previous = points
      for (const limb of [pose.frontArm, pose.backArm, pose.frontLeg, pose.backLeg]) {
        const leg = 'footAngle' in limb
        assert.ok(Math.abs(Math.hypot(...limb.joint.map((v, j) => v - limb.root[j]), limb.jointDepth ?? 0) - (leg ? 15 : 10)) < .001)
        assert.ok(Math.abs(Math.hypot(...limb.end.map((v, j) => v - limb.joint[j]), (limb.endDepth ?? 0) - (limb.jointDepth ?? 0)) - (leg ? 14.5 : 9)) < .001)
      }
    }
    assert.ok(deepestTuck > .9 && shortestLeg < 16 && shortestArm < 12, 'the first turn visibly gathers the knees and arms')
    assert.equal(p.waterMotion.amount, 1)
    assert.ok(p.waterMotion.gather < .001, 'the entry tuck releases into the ordinary stroke')
    assert.ok(athletePose(p).head[1] > athletePose(p).hip[1] + 20, 'the extended stroke points head-first down')
    assert.ok(p.vy > 99 && p.vy < 101)
    advance(p, f, 3, {}, dt)
    assert.equal(p.waterMotion.amount, 0, 'release can still return to an upright depth hold')
  })
}

for (const dt of [STEP, 1 / 60, 1 / 30]) for (const side of [-1, 1]) {
  test(`the visible underwater rig curves through interrupted turns without snapping: side=${side}, dt=${dt}`, () => {
    const p = swimmer(), f = field(); p.y = 1100
    let previous
    const stages = [[1, { descend: true }], [.3, { climb: true }], [.8, { move: side, climb: true }],
      [1, { move: -side, descend: true }], [1, { move: side }], [1, { move: -side }], [.65, {}], [.35, { move: side }],
      [1, { climb: true }], [.2, { descend: true }], [.2, { climb: true }], [1, { move: side, descend: true }], [2, {}]]
    for (const [seconds, intent] of stages) for (let i = 0; i < Math.round(seconds / dt); i++) {
      stepPlayer(p, { ...NEUTRAL_INPUT, ...intent }, dt, [], undefined, undefined, undefined, f)
      const pose = athletePose(p)
      const points = [pose.hip, pose.waist, pose.shoulder, pose.head,
        ...[pose.frontArm, pose.backArm, pose.frontLeg, pose.backLeg].flatMap(limb => [limb.root, limb.joint, limb.end])]
        .map(([x, y]) => [p.x + x * p.facing, p.y + y])
      if (previous) for (const [j, point] of points.entries()) {
        assert.ok(Math.hypot(point[0] - previous[j][0], point[1] - previous[j][1]) < 450 * dt + .02,
          `visible point ${j} must remain continuous through ${JSON.stringify(intent)}, frame ${i}`)
      }
      previous = points
    }
  })
}

test('the head leads an underwater reversal while the pelvis and travel still trail', () => {
  const p = swimmer(), f = field()
  advance(p, f, 1, { move: 1 }, STEP)
  const before = athletePose(p)
  advance(p, f, .18, { move: -1 }, STEP)
  const turning = athletePose(p)
  assert.ok(p.vx > 0, 'the swimmer is still braking the original rightward travel')
  assert.ok(turning.head[0] * p.facing < before.head[0] - 18, 'the head has already turned toward the new direction')
  assert.ok(Math.abs(turning.hip[0] * p.facing - before.hip[0]) < 3, 'the pelvis trails instead of rotating with the head as one rigid piece')
  advance(p, f, 1.4, { move: -1 }, STEP)
  assert.ok(p.vx < -109)
  const extended = athletePose(p)
  assert.ok((extended.head[0] - extended.hip[0]) * p.facing < -20, 'the gathered turn extends into the new direction')
})

for (const dt of [STEP, 1 / 30]) for (const side of [-1, 1]) {
  test(`a sideways reversal flexes through the spine then unwinds (${side}, ${dt})`, () => {
    const p = swimmer(), f = field(); p.facing = side; p.y = 1100
    advance(p, f, 1, { move: side }, dt)
    const curve = s => {
      const a = [s.waist[0] - s.hip[0], s.waist[1] - s.hip[1]]
      const b = [s.shoulder[0] - s.waist[0], s.shoulder[1] - s.waist[1]]
      return Math.abs(Math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1]))
    }
    assert.ok(curve(athletePose(p)) < .05, 'steady travel has an extended spine')
    let greatest = 0, greatestFlex = 0
    for (let i = 0; i < Math.round(.5 / dt); i++) {
      advance(p, f, dt, { move: -side }, dt)
      const pose = athletePose(p)
      greatest = Math.max(greatest, curve(pose))
      greatestFlex = Math.max(greatestFlex, p.waterMotion.bend)
      for (const arm of [pose.frontArm, pose.backArm]) {
        assert.ok(Math.abs(Math.hypot(...arm.joint.map((v, j) => v - arm.root[j]), arm.jointDepth ?? 0) - 10) < 1e-5)
        assert.ok(Math.abs(Math.hypot(...arm.end.map((v, j) => v - arm.joint[j]), (arm.endDepth ?? 0) - (arm.jointDepth ?? 0)) - 9) < 1e-5)
      }
    }
    assert.ok(greatest > .6, 'a horizontal direction change articulates the torso rather than only changing its yaw')
    assert.ok(greatestFlex > .4, 'the spine itself flexes substantially during the horizontal turn')
    advance(p, f, 1.5, { move: -side }, dt)
    assert.ok(curve(athletePose(p)) < .05, 'the turn extends smoothly into the new heading')
    assert.ok(Math.abs(p.waterMotion.bend) < .01)
  })
}

test('an articulated underwater turn reflects with reverse gravity and drawing restores its state', () => {
  const p = swimmer(), f = field()
  advance(p, f, 1, { descend: true }, STEP)
  advance(p, f, .2, { climb: true }, STEP)
  const original = athletePose(p), snapshot = structuredClone(p)
  mirrorPlayerState(p); p.inverted = true
  const reflectedState = structuredClone(p), reflected = athletePose(p)
  assert.deepEqual(reflected, original, 'drawing normalizes the entire steering curve into the gravity frame')
  assert.deepEqual(p, reflectedState, 'drawing does not mutate the steering state')
  mirrorPlayerState(p); p.inverted = false
  assert.deepEqual(p, snapshot, 'reflection is an involution for the articulated swimmer')
})

for (const dt of [STEP, 1 / 30]) test(`stopping gathers and extends in proportion to the turn into an upright float at ${dt}`, () => {
  const rests = []
  for (const intent of [{ descend: true }, { move: 1 }, { climb: true }]) {
    const p = swimmer(), f = field(); p.y = 1100
    advance(p, f, 1.2, intent, dt)
    let shortest = Infinity
    for (let i = 0; i < Math.round(2 / dt); i++) {
      stepPlayer(p, NEUTRAL_INPUT, dt, [], undefined, undefined, undefined, f)
      const leg = athletePose(p).frontLeg
      shortest = Math.min(shortest, Math.hypot(leg.end[0] - leg.root[0], leg.end[1] - leg.root[1], leg.endDepth ?? 0))
    }
    const pose = athletePose(p), leg = pose.frontLeg
    assert.ok(Math.hypot(leg.end[0] - leg.root[0], leg.end[1] - leg.root[1], leg.endDepth ?? 0) > 28, 'the legs extend again in the quiet float')
    assert.ok(pose.head[1] < pose.hip[1] - 20)
    rests.push(shortest)
  }
  assert.ok(rests[0] < 16, 'stopping a head-first dive curls the knees close to the hips')
  assert.ok(rests[1] < 22 && rests[1] > rests[0] + 3, 'a horizontal glide gathers without the full dive tuck')
  assert.ok(rests[2] > 24, 'an ascending swimmer is already upright and needs little curl')
})

for (const dt of [STEP, 1 / 60, 1 / 30]) for (const vertical of [false, true]) {
  test(`release carries underwater momentum before a quiet depth hold: vertical=${vertical}, dt=${dt}`, () => {
    const p = swimmer(), f = field()
    advance(p, f, 1.2, vertical ? { descend: true } : { move: 1 }, dt)
    const speed = vertical ? p.vy : p.vx, position = vertical ? center(p) : p.x
    advance(p, f, .15, {}, dt)
    const carried = vertical ? p.vy : p.vx, distance = (vertical ? center(p) : p.x) - position
    assert.ok(carried > speed * .45 && carried < speed * .65, 'release retains a damped glide instead of an abrupt brake')
    assert.ok(distance > speed * .09 && distance < speed * .15)
    advance(p, f, 2, {}, dt)
    const rest = vertical ? center(p) : p.x
    advance(p, f, 3, {}, dt)
    assert.ok(Math.abs((vertical ? center(p) : p.x) - rest) < .03, 'the glide still settles beside underwater items')
  })
}

for (const dt of [STEP, 1 / 60, 1 / 30]) for (const side of [-1, 1]) {
  test(`a deliberate dive glides into a level swim and holds depth on release: side=${side}, dt=${dt}`, () => {
    const p = swimmer(), f = field()
    advance(p, f, 1, { descend: true }, dt)
    const depth = center(p)
    advance(p, f, 1.6, { move: side }, dt)
    assert.ok(center(p) > depth && center(p) - depth < 32, 'the dive carries a damped glide without a depth reset')
    const level = center(p), x = p.x
    advance(p, f, 2, { move: side }, dt)
    assert.ok(Math.abs(center(p) - level) < .05, 'horizontal steering does not fight an automatic ascent')
    assert.ok((p.x - x) * side > 215)
    advance(p, f, 2, {}, dt)
    const stopped = center(p), stoppedX = p.x, pose = athletePose(p)
    assert.ok(Math.abs(p.vy) < .1 && Math.abs(p.vx) < .1)
    assert.equal(p.waterMotion.amount, 0, 'the slowing glide eases fully out of the extended stroke')
    assert.ok(pose.head[1] < pose.hip[1] - 20 && Math.abs(pose.head[0] - pose.hip[0]) < 5, 'release settles into an upright underwater float')
    advance(p, f, 3, {}, dt)
    assert.ok(Math.abs(center(p) - stopped) < .02 && Math.abs(p.x - stoppedX) < .02, 'sculling holds the reached position')
    advance(p, f, 1.2, { move: side }, dt)
    assert.equal(p.waterMotion.amount, 1, 'steering extends back into a swim from the upright rest')
    assert.ok(Math.abs(center(p) - stopped) < .02, 'resuming the stroke preserves the resting depth')
  })

  test(`underwater ascent, descent and reversal follow resolved velocity: side=${side}, dt=${dt}`, () => {
    const p = swimmer(), f = field()
    advance(p, f, .6, { descend: true }, dt)
    let previous = p.vy, crossed = false
    for (let i = 0; i < Math.round(1.8 / dt); i++) {
      stepPlayer(p, { ...NEUTRAL_INPUT, climb: true, move: side }, dt, [], undefined, undefined, undefined, f)
      assert.ok(Math.abs(p.vy - previous) <= TUNING.swimSteeringAcceleration * dt + .001, 'a direction change brakes before accelerating')
      previous = p.vy; crossed ||= p.vy < 0
    }
    assert.ok(crossed && p.vy < -65 && p.waterMotion.dive < -.4, 'the body points into its upward diagonal')
    assert.ok(Math.hypot(p.vx / 110, p.vy / 100) <= 1.001, 'diagonals do not add free speed')
    const pose = athletePose(p)
    assert.ok(pose.head[1] < pose.hip[1] - 12)
    const phase = p.waterMotion.phase
    advance(p, f, 1.4, {}, dt)
    const glide = center(p)
    advance(p, f, 2, {}, dt)
    assert.ok(Math.abs(center(p) - glide) < .5, 'release can stop beside a submerged item')
    assert.notEqual(phase, p.waterMotion.phase, 'the stroke completes its traveled glide')
  })
}

test('underwater control fades at the surface and disappears when the water region is removed', () => {
  const p = swimmer(), f = field()
  advance(p, f, 1, { descend: true }, STEP)
  advance(p, f, 9, { climb: true }, STEP)
  assert.equal(p.waterMotion.amount, 0)
  assert.ok(Math.abs(p.y + athletePose(p).shoulder[1] - 2 - 400) < 3)
  assert.ok(Math.abs(p.vy) < 4 && !p.waterMotion.underwater, 'holding Up settles at neck depth')
  advance(p, f, 1.5, { descend: true }, STEP)
  advance(p, f, 1, {}, STEP)
  updateGravityField(f, [], new Map(), true)
  advance(p, f, .2, {}, STEP)
  assert.equal(p.swimAcceleration, 0)
  assert.equal(p.waterMotion, undefined)
  assert.ok(p.vy > 250, 'removing water restores ordinary gravity')
})

for (const submerged of [false, true]) test(`an upright float has subtle continuous body motion without drift, submerged=${submerged}`, () => {
  const p = swimmer(), f = field()
  advance(p, f, submerged ? 1 : 8, submerged ? { descend: true } : {}, STEP)
  advance(p, f, 3, {}, STEP)
  const depth = center(p), heads = [], feet = []
  let previous
  for (let i = 0; i < 720; i++) {
    stepPlayer(p, NEUTRAL_INPUT, STEP, [], undefined, undefined, undefined, f)
    const state = structuredClone(p), pose = athletePose(p)
    assert.deepEqual(p, state, 'the resting motion remains a read-only pose')
    assert.equal(p.waterMotion.amount, 0)
    assert.ok(pose.head[1] < pose.hip[1] - 20, 'gentle motion keeps the upright silhouette')
    heads.push(pose.head[0]); feet.push(pose.frontLeg.end[0])
    if (previous) assert.ok(Math.hypot(pose.head[0] - previous[0], pose.head[1] - previous[1]) < .05, 'the sway advances quietly without a snap')
    previous = pose.head
  }
  const range = values => Math.max(...values) - Math.min(...values)
  assert.ok(range(heads) > 1 && range(heads) < 3, 'the torso visibly sways through only a few degrees')
  assert.ok(range(feet) > 1 && range(feet) < 4, 'the ankles drift gently while floating')
  if (submerged) assert.ok(Math.abs(center(p) - depth) < .01, 'the resting sway preserves underwater positioning')
})

test('a gentle controller vertical deflection gives precise underwater steering before it requests a climb', () => {
  const p = swimmer(), f = field(), controller = createJumpController()
  const pad = { index: 0, id: 'Underwater steering', connected: true, mapping: 'standard', axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }
  controller.sample([pad], 'playing', 0)
  pad.axes[1] = -.45
  let intent
  for (let i = 0; i < 180; i++) {
    intent = controller.sample([pad], 'playing', i * STEP * 1000)
    stepPlayer(p, intent, STEP, [], undefined, undefined, undefined, f)
  }
  assert.equal(intent.climb, false, 'a gentle swim input does not acquire a ladder or grip')
  assert.ok(p.vy < -15 && p.vy > -50, 'the stick controls upward pace continuously')
  assert.ok(p.waterMotion.dive < -.9, 'the swimmer leads the gentle ascent with the head')
})

for (const dt of [STEP, 1 / 30]) for (const held of [dt, .18]) {
  test(`holding the stick down through a bank jump slows into a controlled dive: jump hold=${held}, dt=${dt}`, () => {
    const level = parseLevel(JSON.parse(readFileSync(new URL('./fixtures/jumping/single-block-pool.json', import.meta.url), 'utf8')))
    const run = createRun(level), controller = createJumpController()
    const pad = { index: 0, id: 'Dive entry', connected: true, mapping: 'standard', axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }
    let now = 0, entry = null, checked = false, highest = run.player.y
    controller.sample([pad], 'playing', now)
    const step = () => { now += dt * 1000; stepRun(run, controller.sample([pad], 'playing', now), dt) }
    pad.axes[0] = 1
    for (let i = 0; i < Math.round(1 / dt); i++) step()
    pad.axes[1] = 1
    for (let i = 0; i < Math.round(3 / dt); i++) {
      pad.buttons[0].pressed = i < Math.round(held / dt); pad.buttons[0].value = Number(pad.buttons[0].pressed)
      step()
      const p = run.player
      highest = Math.min(highest, p.y)
      if (!entry && center(p) > 315 && p.vy > 100 && p.waterMotion) entry = { frame: i, center: center(p), speed: p.vy }
      if (entry && i === entry.frame + Math.round(.5 / dt)) {
        assert.ok(entry.speed > 250, 'the test really carries jumping momentum into the water')
        assert.ok(p.vy < 125, 'holding Down cannot remove resistance to the fast entry')
        assert.ok(center(p) - entry.center < 135, 'the entry slows before plunging through the pool')
        checked = true
      }
    }
    assert.ok(highest < level.spawn.y - 30, 'a normal jump still lifts off the bank')
    assert.ok(checked, 'the route reaches and checks the water entry')
    assert.ok(!run.player.grounded && run.player.vy > 60 && run.player.vy < 80, 'the diagonal dive settles to its ordinary normalized pace')
  })
}

for (const dt of [STEP, 1 / 30]) test(`a fast fall meets water resistance while Down remains held at ${dt}`, () => {
  const p = swimmer(), f = field(); p.y = 100
  let entry = null, checked = false
  for (let i = 0; i < Math.round(2 / dt); i++) {
    stepPlayer(p, { ...NEUTRAL_INPUT, descend: true, swimVertical: 1 }, dt, [], undefined, undefined, undefined, f)
    if (!entry && center(p) > 390 && p.vy > 100) entry = { frame: i, center: center(p), speed: p.vy }
    if (entry && i === entry.frame + Math.round(.5 / dt)) {
      assert.ok(entry.speed > 700, 'the fall enters substantially faster than a dive')
      assert.ok(p.vy < 125 && p.vy >= 99, 'water smoothly sheds excess speed and keeps normal dive propulsion')
      assert.ok(center(p) - entry.center < 145)
      checked = true
    }
  }
  assert.ok(checked)
  assert.ok(p.vy > 99 && p.vy < 101)
})

const tunnel = () => {
  const level = parseLevel(JSON.parse(readFileSync(new URL('./fixtures/jumping/water-tunnel.json', import.meta.url), 'utf8')))
  assert.deepEqual(levelProblems(level), [])
  return level
}
for (const dt of [STEP, 1 / 30]) test(`a fresh flooded passage run collects underwater items, reverses, and exits with ordinary inputs at ${dt}`, () => {
  const run = createRun(tunnel())
  const step = (seconds, intent) => { for (let i = 0; i < Math.round(seconds / dt); i++) stepRun(run, { ...NEUTRAL_INPUT, ...intent }, dt) }
  step(8, { climb: true })
  step(2.4, { descend: true }); step(1, {})
  assert.ok(center(run.player) > 630 && center(run.player) < 670)
  step(7.7, { move: 1 })
  assert.equal(run.coinsCollected, 3, 'the submerged collectibles remain reachable across the covered corridor')
  assert.ok(run.player.x > 1140 && Math.abs(run.player.vy) < .1)
  step(1.2, { move: -1 }); step(2.6, { move: 1 })
  assert.ok(run.player.x > 1250, 'a reversal can recover in the flooded passage')
  step(4, { climb: true }); step(6, { move: 1, climb: true })
  assert.equal(run.finished, true, 'the swimmer reaches the real exit after pulling out over the bank')
})
