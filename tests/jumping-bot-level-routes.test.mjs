import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseLevel } from '../src/games/jumping/level.ts'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { createPlayer, NEUTRAL_INPUT } from '../src/games/jumping/model.ts'
import { createRepulsorActor, botLastSighting, botLastHeard } from '../src/games/jumping/repulsorBot.ts'
import { botCanReach } from '../src/games/jumping/botNavigation.ts'

const fixture = name => parseLevel(JSON.parse(readFileSync(new URL(`./fixtures/jumping/${name}-rbot-routes.json`, import.meta.url), 'utf8').replace(/^\uFEFF/, '')))
const tick = run => stepRun(run, NEUTRAL_INPUT)
const rbot = run => run.robots.find(robot => robot.definition.kind === 'repulsor')

test('Uninvited Company investigates the known entrance before touring the upper platforms', () => {
  const run = createRun(fixture('uninvited')), bot = rbot(run)
  let reachedUpperShelf = false
  for (let frame = 0; frame < 720 && !bot.shots; frame++) {
    tick(run); reachedUpperShelf ||= bot.y <= 205
  }
  assert.equal(reachedUpperShelf, false, 'entrance knowledge replaces the long opening tour')
  assert.ok(botLastSighting(bot), 'the waiting player is eventually seen through actual line of sight')
  assert.ok(bot.shots, `stopped at ${bot.x}, ${bot.y}`)
  assert.ok(bot.x < 400, 'the hunter descends toward the entrance')
  assert.ok(bot.actor.grounded && bot.actor.contacts?.support?.collider.id !== 'player', 'it fires from real terrain rather than standing on the player')
  assert.ok(bot.y >= 1140 && bot.y <= 1160, 'it reaches the entrance floor or adjoining ramp')
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

test('Uninvited Company pursuit jumps off a rope onto the exit shelf', () => {
  const run = createRun(fixture('uninvited')), bot = rbot(run)
  bot.facing = 1; run.player = createPlayer({ x: 1120, y: 600 }); run.player.vy = -85
  tick(run); assert.ok(botLastSighting(bot))
  run.player = createPlayer({ x: 1550, y: 420 })
  let usedRope = false
  for (let frame = 0; frame < 900 && !bot.shots; frame++) {
    tick(run); usedRope ||= bot.actor.climbing?.kind === 'rope'
  }
  assert.ok(usedRope); assert.ok(bot.shots, `stopped at ${bot.x}, ${bot.y}`)
  assert.equal(bot.y, 420)
})

test('Aloft pursuit climbs the overlapping irregular platforms without dropping to the bottom', () => {
  const run = createRun(fixture('aloft')), bot = rbot(run)
  bot.facing = 1; run.player = createPlayer({ x: 600, y: 2700 }); run.player.vy = -85
  tick(run); assert.ok(botLastSighting(bot))
  run.player = createPlayer({ x: 900, y: 2720 })
  let landed = false, fell = false, gripped = false
  for (let frame = 0; frame < 650 && !landed; frame++) {
    tick(run); fell ||= bot.y > 2985; gripped ||= !!(bot.actor.hang || bot.actor.mantle)
    landed = bot.actor.grounded && bot.y === 2720
  }
  assert.equal(fell, false); assert.ok(gripped); assert.ok(landed)
})

test('Aloft rope handoffs connect the lower floor to successive upper surfaces', () => {
  const run = createRun(fixture('aloft')), bot = rbot(run)
  bot.actor = createRepulsorActor(1650, 3300); bot.x = 1650; bot.y = 3300
  for (const point of [{ x: 500, y: 2980 }, { x: 900, y: 2720 }, { x: 1000, y: 2220 }, { x: 700, y: 1975 }]) {
    assert.ok(botCanReach(run, bot, point), `missing route to ${point.x}, ${point.y}`)
  }
})

test('Aloft Rbot completes its first box mantle without stalling or dropping the grip', () => {
  const run = createRun(fixture('aloft')), bot = rbot(run), x = 1256, side = 1
  const box = run.props.find(prop => prop.kind === 'box' && !prop.gadget), startX = box.x
  bot.actor = createRepulsorActor(x, 3288)
  Object.assign(bot.actor, { grounded: false, vy: 180, vx: side * 30 })
  bot.x = x; bot.y = 3288; bot.facing = side
  run.player = createPlayer({ x: 1850, y: 3300 })
  let caught = false, pulling = false, landed = false, previous = -1
  for (let frame = 0; frame < 180 && !landed; frame++) {
    tick(run)
    const actor = bot.actor
    caught ||= !!actor.hang
    if (actor.mantle) {
      assert.ok(actor.mantle.time > previous, 'the pull-up keeps advancing each step')
      previous = actor.mantle.time; pulling = true
    }
    landed = actor.grounded && Math.abs(actor.y - (box.y - box.size)) < 1
    if (caught && !landed) assert.ok(actor.hang || actor.mantle, 'the first catch must finish without dropping')
  }
  assert.ok(caught && pulling && landed, `stopped at ${bot.x}, ${bot.y}`)
  assert.ok(Math.abs(box.x - startX) < .01, 'the mantle cannot shove its own supporting box')
})

test('Rbot traverses a ball beside the Aloft box instead of remaining wedged between them', () => {
  const file = fixture('aloft')
  Object.assign(file.props.find(prop => prop.kind === 'ball'), { x: 1200, y: 3300, size: 100 })
  const run = createRun(file), bot = rbot(run)
  bot.actor = createRepulsorActor(1200, 3200); bot.x = 1200; bot.y = 3200; bot.facing = 1
  run.player = createPlayer({ x: 1850, y: 3300 })
  let longestGrip = 0, gripFrames = 0
  for (let frame = 0; frame < 600 && bot.x < 1400; frame++) {
    tick(run); gripFrames = bot.actor.hang || bot.actor.mantle ? gripFrames + 1 : 0
    longestGrip = Math.max(longestGrip, gripFrames)
  }
  assert.ok(bot.x >= 1400, `stopped at ${bot.x}, ${bot.y}`)
  assert.ok(longestGrip < 240, 'a catch cannot become an indefinite frozen pull-up')
})

for (const startX of [400, 510]) for (const clue of ['sighting', 'known entrance behind a red door']) test(`Aloft Rbot catches the last rope and enters the upper structure (${startX}, ${clue})`, () => {
  const file = fixture('aloft')
  if (clue !== 'sighting') file.entrance = { x: 1020, y: 1115 }
  const run = createRun(file), bot = rbot(run)
  bot.actor = createRepulsorActor(startX, 1690); bot.x = startX; bot.y = 1690; bot.facing = 1
  if (clue === 'sighting') {
    run.player = createPlayer({ x: 940, y: 1300 })
    tick(run); assert.ok(botLastSighting(bot), 'pursuit begins from a real sighting below the structure')
  }
  run.player = createPlayer({ x: 1020, y: 1115 })
  let caught = false, climbed = false, entered = false, opened = false, runup = false, fell = false, caughtFrame = -1
  let maxAirSpeed = 0
  for (let frame = 0; frame < 1500 && !entered; frame++) {
    const p = run.player, input = { ...NEUTRAL_INPUT }
    if (frame > 24) {
      input.move = p.x < 2050 ? 1 : 0
      input.jump = p.grounded && p.x > 1600 && p.x < 1650; input.jumpStrength = .5
    }
    stepRun(run, input); opened ||= !run.forceFields[0].active
    runup ||= bot.actor.grounded && bot.x < 480
    if (!caught) {
      fell ||= bot.y > 1695
      if (!bot.actor.grounded && !bot.actor.climbing) maxAirSpeed = Math.max(maxAirSpeed, Math.abs(bot.actor.vx))
    }
    if (!caught && bot.actor.climbing?.kind === 'rope' && bot.actor.climbing.index === 0) { caught = true; caughtFrame = frame }
    climbed ||= caught && bot.y < 1200
    entered = bot.actor.grounded && bot.x > 1120 && bot.y > 1100 && bot.y < 1140
  }
  assert.ok(opened && caught && climbed && entered, `stopped at ${bot.x}, ${bot.y}`)
  assert.ok(caughtFrame < 360, `catch should succeed on the first attempt: frame ${caughtFrame}`)
  assert.equal(fell, false, 'the first rope jump must not drop back to a lower platform')
  assert.ok(maxAirSpeed > 450, 'Rbot uses its horizontal airborne speed advantage')
  if (startX === 510) assert.ok(runup, 'a slow arrival beside the lip backs up for a running jump')
})

test('Aloft continues hunting up the next rope and onto the higher irregular shelf', () => {
  const run = createRun(fixture('aloft')), bot = rbot(run)
  bot.facing = 1; run.player = createPlayer({ x: 600, y: 2700 }); run.player.vy = -85
  tick(run); assert.ok(botLastSighting(bot))
  run.player = createPlayer({ x: 700, y: 1975 })
  let landed = false, usedRope = false, fellToBottom = false
  for (let frame = 0; frame < 2100 && !landed; frame++) {
    tick(run); usedRope ||= bot.actor.climbing?.kind === 'rope'; fellToBottom ||= bot.y > 2985
    landed = bot.actor.grounded && bot.y === 1975
  }
  assert.ok(usedRope); assert.equal(fellToBottom, false); assert.ok(landed, `stopped at ${bot.x}, ${bot.y}`)
})

test('Aloft plans and completes the near-apex handhold onto the 285-unit higher shelf', () => {
  const run = createRun(fixture('aloft')), bot = rbot(run)
  bot.actor = createRepulsorActor(700, 1975); bot.x = 700; bot.y = 1975; bot.facing = -1
  run.player = createPlayer({ x: 600, y: 1710 }); run.player.vy = -85
  tick(run); assert.ok(botLastSighting(bot))
  run.player = createPlayer({ x: 300, y: 1690 })
  assert.ok(botCanReach(run, bot, { x: 400, y: 1690 }))
  let landed = false, gripped = false, fell = false
  for (let frame = 0; frame < 1200 && !landed; frame++) {
    tick(run); gripped ||= !!(bot.actor.hang || bot.actor.mantle); fell ||= bot.y > 1980
    landed = bot.actor.grounded && bot.y === 1690
  }
  assert.ok(gripped); assert.equal(fell, false); assert.ok(landed, `stopped at ${bot.x}, ${bot.y}`)
})

test('Aloft follows an ascending sighting into a real rope search without learning the hidden player position', () => {
  const run = createRun(fixture('aloft')), bot = rbot(run)
  bot.actor = createRepulsorActor(1650, 3300); bot.x = 1650; bot.y = 3300
  run.player = createPlayer({ x: 1235, y: 2940 }); run.player.vy = -85
  tick(run); const sighting = botLastSighting(bot); assert.ok(sighting)
  run.player = createPlayer({ x: 900, y: 2720 })
  let usedRope = false, landed = false
  for (let frame = 0; frame < 1200 && !landed; frame++) {
    const previous = botLastSighting(bot)
    tick(run); usedRope ||= bot.actor.climbing?.kind === 'rope'
    if (!bot.seesPlayer) assert.deepEqual(botLastSighting(bot), previous)
    landed = bot.actor.grounded && bot.y === 2720
  }
  assert.ok(usedRope); assert.ok(landed, `stopped at ${bot.x}, ${bot.y}`)
})

test('Aloft player can lure Rbot into the upper structure and close its red entrance field', () => {
  const run = createRun(fixture('aloft')), bot = rbot(run)
  bot.actor = createRepulsorActor(940, 1165); bot.actor.grounded = false; bot.x = 940; bot.y = 1165
  run.player = createPlayer({ x: 1020, y: 1115 })
  let stage = 0, wait = 0, trapped = 0, opened = false
  for (let frame = 0; frame < 1800 && trapped < 360; frame++) {
    const p = run.player, input = { ...NEUTRAL_INPUT }
    if (stage === 0 && ++wait > 24) stage = 1
    if (stage === 1) {
      input.move = p.x < 1500 ? 1 : 0
      if (bot.x > 1120 && bot.actor.grounded && bot.y > 1100) stage = 2
    }
    if (stage === 2) {
      input.move = Math.max(-1, Math.min(1, (1020 - p.x) / 100))
      input.jump = p.grounded && p.x > bot.x && p.x - bot.x < 150
      input.jumpStrength = .5
      if (Math.abs(p.x - 1020) < 8 && p.grounded) { stage = 3; wait = 0 }
    }
    if (stage === 3) {
      input.move = Math.max(-.3, Math.min(.3, (1020 - p.x) / 30))
      if (run.forceFields[0].active && ++wait > 12) stage = 4
    }
    if (stage === 4) { input.move = -1; input.climb = true; if (p.x < 935) stage = 5 }
    if ((stage === 1 || stage === 2) && bot.phase === 'windup' && bot.time > .55 && p.grounded) {
      input.jump = true; input.jumpStrength = .5
    }
    if (stage === 5) {
      trapped++
      assert.ok(run.forceFields[0].active); assert.ok(bot.x > 977 && bot.x < 2440 && bot.y < 1140)
    }
    stepRun(run, input); opened ||= !run.forceFields[0].active
  }
  assert.ok(opened); assert.ok(botLastHeard(bot)); assert.ok(botLastSighting(bot))
  assert.equal(stage, 5, `lure stopped at stage ${stage}, player ${run.player.x}, bot ${bot.x}, ${bot.y}`)
  assert.equal(trapped, 360, 'the player escapes while the ordinary red fields contain the bot')
})

test('Aloft Rbot leaves the upper structure to search after losing the player through an open exit', () => {
  const run = createRun(fixture('aloft')), bot = rbot(run)
  run.player = createPlayer({ x: 1020, y: 1115 })
  for (let frame = 0; frame < 25; frame++) tick(run)
  assert.equal(run.forceFields[0].active, false, 'the physical toggle opens the exit')
  bot.actor = createRepulsorActor(1200, 1115); bot.x = 1200; bot.y = 1115; bot.facing = -1
  tick(run); const memory = botLastSighting(bot); assert.ok(memory)
  assert.ok(botCanReach(run, bot, { x: 400, y: 1690 }), 'the graph must contain a return route down the rope')
  // Move behind cover to isolate the search decision. No new sound, velocity
  // or hidden coordinates are supplied to the bot after its actual sighting.
  run.player = createPlayer({ x: 400, y: 1690 })
  let left = false, searching = false, landed = false
  for (let frame = 0; frame < 1200 && !landed; frame++) {
    const before = botLastSighting(bot)
    tick(run); searching ||= bot.phase === 'chase' && !bot.seesPlayer
    if (!bot.seesPlayer) assert.deepEqual(botLastSighting(bot), before)
    left ||= bot.x < 960 && bot.y > 1300
    landed = bot.actor.grounded && bot.y === 1690
  }
  assert.ok(searching && left && landed, `waited at ${bot.x}, ${bot.y}`)
  assert.ok(botLastSighting(bot).time > memory.time, 'the search physically reacquires the player below')
})
