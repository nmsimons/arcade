import test from 'node:test'
import assert from 'node:assert/strict'
import { createPlayer, stepPlayer, respawn, NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { createGravityField, updateGravityField, playerWaterCenterOffset } from '../src/games/jumping/gravity.ts'

const floor = [{ x: 0, y: 2200, w: 4000, h: 300 }]
const water = () => {
  const field = createGravityField()
  updateGravityField(field, [{ id: 'w', x: 0, y: 0, w: 4000, h: 4000, effect: 'water', power: 'always' }], new Map(), true)
  return field
}
const center = p => p.y + playerWaterCenterOffset(p)
for (const dt of [STEP, 1 / 30]) for (const strength of [undefined, 0, .5, 1]) for (const move of [0, 1]) {
  test(`bottom push-offs keep an impulse, meet resistance and settle (${dt}, ${strength ?? 'held'}, ${move})`, () => {
    const p = createPlayer({ x: 2000, y: 2200 }), field = water()
    const step = input => stepPlayer(p, { ...NEUTRAL_INPUT, ...input }, dt, floor, undefined, undefined, undefined, field)
    for (let i = 0; i < Math.round(1 / dt); i++) step({})
    assert.equal(p.grounded, true)
    const start = center(p)
    step({ jump: true, jumpStrength: strength, move })
    assert.ok(!p.grounded && p.vy < -300, 'the feet supply an immediate push rather than only swimming propulsion')
    const initialSpeed = -p.vy
    let peakSpeed = initialSpeed
    for (let i = 1; i < Math.round(.6 / dt); i++) {
      step({ jump: i * dt < .3, jumpStrength: strength, move })
      peakSpeed = Math.max(peakSpeed, -p.vy)
    }
    assert.ok(peakSpeed < 800, 'held lift cannot ignore resistance and reach dry full-jump speed')
    assert.ok(-p.vy < 120 && -p.vy < initialSpeed * .4, 'excess ascent meets drag after the push')
    assert.ok(start - center(p) > 60 && start - center(p) < 205, 'the push has useful travel without launching through a deep pool')
    for (let i = 0; i < Math.round(2 / dt); i++) step({ move })
    assert.ok(Math.abs(p.vy) < .1, 'neutral buoyancy resumes after both preset and held lift')
    const stopped = center(p)
    for (let i = 0; i < Math.round(1 / dt); i++) step({ move })
    assert.ok(Math.abs(center(p) - stopped) < .03, 'release holds the reached depth')
    assert.equal(p.waterPushOff, false, 'the takeoff reminder ends once the swimming state resumes')
  })
}

test('leaving water and respawning clear a pending submerged push-off', () => {
  const p = createPlayer({ x: 2000, y: 2200 }), field = water()
  stepPlayer(p, { ...NEUTRAL_INPUT, jump: true }, STEP, floor, undefined, undefined, undefined, field)
  assert.equal(p.waterPushOff, true)
  const reset = structuredClone(p)
  respawn(reset)
  assert.equal(reset.waterPushOff, false)
  stepPlayer(p, NEUTRAL_INPUT, STEP, floor)
  assert.equal(p.waterPushOff, false)
})
