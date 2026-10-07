import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial } from '../src/games/jumping/level.ts'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { athletePose } from '../src/games/jumping/athlete.ts'

const water = { id: 'water', x: 0, y: 400, w: 1800, h: 520, effect: 'water', gravity: -1, power: 'always' }
for (const dt of [STEP, 1 / 30]) for (const side of [-1, 1]) for (const size of [40, 60, 80, 120]) {
  test(`floating up beneath a ${size}-unit ball clears the ${side > 0 ? 'right' : 'left'} pool bank at ${dt}`, () => {
    const edge = side > 0 ? 640 : 1160, x = edge - side * size / 2
    const run = createRun({ ...blankTrial(), spawn: { x: edge - side * 14, y: 650 },
      platforms: [{ x: side > 0 ? edge : 0, y: 380, w: 1160, h: 540 }], props: [{ kind: 'ball', x, y: 400 + size / 2, size }],
      goal: { x: side > 0 ? 120 : 1500, y: 920, id: 'closed', power: 'switched' }, gravityPlates: [water] })
    run.started = true; run.player.grounded = false; run.player.coyote = 0; run.player.facing = side
    let touched = false, climbed = false, previousX = x
    for (let i = 0; i < Math.round(10 / dt); i++) {
      stepRun(run, { ...NEUTRAL_INPUT, climb: true }, dt)
      const p = run.player, b = run.props[0]
      touched ||= p.contacts.body.some(c => c.collider.prop === b)
      climbed ||= !!p.mantle
      assert.equal(p.swimAcceleration, 0, 'Up remains passive floating without an added lift motor')
      assert.ok(Math.abs(b.x - previousX) < dt * 220, 'the ball moves through physical contacts without a position reset')
      previousX = b.x
      if (p.waterMotion) {
        const head = athletePose(p).head
        assert.ok(Math.hypot(p.x + head[0] * p.facing - b.x, p.y + head[1] - b.y + size / 2) > size / 2 + 6.05, 'the visible head clears the ball')
      }
    }
    assert.ok(touched && climbed, 'the route uses the actual buoyant contact followed by a ledge pull-up')
    assert.ok((x - run.props[0].x) * side > 30, 'an off-center contact rolls the ball away from the bank')
    assert.ok(Math.abs(run.props[0].y - 400 - size / 2) < 2.4, 'the released ball returns to its ordinary floating depth')
    assert.equal(run.player.grounded, true)
    assert.equal(run.player.hang, null)
    assert.equal(run.player.mantle, null)
    assert.ok((run.player.x - edge) * side > 0 && Math.abs(run.player.y - 380) < .001, 'the cleared lip remains usable')
  })
}

for (const dt of [STEP, 1 / 30]) test(`a centered small ball adds no invented sideways force and steering releases the contact at ${dt}`, () => {
  const run = createRun({ ...blankTrial(), spawn: { x: 600, y: 650 }, props: [{ kind: 'ball', x: 600, y: 420, size: 40 }],
    goal: { x: 1500, y: 920, id: 'closed', power: 'switched' }, gravityPlates: [water] })
  run.started = true; run.player.grounded = false; run.player.coyote = 0
  for (let i = 0; i < Math.round(7 / dt); i++) stepRun(run, { ...NEUTRAL_INPUT, climb: true }, dt)
  assert.ok(Math.abs(run.props[0].x - 600) < .01 && Math.abs(run.player.x - 600) < .01, 'symmetric contact stays symmetric')
  for (let i = 0; i < Math.round(2 / dt); i++) stepRun(run, { ...NEUTRAL_INPUT, climb: true, move: 1 }, dt)
  assert.ok(run.player.x > 680, 'ordinary swimming escapes a centered contact')
  assert.equal(run.player.hang, null)
  for (let i = 0; i < Math.round(7 / dt); i++) stepRun(run, NEUTRAL_INPUT, dt)
  assert.ok(Math.abs(run.props[0].y - 420) < 2.4)
})
