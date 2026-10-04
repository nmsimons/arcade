import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial } from '../src/games/jumping/level.ts'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { nearestBoundary, polygonIntersects } from '../src/games/jumping/geometry.ts'
import { robotHulls } from '../src/games/jumping/robotPhysics.ts'

function fixture(slope, direction) {
  const level = blankTrial()
  level.width = 2400; level.height = level.floor = 1400
  level.spawn = { x: 2000, y: 1400 }
  level.platforms = [{ x: 400, y: 200, w: 400, h: 1200,
    polygon: slope > 0 ? [[0, 0], [400, 1200], [0, 1200]] : [[0, 1200], [400, 0], [400, 1200]] }]
  level.robots = [{ x: 600, y: 800, left: 420, right: 780 }]
  const run = createRun(level)
  run.started = true; run.robots[0].facing = direction
  return run
}

function cliffFixture(slope) {
  const level = blankTrial()
  level.width = 2400; level.height = level.floor = 2000
  level.spawn = { x: 2000, y: 2000 }
  level.platforms = [{ x: 400, y: 200, w: 400, h: 1220,
    polygon: slope > 0 ? [[0, 0], [400, 1200], [400, 1220], [0, 20]] : [[0, 1200], [400, 0], [400, 20], [0, 1220]] }]
  level.robots = [{ x: 600, y: 800, left: 100, right: 2300 }]
  const run = createRun(level)
  run.started = true
  return run
}

function supported(run, slope) {
  const robot = run.robots[0]
  if (slope !== undefined) assert.ok(Math.abs(robot.angle - Math.atan(slope)) < .001, 'the chassis follows the incline')
  for (const side of [-1, 1]) {
    const x = robot.x + side * 17 * Math.cos(robot.angle)
    const y = robot.y - 9 + side * 17 * Math.sin(robot.angle)
    assert.ok(Math.abs(nearestBoundary(run.level.platforms[0], x, y).distance - 9) < .01, 'each wheel touches the ramp')
  }
  for (const hull of robotHulls(robot)) for (const terrain of run.terrain) {
    assert.equal(polygonIntersects(hull, terrain, .03), false, 'the complete bot stays outside terrain')
  }
}

for (const slope of [-3, 3]) for (const direction of [-1, 1]) for (const dt of [STEP, 1 / 60]) {
  test(`a bot starts on a steep slope and patrols ${slope * direction < 0 ? 'uphill' : 'downhill'} (${slope}, ${direction}, ${1 / dt} Hz)`, () => {
    const run = fixture(slope, direction), robot = run.robots[0], start = robot.x
    supported(run, slope)
    for (let i = 0; i < Math.round(1 / dt); i++) {
      stepRun(run, NEUTRAL_INPUT, dt)
      supported(run, slope)
      assert.equal(robot.facing, direction, 'a supported slope does not trigger a cliff reversal')
    }
    assert.ok((robot.x - start) * direction > 85, 'patrol keeps moving along the ramp')
  })
}

for (const slope of [-3, 3]) test(`a steep ramp's ends still turn the bot before either wheel crosses a cliff (${slope})`, () => {
  const run = cliffFixture(slope), robot = run.robots[0]
  let left = false, right = false
  for (let i = 0; i < 960; i++) {
    stepRun(run, NEUTRAL_INPUT)
    supported(run)
    const halfAxle = 17 * Math.cos(robot.angle)
    assert.ok(robot.x - halfAxle >= 400 && robot.x + halfAxle <= 800, 'neither wheel drives over an unsupported edge')
    left ||= robot.x < 420; right ||= robot.x > 780
  }
  assert.ok(left && right, 'patrol traverses the ramp and turns at both ends')
})
