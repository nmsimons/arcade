import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial } from '../src/games/jumping/level.ts'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { NEUTRAL_INPUT, STEP, stepPlayer } from '../src/games/jumping/model.ts'
import { robotPlatforms, moveRobot } from '../src/games/jumping/robotPhysics.ts'
import { bodyIntersects, polygonIntersects, bodyPolygon } from '../src/games/jumping/geometry.ts'
import { groundAt } from '../src/games/jumping/terrain.ts'
import { staticContactWorld } from '../src/games/jumping/playerContacts.ts'

function fixture(direction = 1) {
  const level = blankTrial(); level.robots = [{ x: 900, y: 920, left: 100, right: 1700 }]
  const run = createRun(level); run.started = true
  Object.assign(run.robots[0], { facing: direction, phase: 'recover', time: -10 })
  Object.assign(run.player, { x: 900, y: 874 })
  return run
}
function clear(run) {
  const p = run.player
  for (const b of [...run.platforms, ...run.robots.flatMap(robotPlatforms)]) {
    assert.equal(polygonIntersects(bodyPolygon(p.x, p.y, p.crouching ? 40 : 62), b, .001), false, 'player remains outside all solids')
  }
}
function advance(run, frames, input = NEUTRAL_INPUT, dt = STEP) {
  for (let i = 0; i < frames; i++) { stepRun(run, input, dt); clear(run) }
}

test('a falling player lands on the chassis, can crouch there, and can jump away', () => {
  const run = fixture(); Object.assign(run.player, { y: 740, grounded: false })
  advance(run, 120)
  assert.equal(run.player.y, 874); assert.equal(run.player.grounded, true)
  assert.equal(run.player.contacts.support.collider.robot, run.robots[0])
  advance(run, 30, { ...NEUTRAL_INPUT, crouch: true })
  assert.equal(run.player.crouching, true); assert.equal(run.player.y, 874)
  advance(run, 12, { ...NEUTRAL_INPUT, jump: true }); advance(run, 1)
  assert.equal(run.player.grounded, false); assert.ok(run.player.vy < -300)
})

test('a rider follows the visible windup roof without a bounce or a forced launch', () => {
  const run = fixture(); run.robots[0].phase = 'chase'
  advance(run, 1)
  assert.equal(run.robots[0].phase, 'windup'); assert.equal(run.player.y, 881)
  assert.equal(run.player.grounded, true); assert.equal(run.player.vy, 0)
  while (run.robots[0].phase === 'windup') advance(run, 1)
  assert.equal(run.player.y, 874); assert.equal(run.player.grounded, true); assert.equal(run.player.vy, 0)
})

// Drive at a controlled speed to isolate shoe traction from the bot's targeting
// decisions. This uses the same bot hulls and player motor as the full run.
function drive(run, speed, dt, input = NEUTRAL_INPUT) {
  const r = run.robots[0], p = run.player, x = r.x
  moveRobot(run.platforms, r, r.x + speed * dt, [], p); r.vx = (r.x - x) / dt
  const colliders = [...staticContactWorld(run.platforms).colliders,
    ...robotPlatforms(r).map((platform, i) => ({ id: `robot:0:${i}`, platform, robot: r }))]
  const world = { colliders, platforms: colliders.map(c => c.platform) }
  stepPlayer(p, input, dt, world.platforms, undefined, undefined, world); clear(run)
}
for (const direction of [-1, 1]) for (const dt of [STEP, 1 / 60]) {
  test(`ordinary motion carries a standing rider ${direction < 0 ? 'left' : 'right'} at ${1 / dt} Hz`, () => {
    for (const speed of [92, 235]) {
      const run = fixture(direction)
      for (let i = 0; i < Math.round(1 / dt); i++) drive(run, speed * direction, dt)
      const p = run.player, r = run.robots[0]
      assert.equal(p.contacts.support?.collider.robot, r)
      assert.ok(Math.abs(p.x - r.x) < 24, 'limited acceleration catches up on the roof')
      assert.ok(Math.abs(p.vx - speed * direction) < .01)
      assert.ok(p.contacts.motion.speed < .01, 'standing transport does not become a walk animation')
      assert.ok(p.gait.moving < .01)
    }
  })
  test(`a charge leaves the rider behind ${direction < 0 ? 'left' : 'right'} at ${1 / dt} Hz`, () => {
    const run = fixture(direction), start = run.player.x
    run.robots[0].phase = 'charge'; run.robots[0].time = 0
    advance(run, Math.round(.15 / dt), NEUTRAL_INPUT, dt)
    assert.equal(run.player.grounded, false)
    assert.equal(run.player.hang, null); assert.equal(run.player.mantle, null)
    assert.ok(run.player.y > 874); assert.ok(run.player.vy > 0, 'gravity supplies the fall, without an upward kick')
    assert.ok((run.robots[0].x - run.player.x) * direction > 45)
    assert.ok(Math.abs(run.player.x - start) < 20, 'body does not snap to the charging bot')
    advance(run, Math.round(.2 / dt), NEUTRAL_INPUT, dt)
    assert.equal(run.player.y, 920); assert.equal(run.player.grounded, true)
  })
}

