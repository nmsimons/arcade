import test from 'node:test'
import assert from 'node:assert/strict'
import { createPlayer, stepPlayer, cancelJumpInput, NEUTRAL_INPUT, STEP, TUNING } from '../src/games/jumping/model.ts'
import { NO_CLIMBABLES } from '../src/games/jumping/climbables.ts'
import { createJumpController } from '../src/games/jumping/input.ts'

const floor = [{ x: 0, y: 600, w: 6000, h: 400 }], rules = { checkpoints: [], fallY: 4000 }
const make = () => createPlayer({ x: 400, y: 600 })
function advance(p, seconds, input = {}, terrain = floor) {
  for (let t = 0; t < seconds - STEP / 2; t += STEP) stepPlayer(p, { ...NEUTRAL_INPUT, ...input }, STEP, terrain, NO_CLIMBABLES, rules)
}
function jump(hold, input = {}) {
  const p = make()
  advance(p, STEP, { ...input, jump: true })
  assert.equal(p.grounded, false)
  advance(p, hold, { ...input, jump: true })
  advance(p, 2, { ...input, jump: false })
  return p
}

test('takeoff is immediate and direction never changes the initial impulse or held height', () => {
  for (const input of [{ move: 0 }, { move: .3 }, { move: 1 }, { move: -1 }, { climb: true }]) {
    const p = make()
    advance(p, STEP, { ...input, jump: true })
    assert.equal(p.vy, -TUNING.jumpSpeed + TUNING.gravity * STEP)
    assert.ok(p.y < 600)
    assert.equal(jump(.3, input).bestHeight, jump(.3).bestHeight)
  }
})

test('holding builds smooth intermediate heights and stops at the existing full-jump ceiling', () => {
  const heights = [0, .05, .1, TUNING.jumpHoldTime, .4].map(hold => jump(hold).bestHeight)
  assert.ok(heights[0] > 45 && heights[0] < 55, heights)
  assert.ok(heights[0] < heights[1] && heights[1] < heights[2] && heights[2] < heights[3], heights)
  assert.equal(heights[3], heights[4])
  const oldMaximum = jump(0, { jumpStrength: 1 }).bestHeight
  assert.ok(heights[3] <= oldMaximum && oldMaximum - heights[3] < 1, { heights, oldMaximum })
})

test('release ends lift permanently; a later airborne press cannot restart or extend it', () => {
  const released = make(), repressed = make()
  for (const p of [released, repressed]) {
    advance(p, .06, { jump: true }); advance(p, STEP)
    assert.equal(p.jumpLift, null)
  }
  advance(released, 2)
  advance(repressed, 2, { jump: true })
  assert.equal(repressed.bestHeight, released.bestHeight)
  assert.equal(repressed.y, 600)
})

test('holding through landing never repeats a jump, and a falling press cannot add lift', () => {
  const p = make()
  advance(p, 3, { jump: true })
  assert.equal(p.y, 600); assert.equal(p.grounded, true); assert.equal(p.jumpLift, null)
  const peak = p.bestHeight
  advance(p, 1, { jump: true }); assert.equal(p.bestHeight, peak); assert.equal(p.y, 600)
  const falling = make()
  Object.assign(falling, { y: 100, grounded: false, coyote: 0, vy: 120 })
  advance(falling, .1, { jump: true })
  assert.ok(falling.vy > 120); assert.equal(falling.jumpLift, null)
})

test('pause cancellation and a ceiling collision stop lift without a later boost', () => {
  const p = make()
  advance(p, .06, { jump: true }); assert.ok(p.jumpLift)
  cancelJumpInput(p); assert.equal(p.jumpLift, null)
  const before = p.vy
  advance(p, STEP); assert.equal(p.vy, before + TUNING.gravity * STEP)
  const ceiling = make(), terrain = [...floor, { x: 0, y: 500, w: 6000, h: 20 }]
  advance(ceiling, 2, { jump: true }, terrain)
  assert.ok(ceiling.bestHeight <= 18.001)
  assert.equal(ceiling.y, 600); assert.equal(ceiling.jumpLift, null)
})

test('a buffered tap launches at base strength while a buffered hold builds lift after takeoff', () => {
  for (const held of [false, true]) {
    const p = make()
    Object.assign(p, { y: 599, grounded: false, coyote: 0, vy: 100 })
    advance(p, STEP, { jump: true }); assert.equal(p.grounded, true)
    advance(p, STEP, { jump: held })
    assert.equal(p.vy, -TUNING.jumpSpeed + TUNING.gravity * STEP)
    advance(p, .3, { jump: held }); advance(p, 1.5)
    assert.ok(held ? p.bestHeight > 190 : p.bestHeight < 55, p.bestHeight)
  }
})

test('preset touch heights remain fixed regardless of duration or movement', () => {
  for (const strength of [0, .5, 1]) {
    const tap = jump(0, { jumpStrength: strength, move: 1 })
    const held = jump(.5, { jumpStrength: strength, move: 1 })
    assert.equal(tap.bestHeight, held.bestHeight)
    assert.equal(held.jumpLift, null)
  }
})

test('controller preserves the held button independently of stick deflection', () => {
  const pad = { index: 0, id: 'Jump hold pad', connected: true, mapping: 'standard', axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }
  const reader = createJumpController(); reader.sample([pad], 'playing', 0)
  pad.buttons[0] = { pressed: true, value: 1 }
  for (const x of [0, .5, 1]) {
    pad.axes[0] = x
    const input = reader.sample([pad], 'playing', 16)
    assert.equal(input.jump, true); assert.equal(input.jumpStrength, undefined)
  }
  pad.buttons[0] = { pressed: false, value: 0 }
  assert.equal(reader.sample([pad], 'playing', 32).jump, false)
})
