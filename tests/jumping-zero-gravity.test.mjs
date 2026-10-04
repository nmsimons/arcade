import test from 'node:test'
import assert from 'node:assert/strict'
import { createPlayer, NEUTRAL_INPUT, STEP, stepPlayer, TUNING } from '../src/games/jumping/model.ts'
import { athletePose } from '../src/games/jumping/athlete.ts'
import { blankTrial } from '../src/games/jumping/level.ts'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { bodyIntersects } from '../src/games/jumping/geometry.ts'
import { ballShape, boxShape } from '../src/games/jumping/propGeometry.ts'

const close = (actual, expected, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≠ ${expected}`)
const float = (p, input = NEUTRAL_INPUT, dt = STEP, gravity = 0) =>
  stepPlayer(p, input, dt, [], undefined, undefined, undefined, undefined, gravity)
function fixture(kind, overrides = {}) {
  const level = { ...blankTrial(), width: 1800, height: 1400, floor: 1400,
    spawn: { x: 300, y: 838 }, goal: { x: 1600, y: 1400 },
    gravityPlates: [{ id: 'zero-g', x: 20, y: 20, w: 1760, h: 1360, gravity: 0, power: 'always' }],
    props: [{ kind, x: 300, y: 900, size: 60 }], ...overrides }
  const run = createRun(level); run.started = true; run.player.grounded = false
  return run
}

test('unsupported zero-g rest eases into prone, retains it at rest, and allows steering', () => {
  const p = createPlayer({ x: 300, y: 500 }); p.grounded = false
  for (let i = 0; i < 100; i++) float(p)
  assert.equal(p.freeFall.amount, 0, 'short weightless hops retain the later onset')
  for (let i = 0; i < 60; i++) float(p)
  assert.equal(p.freeFall.amount, 1)
  const pose = athletePose(p)
  assert.ok(Math.abs(pose.shoulder[1] - pose.hip[1]) < 2)
  close(p.x, 300); close(p.y, 500)
  for (let i = 0; i < 120; i++) float(p, { ...NEUTRAL_INPUT, move: -1 })
  assert.equal(p.freeFall.amount, 1); assert.equal(p.facing, -1); assert.ok(p.vx < -200)
})

test('entering zero g retains a prone flight pose and leaving against gravity blends it out', () => {
  const p = createPlayer({ x: 300, y: 500 })
  Object.assign(p, { grounded: false, vy: -80, freeFall: { time: 1.5, amount: 1, recovery: null } })
  float(p); assert.equal(p.freeFall.amount, 1)
  float(p, NEUTRAL_INPUT, STEP, TUNING.gravity)
  assert.ok(p.freeFall.amount > .9 && p.freeFall.amount < 1)
  for (let i = 0; i < 4; i++) float(p, NEUTRAL_INPUT, STEP, TUNING.gravity)
  assert.ok(p.freeFall.amount < .9, 'rising against gravity returns toward the normal airborne pose')
})

test('zero-g air resistance slows both drift axes gradually and independently of timestep', () => {
  for (const dt of [STEP, 1 / 60, 1 / 30]) {
    const p = createPlayer({ x: 300, y: 500 }); Object.assign(p, { grounded: false, vx: 200, vy: -100 })
    float(p, NEUTRAL_INPUT, dt)
    assert.ok(p.vx > 190 && p.vx < 200, 'release causes gentle drag, not an immediate stop')
    close(p.vx / p.vy, -2)
    for (let i = 1; i < Math.round(8 / dt); i++) float(p, NEUTRAL_INPUT, dt)
    close(p.vx, 200 * Math.exp(-TUNING.zeroGravityDrag * 8)); close(p.vy, -100 * Math.exp(-TUNING.zeroGravityDrag * 8))
    assert.ok(Math.hypot(p.vx, p.vy) < 2)
    assert.equal(p.freeFall.amount, 1, 'slowing down does not cancel the floating pose')
  }
})

for (const kind of ['box', 'ball']) test(`a neutral drifting player transfers momentum to a floating ${kind} once across solver substeps`, () => {
  for (const dt of [STEP, 1 / 30]) {
    const run = fixture(kind), p = run.player, b = run.props[0]
    p.vy = 300
    stepRun(run, NEUTRAL_INPUT, dt)
    assert.ok(b.vy > 50, 'a bump works without any steering force')
    assert.ok(p.vy > 0 && p.vy < 200, 'the collision slows the player without an extra bounce')
    close(p.vy / Math.exp(-TUNING.zeroGravityDrag * dt), b.vy, 1e-4)
    close(b.angularVelocity, 0, 1e-4)
    assert.equal(bodyIntersects(p.x, p.y, kind === 'box' ? boxShape(b) : ballShape(b)), false)
    const speed = b.vy
    for (let i = 0; i < Math.round(1 / dt); i++) stepRun(run, NEUTRAL_INPUT, dt)
    close(b.vy, speed, 1e-4)
  }
})

test('an off-center floating box bump transfers angular momentum as well as drift', () => {
  const run = fixture('box', { spawn: { x: 336, y: 780 }, props: [{ kind: 'box', x: 380, y: 800, size: 60 }] })
  run.player.vx = 300
  stepRun(run, NEUTRAL_INPUT)
  assert.ok(run.props[0].vx > 30)
  assert.ok(Math.abs(run.props[0].angularVelocity) > .1)
  assert.ok(run.player.vx < 300)
})

test('an incoming weightless object also shares its momentum with a stationary player', () => {
  const run = fixture('ball', { spawn: { x: 300, y: 800 }, props: [{ kind: 'ball', x: 300, y: 862, size: 60 }] })
  run.props[0].vy = -300
  stepRun(run, NEUTRAL_INPUT)
  assert.ok(run.player.vy < -100)
  assert.ok(run.props[0].vy > -300 && run.props[0].vy < 0)
  close(run.player.vy / Math.exp(-TUNING.zeroGravityDrag * STEP), run.props[0].vy, 1e-4)
})

test('neutral player impacts also move unsupported objects in a 0.1 gravity field', () => {
  const run = fixture('ball', { gravityPlates: [{ id: 'weak', x: 20, y: 20, w: 1760, h: 1360, gravity: .1, power: 'always' }] })
  run.player.vy = 300; run.props[0].grounded = false
  stepRun(run, NEUTRAL_INPUT)
  assert.ok(run.props[0].vy > 100, 'weak gravity cannot disable the collision impulse')
  assert.ok(run.player.vy > 0 && run.player.vy < 200)
})

test('a separating prop or one beyond a solid wall receives no player impact', () => {
  for (const blocked of [false, true]) {
    const run = fixture('box', { spawn: { x: 300, y: 800 }, props: [{ kind: 'box', x: 345, y: 800, size: 60 }],
      platforms: blocked ? [{ x: 313, y: 650, w: 2, h: 200 }] : [] })
    Object.assign(run.player, { vx: blocked ? 900 : -300 })
    stepRun(run, NEUTRAL_INPUT)
    close(run.props[0].vx, 0); close(run.props[0].vy, 0); close(run.props[0].angularVelocity, 0)
  }
})
