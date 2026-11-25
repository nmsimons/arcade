import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { blankTrial, parseLevel } from '../src/games/jumping/level.ts'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { botLastHeard, hearPlayer, recordPlayerNoise, PICKUP_NOISE_RANGE } from '../src/games/jumping/botHearing.ts'
import { botLastSighting, botLastTactic } from '../src/games/jumping/repulsorBot.ts'
import { predictPlayer, landingOf } from '../src/games/jumping/botPrediction.ts'
import { REPULSOR_BOT_SIZE } from '../src/games/jumping/repulsorBotRig.ts'
import { botCanReach } from '../src/games/jumping/botNavigation.ts'

// How Rbot hunts (docs/jumping-rbot-hunting.md): never standing about, predicting from the level, and fair.
const builtin = file => parseLevel(JSON.parse(readFileSync(new URL(`../public/levels/jumping/${file}`, import.meta.url), 'utf8')))

/** The bot's longest spell neither moving nor winding up, recovering, slumped or waking, in seconds. Holding an
 * ambush in view of the player is waiting on purpose (docs/jumping-rbot-hunting.md), not standing about. */
function longestIdle(run, seconds) {
  const bot = run.robots.find(robot => robot.definition.kind === 'repulsor')
  let longest = 0, streak = 0
  for (let t = 0; t < seconds; t += STEP) {
    stepRun(run, NEUTRAL_INPUT)
    const a = bot.actor, moving = Math.hypot(a.vx, a.vy) > 8, busy = bot.phase === 'windup' || bot.phase === 'recover' || bot.collapse || a.shove
      || bot.seesPlayer && botLastTactic(bot)?.kind === 'ambush'
    streak = moving || busy ? 0 : streak + STEP
    longest = Math.max(longest, streak)
  }
  return longest
}

for (const size of [1, REPULSOR_BOT_SIZE]) test(`Down boards a ladder from a deck sloping up to it, from the downhill side (size ${size})`, () => {
  // Scaffold III's roof rises to the right where its right ladder passes through. Stopped a hair left of the
  // ladder, a sideways check along the feet met the slope, so Down never boarded and Rbot stood there for good.
  for (const x of [1350, 1346, 1341.5, 1335]) {
    const run = createRun(builtin('scaffold3.jump-level.json')), p = run.player
    p.size = size; Object.assign(p, { x, y: 430, vx: 0, vy: 0 })
    for (let t = 0; t < .5; t += STEP) stepRun(run, NEUTRAL_INPUT)
    for (let t = 0; t < 1; t += STEP) stepRun(run, { ...NEUTRAL_INPUT, descend: true })
    assert.equal(p.climbing?.kind, 'ladder', `boarded from ${x}`)
    assert.ok(p.y > 500, `climbing down from ${x}, at ${p.y}`)
  }
})

// Spots where the hunter used to stand for 20 to 54 seconds: above a ladder it could not board, beside a pool the
// player was knocked into, in a pull-up the controller kept turning back, hovering at its beat's end, at a ladder top.
const stalls = [['scaffold3.jump-level.json', 926, 500], ['08.json', 981, 860], ['Quarantine III.jump-level.json', 1734, 1015],
  ['Quarantine.jump-level.json', 1475, 1435], ['Quarantine II.jump-level.json', 1192, 1015]]
for (const [file, x, y] of stalls) test(`${file}: with the player standing at ${x}, ${y}, Rbot never stands about for long`, () => {
  const run = createRun(builtin(file))
  Object.assign(run.player, { x, y: y - 2, vx: 0, vy: 0 })
  const longest = longestIdle(run, 40)
  assert.ok(longest < 6, `stood still for ${longest.toFixed(1)} s`)
})

test('the hunt starts at once, from the entrance, without a sighting', () => {
  const file = blankTrial(); file.goal.x = 1700
  file.robots = [{ kind: 'repulsor', x: 1400, y: 920, left: 26, right: 1774 }]
  // The player has slipped into a sealed room; the entrance is empty.
  file.platforms = [{ x: 1300, y: 600, w: 20, h: 320 }, { x: 1300, y: 580, w: 300, h: 20 }, { x: 1600, y: 600, w: 20, h: 320 }]
  file.robots[0].x = 1000
  const run = createRun(file), bot = run.robots[0], from = bot.x
  Object.assign(run.player, { x: 1450, y: 920, vx: 0, vy: 0 })
  for (let t = 0; t < 1.5; t += STEP) stepRun(run, NEUTRAL_INPUT)
  assert.equal(botLastSighting(bot), undefined, 'map knowledge is not a sighting')
  assert.equal(bot.phase, 'chase')
  assert.ok(bot.x < from - 150, `it set off toward where the player came in: ${bot.x}`)
})

