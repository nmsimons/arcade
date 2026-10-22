import test from 'node:test'
import assert from 'node:assert/strict'
import { createJumpController } from '../src/games/jumping/input.ts'
import { createPlayer, stepPlayer, NEUTRAL_INPUT, TUNING, playerState } from '../src/games/jumping/model.ts'
import { mirrorPlatform, mirrorPlayerState, mirrorLadder } from '../src/games/jumping/gravityFrame.ts'
import { actionFeedbackText, playerActionFeedback } from '../src/games/jumping/actionFeedback.ts'

function stick() {
  const controller = createJumpController(), pad = { index: 0, id: 'Screen direction test', connected: true, mapping: 'standard',
    axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }
  let time = 0; controller.sample([pad], 'playing', time)
  return y => { pad.axes[1] = y; return controller.sample([pad], 'playing', time += 16) }
}

for (const inverted of [false, true]) test(`the vertical stick crouches toward the footing and stands away from it (${inverted})`, () => {
  const p = createPlayer({ x: 500, y: 500 }), read = stick()
  const floor = [{ x: 0, y: 500, w: 1000, h: 100 }].map(b => inverted ? mirrorPlatform(b) : b)
  if (inverted) { mirrorPlayerState(p); p.inverted = true }
  const tick = input => stepPlayer(p, input, 1 / 120, floor, undefined, undefined, undefined, undefined, inverted ? -TUNING.gravity : TUNING.gravity)
  tick(NEUTRAL_INPUT)
  assert.equal(actionFeedbackText(playerActionFeedback(p), 'controller'), `${inverted ? '↑' : '↓'} to crouch`)
  for (let i = 0; i < 20; i++) tick(read(inverted ? -1 : 1))
  assert.equal(p.crouching, true)
  for (let i = 0; i < 20; i++) tick(read(inverted ? 1 : -1))
  assert.equal(p.crouching, false)
})

for (const inverted of [false, true]) test(`ladder movement follows screen Up and Down (${inverted})`, () => {
  const p = createPlayer({ x: 500, y: 500 }), read = stick()
  const ladder = { x: 500, top: 100, bottom: 1000, platform: -1, side: 1 }
  if (inverted) { mirrorPlayerState(p); p.inverted = true }
  p.grounded = false
  const world = { ladders: [inverted ? mirrorLadder(ladder) : ladder], ropes: [] }
  const tick = input => stepPlayer(p, input, 1 / 120, [], world, undefined, undefined, undefined, inverted ? -TUNING.gravity : TUNING.gravity)
  tick(read(-1)); assert.equal(p.climbing?.kind, 'ladder')
  for (let i = 0; i < 35; i++) tick(NEUTRAL_INPUT)
  const start = p.y
  for (let i = 0; i < 45; i++) tick(read(-1))
  assert.ok(p.y < start - 20, 'pushing up moves toward the top of the screen')
  assert.equal(playerState(p), 'Ladder · ascending')
  const top = p.y
  for (let i = 0; i < 45; i++) tick(read(1))
  assert.ok(p.y > top + 20, 'pushing down moves toward the bottom of the screen')
  assert.equal(playerState(p), 'Ladder · descending')
})
