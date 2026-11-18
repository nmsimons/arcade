import test from 'node:test'
import assert from 'node:assert/strict'
import { airBoostStrength, cancelJumpInput, createPlayer, NEUTRAL_INPUT, respawn, STEP, stepPlayer, TUNING } from '../src/games/jumping/model.ts'
import { drawFootBoosters, footBoosters } from '../src/games/jumping/airBoosters.ts'
import { JumpingAudioState } from '../src/games/jumping/audioState.ts'
import { loopTone } from '../src/games/jumping/sound.ts'
import { presentedAthletePose } from '../src/games/jumping/athletePose.ts'
import { wallFrameAngle } from '../src/games/jumping/wallFrame.ts'

const airborne = patch => Object.assign(createPlayer({ x: 300, y: 300 }), { grounded: false }, patch)
const step = (p, move = 0, gravity = TUNING.gravity) => stepPlayer(p, { ...NEUTRAL_INPUT, move }, STEP, [], undefined, undefined, undefined, undefined, gravity)

test('jets oppose applied steering and braking, and stop at the requested air speed', () => {
  for (const direction of [-1, 1]) {
    const p = airborne()
    step(p, direction)
    assert.equal(p.airBoost.x, direction)
    assert.equal(p.airBoost.lift, 0)
    for (const jet of footBoosters(p)) assert.equal(jet.direction[0] * p.facing, -direction)
    step(p)
    assert.equal(p.airBoost.x, -direction, 'neutral air braking also needs an explanation')
    assert.equal(footBoosters(p)[0].direction[0] * p.facing, direction)
    step(p)
    assert.equal(airBoostStrength(p), 0)
    p.vx = direction * TUNING.runSpeed
    step(p, direction)
    assert.deepEqual(footBoosters(p), [], 'constant momentum is not thrust')
  }
})

test('held-jump lift supplies downward exhaust and release cannot restart it', () => {
  const p = createPlayer({ x: 300, y: 600 }), floor = [{ x: 0, y: 600, w: 1200, h: 200 }]
  const held = { ...NEUTRAL_INPUT, jump: true }
  stepPlayer(p, held, STEP, floor)
  assert.equal(p.airBoost.lift, 0, 'takeoff comes from the supported jump impulse')
  stepPlayer(p, held, STEP, floor)
  assert.ok(p.airBoost.lift > 0)
  for (const jet of footBoosters(p)) assert.deepEqual(jet.direction, [-0, 1])
  stepPlayer(p, NEUTRAL_INPUT, STEP, floor)
  assert.equal(p.airBoost.lift, 0)
  stepPlayer(p, held, STEP, floor)
  assert.equal(p.airBoost.lift, 0)
})

test('gravity and weightless drag stay silent, while inverted steering mirrors the feet', () => {
  for (const gravity of [TUNING.gravity, -TUNING.gravity, 0]) {
    const p = airborne({ vx: gravity === 0 ? 150 : 0 })
    step(p, 0, gravity)
    assert.deepEqual(footBoosters(p), [])
  }
  const p = airborne({ inverted: true, facing: -1, airBoost: { x: -1, lift: .5, time: 1 } })
  const before = structuredClone(p), jets = footBoosters(p)
  assert.equal(jets.length, 2)
  assert.ok(jets.every(jet => jet.direction[0] * p.facing > 0 && jet.direction[1] > 0))
  assert.deepEqual(p, before, 'querying a mirrored pose leaves the simulation unchanged')
})

test('landing, grips, wall contact, sliding, pause and respawn suppress stale thrust', () => {
  for (const patch of [{ grounded: true }, { hang: {} }, { mantle: {} }, { climbing: {} }, { wallBrace: { active: true } }, { sliding: { active: true } }]) {
    const p = airborne({ airBoost: { x: 1, lift: 1, time: 1 }, ...patch })
    assert.equal(airBoostStrength(p), 0)
    assert.deepEqual(footBoosters(p), [])
  }
  const p = airborne({ airBoost: { x: 1, lift: 1, time: 1 } })
  cancelJumpInput(p); assert.equal(airBoostStrength(p), 0)
  p.airBoost.x = 1; respawn(p)
  assert.deepEqual(p.airBoost, { x: 0, lift: 0, time: 0 })
})

