import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial } from '../src/games/jumping/level.ts'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { prepareGadgets } from '../src/games/jumping/gadgets.ts'
import { repulseRobot, robotHulls, stepRobotRecoil } from '../src/games/jumping/robotPhysics.ts'
import { polygonIntersects } from '../src/games/jumping/geometry.ts'

const tick = (run, frames = 1, input = {}) => { for (let i = 0; i < frames; i++) stepRun(run, { ...NEUTRAL_INPUT, ...input }) }
function scene() {
  const level = blankTrial()
  level.props = [{ kind: 'box', gadget: 'repulsor', x: 190, y: 920, size: 40 }]
  level.robots = [{ x: 450, y: 920, left: 350, right: 1000 }]
  return level
}
function equipped(level = scene()) {
  const run = createRun(level); tick(run, 1, { interact: true }); tick(run)
  return run
}

test('a repulsor hit starts visible recoil without teleporting the shovebot', () => {
  const run = equipped(), robot = run.robots[0], x = robot.x
  prepareGadgets(run, { ...NEUTRAL_INPUT, use: true }, STEP)
  assert.equal(run.gadgets.shots, 1)
  assert.equal(robot.x, x, 'the discharge itself never changes the bot position')
  assert.equal(robot.phase, 'recover')
  assert.ok(robot.recoilVx > 0)
  let previous = x
  for (let frame = 0; frame < 24; frame++) {
    tick(run, 1, { use: true })
    assert.ok(robot.x > previous && robot.x - previous <= 7.51, 'each step resolves only that step of recoil')
    previous = robot.x
  }
  assert.ok(robot.x > x + 100 && robot.x < x + 180)
})

for (const side of [-1, 1]) test(`a shot from ${side < 0 ? 'left' : 'right'} turns the bot to face the player`, () => {
  const run = equipped(), robot = run.robots[0], p = run.player
  Object.assign(p, { x: robot.x + side * 180, facing: -side, dryTurn: null })
  robot.facing = -side
  prepareGadgets(run, { ...NEUTRAL_INPUT, use: true }, STEP)
  assert.equal(run.gadgets.shots, 1)
  assert.equal(robot.facing, side)
  assert.equal(Math.sign(robot.recoilVx), -side, 'the bot faces the source while recoiling away from it')
})

for (const side of [-1, 1]) test(`touching the bot from ${side < 0 ? 'left' : 'right'} makes it face the player`, () => {
  const level = scene(); level.props = []
  const run = createRun(level), robot = run.robots[0]
  Object.assign(run.player, { x: robot.x + side * 37.8, y: robot.y, grounded: true, footwork: null })
  robot.facing = -side
  tick(run)
  assert.equal(robot.facing, side)
})

test('being nearby behind a bot does not turn it without contact', () => {
  const run = createRun(scene()), robot = run.robots[0]
  run.player.x = robot.x - 70; robot.facing = 1
  tick(run)
  assert.equal(robot.facing, 1)
  assert.equal(robot.seesPlayer, false)
})

test('walking into a resting bot from behind turns it toward the contacting player', () => {
  const level = scene(); level.props = []
  const run = createRun(level), robot = run.robots[0]
  Object.assign(robot, { facing: 1, phase: 'recover', time: -10 })
  Object.assign(run.player, { x: robot.x - 100, y: robot.y, grounded: true, footwork: null })
  tick(run, 80, { move: 1 })
  assert.equal(robot.facing, -1)
})

for (const side of [-1, 1]) test(`a rider on the ${side < 0 ? 'left' : 'right'} of the chassis also turns the bot toward them`, () => {
  const level = scene(); level.props = []
  const run = createRun(level), robot = run.robots[0]
  Object.assign(robot, { facing: -side, phase: 'recover', time: -10 })
  Object.assign(run.player, { x: robot.x + side * 10, y: robot.y - 46, grounded: true, footwork: null })
  tick(run)
  assert.equal(robot.facing, side)
})

test('recoil decelerates over 0.4 seconds with bounded displacement and timestep-independent travel', () => {
  for (const dt of [1 / 120, 1 / 60, 1 / 30]) {
    const run = equipped(), robot = run.robots[0], x = robot.x
    repulseRobot(robot, 1)
    let previousVelocity = robot.recoilVx
    for (let time = 0; time < .5 - dt / 2; time += dt) {
      stepRobotRecoil(run.platforms, robot, dt, [], run.player, [], [])
      assert.ok(robot.recoilVx <= previousVelocity)
      previousVelocity = robot.recoilVx
    }
    assert.ok(Math.abs(robot.x - x - 180) < 1e-6)
    assert.equal(robot.recoilVx, 0)
  }
})

