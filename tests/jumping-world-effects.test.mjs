import test from 'node:test'
import assert from 'node:assert/strict'
import { JumpingAudioState } from '../src/games/jumping/audioState.ts'
import { createRun, stepRun, setWaterEffectsEnabled } from './helpers/jumping-active-run.mjs'
import { blankTrial } from '../src/games/jumping/level.ts'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { MAX_WORLD_EFFECTS, WORLD_EFFECT_LIFE, landingDustStrength, recordWorldEffect, worldEffects } from '../src/games/jumping/worldEffects.ts'
import { IMPACT_DUST_COLOR, SPLASH_COLOR, drawImpactEffects, drawSplashes } from '../src/games/jumping/impactRender.ts'
import { GameCamera, LANDING_SETTLE_PIXELS, LANDING_SETTLE_SECONDS, gameCamera } from '../src/games/jumping/camera.ts'

const FLOOR = blankTrial().entrance.y

/** Runs a level for a few seconds with the sound observer watching, as the game does. */
function play(change, seconds = 3) {
  const level = blankTrial()
  change(level)
  const run = createRun(level), audio = new JumpingAudioState()
  audio.reset(run.player, run)
  for (let time = 0; time < seconds; time += STEP) { stepRun(run, NEUTRAL_INPUT); audio.step(run.player, run, STEP); audio.drain() }
  return run
}
const kinds = run => worldEffects(run).map(e => e.kind)

test('a hard landing kicks up dust at the feet; a step down or a small hop does not', () => {
  for (const drop of [10, 60]) assert.deepEqual(kinds(play(l => { l.entrance = { x: 600, y: FLOOR - drop } })), [], `${drop} unit drop`)
  const run = play(l => { l.entrance = { x: 600, y: FLOOR - 320 } })
  assert.deepEqual(kinds(run), ['landing'])
  const [dust] = worldEffects(run)
  assert.equal(dust.x, run.player.x); assert.equal(dust.y, FLOOR); assert.equal(dust.up, 1)
  assert.ok(dust.strength > .4 && dust.strength <= 1, `strength ${dust.strength}`)
  assert.ok(dust.time > 0 && dust.time < 1)
  // A small hop (the shortest jump) lands at its takeoff speed, under the dust threshold.
  assert.equal(landingDustStrength(400), 0)
  assert.ok(landingDustStrength(800) > landingDustStrength(600))
})

test('crates and balls that land hard leave ticks at their contact; gentle settling does not', () => {
  for (const kind of ['box', 'ball']) {
    assert.deepEqual(kinds(play(l => { l.props = [{ kind, size: 60, x: 600, y: FLOOR - 4 }] })), [], `${kind} settling`)
    const run = play(l => { l.props = [{ kind, size: 60, x: 600, y: FLOOR - 300 }] })
    const ticks = worldEffects(run).filter(e => e.kind === `${kind}-impact`)
    assert.ok(ticks.length >= 1, `${kind}: ${kinds(run)}`)
    assert.ok(Math.abs(ticks[0].y - FLOOR) < 2, `${kind} contact at the floor, ${ticks[0].y}`)
    assert.equal(ticks[0].size, 60)
  }
})

test('entering water splashes on the waterline, and a run with reduced water effects records none', () => {
  const pool = l => { l.gravityPlates = [{ id: 'pool', effect: 'water', power: 'always', x: 400, y: 500, w: 1000, h: 420, gravity: -1 }]; l.entrance = { x: 600, y: 300 } }
  const run = play(pool)
  const splash = worldEffects(run).filter(e => e.kind === 'splash')
  assert.equal(splash.length, 1)
  assert.equal(splash[0].y, 500, 'on the waterline, not at the body')
  assert.equal(splash[0].size, 60)
  const level = blankTrial(); pool(level)
  const reduced = createRun(level), audio = new JumpingAudioState()
  setWaterEffectsEnabled(reduced, false); audio.reset(reduced.player, reduced)
  for (let time = 0; time < 3; time += STEP) { stepRun(reduced, NEUTRAL_INPUT); audio.step(reduced.player, reduced, STEP); audio.drain() }
  assert.deepEqual(kinds(reduced).filter(kind => kind === 'splash'), [])
})

test('effects belong to their run, and the list stays bounded', () => {
  const run = { activeTime: 0 }, other = { activeTime: 0 }
  for (let i = 0; i < MAX_WORLD_EFFECTS + 10; i++) recordWorldEffect(run, { kind: 'landing', x: i, y: 0, strength: 1, size: 60, angle: 0, up: 1, time: 0 })
  assert.equal(worldEffects(run).length, MAX_WORLD_EFFECTS)
  assert.equal(worldEffects(run)[0].x, 10, 'the oldest make room')
  assert.equal(worldEffects(other).length, 0)
  recordWorldEffect(run, { kind: 'landing', x: 0, y: 0, strength: 1, size: 60, angle: 0, up: 1, time: 5 })
  assert.equal(worldEffects(run).length, 1, 'finished effects are forgotten')
})

