import test from 'node:test'
import assert from 'node:assert/strict'
import { createRun, createPreviewRun, stepRun } from '../src/games/jumping/challenge.ts'
import { blankTrial } from '../src/games/jumping/level.ts'
import { AWAKENING_SECONDS, ENTRANCE_SECONDS, entranceVisibility } from '../src/games/jumping/goal.ts'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { dynamicCasters, LightingState } from '../src/games/jumping/lightingModel.ts'
import { repulsorBotPresentation, repulsorBotWidthScale } from '../src/games/jumping/repulsorBotRig.ts'
import { athleteCasters } from '../src/games/jumping/athleteShadow.ts'
import { botLastSighting } from '../src/games/jumping/repulsorBot.ts'

function fixture() {
  const level = blankTrial()
  level.robots = [{ kind: 'repulsor', x: 800, y: level.floor, left: 26, right: level.width - 26, headlight: true }]
  return level
}
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`)

test('Rbots share the player entrance while physical bodies, AI and clocks stay frozen', () => {
  const level = fixture(), source = structuredClone(level)
  for (let restart = 0; restart < 2; restart++) {
    const run = createRun(level), robot = run.robots[0], actor = structuredClone(robot.actor)
    const input = { ...NEUTRAL_INPUT, move: 1, jump: true }
    assert.notStrictEqual(robot.entrance.player, robot.actor)
    assert.equal(robot.entrance.player.x, robot.x + 10)
    stepRun(run, input, .2)
    close(robot.entrance.elapsed, run.entrance.elapsed)
    assert.ok(robot.entrance.player.x < robot.x + 10 && robot.entrance.player.x > robot.x)
    assert.deepEqual(robot.actor, actor)
    assert.equal(robot.x, 800); assert.equal(robot.time, 0)
    assert.equal(botLastSighting(robot), undefined)
    assert.equal(robot.shots, undefined); assert.equal(run.elapsed, 0); assert.equal(run.activeTime, 0)
    for (let t = .2; t < ENTRANCE_SECONDS - STEP; t += STEP) stepRun(run, input, Math.min(STEP, ENTRANCE_SECONDS - STEP - t))
    assert.ok(robot.entrance)
    close(robot.entrance.player.x, robot.x)
    stepRun(run, NEUTRAL_INPUT, STEP)
    assert.equal(robot.entrance, undefined); assert.equal(run.started, true)
    assert.deepEqual(robot.actor, actor)
    close(run.elapsed, 0)
    stepRun(run, NEUTRAL_INPUT)
    close(run.elapsed, STEP)
    assert.ok(botLastSighting(robot), 'ordinary sensory processing begins only after entry')
  }
  assert.deepEqual(level, source, 'runtime entrances never rewrite authored level data')
})

test('Rbot closure handles leftover time and finishes independently during the longer player awakening', () => {
  const crossing = createRun(fixture())
  stepRun(crossing, NEUTRAL_INPUT, ENTRANCE_SECONDS - .02)
  stepRun(crossing, NEUTRAL_INPUT, .05)
  assert.equal(crossing.robots[0].entrance, undefined)
  close(crossing.elapsed, .03)
  const level = fixture(); level.entrance.kind = 'charging-bay'
  const run = createRun(level), actor = structuredClone(run.robots[0].actor)
  stepRun(run, NEUTRAL_INPUT, ENTRANCE_SECONDS)
  assert.equal(run.robots[0].entrance, undefined)
  assert.equal(run.started, false)
  stepRun(run, NEUTRAL_INPUT, AWAKENING_SECONDS - ENTRANCE_SECONDS)
  assert.equal(run.started, true); assert.equal(run.elapsed, 0)
  assert.deepEqual(run.robots[0].actor, actor)
})

test('previews, installed charging bays and shovebots retain their existing starts', () => {
  const level = fixture()
  level.robots.push({ ...level.robots[0], x: 1100, chargingBay: true }, { x: 1400, y: level.floor, left: 26, right: level.width - 26 })
  const run = createRun(level)
  assert.ok(run.robots[0].entrance)
  assert.equal(run.robots[1].entrance, undefined)
  assert.deepEqual(run.robots[1].awakening, { elapsed: 0, triggered: false })
  assert.equal(run.robots[2].entrance, undefined)
  const preview = createPreviewRun(level), before = structuredClone(preview)
  assert.ok(preview.robots.every(r => !r.entrance))
  stepRun(preview, NEUTRAL_INPUT, 10)
  assert.deepEqual(preview, before)
})

for (const placement of ['floating', 'slope', 'narrow sill', 'blocked', 'outside', 'prop']) {
  test(`a ${placement} Rbot start stays authored and static instead of receiving a portal`, () => {
    const level = fixture(), bot = level.robots[0], y = level.floor - 200
    if (placement === 'floating') bot.y = y
    if (placement === 'slope') {
      level.platforms = [{ x: 700, y, w: 200, h: 200, profile: [[0, 40], [200, 0]] }]
      bot.y = y + 20
    }
    if (placement === 'narrow sill') {
      level.platforms = [{ x: 790, y, w: 20, h: 200 }]; bot.y = y
    }
    if (placement === 'blocked') level.platforms = [{ x: 785, y: bot.y - 75, w: 30, h: 5 }]
    if (placement === 'outside') bot.x = 10
    if (placement === 'prop') level.props = [{ kind: 'box', x: 800, y: bot.y, size: 40 }]
    const before = structuredClone(level), run = createRun(level)
    assert.equal(run.robots[0].entrance, undefined)
    assert.equal(run.robots[0].x, bot.x); assert.equal(run.robots[0].y, bot.y)
    assert.deepEqual(level, before)
  })
}

test('Rbot entrance artwork and shadows follow one fading actor, with its headlight off', () => {
  const run = createRun(fixture()), bot = run.robots[0], lights = new LightingState()
  const definition = { nightMode: true, ambient: 0, lights: [] }
  assert.equal(dynamicCasters(run).length, 0, 'neither entrant casts an invisible body shadow')
  assert.equal(lights.sources(definition, run, 1)[0].fade, 0)
  stepRun(run, NEUTRAL_INPUT, .2)
  const { actor, pose, opacity } = repulsorBotPresentation(bot)
  assert.strictEqual(actor, bot.entrance.player)
  close(opacity, entranceVisibility(.2))
  const groups = dynamicCasters(run), shadows = groups.find(group => !group.player)
  close(shadows.opacity, opacity)
  const width = repulsorBotWidthScale(actor), expected = athleteCasters(actor, pose)
  close(shadows[0].x, actor.x + (expected[0].x - actor.x) * width)
  close(shadows[0].w, expected[0].w * width)
  assert.equal(lights.sources(definition, run, 1)[0].fade, 0)
  stepRun(run, NEUTRAL_INPUT, ENTRANCE_SECONDS - .2)
  assert.strictEqual(repulsorBotPresentation(bot).actor, bot.actor)
  assert.equal(lights.sources(definition, run, 1)[0].fade, 1)
})
