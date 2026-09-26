import test from 'node:test'
import assert from 'node:assert/strict'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { blankTrial } from '../src/games/jumping/level.ts'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { bodyIntersects, polygonIntersects, polygonPoints } from '../src/games/jumping/geometry.ts'
import { mechanismShape } from '../src/games/jumping/mechanisms.ts'
import { boxShape } from '../src/games/jumping/propGeometry.ts'

function fixture() {
  const level = blankTrial()
  level.spawn = { x: 100, y: 920 }
  level.mechanisms = [{ id: 'lift', kind: 'lift', x: 700, y: 900, w: 160, h: 20, travel: 300 }]
  level.triggers = [{ x: 50, y: 920, w: 100, target: 'lift', mode: 'touch' }]
  return level
}
function start(level, y = 900, direction = -1) {
  const run = createRun(level); run.started = true
  Object.assign(run.mechanisms[0], { y, direction })
  return run
}
function trace(run, seconds, check = () => {}, dt = STEP) {
  const lift = run.mechanisms[0], turns = []
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    const direction = lift.direction
    stepRun(run, NEUTRAL_INPUT, dt)
    const shape = mechanismShape(lift)
    for (const solid of [...run.terrain, ...run.mechanisms.slice(1).map(mechanismShape)]) {
      assert.equal(polygonIntersects(polygonPoints(shape), solid, .01), false, 'lift must not enter a solid')
    }
    for (const solid of run.platforms) assert.equal(bodyIntersects(run.player.x, run.player.y, solid), false, 'player must remain clear')
    if (lift.direction !== direction) turns.push({ y: lift.y, wait: lift.wait })
    check(lift)
  }
  return turns
}
function cycles(turns, top, bottom, tolerance = 1.1) {
  assert.ok(turns.filter(t => Math.abs(t.y - top) < tolerance && t.wait === 3).length >= 2, 'repeat the upper endpoint and its normal pause')
  assert.ok(turns.filter(t => Math.abs(t.y - bottom) < tolerance && t.wait === 2).length >= 2, 'repeat the lower endpoint and its normal pause')
}

for (const obstacle of ['platform', 'slope', 'concave terrain', 'gate', 'elevator']) {
  test(`an elevator keeps cycling above an obstructing ${obstacle}`, () => {
    const level = fixture()
    if (obstacle === 'gate') level.mechanisms.push({ id: 'blocker', kind: 'gate', orientation: 'horizontal', x: 700, y: 820, w: 160, h: 20, travel: 160 })
    else if (obstacle === 'elevator') level.mechanisms.push({ id: 'blocker', kind: 'lift', x: 700, y: 820, w: 160, h: 20, travel: 100 })
    else level.platforms = [obstacle === 'concave terrain'
      ? { x: 700, y: 700, w: 300, h: 220, polygon: [[0, 120], [200, 120], [200, 0], [300, 0], [300, 220], [0, 220]] }
      : { x: 700, y: 820, w: 160, h: 100, ...(obstacle === 'slope' ? { profile: [[0, 0], [160, 60]] } : {}) }]
    const run = start(level, 750, 1)
    const turns = trace(run, 24, lift => assert.ok(lift.y >= 600 && lift.y <= 800.01))
    cycles(turns, 600, 800)
  })
}

test('obstructions at both ends shorten the cycle at either simulation step', () => {
  for (const dt of [STEP, 1 / 60]) {
    const level = fixture()
    level.platforms = [{ x: 700, y: 650, w: 160, h: 30 }, { x: 700, y: 820, w: 160, h: 100 }]
    const run = start(level, 750)
    const turns = trace(run, 24, lift => assert.ok(lift.y >= 680 && lift.y <= 800.01), dt)
    cycles(turns, 680, 800, 130 * dt + .01)
    assert.equal(run.mechanisms[0].definition.travel, 300, 'obstructions never rewrite the configured range')
  }
})

for (const passenger of ['player', 'box']) test(`a carried ${passenger} limits upward travel under a ceiling`, () => {
  const level = fixture(), height = passenger === 'player' ? 62 : 80
  level.platforms = [{ x: 700, y: 620, w: 160, h: 40 }]
  if (passenger === 'player') {
    level.spawn = { x: 780, y: 900 }
    level.props = [{ kind: 'box', x: 100, y: 920, size: 40 }]
  } else level.props = [{ kind: 'box', x: 780, y: 900, size: 80 }]
  const run = start(level)
  const turns = trace(run, 24, lift => {
    assert.ok(lift.y >= 660 + height && lift.y <= 900)
    const rider = passenger === 'player' ? run.player : run.props[0]
    assert.ok(Math.abs(rider.y - lift.y) < .01, 'the rider stays on the lift in both directions')
    if (passenger === 'box') assert.equal(polygonIntersects(polygonPoints(boxShape(rider)), level.platforms[0], .01), false)
  })
  cycles(turns, 660 + height, 900)
})

test('a crate underneath limits downward travel and moving it restores the full range', () => {
  const level = fixture(); level.props = [{ kind: 'box', x: 780, y: 920, size: 80 }]
  const run = start(level, 750, 1), box = run.props[0]
  cycles(trace(run, 24, lift => {
    assert.ok(lift.y <= 820.01)
    assert.equal(polygonIntersects(polygonPoints(boxShape(box)), mechanismShape(lift), .01), false)
  }), 600, 820)
  assert.ok(Math.abs(box.x - 780) < .01 && Math.abs(box.y - 920) < .01, 'repeated contact does not force the crate away')
  box.x = 1100
  assert.ok(trace(run, 12).some(t => t.y === 900), 'the lower endpoint is restored without restarting')
})

test('releasing the plate pauses an obstruction turn and pressing it resumes the shortened cycle', () => {
  const level = fixture(); level.platforms = [{ x: 700, y: 820, w: 160, h: 100 }]
  const run = start(level, 750, 1), lift = run.mechanisms[0]
  trace(run, 1)
  assert.equal(lift.direction, -1)
  assert.ok(lift.wait > 0)
  run.player.x = 250
  const paused = { y: lift.y, direction: lift.direction, wait: lift.wait }
  trace(run, 4)
  assert.equal(lift.active, false)
  assert.deepEqual({ y: lift.y, direction: lift.direction, wait: lift.wait }, paused)
  run.player.x = 100
  cycles(trace(run, 24), 600, 800)
})

test('a completely blocked lift keeps retrying even when already at its configured endpoint', () => {
  const level = fixture(); level.platforms = [{ x: 700, y: 860, w: 160, h: 40 }]
  const run = start(level)
  trace(run, 8, lift => assert.equal(lift.y, 900, 'no room means no movement or jitter'))
  run.terrain = run.terrain.filter(s => s !== level.platforms[0])
  assert.ok(trace(run, 12).some(t => t.y === 600), 'clearing space cannot leave the lift stuck at the opposite endpoint')
})
