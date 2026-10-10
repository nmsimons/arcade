import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial } from '../src/games/jumping/level.ts'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { createPlayer, stepPlayer, NEUTRAL_INPUT, STEP, TUNING, respawn } from '../src/games/jumping/model.ts'
import { athletePose } from '../src/games/jumping/athlete.ts'
import { playerWaterCenterOffset } from '../src/games/jumping/gravity.ts'
import { gameCamera } from '../src/games/jumping/camera.ts'

const water = { id: 'water', x: 0, y: 400, w: 1800, h: 520, gravity: -1, effect: 'water', power: 'always' }
function fixture(props = []) {
  const run = createRun({ ...blankTrial(), spawn: { x: 850, y: 700 }, props,
    goal: { id: 'closed', x: 1600, y: 920, power: 'switched' }, gravityPlates: [water] })
  run.started = true; run.player.grounded = false; run.player.coyote = 0
  return run
}
const advance = (run, seconds, dt, input = NEUTRAL_INPUT) => {
  for (let i = 0; i < Math.round(seconds / dt); i++) stepRun(run, input, dt)
}

for (const dt of [STEP, 1 / 30]) test(`water gives the player, box and ball a bounded physical resting bob at ${dt}`, () => {
  const run = fixture([{ kind: 'box', x: 500, y: 440, size: 80 }, { kind: 'ball', x: 1100, y: 440, size: 80 }])
  advance(run, 10, dt)
  const actors = [run.player, ...run.props], samples = actors.map(() => []), previous = actors.map(a => a.y)
  for (let i = 0; i < Math.round(TUNING.waterBobPeriod * 2 / dt); i++) {
    stepRun(run, NEUTRAL_INPUT, dt)
    actors.forEach((a, index) => {
      samples[index].push(a.y)
      assert.ok(Math.abs(a.y - previous[index]) < dt * 4 + .001, 'bob advances continuously through the real body position')
      assert.ok(Math.abs(a.vy) < 4, 'resting motion is slow')
      previous[index] = a.y
    })
    assert.equal(run.player.waterMotion.amount, 0)
    assert.equal(run.player.grounded, false)
    assert.ok(Math.abs(run.player.y + athletePose(run.player).shoulder[1] - 2 - water.y) < 3)
    assert.ok(Math.abs(run.props[0].angle) < .001, 'ambient motion adds no invented torque')
  }
  samples.forEach((ys, index) => {
    const mean = ys.reduce((a, b) => a + b) / ys.length, range = Math.max(...ys) - Math.min(...ys)
    assert.ok(Math.abs(mean - (index ? 440 : 450.34)) < .1, 'the average floating depth stays correct')
    assert.ok(range > 3.2 && range < 4.6, `a subtle visible bob without drift: ${range}`)
  })
})

for (const dt of [STEP, 1 / 30]) for (const action of ['left', 'right', 'dive', 'jump']) {
  test(`resting player bob hands off to ${action} without a position reset at ${dt}`, () => {
    const run = fixture(); advance(run, 10, dt)
    const p = run.player, before = { center: p.y + playerWaterCenterOffset(p), amount: p.waterBob.amount, x: p.x }
    const input = { ...NEUTRAL_INPUT, move: action === 'left' ? -1 : action === 'right' ? 1 : 0,
      descend: action === 'dive', jump: action === 'jump' }
    stepPlayer(p, input, dt, [], undefined, undefined, undefined, run.gravityField)
    assert.ok(Math.abs(p.y + playerWaterCenterOffset(p) - before.center - p.vy * dt) < .001, 'the displacement center follows integrated velocity through the transition')
    assert.ok(p.waterBob.amount < before.amount && p.waterBob.amount > before.amount * .8, 'ambient force fades without an instant reset')
    if (action === 'jump') assert.ok(p.vy < -300, 'jump retains its deliberate launch')
    for (let i = 0; i < Math.round(1 / dt); i++) stepPlayer(p, { ...input, jump: false }, dt, [], undefined, undefined, undefined, run.gravityField)
    assert.ok((p.waterBob?.amount ?? 0) < .02)
    if (action === 'left' || action === 'right') assert.ok(Math.abs(p.x - before.x) > 60, 'active swimming takes over')
    if (action === 'dive') assert.ok(p.y > 520, 'Down still dives freely')
  })
}

for (const dt of [STEP, 1 / 30]) for (const kind of ['box', 'ball']) {
  test(`resting ${kind} bob yields to an impulse and returns smoothly at ${dt}`, () => {
    const run = fixture([{ kind, x: 500, y: 440, size: 80 }]); advance(run, 10, dt)
    const b = run.props[0], before = { y: b.y, x: b.x, amount: b.waterBob.amount }
    b.vx = 110; b.vy = -60
    stepRun(run, NEUTRAL_INPUT, dt)
    assert.ok(b.vx > 90 && b.vy < -35, 'ambient motion does not overwrite an interacting velocity')
    assert.ok(Math.hypot(b.x - before.x, b.y - before.y) < dt * 140)
    assert.ok(b.waterBob.amount < before.amount && b.waterBob.amount > before.amount * .8)
    advance(run, .7, dt)
    assert.ok((b.waterBob?.amount ?? 0) < .05, 'ambient force fades while the impulse is still moving faster than rest')
    advance(run, 7, dt)
    assert.ok(b.waterBob.amount > .95, 'the gentle resting motion eases back after the impulse settles')
    assert.ok(Math.abs(b.y - 440) < 2.4)
  })
  test(`pushing a bobbing ${kind} takes over through normal contacts at ${dt}`, () => {
    const run = fixture([{ kind, x: 500, y: 440, size: 80 }]); advance(run, 10, dt)
    const b = run.props[0], oldX = b.x
    run.player = createPlayer({ x: b.x - 52, y: 450.34 }); run.player.grounded = false; run.player.coyote = 0
    advance(run, 2, dt, { ...NEUTRAL_INPUT, move: 1 })
    assert.ok(b.x > oldX + 15, 'the same shared contacts move the float')
    assert.ok((b.waterBob?.amount ?? 0) < .01, 'a sustained push fades ambient force')
    assert.ok(run.player.pushing?.amount > .9)
    assert.equal(run.player.hang, null)
  })
}

