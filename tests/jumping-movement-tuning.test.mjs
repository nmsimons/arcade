import test from 'node:test'
import assert from 'node:assert/strict'
import { TUNING, jumpSpeed } from '../src/games/jumping/movementTuning.ts'
import { createJumpController } from '../src/games/jumping/input.ts'

test('preset gesture strength interpolates between the base and full jump', () => {
  assert.equal(jumpSpeed(0), TUNING.jumpSpeed)
  assert.equal(jumpSpeed(.5), (TUNING.jumpSpeed + TUNING.directedJumpSpeed) / 2)
  assert.equal(jumpSpeed(1), TUNING.directedJumpSpeed)
  assert.equal(jumpSpeed(-1), TUNING.jumpSpeed); assert.equal(jumpSpeed(2), TUNING.directedJumpSpeed)
})

test('upward analog deflection controls climbing independently of jump strength', () => {
  const pad = { index: 0, id: 'Jump strength pad', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }
  const reader = createJumpController(); reader.sample([pad], 'playing', 0)
  pad.axes[1] = -.59
  const half = reader.sample([pad], 'playing', 16)
  assert.equal(half.jumpStrength, undefined); assert.equal(half.move, 0); assert.equal(half.climb, false)
  pad.axes[1] = -1; assert.equal(reader.sample([pad], 'playing', 32).climb, true)
  pad.axes[1] = 1; assert.equal(reader.sample([pad], 'playing', 48).descend, true)
  pad.axes[1] = -.8; pad.axes[0] = .8
  assert.equal(reader.sample([pad], 'playing', 64).jumpStrength, undefined)
  pad.axes = [0, 0, 0, 0]; pad.buttons[12] = { pressed: true, value: 1 }
  assert.equal(reader.sample([pad], 'playing', 80).climb, true)
})
