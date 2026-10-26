import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { blankTrial, parseLevel } from '../src/games/jumping/level.ts'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { createPlayer, NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { botCanReach, botNavigationGraph } from '../src/games/jumping/botNavigation.ts'
import { botSwimClear, botWaterPosition } from '../src/games/jumping/botWaterNavigation.ts'
import { presentedAthletePose } from '../src/games/jumping/athlete.ts'
import { repulsorBotPose, repulsorBotWidthScale } from '../src/games/jumping/repulsorBotRig.ts'
import { robotHeadlightPose } from '../src/games/jumping/robotHeadlight.ts'
import { advanceWaterLevels } from '../src/games/jumping/waterLevel.ts'
import { playerSwimStrength, updateGravityField } from '../src/games/jumping/gravity.ts'
import { createRepulsorActor } from '../src/games/jumping/repulsorBot.ts'

const quarantine = () => parseLevel(JSON.parse(readFileSync(new URL('./fixtures/jumping/quarantine-ii-rbot-water.json', import.meta.url), 'utf8')))
const waterline = () => parseLevel(JSON.parse(readFileSync(new URL('./fixtures/jumping/waterline-ii-rbot-water.json', import.meta.url), 'utf8')))
function pool(side = 1) {
  return { ...blankTrial(), width: 1400, height: 800, floor: 800,
    entrance: { x: side > 0 ? 1200 : 200, y: 340 }, goal: { x: side > 0 ? 100 : 1300, y: 400 },
    platforms: [{ x: 0, y: side > 0 ? 400 : 340, w: 400, h: side > 0 ? 400 : 460 },
      { x: 1000, y: side > 0 ? 340 : 400, w: 400, h: side > 0 ? 460 : 400 }],
    gravityPlates: [{ id: 'pool', x: 400, y: 400, w: 600, h: 400, gravity: -1, effect: 'water' }],
    robots: [{ kind: 'repulsor', x: 700, y: 650, left: 26, right: 1374 }] }
}

function assertSwimmingRig(bot) {
  const actor = bot.actor, native = presentedAthletePose(actor), pose = repulsorBotPose(actor), width = repulsorBotWidthScale(actor)
  for (const name of ['hip', 'waist', 'shoulder', 'head']) {
    assert.ok(Math.abs(pose[name][0] * width - native[name][0]) < 1e-8, 'widening the shell cannot stretch a horizontal swimmer')
  }
  for (const name of ['frontArm', 'backArm']) for (const point of ['root', 'joint', 'end']) {
    assert.ok(Math.abs(pose[name][point][0] * width - native[name][point][0]) < 1e-8, 'both hands retain the shared solved stroke and contact targets')
  }
  assert.ok(Math.abs(robotHeadlightPose(bot).x - (bot.x + (pose.head[0] * width + 11) * bot.facing)) < 1e-8)
}

for (const dt of [STEP, 1 / 30]) for (const side of [-1, 1]) test(`a submerged Rbot surfaces and jumps onto a high bank (${side}, ${dt})`, () => {
  const level = pool(side)
  level.forceFields = [{ id: 'low-bank', x: side > 0 ? 400 : 988, y: 0, w: 12, h: 800,
    orientation: 'vertical', mode: 'objects', power: 'always' }]
  const run = createRun(level), bot = run.robots[0]
  bot.facing = side
  let swimming = false, exited = false
  for (let frame = 0; frame < 12 / dt && !exited; frame++) {
    const previous = { x: bot.x, y: bot.y }
    stepRun(run, NEUTRAL_INPUT, dt)
    swimming ||= (bot.actor.waterMotion?.amount ?? 0) > .5
    exited = bot.actor.grounded && Math.abs(bot.y - 340) < .1
    assert.ok(Math.hypot(bot.x - previous.x, bot.y - previous.y) < 1400 * dt + 1, 'the ordinary motor supplies every displacement')
  }
  assert.ok(swimming, 'the bot deliberately swims instead of floating at a floor waypoint')
  assert.ok(exited, `failed to climb the bank at ${bot.x}, ${bot.y}`)
  assert.ok(botNavigationGraph(run).nodes.length <= 160)
})

test('swim routes obey red fields and live mechanisms, and never cross a dry gap', () => {
  const file = pool(); file.forceFields = [{ id: 'barrier', orientation: 'vertical', mode: 'objects', x: 650, y: 0, w: 12, h: 800 }]
  const run = createRun(file), bot = run.robots[0], goal = { x: 500, y: 650 }
  assert.equal(botCanReach(run, bot, goal), false)
  run.forceFields[0].active = false
  assert.equal(botCanReach(run, bot, goal), true)
  run.forceFields[0].active = true; run.forceFields[0].definition.mode = 'player'
  assert.equal(botCanReach(run, bot, goal), true)
  run.mechanisms.push({ definition: { id: 'gate', kind: 'gate', x: 650, y: 0, w: 20, h: 800 }, x: 650, y: 0 })
  assert.equal(botCanReach(run, bot, goal), false)
  run.mechanisms[0].y = -800
  assert.equal(botCanReach(run, bot, goal), true)
  const split = pool(); split.gravityPlates = [
    { ...split.gravityPlates[0], w: 240 }, { ...split.gravityPlates[0], id: 'other', x: 760, w: 240 }]
  assert.equal(botSwimClear(createRun(split), { x: 500, y: 650 }, { x: 900, y: 650 }, []), false)
})

test('filling and draining refresh swimming topology without changing authored water', () => {
  const file = pool(); file.gravityPlates[0].waterLevel = 0; file.gravityPlates[0].waterRate = 100
  const run = createRun(file), empty = botNavigationGraph(run)
  assert.ok(empty.nodes.every(n => !n.swim))
  advanceWaterLevels(run.water, new Map([['pool:fill', true]]), 1)
  updateGravityField(run.gravityField, run.water.plates, run.switchStates, true, run.water.revision)
  const full = botNavigationGraph(run)
  assert.notEqual(full, empty); assert.ok(full.nodes.some(n => n.swim))
  advanceWaterLevels(run.water, new Map([['pool:drain', true]]), 1)
  assert.ok(botNavigationGraph(run).nodes.every(n => !n.swim))
  assert.equal(file.gravityPlates[0].waterLevel, 0)
})

test('a large map with water retains all of its existing surface, ladder and rope nodes', () => {
  const level = parseLevel(JSON.parse(readFileSync(new URL('./fixtures/jumping/aloft-rbot-routes.json', import.meta.url), 'utf8')))
  const dry = botNavigationGraph(createRun({ ...level, gravityPlates: level.gravityPlates.filter(p => p.effect !== 'water') }))
  const wet = botNavigationGraph(createRun(level))
  assert.ok(dry.nodes.length + 64 > 160, 'adding water lanes would exceed the original graph budget')
  for (const node of dry.nodes) assert.ok(wet.nodes.some(n => n.x === node.x && n.y === node.y && n.climb === node.climb), `lost route at ${JSON.stringify(node)}`)
  assert.ok(wet.nodes.length <= 224)
})

test('Quarantine II: a fresh fall commits to a bank exit while the player keeps diving', () => {
  const run = createRun(quarantine()), bot = run.robots[0]
  let wet = false, exited = false, exitFrame, previousPalms, previousWet = false
  let flightTurns = 0, previousFlightTurn = false
  for (let frame = 0; frame < 16 * 120; frame++) {
    const player = run.player, t = frame * STEP
    const x = t < 11 ? 650 : 1000
    const vertical = t < 7 ? (1210 - botWaterPosition(player).y) / 60 : -1
    stepRun(run, { ...NEUTRAL_INPUT, move: Math.max(-1, Math.min(1, (x - player.x) / 45)),
      swimVertical: player.waterMotion ? Math.max(-1, Math.min(1, vertical)) : 0,
      jump: frame === 11 * 120, jumpStrength: 1, climb: t >= 11 })
    wet ||= !!bot.actor.waterMotion
    exited ||= wet && bot.actor.grounded && Math.abs(bot.y - 1015) < .1
    if (exited && exitFrame === undefined) exitFrame = frame
    if (exitFrame !== undefined && frame > exitFrame + 60 && t < 10.5 && !bot.actor.hang && !bot.actor.mantle && !bot.actor.climbing) {
      assert.ok(playerSwimStrength(run.gravityField, bot.actor) < .05, 'a submerged sighting cannot lure the escaped bot straight back in')
    }
    const actor = bot.actor, pose = repulsorBotPose(actor)
    const flightTurn = !wet && !actor.grounded && !actor.climbing && !actor.hang && !actor.mantle && !!actor.dryTurn
    if (flightTurn && !previousFlightTurn) flightTurns++
    previousFlightTurn = flightTurn
    const palms = ['frontArm', 'backArm'].map(name => {
      const arm = pose[name], angle = arm.handAngle ?? Math.atan2(arm.end[1] - arm.joint[1], arm.end[0] - arm.joint[0])
      const palm = arm.hand ?? [arm.end[0] + Math.cos(angle) * 1.4, arm.end[1] + Math.sin(angle) * 1.4]
      return [actor.x + palm[0] * actor.facing * repulsorBotWidthScale(actor), actor.y + palm[1]]
    })
    const freeWet = !!actor.waterMotion && !actor.shove && !actor.hang && !actor.mantle && !actor.jumpLift && !actor.waterJump
    if (freeWet && previousWet) for (let i = 0; i < palms.length; i++) {
      assert.ok(Math.hypot(palms[i][0] - previousPalms[i][0], palms[i][1] - previousPalms[i][1]) < 9, `swimming palm snapped at frame ${frame}`)
    }
    previousPalms = palms; previousWet = freeWet
    if ((actor.waterMotion?.amount ?? 0) > .999) assertSwimmingRig(bot)
  }
  assert.ok(wet && exited && exitFrame < 10 * 120, `water escape incomplete: wet=${wet}, exit=${exitFrame}, bot=${bot.x},${bot.y}`)
  assert.ok(flightTurns <= 1, 'the long fall into the reservoir cannot restart a turn on every braking correction')
})

for (const dt of [STEP, 1 / 30]) for (const x of [60, 300, 550, 650, 900, 1300, 1700, 1950]) for (const y of [1160, 1250, 1380]) {
  test(`Quarantine II: Rbot escapes from ${x},${y} while the player stays underwater (${dt})`, () => {
    const level = parseLevel(JSON.parse(readFileSync(new URL('./fixtures/jumping/quarantine-ii-rbot-force-field.json', import.meta.url), 'utf8')))
    const run = createRun(level), bot = run.robots[0]
    bot.actor = createRepulsorActor(x, y); bot.actor.grounded = false; bot.x = x; bot.y = y
    run.player = createPlayer({ x: 650, y: 1250 }); run.player.grounded = false
    let exitTime, strokeFrames = 0
    for (let frame = 0; frame < 14 / dt; frame++) {
      const player = run.player, time = frame * dt
      stepRun(run, { ...NEUTRAL_INPUT, move: Math.max(-1, Math.min(1, (650 - player.x) / 45)),
        swimVertical: Math.max(-1, Math.min(1, (1250 - botWaterPosition(player).y) / 60)) }, dt)
      const dry = bot.actor.grounded && playerSwimStrength(run.gravityField, bot.actor) < .05
      if (x === 300 && y === 1250 && (bot.actor.waterMotion?.amount ?? 0) > .999) {
        assertSwimmingRig(bot); strokeFrames++
      }
      if (dry && exitTime === undefined) exitTime = time
      if (exitTime !== undefined && time > exitTime + 1) {
        if (!bot.actor.hang && !bot.actor.mantle && !bot.actor.climbing) {
          assert.ok(playerSwimStrength(run.gravityField, bot.actor) < .05, 'after escaping, the bot uses dry routes rather than diving back in')
        }
        if (time > exitTime + 2) break
      }
    }
    assert.ok(exitTime < 12, `failed to escape: ${bot.x},${bot.y}`)
    if (x === 300 && y === 1250) assert.ok(strokeFrames * dt > 1, 'a deep escape exercises the fully blended rig through the overhang route')
  })
}

test('Rbot abandons a newly blocked bank and uses the other exit', () => {
  const level = pool()
  level.forceFields = [{ id: 'bank', x: 950, y: 0, w: 12, h: 800, orientation: 'vertical', mode: 'objects', power: 'switched' }]
  level.triggers = [{ x: 1050, y: 340, w: 40, mode: 'touch', behavior: 'toggle', startsOn: false, targets: ['bank'] }]
  const run = createRun(level), bot = run.robots[0]
  let exited = false
  for (let frame = 0; frame < 15 * 120 && !exited; frame++) {
    if (frame === 120) run.triggers[0].active = true
    stepRun(run, NEUTRAL_INPUT)
    exited = frame > 120 && bot.actor.grounded && playerSwimStrength(run.gravityField, bot.actor) < .05
  }
  assert.ok(exited && bot.x < 400, `did not switch to the clear left bank: ${bot.x},${bot.y}`)
})

test('a temporarily sealed pool stays calm and Rbot leaves when a field opens', () => {
  const level = pool()
  level.forceFields = [420, 980].map((x, i) => ({ id: `bank-${i}`, x, y: 0, w: 12, h: 800, orientation: 'vertical', mode: 'objects', power: 'switched' }))
  level.triggers = [{ x: 1050, y: 340, w: 40, mode: 'touch', behavior: 'toggle', startsOn: true, targets: ['bank-0', 'bank-1'] }]
  const run = createRun(level), bot = run.robots[0]
  let exited = false
  for (let frame = 0; frame < 16 * 120 && !exited; frame++) {
    if (frame === 4 * 120) run.triggers[0].active = false
    stepRun(run, NEUTRAL_INPUT)
    if (frame < 4 * 120) {
      assert.ok(bot.x > 432 && bot.x < 980, 'the motor obeys the closed red fields')
      assert.equal(bot.phase === 'windup', false, 'getting out takes precedence over charging a shot')
    }
    exited = frame > 4 * 120 && bot.actor.grounded && playerSwimStrength(run.gravityField, bot.actor) < .05
  }
  assert.ok(exited, `did not leave after the barrier opened: ${bot.x},${bot.y}`)
})

for (const dt of [STEP, 1 / 30]) for (const fill of [10, 20, 50]) for (const x of [300, 650, 1300, 1950])
test(`Quarantine III: Rbot leaves ${fill}% water from ${x} using real jumps and climbs (${dt})`, () => {
  const level = parseLevel(JSON.parse(readFileSync(new URL('./fixtures/jumping/quarantine-iii-rbot-water.json', import.meta.url), 'utf8')))
  level.gravityPlates.find(p => p.effect === 'water').waterLevel = fill
  const run = createRun(level), bot = run.robots[0]
  bot.actor = createRepulsorActor(x, 1380); bot.actor.grounded = false; bot.x = x; bot.y = 1380
  let jumped = false, climbed = false, exited = false
  for (let frame = 0; frame < 30 / dt && !exited; frame++) {
    stepRun(run, NEUTRAL_INPUT, dt)
    jumped ||= !!bot.actor.waterJump || !!bot.actor.jumpLift
    climbed ||= bot.actor.climbing?.kind === 'rope'
    exited = bot.actor.grounded && playerSwimStrength(run.gravityField, bot.actor) < .05
  }
  assert.ok(jumped, 'surface jumps and shallow ground takeoffs use the shared motor')
  if (fill <= 20) assert.ok(climbed, 'the low water is too far below the bank for a direct jump')
  assert.ok(exited, `failed to climb out from the low water: ${bot.x},${bot.y}`)
})

for (const dt of [STEP, 1 / 30]) test(`Rbot can board a submerged ladder and climb above the water (${dt})`, () => {
  const level = pool()
  level.platforms.forEach(p => { p.y = 100; p.h = 700 })
  level.entrance.y = 100
  level.climbables.ladders = [{ x: 970, top: 100, bottom: 800, platform: -1, side: -1 }]
  const run = createRun(level), bot = run.robots[0]
  let climbed = false, exited = false
  for (let frame = 0; frame < 20 / dt && !exited; frame++) {
    stepRun(run, NEUTRAL_INPUT, dt)
    climbed ||= bot.actor.climbing?.kind === 'ladder'
    exited = bot.actor.grounded && playerSwimStrength(run.gravityField, bot.actor) < .05
  }
  assert.ok(climbed && exited, `failed to use the ladder out of the water: ${bot.x},${bot.y}`)
})

for (const dt of [STEP, 1 / 30]) for (const [x, y] of [[2050, 930], [2100, 1050], [2261, 1380]])
test(`Waterline II: Rbot finishes its bank approach after falling into the right pool (${x}, ${y}, ${dt})`, () => {
  const level = waterline(), run = createRun(level), bot = run.robots[0]
  bot.x = x; bot.y = y; bot.actor = createRepulsorActor(x, y); bot.actor.grounded = false
  let wet = false, jumped = false, exited = false
  for (let time = 0; time < 12 && !exited; time += dt) {
    const before = [bot.x, bot.y]
    stepRun(run, NEUTRAL_INPUT, dt)
    wet ||= playerSwimStrength(run.gravityField, bot.actor) > .05
    jumped ||= !!bot.actor.waterJump
    exited = wet && bot.actor.grounded && Math.abs(bot.y - 845) < .1 && playerSwimStrength(run.gravityField, bot.actor) < .05
    assert.ok(Math.hypot(bot.x - before[0], bot.y - before[1]) < 1400 * dt + 1, 'the shared motor supplies all travel')
  }
  assert.ok(wet && jumped && exited, `failed to leave the right pool: ${bot.x},${bot.y}`)
})
