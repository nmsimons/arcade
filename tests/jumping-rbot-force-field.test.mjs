import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseLevel } from '../src/games/jumping/level.ts'
import { STEP } from '../src/games/jumping/model.ts'
import { bodyIntersects } from '../src/games/jumping/geometry.ts'
import { playerContactBody } from '../src/games/jumping/playerContacts.ts'
import { createRbotFieldApproach, rbotFieldRigPoints, stepRbotFieldApproach } from './helpers/jumping-rbot-field.mjs'

for (const dt of [STEP, 1 / 30]) test(`Quarantine II: a field closing during Rbot's jump keeps its wall contact and pose stable (${dt})`, () => {
  const level = parseLevel(JSON.parse(readFileSync(new URL('./fixtures/jumping/quarantine-ii-rbot-water.json', import.meta.url), 'utf8')))
  const scene = createRbotFieldApproach(level), { run, bot } = scene
  let activated = false, braced = 0, seesBehind = false, landed = false, previous
  for (let frame = 0; frame < 6 / dt && !landed; frame++) {
    const active = run.forceFields[1].active
    stepRbotFieldApproach(scene, dt)
    const actor = bot.actor, points = rbotFieldRigPoints(actor)
    if (scene.pressing && !active && run.forceFields[1].active) {
      assert.equal(actor.grounded, false, 'the player closes the field while Rbot is actually airborne')
      activated = true
    }
    if (activated && !actor.grounded) {
      if (previous) for (let i = 0; i < points.length; i++) {
        assert.ok(Math.hypot(points[i][0] - previous[i][0], points[i][1] - previous[i][1]) < 1200 * dt + 1,
          `the visible rig snapped beside the field at frame ${frame}, point ${i}`)
      }
      if (actor.wallBrace?.active) {
        braced++
        seesBehind ||= bot.seesPlayer && (run.player.x - bot.x) * actor.facing < 0
        assert.equal(actor.facing, actor.wallBrace.direction)
        assert.equal(actor.dryTurn, null, 'looking behind cannot restart a turn against the wall-owned rig')
      }
      const body = playerContactBody(actor)
      for (const field of run.forceFields.filter(field => field.active)) {
        assert.equal(bodyIntersects(body.x, body.y, field.platform, body.height), false, 'the field still contains the physical body')
      }
    }
    landed = activated && actor.grounded && Math.abs(bot.y - 610) < .1
    previous = points
  }
  assert.ok(activated && braced * dt > .25 && seesBehind, 'the test includes a sustained wall contact and an opposite sighting')
  assert.ok(landed, 'the blocked jump falls back onto ordinary footing')
})

for (const dt of [STEP, 1 / 30]) test(`Quarantine II's updated emitters close around an airborne Rbot and allow a stable ledge landing (${dt})`, () => {
  const level = parseLevel(JSON.parse(readFileSync(new URL('./fixtures/jumping/quarantine-ii-rbot-force-field.json', import.meta.url), 'utf8')))
  const scene = createRbotFieldApproach(level), { run, bot } = scene
  let activated = false, gripped = false, landed = false, previous, previousFree = false
  for (let frame = 0; frame < 7 / dt && !landed; frame++) {
    const active = run.forceFields[1].active
    stepRbotFieldApproach(scene, dt)
    const actor = bot.actor, points = rbotFieldRigPoints(actor)
    const free = !actor.grounded && !actor.hang && !actor.mantle && !actor.climbing
    if (scene.pressing && !active && run.forceFields[1].active) {
      assert.equal(actor.grounded, false)
      activated = true
    }
    if (activated) {
      gripped ||= !!actor.hang || !!actor.mantle
      landed = actor.grounded && Math.abs(bot.y - 375) < .1
      if (free && previousFree) for (let i = 0; i < points.length; i++) {
        assert.ok(Math.hypot(points[i][0] - previous[i][0], points[i][1] - previous[i][1]) < 1200 * dt + 1,
          `the updated field layout interrupted the airborne rig at frame ${frame}`)
      }
      const body = playerContactBody(actor)
      for (const field of run.forceFields.filter(field => field.active)) {
        assert.equal(bodyIntersects(body.x, body.y, field.platform, body.height), false)
      }
    }
    previous = points; previousFree = free
  }
  assert.ok(activated && gripped && landed, 'the closed trap contains the bot while its real platform catch finishes')
})
