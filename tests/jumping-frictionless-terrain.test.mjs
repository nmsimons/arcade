import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial, parseLevel } from '../src/games/jumping/level.ts'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { NEUTRAL_INPUT } from '../src/games/jumping/model.ts'
import { canGrip, FRICTIONLESS, groundVelocity, slidingVelocity } from '../src/games/jumping/friction.ts'

const steps = (run, frames, input = NEUTRAL_INPUT) => { for (let i = 0; i < frames; i++) stepRun(run, input) }
const RIGHT = { ...NEUTRAL_INPUT, move: 1 }

/** A slab 40 high on the floor, its top at y 880, and a ramp rising 220 over 400 to the right of it. */
function rink({ slab = true, ramp = true, frictionless = true, props = [] } = {}) {
  const level = blankTrial()
  level.entrance = { x: 400, y: 880 }
  level.platforms = [
    ...slab ? [{ x: 200, y: 880, w: 700, h: 40, ...frictionless ? { frictionless: true } : {} }] : [],
    ...ramp ? [{ x: 1000, y: 700, w: 400, h: 220, polygon: [[0, 220], [400, 0], [400, 220]], ...frictionless ? { frictionless: true } : {} }] : [],
  ]
  level.props = props
  return parseLevel(level)
}

test('frictionless files accept only `frictionless: true`', () => {
  const level = blankTrial()
  level.platforms = [{ x: 200, y: 880, w: 400, h: 40, frictionless: true }]
  assert.equal(parseLevel(level).platforms[0].frictionless, true)
  for (const value of [false, 'yes', 1]) {
    level.platforms[0].frictionless = value
    assert.throws(() => parseLevel(level))
  }
})

test('zero grip neither drives nor brakes, and only exact level ground holds still', () => {
  assert.equal(groundVelocity(0, 200, 0, 2000, 1 / 60, FRICTIONLESS), 0)
  assert.equal(groundVelocity(150, 0, 0, 2000, 1 / 60, FRICTIONLESS), 150)
  assert.equal(canGrip(0, FRICTIONLESS), true)
  assert.equal(canGrip(.05, FRICTIONLESS), false)
  assert.equal(canGrip(.05), true)
  // Gravity alone acts along a slick slope.
  const g = 2000, angle = .3
  assert.ok(Math.abs(slidingVelocity(100, angle, g, .01, FRICTIONLESS) - (100 + g * Math.sin(angle) * .01)) < 1e-9)
})

test('the player cannot walk off a standstill on frictionless ground, but can jump and steer in the air', () => {
  const run = createRun(rink({ ramp: false })); run.started = true
  const start = run.player.x
  steps(run, 60, RIGHT)
  assert.equal(run.player.grounded, true)
  assert.ok(Math.abs(run.player.x - start) < .5, `moved ${run.player.x - start}`)
  steps(run, 12, { ...RIGHT, jump: true })
  assert.equal(run.player.grounded, false, 'the jump left the ice')
  steps(run, 30, RIGHT)
  assert.ok(run.player.x - start > 10, `air control carried the jump ${run.player.x - start}`)
})

test('momentum carries across frictionless ground with no braking', () => {
  const run = createRun(rink({ ramp: false })); run.started = true
  steps(run, 5)
  run.player.vx = 120
  steps(run, 60)
  assert.equal(run.player.grounded, true)
  assert.ok(Math.abs(run.player.vx - 120) < 1, `kept ${run.player.vx}`)
  // Ordinary ground brakes the same glide to a stop.
  const grippy = createRun(rink({ ramp: false, frictionless: false })); grippy.started = true
  steps(grippy, 5); grippy.player.vx = 120; steps(grippy, 60)
  assert.equal(grippy.player.vx, 0)
})

test('a slope that holds ordinary feet slides the player down when it is frictionless', () => {
  for (const frictionless of [false, true]) {
    const level = rink({ slab: false, frictionless })
    level.entrance = { x: 1250, y: 920 - 220 * 250 / 400 }
    const run = createRun(level); run.started = true
    const start = run.player.x
    steps(run, 90)
    if (frictionless) assert.ok(start - run.player.x > 60, `slid ${start - run.player.x}`)
    else assert.ok(Math.abs(run.player.x - start) < 1, `held ${run.player.x - start}`)
  }
})

test('a box rests on an ordinary slope and glides down a frictionless one', () => {
  for (const frictionless of [false, true]) {
    const x = 1250, y = 920 - 220 * 250 / 400
    const run = createRun(rink({ slab: false, frictionless, props: [{ kind: 'box', x, y: y - 20, size: 40 }] })); run.started = true
    run.player.x = 100
    steps(run, 120)
    const moved = x - run.props[0].x
    if (frictionless) assert.ok(moved > 80, `slid ${moved}`)
    else assert.ok(Math.abs(moved) < 25, `settled in place ${moved}`)
  }
})

test('a player on frictionless ground cannot push a box', () => {
  const run = createRun(rink({ ramp: false, props: [{ kind: 'box', x: 470, y: 880, size: 40 }] })); run.started = true
  steps(run, 120, RIGHT)
  assert.ok(Math.abs(run.props[0].x - 470) < 1, `box moved ${run.props[0].x - 470}`)
})

test('stepping onto frictionless ground behind a pushed box lets it glide on', () => {
  const level = blankTrial()
  level.entrance = { x: 420, y: 880 }
  level.platforms = [{ x: 300, y: 880, w: 300, h: 40 }, { x: 600, y: 880, w: 900, h: 40, frictionless: true }]
  level.props = [{ kind: 'box', x: 540, y: 880, size: 40 }]
  const run = createRun(parseLevel(level)); run.started = true
  // Push from the grippy pad and keep holding the direction past its edge.
  steps(run, 230, RIGHT)
  const box = run.props[0]
  assert.ok(run.player.x > 600, 'the pusher has stepped onto the slick floor')
  assert.ok(box.vx > 40, `the box keeps gliding at ${box.vx}`)
  const x = box.x; steps(run, 60)
  assert.ok(box.x - x > 30, 'and keeps going once the push ends')
})

test('a body gliding into a slower box shares momentum with it instead of stopping dead', () => {
  const level = blankTrial()
  level.entrance = { x: 300, y: 880 }
  level.platforms = [{ x: 200, y: 880, w: 1400, h: 40, frictionless: true }]
  level.props = [{ kind: 'box', x: 600, y: 880, size: 40 }]
  const run = createRun(parseLevel(level)); run.started = true
  const p = run.player, box = run.props[0]
  p.vx = 400; box.vx = 100
  steps(run, 160)
  assert.ok(box.vx > 150, `the box was struck on to ${box.vx}`)
  assert.ok(p.vx > 100 && p.vx <= box.vx + 1, `the glider follows at ${p.vx}`)
})
