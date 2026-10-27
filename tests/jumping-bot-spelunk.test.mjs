import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseLevel } from '../src/games/jumping/level.ts'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { createRepulsorActor } from '../src/games/jumping/repulsorBot.ts'
import { botCanReach } from '../src/games/jumping/botNavigation.ts'
import { NEUTRAL_INPUT } from '../src/games/jumping/model.ts'

// Freeze the reported course so future studio edits cannot erase the regression.
const spelunk = () => parseLevel(JSON.parse(readFileSync(new URL('./fixtures/jumping/spelunk1b-rbot-routes.json', import.meta.url), 'utf8')))
const tick = run => stepRun(run, NEUTRAL_INPUT)

test('Spelunk Ib patrol leaves the platform area, crosses the cave rocks and returns to the platforms', () => {
  const run = createRun(spelunk()), bot = run.robots[0]
  let crossed = false, returned = false, caveLanding = false
  for (let frame = 0; frame < 9600 && !returned; frame++) {
    tick(run)
    caveLanding ||= bot.actor.grounded && bot.x < 2080 && bot.actor.contacts?.support?.collider.id === 'terrain:5'
    crossed ||= caveLanding && bot.actor.grounded && bot.x < 1500
    returned ||= crossed && bot.actor.grounded && bot.x > 3100
  }
  assert.ok(caveLanding, `never left the platforms: ${bot.x}, ${bot.y}`)
  assert.ok(crossed, `did not cross the cave rocks: ${bot.x}, ${bot.y}`)
  assert.ok(returned, `could not return over the steep rocks: ${bot.x}, ${bot.y}`)
  assert.equal(bot.shots ?? 0, 0, 'this is an ordinary unalerted patrol, without a player sighting to supply faster steering')
})

test('the Spelunk Ib cave jump respects live barriers on its hand-catch route', () => {
  const file = spelunk()
  file.forceFields ??= []
  file.forceFields.push({ id: 'cave-route-barrier', mode: 'objects', orientation: 'vertical', x: 2220, y: 0, w: 12, h: 2020 })
  const run = createRun(file), bot = run.robots[0], barrier = run.forceFields.at(-1)
  bot.actor = createRepulsorActor(2358, 1638.7142857142858)
  bot.x = bot.actor.x; bot.y = bot.actor.y; bot.facing = 1
  const goal = { x: 2062, y: 1580 }
  barrier.active = true
  assert.equal(botCanReach(run, bot, goal), false, 'the red beam closes the gap')
  barrier.active = false
  assert.equal(botCanReach(run, bot, goal), true, 'opening the beam exposes the ordinary catch route')
  barrier.active = true; barrier.definition.mode = 'player'
  assert.equal(botCanReach(run, bot, goal), true, 'a blue beam permits the same bot jump')
})
