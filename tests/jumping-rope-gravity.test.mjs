import test from 'node:test'
import assert from 'node:assert/strict'
import { createPlayer, stepPlayer, NEUTRAL_INPUT, STEP, TUNING, respawn, playerState } from '../src/games/jumping/model.ts'
import { createRope, ropeGripDistance, ropePoint, stepRope } from '../src/games/jumping/climbables.ts'
import { createGravityField, updateGravityField, gravityAtPoint, playerGravity } from '../src/games/jumping/gravity.ts'
import { athletePose } from '../src/games/jumping/athlete.ts'
import { bodyPolygon, polygonIntersects } from '../src/games/jumping/geometry.ts'
import { mirrorPlayerState, mirrorPlatform } from '../src/games/jumping/gravityFrame.ts'
import { playerTurnAngle } from '../src/games/jumping/ropeGravity.ts'
import { blankTrial, levelPlayer, levelTerrain, prepareLevelRopes } from '../src/games/jumping/level.ts'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { ballShape, boxShape } from '../src/games/jumping/propGeometry.ts'
import { ropeSlope } from './helpers/rope-slope.mjs'
import { ropePath } from '../src/games/jumping/climbables.ts'
import { lineBlocked } from '../src/games/jumping/geometry.ts'

function scene({ inverted = true, power = true, terrain = [], facing = 1, plate = {} } = {}) {
  const definition = { x: 500, y: inverted ? 800 : 100, length: 600, segments: 75 }
  const rope = createRope(definition), p = createPlayer({ x: 500 - facing * 10, y: inverted ? 380 : 480 })
  if (inverted) for (let i = 0; i < rope.nodes.length; i++) Object.assign(rope.nodes[i], { y: 800 - i * 8, oldY: 800 - i * 8 })
  Object.assign(p, { inverted, grounded: false, coyote: 0, facing, ropes: [rope] })
  const world = { ladders: [], ropes: [definition] }, field = createGravityField()
  const plates = [{ id: 'g', x: 0, y: 0, w: 1000, h: 1200, gravity: -1, ...plate }]
  const setPower = enabled => updateGravityField(field, plates, new Map([['g', enabled]]), true)
  setPower(power)
  const tick = (extras = {}, count = 1) => { for (let i = 0; i < count; i++) stepPlayer(p, { ...NEUTRAL_INPUT, ...extras }, STEP, terrain, world, undefined, undefined, field) }
  return { p, rope, definition, field, plates, setPower, tick, terrain }
}
const close = (a, b, tolerance = .01) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`)
function clearBody(s) {
  const hull = bodyPolygon(s.p.x, s.p.y, TUNING.height, s.p.inverted ? -1 : 1, playerTurnAngle(s.p))
  assert.ok(!s.terrain.some(b => polygonIntersects(hull, b, .01)), `body at ${s.p.x}, ${s.p.y}, angle ${playerTurnAngle(s.p)}`)
}
function handsOnRope(p) {
  const pose = athletePose(p), grip = ropePoint(p.climbing.rope, ropeGripDistance(p.climbing))
  for (const arm of [pose.frontArm, pose.backArm]) {
    const hand = [p.x + arm.end[0] * p.facing, p.y + arm.end[1] * (p.inverted ? -1 : 1)]
    assert.ok(Math.hypot(hand[0] - grip[0], hand[1] - grip[1]) < 1.2, `hand ${hand}, grip ${grip}`)
  }
}

for (const facing of [-1, 1]) test(`an upside-down player catches, holds, climbs both screen directions and jumps downward (${facing})`, () => {
  const s = scene({ facing }); s.tick(); assert.equal(s.p.climbing?.kind, 'rope')
  s.tick({}, 90); assert.equal(s.p.inverted, true); handsOnRope(s.p)
  const y = s.p.y; s.tick({ climb: true }, 50); assert.ok(s.p.y < y - 20, 'Up moves upward on a floating rope')
  assert.equal(playerState(s.p), 'Rope · ascending')
  s.tick({}, 40); const upper = s.p.y; s.tick({ descend: true }, 40); assert.ok(s.p.y > upper + 20, 'Down moves downward')
  s.tick({}, 40); s.tick({ jump: true, move: facing })
  assert.equal(s.p.climbing, null); assert.ok(s.p.vy > 700, 'jump opposes reversed gravity')
  assert.ok(s.p.vx * facing >= 180); s.tick({ jump: true }); assert.equal(s.p.climbing, null, 'held jump cannot catch again')
  assert.equal(s.rope.definition, s.definition, 'the world-space definition is restored')
  close(s.rope.nodes[0].y, 800)
})

test('Up still moves upward when an inverted player catches a rope that hangs downward', () => {
  const s = scene(); for (let i = 0; i < s.rope.nodes.length; i++) Object.assign(s.rope.nodes[i], { y: 100 + i * 8, oldY: 100 + i * 8 })
  s.definition.y = 100; s.p.y = 400
  s.tick(); s.tick({}, 30); const y = s.p.y, distance = s.p.climbing.distance
  s.tick({ climb: true }, 20)
  assert.ok(s.p.y < y); assert.ok(s.p.climbing.distance < distance, 'screen controls follow the local tangent, not gravity')
})

test('switching gravity while holding turns around a retained grip, then returns upright without dropping', () => {
  const s = scene({ inverted: false, power: false, terrain: [{ x: -100, y: -100, w: 1200, h: 100 }] })
  s.tick(); s.tick({}, 90); s.setPower(true)
  let turned = false, sawTurn = false, last = [s.p.x, s.p.y]
  for (let i = 0; i < 150; i++) {
    s.tick(); assert.equal(s.p.climbing?.kind, 'rope'); clearBody(s)
    assert.ok(Math.hypot(s.p.x - last[0], s.p.y - last[1]) < 10, 'no root teleport during the turn')
    if (s.p.climbing.turn) { sawTurn = true; handsOnRope(s.p) }
    turned ||= !!s.p.inverted; last = [s.p.x, s.p.y]
  }
  assert.ok(sawTurn); assert.ok(turned); assert.equal(s.p.inverted, true)
  s.setPower(false); s.tick({}, 150)
  assert.equal(s.p.climbing?.kind, 'rope'); assert.equal(s.p.inverted, false); clearBody(s)
})

test('releasing a reverse-gravity rope preserves momentum without a downward kick', () => {
  const s = scene(); s.tick(); s.tick({ move: 1 }, 60); s.tick({}, 40)
  const before = { x: s.p.x, y: s.p.y, vx: s.p.vx, vy: s.p.vy }
  s.tick({ detach: true })
  assert.equal(s.p.climbing, null); close(s.p.vx, before.vx); close(s.p.vy, before.vy)
  close(s.p.x, before.x); close(s.p.y, before.y)
  s.tick({ detach: true }, 10); assert.equal(s.p.climbing, null); assert.ok(s.p.vy < before.vy)
})

test('a release midway through a turn preserves the occupied space and completes in free flight', () => {
  const s = scene({ inverted: false, power: false })
  s.tick(); s.tick({}, 90); s.setPower(true)
  for (let i = 0; i < 100 && Math.abs(s.p.climbing?.turn?.angle ?? 0) < .6; i++) s.tick()
  assert.ok(s.p.climbing.turn)
  const before = bodyPolygon(s.p.x, s.p.y, 62, 1, playerTurnAngle(s.p))
  s.tick({ detach: true })
  const after = bodyPolygon(s.p.x, s.p.y, 62, 1, playerTurnAngle(s.p))
  assert.equal(s.p.climbing, null); assert.ok(s.p.releaseTurn)
  for (let i = 0; i < before.length; i++) close(Math.hypot(before[i][0] - after[i][0], before[i][1] - after[i][1]), 0, 5)
  s.tick({ detach: true }, 70); assert.equal(s.p.releaseTurn, undefined); assert.equal(s.p.inverted, true)
  respawn(s.p); assert.equal(s.p.releaseTurn, undefined); assert.equal(s.p.inverted, false)
})

test('the body load uses averaged gravity when the hands are outside the field', () => {
  const field = createGravityField(); updateGravityField(field, [{ id: 'g', x: 0, y: 400, w: 1000, h: 800, gravity: -1, power: 'always' }], new Map(), true)
  const p = createPlayer({ x: 500, y: 450 }), gravity = playerGravity(field, p)
  assert.ok(gravity < 0); assert.equal(gravityAtPoint(field, 500, 394, 1400), 1400)
  const def = { x: 500, y: 100, length: 600, segments: 75 }, loaded = createRope(def), localOnly = createRope(def)
  const load = { distance: 294, move: 0 }
  stepRope(loaded, STEP, [], { ...load, gravity }, field)
  stepRope(localOnly, STEP, [], load, field)
  assert.ok(ropePoint(loaded, 294)[1] < ropePoint(localOnly, 294)[1], 'the player pulls upward although the gripped particle has ordinary gravity')
})

test('near-zero gravity retains rope orientation and material controls', () => {
  for (const inverted of [false, true]) {
    const s = scene({ inverted, plate: { gravity: 0 } }); s.tick(); s.tick({}, 90)
    assert.equal(s.p.inverted, inverted); assert.equal(s.p.climbing.turn, undefined)
    const y = s.p.y; s.tick({ climb: true }, 20); assert.ok(s.p.y < y)
  }
})

test('rope reflection is an involution including live nodes, bends, grip turns and authored anchors', () => {
  const s = scene(); s.tick(); s.tick({}, 40)
  s.p.climbing.turn = { angle: .4, target: Math.PI, grip: ropeGripDistance(s.p.climbing) }
  s.rope.bends[20] = [502, 635]
  const before = structuredClone(s.p), definition = s.rope.definition
  mirrorPlayerState(s.p, true); mirrorPlayerState(s.p, true)
  assert.deepEqual(s.p, before); assert.equal(s.rope.definition, definition)
})

test('reverse rope climbs transfer onto ceiling slopes on either side through the ordinary clear path', () => {
  for (const side of [false, true]) {
    const level = prepareLevelRopes(ropeSlope(side, { anchor: 'shoulder', length: 180 }))
    const terrain = levelTerrain(level).map(b => ({ ...mirrorPlatform(b), y: 920 - b.y - b.h }))
    const ropes = level.climbables.ropes.map(r => ({ ...r, y: 920 - r.y,
      rest: { ...r.rest, points: r.rest.points.map(([x, y]) => [x, 920 - y]), bends: r.rest.bends.map(b => b && [b[0], 920 - b[1]]) } }))
    const p = levelPlayer(level); Object.assign(p, { x: side ? 1100 : 700, y: 305, inverted: true, grounded: false, facing: side ? -1 : 1, ropes: ropes.map(createRope) })
    const field = createGravityField(); updateGravityField(field, [{ id: 'g', x: 0, y: 0, w: 1800, h: 920, gravity: -1, power: 'always' }], new Map(), true)
    let transferred = false, landed = false
    for (let i = 0; i < 480; i++) {
      stepPlayer(p, { ...NEUTRAL_INPUT, descend: true }, STEP, terrain, { ladders: [], ropes }, undefined, undefined, field)
      transferred ||= !!p.hang || !!p.mantle
      landed ||= p.grounded
      if (!p.mantle) assert.ok(!terrain.some(b => polygonIntersects(bodyPolygon(p.x, p.y, 62, -1), b, .01)), `clear body ${i}`)
      const rope = p.ropes[0], path = ropePath(rope.definition, rope)
      for (let j = 1; j < path.length; j++) assert.ok(!lineBlocked(path[j - 1], path[j], terrain), `clear rope ${i}, ${j}`)
    }
    assert.ok(transferred && landed); assert.equal(p.climbing, null); assert.equal(p.inverted, true)
    assert.ok(p.y > 520 && p.y < 530); close(side ? 1800 - p.x : p.x, 772)
  }
})

test('Down catches a rope from ceiling footing and Up transfers back onto the ceiling', () => {
  const s = scene({ terrain: [{ x: 0, y: -80, w: 1000, h: 80 }] })
  s.definition.y = 600
  for (let i = 0; i < s.rope.nodes.length; i++) Object.assign(s.rope.nodes[i], { y: 600 - i * 8, oldY: 600 - i * 8 })
  Object.assign(s.p, { x: 490, y: 0, grounded: true })
  s.tick({ descend: true }); assert.equal(s.p.climbing?.kind, 'rope')
  s.tick({ descend: true }, 70); assert.ok(s.p.y > 30)
  s.tick({ climb: true }, 110)
  assert.equal(s.p.climbing, null); assert.equal(s.p.grounded, true); assert.equal(s.p.inverted, true); close(s.p.y, 0)
})

test('a gravity turn blocked by a narrow passage keeps the grip and never rotates through its walls', () => {
  const terrain = [{ x: 420, y: -2000, w: 50, h: 4000 }, { x: 530, y: -2000, w: 50, h: 4000 }]
  const s = scene({ inverted: false, power: false, terrain, plate: { y: -2000, h: 4000 } })
  s.tick(); s.tick({}, 90); s.setPower(true)
  let blocked = false
  for (let i = 0; i < 180; i++) { s.tick(); clearBody(s); assert.equal(s.p.climbing?.kind, 'rope'); blocked ||= !!s.p.climbing.turn }
  assert.ok(blocked); assert.ok(s.p.climbing.turn, 'insufficient clearance keeps the turn pending')
  handsOnRope(s.p)
  s.tick({ jump: true, move: 1 }); assert.equal(s.p.climbing, null); assert.ok(s.p.vy > 400)
})

test('zero gravity pauses a partially completed turn without losing the material grip', () => {
  const s = scene({ inverted: false, power: false })
  s.tick(); s.tick({}, 90); s.setPower(true)
  for (let i = 0; i < 100 && Math.abs(s.p.climbing?.turn?.angle ?? 0) < .6; i++) s.tick()
  const angle = s.p.climbing.turn.angle, grip = s.p.climbing.turn.grip
  s.setPower(false); s.plates[0].gravity = 0; s.setPower(true)
  s.tick({}, 60)
  close(s.p.climbing.turn.angle, angle); close(s.p.climbing.turn.grip, grip); assert.equal(s.p.inverted, false)
  handsOnRope(s.p)
  s.setPower(false); s.tick({}, 80)
  assert.equal(s.p.inverted, false); assert.equal(s.p.climbing.turn, undefined)
})

for (const kind of ['box', 'ball']) test(`a gravity turn collides with a loose ${kind} using its actual rotated body`, () => {
  const level = { ...blankTrial(), spawn: { x: 490, y: 480 },
    climbables: { ladders: [], ropes: [{ x: 500, y: 100, length: 600, segments: 75 }] },
    props: [{ kind, x: 430, y: 500, size: 60 }],
    gravityPlates: [{ id: 'g', x: 0, y: 0, w: 1000, h: 920, gravity: -1, power: 'always' }] }
  const run = createRun(level); run.started = true
  let turned = false
  for (let i = 0; i < 200; i++) {
    stepRun(run, NEUTRAL_INPUT); const p = run.player, prop = run.props[0]
    turned ||= Math.abs(playerTurnAngle(p)) > .5
    const hull = bodyPolygon(p.x, p.y, 62, p.inverted ? -1 : 1, playerTurnAngle(p))
    assert.ok(!polygonIntersects(hull, kind === 'ball' ? ballShape(prop) : boxShape(prop), .05), `actual body stays outside ${kind} at ${i}`)
  }
  assert.ok(turned); assert.equal(run.player.climbing?.kind, 'rope')
})
