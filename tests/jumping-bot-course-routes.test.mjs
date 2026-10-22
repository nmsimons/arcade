import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseLevel, blankTrial } from '../src/games/jumping/level.ts'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { NEUTRAL_INPUT } from '../src/games/jumping/model.ts'

// Walls and Here There Everywhere are now movement courses without a hunter.
const courses = ['Hellstones', 'Spellbound', 'Blackout', 'Hatchlings', 'Hurricane']

for (const name of courses) test(`${name}: authored Rbot traverses the course and reaches a firing position`, () => {
  const level = parseLevel(JSON.parse(readFileSync(new URL(`../public/levels/jumping/${name}.jump-level.json`, import.meta.url), 'utf8')))
  for (const rope of level.climbables.ropes) {
    const anchor = rope.anchor, host = anchor && level.platforms[anchor.platform]
    if (host && (anchor.x === 0 || Math.abs(anchor.x - host.w) < 1e-6)) {
      const cornerY = host.polygon ? Math.min(...host.polygon.filter(([x]) => Math.abs(x - anchor.x) < 1e-6).map(([, y]) => y)) : 0
      assert.ok(Math.abs(anchor.y - cornerY) < 1e-6, `${rope.name} attaches at the top corner`)
    }
  }
  const run = createRun(level), bot = run.robots.find(robot => robot.definition.kind === 'repulsor')
  assert.ok(bot, 'the level has an authored Rbot')
  const spawn = { x: bot.x, y: bot.y }
  let minY = spawn.y, maxY = spawn.y, firedFromFooting = false
  for (let frame = 0; frame < 7200; frame++) {
    const shots = bot.shots ?? 0
    stepRun(run, NEUTRAL_INPUT)
    minY = Math.min(minY, bot.y); maxY = Math.max(maxY, bot.y)
    if ((bot.shots ?? 0) > shots && bot.actor.grounded && bot.actor.contacts?.support?.collider.id !== 'player') firedFromFooting = true
    // Compact courses can offer an opening shot before the pursuit begins.
    if (firedFromFooting && Math.hypot(bot.x - spawn.x, bot.y - spawn.y) > 250 && maxY - minY > 150) break
  }
  assert.ok(bot.shots, `stalled at ${bot.x}, ${bot.y}`)
  assert.ok(Math.hypot(bot.x - spawn.x, bot.y - spawn.y) > 250, 'the encounter requires real traversal')
  assert.ok(maxY - minY > 150, 'the hunter traverses a different elevation')
  assert.ok(firedFromFooting, 'it fires from physical footing')
})

test('an Rbot steps off the player without reversing at the room center', () => {
  const level = blankTrial()
  level.width = 1000; level.height = 700; level.floor = 700
  level.platforms = [{ x: 0, y: 500, w: 1000, h: 25 }]
  level.entrance = { x: 500, y: 500 }; level.goal = { x: 900, y: 500, flipX: true }
  level.robots = [{ kind: 'repulsor', x: 500, y: 438, left: 400, right: 600 }]
  const run = createRun(level), bot = run.robots[0]
  for (let frame = 0; frame < 240 && !bot.shots; frame++) stepRun(run, NEUTRAL_INPUT)
  assert.ok(Math.abs(bot.x - 500) > 35, `oscillated at ${bot.x}`)
  assert.equal(bot.actor.contacts?.support?.collider.id, 'terrain:0')
})
