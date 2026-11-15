import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseLevel } from '../src/games/jumping/level.ts'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { createPlayer, NEUTRAL_INPUT } from '../src/games/jumping/model.ts'
import { createRepulsorActor, botLastSighting } from '../src/games/jumping/repulsorBot.ts'

const fixture = name => parseLevel(JSON.parse(readFileSync(new URL(`./fixtures/jumping/${name}-rbot-routes.json`, import.meta.url), 'utf8').replace(/^\uFEFF/, '')))
const tick = run => stepRun(run, NEUTRAL_INPUT)
const rbot = run => run.robots.find(robot => robot.definition.kind === 'repulsor')

test('Uninvited Company investigates the known entrance before touring the upper platforms', () => {
  const run = createRun(fixture('uninvited')), bot = rbot(run)
  let reachedUpperShelf = false, shoved = false
  for (let frame = 0; frame < 720 && !bot.shots && !shoved; frame++) {
    tick(run); reachedUpperShelf ||= bot.y <= 205; shoved ||= !!bot.actor.shove
  }
  assert.equal(reachedUpperShelf, false, 'entrance knowledge replaces the long opening tour')
  assert.ok(botLastSighting(bot), 'the waiting player is eventually seen through actual line of sight')
  // Landing beside the player, it shoves them rather than backing off to shoot.
  assert.ok(bot.shots || shoved, `stopped at ${bot.x}, ${bot.y}`)
  assert.ok(bot.x < 400, 'the hunter descends toward the entrance')
  assert.ok(bot.actor.grounded && bot.actor.contacts?.support?.collider.id !== 'player', 'it fires from real terrain rather than standing on the player')
  // An end-rope descent can now stop on the clear part of the adjoining
  // entrance ramp and fire from there instead of walking to its lowest point.
  assert.ok(bot.y >= run.level.entrance.y - 100 && bot.y <= run.level.entrance.y + 20, 'it reaches the entrance floor or adjoining ramp')
})

test('Uninvited Company hunts from the wall-facing upper shelf using a clear perch or descent', () => {
  const run = createRun(fixture('uninvited')), bot = rbot(run)
  bot.actor = createRepulsorActor(1080, 200); bot.x = 1080; bot.y = 200; bot.facing = -1
  // Acquire a real sighting before testing the committed exit-side route.
  bot.facing = 1; run.player = createPlayer({ x: 1740, y: 300 })
  tick(run); assert.ok(botLastSighting(bot))
  run.player = createPlayer({ x: 1550, y: 420 })
  let fellToBottom = false
  for (let frame = 0; frame < 600 && !bot.shots; frame++) {
    tick(run); fellToBottom ||= bot.y > 700
  }
  assert.equal(fellToBottom, false, 'the bot should land on the exit shelf instead of missing the jump')
  assert.ok(bot.shots); assert.ok(bot.x > 1100, 'it leaves the wall-facing dead end')
  assert.ok(run.gadgets.pulses.some(pulse => pulse.to[0] > 1500 && pulse.to[1] > 350), 'the shot reaches the lower player instead of the platform')
})

test('Uninvited Company pursuit climbs toward the exit shelf and shoots the player there', () => {
  const run = createRun(fixture('uninvited')), bot = rbot(run)
  bot.facing = 1; run.player = createPlayer({ x: 1120, y: 600 }); run.player.vy = -85
  tick(run); assert.ok(botLastSighting(bot))
  run.player = createPlayer({ x: 1550, y: 420 })
  // Rbot's size lets it jump straight to a shelf with a line of fire, where the player's size took the rope.
  let fellToBottom = false
  for (let frame = 0; frame < 900 && !bot.shots; frame++) {
    tick(run); fellToBottom ||= bot.y > 860
  }
  assert.ok(bot.shots, `stopped at ${bot.x}, ${bot.y}`)
  assert.equal(fellToBottom, false, 'it climbs, never dropping back to the floor it started on')
  assert.ok(bot.y < 860 && bot.actor.grounded, `it fires from a higher shelf, at ${bot.x}, ${bot.y}`)
  assert.ok(run.gadgets.pulses.some(pulse => pulse.to[0] > 1500 && pulse.to[1] < 430), 'the shot reaches the player on the exit shelf')
})