test('a hard landing settles the view a few pixels for a moment; a small hop leaves it still', () => {
  // A room taller than the view, so the camera follows the robot vertically.
  const run = createRun(blankTrial()), p = run.player, level = { ...run.level, height: 2400, floor: 2400 }, frame = 1 / 60
  /** Screen pixels the view sits below where it would otherwise be, frame by frame after a landing at this fall speed. */
  const settle = fall => {
    const camera = new GameCamera(), offsets = []
    p.grounded = false; p.vy = fall
    camera.view(1600, 900, p, level, true, frame)
    p.grounded = true; p.vy = 0
    for (let time = 0; time < .3; time += frame) {
      const view = camera.view(1600, 900, p, level, true, frame)
      offsets.push((view.y - gameCamera(1600, 900, p, level, true).y) * view.zoom)
    }
    return offsets
  }
  const hard = settle(1000)
  assert.ok(Math.abs(hard[0] - LANDING_SETTLE_PIXELS[1]) < 1e-9, `${hard[0]} pixels at the hardest landing`)
  assert.ok(hard.every((offset, i) => i === 0 || offset <= hard[i - 1]), 'it only eases back')
  assert.equal(hard[Math.ceil(LANDING_SETTLE_SECONDS / frame)], 0)
  const moderate = settle(700)[0]
  assert.ok(moderate >= LANDING_SETTLE_PIXELS[0] && moderate < LANDING_SETTLE_PIXELS[1], `${moderate}`)
  assert.ok(settle(400).every(offset => offset === 0), 'a small hop')
  // A room short enough to frame whole keeps its still framing (jumpingCamera.spec.mjs).
  const camera = new GameCamera(), short = { ...level, height: 400, floor: 400 }
  p.grounded = false; p.vy = 1000; camera.view(1600, 900, p, short, true, frame)
  p.grounded = true; p.vy = 0
  assert.equal(camera.view(1600, 900, p, short, true, frame).y, gameCamera(1600, 900, p, short, true).y)
})

/** A Canvas 2D stand-in that records calls with the fill or stroke style in force. */
function recorder(view = { e: 0, f: 0 }) {
  const calls = []
  const ctx = { canvas: { width: 1000, height: 800 }, globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: 'butt',
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, ...view }) }
  for (const name of ['save', 'restore', 'translate', 'rotate', 'scale', 'beginPath', 'moveTo', 'lineTo', 'quadraticCurveTo', 'closePath', 'fill', 'stroke'])
    ctx[name] = (...args) => calls.push([name, ...args])
  ctx.fillRect = (...args) => calls.push(['fillRect', ...args, ctx.fillStyle, ctx.globalAlpha])
  return { ctx, calls }
}
const effect = (kind, time = 0, extra = {}) => ({ kind, x: 500, y: 400, strength: 1, size: 60, angle: 0, up: 1, time, ...extra })

test('landing dust and ticks draw only while they last, only on screen, and the same way each time', () => {
  const run = { activeTime: .1 }
  recordWorldEffect(run, effect('landing')); recordWorldEffect(run, effect('box-impact', 0, { x: 700 }))
  const first = recorder(); drawImpactEffects(first.ctx, run)
  const dust = first.calls.filter(c => c[0] === 'fillRect')
  assert.ok(dust.length >= 10 && dust.length <= 14, `${dust.length} specks`)
  assert.ok(dust.every(c => c[5] === IMPACT_DUST_COLOR && c[6] <= .5), 'grit colour, alpha no higher than 0.5')
  assert.ok(first.calls.some(c => c[0] === 'stroke'), 'crate ticks')
  const again = recorder(); drawImpactEffects(again.ctx, run)
  assert.deepEqual(again.calls, first.calls, 'evaluated from gameplay time, never random')
  run.activeTime = WORLD_EFFECT_LIFE.landing + .01
  const after = recorder(); drawImpactEffects(after.ctx, run)
  assert.equal(after.calls.length, 0, 'gone once their time is up')
  run.activeTime = .1
  const away = recorder({ e: -5000, f: 0 }); drawImpactEffects(away.ctx, run)
  assert.equal(away.calls.length, 0, 'off screen submits nothing')
  const quiet = recorder(); drawImpactEffects(quiet.ctx, { activeTime: 1 })
  assert.equal(quiet.calls.length, 0, 'a run with no impacts, such as a studio preview, draws nothing')
})

test('splash drops stay above the waterline and are gone within 0.6 s; reduced water effects draw none', () => {
  const run = { activeTime: 0, waterEffectsEnabled: true, waterSurface: { enabled: true } }
  recordWorldEffect(run, effect('splash'))
  let drops = 0
  for (let time = 0; time <= WORLD_EFFECT_LIFE.splash + .05; time += 1 / 60) {
    run.activeTime = time
    const { ctx, calls } = recorder(); drawSplashes(ctx, run)
    for (const call of calls.filter(c => c[0] === 'fillRect')) {
      drops++
      assert.equal(call[5], SPLASH_COLOR)
      assert.ok(call[2] + call[4] / 2 <= 400 + 1e-9, 'not below the waterline')
    }
    if (time > WORLD_EFFECT_LIFE.splash) assert.equal(calls.length, 0)
  }
  assert.ok(drops > 30, `${drops} drops drawn over the splash`)
  run.activeTime = .1
  const lobes = recorder(); drawSplashes(lobes.ctx, run)
  assert.equal(lobes.calls.filter(c => c[0] === 'quadraticCurveTo').length, 4, 'two lobes')
  run.waterSurface.enabled = false
  const reduced = recorder(); drawSplashes(reduced.ctx, run)
  assert.equal(reduced.calls.length, 0)
})
