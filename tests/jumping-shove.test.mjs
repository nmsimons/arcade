import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial } from '../src/games/jumping/level.ts'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { bodyIntersects, pointInside } from '../src/games/jumping/geometry.ts'
import { translatePlayer } from '../src/games/jumping/playerContacts.ts'
import { advanceShove, beginShove, BOT_SHOVE_WINDUP, PLAYER_SHOVE_WINDUP, SHOVE_PROP_STRENGTH } from '../src/games/jumping/shove.ts'
import { repulseProp } from '../src/games/jumping/propPhysics.ts'
import { ballShape, boxShape } from '../src/games/jumping/propGeometry.ts'
import { presentedAthletePose } from '../src/games/jumping/athlete.ts'

const tick = (run, frames = 1, input = {}) => { for (let i = 0; i < frames; i++) stepRun(run, { ...NEUTRAL_INPUT, ...input }) }
function scene(direction = 1, change = () => {}) {
  const file = blankTrial(); file.goal.x = 1700; file.entrance.x = 450 - direction * 32
  file.robots = [{ kind: 'repulsor', x: 450, y: 920, left: 26, right: 1774 }]
  change(file)
  const run = createRun(file); run.player.facing = direction; run.robots[0].facing = -direction
  return run
}

for (const direction of [-1, 1]) test(`the player's unarmed shove creates room ${direction < 0 ? 'left' : 'right'} without launching Rbot`, () => {
  const run = scene(direction), bot = run.robots[0], start = bot.x
  tick(run, 1, { use: true })
  assert.ok(run.player.shove); assert.ok(bot.actor.shove, 'Rbot begins a shove with the same windup')
  assert.equal(BOT_SHOVE_WINDUP, PLAYER_SHOVE_WINDUP)
  assert.equal(run.player.shoves, 0, 'the palms gather before the impact')
  for (let frame = 0; frame < 30 && !run.player.shoves; frame++) {
    const x = bot.x; tick(run, 1, { use: true })
    assert.ok(Math.abs(bot.x - x) < 12, 'knockback is swept movement, never a teleport')
  }
  assert.equal(run.player.shoves, 1)
  assert.equal(bot.actor.shoves, 0, 'the first hit interrupts the counter-shove')
  assert.ok(bot.actor.vx * direction > 250 && bot.actor.vx * direction < 400)
  assert.ok(bot.actor.grounded, 'the weaker player shove keeps the bot on its feet')
  tick(run, 40)
  assert.ok((bot.x - start) * direction > 12)
  assert.equal(bot.shots ?? 0, 0, 'a shove does not create a ranged repulsor shot')
})

for (const direction of [-1, 1]) test(`Rbot winds up and shoves a nearby player ${direction < 0 ? 'left' : 'right'}`, () => {
  const run = scene(-direction), bot = run.robots[0], start = run.player.x
  tick(run)
  assert.ok(bot.actor.shove)
  tick(run, 15)
  assert.equal(bot.actor.shoves, 0, 'the visible tell gives the player time to respond')
  for (let frame = 0; frame < 30 && !bot.actor.shoves; frame++) tick(run)
  assert.equal(bot.actor.shoves, 1)
  assert.ok(run.player.vx * direction > 800)
  tick(run, 40)
  assert.ok((run.player.x - start) * direction > 120)
  assert.equal(bot.shots ?? 0, 0)
})

test('backing away during Rbot’s windup makes its shove miss', () => {
  const run = scene(), bot = run.robots[0]
  tick(run); assert.ok(bot.actor.shove)
  tick(run, 50, { move: -1 })
  assert.equal(bot.actor.shoves, 0)
  assert.ok(run.player.x < 350)
})

