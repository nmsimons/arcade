import test from 'node:test'
import assert from 'node:assert/strict'
import { JumpingAudioState } from '../src/games/jumping/audioState.ts'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { blankTrial } from '../src/games/jumping/level.ts'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { updateGravityField } from '../src/games/jumping/gravity.ts'

function setup(change = () => {}) {
  const level = blankTrial()
  level.gravityPlates = [{ id: 'pool', effect: 'water', power: 'always', x: 400, y: 500, w: 1000, h: 420, gravity: -1 }]
  change(level)
  const run = createRun(level), audio = new JumpingAudioState()
  run.started = true
  audio.reset(run.player, run)
  const observe = (dt = STEP) => { audio.step(run.player, run, dt); return audio.drain().cues.filter(c => c.kind === 'water-entry') }
  return { run, audio, observe }
}

for (const dt of [STEP, 1 / 30]) for (const kind of ['player', 'ball', 'box']) {
  test(`${kind} falling into water splashes once, with stronger feedback for a harder entry at ${1 / dt} Hz`, () => {
    const strengths = []
    for (const drop of [20, 300]) {
      const { run, observe } = setup(l => {
        if (kind === 'player') l.spawn = { x: 600, y: 500 - drop }
        else l.props = [{ kind, size: 68, x: 600, y: 500 - drop }]
      })
      const splashes = []
      for (let time = 0; time < 6; time += dt) {
        stepRun(run, NEUTRAL_INPUT, dt); splashes.push(...observe(dt))
      }
      assert.equal(splashes.length, 1, 'entry sounds once; settling and floating are quiet')
      assert.ok(splashes[0].volume > .05)
      assert.equal(splashes[0].size, kind === 'player' ? 60 : 68)
      strengths.push(splashes[0].strength)
    }
    assert.ok(strengths[1] > strengths[0], `${kind}: ${strengths}`)
  })
}

for (const kind of ['player', 'ball', 'box']) test(`${kind} splashes on side entry, rearms after leaving, and ignores waterline chatter`, () => {
  const { run, audio, observe } = setup(l => {
    l.spawn = { x: 370, y: 700 }
    if (kind !== 'player') l.props = [{ kind, size: 60, x: 360, y: 700 }]
  })
  const body = kind === 'player' ? run.player : run.props[0], dryX = body.x
  body.vx = 120; body.vy = 0; body.grounded = false
  audio.reset(run.player, run)
  body.x = 420
  const splash = observe()
  assert.equal(splash.length, 1)
  assert.ok(splash[0].strength > .2)
  for (let i = 0; i < 120; i++) {
    body.x = i % 2 ? dryX : 420
    assert.equal(observe().length, 0, 'briefly skimming the boundary must not chatter')
  }
  body.x = dryX
  for (let i = 0; i < 20; i++) assert.equal(observe().length, 0)
  body.x = 420
  assert.equal(observe().length, 1, 'a separate entry makes another splash')
})

test('larger objects make fuller splashes, with spatial falloff and panning', () => {
  for (const kind of ['ball', 'box']) {
    const entries = []
    for (const size of [30, 200]) {
      const { run, audio, observe } = setup(l => { l.props = [{ kind, size, x: 600, y: 490 }] })
      const b = run.props[0]
      b.vy = 250; audio.reset(run.player, run); b.y += 40
      const cue = observe()[0]
      assert.ok(cue)
      assert.equal(cue.size, size)
      assert.ok(cue.pan > 0 && cue.volume < 1)
      entries.push(cue)
    }
    assert.ok(entries[1].strength > entries[0].strength)
  }
})

test('submerged spawns, reset/resume, teleports and EMP do not splash', () => {
  const { run, audio, observe } = setup(l => {
    l.spawn = { x: 600, y: 700 }
    l.props = [{ kind: 'ball', size: 68, x: 800, y: 700 }, { kind: 'box', size: 60, x: 1000, y: 700 }]
  })
  for (let i = 0; i < 120; i++) { stepRun(run, NEUTRAL_INPUT); assert.equal(observe().length, 0) }
  audio.reset(run.player, run); assert.equal(observe().length, 0)
  for (const body of [run.player, ...run.props]) body.x -= 1000
  assert.equal(observe().length, 0)
  for (let i = 0; i < 30; i++) observe()
  for (const body of [run.player, ...run.props]) body.x += 1000
  assert.equal(observe().length, 0)
  for (const powered of [false, true, false, true]) {
    updateGravityField(run.gravityField, run.level.gravityPlates, run.switchStates, powered)
    for (const body of [run.player, ...run.props]) body.y += 1
    assert.equal(observe().length, 0, 'switching or EMP restoration is not an entry')
  }
})

test('ordinary gravity fields have no splash sound', () => {
  for (const power of ['always', 'switched']) {
    const { run, observe } = setup(l => {
      l.spawn = { x: 600, y: 490 }
      l.props = [{ kind: 'box', size: 60, x: 800, y: 490 }]
      l.gravityPlates[0].power = power
      delete l.gravityPlates[0].effect
    })
    for (const body of [run.player, ...run.props]) { body.vy = 300; body.y += 20 }
    assert.equal(observe().length, 0)
  }
})

test('entering legacy switched water during EMP still makes a splash', () => {
  const { run, observe } = setup(l => { l.spawn = { x: 600, y: 490 }; l.gravityPlates[0].power = 'switched' })
  updateGravityField(run.gravityField, run.level.gravityPlates, run.switchStates, false)
  run.player.vy = 300; run.player.y += 20
  assert.equal(observe().length, 1)
})
