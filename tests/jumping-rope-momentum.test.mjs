import test from 'node:test'
import assert from 'node:assert/strict'
import { createPlayer, NEUTRAL_INPUT, STEP, stepPlayer, TUNING } from '../src/games/jumping/model.ts'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { ropeGripDistance, ropePoint } from '../src/games/jumping/climbables.ts'
import { CAMPAIGN } from './helpers/jumping-fixtures.mjs'

const input = extras => ({ ...NEUTRAL_INPUT, ...extras })
const world = { ladders: [], ropes: [{ x: 500, y: 100, length: 600, segments: 75 }] }
const tick = (p, extras = {}) => stepPlayer(p, input(extras), STEP, [], world, { checkpoints: [], fallY: Infinity })
const tapSpeed = TUNING.directedJumpSpeed

test('settling onto a stationary rope cannot supply jump or drop momentum', () => {
  for (const side of [-1, 1]) for (const gap of [0, 20]) for (const frames of [0, 1, 6, 9, 12, 15, 19, 20, 21]) for (const drop of [false, true]) {
    const p = createPlayer({ x: 500 - side * (10 + gap), y: 420 })
    Object.assign(p, { grounded: false, facing: side })
    tick(p)
    assert.equal(p.climbing?.kind, 'rope')
    for (let i = 0; i < frames; i++) tick(p)
    const { x, y } = p, c = p.climbing
    const grip = ropeGripDistance(c)
    tick(p, { move: side, detach: drop, jump: !drop })
    assert.equal(p.climbing, null)
    assert.equal(p.x, x); assert.equal(p.y, y, 'releasing must not snap to the final catch pose')
    const expected = drop ? 0 : side * 180
    assert.ok(Math.abs(p.vx - expected) < .01, `catch repositioning added horizontal speed: side ${side}, gap ${gap}, frame ${frames}, drop ${drop}, vx ${p.vx}`)
    if (!drop && frames <= 20) {
      // The loaded rope can bob vertically as it settles; that is real motion.
      const swingUp = Math.max(0, (ropePoint(c.rope, grip, true)[1] - ropePoint(c.rope, grip)[1]) / STEP)
      assert.ok(p.vy >= -tapSpeed - swingUp - 1, `catch repositioning added upward speed at frame ${frames}: ${p.vy}`)
    }
    tick(p, { detach: drop })
    assert.equal(p.climbing, null, 'release must still prevent an immediate recatch')
  }
})

test('a running catch keeps real forward momentum without the early-release speed spike', () => {
  const caught = createRun(CAMPAIGN[1])
  for (let i = 0; i < 400 && caught.player.x < 535; i++) stepRun(caught, input({ move: 1 }))
  stepRun(caught, input({ move: 1, jump: true }))
  for (let i = 0; i < 450 && !caught.player.climbing; i++) stepRun(caught, input({ move: 1 }))
  assert.equal(caught.player.climbing?.kind, 'rope')
  for (const frames of [0, 1, 3, 6, 9, 12, 15, 19, 20, 21, 24]) {
    const run = structuredClone(caught), p = run.player
    for (let i = 0; i < frames; i++) stepRun(run, input({ move: 1 }))
    stepRun(run, input({ move: 1, jump: true }))
    assert.equal(p.climbing, null)
    assert.ok(p.vx > 180, 'the catch must retain actual forward swing momentum')
    assert.ok(p.vx <= TUNING.runSpeed + 180, `quick release amplified the approach speed at frame ${frames}: ${p.vx}`)
  }
})

test('an immediate rope jump uses the caught rope motion instead of the incoming airborne velocity', () => {
  for (const side of [-1, 1]) for (const vy of [-TUNING.directedJumpSpeed, 440]) {
    const p = createPlayer({ x: 500 - side * 30, y: 420 })
    Object.assign(p, { grounded: false, facing: side, vx: side * TUNING.runSpeed, vy })
    tick(p)
    assert.equal(p.climbing?.kind, 'rope')
    const caughtGrip = ropeGripDistance(p.climbing)
    tick(p, { move: side, jump: true })
    assert.equal(p.climbing, null)
    assert.ok(p.vx * side > 180, 'arrival momentum must still set the rope moving')
    assert.ok(p.vx * side < TUNING.runSpeed + 180, 'the catch must absorb some of the arrival speed before release')
    const rope = p.ropes[0], grip = caughtGrip
    // Only the rope's own upward velocity may add to the new impulse.
    const rise = Math.max(0, (ropePoint(rope, grip, true)[1] - ropePoint(rope, grip)[1]) / STEP)
    assert.ok(p.vy >= -TUNING.directedJumpSpeed - rise - 1, 'the incoming airborne launch must not stack onto the new jump')
  }
})

test('settled rope jumps add push-off while letting go retains momentum without a downward kick', () => {
  const p = createPlayer({ x: 480, y: 420 })
  Object.assign(p, { grounded: false, vx: 350 })
  tick(p)
  for (let i = 0; i < 40; i++) tick(p, { move: 1 })
  assert.equal(p.climbing?.kind, 'rope')
  assert.ok(Math.abs(p.vx) > 30)
  for (const move of [-1, 0, 1]) for (const drop of [false, true]) {
    const released = structuredClone(p)
    const { vx, vy } = released
    tick(released, { move, detach: drop, jump: !drop })
    assert.equal(released.vx, drop ? vx : Math.max(-600, Math.min(600, vx + move * 180)))
    assert.equal(released.vy, drop ? vy : Math.min(0, vy) - (move ? TUNING.directedJumpSpeed : TUNING.jumpSpeed))
  }
})

test('rope and ladder jumps launch on press before Up can climb or pull up', () => {
  for (const kind of ['rope', 'ladder']) {
    const climbables = kind === 'rope' ? world : { ropes: [], ladders: [{ x: 500, top: 100, bottom: 700, platform: -1, side: 1 }] }
    const p = createPlayer({ x: 490, y: 420 }); p.grounded = false; p.coyote = 0
    const step = extras => stepPlayer(p, input(extras), STEP, [], climbables)
    step({ climb: true })
    for (let i = 0; i < 40; i++) step({})
    assert.equal(p.climbing?.kind, kind)
    const { x, y, vy } = p
    step({ jump: true, climb: true })
    assert.equal(p.climbing, null); assert.equal(p.mantle, null); assert.equal(p.hang, null)
    assert.equal(p.x, x); assert.equal(p.y, y)
    assert.ok(Math.abs(p.vy - Math.min(0, vy) + TUNING.directedJumpSpeed) < 1e-6)
  }
})

test('catching a rope consumes a held jump and its release instead of launching again', () => {
  const p = createPlayer({ x: 480, y: 420 }); p.grounded = false
  tick(p, { jump: true })
  for (let i = 0; i < 80; i++) tick(p, { jump: true })
  assert.ok(p.climbing)
  tick(p)
  assert.ok(p.climbing, 'the old jump release cannot bounce off a new grip')
})
