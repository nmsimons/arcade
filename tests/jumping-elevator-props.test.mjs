import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial } from '../src/games/jumping/level.ts'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { bodyIntersects, nearestBoundary, pointInside } from '../src/games/jumping/geometry.ts'
import { mechanismShape } from '../src/games/jumping/mechanisms.ts'

function fixture(direction = 1, offset = 20) {
  const level = blankTrial(), edge = direction > 0 ? 860 : 700
  level.spawn = { x: 100, y: 920 }
  level.mechanisms = [{ id: 'lift', kind: 'lift', x: 700, y: 900, w: 160, h: 20, travel: 300 }]
  level.triggers = [{ x: 50, y: 920, w: 100, target: 'lift', mode: 'touch' }]
  level.props = [{ kind: 'ball', x: edge + offset * direction, y: 920, size: 100 }]
  return level
}
function descending(level) {
  const run = createRun(level); run.started = true
  Object.assign(run.mechanisms[0], { y: 700, direction: 1 })
  return run
}
function clear(run) {
  const solids = [...run.terrain, ...run.mechanisms.map(mechanismShape)]
  for (const b of run.props.filter(b => b.kind === 'ball')) for (const solid of solids) {
    const y = b.y - b.size / 2
    assert.equal(pointInside(solid, b.x, y), false)
    assert.ok(nearestBoundary(solid, b.x, y).distance >= b.size / 2 - .01, 'ball must stay outside terrain and mechanisms')
  }
  assert.ok(solids.every(s => !bodyIntersects(run.player.x, run.player.y, s)), 'rider must stay outside terrain and mechanisms')
}
function advance(run, seconds, dt = STEP) {
  for (let i = 0; i < Math.round(seconds / dt); i++) { stepRun(run, NEUTRAL_INPUT, dt); clear(run) }
}

for (const direction of [-1, 1]) for (const offset of [3, 20, 40]) {
  test(`descending elevator rolls a ball ${direction < 0 ? 'left' : 'right'} from an edge offset of ${offset}`, () => {
    const run = descending(fixture(direction, offset)), ball = run.props[0], start = ball.x
    let maxSpeed = 0
    for (let i = 0; i < 300; i++) {
      stepRun(run, NEUTRAL_INPUT); clear(run)
      maxSpeed = Math.max(maxSpeed, Math.hypot(ball.vx, ball.vy))
    }
    assert.equal(run.mechanisms[0].y, 900, 'the ball yields instead of stopping the elevator')
    assert.ok((ball.x - start) * direction > 50 - offset)
    assert.ok(ball.angle * direction > .1, 'the rolling mark follows displacement')
    assert.ok(maxSpeed < 261, 'a shallow contact must slow the lift instead of launching the ball')
  })
}

for (const obstruction of ['terrain', 'gate']) test(`a ball trapped by ${obstruction} shortens the elevator cycle without creep`, () => {
  const level = fixture()
  if (obstruction === 'terrain') level.platforms = [{ x: 945, y: 700, w: 80, h: 220 }]
  else level.mechanisms.push({ id: 'gate', kind: 'gate', x: 945, y: 700, w: 20, h: 220, travel: 220 })
  const run = descending(level), lift = run.mechanisms[0], ball = run.props[0]
  advance(run, 3)
  assert.ok(ball.x > 894 && ball.x <= 895.01, 'ball uses the available space before stopping')
  assert.ok(lift.y > 810 && lift.y < 820)
  const stopped = { x: ball.x, y: lift.y, angle: ball.angle }
  const turns = []
  for (let i = 0; i < 2400; i++) {
    const direction = lift.direction
    advance(run, STEP)
    assert.ok(lift.y <= stopped.y + .01, 'repeated trips cannot squeeze past the trapped ball')
    if (lift.direction !== direction) turns.push(lift.y)
  }
  assert.ok(turns.filter(y => y === 600).length >= 2, 'the elevator keeps returning to its upper endpoint')
  assert.ok(turns.filter(y => Math.abs(y - stopped.y) < 130 * STEP / 32 + .001).length >= 2, 'the ball remains the lower endpoint within one shortened step')
  assert.ok(Math.abs(ball.x - stopped.x) < .001)
  assert.ok(Math.abs(ball.angle - stopped.angle) < .001)
  assert.ok(Math.hypot(ball.vx, ball.vy) < .001, 'failed trials impart no momentum')
  if (obstruction === 'gate') assert.equal(run.mechanisms[1].y, 700, 'rolling cannot force the gate open')
  ball.x = 1150
  let restored = false
  for (let i = 0; i < 1200; i++) { advance(run, STEP); restored ||= lift.y === 900 }
  assert.ok(restored, 'clearing the ball restores the full stroke on the next trip')
})

test('the flat underside does not invent a sideways force on a centered ball', () => {
  const level = fixture(); level.props[0].x = 780
  const run = descending(level)
  let lowest = 0, returned = false
  for (let i = 0; i < 1200; i++) {
    advance(run, STEP)
    lowest = Math.max(lowest, run.mechanisms[0].y)
    returned ||= run.mechanisms[0].y === 600
  }
  assert.equal(run.props[0].x, 780)
  assert.equal(run.props[0].angle, 0)
  assert.ok(lowest > 799 && lowest < 800.01)
  assert.ok(returned, 'the elevator reverses above the ball')
})

test('a rising elevator rolls a ball off a neighboring ledge', () => {
  const level = fixture(); level.platforms = [{ x: 860, y: 780, w: 200, h: 140 }]; level.props[0].y = 780
  const run = createRun(level); run.started = true
  advance(run, 3)
  assert.equal(run.mechanisms[0].y, 600)
  assert.ok(run.props[0].x > 910)
})

test('a carried ball can roll away from an overhead corner', () => {
  const level = fixture(); level.props[0] = { kind: 'ball', x: 720, y: 900, size: 100 }
  level.platforms = [{ x: 730, y: 570, w: 100, h: 140 }]
  level.mechanisms[0].travel = 180 // The platform itself stays below the overhead corner.
  const run = createRun(level); run.started = true
  advance(run, 3)
  assert.equal(run.mechanisms[0].y, 720)
  assert.ok(run.props[0].x < 680)
})

test('contact displacement propagates through neighboring balls', () => {
  const level = fixture(); level.props.push({ kind: 'ball', x: 981, y: 920, size: 100 })
  const run = descending(level)
  advance(run, 3)
  assert.equal(run.mechanisms[0].y, 900)
  assert.ok(run.props[1].x > 1030)
  assert.ok(run.props[1].x - run.props[0].x >= 99.99)
})

test('the player rides a ball displaced by an elevator', () => {
  const level = fixture(); level.spawn = { x: 880, y: 820 }
  level.props.push({ kind: 'box', x: 100, y: 920, size: 40 })
  const run = descending(level)
  advance(run, 3)
  assert.equal(run.mechanisms[0].y, 900)
  assert.ok(run.player.x > 930)
  assert.ok(Math.abs(run.player.x - run.props[0].x) < .01)
  assert.ok(Math.abs(run.player.y - run.props[0].y + 100) < .01)
})

test('rolling remains bounded with a larger simulation step and stops when pressure is released', () => {
  const run = descending(fixture(1, 10))
  advance(run, 2.5, 1 / 60)
  assert.equal(run.mechanisms[0].y, 900)
  run.player.x = 250
  advance(run, .1, 1 / 60)
  const y = run.mechanisms[0].y
  advance(run, 3, 1 / 60)
  assert.equal(run.mechanisms[0].y, y)
})