for (const dt of [STEP, 1 / 30]) test(`a resting bobbing box carries a rider and planted feet continuously at ${dt}`, () => {
  const run = fixture([{ kind: 'box', x: 600, y: 460, size: 120 }])
  run.player = createPlayer({ x: 600, y: 330 }); run.player.grounded = false; run.player.coyote = 0
  advance(run, 10, dt)
  const p = run.player, b = run.props[0], ys = []
  for (let i = 0; i < Math.round(TUNING.waterBobPeriod * 2 / dt); i++) {
    stepRun(run, NEUTRAL_INPUT, dt); ys.push(p.y)
    assert.equal(p.contacts.support?.collider.prop, b)
    assert.equal(p.footwork.feet.every(f => f.planted), true)
    assert.ok(Math.abs(p.y - b.y + b.size) < .001, 'the visible rider follows the real top surface')
    assert.ok(p.contacts.motion.speed < .05, 'carrying does not trigger steps')
    assert.ok(Math.abs(b.angle) < .001)
  }
  assert.ok(Math.max(...ys) - Math.min(...ys) > 3.2, 'a resting rider bobs with the float')
  stepRun(run, { ...NEUTRAL_INPUT, jump: true }, dt)
  assert.equal(p.grounded, false)
})

for (const dt of [STEP, 1 / 30]) for (const rider of [false, true]) {
  test(`resting ${rider ? 'rider' : 'swimmer'} bob stays visible through camera following at ${dt}`, () => {
    const run = fixture(rider ? [{ kind: 'box', x: 600, y: 460, size: 120 }] : [])
    if (rider) { run.player.x = 600; run.player.y = 330 }
    advance(run, 10, dt)
    const level = { ...run.level, floor: 2000, height: 2000 }
    for (const challenge of [false, true]) {
      const cameras = [], screens = []
      for (let i = 0; i < Math.round(TUNING.waterBobPeriod * 2 / dt); i++) {
        stepRun(run, NEUTRAL_INPUT, dt)
        const c = gameCamera(1280, 800, run.player, level, challenge)
        cameras.push(c.y); screens.push((run.player.y - c.y) * c.zoom)
      }
      assert.ok(Math.max(...cameras) - Math.min(...cameras) < .1, 'resting framing does not cancel physical bob')
      assert.ok(Math.max(...screens) - Math.min(...screens) > 2.2, 'bob is visible at ordinary game scale')
    }
    let before = gameCamera(1280, 800, run.player, level, true)
    for (let i = 0; i < Math.round(.5 / dt); i++) {
      const oldY = run.player.y
      stepRun(run, { ...NEUTRAL_INPUT, jump: rider, descend: !rider }, dt)
      const c = gameCamera(1280, 800, run.player, level, true)
      assert.ok(Math.abs(c.y - before.y) < Math.abs(run.player.y - oldY) + dt * 400, 'interaction resumes camera following without a framing reset')
      before = c
    }
    assert.equal(run.player.waterCamera, undefined, 'ordinary following resumes after interaction')
    if (!rider) for (let i = 0; i < Math.round(2 / dt); i++) stepRun(run, { ...NEUTRAL_INPUT, climb: true }, dt)
    advance(run, 8, dt)
    assert.ok(run.player.waterCamera?.amount > .9, 'resting framing returns after movement settles')
  })
}

test('EMP leaves water bobbing intact; leaving water, deep water, gravity plates and respawn do not retain ambient lift', () => {
  const run = fixture([{ kind: 'box', x: 500, y: 440, size: 80 }]); advance(run, 10, STEP)
  assert.ok(run.player.waterBob.amount > .9 && run.props[0].waterBob.amount > .9)
  const playerY = run.player.y, propY = run.props[0].y
  run.empRemaining = 1; advance(run, .2, STEP)
  assert.ok(run.player.waterBob.amount > .9 && run.props[0].waterBob.amount > .9)
  assert.ok(Math.abs(run.player.y - playerY) < 4 && Math.abs(run.props[0].y - propY) < 4, 'EMP leaves floating intact')
  const dry = createRun({ ...blankTrial(), props: [{ kind: 'box', x: 600, y: 440, size: 80 }], gravityPlates: [{ ...water, effect: undefined }] })
  dry.started = true; advance(dry, 10, STEP)
  assert.equal(dry.props[0].waterBob, undefined, 'gravity plates retain their stable rest')
  const deep = fixture(); deep.player.y = 850; stepRun(deep, NEUTRAL_INPUT)
  assert.equal(deep.player.waterBob, undefined, 'deep ascent does not get an ambient surface force')
  const exiting = fixture(); advance(exiting, 10, STEP); exiting.player.x = 1900
  stepPlayer(exiting.player, NEUTRAL_INPUT, STEP, [], undefined, undefined, undefined, exiting.gravityField)
  assert.equal(exiting.player.gravity, TUNING.gravity)
  respawn(exiting.player)
  assert.equal(exiting.player.waterBob, undefined)
})