test('jumping off a moving bot retains earned horizontal momentum', () => {
  const run = fixture()
  for (let i = 0; i < 120; i++) drive(run, 92, STEP)
  for (let i = 0; i < 12; i++) drive(run, 92, STEP, { ...NEUTRAL_INPUT, jump: true })
  drive(run, 92, STEP)
  assert.equal(run.player.grounded, false)
  assert.ok(run.player.vx > 85 && run.player.vx <= 92)
  assert.ok(run.player.vy < -300)
})

for (const direction of [-1, 1]) for (const crouch of [false, true]) {
  test(`a solid charge pushes a ${crouch ? 'crouched' : 'standing'} player ${direction < 0 ? 'left' : 'right'} without a launch`, () => {
    const run = fixture(direction), p = run.player, r = run.robots[0]
    Object.assign(p, { x: r.x + direction * 100, y: 920, crouching: crouch })
    Object.assign(r, { phase: 'charge', time: 0 })
    const start = p.x
    advance(run, 50, { ...NEUTRAL_INPUT, crouch })
    assert.ok((p.x - start) * direction > 100)
    assert.equal(p.y, 920); assert.equal(p.vy, 0); assert.equal(p.grounded, true)
    assert.ok(Math.abs(p.vx) <= 541)
  })
  test(`a wall blocks the bot through a pinned ${crouch ? 'crouched' : 'standing'} player (${direction})`, () => {
    const level = blankTrial()
    level.robots = [{ x: 900, y: 920, left: 100, right: 1700 }]
    level.platforms = [{ x: direction > 0 ? 1020 : 740, y: 400, w: 40, h: 520 }]
    const run = createRun(level); run.started = true
    Object.assign(run.player, { x: 900 + direction * 100, y: 920, crouching: crouch })
    Object.assign(run.robots[0], { facing: direction, phase: 'charge', time: 0 })
    advance(run, 100, { ...NEUTRAL_INPUT, crouch })
    assert.ok((run.player.x - 900) * direction <= 108.01)
    assert.ok((run.robots[0].x - 900) * direction < 85)
  })
}

test('being close behind a charge does not trigger a proximity shove', () => {
  const run = fixture(); Object.assign(run.player, { x: 860, y: 920 })
  Object.assign(run.robots[0], { phase: 'charge', time: 0 })
  advance(run, 12)
  assert.equal(run.player.x, 860); assert.equal(run.player.vx, 0); assert.equal(run.player.y, 920)
})

for (const phase of ['patrol', 'windup', 'charge', 'recover']) for (const direction of [-1, 1]) {
  test(`${phase} has only a chassis and wheels, with no projecting mechanism (${direction})`, () => {
    const run = fixture(direction), r = run.robots[0]
    r.phase = phase; r.time = -10
    const shapes = robotPlatforms(r)
    assert.equal(shapes.length, 3)
    assert.ok(shapes.every(s => s.x >= r.x - 26 && s.x + s.w <= r.x + 26))
    assert.equal(groundAt(shapes, r.x + direction * 32, 880, 20), null, 'no invisible remnant of the mechanism')
    const x = r.x + direction * 18, ground = groundAt(shapes, x, 880, 20)
    assert.ok(ground)
    Object.assign(run.player, { x, y: ground.y, grounded: true })
    const world = { platforms: [...run.platforms, ...shapes], colliders: [...staticContactWorld(run.platforms).colliders,
      ...shapes.map((platform, i) => ({ id: `robot:0:${i}`, platform, robot: r }))] }
    for (let i = 0; i < 12; i++) stepPlayer(run.player, { ...NEUTRAL_INPUT, jump: true }, STEP, world.platforms, undefined, undefined, world)
    stepPlayer(run.player, NEUTRAL_INPUT, STEP, world.platforms, undefined, undefined, world)
    assert.ok(run.player.vy < -300); assert.equal(run.player.grounded, false)
    assert.ok(!world.platforms.some(b => bodyIntersects(run.player.x, run.player.y, b)))
  })
}
