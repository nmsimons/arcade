import test from 'node:test'
import assert from 'node:assert/strict'
import Matter from 'matter-js'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { bodyIntersects, polygonIntersects } from '../src/games/jumping/geometry.ts'
import { blankTrial } from '../src/games/jumping/level.ts'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { ballShape } from '../src/games/jumping/propGeometry.ts'

test('distant props skip detailed player collision queries', t => {
  const level = blankTrial()
  level.width = 2600; level.spawn = { x: 160, y: level.floor }
  level.props = Array.from({ length: 6 }, (_, i) => ({ kind: 'ball', x: 1000 + i * 200, y: level.floor, size: 80 }))
  const run = createRun(level); run.started = true
  let playerQueries = 0
  const collides = Matter.Collision.collides
  t.mock.method(Matter.Collision, 'collides', function (a, b, pairs) {
    // The controlled player's five-point hull is distinct from the four-point
    // room bounds and 64-point balls. Count actual SAT calls, not elapsed time.
    if (a.vertices.length === 5 || b.vertices.length === 5) playerQueries++
    return collides(a, b, pairs)
  })
  for (let i = 0; i < 30; i++) stepRun(run, NEUTRAL_INPUT, STEP)
  assert.equal(playerQueries, 0)
  assert.equal(run.player.x, 160)
  assert.ok(run.props.every(p => p.grounded && Math.abs(p.vy) < .01))
})

test('round prop collision geometry follows translation and resizing after resting', () => {
  const prop = { x: 300, y: 500, size: 80 }
  const original = ballShape(prop)
  assert.equal(bodyIntersects(300, 470, original), true)
  prop.x = 600; prop.y = 700
  const moved = ballShape(prop)
  assert.equal(bodyIntersects(300, 470, moved), false)
  assert.equal(bodyIntersects(600, 670, moved), true)
  assert.equal(bodyIntersects(600, 670, original), false)
  assert.equal(bodyIntersects(535, 680, moved), false)
  prop.size = 160
  const resized = ballShape(prop)
  assert.equal(bodyIntersects(535, 680, resized), true)
  assert.equal(bodyIntersects(600, 520, resized), false)
  assert.equal(bodyIntersects(535, 680, moved), false)
})

test('polygon broad phase preserves touching edges and tiny real overlaps', () => {
  const terrain = { x: 100, y: 100, w: 100, h: 100 }
  const square = (x, y) => [[x, y], [x + 20, y], [x + 20, y + 20], [x, y + 20]]
  for (const [x, y] of [[80, 120], [200, 120], [120, 80], [120, 200]]) {
    assert.equal(polygonIntersects(square(x, y), terrain), false)
  }
  assert.equal(polygonIntersects(square(80.001, 120), terrain, .0001), true)
  assert.equal(polygonIntersects(square(80.001, 120), terrain, .01), false)
  assert.equal(polygonIntersects(square(500, 500), terrain), false)
})
