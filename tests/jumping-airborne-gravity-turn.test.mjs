import test from 'node:test'
import assert from 'node:assert/strict'
import { createPlayer, stepPlayer, NEUTRAL_INPUT, TUNING, respawn } from '../src/games/jumping/model.ts'
import { createGravityField, updateGravityField } from '../src/games/jumping/gravity.ts'
import { playerTurnAngle } from '../src/games/jumping/ropeGravity.ts'
import { athletePose } from '../src/games/jumping/athlete.ts'
import { bodyPolygon, moveBody, polygonIntersects } from '../src/games/jumping/geometry.ts'
import { blankTrial } from '../src/games/jumping/level.ts'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { createRope } from '../src/games/jumping/climbables.ts'
import { mirrorPlatform, mirrorPlayerState } from '../src/games/jumping/gravityFrame.ts'

const close = (a, b, tolerance = 1e-6) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`)
function field(gravity) {
  const result = createGravityField()
  updateGravityField(result, [{ id: 'g', x: -10000, y: -10000, w: 20000, h: 20000, gravity, power: 'always' }], new Map(), true)
  return result
}
function center(p) {
  const angle = playerTurnAngle(p), flip = p.inverted ? -1 : 1
  return [p.x + Math.sin(angle) * 31 * flip, p.y - Math.cos(angle) * 31 * flip]
}
function joints(p) {
  const pose = athletePose(p), c = center(p), flip = p.inverted ? -1 : 1
  return [pose.hip, pose.waist, pose.shoulder, pose.head,
    ...[pose.frontArm, pose.backArm, pose.frontLeg, pose.backLeg].flatMap(limb => [limb.root, limb.joint, limb.end])]
    .map(([x, y]) => [p.x + x * p.facing - c[0], p.y + y * flip - c[1]])
}

for (const dt of [1 / 120, 1 / 30]) for (const inverted of [false, true]) for (const facing of [-1, 1]) {
  test(`airborne roll finishes before contact and preserves motion (${inverted}, ${facing}, ${1 / dt} Hz)`, () => {
    const p = createPlayer({ x: 500, y: 1000 }), gravity = inverted ? 1 : -1
    Object.assign(p, { inverted, facing, grounded: false, coyote: 0, vy: gravity * 100 })
    const g = inverted ? undefined : field(gravity) // Ordinary gravity needs no field.
    let previous = joints(p), expectedY = center(p)[1], velocity = p.vy, turned = false, gathered = false
    for (let i = 0; i < .8 / dt; i++) {
      velocity = Math.max(-1100, Math.min(1100, velocity + gravity * TUNING.gravity * dt)); expectedY += velocity * dt
      stepPlayer(p, NEUTRAL_INPUT, dt, [], undefined, undefined, undefined, g)
      close(p.vy, velocity); close(center(p)[0], 500); close(center(p)[1], expectedY)
      assert.equal(p.grounded, false)
      turned ||= Math.abs(playerTurnAngle(p)) > .5
      gathered ||= (p.releaseTurn?.progress ?? 0) > .4 && (p.releaseTurn?.progress ?? 0) < .6
      const pose = athletePose(p), current = joints(p)
      if (i === Math.round(.3 / dt)) {
        const snapshot = structuredClone(p); athletePose(p); assert.deepEqual(p, snapshot, 'turn rendering is read-only')
      }
      for (let j = 0; j < current.length; j++) assert.ok(Math.hypot(current[j][0] - previous[j][0], current[j][1] - previous[j][1]) < 900 * dt + 1,
        `joint ${j} jumps at frame ${i}`)
      for (const limb of [pose.frontArm, pose.backArm, pose.frontLeg, pose.backLeg]) {
        const leg = 'footAngle' in limb
        close(Math.hypot(limb.joint[0] - limb.root[0], limb.joint[1] - limb.root[1], limb.jointDepth ?? 0), leg ? 15 : 10)
        close(Math.hypot(limb.end[0] - limb.joint[0], limb.end[1] - limb.joint[1], (limb.endDepth ?? 0) - (limb.jointDepth ?? 0)), leg ? 14.5 : 9)
        if (!leg && limb.hand) assert.ok(Math.hypot(limb.hand[0] - limb.end[0], limb.hand[1] - limb.end[1]) < 3, 'the palm follows the tucked wrist')
      }
      previous = current
    }
    assert.ok(turned && gathered)
    assert.equal(p.inverted, !inverted); assert.equal(p.releaseTurn, undefined)
    assert.equal(p.facing, -facing)
    const snapshot = structuredClone(p); athletePose(p); assert.deepEqual(p, snapshot)
  })
}

for (const dt of [1 / 120, 1 / 30]) test(`a blocked roll waits for room and finishes after steering clear (${1 / dt} Hz)`, () => {
  const p = createPlayer({ x: 0, y: 500 }), g = field(-1)
  const terrain = [{ x: -32, y: -2000, w: 20, h: 5000 }, { x: 12, y: -2000, w: 20, h: 2800 }]
  p.grounded = false
  for (let i = 0; i < 1 / dt; i++) {
    stepPlayer(p, NEUTRAL_INPUT, dt, terrain, undefined, undefined, undefined, g)
    assert.ok(!terrain.some(b => polygonIntersects(bodyPolygon(p.x, p.y, 62, p.inverted ? -1 : 1, playerTurnAngle(p)), b, .001)))
    assert.ok(Math.abs(p.x) < 1, 'rotation cannot eject the body from the shaft')
  }
  assert.equal(p.inverted, false); assert.ok(p.releaseTurn || p.wallBrace?.active, 'the narrow passage retains a blocked turn or an actual brace')
  for (let i = 0; i < 2 / dt; i++) stepPlayer(p, { ...NEUTRAL_INPUT, move: 1 }, dt, [], undefined, undefined, undefined, g)
  assert.equal(p.inverted, true); assert.equal(p.releaseTurn, undefined); assert.ok(p.x > 100)
})

for (const dt of [1 / 120, 1 / 30]) for (const inverted of [false, true]) for (const crouching of [false, true]) for (const complete of [false, true]) {
  test(`a low chamber allows a partial roll to ${complete ? 'finish' : 'unwind'} crouched (${inverted}, ${crouching}, ${1 / dt} Hz)`, () => {
    const p = createPlayer({ x: 109, y: 570 })
    Object.assign(p, { grounded: false, coyote: 0, crouching, crouch: Number(crouching),
      releaseTurn: { angle: Math.PI / 2, target: Math.PI, progress: .5, time: .18 } })
    let terrain = [{ x: -100, y: 500, w: 500, h: 40 }, { x: -100, y: 600, w: 500, h: 100 }]
    if (inverted) { mirrorPlayerState(p); p.inverted = true; terrain = terrain.map(mirrorPlatform) }
    const g = inverted === complete ? undefined : field(-1)
    for (let tick = 0; tick < 1.5 / dt; tick++) {
      stepPlayer(p, NEUTRAL_INPUT, dt, terrain, undefined, undefined, undefined, g)
      const hull = bodyPolygon(p.x, p.y, p.crouching ? TUNING.crouchHeight : TUNING.height, p.inverted ? -1 : 1, playerTurnAngle(p))
      assert.ok(!terrain.some(b => polygonIntersects(hull, b, .001)), 'the complete turn stays inside the 60-unit clearance')
    }
    assert.equal(p.inverted, complete ? !inverted : inverted); assert.equal(p.releaseTurn, undefined)
    assert.equal(p.grounded, true); assert.equal(p.crouching, true)
    assert.equal(p.crouch, 1, 'the completed pose retains the compact stance required by the ceiling')
  })
}

test('a gravity reversal unwinds a partial roll, zero gravity holds it, and respawn clears it', () => {
  const p = createPlayer({ x: 0, y: 500 }); p.grounded = false
  const reverse = field(-1), zero = field(0)
  for (let i = 0; i < 24; i++) stepPlayer(p, NEUTRAL_INPUT, 1 / 120, [], undefined, undefined, undefined, reverse)
  const angle = playerTurnAngle(p), progress = p.releaseTurn.progress
  assert.ok(angle > .5 && angle < Math.PI)
  for (let i = 0; i < 30; i++) stepPlayer(p, NEUTRAL_INPUT, 1 / 120, [], undefined, undefined, undefined, zero)
  close(playerTurnAngle(p), angle); close(p.releaseTurn.progress, progress)
  for (let i = 0; i < 40; i++) stepPlayer(p, NEUTRAL_INPUT, 1 / 120)
  assert.equal(p.inverted, false); assert.equal(p.releaseTurn, undefined)
  stepPlayer(p, NEUTRAL_INPUT, 1 / 120, [], undefined, undefined, undefined, reverse)
  assert.ok(p.releaseTurn); respawn(p); assert.equal(p.releaseTurn, undefined)
})

test('small-angle sweeps retain ceilings touched beyond the unrotated height', () => {
  const ceiling = { x: -10000000, y: -10000000, w: 20000000, h: 10000000 }
  const angle = .0012, start = [160, 62.0072]
  const safe = moveBody(start, start, [ceiling], 62, 1, angle)
  assert.ok(safe.contacts.length > 0)
  assert.ok(!polygonIntersects(bodyPolygon(safe.x, safe.y, 62, 1, angle), ceiling, .001))
})

test('an airborne flip cannot simultaneously acquire an unrotated ledge hold', () => {
  const p = createPlayer({ x: 486, y: 400 + TUNING.hangReach })
  Object.assign(p, { grounded: false, coyote: 0,
    releaseTurn: { angle: -Math.PI / 2, target: -Math.PI, progress: .5, time: .2 } })
  stepPlayer(p, NEUTRAL_INPUT, 1 / 120, [{ x: 500, y: 400, w: 220, h: 220 }], undefined, undefined, undefined, field(-1))
  assert.equal(p.hang, null); assert.ok(p.releaseTurn)
})

for (const dt of [1 / 120, 1 / 30]) for (const inverted of [false, true]) {
  test(`a ledge hold releases into a roll when its gravity reverses (${inverted}, ${1 / dt} Hz)`, () => {
    const p = createPlayer({ x: 486, y: 400 + TUNING.hangReach })
    p.grounded = false; p.coyote = 0
    const terrain = [{ x: 500, y: 400, w: 220, h: 220 }].map(b => inverted ? mirrorPlatform(b) : b)
    if (inverted) { mirrorPlayerState(p); p.inverted = true }
    const initial = inverted ? field(-1) : undefined
    for (let i = 0; i < .4 / dt; i++) stepPlayer(p, NEUTRAL_INPUT, dt, terrain, undefined, undefined, undefined, initial)
    assert.ok(p.hang)
    const before = joints(p), reversed = inverted ? undefined : field(-1)
    stepPlayer(p, NEUTRAL_INPUT, dt, terrain, undefined, undefined, undefined, reversed)
    assert.equal(p.hang, null); assert.ok(p.releaseTurn); assert.ok(p.grabCooldown > 0)
    const after = joints(p)
    for (let j = 0; j < after.length; j++) assert.ok(Math.hypot(after[j][0] - before[j][0], after[j][1] - before[j][1]) < 900 * dt + 1,
      'releasing the invalid hold preserves its outgoing pose')
    for (let i = 0; i < .6 / dt; i++) stepPlayer(p, { ...NEUTRAL_INPUT, move: -1 }, dt, terrain, undefined, undefined, undefined, reversed)
    assert.equal(p.inverted, !inverted)
  })
}

for (const dt of [1 / 120, 1 / 30]) for (const inverted of [false, true]) for (const phase of [.2, .5, .8]) {
  test(`a rope catches the actual hands during a flip (${inverted}, ${phase}, ${1 / dt} Hz)`, () => {
    const p = createPlayer({ x: 500, y: 1000 }), g = inverted ? undefined : field(-1)
    Object.assign(p, { inverted, grounded: false, coyote: 0, vy: inverted ? 100 : -100 })
    while ((p.releaseTurn?.progress ?? 0) < phase) stepPlayer(p, NEUTRAL_INPUT, dt, [], undefined, undefined, undefined, g)
    const pose = athletePose(p), flip = inverted ? -1 : 1
    const definition = { x: p.x + pose.frontArm.end[0] * p.facing, y: p.y + pose.frontArm.end[1] * flip - 500, length: 1000 }
    const world = { ladders: [], ropes: [definition] }
    p.ropes = [createRope(definition)]
    const angle = playerTurnAngle(p), before = joints(p)
    stepPlayer(p, NEUTRAL_INPUT, dt, [], world, undefined, undefined, g)
    assert.equal(p.climbing?.kind, 'rope'); assert.equal(p.releaseTurn, undefined)
    close(playerTurnAngle(p), angle)
    assert.ok(p.climbing.caught.releaseTurn, 'the catch retains the outgoing roll')
    const after = joints(p)
    for (let i = 0; i < after.length; i++) assert.ok(Math.hypot(after[i][0] - before[i][0], after[i][1] - before[i][1]) < 2,
      `the catch replaces joint ${i} before its blend begins`)
    const snapshot = structuredClone(p); athletePose(p); assert.deepEqual(p, snapshot)
    let previous = after
    for (let i = 0; i < .3 / dt; i++) {
      stepPlayer(p, NEUTRAL_INPUT, dt, [], world, undefined, undefined, g)
      const current = joints(p)
      for (let j = 0; j < current.length; j++) assert.ok(Math.hypot(current[j][0] - previous[j][0], current[j][1] - previous[j][1]) < 1200 * dt + 1,
        `joint ${j} jumps during the turning rope catch at frame ${i}`)
      previous = current
    }
    assert.equal(p.climbing?.kind, 'rope')
    stepPlayer(p, { ...NEUTRAL_INPUT, detach: true }, dt, [], world, undefined, undefined, g)
    assert.equal(p.climbing, null)
  })
}

for (const dt of [1 / 120, 1 / 30]) for (const gravity of [1, -1]) test(`R-bot turns in flight under gravity ${gravity} (${1 / dt} Hz)`, () => {
  const level = { ...blankTrial(), height: 3000, floor: 3000, entrance: { x: 160, y: 3000 },
    robots: [{ kind: 'repulsor', x: 800, y: 1500, left: 26, right: 1774 }],
    gravityPlates: gravity < 0 ? [{ id: 'g', x: 0, y: 0, w: 1800, h: 3000, gravity, power: 'always' }] : [] }
  const run = createRun(level), bot = run.robots[0], actor = bot.actor
  Object.assign(actor, { inverted: gravity > 0, grounded: false, coyote: 0, vx: 0, vy: gravity * 100 })
  let turning = false, previous = joints(actor)
  for (let i = 0; i < .8 / dt; i++) {
    stepRun(run, NEUTRAL_INPUT, dt)
    turning ||= Math.abs(playerTurnAngle(actor)) > .5
    assert.equal(actor.grounded, false)
    const current = joints(actor)
    for (let j = 0; j < current.length; j++) assert.ok(Math.hypot(current[j][0] - previous[j][0], current[j][1] - previous[j][1]) < 900 * dt + 1,
      `R-bot joint ${j} jumps at frame ${i}`)
    previous = current
  }
  assert.ok(turning); assert.equal(actor.inverted, gravity < 0); assert.equal(actor.releaseTurn, undefined)
})
