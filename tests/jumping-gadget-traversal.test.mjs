import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial } from '../src/games/jumping/level.ts'
import { NEUTRAL_INPUT, TUNING, STEP } from '../src/games/jumping/model.ts'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { athletePose, presentedAthletePose } from '../src/games/jumping/athlete.ts'
import { rightArmSupporting } from '../src/games/jumping/armSupport.ts'
import { prepareGadgets } from '../src/games/jumping/gadgets.ts'
import { polygonIntersects, polygonPoints } from '../src/games/jumping/geometry.ts'
import { boxShape } from '../src/games/jumping/propGeometry.ts'

const tick = (run, frames = 1, input = {}) => { for (let i = 0; i < frames; i++) stepRun(run, { ...NEUTRAL_INPUT, ...input }) }
function scene(kind = 'repulsor') {
  const level = blankTrial()
  level.props = [{ kind: 'box', gadget: kind, x: 190, y: 920, size: 40 }]
  return level
}
function equipped(level) {
  const run = createRun(level); tick(run, 1, { interact: true }); tick(run)
  assert.ok(run.gadgets.held)
  return run
}
function sameArm(p) {
  const key = p.facing < 0 ? 'backArm' : 'frontArm'
  assert.deepEqual(athletePose(p)[key], athletePose({ ...p, heldTool: undefined })[key], 'a working right arm keeps its ordinary pose')
}

for (const kind of ['repulsor', 'emp']) for (const climb of ['ladder', 'rope']) test(`${kind} follows every ${climb} hand stroke smoothly when ascending and descending`, () => {
  const level = scene(kind)
  if (climb === 'ladder') level.climbables.ladders = [{ x: 160, top: 300, bottom: 920, platform: -1, side: 1 }]
  else level.climbables.ropes = [{ x: 160, y: 300, length: 600, segments: 75 }]
  const run = equipped(level)
  let previous, maximum = 0, climbing = 0, free = 0, planted = 0
  for (let frame = 0; frame < 500; frame++) {
    tick(run, 1, frame < 280 ? { climb: true } : { descend: true })
    const p = run.player
    if (!p.climbing || p.climbing.time < .2) { previous = null; continue }
    climbing++
    if (rightArmSupporting(p)) planted++; else free++
    const key = p.facing < 0 ? 'backArm' : 'frontArm'
    const arm = presentedAthletePose(p)[key], ordinary = athletePose({ ...p, heldTool: undefined })[key]
    assert.deepEqual(arm, ordinary, 'Up/Down retains the normal hand-over-hand choreography, even between grips')
    const wrist = [p.x + arm.end[0] * p.facing, p.y + arm.end[1]]
    if (previous) maximum = Math.max(maximum, Math.hypot(wrist[0] - previous[0], wrist[1] - previous[1]))
    previous = wrist
  }
  assert.ok(climbing > 300 && planted > 30 && free > 30)
  assert.ok(maximum < 4, `ordinary climbing has no gadget pose jumps (${maximum})`)
})

for (const kind of ['repulsor', 'emp']) test(`${kind} catches freeze the incoming sleeve pose for the transfer`, () => {
  const level = scene(kind)
  level.climbables.ladders = [{ x: 160, top: 300, bottom: 920, platform: -1, side: 1 }]
  const run = equipped(level)
  tick(run, 1, { climb: true })
  const caught = run.player.climbing.caught
  assert.ok(caught.heldTool?.presentation)
  assert.notEqual(caught.heldTool, run.player.heldTool)
  const snapshot = structuredClone(caught.heldTool)
  tick(run, 50, { climb: true })
  assert.deepEqual(caught.heldTool, snapshot, 'later input cannot rewrite the pose the catch started from')
})

for (const kind of ['repulsor', 'emp']) test(`${kind} allows ladder climbing and descending with the sleeve on its working arm`, () => {
  const level = scene(kind)
  level.climbables.ladders = [{ x: 160, top: 500, bottom: 920, platform: -1, side: 1 }]
  const run = equipped(level)
  let planted = 0
  for (let frame = 0; frame < 60; frame++) {
    tick(run, 1, { climb: true })
    if (run.player.climbing?.time > .2 && rightArmSupporting(run.player)) { planted++; sameArm(run.player) }
  }
  assert.equal(run.player.climbing?.kind, 'ladder')
  assert.ok(run.player.y < 900)
  assert.ok(planted > 0)
  const y = run.player.y
  tick(run, 30, { descend: true })
  assert.ok(run.player.y > y + 20)
  tick(run, 600, { climb: true })
  assert.ok(run.player.y < 600)
  assert.equal(run.gadgets.held.gadget, kind)
})

test('equipped pushing uses the normal motor and palm pose', () => {
  const level = scene(); level.props.push({ kind: 'box', x: 300, y: 920, size: 80 })
  const run = equipped(level)
  let pushed = false
  for (let i = 0; i < 240; i++) {
    tick(run, 1, { move: 1 })
    if (run.player.contacts.push?.hands && run.player.pushing?.amount > .9) { pushed = true; sameArm(run.player) }
  }
  assert.ok(pushed)
  assert.ok(run.props[0].x > 350)
  assert.ok(run.gadgets.held)
})

