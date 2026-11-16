import test from 'node:test'
import assert from 'node:assert/strict'
import { pushScenario } from './helpers/jumpingPushScenarios.mjs'
import { crouchedPushScenario } from './helpers/jumpingCrouchedPushScenarios.mjs'
import { stepRun } from './helpers/jumping-active-run.mjs'
import { NEUTRAL_INPUT, TUNING } from '../src/games/jumping/model.ts'
import { ballPushPace } from '../src/games/jumping/playerContacts.ts'

// Crouch walking is 60 units per second and hands push at 90. Driven at 90, a ball left a crouched pusher's
// palms and was caught again several times a second, and the arms and pelvis popped as the contact came and
// went. The whole-skin acceptance sweeps catch that, but they run outside the fast tier.

test('hands in a crouch roll a ball at the crouch pace, and standing hands at the standing pace', () => {
  assert.equal(ballPushPace({ crouching: false }), 90)
  assert.equal(ballPushPace({ crouching: true }), TUNING.crouchSpeed)
  assert.ok(TUNING.crouchSpeed < 90)
})

test('a crouched pusher keeps its palms on the ball it rolls', () => {
  for (const facing of [-1, 1]) for (const size of [30, 80, 100]) {
    const run = pushScenario({ name: `${size} ball crouch`, kind: 'ball', size, crouch: true }, facing), p = run.player, ball = run.props[0]
    let loaded = 0, shoves = 0, previous = false, lead = 0
    for (let tick = 0; tick < 480; tick++) {
      stepRun(run, { ...NEUTRAL_INPUT, move: facing, crouch: true })
      const working = !!p.pushing?.effort
      if (working) loaded++
      if (working && !previous) shoves++
      previous = working
      if (tick > 120) lead = Math.max(lead, (ball.x - p.x) * facing - size / 2)
    }
    const context = `${size} ball; facing=${facing}`
    assert.ok(loaded > 470 && shoves === 1, `${context}: one sustained push, not ${shoves} shoves over ${loaded} ticks`)
    assert.ok(Math.abs(ball.vx * facing - TUNING.crouchSpeed) < 1 && Math.abs(p.vx * facing - TUNING.crouchSpeed) < 1, `${context}: ball and pusher share the crouch pace`)
    assert.ok(lead < 30, `${context}: the ball stays at the palms (${lead.toFixed(1)} ahead)`)
  }
})

test('dropping into a crouch behind a rolling ball keeps the palms on it while it slows', () => {
  for (const facing of [-1, 1]) for (const size of [30, 100]) {
    const run = crouchedPushScenario({ name: `${size} ball`, kind: 'ball', size, blocked: false }, facing), p = run.player, ball = run.props[0]
    for (let tick = 0; tick < 120; tick++) stepRun(run, { ...NEUTRAL_INPUT, move: facing })
    const context = `${size} ball; facing=${facing}`
    assert.ok(Math.abs(ball.vx * facing - 90) < 1 && p.pushing?.effort, `${context}: the standing push rolls the ball at 90`)
    let lead = 0, settled
    for (let tick = 0; tick < 240; tick++) {
      stepRun(run, { ...NEUTRAL_INPUT, move: facing, crouch: true })
      assert.ok(p.pushing?.effort, `${context}; tick=${tick}: the hands never let go`)
      lead = Math.max(lead, (ball.x - p.x) * facing - size / 2)
      if (settled === undefined && Math.abs(ball.vx * facing - TUNING.crouchSpeed) < 1) settled = tick
    }
    assert.ok(settled !== undefined && settled > 20 && settled < 90, `${context}: the ball eases to the crouch pace (tick ${settled})`)
    assert.ok(lead < 36, `${context}: it never rolls out of reach (${lead.toFixed(1)} ahead)`)
    // Standing again picks the standing pace back up.
    for (let tick = 0; tick < 120; tick++) stepRun(run, { ...NEUTRAL_INPUT, move: facing })
    assert.ok(Math.abs(ball.vx * facing - 90) < 1 && p.pushing?.effort, `${context}: standing resumes the push at 90`)
  }
})
