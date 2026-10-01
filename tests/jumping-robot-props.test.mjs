import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial } from '../src/games/jumping/level.ts'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { polygonIntersects, polygonPoints } from '../src/games/jumping/geometry.ts'
import { boxShape, ballShape } from '../src/games/jumping/propGeometry.ts'
import { robotHulls } from '../src/games/jumping/robotPhysics.ts'
import { mechanismShape } from '../src/games/jumping/mechanisms.ts'

function fixture(kind, size, direction = 1, change = () => {}) {
  const level = blankTrial()
  level.spawn = { x: 1500, y: 500 }
  level.platforms = [{ x: 1400, y: 500, w: 300, h: 20 }]
  level.robots = [{ x: 700, y: 920, left: 200, right: 1300 }]
  level.props = [{ kind, x: 700 + direction * (size / 2 + 70), y: 920, size }]
  change(level)
  const run = createRun(level); run.started = true; run.robots[0].facing = direction
  return run
}
function clear(run) {
  for (const prop of run.props) {
    const shape = prop.kind === 'box' ? boxShape(prop) : ballShape(prop)
    for (const robot of run.robots) for (const hull of robotHulls(robot)) {
      assert.equal(polygonIntersects(hull, shape, .03), false, 'props and every part of the bot stay separate')
    }
    for (const solid of [...run.terrain, ...run.mechanisms.map(mechanismShape)]) {
      assert.equal(polygonIntersects(polygonPoints(shape), solid, .03), false, 'shoving cannot force props through solids')
    }
  }
}
function advance(run, seconds, dt = STEP) {
  for (let i = 0; i < Math.round(seconds / dt); i++) { stepRun(run, NEUTRAL_INPUT, dt); clear(run) }
}
for (const kind of ['box', 'ball']) for (const size of [20, 80, 200]) for (const direction of [-1, 1]) {
  test(`patrolling bot pushes ${size}-unit ${kind} ${direction < 0 ? 'left' : 'right'} without overlap`, () => {
    const run = fixture(kind, size, direction), start = run.props[0].x
    advance(run, 2)
    assert.ok((run.props[0].x - start) * direction > 30, 'ordinary contact pushes, even outside a charge')
  })
}
for (const kind of ['box', 'ball']) test(`a charging bot shoves a ${kind} with bounded force`, () => {
  // An elevated player ahead stays visible above the cargo until the bot passes.
  // Concealed or rear targets cancel aggression and cannot test charge forces.
  const run = fixture(kind, 80, 1, level => {
    level.spawn = { x: 810, y: 700 }
    level.platforms = [{ x: 810, y: 700, w: 200, h: 20 }]
  }), start = run.props[0].x
  run.robots[0].phase = 'charge'
  let peak = 0
  for (let i = 0; i < 50; i++) {
    advance(run, STEP); peak = Math.max(peak, run.props[0].vx)
  }
  assert.ok(run.props[0].x > start + 25)
  assert.ok(peak > 100 && peak <= (kind === 'ball' ? 501 : 300), `bounded shove speed: ${peak}`)
})
for (const kind of ['box', 'ball']) for (const pinned of [false, true]) test(`incoming ${kind} hits a ${pinned ? 'wall-blocked' : 'free'} bot`, () => {
  const run = fixture(kind, 80, -1, level => {
    if (pinned) level.platforms.push({ x: 745, y: 400, w: 40, h: 520 })
  }), robot = run.robots[0]
  robot.phase = 'recover'; robot.time = -10; robot.facing = -1
  run.props[0].vx = 700
  advance(run, 1.5, 1 / 60)
  assert.ok(robot.x > 705, 'an incoming object displaces the bot')
  if (pinned) assert.ok(robot.x <= 719.06, 'the chassis cannot pass through a wall')
})

test('a closed gate blocks a shove and a distant prop receives no force', () => {
  const run = fixture('ball', 80, 1, level => {
    level.platforms.push({ x: 734, y: 500, w: 20, h: 420 }); level.props[0].x = 795
  }), ball = run.props[0], robot = run.robots[0]
  robot.phase = 'charge'
  advance(run, .4)
  assert.ok(Math.abs(ball.x - 795) < .01)
  assert.ok(Math.abs(ball.vx) < .01)
})

for (const kind of ['box', 'ball']) test(`a bot pushes a ${kind} chain up to a gate without overlap or tunneling`, () => {
  const run = fixture(kind, 80, 1, level => {
    level.props.push({ kind, x: 895, y: 920, size: 80 })
    level.mechanisms = [{ id: 'gate', kind: 'gate', x: 980, y: 420, w: 20, h: 500, travel: 500 }]
  })
  advance(run, 4)
  assert.ok(run.props[1].x > 920, 'contact force passes through the chain')
  assert.ok(run.props[1].x <= 940.03)
})

for (const kind of ['box', 'ball']) test(`a ${kind} falling onto a resting bot stays outside its body`, () => {
  const run = fixture(kind, 80, 1, level => { level.props[0] = { kind, x: 700, y: 760, size: 80 } })
  run.robots[0].phase = 'recover'; run.robots[0].time = -10
  let reachedRoof = false
  for (let i = 0; i < 240; i++) {
    advance(run, STEP)
    reachedRoof ||= Math.abs(run.props[0].y - (run.robots[0].y - 46)) < 2
  }
  // A box may subsequently tip off the narrow roof. Every frame above still
  // checks the complete hulls, so rolling off cannot conceal falling through.
  assert.ok(reachedRoof, 'the drop reaches the bot roof')
})