test('a held fire button cannot repeat shoves; releasing and pressing again rearms it', () => {
  const run = scene(), bot = run.robots[0]
  run.gadgets.disabled.set(bot, 10)
  tick(run, 140, { use: true }); assert.equal(run.player.shoves, 1)
  translatePlayer(run.player, 418 - run.player.x, 920 - run.player.y)
  Object.assign(run.player, { vx: 0, vy: 0, facing: 1, grounded: true })
  translatePlayer(bot.actor, 450 - bot.actor.x, 920 - bot.actor.y)
  Object.assign(bot.actor, { vx: 0, vy: 0, grounded: true })
  Object.assign(bot, { x: 450, y: 920, phase: 'recover', time: -10 })
  tick(run, 30, { use: true }); assert.equal(run.player.shoves, 1)
  tick(run); tick(run, 25, { use: true })
  assert.equal(run.player.shoves, 2)
})

for (const cover of ['wall', 'red field']) test(`close-range shoves cannot reach through a ${cover}`, () => {
  const run = scene(1, file => {
    const barrier = { x: 433, y: 800, w: 2, h: 120 }
    if (cover === 'wall') file.platforms = [barrier]
    else file.forceFields = [{ ...barrier, id: 'red', mode: 'objects', orientation: 'vertical' }]
  })
  run.gadgets.disabled.set(run.robots[0], 10)
  tick(run, 80, { use: true })
  assert.equal(run.player.shoves, 1, 'the hands hit the intervening surface')
  assert.equal(run.robots[0].actor.shoves, 0)
  assert.equal(run.robots[0].x, 450, 'the bot behind the cover receives no impulse')
})

test('a person above or behind the player is not a valid forward shove target', () => {
  for (const above of [false, true]) {
    const run = scene()
    if (above) {
      translatePlayer(run.player, 450 - run.player.x, -62)
      run.player.grounded = true
    } else run.player.facing = -1
    tick(run, 1, { use: true })
    assert.ok(run.player.shove, 'an empty-handed stroke is allowed even without a forward target')
    tick(run, 18)
    assert.equal(run.player.shoves, 0)
  }
})

test('a player whose hand supports a climb cannot shove', () => {
  const run = scene()
  run.player.wallBrace = { wallX: 430, direction: 1, active: true, hands: [1, 1], feet: [1, 1], amount: 1 }
  run.player.grounded = false
  tick(run, 1, { use: true })
  assert.equal(run.player.shove, undefined)
})

test('a shove can tip Rbot off a nearby platform edge through its normal fall physics', () => {
  const run = scene(1, file => {
    file.entrance.y = 650; file.robots[0].y = 650
    file.platforms = [{ x: 300, y: 650, w: 164, h: 20 }]
  }), bot = run.robots[0]
  tick(run, 1, { use: true })
  let airborne = false, landed = false
  for (let frame = 0; frame < 240; frame++) {
    tick(run); airborne ||= bot.x > 500 && bot.y > 670 && !bot.actor.grounded
    landed ||= airborne && Math.abs(bot.y - 920) < .1 && bot.actor.grounded
  }
  assert.equal(run.player.shoves, 1); assert.ok(airborne)
  assert.ok(landed, 'the bot completes the fall before resuming its hunt')
})

for (const barrier of ['wall', 'red field', 'blue field']) test(`shove knockback respects the target's ${barrier} contacts`, () => {
  const run = scene(1, file => {
    const shape = { x: 550, y: 0, w: 12, h: 920 }
    if (barrier === 'wall') file.platforms = [shape]
    else file.forceFields = [{ ...shape, id: 'barrier', orientation: 'vertical', mode: barrier === 'red field' ? 'objects' : 'player' }]
  }), bot = run.robots[0]
  tick(run, 1, { use: true }); tick(run, 90)
  assert.equal(run.player.shoves, 1)
  if (barrier === 'blue field') assert.ok(bot.x > 460)
  else {
    assert.ok(bot.x <= 538.1, `the bot stopped at ${bot.x}`)
    assert.equal(bodyIntersects(bot.actor.x, bot.actor.y, { x: 550, y: 0, w: 12, h: 920 }), false)
  }
})

