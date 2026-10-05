import { createPlayer, stepPlayer, PLATFORMS } from './helpers/jumping-fixtures.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { STEP, NEUTRAL_INPUT, TUNING, cancelJumpInput, playerState, respawn } from '../src/games/jumping/model.ts'
import { createJumpController, keyboardMovement } from '../src/games/jumping/input.ts'

const floor = [{ x: 0, y: 620, w: 2600, h: 400 }]
function advance(p, seconds, input = {}, world = floor) {
  for (let t = 0; t < seconds - STEP / 2; t += STEP) stepPlayer(p, { ...NEUTRAL_INPUT, ...input }, STEP, world)
}
test('jump launches on press and a brief hold builds height without repeating on landing', () => {
  const heights = [0, .08, .2, 1.5].map(hold => {
    const p = createPlayer()
    advance(p, STEP, { jump: true })
    assert.equal(p.grounded, false); assert.equal(p.vy, -TUNING.jumpSpeed + TUNING.gravity * STEP)
    advance(p, hold, { jump: true }); advance(p, 1.5)
    return p.bestHeight
  })
  const ballisticHeight = TUNING.jumpSpeed ** 2 / (2 * TUNING.gravity)
  assert.ok(heights[0] > ballisticHeight - TUNING.jumpSpeed * STEP && heights[0] < ballisticHeight)
  assert.ok(heights[0] < heights[1] && heights[1] < heights[2])
  assert.equal(heights[2], heights[3])
  const p = createPlayer(); advance(p, 2, { jump: true })
  assert.equal(p.y, 620); assert.equal(p.grounded, true)
  advance(p, STEP, { jump: true }); assert.equal(p.grounded, true)
  advance(p, STEP); advance(p, STEP, { jump: true }); assert.ok(p.vy < 0)
})
test('directional input controls takeoff momentum without changing the initial jump impulse', () => {
  for (const move of [0, .25, .5, 1]) {
    const p = createPlayer(); advance(p, .3, { move })
    assert.equal(p.vx, move * TUNING.runSpeed)
    advance(p, STEP, { move, jump: true })
    assert.equal(p.vx, move * TUNING.runSpeed)
    assert.equal(p.vy, -TUNING.jumpSpeed + TUNING.gravity * STEP)
  }
  const p = createPlayer(); advance(p, STEP, { move: 1, jump: true })
  assert.equal(p.vy, -TUNING.jumpSpeed + TUNING.gravity * STEP)
  assert.ok(p.vx < 20)
  assert.equal(keyboardMovement(new Set(['KeyD', 'ShiftLeft'])) * TUNING.runSpeed, TUNING.walkSpeed)
  assert.equal(keyboardMovement(new Set(['KeyA', 'KeyD'])), 0)
})
test('explicit gesture strengths give preset heights while Up alone leaves takeoff at base strength', () => {
  for (const strength of [0, .25, .5, 1]) {
    const p = createPlayer()
    advance(p, STEP, { jump: true, jumpStrength: strength })
    assert.equal(p.vx, 0)
    assert.equal(p.vy, -(TUNING.jumpSpeed + (TUNING.directedJumpSpeed - TUNING.jumpSpeed) * strength) + TUNING.gravity * STEP)
  }
  const p = createPlayer(); advance(p, STEP, { jump: true, climb: true })
  assert.equal(p.vx, 0); assert.equal(p.vy, -TUNING.jumpSpeed + TUNING.gravity * STEP)
})
test('a buffered gesture remembers its preset strength after release', () => {
  for (const strength of [0, .5, 1]) {
    const p = createPlayer(); Object.assign(p, { y: 619, vy: 200, grounded: false, coyote: 0 })
    advance(p, STEP, { jump: true, jumpStrength: strength })
    assert.equal(p.grounded, true)
    advance(p, STEP)
    assert.equal(p.vy, -(TUNING.jumpSpeed + (TUNING.directedJumpSpeed - TUNING.jumpSpeed) * strength) + TUNING.gravity * STEP)
    assert.equal(p.buffer, 0)
  }
})
test('running jumps bridge a 380-unit gap in either direction while a standing takeoff falls short', () => {
  for (const direction of [-1, 1]) for (const running of [false, true]) {
    const terrain = [{ x: 0, y: 620, w: 540, h: 400 }, { x: 920, y: 620, w: 540, h: 400 }]
    const p = createPlayer(); Object.assign(p, { x: direction > 0 ? 430 : 1030, spawnX: direction > 0 ? 430 : 1030, facing: direction })
    if (running) {
      for (let frame = 0; frame < 120 && (direction > 0 ? p.x < 535 : p.x > 925); frame++) advance(p, STEP, { move: direction }, terrain)
    } else p.x = direction > 0 ? 535 : 925
    advance(p, STEP, { move: direction, jump: true }, terrain)
    const speed = p.vx
    assert.ok(running ? Math.abs(speed) === TUNING.runSpeed : Math.abs(speed) < 20)
    advance(p, .2, { move: direction, jump: true }, terrain)
    advance(p, 1, { move: direction }, terrain)
    if (running) { assert.equal(p.grounded, true); assert.equal(p.y, 620); assert.ok(direction > 0 ? p.x > 920 : p.x < 540) }
    else assert.ok(direction > 0 ? p.x < 920 : p.x > 540)
  }
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
  const p = createPlayer(); advance(p, STEP, { jump: true }); advance(p, .35)
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
test('Down ducks under a low ceiling and waits for clearance before standing', () => {
  const p = createPlayer(), world = [...floor, { x: 260, y: 540, w: 120, h: 35 }]
  advance(p, .4, { move: 1 }, world); assert.equal(p.x, 248)
  advance(p, .6, { move: 1, descend: true }, world)
  assert.ok(p.x > 300); assert.equal(p.y, 620); assert.equal(p.crouch, 1)
  advance(p, .2, { reach: true }, world)
  assert.equal(p.crouching, true); assert.equal(p.reach, 0)
  advance(p, 1, { move: 1 }, world); advance(p, .2, {}, world)
  assert.ok(p.x > 392); assert.equal(p.crouching, false); assert.equal(p.crouch, 0); assert.equal(p.y, 620)
})
test('Down replaces looking down with a slow grounded crouch; Up still looks up', () => {
  const p = createPlayer()
  advance(p, .3, { descend: true })
  assert.equal(p.crouching, true); assert.equal(p.crouch, 1); assert.equal(p.look, 0)
  advance(p, .4, { move: 1, descend: true })
  assert.equal(p.vx, TUNING.walkSpeed)
  advance(p, .4, { move: 1 })
  assert.equal(p.crouching, false); assert.equal(p.vx, TUNING.runSpeed)
  advance(p, .8, { climb: true }); assert.equal(p.look, 1)
  advance(p, .8, { descend: true }); assert.equal(p.look, 0)
})
test('held reach raises and lowers the arms without changing running or takeoff', () => {
  const p = createPlayer(); advance(p, .3, { move: 1 })
  advance(p, .4, { move: 1, reach: true, jump: true })
  assert.equal(p.reach, 1); assert.equal(p.vx, TUNING.runSpeed); assert.equal(p.grounded, false)
  advance(p, .2, { move: 1, climb: true, jump: true })
  assert.equal(p.reach, 0); assert.equal(p.vx, TUNING.runSpeed); assert.equal(p.grounded, false)
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
  advance(p, STEP, { jump: true }, edge); advance(p, STEP, {}, edge); assert.ok(p.vy < -TUNING.jumpSpeed * .9)
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
  const q = createPlayer(); Object.assign(q, { y: 610, vy: 200, grounded: false, coyote: 0 }); advance(q, STEP, { jump: true }); cancelJumpInput(q); advance(q, .2)
  assert.equal(q.y, 620); assert.equal(q.buffer, 0)
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
test('pull-ups use crouch clearance and still refuse openings below crouch height', () => {
  for (const gap of [39, 40, 50]) {
    const { p, world } = hanging(1, [{ x: 500, y: 360 - gap, w: 160, h: 40 }])
    advance(p, 1.5, { climb: true }, world)
    if (gap < 40) { assert.ok(p.hang); assert.equal(p.mantle, null) }
    else { assert.ok(p.grounded && p.crouching); assert.equal(p.hang, null); assert.equal(p.y, 400) }
  }
})
test('falling and manual reset restore the last safe reset point', () => {
  const p = createPlayer(); p.x = 1500; advance(p, STEP, {}, PLATFORMS)
  assert.equal(p.checkpoint, 1); p.x = 1790; p.y = 1019; p.vy = 800; p.grounded = false
  stepPlayer(p, NEUTRAL_INPUT); assert.equal(p.x, 1500); assert.equal(p.y, 620)
  p.x = 1000; respawn(p); assert.equal(p.x, 1500)
})
const makePad = () => ({ index: 0, id: 'Test pad', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) })
test('Down requests crouch or descent while B only detaches', () => {
  const reader = createJumpController(), pad = makePad(); reader.sample([pad], 'playing', 0)
  pad.buttons[13] = { pressed: true, value: 1 }
  const down = reader.sample([pad], 'playing', 16)
  assert.equal(down.drop, true); assert.equal(down.descend, true); assert.equal(down.detach, false)
  assert.equal(down.crouch, true); assert.equal(down.reach, false)
  pad.buttons[13] = { pressed: false, value: 0 }; pad.axes[1] = 1
  assert.equal(reader.sample([pad], 'playing', 24).crouch, true)
  pad.buttons[13] = { pressed: false, value: 0 }; pad.axes[1] = -1
  const up = reader.sample([pad], 'playing', 32)
  assert.equal(up.climb, true); assert.equal(up.crouch, false); assert.equal(up.reach, false)
  pad.axes[1] = 0; pad.buttons[1] = { pressed: true, value: 1 }
  const b = reader.sample([pad], 'playing', 48)
  assert.equal(b.drop, true); assert.equal(b.detach, true); assert.equal(b.descend, false); assert.equal(b.crouch, false)
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