test('a gadget permits a real ledge catch and pull-up, suspending use while the right palm is loaded', () => {
  const level = scene(); level.platforms = [{ x: 350, y: 750, w: 250, h: 20 }]
  const run = equipped(level), p = run.player
  Object.assign(p, { x: 338, y: 820, grounded: false, coyote: 0, vy: 100, footwork: null })
  tick(run, 1, { move: 1 })
  assert.ok(p.hang)
  assert.ok(rightArmSupporting(p))
  tick(run, 30)
  sameArm(p)
  tick(run, 1, { use: true, aimX: 1, aimY: -1 })
  assert.equal(run.gadgets.shots, 0)
  assert.equal(run.gadgets.aiming, false)
  assert.ok(p.hang)
  tick(run, 180, { climb: true, use: true })
  assert.equal(p.hang, null); assert.equal(p.mantle, null)
  assert.ok(p.grounded && Math.abs(p.y - 750) < .1)
  assert.equal(run.gadgets.shots, 0, 'a held Fire is not queued when the hand becomes free')
  tick(run); tick(run, 1, { use: true })
  assert.equal(run.gadgets.shots, 1)
})

test('equipping a gadget preserves wall braces and wall jumps', () => {
  const level = scene(); level.platforms = [{ x: 350, y: 100, w: 100, h: 820 }]
  const run = equipped(level), p = run.player
  Object.assign(p, { x: 338, y: 650, grounded: false, coyote: 0, vy: 100, footwork: null })
  tick(run, 3, { move: 1 })
  assert.ok(p.wallBrace?.active)
  assert.ok(rightArmSupporting(p)); sameArm(p)
  tick(run, 1, { jump: true, move: 1 })
  assert.equal(p.wallJump?.direction, -1)
  assert.equal(p.vx, -TUNING.wallJumpPush)
  assert.ok(p.vy < -300)
  assert.ok(run.gadgets.held)
})

test('a rope can catch automatically with equipment, then release into an ordinary jump', () => {
  const level = scene(); level.climbables.ropes = [{ x: 400, y: 300, length: 580, segments: 73 }]
  const run = equipped(level), p = run.player
  Object.assign(p, { x: 394, y: 700, grounded: false, coyote: 0, vy: 100, footwork: null })
  tick(run, 30)
  assert.equal(p.climbing?.kind, 'rope')
  sameArm(p)
  tick(run, 1, { jump: true, move: 1 })
  assert.equal(p.climbing, null)
  assert.ok(p.vy < -300)
  assert.ok(run.gadgets.held)
})

test('only the supporting right arm prevents use; a loaded left arm does not', () => {
  for (const facing of [-1, 1]) for (const right of [false, true]) {
    const run = equipped(scene()), p = run.player
    const hand = facing < 0 ? 1 : 0, hands = [0, 0]; hands[right ? hand : 1 - hand] = 1
    Object.assign(p, { facing, wallBrace: { active: true, wallX: p.x + facing * 12, direction: facing, hands, feet: [0, 0] } })
    assert.equal(rightArmSupporting(p), right)
    prepareGadgets(run, { ...NEUTRAL_INPUT, use: true, aimX: facing, aimY: -.3 }, STEP)
    assert.equal(run.gadgets.shots, right ? 0 : 1)
    assert.equal(run.gadgets.aiming, !right)
  }
})

test('aim and fire are available during an actual free right-hand climbing phase', () => {
  const level = scene(); level.climbables.ladders = [{ x: 160, top: 300, bottom: 920, platform: -1, side: 1 }]
  const run = equipped(level)
  tick(run, 24, { climb: true })
  for (let frame = 0; frame < 80 && rightArmSupporting(run.player); frame++) tick(run, 1, { climb: true })
  assert.equal(run.player.climbing?.kind, 'ladder')
  assert.equal(rightArmSupporting(run.player), false)
  prepareGadgets(run, { ...NEUTRAL_INPUT, use: true, aimX: 1, aimY: -.8 }, STEP)
  assert.equal(run.gadgets.aiming, true)
  assert.equal(run.gadgets.shots, 1)
})

test('an EMP shot denied by a supporting arm never queues use or consumes the weapon', () => {
  const level = scene('emp'); level.platforms = [{ x: 350, y: 750, w: 250, h: 20 }]
  const run = equipped(level), p = run.player, prop = run.gadgets.held
  Object.assign(p, { x: 338, y: 820, grounded: false, coyote: 0, vy: 100, footwork: null })
  tick(run, 1, { move: 1 }); assert.ok(p.hang)
  tick(run, 180, { use: true, climb: true })
  assert.equal(run.gadgets.held, prop)
  assert.equal(run.empRemaining, 0)
  assert.equal(p.hang, null)
  tick(run); tick(run, 1, { use: true })
  assert.equal(run.gadgets.held, prop)
  assert.equal(run.gadgets.shots, 1)
  assert.equal(run.empRemaining, 0)
})

test('a red field strips the sleeve off during a climb without interrupting the grip', () => {
  const level = scene()
  level.climbables.ladders = [{ x: 160, top: 300, bottom: 920, platform: -1, side: 1 }]
  level.forceFields = [{ id: 'red', mode: 'objects', orientation: 'horizontal', x: 80, y: 650, w: 200, h: 12 }]
  const run = equipped(level), prop = run.gadgets.held
  for (let frame = 0; frame < 420 && run.gadgets.held; frame++) tick(run, 1, { climb: true })
  assert.equal(run.gadgets.held, null)
  assert.equal(run.player.climbing?.kind, 'ladder')
  assert.equal(run.props[0], prop)
  assert.ok(!polygonIntersects(polygonPoints(boxShape(prop)), run.forceFields[0].platform, .01))
  assert.ok(boxShape(prop).y > 662 - .05)
  const distance = run.player.climbing.distance
  tick(run, 180, { climb: true })
  assert.ok(!polygonIntersects(polygonPoints(boxShape(prop)), run.forceFields[0].platform, .01))
  assert.ok(run.player.climbing.distance < distance - 100)
  assert.ok(run.player.y < 650, 'the player climbs through the beam')
})