test('a collected pickup chimes: heard nearby, not from far off or through walls', () => {
  for (const [botX, wall, heard] of [[700, false, true], [700 + PICKUP_NOISE_RANGE + 60, false, false], [700, true, false]]) {
    const file = blankTrial(); file.goal.x = 1700
    file.robots = [{ kind: 'repulsor', x: botX, y: 920, left: 26, right: 1774 }]
    file.pickups = [{ kind: 'coin', x: 400, y: 900 }]
    if (wall) file.platforms = [{ x: 550, y: 300, w: 20, h: 620 }, { x: 600, y: 300, w: 20, h: 620 }, { x: 650, y: 300, w: 20, h: 620 }]
    const run = createRun(file), bot = run.robots[0]
    Object.assign(run.player, { x: 400, y: 920, vx: 0, vy: 0, crouching: true })
    // The player is placed on the coin, quietly; only the chime can give it away.
    run.activeTime += STEP; recordPlayerNoise(run, STEP)
    run.pickups[0].collectedAge = 0
    run.activeTime += STEP; recordPlayerNoise(run, STEP); hearPlayer(run, bot)
    assert.equal(botLastHeard(bot)?.kind === 'pickup', heard, `bot at ${botX}${wall ? ' behind walls' : ''}`)
  }
})

test('seeing a player run for the lit exit, the hunter gets ahead of them on the way', () => {
  const file = blankTrial(); file.goal = { ...file.goal, x: 1700, y: 920 }
  file.robots = [{ kind: 'repulsor', x: 1300, y: 920, left: 26, right: 1774 }]
  const run = createRun(file), bot = run.robots[0]
  for (let t = 0; t < .1; t += STEP) stepRun(run, NEUTRAL_INPUT)
  assert.ok(run.goalLit)
  const prediction = predictPlayer(run, bot, { x: 300, y: 920, vx: 410, vy: 0, time: run.activeTime }, true)
  assert.equal(prediction?.objective.kind, 'exit')
  assert.equal(prediction.kind, 'intercept')
  assert.ok(prediction.x > 300 && prediction.x < 1700, `it meets them between their spot and the exit, at ${prediction.x}`)
  assert.ok(prediction.botTime <= prediction.playerTime + .5, 'and gets there in time')
})

test('a player seen in the air is looked for where they come down', () => {
  const file = blankTrial(); file.robots = [{ kind: 'repulsor', x: 1300, y: 920, left: 26, right: 1774 }]
  const run = createRun(file)
  const down = landingOf(run, { x: 500, y: 600, vx: 200, vy: -300, time: 0, airborne: true })
  assert.ok(Math.abs(down.y - 920) < 1, `lands on the floor, at ${down.y}`)
  assert.ok(down.x > 500 && down.time > 0)
})

test('a player seen working up a wall is placed where they are, not where a fall from there would land', () => {
  // Slow is Smooth starts at the foot of an 80-wide chimney. Bracing and kicking between its walls, the player was
  // projected to the chimney floor, which the bot could reach: it chased a point in the air above it, at its foot.
  const run = createRun(builtin('04.json')), bot = run.robots.find(robot => robot.definition.kind === 'repulsor'), p = run.player
  for (let t = 0; t < .1; t += STEP) stepRun(run, NEUTRAL_INPUT)
  // The bot at the chimney's foot, looking up it; the player up the chimney, pressing toward the chalk face.
  Object.assign(bot.actor, { x: 40, y: 1590, vx: 0, vy: 0 }); Object.assign(bot, { x: 40, y: 1590 })
  Object.assign(p, { x: 60, y: 1250, vx: 0, vy: 0 })
  for (let t = 0; t < .6 && !(p.wallBrace?.active && bot.seesPlayer); t += STEP) stepRun(run, { ...NEUTRAL_INPUT, move: 1 })
  assert.ok(p.wallBrace?.active && bot.seesPlayer, 'the player braces on the chalk face, in view')
  const seen = botLastSighting(bot)
  assert.ok(seen?.walled, 'the bot saw them on the wall')
  assert.deepEqual(landingOf(run, seen), seen)
})

