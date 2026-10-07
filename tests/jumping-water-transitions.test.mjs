import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial } from '../src/games/jumping/level.ts'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { createPlayer, stepPlayer, NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { athletePose, handOutline } from '../src/games/jumping/athlete.ts'
import { nearestBoundary, pointInside } from '../src/games/jumping/geometry.ts'
import { FOOT_CONTACT, footPoint } from '../src/games/jumping/footwork.ts'
import { createGravityField, updateGravityField, playerWaterCenterOffset } from '../src/games/jumping/gravity.ts'

const water = { id: 'water', x: 200, y: 400, w: 1000, h: 520, gravity: -1, effect: 'water', power: 'always' }
const rigPoints = pose => [pose.hip, pose.waist, pose.shoulder, pose.head,
  ...[pose.frontArm, pose.backArm, pose.frontLeg, pose.backLeg].flatMap(limb => [limb.root, limb.joint, limb.end])]

/** Test the visible rig, rather than just the narrower controller hull. Palms
 * and soles may touch a boundary; bones and the head must remain outside. */
function checkFrame(p, previous, dt, label) {
  const pose = athletePose(p), points = rigPoints(pose)
  assert.ok(points.flat().every(Number.isFinite), `${label}: finite pose`)
  assert.equal(pose.backView ?? 0, 0, `${label}: side profile`)
  for (const limb of [pose.frontArm, pose.backArm, pose.frontLeg, pose.backLeg]) {
    const leg = 'footAngle' in limb
    const upper = Math.hypot(limb.joint[0] - limb.root[0], limb.joint[1] - limb.root[1], limb.jointDepth ?? 0)
    const lower = Math.hypot(limb.end[0] - limb.joint[0], limb.end[1] - limb.joint[1], (limb.endDepth ?? 0) - (limb.jointDepth ?? 0))
    assert.ok(Math.abs(upper - (leg ? 15 : 10)) < .001, `${label}: upper bone length`)
    assert.ok(Math.abs(lower - (leg ? 14.5 : 9)) < .001, `${label}: lower bone length`)
  }
  const center = [p.x, p.y + playerWaterCenterOffset(p)]
  const shoulder = [p.x + pose.shoulder[0] * p.facing, p.y + pose.shoulder[1]]
  if (previous) {
    const travel = Math.hypot(center[0] - previous.center[0], center[1] - previous.center[1])
    assert.ok(travel < dt * 600 + 1, `${label}: displaced center cannot teleport`)
    assert.ok(Math.hypot(shoulder[0] - previous.shoulder[0], shoulder[1] - previous.shoulder[1]) < travel + dt * 300 + 1, `${label}: torso cannot snap (${Math.hypot(shoulder[0] - previous.shoulder[0], shoulder[1] - previous.shoulder[1]).toFixed(2)})`)
  }
  const clear = (point, radius, name) => {
    const x = p.x + point[0] * p.facing, y = p.y + point[1]
    for (const b of p.terrain ?? []) {
      if (x < b.x - radius || x > b.x + b.w + radius || y < b.y - radius || y > b.y + b.h + radius) continue
      const distance = nearestBoundary(b, x, y).distance
      const penetration = pointInside(b, x, y) ? radius + distance : radius - distance
      assert.ok(penetration < .15, `${label}: ${name} clips a solid by ${penetration.toFixed(2)} at (${x.toFixed(1)}, ${y.toFixed(1)})`)
    }
  }
  clear(pose.head, 6.2, 'head')
  for (const [name, a, b, radius] of [
    ['pelvis', pose.hip, pose.waist, 2.8], ['chest', pose.waist, pose.shoulder, 2.8],
    ...[pose.frontArm, pose.backArm, pose.frontLeg, pose.backLeg].flatMap((limb, i) => [
      [`limb ${i} upper`, limb.root, limb.joint, 1.5], [`limb ${i} lower`, limb.joint, limb.end, 1.5],
    ]),
  ]) for (let i = 0; i <= 4; i++) clear([a[0] + (b[0] - a[0]) * i / 4, a[1] + (b[1] - a[1]) * i / 4], radius, name)
  for (const leg of [pose.frontLeg, pose.backLeg]) for (const point of FOOT_CONTACT) {
    const sole = footPoint(point, leg.footAngle * leg.footFacing, leg.toeAngle * leg.footFacing)
    clear([leg.end[0] + sole[0] * leg.footFacing, leg.end[1] + sole[1]], 0, 'sole')
  }
  for (const arm of [pose.frontArm, pose.backArm]) for (const point of handOutline(arm)) clear(point, 0, 'drawn palm')
  return { center, shoulder }
}

function exercise(level, direction, speed, dt, setup) {
  const run = createRun({ ...blankTrial(), goal: { id: 'closed', x: 1600, y: 920, power: 'switched' }, gravityPlates: [water], ...level })
  run.started = true; run.player.grounded = false; run.player.coyote = 0
  setup?.(run)
  let previous = null, waterFrames = 0
  const stages = [
    [1.6, { move: direction * speed }], [.25, {}],
    [1.6, { move: -direction * speed }], [.8, { descend: true, move: -direction * speed }],
    [.8, { climb: true }], [.8, {}],
  ]
  for (const [seconds, intent] of stages) for (let i = 0; i < Math.round(seconds / dt); i++) {
    stepRun(run, { ...NEUTRAL_INPUT, ...intent }, dt)
    const p = run.player
    if (!p.waterMotion || p.hang || p.mantle || p.releaseTurn) { previous = null; continue }
    previous = checkFrame(p, previous, dt, `input ${JSON.stringify(intent)}, frame ${i}`); waterFrames++
  }
  assert.ok(waterFrames > 1 / dt, 'the route actually exercises swimming transitions')
}

for (const dt of [STEP, 1 / 30]) for (const direction of [-1, 1]) for (const speed of [.2, .5, 1]) {
  for (const kind of ['box', 'ball']) test(`water transitions beside a ${kind}: direction=${direction}, input=${speed}, dt=${dt}`, () => {
    exercise({ spawn: { x: 600 - direction * 52, y: 450.34 }, props: [{ kind, x: 600, y: 440, size: 80 }] }, -direction, speed, dt)
  })
  test(`standing on a floating box then swimming: direction=${direction}, input=${speed}, dt=${dt}`, () => {
    exercise({ spawn: { x: 600, y: 330 }, props: [{ kind: 'box', x: 600, y: 460, size: 120 }] }, direction, speed, dt,
      run => { for (let i = 0; i < Math.round(3 / dt); i++) stepRun(run, NEUTRAL_INPUT, dt) })
  })
  test(`standing on a pool bank then swimming: direction=${direction}, input=${speed}, dt=${dt}`, () => {
    const bank = direction > 0 ? { x: 0, y: 400, w: 450, h: 520 } : { x: 850, y: 400, w: 950, h: 520 }
    exercise({ spawn: { x: direction > 0 ? 435 : 865, y: 400 }, platforms: [bank], gravityPlates: [{ ...water, x: 450, w: 400 }] }, direction, speed, dt)
  })
  for (const crouch of [false, true]) test(`standing on the pool floor then swimming: crouch=${crouch}, direction=${direction}, input=${speed}, dt=${dt}`, () => {
    exercise({ spawn: { x: 550, y: 920 }, platforms: [{ x: 600, y: 840, w: 80, h: 80 }] }, direction, speed, dt,
      run => { for (let i = 0; i < Math.round(.5 / dt); i++) stepRun(run, { ...NEUTRAL_INPUT, descend: true, crouch }, dt) })
  })
}

for (const direction of [-1, 1]) for (const speed of [.2, 1]) {
  test(`water transitions between close floats: direction=${direction}, input=${speed}`, () => {
    exercise({ spawn: { x: 660, y: 450.34 }, props: [{ kind: 'box', x: 600, y: 440, size: 80 }, { kind: 'box', x: 730, y: 440, size: 80 }] }, direction, speed, STEP)
  })
  test(`water transitions beneath a low ceiling: direction=${direction}, input=${speed}`, () => {
    exercise({ spawn: { x: 650, y: 580 }, platforms: [{ x: 400, y: 480, w: 500, h: 40 }], gravityPlates: [{ ...water, y: 0, h: 920 }] }, direction, speed, STEP)
  })
}

for (const dt of [STEP, 1 / 30]) for (const side of [-1, 1]) for (const size of [40, 80]) {
  test(`drawn hands clear a floating ${size}-unit ball through rest, pushing and release: side=${side}, dt=${dt}`, () => {
    const run = createRun({ ...blankTrial(), spawn: { x: 600 - side * (size / 2 + 12), y: 450.34 },
      props: [{ kind: 'ball', x: 600, y: 400 + size / 2, size }], gravityPlates: [water],
      goal: { id: 'closed', x: 1500, y: 920, power: 'switched' } })
    run.started = true; run.player.grounded = false; run.player.coyote = 0; run.player.facing = side
    let previous = null, pushingFrames = 0, restingFrames = 0
    for (const [seconds, input] of [[5, {}], [2, { move: side }], [2, {}], [1, { move: -side }]]) {
      for (let i = 0; i < Math.round(seconds / dt); i++) {
        stepRun(run, { ...NEUTRAL_INPUT, ...input }, dt)
        const p = run.player
        assert.ok(p.waterMotion && !p.hang && !p.mantle, 'the route remains in the water')
        previous = checkFrame(p, previous, dt, `ball ${size}, side ${side}, input ${JSON.stringify(input)}, frame ${i}`)
        if ((p.pushing?.amount ?? 0) > .5) pushingFrames++
        if (p.waterMotion.amount < .01) restingFrames++
      }
    }
    assert.ok(pushingFrames > .5 / dt, 'checks sustained physical pushing contact')
    assert.ok(restingFrames > 3 / dt, 'checks the full resting bob cycle beside the ball')
  })
}

for (const dt of [STEP, 1 / 30]) for (const start of ['surface', 'deep', 'diving', 'swimming']) {
  test(`holding Up returns to the same neck-depth float without levitation: start=${start}, dt=${dt}`, () => {
    const field = createGravityField()
    updateGravityField(field, [water], new Map(), true)
    const p = createPlayer({ x: 600, y: start === 'deep' ? 700 : 450.34 })
    p.grounded = false; p.coyote = 0
    const advance = (player, input, seconds) => {
      for (let i = 0; i < Math.round(seconds / dt); i++) stepPlayer(player, input, dt, [], undefined, undefined, undefined, field)
    }
    if (start === 'diving') advance(p, { ...NEUTRAL_INPUT, descend: true }, .9)
    if (start === 'swimming') advance(p, { ...NEUTRAL_INPUT, move: 1 }, 1.5)
    const passive = structuredClone(p)
    advance(passive, NEUTRAL_INPUT, 10)
    let previous = null
    for (let i = 0; i < Math.round(10 / dt); i++) {
      stepPlayer(p, { ...NEUTRAL_INPUT, climb: true }, dt, [], undefined, undefined, undefined, field)
      previous = checkFrame(p, previous, dt, `${start}: Up frame ${i}`)
      assert.equal(p.swimAcceleration, 0, 'Up uses buoyancy without an upward motor')
      assert.ok(p.vy >= -86, 'returning to the surface remains at the upright float pace')
    }
    assert.ok(Math.abs(p.y - passive.y) < .02, 'holding Up does not change the surface equilibrium')
    assert.ok(Math.abs(p.y + athletePose(p).shoulder[1] - 2 - water.y) < 3, 'water stays at the neck')
    assert.ok(Math.abs(p.vy) < 4, 'a held Up input settles into the same small bob as idle floating')
    assert.equal(p.waterMotion.amount, 0)
  })
}
