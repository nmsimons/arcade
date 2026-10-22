import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial, parseLevel } from '../src/games/jumping/level.ts'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { botLastSighting } from '../src/games/jumping/repulsorBot.ts'
import { botsAreEnemies, ramRival, shovebotTarget } from '../src/games/jumping/botCombat.ts'
import { applyContactEmp, CONTACT_EMP_SECONDS } from '../src/games/jumping/contactEmp.ts'
import { robotHulls, robotPlatforms } from '../src/games/jumping/robotPhysics.ts'
import { polygonIntersects } from '../src/games/jumping/geometry.ts'

const tick = (run, frames = 1) => { for (let i = 0; i < frames; i++) stepRun(run, NEUTRAL_INPUT) }
function pair(change = () => {}) {
  const file = blankTrial()
  file.robots = [{ x: 450, y: 920, left: 300, right: 1000 }, { kind: 'repulsor', x: 600, y: 920, left: 26, right: 1774 }]
  change(file)
  const run = createRun(parseLevel(file))
  run.robots[0].facing = 1
  return run
}

test('shovebots and Rbots are opposing kinds; equal kinds are not rivals', () => {
  const [shove, bot] = pair().robots
  assert.ok(botsAreEnemies(shove, bot)); assert.ok(botsAreEnemies(bot, shove))
  assert.equal(botsAreEnemies(shove, shove), false)
  assert.equal(botsAreEnemies(bot, bot), false)
})

test('a shovebot acquires Rbot, charges into its real body, and interrupts its shot', () => {
  const run = pair(), [shove, bot] = run.robots
  tick(run)
  assert.equal(shovebotTarget(shove), bot.actor)
  assert.equal(shove.seesPlayer, false, 'the player behind the shovebot is not its target')
  assert.equal(bot.phase, 'windup', 'Rbot sees the rival before seeing the hidden player')
  assert.equal(botLastSighting(bot), undefined)
  for (let i = 0; i < 120 && !shove.rams; i++) tick(run)
  assert.equal(shove.rams, 1)
  assert.equal(bot.shots ?? 0, 0, 'the charge arrives during the palm windup')
  assert.equal(bot.phase, 'recover')
  assert.ok(bot.actor.stagger > 0)
  const x = bot.x
  tick(run, 15)
  assert.ok(bot.x > x + 10, 'knockback advances through the normal humanoid motor')
  tick(run, 600)
  assert.ok((bot.shots ?? 0) + (bot.actor.shoves ?? 0) > 0, 'Rbot retaliates')
})

test('an unalerted Rbot shoots a nearby shovebot without acquiring a player through cover', () => {
  const run = pair(file => {
    file.robots[0] = { x: 500, y: 920, left: 480, right: 540 }
    file.robots[1].x = 700
    file.platforms = [{ x: 340, y: 0, w: 30, h: 920 }]
  }), [shove, bot] = run.robots
  shove.phase = 'recover'; shove.time = -10
  tick(run, 180)
  assert.ok(bot.shots > 0)
  assert.ok(shove.x < 480 && shove.deactivated, 'the hostile palm shot clears the rival from its lane')
  assert.equal(botLastSighting(bot), undefined)
})

test('cover prevents acquiring or attacking a rival through a wall', () => {
  const run = pair(file => { file.platforms = [{ x: 520, y: 0, w: 30, h: 920 }] }), [shove, bot] = run.robots
  tick(run, 90)
  assert.notEqual(shovebotTarget(shove), bot.actor, 'the wall hides the rival; the player can still be seen on this side')
  assert.equal(shove.rams ?? 0, 0)
  assert.equal(bot.shots ?? 0, 0)
})

test('shovebots choose a nearer visible rival and still target the player in an ordinary encounter', () => {
  const rival = pair(file => { file.robots[0].x = 500; file.robots[1].x = 350 }), [shove, bot] = rival.robots
  shove.facing = -1; tick(rival)
  assert.equal(shovebotTarget(shove), bot.actor)
  const player = pair(file => { file.entrance.x = 300; file.robots[0].x = 500; file.robots[1].x = 800 })
  player.robots[0].facing = -1; tick(player)
  assert.equal(shovebotTarget(player.robots[0]), player.player)
})