for (const outage of ['EMP hit', 'global EMP']) test(`a ${outage} stops retaliation but still lets a shoved Rbot settle physically`, () => {
  const run = scene(), bot = run.robots[0]
  if (outage === 'EMP hit') run.gadgets.disabled.set(bot, 10)
  else run.empRemaining = 10
  tick(run, 1, { use: true }); tick(run, 180)
  assert.equal(run.player.shoves, 1); assert.equal(bot.actor.shoves, 0)
  assert.equal(bot.shots ?? 0, 0)
  assert.ok(bot.x > 465); assert.ok(bot.actor.grounded)
  assert.ok(Math.abs(bot.y - 920) < .1)
  const x = bot.x; tick(run, 60); assert.equal(bot.x, x)
})

for (const kind of ['emp', 'repulsor']) test(`carrying a ${kind} keeps F as tool fire, including at close range`, () => {
  const file = blankTrial(); file.goal.x = 1700
  file.props = [{ kind: 'box', gadget: kind, x: 190, y: 920, size: 40 }]
  file.robots = [{ kind: 'repulsor', x: 700, y: 920, left: 26, right: 1774 }]
  const run = createRun(file), bot = run.robots[0]
  tick(run, 1, { interact: true }); tick(run)
  assert.ok(run.gadgets.held)
  run.gadgets.disabled.set(bot, 10)
  translatePlayer(run.player, 668 - run.player.x, 0)
  run.player.facing = 1
  tick(run, 1, { use: true })
  assert.equal(run.player.shove, undefined); assert.equal(run.player.shoves, 0)
  assert.ok(run.gadgets.held)
  const shots = run.gadgets.shots
  tick(run, 150); translatePlayer(run.player, 500 - run.player.x, 0)
  tick(run, 1, { use: true }); tick(run, 40, { use: true })
  assert.equal(run.gadgets.shots, shots + 1, 'a fresh press fires normally; holding does not repeat')
})

test('empty hands can shove empty space in a level with no bots or gadgets', () => {
  const run = createRun(blankTrial())
  tick(run, 1, { use: true }); assert.ok(run.player.shove)
  tick(run, 50, { use: true })
  assert.equal(run.player.shove, undefined); assert.equal(run.player.shoves, 0)
  tick(run); tick(run, 1, { use: true }); assert.ok(run.player.shove)
})

for (const kind of ['box', 'ball']) test(`a ${kind} receives a reduced, mass-dependent impulse from a shove`, () => {
  const strengths = []
  for (const size of [68, 160]) for (const weight of ['normal', 'heavy']) {
    const file = blankTrial(); file.goal.x = 1700; file.entrance.x = 500 - size / 2 - 24
    file.props = [{ kind, x: 500, y: 920, size, weight }]
    const run = createRun(file), expected = createRun(file), prop = run.props[0]
    const shape = kind === 'ball' ? ballShape(prop) : boxShape(prop)
    const colliders = [...run.terrain.map((platform, i) => ({ id: `terrain:${i}`, platform })), { id: 'prop:0', platform: shape, prop }]
    beginShove(run.player, PLAYER_SHOVE_WINDUP)
    advanceShove(run, run.player, [], PLAYER_SHOVE_WINDUP, { colliders, platforms: colliders.map(c => c.platform) })
    repulseProp(expected, expected.props[0], [SHOVE_PROP_STRENGTH, 0])
    assert.equal(run.player.shoves, 1, `${kind}, ${size}, ${weight}: the palms reach the surface`)
    assert.equal(prop.vx, expected.props[0].vx); assert.equal(prop.vy, expected.props[0].vy)
    strengths.push(prop.vx)
  }
  assert.ok(strengths[0] > strengths[1]); assert.ok(strengths[0] > strengths[2]); assert.ok(strengths[2] > strengths[3])
})

