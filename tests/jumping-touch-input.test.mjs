import test from 'node:test'
import assert from 'node:assert/strict'
import { createJumpTouch } from '../src/games/jumping/touchInput.ts'
import { blankTrial } from '../src/games/jumping/level.ts'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { STEP, TUNING } from '../src/games/jumping/model.ts'

const press = (touch, id = 1, x = 750, y = 240, now = 0) => touch.down(id, x, y, now, 1000)
const advance = (run, touch, from, duration) => {
  for (let now = from; now < from + duration; now += STEP * 1000) stepRun(run, touch.sample(now))
}

test('a tap waits for release, survives between frames and launches once at base strength', () => {
  const touch = createJumpTouch(), run = createRun(blankTrial())
  press(touch, 1, 500)
  assert.equal(touch.sample(32).jump, false)
  touch.up(1, 500, 240, 60)
  advance(run, touch, 80, 1400)
  assert.equal(run.player.grounded, true)
  assert.ok(run.player.bestHeight > 70 && run.player.bestHeight < 90, run.player.bestHeight)
  assert.equal(touch.sample(1500).jump, false)
})

test('holding walks, swiping runs immediately, and reversing turns without lifting or jumping', () => {
  const touch = createJumpTouch(), run = createRun(blankTrial())
  press(touch)
  advance(run, touch, 0, 100)
  assert.equal(run.player.x, run.level.spawn.x)
  advance(run, touch, 150, 400)
  assert.ok(Math.abs(run.player.vx - TUNING.walkSpeed) < 1)
  touch.move(1, 780, 240, 550)
  advance(run, touch, 550, 300)
  assert.ok(Math.abs(run.player.vx - TUNING.runSpeed) < 1)
  touch.move(1, 750, 240, 850)
  advance(run, touch, 850, 600)
  assert.ok(Math.abs(run.player.vx + TUNING.runSpeed) < 1)
  touch.up(1, 750, 240, 1450)
  advance(run, touch, 1450, 300)
  assert.equal(run.player.vx, 0); assert.equal(run.player.grounded, true)
  assert.equal(run.player.bestHeight, 0)
})

test('a center hold is neutral and releasing any settled hold never jumps', () => {
  const touch = createJumpTouch()
  press(touch, 1, 500)
  assert.equal(touch.sample(200).move, 0)
  touch.up(1, 500, 240, 250)
  assert.equal(touch.sample(300).jump, false)
})

test('running tap and running upward flick have distinct heights without losing the moving finger', () => {
  const heights = []
  for (const high of [false, true]) {
    const touch = createJumpTouch(), run = createRun(blankTrial())
    press(touch); touch.move(1, 780, 240, 20)
    advance(run, touch, 20, 350)
    press(touch, 2, 300, 240, 370)
    if (high) touch.move(2, 300, 205, 400)
    touch.up(2, 300, high ? 205 : 240, 420)
    advance(run, touch, 420, 1000)
    assert.equal(touch.has(1), true)
    heights.push(run.player.bestHeight)
  }
  assert.ok(heights[0] > 70 && heights[0] < 90, heights)
  assert.ok(heights[1] > 190 && heights[1] < 220, heights)
})

test('vertical holds climb or descend; down holds preserve crouch-walk speed and never detach', () => {
  const touch = createJumpTouch(), run = createRun(blankTrial())
  press(touch)
  touch.sample(150)
  press(touch, 2, 300, 240, 180); touch.move(2, 300, 275, 200)
  assert.equal(touch.sample(250).descend, false)
  const down = touch.sample(320)
  assert.equal(down.crouch, true); assert.equal(down.descend, true); assert.equal(down.detach, false)
  advance(run, touch, 320, 400)
  assert.equal(run.player.crouching, true)
  assert.ok(Math.abs(run.player.vx - TUNING.walkSpeed) < 1)
  touch.up(2, 300, 275, 750)
  assert.equal(touch.sample(750).detach, false)
  press(touch, 2, 300, 240, 800); touch.move(2, 300, 205, 820)
  assert.equal(touch.sample(940).climb, true)
  touch.up(2, 300, 205, 950)
  assert.equal(touch.sample(960).jump, false)
})

test('down flick detaches once, while an aborted vertical stroke performs no action', () => {
  const touch = createJumpTouch()
  press(touch); touch.move(1, 750, 275, 20); touch.up(1, 750, 275, 40)
  assert.equal(touch.sample(40).detach, true)
  assert.equal(touch.sample(48).detach, false)
  press(touch, 1, 750, 240, 100); touch.move(1, 750, 205, 120)
  touch.move(1, 750, 240, 140); touch.up(1, 750, 240, 150)
  assert.equal(touch.sample(150).jump, false)
})

test('a vertical drag waits for the endpoint and continued same-direction movement keeps climbing', () => {
  const touch = createJumpTouch()
  press(touch); touch.move(1, 750, 210, 30); touch.move(1, 750, 180, 100)
  assert.equal(touch.sample(170).climb, false)
  assert.equal(touch.sample(220).climb, true)
  touch.move(1, 750, 145, 250)
  assert.equal(touch.sample(250).climb, true)
  touch.up(1, 750, 145, 270)
  assert.equal(touch.sample(270).jump, false)
})

test('small continuous pointer moves do not turn a long flick into a stationary hold', () => {
  const touch = createJumpTouch()
  press(touch); touch.move(1, 750, 210, 30)
  for (let now = 60; now <= 210; now += 30) {
    touch.move(1, 750, 210 - (now - 30) / 10, now)
    assert.equal(touch.sample(now).climb, false)
  }
  touch.up(1, 750, 192, 220)
  const input = touch.sample(220)
  assert.equal(input.jump, true); assert.equal(input.jumpStrength, 1)
})

test('action fingers never take over movement and a third finger is ignored', () => {
  const touch = createJumpTouch()
  press(touch); press(touch, 2, 100, 240, 10)
  assert.equal(press(touch, 3, 100, 240, 20), false)
  assert.ok(touch.sample(200).move > 0)
  touch.up(1, 750, 240, 220)
  assert.equal(touch.sample(230).move, 0)
  assert.equal(touch.has(2), true)
})

test('two quick taps are separated by a released step, and reset clears queued actions and holds', () => {
  const touch = createJumpTouch()
  for (const now of [0, 70]) { press(touch, 1, 500, 240, now); touch.up(1, 500, 240, now + 30) }
  assert.deepEqual([110, 118, 126, 134].map(now => touch.sample(now).jump), [true, false, true, false])
  press(touch, 1, 750, 240, 200); touch.move(1, 780, 240, 220)
  press(touch, 2, 300, 240, 230); touch.up(2, 300, 240, 250)
  touch.reset()
  assert.equal(touch.active, false); assert.equal(touch.sample(300).jump, false); assert.equal(touch.sample(300).move, 0)
})
