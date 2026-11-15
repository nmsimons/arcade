import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { blankTrial, parseLevel } from '../src/games/jumping/level.ts'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { createPlayer, NEUTRAL_INPUT, passesThrough, STEP, stepPlayer, TUNING } from '../src/games/jumping/model.ts'
import { playerContactBody, staticContactWorld } from '../src/games/jumping/playerContacts.ts'
import { bodySize } from '../src/games/jumping/sizeFrame.ts'
import { createRope } from '../src/games/jumping/climbables.ts'
import { REPULSOR_BOT_SIZE } from '../src/games/jumping/repulsorBotRig.ts'
import { createRepulsorActor } from '../src/games/jumping/repulsorBot.ts'

// Rbot hunting in ways that used to leave it stranded or glitching: overshooting a long drop, letting go of the
// ledge out of the water, letting go of a rope out of shallow water, sharing a rope with the player, and a ledge
// under a low ceiling.
const quarantine = () => parseLevel(JSON.parse(readFileSync(new URL('./fixtures/jumping/quarantine-ii-rbot-water.json', import.meta.url), 'utf8')))
const scaffold = () => parseLevel(JSON.parse(readFileSync(new URL('./fixtures/jumping/scaffold-ii-rbot-water.json', import.meta.url), 'utf8')))
const tick = run => stepRun(run, NEUTRAL_INPUT)
const moved = (run, spot) => Math.hypot(run.player.x - spot.x, run.player.y - spot.y) > 30

test('Quarantine II: Rbot drops from its deck onto the floor below, not past it into the pool, and gets the player', () => {
  const run = createRun(quarantine()), bot = run.robots[0], spot = { x: 1670, y: 1015 }
  run.player = createPlayer(spot)
  let wet = false, frame = 0
  // The drop is long: pushing on at full speed until overhead carried it past the floor and into the water.
  for (; frame < 15 / STEP && !moved(run, spot); frame++) { tick(run); wet ||= !!bot.actor.waterMotion }
  assert.ok(moved(run, spot), `the player was never hit; Rbot at ${bot.x}, ${bot.y}`)
  assert.equal(wet, false, 'it lands on the floor beside the pool')
})

test('Quarantine II: knocked into the gap beside the floor, Rbot climbs out by the floor\'s ledge and gets the player', () => {
  const run = createRun(quarantine()), bot = run.robots[0], spot = { x: 1600, y: 1015 }
  // From the end of its deck it hears the player hopping below and jumps down toward them.
  bot.actor = createRepulsorActor(1740, 490); bot.x = 1740; bot.y = 490; bot.facing = 1; bot.actor.facing = 1
  run.player = createPlayer(spot)
  let jumped = false, pushed = false, wet = 0, climbed = false, hit = false
  for (let frame = 0; frame < 25 / STEP && !hit; frame++) {
    const t = frame * STEP
    stepRun(run, { ...NEUTRAL_INPUT, jump: t < 3 && t % 1 < .1, jumpStrength: 1 })
    const actor = bot.actor
    jumped ||= !actor.grounded && actor.vy < -200 && bot.y < 500
    // Carry it past the floor's end into the narrow water beside the wall, as an overshot jump did.
    if (!pushed && jumped && actor.vy > 0) { actor.vx = 900; pushed = true }
    if (actor.waterMotion) wet += STEP
    climbed ||= wet > 0 && !!(actor.hang || actor.mantle)
    hit = t > 3.5 && run.player.grounded && Math.abs(run.player.x - spot.x) > 30
  }
  assert.ok(pushed && wet > 0, 'it fell into the water')
  assert.ok(climbed, 'it climbed out by a ledge')
  assert.ok(hit, `it never got the player; Rbot is at ${bot.x}, ${bot.y}`)
  assert.ok(wet < 8, `it swam for ${wet.toFixed(1)} s before climbing out`)
})

test('Scaffold II: standing in the shallows at the bottom, Rbot climbs the recovery rope out rather than letting go of it', () => {
  const run = createRun(scaffold()), bot = run.robots[0], spot = { x: 300, y: 1375 }
  // The floor's water only wades it, but off its feet it counted as swimming, and a swimmer's way out was the
  // floor right under the rope: it let go as soon as it took hold, again and again.
  bot.actor = createRepulsorActor(200, 2050); bot.x = 200; bot.y = 2050
  run.player = createPlayer(spot)
  let catches = 0, holding = false, frame = 0
  for (; frame < 15 / STEP && !moved(run, spot); frame++) {
    tick(run)
    if (bot.actor.climbing?.rope && !holding) catches++
    holding = !!bot.actor.climbing?.rope
  }
  assert.equal(catches, 1, 'it took hold of the rope once and climbed it')
  assert.ok(moved(run, spot), `it never got the player on the base above; Rbot is at ${bot.x}, ${bot.y}`)
})

