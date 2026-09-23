import test from 'node:test'
import assert from 'node:assert/strict'
import { createPlayer, stepPlayer, STEP, NEUTRAL_INPUT, PLATFORMS, TUNING, cancelJumpInput, playerState, respawn } from '../src/games/jumping/model.ts'
import { createJumpController, keyboardMovement } from '../src/games/jumping/input.ts'

const floor = [{ x: 0, y: 620, w: 2600, h: 400 }]
function advance(p, seconds, input = {}, world = floor) {
  for (let t = 0; t < seconds - STEP / 2; t += STEP) stepPlayer(p, { ...NEUTRAL_INPUT, ...input }, STEP, world)
}
function jumpHeight(charge) {
  const p = createPlayer(); advance(p, charge, { jump: true }); advance(p, 1.5)
  return p.bestHeight
}
test('tap, partial and fully charged jumps produce graduated heights without auto-jumping', () => {
  const short = jumpHeight(STEP), medium = jumpHeight(TUNING.chargeTime / 2), full = jumpHeight(TUNING.chargeTime + STEP)
  assert.ok(short > 60 && short < 75); assert.ok(medium > short + 45); assert.ok(full > medium + 65)
  const p = createPlayer(); advance(p, 2, { jump: true })
  assert.equal(p.y, 620); assert.equal(p.charge, 1); assert.equal(p.grounded, true)
  advance(p, 2); assert.equal(p.y, 620); assert.equal(p.grounded, true)
})
test('analog speed and stride are preserved while charging, and braking still stops the player', () => {
  for (const move of [.25, .5, 1]) {
    const p = createPlayer(); advance(p, .3, { move })
    assert.equal(p.vx, move * TUNING.runSpeed)
    const uncharged = { ...p }
    advance(p, .4, { move, jump: true }); advance(uncharged, .4, { move })
    assert.equal(p.x, uncharged.x); assert.equal(p.vx, uncharged.vx); assert.equal(p.stride, uncharged.stride)
    advance(p, .2, { jump: true }); assert.equal(p.vx, 0)
  }
  assert.equal(keyboardMovement(new Set(['KeyD', 'ShiftLeft'])) * TUNING.runSpeed, TUNING.walkSpeed)
  assert.equal(keyboardMovement(new Set(['KeyA', 'KeyD'])), 0)
})
test('charging on the run carries full speed into a jump across the playground gap', () => {
  // Isolate the jump trajectory from the ropes that now catch airborne players over this gap.
  const terrain = [...PLATFORMS]
  const p = createPlayer(); p.x = 1500
  advance(p, .2, { move: 1 }, terrain)
  advance(p, TUNING.chargeTime + STEP, { move: 1, jump: true }, terrain)
  assert.equal(p.charge, 1); assert.equal(p.vx, TUNING.runSpeed); assert.equal(p.grounded, true)
  advance(p, 1.1, { move: 1 }, terrain)
  assert.ok(p.x > 1920); assert.equal(p.y, 620); assert.equal(p.grounded, true)
})

test('releasing movement stops travel promptly while the pose settles smoothly to idle', () => {
  const p = createPlayer(); advance(p, .6, { move: 1 })
  const running = { ...p.gait }
  advance(p, STEP)
  assert.ok(p.gait.moving >= running.moving - .02)
  assert.ok(p.gait.run >= running.run - .02)
  advance(p, .15)
  assert.equal(p.vx, 0)
  assert.ok(p.gait.moving > .2, 'the pose still has a settling transition after braking finishes')
  const stoppedX = p.x, stoppingPose = { ...p.gait }
  advance(p, .1)
  assert.equal(p.x, stoppedX)
  assert.ok(p.gait.moving > 0 && p.gait.moving < stoppingPose.moving)
  assert.ok(p.gait.run < stoppingPose.run)
  advance(p, .6)
  assert.deepEqual(p.gait, { speed: 0, moving: 0, run: 0, air: 0 })
  advance(p, .12, { move: -1 })
  assert.ok(p.vx < 0 && p.gait.moving > 0)
  respawn(p); assert.equal(p.gait, null)
})

