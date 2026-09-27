import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial } from '../src/games/jumping/level.ts'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { polygonIntersects } from '../src/games/jumping/geometry.ts'
import { boxShape } from '../src/games/jumping/propGeometry.ts'
import { robotHulls } from '../src/games/jumping/robotPhysics.ts'

function fixture(direction = 1, size = 40) {
  const level = blankTrial()
  level.spawn = { x: 1500, y: 500 }
  level.platforms = [{ x: 1400, y: 500, w: 300, h: 20 }]
  level.robots = [{ x: 700, y: 920, left: 200, right: 1300 }]
  level.props = size ? [{ kind: 'box', x: 700 + direction * 50, y: 920, size }] : []
  const run = createRun(level)
  run.started = true; run.robots[0].facing = direction
  return run
}
function clear(run) {
  const shapes = [...run.terrain, ...run.props.map(boxShape)]
  for (const hull of robotHulls(run.robots[0])) for (const shape of shapes) {
    assert.equal(polygonIntersects(hull, shape, .03), false, 'settling must keep the chassis and wheels outside solids')
  }
}

for (const direction of [-1, 1]) for (const dt of [STEP, 1 / 60]) for (const size of [30, 40]) {
  test(`a bot settles and keeps driving after shoving a ${size}-unit crate away (${direction}, ${1 / dt} Hz)`, () => {
    const run = fixture(direction, size), r = run.robots[0]
    let tilted = false, resumed = false, settledX = null
    for (let i = 0; i < Math.round(3 / dt); i++) {
      stepRun(run, NEUTRAL_INPUT, dt); clear(run)
      tilted ||= Math.abs(r.angle) > .3
      if (tilted && Math.abs(r.angle) < .01 && Math.abs(r.y - 920) < .01) settledX ??= r.x
      resumed ||= settledX !== null && Math.abs(r.x - settledX) > 40
    }
    assert.ok(tilted, 'the tumbling crate lifts a wheel during an ordinary shove')
    assert.notEqual(settledX, null, 'the raised wheel returns to the floor after the crate moves away')
    assert.ok(resumed, 'patrol resumes instead of remaining stuck at the released crate')
  })
}

function lostSupport(direction = 1) {
  const run = fixture(direction, 0), r = run.robots[0]
  // Snapshot of a wheel raised by a departing support, with the other wheel
  // still touching the floor. Idle recovery exercises settling without driving.
  Object.assign(r, { angle: direction * .6, y: 920 - 17 * Math.sin(.6), phase: 'recover', time: -10 })
  return run
}

for (const direction of [-1, 1]) for (const dt of [STEP, 1 / 60]) {
  test(`an idle bot lowers its raised wheel smoothly (${direction}, ${1 / dt} Hz)`, () => {
    const run = lostSupport(direction), r = run.robots[0], startX = r.x
    for (let i = 0; i < Math.round(.5 / dt); i++) {
      const before = { ...r }
      stepRun(run, NEUTRAL_INPUT, dt); clear(run)
      assert.equal(r.x, startX, 'settling supplies no horizontal drive')
      assert.ok(Math.abs(r.angle - before.angle) <= 2 * dt + 1e-7, 'no instant upright snap')
      assert.ok(r.y >= before.y - 1e-7 && r.y - before.y <= 130 * dt + 1e-7, 'height settles continuously downward')
    }
    assert.ok(Math.abs(r.angle) < 1e-7); assert.equal(r.y, 920)
  })
}

test('EMP pauses settling until power returns', () => {
  const run = lostSupport(), r = run.robots[0]
  run.empRemaining = .25
  const before = { ...r }
  for (let i = 0; i < 30; i++) stepRun(run, NEUTRAL_INPUT)
  assert.deepEqual(r, before)
  for (let i = 0; i < 60; i++) { stepRun(run, NEUTRAL_INPUT); clear(run) }
  assert.equal(r.angle, 0); assert.equal(r.y, 920)
})

test('settling cannot rotate the chassis or wheels through an adjacent wall', () => {
  const level = blankTrial()
  level.spawn = { x: 1500, y: 920 }
  level.platforms = [{ x: 724, y: 700, w: 20, h: 220 }]
  level.robots = [{ x: 700, y: 920, left: 200, right: 1300 }]
  const run = createRun(level), r = run.robots[0]; run.started = true
  Object.assign(r, { angle: -.6, y: 920 - 17 * Math.sin(.6), phase: 'recover', time: -10 })
  clear(run)
  for (let i = 0; i < 120; i++) { stepRun(run, NEUTRAL_INPUT); clear(run) }
  assert.ok(Math.abs(r.angle) > .1, 'a blocked upright pose cannot be forced through the wall')
})

test('support recovery does not let a patrolling bot drive over a cliff', () => {
  const level = blankTrial()
  level.spawn = { x: 1500, y: 920 }
  level.platforms = [{ x: 600, y: 650, w: 200, h: 20 }]
  level.robots = [{ x: 700, y: 650, left: 200, right: 1300 }]
  const run = createRun(level), r = run.robots[0]; run.started = true
  let reachedLeft = false, reachedRight = false
  for (let i = 0; i < 600; i++) {
    stepRun(run, NEUTRAL_INPUT); clear(run)
    assert.equal(r.y, 650); assert.equal(r.angle, 0)
    assert.ok(r.x >= 617 && r.x <= 783, 'both wheels remain above the shelf')
    reachedLeft ||= r.x < 630; reachedRight ||= r.x > 770
  }
  assert.ok(reachedLeft && reachedRight, 'normal patrol still reverses at each edge')
})
