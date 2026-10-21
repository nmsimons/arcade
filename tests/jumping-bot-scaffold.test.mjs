import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseLevel, blankTrial } from '../src/games/jumping/level.ts'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { createRepulsorActor } from '../src/games/jumping/repulsorBot.ts'
import { botMovement } from '../src/games/jumping/botNavigation.ts'
import { BOT_AIR_SPEED_SCALE } from '../src/games/jumping/botMovementTuning.ts'
import { staticContactWorld } from '../src/games/jumping/playerContacts.ts'
import { NEUTRAL_INPUT, STEP, stepPlayer } from '../src/games/jumping/model.ts'

const scaffold = () => parseLevel(JSON.parse(readFileSync(new URL('./fixtures/jumping/scaffold-rbot-routes.json', import.meta.url), 'utf8')))
function navigate(run, from, goal, frames) {
  const bot = run.robots[0], world = staticContactWorld(run.terrain)
  bot.actor = createRepulsorActor(from.x, from.y); bot.x = from.x; bot.y = from.y
  let jumps = 0, lowering = false
  for (let frame = 0; frame < frames; frame++) {
    const input = botMovement(run, bot, STEP, goal)
    jumps += Number(input.jump); lowering ||= !!bot.actor.mantle?.descending
    stepPlayer(bot.actor, input, STEP, world.platforms, run.level.climbables, { checkpoints: [], fallY: Infinity }, world,
      run.gravityField, undefined, 1, undefined, { airSpeedScale: BOT_AIR_SPEED_SCALE })
    bot.x = bot.actor.x; bot.y = bot.actor.y; bot.vx = bot.actor.vx; bot.facing = bot.actor.facing
  }
  return { bot, jumps, lowering }
}

test('Scaffold hunter follows the upper V and reaches the actual entrance through normal navigation', () => {
  const run = createRun(scaffold()), bot = run.robots[0]
  for (let frame = 0; frame < 2640 && !bot.shots; frame++) stepRun(run, NEUTRAL_INPUT)
  assert.ok(bot.shots, `stalled at ${bot.x}, ${bot.y}`)
  assert.ok(bot.actor.grounded)
  assert.equal(bot.y, run.level.entrance.y)
})

test('a walkable slope remains a walking route instead of triggering repeated jumps', () => {
  const run = createRun(scaffold())
  const result = navigate(run, { x: 1000, y: 1095 }, { x: 685, y: 1028.0231910946197 }, 600)
  assert.equal(result.jumps, 0)
  assert.ok(Math.abs(result.bot.x - 685) < 12)
  assert.ok(result.bot.actor.grounded)
})

test('navigation follows the surface over a crest and finishes beyond the nearest graph sample', () => {
  const run = createRun(scaffold())
  const { bot, jumps } = navigate(run, { x: 1066, y: 858 }, { x: 1000, y: 855 }, 300)
  assert.equal(jumps, 0)
  assert.ok(Math.abs(bot.x - 1000) < 12, `stopped at ${bot.x}`)
  assert.equal(bot.y, 855)
})

test('a planned ladder descent finishes its lowering animation without climbing back up', () => {
  const file = blankTrial()
  file.width = 1000; file.height = 1000; file.floor = 1000
  file.entrance = { x: 100, y: 800 }; file.goal = { x: 900, y: 800, flipX: true }
  file.platforms = [{ x: 0, y: 200, w: 400, h: 25 }, { x: 0, y: 800, w: 1000, h: 200 }]
  file.climbables = { ladders: [{ x: 420, top: 200, bottom: 800, platform: -1, side: -1 }], ropes: [] }
  file.robots = [{ kind: 'repulsor', x: 380, y: 200, left: 26, right: 974 }]
  const { bot, lowering } = navigate(createRun(file), { x: 380, y: 200 }, { x: 600, y: 800 }, 1200)
  assert.ok(lowering)
  assert.ok(bot.actor.grounded)
  assert.equal(bot.y, 800)
  assert.ok(Math.abs(bot.x - 600) < 15)
})