test('a player already pushing a crate can release that press into a shove', () => {
  const file = blankTrial(); file.goal.x = 1700
  file.props = [{ kind: 'box', x: 250, y: 920, size: 100, weight: 'heavy' }]
  const run = createRun(file)
  tick(run, 60, { move: .3 })
  assert.ok(run.player.pushing?.amount > 0, 'the ordinary pushing motor is loaded')
  tick(run, 1, { use: true }); assert.ok(run.player.shove)
  tick(run, 25); assert.equal(run.player.shoves, 1)
})

test('a pinned Rbot retains its strong counter-shove against repeated player attempts', () => {
  const run = scene(1, file => { file.platforms = [{ x: 462, y: 700, w: 40, h: 220 }] }), bot = run.robots[0]
  for (let frame = 0; frame < 140; frame++) {
    tick(run, 1, { use: frame % 4 === 0 })
    assert.equal(bot.actor.climbing, null)
    assert.equal(bot.actor.hang, null); assert.equal(bot.actor.mantle, null)
    assert.ok(bot.x <= 450.1)
  }
  assert.equal(run.player.shoves, 1, 'Rbot interrupts the next stroke instead of being locked down')
  assert.ok(bot.actor.shoves >= 1, 'Rbot gets a real counterattack while pinned')
  assert.ok(run.player.x < 320, 'the counter-shove creates space')
})

for (const direction of [-1, 1]) test(`a wall-pinned Rbot keeps the shove's hands outside its body (${direction})`, () => {
  const wallX = direction > 0 ? 462 : 426
  const run = scene(direction, file => { file.platforms = [{ x: wallX, y: 780, w: 12, h: 140 }] }), bot = run.robots[0]
  run.gadgets.disabled.set(bot, 10)
  let greatestLean = 0
  tick(run, 1, { use: true })
  for (let frame = 0; frame < 38; frame++) {
    tick(run)
    const p = run.player, pose = presentedAthletePose(p), rest = presentedAthletePose({ ...p, shove: undefined })
    greatestLean = Math.max(greatestLean, pose.shoulder[0] - rest.shoulder[0])
    for (const arm of [pose.frontArm, pose.backArm]) {
      assert.ok(Math.abs(Math.hypot(arm.joint[0] - arm.root[0], arm.joint[1] - arm.root[1], arm.jointDepth ?? 0) - 10) < 1e-6)
      assert.ok(Math.abs(Math.hypot(arm.end[0] - arm.joint[0], arm.end[1] - arm.joint[1], (arm.endDepth ?? 0) - (arm.jointDepth ?? 0)) - 9) < 1e-6)
      for (const point of [arm.end, arm.hand ?? arm.end]) assert.equal(p.terrain.some(solid => pointInside(solid, p.x + point[0] * p.facing, p.y + point[1])), false, 'wrists and palms stay outside solids')
    }
    for (const name of ['frontLeg', 'backLeg']) {
      assert.ok(Math.hypot(pose[name].end[0] - rest[name].end[0], pose[name].end[1] - rest[name].end[1]) < 1e-6, 'planted ankles stay fixed')
    }
  }
  assert.ok(greatestLean > 3, 'the stroke drives the body, not only the wrists')
  assert.ok((bot.x - 450) * direction < 1, 'the wall actually pins the target')
})

test('a wall-pinned, disabled Rbot settles out of the incoming running pose after a shove', () => {
  const run = scene(1, file => { file.platforms = [{ x: 462, y: 700, w: 40, h: 220 }] }), bot = run.robots[0]
  run.gadgets.disabled.set(bot, 10)
  tick(run, 1, { use: true, move: 1 })
  tick(run, 30, { move: 1 })
  assert.equal(run.player.shoves, 1)
  assert.equal(bot.x, 450)
  assert.ok(bot.actor.grounded)
  assert.equal(bot.actor.gait.moving, 0, 'the stopped body does not retain a running lean and raised leg')
  tick(run, 90, { move: 1 })
  assert.equal(bot.actor.gait.moving, 0)
})