test('two small translucent plumes preserve canvas state and remain repeatable', () => {
  const p = airborne({ airBoost: { x: 1, lift: .5, time: 2 } }), stack = [], fills = []
  const ctx = { globalAlpha: .8, fillStyle: '#fff',
    save() { stack.push({ globalAlpha: this.globalAlpha, fillStyle: this.fillStyle }) },
    restore() { Object.assign(this, stack.pop()) }, translate() {}, scale() {}, rotate() {},
    beginPath() {}, moveTo() {}, quadraticCurveTo() {}, closePath() {},
    fill() { fills.push({ alpha: this.globalAlpha, color: this.fillStyle }) },
  }
  const before = structuredClone(p), jets = footBoosters(p)
  assert.deepEqual(jets, footBoosters(p))
  assert.ok(jets.every(jet => jet.length <= 7 && jet.alpha <= .6))
  drawFootBoosters(ctx, p)
  assert.equal(fills.length, 4)
  assert.ok(fills.every(fill => fill.alpha > 0 && fill.alpha <= .48))
  assert.equal(ctx.globalAlpha, .8); assert.equal(ctx.fillStyle, '#fff')
  assert.deepEqual(p, before)
})

test('floating, the plumes leave the soles of the drawn boots in every frame: floor, ceiling, wall and a larger body', () => {
  // A canvas that only tracks its transform, recording where each plume starts.
  const tracking = () => {
    let m = [1, 0, 0, 1, 0, 0]; const stack = [], starts = []
    const mul = ([a, b, c, d, e, f]) => { m = [m[0] * a + m[2] * b, m[1] * a + m[3] * b, m[0] * c + m[2] * d, m[1] * c + m[3] * d, m[0] * e + m[2] * f + m[4], m[1] * e + m[3] * f + m[5]] }
    const ctx = { globalAlpha: 1, fillStyle: '', save: () => stack.push([...m]), restore: () => { m = stack.pop() },
      translate: (x, y) => mul([1, 0, 0, 1, x, y]), scale: (x, y) => mul([x, 0, 0, y, 0, 0]),
      rotate: a => mul([Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0]),
      beginPath: () => starts.push([m[4], m[5]]), moveTo() {}, quadraticCurveTo() {}, closePath() {}, fill() {} }
    return { ctx, starts }
  }
  for (const frame of [{}, { inverted: true }, { wall: 'left' }, { wall: 'right' }, { size: 1.35 }]) {
    const p = airborne({ gravity: 0, ...frame, airBoost: { x: 1, lift: .4, time: 1 } })
    p.anim.float = { lean: .6, spin: 0, facing: p.facing * (p.inverted ? -1 : 1), phase: 0, blend: 1 }
    const pose = presentedAthletePose(p), angle = wallFrameAngle(p.wall), size = p.size ?? 1
    const world = ([x, y]) => { const lx = x * p.facing * size, ly = y * (p.inverted ? -1 : 1) * size
      return [p.x + lx * Math.cos(angle) - ly * Math.sin(angle), p.y + lx * Math.sin(angle) + ly * Math.cos(angle)] }
    const { ctx, starts } = tracking()
    drawFootBoosters(ctx, p)
    const feet = [pose.backLeg.end, pose.backLeg.end, pose.frontLeg.end, pose.frontLeg.end].map(world)
    assert.equal(starts.length, 4)
    starts.forEach((start, i) => assert.ok(Math.hypot(start[0] - feet[i][0], start[1] - feet[i][1]) < 5 * size,
      `${JSON.stringify(frame)}: plume ${i} starts ${Math.hypot(start[0] - feet[i][0], start[1] - feet[i][1]).toFixed(1)} from its boot`))
  }
})

test('one quiet unpitched hiss follows the same thrust and disappears when it stops', () => {
  const p = airborne(), audio = new JumpingAudioState()
  audio.reset(p, null)
  step(p, 1); audio.step(p, null, STEP)
  const frame = audio.drain()
  assert.equal(frame.loops.length, 1)
  assert.equal(frame.loops[0].kind, 'booster'); assert.equal(frame.loops[0].pan, 0)
  assert.deepEqual(frame.cues, [])
  const tone = loopTone(frame.loops[0])
  assert.equal(tone.body, 0, 'no pitched motor hum')
  assert.ok(tone.volume < loopTone({ kind: 'box', pace: 1 }).volume / 3)
  p.vx = TUNING.runSpeed; step(p, 1); audio.step(p, null, STEP)
  assert.deepEqual(audio.drain().loops, [])
  p.airBoost.x = 1; p.grounded = true; audio.step(p, null, STEP)
  assert.deepEqual(audio.drain().loops, [])
  audio.reset(p, null)
  const { loops, cues } = audio.drain()
  assert.deepEqual({ loops, cues }, { loops: [], cues: [] })
})
