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

test('footsteps follow planted feet: walking makes steps, standing and airborne travel do not', () => {
  const { run, step } = setup(), cues = []
  for (let i = 0; i < 120; i++) assert.equal(step().cues.length, 0)
  for (let i = 0; i < 150; i++) cues.push(...step({ ...NEUTRAL_INPUT, move: 1 }).cues)
  assert.ok(cues.filter(c => c.kind === 'footstep').length >= 4, JSON.stringify(cues))
  for (let i = 0; i < 80; i++) step()
  for (let i = 0; i < 120; i++) assert.equal(step().cues.length, 0)
  assert.equal(step({ ...NEUTRAL_INPUT, jump: true }).cues.length, 0)
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

test('falling balls and boxes sound once on landing, with harder drops making stronger impacts', () => {
  for (const kind of ['ball', 'box']) for (const size of [30, 68, 200]) {
    const strengths = []
    for (const drop of [20, 300]) {
      const { run, step } = setup(l => { l.props = [{ kind, x: 450, y: l.floor - drop, size }] })
      run.started = true
      const impacts = []
      for (let i = 0; i < 400; i++) {
        const wasGrounded = run.props[0].grounded, frame = step()
        for (const cue of frame.cues) {
          assert.equal(cue.kind, `${kind}-impact`)
          assert.equal(cue.size, size)
          assert.ok(!wasGrounded && run.props[0].grounded, 'impact coincides with the landing')
          impacts.push(cue)
        }
      }
      assert.equal(impacts.length, 1, `${kind}, size ${size}, drop ${drop}: one impact without settling chatter`)
      assert.ok(impacts[0].volume > 0)
      strengths.push(impacts[0].strength)
    }
    assert.ok(strengths[1] > strengths[0], `${kind}, size ${size}: a longer fall sounds harder`)
  }
})

test('props also make landing sounds on platforms, elevators and supported boxes', () => {
  for (const kind of ['ball', 'box']) for (const support of ['terrain', 'elevator', 'box']) {
    const surface = support === 'box' ? 800 : 600
    const { run, step } = setup(l => {
      l.props = [{ kind, x: 450, y: surface - 200, size: 68 }]
      if (support === 'terrain') l.platforms = [{ x: 300, y: surface, w: 300, h: 20 }]
      if (support === 'elevator') l.mechanisms = [{ id: 'lift', kind: 'lift', x: 300, y: surface, w: 300, h: 20, travel: 200 }]
      if (support === 'box') l.props.push({ kind: 'box', x: 450, y: 920, size: 120 })
    })
    run.started = true
    const impacts = []
    for (let i = 0; i < 400; i++) impacts.push(...step().cues)
    assert.equal(impacts.length, 1, `${kind} on ${support}`)
    assert.equal(impacts[0].kind, `${kind}-impact`)
    assert.ok(Math.abs(run.props[0].y - surface) < 1)
  }
})

test('a tumbling box landing emits one combined impact; quiet contacts, transport and reset stay silent', () => {
  for (const kind of ['box', 'ball']) {
    const { run, audio } = setup(l => { l.props = [{ kind, x: 450, y: 920, size: 40 }] })
    const prop = run.props[0], observe = () => { audio.step(run.player, run, STEP); return audio.drain().cues }
    prop.grounded = false; prop.vy = 500; prop.angularVelocity = 8; audio.reset(run.player, run)
    prop.grounded = true; prop.vy = 0; prop.angle += .2; prop.angularVelocity = 0
    assert.deepEqual(observe().map(c => c.kind), [`${kind}-impact`])
    for (let i = 0; i < 30; i++) assert.deepEqual(observe(), [])
    audio.reset(run.player, run); assert.deepEqual(observe(), [])
    // A tiny support-contact flicker is too slow to make a landing thud.
    prop.grounded = false; prop.vy = 15; observe()
    prop.grounded = true; prop.vy = 0; assert.deepEqual(observe(), [])
    for (let i = 0; i < 30; i++) { prop.y += 1; assert.deepEqual(observe(), [], 'transport is not a landing') }
    prop.grounded = false; prop.vy = 500; observe()
    prop.y -= 300; prop.grounded = true; prop.vy = 0
    assert.deepEqual(observe(), [], 'teleports do not sound like collisions')
  }
})

test('pushed small boxes knock once per new edge in either direction, while large sliding boxes keep scraping', () => {
  for (const size of [30, 40, 50, 100]) for (const direction of [-1, 1]) {
    const { run, step } = setup(l => {
      l.width = 4000; l.goal.x = 3000
      l.props = [{ kind: 'box', x: 800, y: 920, size }]
      l.spawn.x = 800 - direction * (size / 2 + 40)
    })
    const impacts = [], scrape = []
    for (let i = 0; i < 600; i++) {
      const frame = step({ ...NEUTRAL_INPUT, move: direction }), b = run.props[0]
      for (const cue of frame.cues.filter(c => c.kind === 'box-impact')) {
        const edge = Math.round(b.angle / (Math.PI / 2))
        assert.ok(b.grounded)
        assert.ok(Math.abs(b.angle - edge * Math.PI / 2) < .06, 'knock aligns with the next edge landing')
        assert.equal(cue.size, size)
        impacts.push(edge)
      }
      if (i > 120) scrape.push(frame.loops.find(l => l.kind === 'box')?.volume ?? 0)
    }
    if (size < 60) {
      assert.ok(impacts.length >= 4, `${size}, ${direction}: ${impacts}`)
      assert.equal(new Set(impacts).size, impacts.length, 'no repeated knock from settling on one face')
      assert.ok(scrape.reduce((sum, v) => sum + v, 0) / scrape.length < .25, 'tumbling leaves only a quiet intermittent scrape')
    } else {
      assert.deepEqual(impacts, [])
      assert.ok(scrape.some(v => v > .5), 'flat sliding retains its existing scrape')
    }
  }
})

test('airborne rotation, resting jitter, transport, reset and teleports do not create box knocks', () => {
  const { run, audio } = setup(l => { l.props = [{ kind: 'box', x: 350, y: 920, size: 40 }] })
  const box = run.props[0]
  const observe = () => { audio.step(run.player, run, STEP); return audio.drain() }
  for (let i = 0; i < 100; i++) {
    box.angle = i % 2 ? .002 : -.002; box.angularVelocity = i % 2 ? 2 : 0
    assert.deepEqual(observe().cues, [])
  }
  box.grounded = false; box.angle = .8; box.angularVelocity = 6; observe()
  box.angle = .9; box.angularVelocity = 0
  assert.deepEqual(observe().cues, [], 'decelerating while airborne is not an impact')
  audio.reset(run.player, run)
  box.grounded = true; box.angle += .001
  assert.deepEqual(observe().cues, [], 'resume discards previous angular travel')
  box.angularVelocity = 6; observe(); box.x += 400; box.angle += .6; box.angularVelocity = 0
  assert.deepEqual(observe().cues, [], 'relocation is not a collision')
  box.angle = 0; audio.reset(run.player, run)
  for (let i = 0; i < 50; i++) {
    box.x += 1; box.y -= 1
    assert.deepEqual(observe(), { loops: [], cues: [] }, 'being carried is silent')
  }
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
  const { run, audio } = setup(l => { l.goal = { x: 300, y: 920, power: 'switched', id: 'exit' }; l.triggers = [{ x: 200, y: 920, w: 60, mode: 'touch', targets: [] }] })
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

test('ball size lowers both the rolling texture and resonance while preserving the default sound', () => {
  for (const pace of [0, .5, 1]) {
    const tone = size => loopTone({ kind: 'ball', pace, size })
    assert.deepEqual(tone(68), { frequency: 105 - 68 * .28 + pace * 28, cutoff: 240 + pace * 260,
      playbackRate: .65 + pace * .8, body: .12, texture: 1, volume: .12 })
    for (const [small, large] of [[30, 68], [68, 100], [100, 160], [160, 200]]) {
      for (const property of ['frequency', 'cutoff', 'playbackRate']) assert.ok(tone(large)[property] < tone(small)[property],
        `${property} decreases from size ${small} to ${large} at pace ${pace}`)
    }
    assert.ok(tone(200).cutoff < tone(68).cutoff * .65, 'the dominant texture has a substantial change at the largest size')
  }
})
