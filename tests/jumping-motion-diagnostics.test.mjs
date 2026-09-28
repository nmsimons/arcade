import test from 'node:test'
import assert from 'node:assert/strict'
import { JumpingMotionDiagnostics } from '../src/games/jumping/motionDiagnostics.ts'
import { createPlayer, NEUTRAL_INPUT, STEP, stepPlayer } from '../src/games/jumping/model.ts'
import { blankTrial } from '../src/games/jumping/level.ts'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'

const player = () => Object.assign(createPlayer({ x: 200, y: 620 }), {
  contacts: { support: null, push: null, body: [], motion: { x: 0, y: 0, speed: 0 } },
})
const observe = (monitor, p, input = NEUTRAL_INPUT, dt = STEP) => monitor.step(p, input, dt, 'test-level')

test('repeated contact reversals are captured once per episode with detached, bounded history', () => {
  for (const dt of [STEP, 1 / 60]) {
    const p = player(), monitor = new JumpingMotionDiagnostics()
    for (let i = 0; i < 500; i++) {
      p.contacts.push = i % 2 ? { collider: { id: 'box:1' } } : null
      observe(monitor, p, NEUTRAL_INPUT, dt)
    }
    const { reports, recent } = monitor.read()
    assert.equal(reports.length, 1, 'continuous chatter cannot flood the console')
    assert.deepEqual(reports[0].reasons, ['state:push'])
    assert.equal(reports[0].level, 'test-level')
    assert.ok(reports[0].samples.some(s => s.signals.push === 'box:1'))
    assert.ok(recent.length <= 240 && recent.at(-1).time - recent[0].time <= 2)
    reports[0].samples[0].x = -999
    recent[0].points[0][0] = -999
    assert.notEqual(monitor.read().reports[0].samples[0].x, -999)
    assert.notEqual(monitor.read().recent[0].points[0][0], -999)
    for (let i = 0; i < 120; i++) { p.contacts.push = null; observe(monitor, p, NEUTRAL_INPUT, dt) }
    for (let i = 0; i < 20; i++) { p.contacts.push = i % 2 ? { collider: { id: 'bot:2' } } : null; observe(monitor, p, NEUTRAL_INPUT, dt) }
    assert.equal(monitor.read().reports.length, 2, 'a new episode after recovery is recorded')
  }
})

test('pose snaps and root oscillation are distinguished even with no state change', () => {
  for (const kind of ['pose', 'root']) {
    const p = player(), monitor = new JumpingMotionDiagnostics()
    for (let i = 0; i < 30; i++) {
      if (kind === 'pose') p.reach = i % 2
      else p.x = 200 + i % 2
      const before = structuredClone(p)
      observe(monitor, p)
      assert.deepEqual(p, before, 'diagnostics never mutate the player')
    }
    const { reports } = monitor.read()
    assert.equal(reports.length, 1)
    assert.ok(reports[0].reasons.some(r => r.startsWith(`${kind}:`)))
    assert.ok(reports[0].reasons.every(r => r.startsWith(`${kind}:`)))
  }
})

test('input reversals, sequential surfaces, resets and teleports do not count as chatter', () => {
  const p = player(), monitor = new JumpingMotionDiagnostics()
  for (let i = 0; i < 60; i++) {
    p.x = 200 + i % 2; p.reach = i % 2; p.grounded = !!(i % 2)
    observe(monitor, p, { ...NEUTRAL_INPUT, move: i % 2 ? 1 : -1 })
  }
  monitor.reset()
  for (let i = 0; i < 60; i++) {
    p.contacts.push = { collider: { id: `surface:${i}` } }
    observe(monitor, p)
  }
  for (let i = 0; i < 30; i++) {
    p.x = i % 2 ? 200 : 1200; p.reach = i % 2
    observe(monitor, p)
  }
  p.contacts = null
  observe(monitor, p)
  assert.equal(monitor.read().recent.length, 0, 'respawn clears the prior trajectory')
  assert.deepEqual(monitor.read().reports, [])
})

test('ordinary walking, running, crouching, jumping and landing remain quiet', () => {
  const monitor = new JumpingMotionDiagnostics(), p = createPlayer({ x: 200, y: 620 })
  const floor = [{ x: -10000, y: 620, w: 20000, h: 40 }]
  for (const input of [{}, { move: .35 }, { move: 1 }, {}, { move: -1, crouch: true }, {},
    { move: 1, jump: true }, { move: 1 }, {}]) {
    const controls = { ...NEUTRAL_INPUT, ...input }
    for (let i = 0; i < 150; i++) {
      stepPlayer(p, controls, STEP, floor)
      observe(monitor, p, controls)
    }
  }
  assert.deepEqual(monitor.read().reports.map(r => r.reasons), [])
})

test('steady pushes on boxes and balls do not produce false reports', () => {
  for (const kind of ['box', 'ball']) {
    const level = blankTrial(); level.props = [{ kind, x: 900, y: 920, size: 80 }]; level.spawn.x = 834.5
    const run = createRun(level), monitor = new JumpingMotionDiagnostics()
    const input = { ...NEUTRAL_INPUT, move: 1 }
    for (let i = 0; i < 480; i++) { stepRun(run, input); observe(monitor, run.player, input) }
    assert.deepEqual(monitor.read().reports.map(r => r.reasons), [], kind)
  }
})

test('report storage is bounded across separate runs', () => {
  const monitor = new JumpingMotionDiagnostics()
  for (let run = 0; run < 12; run++) {
    const p = player()
    for (let i = 0; i < 10; i++) { p.x += i % 2 ? 1 : -1; observe(monitor, p) }
  }
  assert.equal(monitor.read().reports.length, 8)
})