test('a disabled Rbot is not actively selected as a shovebot charge target', () => {
  const run = pair(), [shove, bot] = run.robots
  run.gadgets.disabled.set(bot, 5)
  tick(run, 30)
  assert.equal(shovebotTarget(shove), undefined)
  assert.equal(shove.rams ?? 0, 0)
})

test('blue shovebot contact disables Rbot, cancels its shot and preserves a longer handheld EMP', () => {
  const run = pair(file => { file.robots[0].mode = 'emp'; file.robots[1].x = 487 }), [shove, bot] = run.robots
  bot.phase = 'windup'; bot.time = .7
  applyContactEmp(run)
  assert.equal(run.gadgets.disabled.get(bot), CONTACT_EMP_SECONDS)
  assert.equal(bot.phase, 'recover'); assert.equal(bot.actor.armAim.aiming, false)
  assert.equal(run.gadgets.disabled.has(run.player), false)
  run.gadgets.disabled.set(bot, 4)
  applyContactEmp(run)
  assert.equal(run.gadgets.disabled.get(bot), 4, 'a contact shock cannot shorten a longer outage')
  shove.x = 800
  tick(run, 4 / STEP + 1)
  assert.equal(run.gadgets.disabled.has(bot), false)
})

test('an EMP-disabled blue shovebot cannot shock another robot', () => {
  const run = pair(file => { file.robots[0].mode = 'emp'; file.robots[1].x = 487 }), [shove, bot] = run.robots
  run.gadgets.disabled.set(shove, 5)
  applyContactEmp(run)
  assert.equal(run.gadgets.disabled.has(bot), false)
})

for (const mode of ['objects', 'player']) test(`a charge knocks Rbot back through normal ${mode === 'objects' ? 'red' : 'blue'} field contacts`, () => {
  const run = pair(file => {
    file.robots[0].x = 600; file.robots[1].x = 637
    file.forceFields = [{ id: 'barrier', orientation: 'vertical', mode, x: 670, y: 500, w: 12, h: 420 }]
  }), [shove, bot] = run.robots, x = bot.x
  shove.phase = 'charge'
  ramRival(run, shove)
  assert.equal(bot.x, x, 'the impact adds velocity, never positional teleportation')
  run.gadgets.disabled.set(bot, 2)
  tick(run, 150)
  if (mode === 'objects') {
    assert.ok(bot.x <= 658.1)
    for (const hull of robotHulls(bot)) assert.equal(polygonIntersects(hull, run.forceFields[0].platform, .1), false)
  } else assert.ok(bot.x > 682, 'blue fields do not contain Rbot')
})

test('Rbot resolves a shovebot crowding a ladder exit and gets onto the deck without overlap', () => {
  const run = pair(file => {
    file.entrance = { x: 700, y: 600 }
    file.platforms = [{ x: 200, y: 600, w: 600, h: 30 }, { x: 500, y: 200, w: 30, h: 400 }]
    file.climbables.ladders = [{ x: 300, top: 400, bottom: 920, platform: -1, side: 1 }]
    file.robots = [{ x: 338, y: 600, left: 300, right: 440 }, { kind: 'repulsor', x: 300, y: 920, left: 26, right: 1774 }]
  }), [shove, bot] = run.robots
  shove.facing = -1
  let climbed = false, exited = false
  for (let frame = 0; frame < 1500 && !exited; frame++) {
    tick(run); climbed ||= !!bot.actor.climbing
    exited = bot.actor.grounded && bot.y < 610
    for (const hull of robotHulls(bot)) for (const shape of robotPlatforms(shove))
      assert.equal(polygonIntersects(hull, shape, .2), false, `bodies overlap at frame ${frame}`)
  }
  assert.ok(climbed); assert.ok(exited, `stalled at ${bot.x}, ${bot.y}`)
  assert.ok((bot.shots ?? 0) + (bot.actor.shoves ?? 0) + (shove.rams ?? 0) > 0)
})
