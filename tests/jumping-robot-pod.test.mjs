import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { blankTrial, levelProblems, parseLevel } from '../src/games/jumping/level.ts'
import { createRun, createPreviewRun, stepRun } from './helpers/jumping-active-run.mjs'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { AWAKENING_SECONDS, chargingBayBounds, ROBOT_BAY_WIDTH_SCALE } from '../src/games/jumping/goal.ts'
import { botLastSighting } from '../src/games/jumping/repulsorBot.ts'
import { awakeningPose } from '../src/games/jumping/athlete.ts'
import { repulsorBotPose } from '../src/games/jumping/repulsorBotRig.ts'
import { duplicateItem, itemBounds, moveItem } from '../src/games/jumping/editor.ts'
import { JumpingAudioState } from '../src/games/jumping/audioState.ts'
import { LightingState } from '../src/games/jumping/lightingModel.ts'

function fixture(hidden = false) {
  const level = blankTrial()
  level.entrance = { x: 200, y: level.floor }
  level.robots = [{ kind: 'repulsor', x: 800, y: level.floor, left: 26, right: level.width - 26, chargingBay: true }]
  if (hidden) level.platforms = [{ x: 450, y: 0, w: 40, h: level.floor }]
  return parseLevel(level)
}
const tick = (run, seconds, input = NEUTRAL_INPUT) => {
  for (let i = 0; i < Math.ceil(seconds / STEP); i++) stepRun(run, input)
}

test('a docked hunter stays asleep behind cover instead of patrolling toward the entrance', () => {
  const level = fixture(true), run = createRun(level), bot = run.robots[0]
  tick(run, 5)
  assert.equal(bot.x, 800); assert.equal(bot.y, level.floor)
  assert.deepEqual(bot.awakening, { elapsed: 0, triggered: false })
  assert.equal(bot.shots ?? 0, 0)
  assert.equal(botLastSighting(bot), undefined)
  assert.ok(run.elapsed > 4.9, 'only the local robot waits; the world clock runs')
  assert.deepEqual(createPreviewRun(level).robots[0].awakening, { elapsed: 0, triggered: false })
})

test('sight starts a planted awakening and cover release before the ordinary hunt', () => {
  const level = fixture(), run = createRun(level), bot = run.robots[0]
  const sleep = repulsorBotPose(bot.actor, awakeningPose(bot.actor, 0))
  const awake = repulsorBotPose(bot.actor)
  assert.ok(sleep.head[1] > awake.head[1])
  assert.deepEqual(sleep.frontLeg.end, awake.frontLeg.end)
  tick(run, 2.4)
  assert.equal(bot.awakening.triggered, true)
  assert.equal(bot.x, 800); assert.equal(bot.shots ?? 0, 0)
  assert.ok(bot.awakening.elapsed < AWAKENING_SECONDS)
  assert.ok(botLastSighting(bot), 'the actual sighting is remembered during awakening')
  tick(run, 2.4)
  assert.equal(bot.awakening.elapsed, AWAKENING_SECONDS)
  assert.ok(bot.shots > 0, 'ordinary palm-shot AI takes over after release')
  assert.deepEqual(createRun(level).robots[0].awakening, { elapsed: 0, triggered: false })
})

test('normal running noise can wake a covered pod; quiet walking cannot', () => {
  const level = fixture(true)
  level.entrance.x = 400; level.robots[0].x = 600
  const quiet = createRun(level)
  tick(quiet, 1, { ...NEUTRAL_INPUT, move: .3 })
  assert.equal(quiet.robots[0].awakening.triggered, false)
  const loud = createRun(level)
  tick(loud, 1, { ...NEUTRAL_INPUT, move: -1 })
  assert.equal(loud.robots[0].awakening.triggered, true)
  assert.equal(botLastSighting(loud.robots[0]), undefined)
})

test('EMP pauses a local awakening without stopping the player or forgetting the alarm', () => {
  const run = createRun(fixture()), bot = run.robots[0]
  tick(run, 1.5)
  const elapsed = bot.awakening.elapsed, x = run.player.x
  run.gadgets.disabled.set(bot, 1)
  tick(run, .5, { ...NEUTRAL_INPUT, move: -1 })
  assert.equal(bot.awakening.elapsed, elapsed)
  assert.ok(run.player.x < x - 50)
  tick(run, 2)
  assert.ok(bot.awakening.elapsed > elapsed)
  assert.equal(bot.awakening.triggered, true)
})

test('pods round trip, move and duplicate with their bot, and reject invalid kinds or footprints', () => {
  const level = fixture(), selection = { kind: 'robot', index: 0 }
  assert.deepEqual(parseLevel(JSON.parse(JSON.stringify(level))), level)
  const b = itemBounds(level, selection)
  assert.deepEqual(b, chargingBayBounds(level.robots[0], ROBOT_BAY_WIDTH_SCALE))
  const moved = moveItem(level, selection, 80, 0)
  assert.equal(moved.robots[0].x, 880); assert.equal(moved.robots[0].y, level.floor)
  assert.equal(duplicateItem(level, selection).level.robots[1].chargingBay, true)
  for (const invalid of [7, 'yes']) {
    const file = fixture(); file.robots[0].chargingBay = invalid
    assert.throws(() => parseLevel(file))
  }
  const shovebot = fixture(); delete shovebot.robots[0].kind
  assert.throws(() => parseLevel(shovebot))
  const edge = fixture(); edge.robots[0].x = 30
  assert.ok(levelProblems(edge).some(issue => issue.includes('charging bay')))
})

test('the pod uses existing positional servo and cover sounds, then becomes silent', () => {
  const run = createRun(fixture()), audio = new JumpingAudioState(), bot = run.robots[0]
  audio.reset(run.player, run)
  let servo = false, cover = false
  for (let i = 0; i < Math.ceil(AWAKENING_SECONDS / STEP); i++) {
    stepRun(run, NEUTRAL_INPUT); audio.step(run.player, run, STEP)
    const frame = audio.drain()
    servo ||= frame.loops.some(loop => loop.id.endsWith(':pod') && loop.kind === 'robot-servo')
    cover ||= frame.loops.some(loop => loop.id.endsWith(':pod') && loop.kind === 'gate-open')
  }
  assert.equal(servo, true); assert.equal(cover, true)
  assert.ok(Math.abs(bot.awakening.elapsed - AWAKENING_SECONDS) < 1e-8)
  stepRun(run, NEUTRAL_INPUT); audio.step(run.player, run, STEP)
  assert.ok(audio.drain().loops.every(loop => !loop.id.endsWith(':pod')))
})

test('a docked headlight returns with local power, and EMP still turns it off', () => {
  const level = fixture(), run = createRun(level), bot = run.robots[0], lighting = new LightingState()
  bot.definition.headlight = true
  const definition = { nightMode: true, ambient: 0, lights: [] }
  assert.equal(lighting.sources(definition, run, 1)[0].fade, 0)
  tick(run, 1.5)
  assert.equal(lighting.sources(definition, run, 1)[0].fade, 1)
  run.gadgets.disabled.set(bot, 1)
  assert.equal(lighting.sources(definition, run, 1)[0].fade, 0)
})

test('the captured Company encounter has one installed response unit in a valid night room', () => {
  const level = parseLevel(JSON.parse(readFileSync(new URL('./fixtures/jumping/company-pod.json', import.meta.url), 'utf8')))
  assert.deepEqual(levelProblems(level), [])
  assert.equal(level.robots.length, 1)
  assert.equal(level.robots[0].chargingBay, true)
  assert.equal(level.lighting.nightMode, true)
})