for (const obstacle of ['wall', 'red', 'prop', 'bot']) test(`recoil respects ${obstacle} without tunneling`, () => {
  const run = equipped(), robot = run.robots[0]
  const wall = { x: 530, y: 700, w: 20, h: 220 }
  const platforms = obstacle === 'wall' ? [...run.platforms, wall] : run.platforms
  const objects = obstacle === 'prop' || obstacle === 'bot' ? [wall] : []
  const fields = obstacle === 'red' ? [wall] : []
  repulseRobot(robot, 1)
  for (let frame = 0; frame < 70; frame++) stepRobotRecoil(platforms, robot, STEP, objects, run.player, [], fields)
  assert.ok(robot.x <= 505)
  assert.equal(robot.recoilVx, 0)
})

for (const direction of [-1, 1]) test(`a repulsor knocks a shovebot ${direction < 0 ? 'left' : 'right'} off a shelf and beyond its patrol bounds`, () => {
  const mirror = x => direction > 0 ? x : 1800 - x
  const level = blankTrial(); level.entrance = { x: mirror(400), y: 650 }
  level.platforms = [{ x: direction > 0 ? 300 : 1100, y: 650, w: 400, h: 20 }]
  level.props = [{ kind: 'box', gadget: 'repulsor', x: mirror(430), y: 650, size: 40 }]
  level.robots = [{ x: mirror(650), y: 650, left: direction > 0 ? 326 : 1126, right: direction > 0 ? 674 : 1474 }]
  const run = equipped(level), bot = run.robots[0]
  run.player.facing = direction
  tick(run, 1, { use: true })
  let airborne = false, crossed = false, landed = false
  for (let frame = 0; frame < 260; frame++) {
    const x = bot.x, y = bot.y; tick(run)
    assert.ok(Math.abs(bot.x - x) < 10 && Math.abs(bot.y - y) < 14, 'fall and recoil remain continuous')
    crossed ||= direction > 0 ? bot.x > 726 : bot.x < 1074
    airborne ||= bot.y > 652 && bot.y < 918
    landed ||= crossed && Math.abs(bot.y - 920) < .01 && bot.fallVelocity === undefined
    for (const hull of robotHulls(bot)) for (const solid of run.terrain) assert.equal(polygonIntersects(hull, solid, .01), false)
  }
  assert.ok(crossed); assert.ok(airborne); assert.ok(landed)
  assert.equal(bot.deactivated, true)
  assert.equal(bot.seesPlayer, false)
  const stopped = { x: bot.x, y: bot.y }; tick(run, 180)
  assert.deepEqual({ x: bot.x, y: bot.y }, stopped, 'a stranded bot cannot jitter back toward its old patrol')
})

test('an airborne shovebot stops at walls and EMP pauses its fall', () => {
  const level = scene(); level.entrance = { x: 1500, y: 920 }; level.props = []
  level.platforms = [{ x: 300, y: 650, w: 400, h: 20 }, { x: 790, y: 0, w: 12, h: 920 }]
  level.robots[0] = { x: 650, y: 650, left: 326, right: 674 }
  const run = createRun(level), bot = run.robots[0]; repulseRobot(bot, 1)
  for (let frame = 0; frame < 120 && bot.y < 690; frame++) tick(run)
  assert.ok(bot.fallVelocity > 0)
  const x = bot.x, y = bot.y; run.gadgets.disabled.set(bot, 1)
  tick(run, 90); assert.equal(bot.x, x); assert.equal(bot.y, y)
  tick(run, 180)
  assert.ok(bot.x <= 764.01); assert.ok(Math.abs(bot.y - 920) < .01)
  for (const hull of robotHulls(bot)) for (const solid of run.terrain) assert.equal(polygonIntersects(hull, solid, .01), false)
})

test('losing wheel footing removes grounded recoil braking instead of parking the chassis over a lip', () => {
  const level = scene(); level.entrance = { x: 1500, y: 920 }; level.props = []
  level.platforms = [{ x: 300, y: 650, w: 400, h: 20 }]
  level.robots[0] = { x: 532.5, y: 650, left: 326, right: 674 }
  const run = createRun(level), bot = run.robots[0]; repulseRobot(bot, 1)
  tick(run, 240)
  assert.ok(bot.x > 726); assert.equal(bot.y, 920)
  assert.equal(bot.fallVelocity, undefined); assert.equal(bot.deactivated, true)
})

test('further hits cap recoil speed and do not restart recovery', () => {
  const run = equipped(), robot = run.robots[0]
  repulseRobot(robot, 1); robot.time = .2
  repulseRobot(robot, 1)
  assert.equal(robot.time, .2)
  assert.equal(robot.recoilVx, 900)
  tick(run, 30)
  assert.notEqual(robot.phase, 'recover', 'normal sensing and drive resume without waiting for a new recovery timer')
})

test('EMP freezes recoil with the rest of the powered bot and it resumes afterward', () => {
  const run = equipped(), robot = run.robots[0]
  repulseRobot(robot, 1); run.empRemaining = 1
  const x = robot.x
  tick(run, 30)
  assert.equal(robot.x, x)
  assert.equal(robot.recoilVx, 900)
  run.empRemaining = 0; tick(run)
  assert.ok(robot.x > x)
})
