import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { blankTrial, parseLevel } from '../src/games/jumping/level.ts'
import { createRun, setWaterEffectsEnabled, stepRun } from '../src/games/jumping/challenge.ts'
import { createPlayer, NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { createGravityField, updateGravityField } from '../src/games/jumping/gravity.ts'
import { advanceWaterSurface, createWaterSurface, disturbWaterSurface, MAX_WATER_POINTS, MAX_WAVE_HEIGHT } from '../src/games/jumping/waterSurface.ts'
import { drawWaterRegion, drawWaterSurfaceDetails } from '../src/games/jumping/gravityRender.ts'

const water = (x = 0, w = 900, y = 400, h = 500) => ({ id: `water-${x}-${y}`, x, y, w, h, gravity: -1, effect: 'water' })
function fixture(plates = [water()], terrain = [], props = [], y = 300) {
  const player = createPlayer({ x: 450, y }), field = createGravityField()
  updateGravityField(field, plates, new Map(), true)
  return { player, props, state: createWaterSurface(plates, terrain, player, props, field) }
}
const advance = (f, seconds, dt = STEP, immersion = 0) => {
  for (let i = 0; i < Math.round(seconds / dt); i++) advanceWaterSurface(f.state, f.player, f.props, immersion, dt)
}
const amplitude = state => Math.max(...state.surfaces.flatMap(s => [...s.height].map(Math.abs)))

test('water has one fixed global point budget, even with many divided regions', () => {
  const plates = Array.from({ length: 16 }, (_, i) => water(i * 500, 450))
  const f = fixture(plates)
  assert.equal(f.state.surfaces.length, 16)
  assert.equal(f.state.surfaces.reduce((sum, s) => sum + s.height.length, 0), MAX_WATER_POINTS)
  for (const s of f.state.surfaces) for (let i = 0; i < 20; i++) disturbWaterSurface(f.state, (s.left + s.right) / 2, s.y, 2000, 120)
  advance(f, .5)
  assert.ok(amplitude(f.state) <= MAX_WAVE_HEIGHT)
})

test('one concave terrain block exposes only the actual pool opening', () => {
  const level = parseLevel(JSON.parse(readFileSync(new URL('fixtures/jumping/single-block-pool.json', import.meta.url))))
  const run = createRun(level), s = run.waterSurface.surfaces
  assert.equal(s.length, 1)
  assert.deepEqual([s[0].left, s[0].right, s[0].y], [570, 1475, 325])
})

test('solid dividers stop waves; flooded roofs and stacked water have no false air boundary', () => {
  const f = fixture([water()], [{ x: 440, y: 380, w: 30, h: 520 }])
  assert.equal(f.state.surfaces.length, 2)
  disturbWaterSurface(f.state, 350, 400, 600, 60); advance(f, .7)
  assert.ok(f.state.surfaces[0].active)
  assert.equal(f.state.surfaces[1].active, false)
  assert.equal(fixture([water()], [{ x: 0, y: 360, w: 900, h: 40 }]).state, undefined)
  const stacked = fixture([water(0, 900, 200, 200), water()])
  assert.equal(stacked.state.surfaces.length, 1)
  assert.equal(stacked.state.surfaces[0].y, 200)
})

test('overlapping rectangles share a spring instead of simulating duplicate waterlines', () => {
  const f = fixture([water(0, 600), water(300, 600)])
  assert.equal(f.state.surfaces.length, 1)
  assert.deepEqual([f.state.surfaces[0].left, f.state.surfaces[0].right], [0, 900])
  assert.equal(f.state.regions.size, 2)
})

for (const dt of [STEP, 1 / 30]) test(`entry waves spread, stay bounded, and sleep at ${dt}`, () => {
  const f = fixture(), s = f.state.surfaces[0], arrays = [s.height, s.previous, s.velocity, s.next]
  disturbWaterSurface(f.state, 350, 400, 700, 60)
  advance(f, .4, dt)
  assert.ok(amplitude(f.state) > 1 && amplitude(f.state) <= MAX_WAVE_HEIGHT)
  assert.ok([...s.height].some((h, i) => Math.abs(s.left + i * s.spacing - 350) > 80 && Math.abs(h) > .01), 'the ripple travels outside the impact footprint')
  assert.equal(s.height[0], 0); assert.equal(s.height.at(-1), 0)
  advance(f, 8, dt)
  assert.equal(f.state.active, false); assert.equal(amplitude(f.state), 0)
  const ticks = f.state.ticks
  advance(f, 2, dt)
  assert.equal(f.state.ticks, ticks, 'a resting surface performs no spring ticks')
  for (const [i, buffer] of [s.height, s.previous, s.velocity, s.next].entries()) assert.equal(buffer, arrays[i])
})

test('the surface updates at 30 Hz and exposes previous/current states for smooth drawing', () => {
  const f = fixture([water()], [], [], 350), s = f.state.surfaces[0]
  disturbWaterSurface(f.state, 450, 400, 700, 60)
  advance(f, 3 * STEP)
  assert.equal(f.state.ticks, 0)
  advance(f, STEP)
  assert.equal(f.state.ticks, 1)
  assert.ok(amplitude(f.state) > 0); assert.ok(s.previous.every(h => h === 0))
})

test('real entry excites the surface once; bobbing, submerged motion and teleporting stay quiet', () => {
  const f = fixture([water()], [], [], 350), s = f.state.surfaces[0]
  f.player.y = 425; f.player.vy = 650
  advanceWaterSurface(f.state, f.player, [], .15, STEP)
  assert.equal(s.active, true)
  advance(f, 10, STEP, .15)
  assert.equal(f.state.active, false)
  advance(f, 2, STEP, .5)
  assert.equal(f.state.active, false)
  advance(f, .05, STEP, 0); advance(f, .05, STEP, .03)
  assert.equal(f.state.active, false, 'a momentary dry sample does not retrigger a splash')
  advance(f, .2, STEP, 0)
  f.player.x += 150; advanceWaterSurface(f.state, f.player, [], .15, STEP)
  assert.equal(f.state.active, false, 'reset/reposition cannot make an entry impulse')
  assert.equal(fixture([water()], [], [], 700).state.wet[0], 1)
})

test('balls and boxes use their cached buoyancy immersion for entry detection', () => {
  for (const kind of ['ball', 'box']) {
    const prop = { kind, x: 400, y: 350, size: 60, vx: 0, vy: 500, angle: 0, angularVelocity: 0, grounded: false }
    const f = fixture([water()], [], [prop])
    prop.y = 420; prop.waterImmersion = .2
    advanceWaterSurface(f.state, f.player, f.props, 0, STEP)
    assert.equal(f.state.active, true)
  }
})

test('the ripple crest cannot enter a low static roof', () => {
  const f = fixture([water()], [{ x: 250, y: 330, w: 400, h: 66 }])
  disturbWaterSurface(f.state, 450, 400, 1000, 80)
  for (let i = 0; i < 720; i++) {
    advanceWaterSurface(f.state, f.player, [], 0, STEP)
    const s = f.state.surfaces[0]
    for (let point = 0; point < s.height.length; point++) if (s.left + point * s.spacing > 250 && s.left + point * s.spacing < 650)
      assert.ok(s.height[point] >= -2)
  }
})

test('offscreen water effects submit no drawing commands; active fills move the water boundary', () => {
  const f = fixture(), plate = [...f.state.regions.keys()][0], calls = []
  const ctx = { canvas: { width: 1000, height: 800 }, globalAlpha: 1,
    getTransform: () => ({ a: 1, d: 1, e: -2000, f: 0 }) }
  for (const name of ['save', 'restore', 'beginPath', 'moveTo', 'lineTo', 'closePath', 'fill', 'stroke', 'fillRect']) ctx[name] = (...args) => calls.push([name, ...args])
  drawWaterRegion(ctx, plate, undefined, f.state); drawWaterSurfaceDetails(ctx, f.state)
  assert.equal(calls.length, 0)
  ctx.getTransform = () => ({ a: 1, d: 1, e: 0, f: 0 })
  disturbWaterSurface(f.state, 450, 400, 700, 60); advance(f, .1)
  drawWaterRegion(ctx, plate, undefined, f.state)
  assert.ok(calls.some(c => c[0] === 'lineTo' && c[2] !== 400 && c[2] !== 900))
  assert.equal(calls.some(c => c[0] === 'fillRect'), false, 'the old flat top is replaced, rather than painted beneath the ripple')
  calls.length = 0; drawWaterSurfaceDetails(ctx, f.state)
  assert.equal(calls.some(c => c[0] === 'fillRect'), false, 'entries produce no droplets')
})

test('normal game integration caches geometry and observes an actual falling player entry', () => {
  const run = createRun({ ...blankTrial(), spawn: { x: 450, y: 250 }, gravityPlates: [water()], goal: { id: 'closed', x: 1600, y: 920, power: 'switched' } })
  run.started = true
  const state = run.waterSurface, outline = state.outlines
  let disturbed = false
  for (let i = 0; i < 300; i++) { stepRun(run, NEUTRAL_INPUT); disturbed ||= state.active }
  assert.ok(disturbed); assert.equal(run.waterSurface, state); assert.equal(state.outlines, outline)
})

for (const dt of [STEP, 1 / 30]) test(`entry ripples gently lift and rock real floats, then restore their attitude at ${dt}`, () => {
  const level = { ...blankTrial(), spawn: { x: 1500, y: 920 }, goal: { id: 'closed', x: 1600, y: 920, power: 'switched' },
    props: [{ kind: 'box', x: 500, y: 440, size: 80 }, { kind: 'ball', x: 800, y: 440, size: 80 }], gravityPlates: [water(0, 1400)] }
  const wave = createRun(level), quiet = createRun(level)
  wave.started = quiet.started = true
  for (let i = 0; i < Math.round(10 / dt); i++) { stepRun(wave, NEUTRAL_INPUT, dt); stepRun(quiet, NEUTRAL_INPUT, dt) }
  disturbWaterSurface(wave.waterSurface, 460, 400, 800, 90)
  const delta = [0, 0]; let angle = 0
  for (let i = 0; i < Math.round(8 / dt); i++) {
    stepRun(wave, NEUTRAL_INPUT, dt); stepRun(quiet, NEUTRAL_INPUT, dt)
    wave.props.forEach((p, j) => { delta[j] = Math.max(delta[j], Math.abs(p.y - quiet.props[j].y)) })
    angle = Math.max(angle, Math.abs(wave.props[0].angle))
    assert.ok(wave.props.every(p => Math.abs(p.vy) < 12), 'entry forces do not launch floating props')
  }
  assert.ok(delta[0] > .5 && delta[0] < 5, `nearby float responds subtly: ${delta[0]}`)
  assert.ok(delta[1] > .005 && delta[1] < .5, `distant response diminishes: ${delta[1]}`)
  assert.ok(angle > .005 && angle < .08, `the real box rocks gently: ${angle}`)
  assert.ok(Math.abs(wave.props[0].angle) < .001, 'water resistance and restoring force return the box to its resting angle')
  assert.ok(Math.abs(wave.props[0].y - quiet.props[0].y) < .1)
  assert.equal(wave.waterSurface.active, false)
})

test('a divider prevents a ripple from disturbing a float in the next pool', () => {
  const level = { ...blankTrial(), spawn: { x: 1600, y: 920 }, goal: { id: 'closed', x: 1500, y: 920, power: 'switched' },
    platforms: [{ x: 440, y: 380, w: 30, h: 540 }], props: [{ kind: 'box', x: 500, y: 430, size: 60 }], gravityPlates: [water()] }
  const wave = createRun(level), quiet = createRun(level); wave.started = quiet.started = true
  disturbWaterSurface(wave.waterSurface, 400, 400, 800, 90)
  for (let i = 0; i < 720; i++) { stepRun(wave, NEUTRAL_INPUT); stepRun(quiet, NEUTRAL_INPUT) }
  assert.deepEqual(wave.props[0], quiet.props[0])
})

test('a ripple moves a box and its rider through normal support contacts', () => {
  const run = createRun({ ...blankTrial(), spawn: { x: 600, y: 330 }, props: [{ kind: 'box', x: 600, y: 460, size: 120 }],
    goal: { id: 'closed', x: 1600, y: 920, power: 'switched' }, gravityPlates: [water(0, 1400)] })
  run.started = true
  for (let i = 0; i < 1200; i++) stepRun(run, NEUTRAL_INPUT)
  disturbWaterSurface(run.waterSurface, 600, 400, 800, 100)
  for (let i = 0; i < 720; i++) {
    stepRun(run, NEUTRAL_INPUT)
    assert.equal(run.player.contacts.support?.collider.prop, run.props[0])
    assert.ok(Math.abs(run.player.y - run.props[0].y + run.props[0].size) < .01)
  }
})

test('low performance mode stops all surface simulation and float reactions immediately', () => {
  const level = { ...blankTrial(), spawn: { x: 1500, y: 920 }, goal: { id: 'closed', x: 1600, y: 920, power: 'switched' },
    props: [{ kind: 'box', x: 500, y: 440, size: 80 }], gravityPlates: [water(0, 1400)] }
  const run = createRun(level), quiet = createRun(level); run.started = quiet.started = true
  for (let i = 0; i < 1200; i++) { stepRun(run, NEUTRAL_INPUT); stepRun(quiet, NEUTRAL_INPUT) }
  const state = run.waterSurface
  disturbWaterSurface(state, 460, 400, 800, 90)
  for (let i = 0; i < 16; i++) advanceWaterSurface(state, run.player, run.props, 0, STEP)
  assert.ok(state.active); assert.ok(state.propHeight[0]); assert.ok(state.propRock[0])
  const actors = structuredClone([run.player, ...run.props])
  setWaterEffectsEnabled(run, false)
  assert.deepEqual([run.player, ...run.props], actors, 'the quality switch never moves a body or resets its momentum')
  assert.equal(state.active, false); assert.equal(amplitude(state), 0)
  assert.ok(state.propHeight.every(n => n === 0))
  assert.ok(state.propSlope.every(n => n === 0)); assert.ok(state.propRock.every(n => n === 0))
  const ticks = state.ticks, observations = state.bodies.slice()
  for (let i = 0; i < 240; i++) {
    disturbWaterSurface(state, 460, 400, 800, 90)
    stepRun(run, NEUTRAL_INPUT); stepRun(quiet, NEUTRAL_INPUT)
    for (const key of ['x', 'y', 'vx', 'vy', 'angle', 'angularVelocity', 'gravity', 'grounded', 'waterBob'])
      assert.deepEqual(run.props[0][key], quiet.props[0][key], 'baseline buoyancy and water resistance still work without ripple forces')
  }
  assert.equal(state.ticks, ticks); assert.deepEqual(state.bodies, observations, 'disabled water skips entry observation too')
})

test('restoring quality starts from current immersion without replaying old splashes', () => {
  const run = createRun({ ...blankTrial(), spawn: { x: 450, y: 350 }, gravityPlates: [water()] }), state = run.waterSurface
  setWaterEffectsEnabled(run, false)
  run.player.y = 700; run.player.vy = 300
  advanceWaterSurface(state, run.player, [], .9, STEP)
  setWaterEffectsEnabled(run, true)
  assert.equal(state.wet[0], 1)
  advanceWaterSurface(state, run.player, [], .9, STEP)
  assert.equal(state.active, false)
  run.player.y = 350
  for (let i = 0; i < 24; i++) advanceWaterSurface(state, run.player, [], 0, STEP)
  run.player.y = 425
  advanceWaterSurface(state, run.player, [], .2, STEP)
  assert.equal(state.active, true, 'a later real entry still produces its ripple')
})

test('disabled surface effects draw only the original flat water rectangle', () => {
  const run = createRun({ ...blankTrial(), gravityPlates: [water()] }), state = run.waterSurface, calls = []
  disturbWaterSurface(state, 450, 400, 800, 60)
  setWaterEffectsEnabled(run, false)
  const ctx = { canvas: { width: 1000, height: 800 }, globalAlpha: 1, getTransform: () => ({ a: 1, d: 1, e: 0, f: 0 }) }
  for (const name of ['save', 'restore', 'beginPath', 'moveTo', 'lineTo', 'closePath', 'fill', 'stroke', 'fillRect']) ctx[name] = (...args) => calls.push([name, ...args])
  drawWaterRegion(ctx, run.level.gravityPlates[0], undefined, state)
  drawWaterSurfaceDetails(ctx, state)
  assert.deepEqual(calls, [['save'], ['fillRect', 0, 400, 900, 500], ['restore']])
})