test('landing keeps the falling pose briefly and blends it out after ground contact', () => {
  const p = createPlayer(); advance(p, .4, { jump: true }); advance(p, .5)
  assert.equal(p.grounded, false); assert.ok(p.gait.air > .95)
  for (let i = 0; i < 160 && !p.grounded; i++) advance(p, STEP)
  assert.equal(p.grounded, true); assert.equal(p.y, 620)
  const contact = p.gait.air
  assert.ok(contact > .8, 'the landing-ready pose must blend through ground contact')
  advance(p, .1)
  assert.ok(p.gait.air > .05 && p.gait.air < contact)
  assert.equal(p.y, 620)
  advance(p, .5); assert.equal(p.gait.air, 0)
})
test('landing strength uses contact speed and never locks movement or another jump', () => {
  const impacts = [200, 900].map(vy => {
    const p = createPlayer(); Object.assign(p, { y: 619, vy, grounded: false })
    advance(p, STEP)
    assert.equal(p.y, 620); assert.equal(p.vy, 0); assert.equal(p.landing, 1)
    return p
  })
  assert.ok(impacts[1].landingImpact > impacts[0].landingImpact + .8)
  const p = impacts[1], start = p.x
  advance(p, .06, { move: 1 })
  assert.ok(p.x > start && p.vx > 0 && p.landing > 0)
  advance(p, STEP, { jump: true, move: 1 }); advance(p, STEP, { move: 1 })
  assert.equal(p.grounded, false); assert.ok(p.vy < 0 && p.vx > 0)
})
test('squatting ducks under a low ceiling and waits for clearance before standing', () => {
  const p = createPlayer(), world = [...floor, { x: 260, y: 540, w: 120, h: 35 }]
  advance(p, .4, { move: 1 }, world); assert.equal(p.x, 248)
  advance(p, .6, { move: 1, crouch: true }, world)
  assert.ok(p.x > 300); assert.equal(p.y, 620); assert.equal(p.crouch, 1)
  advance(p, .2, { reach: true }, world)
  assert.equal(p.crouching, true); assert.equal(p.reach, 0)
  advance(p, 1, { move: 1 }, world); advance(p, .2, {}, world)
  assert.ok(p.x > 392); assert.equal(p.crouching, false); assert.equal(p.crouch, 0); assert.equal(p.y, 620)
})
test('held reach raises and lowers the arms without changing running or charging', () => {
  const p = createPlayer(); advance(p, .3, { move: 1 })
  advance(p, .4, { move: 1, reach: true, jump: true })
  assert.equal(p.reach, 1); assert.equal(p.vx, TUNING.runSpeed); assert.equal(p.charge, 1)
  advance(p, .2, { move: 1, climb: true, jump: true })
  assert.equal(p.reach, 0); assert.equal(p.vx, TUNING.runSpeed); assert.equal(p.charge, 1)
})
test('solid sides and ceilings block the player without penetration', () => {
  const p = createPlayer(), world = [...floor, { x: 350, y: 400, w: 100, h: 220 }]
  advance(p, 1, { move: 1 }, world); assert.equal(p.x, 324.5)
  const q = createPlayer(), ceiling = [...floor, { x: 50, y: 480, w: 400, h: 20 }]
  advance(q, .8, { jump: true }, ceiling); advance(q, .15, {}, ceiling)
  assert.ok(q.y >= 562); assert.ok(q.vy >= 0)
})
test('coyote time permits a late jump, but never an extra midair jump', () => {
  const p = createPlayer(); Object.assign(p, { x: 305, grounded: false, coyote: .08 })
  const edge = [{ x: 0, y: 620, w: 300, h: 400 }]
  advance(p, STEP, { jump: true }, edge); advance(p, STEP, {}, edge); assert.ok(p.vy < -400)
  advance(p, .2, {}, edge); const vy = p.vy
  advance(p, STEP, { jump: true }, edge); advance(p, STEP, {}, edge); assert.ok(p.vy > vy)
})
test('the body cannot remain supported beyond a platform edge', () => {
  for (const side of [-1, 1]) {
    const world = [{ x: 300, y: 620, w: 300, h: 400 }], p = createPlayer()
    Object.assign(p, { x: side === 1 ? 601 : 299, facing: side })
    advance(p, .1, {}, world)
    assert.equal(p.grounded, false); assert.equal(p.footwork, null)
    assert.ok(p.y > 625, 'the body falls instead of leaning past pinned feet')
  }
})
test('a missed corner blocks sideways penetration without providing a floating foothold', () => {
  for (const side of [-1, 1]) {
    const p = createPlayer(), world = [{ x: 500, y: 400, w: 160, h: 220 }]
    Object.assign(p, { x: side === 1 ? 489 : 671, y: 399, vx: side * 120, vy: 200, facing: side, grounded: false, coyote: 0 })
    advance(p, STEP, { move: side }, world)
    assert.equal(p.x, side === 1 ? 488 : 672)
    assert.equal(p.grounded, false); assert.ok(p.y > 400)
  }
})
test('a tap just before landing is buffered; canceling held input cannot launch a jump', () => {
  const p = createPlayer(); Object.assign(p, { y: 616, vy: 200, grounded: false, coyote: 0 })
  advance(p, STEP, { jump: true }); advance(p, .04)
  assert.ok(p.vy < 0)
  const q = createPlayer(); advance(q, .7, { jump: true }); cancelJumpInput(q); advance(q, .1)
  assert.equal(q.y, 620); assert.equal(q.charge, 0)
})
function hanging(side = 1, extras = []) {
  const p = createPlayer(), world = [...floor, { x: 500, y: 400, w: 160, h: 220 }, ...extras]
  Object.assign(p, { x: side === 1 ? 486 : 674, y: 400 + TUNING.hangReach, facing: side, grounded: false, coyote: 0, vy: 60 })
  advance(p, STEP, {}, world); assert.ok(p.hang)
  return { p, world }
}
test('both ledge edges can be caught and climbed onto solid ground', () => {
  for (const side of [1, -1]) {
    const { p, world } = hanging(side)
    assert.equal(playerState(p), 'Hanging'); advance(p, TUNING.climbTime + .2, { climb: true }, world)
    assert.equal(p.y, 400); assert.equal(p.grounded, true); assert.equal(p.hang, null)
    assert.ok(p.x > 500 && p.x < 660)
  }
})
test('drop releases the grip without instant regrab; away + jump pushes off', () => {
  const { p, world } = hanging(); advance(p, STEP, { drop: true }, world); advance(p, .1, {}, world)
  assert.equal(p.hang, null); assert.ok(p.y > 400 + TUNING.hangReach)
  const { p: q, world: w } = hanging(); advance(q, STEP, { jump: true, move: -1 }, w)
  assert.equal(q.hang, null); assert.ok(q.vx < 0); assert.ok(q.vy < 0)
})
test('climbing refuses a blocked standing space', () => {
  const { p, world } = hanging(1, [{ x: 500, y: 310, w: 160, h: 40 }])
  advance(p, .5, { climb: true }, world); assert.ok(p.hang); assert.equal(p.mantle, null)
})
test('falling and manual reset restore the last safe reset point', () => {
  const p = createPlayer(); p.x = 1500; advance(p, STEP, {}, PLATFORMS)
  assert.equal(p.checkpoint, 1); p.x = 1790; p.y = 1019; p.vy = 800; p.grounded = false
  stepPlayer(p, NEUTRAL_INPUT); assert.equal(p.x, 1500); assert.equal(p.y, 620)
  p.x = 1000; respawn(p); assert.equal(p.x, 1500)
})
const makePad = () => ({ index: 0, id: 'Test pad', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) })
test('controller directions only request ledge actions, without crouch or reach', () => {
  const reader = createJumpController(), pad = makePad(); reader.sample([pad], 'playing', 0)
  pad.buttons[13] = { pressed: true, value: 1 }
  const down = reader.sample([pad], 'playing', 16)
  assert.equal(down.drop, true); assert.equal(down.crouch, false); assert.equal(down.reach, false)
  pad.buttons[13] = { pressed: false, value: 0 }; pad.axes[1] = -1
  const up = reader.sample([pad], 'playing', 32)
  assert.equal(up.climb, true); assert.equal(up.crouch, false); assert.equal(up.reach, false)
  pad.axes[1] = 0; pad.buttons[1] = { pressed: true, value: 1 }
  const b = reader.sample([pad], 'playing', 48)
  assert.equal(b.drop, true); assert.equal(b.crouch, false)
})
test('controller gates held inputs across screens, preserves analog speed and handles disconnect', () => {
  const reader = createJumpController(), pad = makePad()
  reader.sample([pad], 'menu', 0); pad.buttons[0] = { pressed: true, value: 1 }
  assert.equal(reader.sample([pad], 'menu', 16).jump, true)
  assert.equal(reader.sample([pad], 'playing', 32).jump, false)
  pad.buttons[0] = { pressed: false, value: 0 }; reader.sample([pad], 'playing', 48)
  pad.axes[0] = .59; const input = reader.sample([pad], 'playing', 64)
  assert.ok(Math.abs(input.move - .5) < .001)
  pad.buttons[0] = { pressed: true, value: 1 }; assert.equal(reader.sample([pad], 'playing', 80).jump, true)
  assert.equal(reader.sample([], 'playing', 96).disconnected, true)
  pad.mapping = ''; assert.equal(reader.sample([pad], 'playing', 112).connected, false)
})
