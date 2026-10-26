import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial } from '../src/games/jumping/level.ts'
import { createRun, stepRun, setWaterEffectsEnabled } from './helpers/jumping-active-run.mjs'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { bodyIntersects } from '../src/games/jumping/geometry.ts'
import { playerWaterCenterOffset } from '../src/games/jumping/gravity.ts'

function scene(rate = 5, effects = true, platforms = []) {
  const run = createRun({ ...blankTrial(), platforms, entrance: { x: 100, y: 920 },
    goal: { id: 'closed', power: 'switched', x: 1600, y: 920 },
    gravityPlates: [{ id: 'pool', effect: 'water', gravity: -1, x: 400, y: 320, w: 1000, h: 600, waterLevel: 25, waterRate: rate }],
    triggers: [{ x: 200, y: 920, w: 80, mode: 'weight', behavior: 'toggle', startsOn: false, targets: ['pool:fill'] }] })
  Object.assign(run.player, { x: 1100, y: 820, grounded: false, coyote: 0 })
  setWaterEffectsEnabled(run, effects)
  return run
}
const advance = (run, seconds, dt, input = NEUTRAL_INPUT) => {
  for (let i = 0; i < Math.round(seconds / dt); i++) stepRun(run, input, dt)
}
const depth = run => run.player.y + playerWaterCenterOffset(run.player) - run.water.plates[0].y

for (const dt of [STEP, 1 / 30]) test(`a pool filling from empty lifts a grounded player into a jumpable surface float at ${dt}`, () => {
  const source = scene(20).level
  const run = createRun({ ...source, entrance: { x: 1100, y: 920 },
    gravityPlates: source.gravityPlates.map(p => ({ ...p, waterLevel: 0 })),
    triggers: source.triggers.map(t => ({ ...t, startsOn: true })) })
  advance(run, 3, dt)
  assert.equal(run.player.grounded, false)
  const immersion = run.player.y - run.water.plates[0].y
  assert.ok(immersion > 46 && immersion < 54, 'rising water lifts the feet once it supplies buoyant support')
  stepRun(run, { ...NEUTRAL_INPUT, jump: true }, dt)
  assert.ok(run.player.waterJump && run.player.vy < -300)
})

for (const dt of [STEP, 1 / 60, 1 / 30]) for (const effects of [false, true]) for (const rate of [1, 5, 20]) {
  test(`a surface swimmer follows the waterline and can jump clear: rate ${rate}, dt ${dt}, effects ${effects}`, () => {
    const rising = scene(rate, effects), still = scene(rate, effects)
    advance(rising, 4, dt); advance(still, 4, dt)
    const top = rising.water.plates[0].y
    rising.triggers[0].active = true
    for (let i = 0; i < Math.round(2 / dt); i++) {
      stepRun(rising, NEUTRAL_INPUT, dt); stepRun(still, NEUTRAL_INPUT, dt)
      assert.ok(Math.abs(depth(rising) - depth(still)) < .01, 'rising water must not submerge a previously floating swimmer')
    }
    assert.ok(Math.abs(top - rising.water.plates[0].y - rate * 12) < 1e-7)
    if (rising.player.waterCamera) assert.ok(Math.abs(rising.player.waterCamera.y - rising.water.plates[0].y
      - (still.player.waterCamera.y - still.water.plates[0].y)) < .01, 'the bob camera anchor follows the rising pool')
    stepRun(rising, { ...NEUTRAL_INPUT, jump: true }, dt)
    assert.ok(rising.player.waterJump && rising.player.vy < -300, 'the surface still supplies an ordinary jump')
    let clear = false
    for (let i = 0; i < Math.round(.4 / dt); i++) {
      stepRun(rising, { ...NEUTRAL_INPUT, jump: true }, dt)
      clear ||= rising.player.y < rising.water.plates[0].y
    }
    assert.ok(clear, 'the whole player clears the surface while the pump keeps filling')
  })
}

for (const dt of [STEP, 1 / 30]) test(`submerged swimming and depth hold remain relative to rising water at ${dt}`, () => {
  const rising = scene(20), still = scene(20)
  for (const run of [rising, still]) {
    run.player.y = 880
    run.player.waterMotion = { amount: 0, dive: 0, phase: 0, underwater: true }
  }
  rising.triggers[0].active = true
  for (let i = 0; i < Math.round(2 / dt); i++) {
    const input = { ...NEUTRAL_INPUT, move: i * dt < .6 ? .5 : 0 }
    stepRun(rising, input, dt); stepRun(still, input, dt)
    assert.ok(Math.abs(depth(rising) - depth(still)) < .05, 'current transport cannot fight steering or depth hold')
  }
})

for (const polygon of [false, true]) test(`rising water cannot carry the swimmer through a ${polygon ? 'polygon' : 'rectangular'} roof`, () => {
  const roof = { x: 900, y: 600, w: 400, h: 30, ...(polygon ? { polygon: [[0, 0], [400, 0], [400, 30], [0, 30]] } : {}) }
  const run = scene(20, true, [roof])
  advance(run, 3, STEP); run.triggers[0].active = true
  for (let i = 0; i < 360; i++) {
    stepRun(run, NEUTRAL_INPUT, STEP)
    assert.equal(bodyIntersects(run.player.x, run.player.y, roof), false)
  }
  assert.ok(run.player.y >= 692 - .001 && run.player.y < 700, 'the head stops at the underside')
})

test('stopping the fill stops transport immediately and dry footing is never carried', () => {
  const run = scene()
  advance(run, 4, STEP); run.triggers[0].active = true; advance(run, 2, STEP)
  run.triggers[0].active = false
  const y = run.player.y, top = run.water.plates[0].y
  advance(run, 2, STEP)
  assert.equal(run.water.plates[0].y, top)
  assert.ok(Math.abs(run.player.y - y) < 5, 'the previous water increment cannot be replayed')
  Object.assign(run.player, { x: 100, y: 920, grounded: true, vx: 0, vy: 0 })
  run.triggers[0].active = true; advance(run, 2, STEP)
  assert.equal(run.player.y, 920)
})

test('overlapping rising reservoirs carry a swimmer once', () => {
  const single = scene(5), source = { ...single.level, gravityPlates: [...single.level.gravityPlates,
    { ...single.level.gravityPlates[0], id: 'second' }], triggers: [{ ...single.level.triggers[0], targets: ['pool:fill', 'second:fill'] }] }
  const overlap = createRun(source)
  Object.assign(overlap.player, { x: 1100, y: 820, grounded: false, coyote: 0 })
  for (const run of [single, overlap]) { advance(run, 4, STEP); run.triggers[0].active = true }
  for (let i = 0; i < 240; i++) {
    stepRun(single, NEUTRAL_INPUT, STEP); stepRun(overlap, NEUTRAL_INPUT, STEP)
    assert.ok(Math.abs(single.player.y - overlap.player.y) < .01, 'overlapping pools must not double their displacement')
  }
})
