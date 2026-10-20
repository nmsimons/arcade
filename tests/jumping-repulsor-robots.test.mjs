import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial } from '../src/games/jumping/level.ts'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { prepareGadgets } from '../src/games/jumping/gadgets.ts'
import { repulseRobot, stepRobotRecoil } from '../src/games/jumping/robotPhysics.ts'

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

for (const obstacle of ['wall', 'red', 'lane', 'prop', 'bot', 'cliff']) test(`recoil respects ${obstacle} without tunneling`, () => {
  const run = equipped(), robot = run.robots[0]
  const wall = { x: 530, y: 700, w: 20, h: 220 }
  if (obstacle === 'lane') robot.definition = { ...robot.definition, right: 500 }
  const platforms = obstacle === 'wall' ? [...run.platforms, wall]
    : obstacle === 'cliff' ? [{ x: 0, y: 920, w: 550, h: 20 }] : run.platforms
  const objects = obstacle === 'prop' || obstacle === 'bot' ? [wall] : []
  const fields = obstacle === 'red' ? [wall] : []
  repulseRobot(robot, 1)
  for (let frame = 0; frame < 70; frame++) stepRobotRecoil(platforms, robot, STEP, objects, run.player, [], fields)
  assert.ok(robot.x <= (obstacle === 'lane' ? 500 : obstacle === 'cliff' ? 533 : 505))
  assert.equal(robot.recoilVx, 0)
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
