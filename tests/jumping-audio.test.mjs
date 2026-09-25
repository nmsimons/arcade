import test from 'node:test'
import assert from 'node:assert/strict'
import { JumpingAudioState, soundPosition } from '../src/games/jumping/audioState.ts'
import { loopTone } from '../src/games/jumping/sound.ts'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { blankTrial } from '../src/games/jumping/level.ts'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'

function setup(change = () => {}) {
  const level = blankTrial(); change(level)
  const run = createRun(level), audio = new JumpingAudioState()
  audio.reset(run.player, run)
  const step = (input = NEUTRAL_INPUT) => { stepRun(run, input); audio.step(run.player, run, STEP); return audio.drain() }
  return { run, audio, step }
}

test('footsteps follow planted feet: walking makes steps, standing, charging and airborne travel do not', () => {
  const { run, step } = setup(), cues = []
  for (let i = 0; i < 120; i++) assert.equal(step().cues.length, 0)
  for (let i = 0; i < 150; i++) cues.push(...step({ ...NEUTRAL_INPUT, move: 1 }).cues)
  assert.ok(cues.filter(c => c.kind === 'footstep').length >= 4, JSON.stringify(cues))
  for (let i = 0; i < 80; i++) step()
  for (let i = 0; i < 120; i++) assert.equal(step().cues.length, 0)
  for (let i = 0; i < 50; i++) assert.equal(step({ ...NEUTRAL_INPUT, jump: true }).cues.length, 0)
  step()
  assert.equal(run.player.grounded, false)
  for (let i = 0; i < 30; i++) assert.equal(step({ ...NEUTRAL_INPUT, move: 1 }).cues.length, 0)
  let landings = 0
  for (let i = 0; i < 160; i++) landings += step().cues.filter(c => c.kind === 'footstep').length
  assert.ok(landings >= 1)
})

test('carried feet, sliding feet and a respawn never become phantom footsteps', () => {
  const { run, audio } = setup(), p = run.player
  p.footwork = { feet: [{ planted: false }, { planted: true }] }
  p.contacts = { motion: { speed: 0 } }; audio.reset(p, run)
  p.y -= 1; p.footwork.feet[0].planted = true
  audio.step(p, run, STEP); assert.equal(audio.drain().cues.length, 0)
  p.footwork.feet[0].planted = false; p.contacts.motion.speed = 120; p.sliding = { active: true }
  audio.step(p, run, STEP); p.footwork.feet[0].planted = true
  audio.step(p, run, STEP); assert.equal(audio.drain().cues.length, 0)
  p.sliding = null; p.grounded = false; p.vy = 500; audio.reset(p, run)
  p.y -= 500; p.grounded = true
  audio.step(p, run, STEP); assert.equal(audio.drain().cues.length, 0)
})

test('props sound only in ground contact with actual rolling or sliding, not when carried or blocked', () => {
  const { run, audio } = setup(l => { l.props = [{ kind: 'ball', x: 350, y: 890, size: 60 }, { kind: 'box', x: 500, y: 890, size: 60 }] })
  const observe = () => { audio.step(run.player, run, STEP); return audio.drain().loops }
  assert.equal(observe().length, 0)
  for (const b of run.props) { b.vx = 80; b.x += 80 * STEP }
  assert.deepEqual(observe().map(l => l.kind), ['ball', 'box'])
  // Solver forces without displacement must not keep a scrape running.
  assert.equal(observe().length, 0)
  for (const b of run.props) { b.grounded = false; b.x += 80 * STEP }
  assert.equal(observe().length, 0)
  for (const b of run.props) { b.grounded = true; b.vx = 0; b.y -= 130 * STEP }
  assert.equal(observe().length, 0)
  run.props[0].angle += .05
  assert.equal(observe()[0].kind, 'ball')
})

test('gate direction follows motion for both orientations; a waiting or blocked elevator is silent', () => {
  const { run, audio } = setup(l => { l.mechanisms = [
    { id: 'vertical', kind: 'gate', x: 500, y: 720, w: 20, h: 200, travel: 200 },
    { id: 'horizontal', kind: 'gate', orientation: 'horizontal', flipX: true, x: 700, y: 700, w: 200, h: 20, travel: 200 },
    { id: 'lift', kind: 'lift', x: 900, y: 900, w: 100, h: 20, travel: 300 },
  ] })
  const observe = () => { audio.step(run.player, run, STEP); return audio.drain().loops }
  for (const m of run.mechanisms) m.active = true
  assert.equal(observe().length, 0)
  run.mechanisms[0].y -= 1; run.mechanisms[1].x += 1; run.mechanisms[2].y -= 1
  assert.deepEqual(observe().map(l => l.kind), ['gate-open', 'gate-open', 'elevator'])
  run.mechanisms[0].y += .5; run.mechanisms[1].x -= .5
  assert.deepEqual(observe().map(l => l.kind), ['gate-close', 'gate-close'])
  assert.equal(observe().length, 0)
})

test('switch and goal activation are single cues; light alone does not play timer pause', () => {
  const { run, audio } = setup(l => { l.goal.x = 300; l.triggers = [{ x: 200, y: 920, w: 60, mode: 'touch', targets: [] }] })
  run.triggers[0].active = true; run.goalLit = true
  audio.step(run.player, run, STEP)
  assert.deepEqual(audio.drain().cues.map(c => c.kind), ['switch', 'switch'])
  for (let i = 0; i < 120; i++) { audio.step(run.player, run, STEP); assert.equal(audio.drain().cues.length, 0) }
  run.triggers[0].active = false; audio.step(run.player, run, STEP)
  run.triggers[0].active = true; audio.step(run.player, run, STEP)
  assert.equal(audio.drain().cues.length, 1)
})

test('stopwatches, extensions and entering the exit each cue once; reset/resume never replay them', () => {
  const { run, audio, step } = setup(l => { l.pickups = [{ kind: 'stopwatch', x: 160, y: 888 }] })
  assert.deepEqual(step().cues.map(c => c.kind), ['timer-paused'])
  for (let i = 0; i < 80; i++) assert.equal(step().cues.length, 0)
  run.timeStopRemaining += 10; audio.step(run.player, run, STEP)
  assert.deepEqual(audio.drain().cues.map(c => c.kind), ['timer-paused'])
  run.exit = { elapsed: 0, fromX: 160, toX: 200 }; audio.step(run.player, run, STEP)
  assert.deepEqual(audio.drain().cues.map(c => c.kind), ['timer-paused'])
  audio.reset(run.player, run); audio.step(run.player, run, STEP)
  assert.equal(audio.drain().cues.length, 0)
  assert.equal(audio.drain().cues.length, 0)
})

test('large balls sound lower, gate closing is lower, and distant sounds fade out in either direction', () => {
  const loop = { kind: 'ball', pace: .5, size: 30 }
  assert.ok(loopTone({ ...loop, size: 200 }).frequency < loopTone(loop).frequency)
  assert.ok(loopTone({ ...loop, kind: 'gate-close' }).frequency < loopTone({ ...loop, kind: 'gate-open' }).frequency)
  const listener = { x: 0, y: 30 }
  assert.equal(soundPosition(0, 0, listener).volume, 1)
  assert.equal(soundPosition(1500, 0, listener).volume, 0)
  assert.ok(soundPosition(-200, 0, listener).pan < 0)
  assert.ok(soundPosition(200, 0, listener).pan > 0)
  assert.ok(soundPosition(200, 0, listener).volume > soundPosition(800, 0, listener).volume)
})
