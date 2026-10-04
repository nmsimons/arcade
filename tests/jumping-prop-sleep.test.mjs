import test from 'node:test'
import assert from 'node:assert/strict'
import Matter from 'matter-js'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { blankTrial } from '../src/games/jumping/level.ts'
import { NEUTRAL_INPUT, STEP, TUNING } from '../src/games/jumping/model.ts'

const field = gravity => [{ id: 'weak', x: 0, y: 0, w: 1800, h: 920, gravity, power: 'always' }]
const step = (run, seconds, input = NEUTRAL_INPUT, dt = STEP) => {
  for (let i = 0; i < Math.round(seconds / dt); i++) stepRun(run, input, dt)
}
const runFor = (gravity, props, spawn = { x: 100, y: 920 }) => {
  const run = createRun({ ...blankTrial(), gravityPlates: field(gravity), props, spawn })
  run.started = true
  return run
}

test('a sleeping stacked ball falls in 0.1 gravity after normal controls roll away its support', () => {
  for (const dt of [STEP, 1 / 30]) {
    const run = runFor(.1, [{ kind: 'ball', x: 700, y: 920, size: 80 }, { kind: 'ball', x: 700, y: 840, size: 80 }], { x: 630, y: 920 })
    step(run, 3, NEUTRAL_INPUT, dt)
    assert.ok(run.props.every(b => b.grounded && Math.abs(b.vy) < .01))
    step(run, 2, { ...NEUTRAL_INPUT, move: 1 }, dt)
    assert.ok(run.props[0].x > 850, 'normal pushing removes the supporting ball')
    assert.ok(run.props[1].y > 850, 'the upper ball falls instead of keeping stale support')
    step(run, 3, NEUTRAL_INPUT, dt)
    assert.ok(Math.abs(run.props[1].y - 920) < .01)
    assert.equal(run.props[1].grounded, true)
  }
})

for (const gravity of [.001, -.001]) for (const kind of ['box', 'ball']) test(`an unsupported ${kind} keeps accelerating under ${gravity} gravity instead of sleeping in midair`, () => {
  const run = runFor(gravity, [{ kind, x: 700, y: 500, size: 80 }])
  step(run, 4)
  const b = run.props[0], acceleration = TUNING.gravity * gravity
  assert.ok(Math.abs(b.vy - acceleration * 4) < .001)
  assert.ok(Math.abs(b.y - 500 - acceleration * 8) < .03)
  assert.equal(b.grounded, false)
})

test('standing on a loose ball does not suspend its weak-gravity fall', () => {
  const run = runFor(.001, [{ kind: 'ball', x: 700, y: 500, size: 80 }], { x: 700, y: 420 })
  step(run, 4)
  assert.ok(run.props[0].y > 512)
  assert.ok(run.player.y > 432)
  assert.equal(run.player.contacts.support?.collider.prop, run.props[0])
})

test('weak-gravity objects resting on actual support can still sleep', () => {
  const original = Matter.Engine.update
  let engine
  Matter.Engine.update = (world, dt) => { engine = world; return original(world, dt) }
  try {
    const run = runFor(.1, [{ kind: 'ball', x: 700, y: 920, size: 80 }, { kind: 'box', x: 900, y: 920, size: 80 }])
    step(run, 3)
    const bodies = Matter.Composite.allBodies(engine.world).filter(b => !b.isStatic)
    assert.ok(bodies.every(b => b.isSleeping), 'support permits the ordinary solver sleep optimization')
  } finally { Matter.Engine.update = original }
})

for (const gravity of [1, .1, 0]) test(`normal pushing wakes an entire sleeping ball chain at ${gravity} gravity`, () => {
  for (const dt of [STEP, 1 / 30]) {
    const run = runFor(gravity, [700, 780, 860].map(x => ({ kind: 'ball', x, y: 920, size: 80 })), { x: 630, y: 920 })
    step(run, 3, NEUTRAL_INPUT, dt)
    step(run, 3, { ...NEUTRAL_INPUT, move: 1 }, dt)
    for (const [i, b] of run.props.entries()) {
      assert.ok(b.x > 700 + i * 80 + 150, 'the shove must wake every contacted ball')
      assert.ok(b.vx > 50, 'the connected props move together')
    }
  }
})