test('on Slow is Smooth the slope below the steep rise by the start is not a pit to the planner', () => {
  // Between the start and the long slope is a short rise too steep to stand on. Footing sampled every 140 fell on
  // the rise, leaving no takeoff near its foot, so no jump up it: everything below looked like a dead end, and a bot
  // that went down there after the player had no route out and dithered in the corner.
  const run = createRun(builtin('04.json')), bot = run.robots.find(robot => robot.definition.kind === 'repulsor')
  for (let t = 0; t < .1; t += STEP) stepRun(run, NEUTRAL_INPUT)
  Object.assign(bot.actor, { x: 60, y: 1590, vx: 0, vy: 0 }); Object.assign(bot, { x: 60, y: 1590 })
  for (const goal of [{ x: 1000, y: 1203 }, { x: 261, y: 460 }, { x: 1720, y: 760 }]) assert.ok(botCanReach(run, bot, goal), `a route from the corner to ${goal.x}, ${goal.y}`)
  // And it takes it, after a player standing up the slope.
  Object.assign(run.player, { x: 1100, y: 1173, vx: 0, vy: 0 })
  let best = 0
  for (let t = 0; t < 8; t += STEP) { stepRun(run, NEUTRAL_INPUT); best = Math.max(best, bot.actor.x) }
  assert.ok(best > 600, `it climbs out of the corner, getting to x ${Math.round(best)}`)
})

test('a deck whose only way down lands just past the floor below\'s end waypoint is not a trap', () => {
  // Scaffold I stacks two decks of the same span (860 to 1140, at 705 and 900) over a wider floor at 1085. Walking off
  // the upper deck's end lands a few units beyond the floor's end waypoint, which no drop accepted: the deck had no
  // way off, and a bot up there shuttled across it for 40 s while the player hid below.
  const run = createRun(builtin('scaffold1.jump-level.json')), bot = run.robots.find(robot => robot.definition.kind === 'repulsor')
  for (let t = 0; t < .1; t += STEP) stepRun(run, NEUTRAL_INPUT)
  Object.assign(bot.actor, { x: 1000, y: 705, vx: 0, vy: 0 }); Object.assign(bot, { x: 1000, y: 705 })
  assert.ok(botCanReach(run, bot, { x: 778, y: 1085 }), 'a route down from the upper deck')
})

test('moving a hidden, silent player changes nothing the hunter does until it actually finds them', () => {
  // Two runs alike but for where the player stands, out of sight and quiet: the bot's decisions must not differ
  // while neither player is seen, heard or physically met. Only fair evidence may steer the hunt.
  const level = () => {
    const file = blankTrial(); file.goal.x = 1700; file.entrance.x = 200
    file.robots = [{ kind: 'repulsor', x: 1500, y: 920, left: 26, right: 1774 }]
    // Two sealed rooms, one each side, roofed and walled.
    file.platforms = [{ x: 400, y: 600, w: 20, h: 320 }, { x: 400, y: 580, w: 300, h: 20 }, { x: 700, y: 600, w: 20, h: 320 },
      { x: 900, y: 600, w: 20, h: 320 }, { x: 900, y: 580, w: 300, h: 20 }, { x: 1200, y: 600, w: 20, h: 320 }]
    return createRun(file)
  }
  const a = level(), b = level()
  Object.assign(a.player, { x: 550, y: 920, vx: 0, vy: 0 }); Object.assign(b.player, { x: 1050, y: 920, vx: 0, vy: 0 })
  const [botA, botB] = [a.robots[0], b.robots[0]]
  let compared = 0
  for (let t = 0; t < 12; t += STEP) {
    stepRun(a, NEUTRAL_INPUT); stepRun(b, NEUTRAL_INPUT)
    if (botA.seesPlayer || botB.seesPlayer || botLastSighting(botA) || botLastSighting(botB) || botLastHeard(botA) || botLastHeard(botB)) break
    assert.equal(botA.x, botB.x, `the hunters parted at ${t.toFixed(2)} s`); assert.equal(botA.y, botB.y)
    compared++
  }
  assert.ok(compared > 120, 'the hunters were compared for a while before either found its player')
})