test('two bodies on one rope keep to their own stretches of it, and neither shoves the other', () => {
  // Stepped as the game steps the player and Rbot (challenge.ts, repulsorBot.ts): the player's step moves the
  // rope with its own load, Rbot rides it, and each sees the other's body unless they share the rope.
  const terrain = [{ x: 0, y: 1000, w: 1600, h: 100 }, { x: 600, y: 300, w: 400, h: 25 }]
  const climbables = { ladders: [], ropes: [{ x: 600, y: 305, length: 560, segments: 70 }] }
  const player = createPlayer({ x: 600, y: 470 }), bot = createPlayer({ x: 600, y: 760 }); bot.size = REPULSOR_BOT_SIZE
  player.ropes = climbables.ropes.map(createRope); bot.ropes = player.ropes
  const rules = { checkpoints: [], fallY: Infinity }, still = staticContactWorld(terrain)
  const shape = p => {
    const body = playerContactBody(p), width = TUNING.width * bodySize(p)
    return { x: body.x - width / 2, y: body.y - body.height, w: width, h: body.height }
  }
  // The rope wraps terrain only, never a body (challenge.ts ropePlatforms).
  still.ropePlatforms = terrain
  const seeing = (world, collider) => {
    const colliders = [...world.colliders, collider]
    return { platforms: colliders.map(c => c.platform), colliders, ropePlatforms: terrain }
  }
  let together = 0, worst = 0, closest = Infinity
  for (let frame = 0; frame < 8 / STEP; frame++) {
    const t = frame * STEP, before = [player.x, player.y, bot.x, bot.y]
    const botWorld = passesThrough(bot, player) ? still : seeing(still, { id: 'player', platform: shape(player) })
    stepPlayer(bot, { ...NEUTRAL_INPUT, climb: t < .2 || t > 1 }, STEP, botWorld.platforms, climbables, rules, botWorld,
      undefined, undefined, 1, undefined, { advanceRopes: false, ropeRiders: [player] })
    const playerWorld = passesThrough(player, bot) ? still : seeing(still, { id: 'robot:0', robot: {}, platform: shape(bot) })
    // The player catches the rope, then slides down onto Rbot and climbs back up, swinging all the while.
    stepPlayer(player, { ...NEUTRAL_INPUT, climb: t < .2 || t > 5.5, descend: t > 2.5 && t < 5.5, move: t > 1.5 ? Math.sign(Math.sin(t * 2.5)) : 0 },
      STEP, playerWorld.platforms, climbables, rules, playerWorld, undefined, undefined, 1, undefined, { ropeRiders: [bot] })
    if (frame > 30) worst = Math.max(worst, Math.hypot(player.x - before[0], player.y - before[1]), Math.hypot(bot.x - before[2], bot.y - before[3]))
    if (player.climbing?.rope && bot.climbing?.rope) {
      together += STEP
      closest = Math.min(closest, bot.climbing.distance - player.climbing.distance)
    }
  }
  assert.ok(together > 6, `they shared the rope for ${together.toFixed(1)} s`)
  // The player's feet hang 66 below its grip; Rbot's hands hold no higher than there.
  assert.ok(closest >= 66 - 1e-6, `Rbot's grip came within ${closest.toFixed(1)} of the player's`)
  assert.ok(worst < 1200 * STEP, `a body jumped ${worst.toFixed(1)} in a frame on the rope`)
})

test('under a low ceiling, where any hop would hit the rock, Rbot walks off the ledge to reach lower footing', () => {
  const k = REPULSOR_BOT_SIZE, file = blankTrial(); file.width = 1600; file.goal.x = 1500; file.entrance.x = 1550
  // A shelf under a rock roof that leaves only a little headroom over Rbot, with the player hidden beneath it.
  file.platforms = [{ x: 0, y: 700, w: 800, h: 30 }, { x: 0, y: 700 - TUNING.height * k - 50, w: 1600, h: 30 }]
  file.robots = [{ kind: 'repulsor', x: 300, y: 700, left: 26, right: 1574 }]
  const run = createRun(file), bot = run.robots[0], spot = { x: 400, y: 920 }
  run.player = createPlayer(spot)
  let jumped = false, frame = 0
  for (; frame < 12 / STEP && !moved(run, spot); frame++) { tick(run); jumped ||= !!bot.actor.jumpLift || bot.actor.vy < -200 }
  assert.ok(moved(run, spot), `Rbot never reached the player below; it is at ${bot.x}, ${bot.y}`)
  assert.equal(jumped, false, 'it never jumped into the roof')
})
