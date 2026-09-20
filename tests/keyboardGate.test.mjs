import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createKeyboardGate } from '../src/games/hardVacuum/keyboardGate.ts'

test('held keys repeat within a screen but cannot bleed across a menu boundary', () => {
  const keyboard = createKeyboardGate()
  assert.equal(keyboard.press('ArrowDown', 'pause'), true)
  assert.equal(keyboard.press('ArrowDown', 'pause', true), true)
  keyboard.enter('recorder')
  assert.equal(keyboard.press('ArrowDown', 'recorder', true), false)
  keyboard.enter('pause')
  assert.equal(keyboard.press('ArrowDown', 'pause', true), false)
  keyboard.release('ArrowDown')
  assert.equal(keyboard.press('ArrowDown', 'pause'), true)
})
test('the first keydown after changing screen is also gated, without waiting for a frame', () => {
  const keyboard = createKeyboardGate()
  assert.equal(keyboard.press('Space', 'menu'), true)
  assert.equal(keyboard.press('Space', 'flight', true), false)
  keyboard.release('Space')
  assert.equal(keyboard.press('Space', 'flight'), true)
})
test('refocusing with an already held key requires release, while fresh input still works', () => {
  const keyboard = createKeyboardGate()
  keyboard.press('Space', 'flight')
  keyboard.reset()
  assert.equal(keyboard.press('Space', 'flight', true), false)
  assert.equal(keyboard.press('KeyP', 'flight'), true)
  keyboard.release('Space')
  assert.equal(keyboard.press('Space', 'pause'), true)
})