test('without weight too, an unseen player close behind changes nothing the hunter does', () => {
  // The weightless keep-away once read the player's position every step: a silent player floating just behind a
  // patrolling Rbot turned it seconds before it had any evidence of them.
  const hall = () => createRun(parseLevel({ ...blankTrial(), width: 2000, height: 1200, floor: 1200, entrance: { x: 120, y: 1200 }, goal: { x: 1900, y: 1200 },
    platforms: [{ x: 240, y: 0, w: 40, h: 1200 }], robots: [{ kind: 'repulsor', x: 1300, y: 1200, left: 500, right: 1700 }],
    gravityPlates: [{ id: 'z', x: 300, y: 0, w: 1700, h: 1200, gravity: 0, power: 'always' }] }))
  const near = hall(), far = hall(), [botNear, botFar] = [near.robots[0], far.robots[0]]
  for (let t = 0; t < .5; t += STEP) { stepRun(near, NEUTRAL_INPUT); stepRun(far, NEUTRAL_INPUT) }
  // Behind the bot, a little above its floor, out of its view; the other player stays walled off at the left.
  Object.assign(near.player, { x: botNear.x - botNear.facing * 100, y: 1110, vx: 0, vy: 0 })
  let compared = 0
  for (let t = 0; t < 6; t += STEP) {
    stepRun(near, NEUTRAL_INPUT); stepRun(far, NEUTRAL_INPUT)
    const evidence = botNear.seesPlayer || botLastSighting(botNear) || botLastHeard(botNear)
      || Math.hypot(botNear.x - near.player.x, botNear.y - near.player.y) < 60
    if (evidence) break
    assert.equal(botNear.x, botFar.x, `the hunters parted at ${t.toFixed(2)} s`); assert.equal(botNear.y, botFar.y)
    compared++
  }
  assert.ok(compared > 60, `compared for ${compared} steps before any evidence`)
})

test('a shot on level ground is dodged by jumping once the aim has locked, and lands on a player who stays put', () => {
  for (const jumpAt of [-1, .5, .6]) {
    const file = blankTrial(); file.goal.x = 1700; file.robots = [{ kind: 'repulsor', x: 700, y: 920, left: 26, right: 1774 }]
    const run = createRun(file), bot = run.robots[0]
    Object.assign(run.player, { x: 400, y: 920, vx: 0, vy: 0 })
    let windupAt
    for (let t = 0; t < 4 && !bot.shots; t += STEP) {
      if (bot.phase === 'windup') windupAt ??= t
      const jump = windupAt !== undefined && jumpAt >= 0 && t - windupAt >= jumpAt && t - windupAt < jumpAt + .2
      assert.ok(bot.phase !== 'windup' || !bot.actor.shove, 'a windup is never cut short by a shove')
      stepRun(run, { ...NEUTRAL_INPUT, jump })
    }
    assert.equal(bot.shots, 1, 'the windup ends in its shot')
    for (let i = 0; i < 3; i++) stepRun(run, NEUTRAL_INPUT)
    const hit = Math.abs(run.player.vx) > 300
    assert.equal(hit, jumpAt < 0, jumpAt < 0 ? 'a player who stays put is hit' : `a jump ${jumpAt} s into the windup clears the line`)
  }
})

test('a crate it cannot get over is shot out of its way, but not again and again', () => {
  // Exit I's crate sits in a low passage: Rbot used to press on it for good, then to shoot it back and forth.
  const run = createRun(builtin('exit1.jump-level.json')), bot = run.robots.find(robot => robot.definition.kind === 'repulsor')
  Object.assign(run.player, { x: 590, y: 1114, vx: 0, vy: 0 })
  const crate = run.props.find(prop => prop.kind === 'box'), times = []
  let pulses = 0
  for (let t = 0; t < 70; t += STEP) {
    stepRun(run, NEUTRAL_INPUT)
    if (run.gadgets.pulses.length > pulses) {
      const pulse = run.gadgets.pulses.at(-1)
      if (Math.hypot(pulse.to[0] - crate.x, pulse.to[1] - (crate.y - 40)) < 70) times.push(t)
    }
    pulses = run.gadgets.pulses.length
  }
  assert.ok(times.length >= 1, 'it clears the crate rather than press on it')
  for (let i = 1; i < times.length; i++) assert.ok(times[i] - times[i - 1] >= 30, `shot the crate at ${times.map(t => t.toFixed(1))}`)
})

test('a cornered player is not juggled: shoves at least a second apart, and fewer attacks once they stop working', () => {
  // Slow is Smooth: a player knocked into the bottom-left corner used to be shot and shoved every second or so.
  const run = createRun(builtin('04.json')), bot = run.robots.find(robot => robot.definition.kind === 'repulsor')
  Object.assign(run.player, { x: 562, y: 1294, vx: 0, vy: 0 })
  const shoveTimes = []
  let shoves = 0
  for (let t = 0; t < 26; t += STEP) {
    stepRun(run, NEUTRAL_INPUT)
    if ((bot.actor.shoves ?? 0) > shoves) shoveTimes.push(t)
    shoves = bot.actor.shoves ?? 0
  }
  for (let i = 1; i < shoveTimes.length; i++) assert.ok(shoveTimes[i] - shoveTimes[i - 1] >= 1, `shoves at ${shoveTimes.map(t => t.toFixed(2))}`)
  assert.ok((bot.shots ?? 0) + shoves <= 18, `${bot.shots} shots and ${shoves} shoves in 26 s`)
})
