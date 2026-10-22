import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial, parseLevel } from '../src/games/jumping/level.ts'
import { createRun, createPreviewRun, stepRun } from './helpers/jumping-active-run.mjs'
import { createPlayer, NEUTRAL_INPUT, STEP, stepPlayer } from '../src/games/jumping/model.ts'
import { addItem, duplicateItem, moveItem } from '../src/games/jumping/editor.ts'
import { defaultObjectLabel } from '../src/games/jumping/objectLabels.ts'
import { repulseRobot, robotPlatforms, robotTouchesPlayer } from '../src/games/jumping/robotPhysics.ts'
import { botLastSighting, repulsePlayer, REPULSOR_BOT_WINDUP } from '../src/games/jumping/repulsorBot.ts'
import { bodyIntersects } from '../src/games/jumping/geometry.ts'
import { createForceField } from '../src/games/jumping/forceField.ts'
import { playerContactBody } from '../src/games/jumping/playerContacts.ts'
import { repulsorBotPose, REPULSOR_BOT_WIDTH_SCALE } from '../src/games/jumping/repulsorBotRig.ts'
import { presentedAthletePose } from '../src/games/jumping/athlete.ts'
import { botCanReach, botMovement, botNavigationGraph } from '../src/games/jumping/botNavigation.ts'
import { chooseBotTactic } from '../src/games/jumping/botTactics.ts'
import { climbRoot, createRope } from '../src/games/jumping/climbables.ts'
import { translatePlayer } from '../src/games/jumping/playerContacts.ts'

const tick = (run, count = 1, input = {}) => { for (let i = 0; i < count; i++) stepRun(run, { ...NEUTRAL_INPUT, ...input }) }
function level() {
  const next = blankTrial(); next.goal.x = 1700
  next.robots = [{ kind: 'repulsor', x: 700, y: 920, left: 26, right: 1774 }]
  return next
}

test('repulsorbot authoring preserves legacy bots, kind, copy, move, labels, and preview rig', () => {
  const original = blankTrial(), placed = addItem(original, 'repulsorbot', { x: 700, y: 920 }, { x: 700, y: 920 }).level
  assert.equal(original.robots.length, 0)
  assert.equal(placed.robots[0].kind, 'repulsor')
  assert.equal(defaultObjectLabel(placed, { kind: 'robot', index: 0 }), 'Repulsorbot 1')
  assert.equal(parseLevel(JSON.parse(JSON.stringify(placed))).robots[0].kind, 'repulsor')
  assert.equal(duplicateItem(placed, { kind: 'robot', index: 0 }).level.robots[1].kind, 'repulsor')
  assert.equal(moveItem(placed, { kind: 'robot', index: 0 }, 30, 0).robots[0].y, 920)
  assert.ok(createPreviewRun(placed).robots[0].actor)
  assert.equal(parseLevel({ ...placed, robots: [{ ...placed.robots[0], kind: undefined }] }).robots[0].kind, undefined)
  assert.throws(() => parseLevel({ ...placed, robots: [{ ...placed.robots[0], kind: 'laser' }] }))
})

test('the bot visibly winds up, fires a strong impulse without teleporting the player, then recovers', () => {
  const run = createRun(level()), bot = run.robots[0]
  tick(run)
  assert.equal(bot.phase, 'windup'); assert.equal(bot.shots ?? 0, 0)
  tick(run, Math.floor(REPULSOR_BOT_WINDUP / STEP) - 2)
  assert.equal(bot.shots ?? 0, 0)
  const before = run.player.x
  for (let i = 0; i < 5 && !bot.shots; i++) {
    const x = run.player.x; tick(run)
    assert.ok(Math.abs(run.player.x - x) < 12, 'each displacement is one swept velocity step')
  }
  assert.equal(bot.shots, 1); assert.equal(bot.phase, 'recover')
  assert.ok(run.player.vx < -800)
  tick(run, 35)
  assert.ok(run.player.x < before - 80)
  assert.equal(bot.shots, 1, 'recovery offers time before another shot')
})

test('the final windup locks aim, so jumping after the tell dodges the pulse', () => {
  const run = createRun(level()), bot = run.robots[0]
  tick(run, 60)
  const aim = bot.aim, x = run.player.x
  tick(run, 1, { jump: true, jumpStrength: 1 }); tick(run, 60)
  assert.equal(bot.aim, aim)
  assert.equal(bot.shots, 1)
  assert.ok(Math.abs(run.player.x - x) < 1)
})

function ropeTargetRun(file = level()) {
  file.climbables.ropes = [{ x: 160, y: 200, length: 600, segments: 75 }]
  const run = createRun(file), player = run.player, rope = createRope(file.climbables.ropes[0])
  const climbing = { kind: 'rope', index: 0, distance: 300, time: 1, direction: 0, swing: 0, lean: 0, hangBlend: 1,
    swingVelocity: 0, ladder: null, rope, caught: { ...player } }
  const [x, y] = climbRoot(climbing, player.facing)
  Object.assign(player, { x, y, grounded: false, footwork: null, ropes: [rope], climbing })
  return run
}

test('Rbot stops chasing and shoots a high rope target beyond its usual approach distance', () => {
  const file = level(); file.robots[0].x = 900
  const run = ropeTargetRun(file), bot = run.robots[0], x = bot.x
  assert.ok(Math.abs(run.player.y - bot.y) > 240)
  assert.ok(Math.abs(run.player.x - bot.x) > 600)
  tick(run)
  assert.ok(bot.seesPlayer)
  assert.equal(bot.phase, 'windup')
  for (let frame = 0; frame < 120 && !bot.shots; frame++) {
    assert.equal(run.player.climbing?.kind, 'rope', 'the player stays attached until hit')
    tick(run)
    assert.ok(Math.abs(bot.x - x) < .01, 'a clear shot takes priority over following the rope route')
  }
  assert.equal(bot.shots, 1)
  assert.equal(run.player.climbing, null, 'the actual palm shot knocks the player off the rope')
  assert.ok(run.player.vx < -800)
})

for (const distraction of ['control', 'shovebot']) test(`a clear rope shot takes priority over a ${distraction} tactic`, () => {
  const file = level()
  if (distraction === 'control') {
    file.mechanisms = [{ id: 'cutoff', kind: 'gate', x: 950, y: 600, w: 20, h: 320, travel: 320, power: 'switched', switchReversed: true }]
    file.triggers = [{ x: 780, y: 920, w: 80, mode: 'touch', targets: ['cutoff'] }]
  } else file.robots.push({ x: 500, y: 920, left: 480, right: 520 })
  const run = ropeTargetRun(file), bot = run.robots[0], player = run.player
  const plan = chooseBotTactic(run, bot, { x: player.x, y: player.y, vx: 0, vy: 0, inverted: false, time: run.activeTime }, true, STEP)
  assert.equal(plan.kind, distraction === 'control' ? 'operate' : 'clear')
  tick(run)
  assert.equal(bot.phase, 'windup')
  assert.ok(bot.aim < -2.5, 'the palm aims up at the player instead of at the floor obstacle')
  for (let frame = 0; frame < 120 && !bot.shots; frame++) tick(run)
  assert.equal(bot.shots, 1)
  assert.equal(run.player.climbing, null)
  if (distraction === 'control') assert.equal(run.triggers[0].active, false)
  else assert.equal(run.robots[1].recoilVx ?? 0, 0)
})

for (const cover of ['terrain', 'red field']) test(`${cover} still prevents shooting a high rope target`, () => {
  const run = ropeTargetRun(), bot = run.robots[0]
  const barrier = { x: 400, y: 0, w: 20, h: 920 }
  if (cover === 'terrain') run.terrain.push(barrier)
  else run.forceFields.push(createForceField({ ...barrier, id: 'red', mode: 'objects', orientation: 'vertical' }))
  tick(run)
  assert.equal(bot.seesPlayer, cover === 'red field', 'red fields are transparent to sight')
  assert.notEqual(bot.phase, 'windup')
  assert.equal(bot.shots ?? 0, 0)
})

for (const kind of ['terrain', 'red field', 'prop']) test(`${kind} stops a locked shot and protects the player`, () => {
  const file = level(), run = createRun(file), bot = run.robots[0]
  tick(run, 60)
  if (kind === 'terrain') run.terrain.push({ x: 450, y: 700, w: 20, h: 220 })
  if (kind === 'red field') {
    const field = { id: 'red', mode: 'objects', orientation: 'vertical', x: 450, y: 700, w: 12, h: 220 }
    run.forceFields.push(createForceField(field))
  }
  if (kind === 'prop') {
    // Add before creation so the prop has its ordinary Matter body.
    const blocked = level(); blocked.props = [{ kind: 'box', x: 450, y: 920, size: 100 }]
    const second = createRun(blocked); tick(second, 200)
    assert.equal(second.robots[0].shots ?? 0, 0, 'solid cover prevents acquisition')
    assert.equal(second.player.x, 160); return
  }
  tick(run, 70)
  assert.equal(bot.shots, 1)
  assert.equal(run.player.x, 160)
})

test('EMP disables the humanoid, cancels its windup, and preserves its solid body', () => {
  const file = level(); file.props = [{ kind: 'box', gadget: 'emp', x: 190, y: 920, size: 40 }]
  const run = createRun(file), bot = run.robots[0]
  tick(run, 1, { interact: true }); tick(run); tick(run, 1, { use: true })
  for (let i = 0; i < 100 && !run.gadgets.disabled.has(bot); i++) tick(run)
  assert.ok(run.gadgets.disabled.has(bot)); assert.equal(bot.phase, 'recover')
  const x = bot.x, y = bot.y
  tick(run, 9 / STEP)
  assert.equal(bot.x, x); assert.equal(bot.y, y); assert.equal(bot.shots ?? 0, 0)
  assert.ok(run.gadgets.disabled.has(bot), 'the ten-second window remains active after nine seconds')
  assert.equal(bot.actor.heldTool, undefined, 'repulsors are built into the palms, not carried tools')
  assert.ok(robotPlatforms(bot).length)
  assert.ok(run.gadgets.held)
  tick(run, 1.1 / STEP)
  assert.equal(run.gadgets.disabled.has(bot), false)
})

test('a player repulsor interrupts the humanoid and moves it over successive physics steps', () => {
  const run = createRun(level()), bot = run.robots[0]
  tick(run, 20); const x = bot.x
  repulseRobot(bot, 1, run.player.x)
  assert.equal(bot.x, x); tick(run)
  assert.ok(bot.x > x && bot.x - x < 12)
  assert.equal(bot.phase, 'recover'); assert.equal(bot.shots ?? 0, 0)
})

test('autonomous patrol jumps over a raised obstruction using swept contacts and planted feet', () => {
  const file = level(); file.entrance.x = 1700; file.goal.x = 100
  file.robots[0] = { ...file.robots[0], x: 300, right: 1400 }
  file.platforms = [{ x: 450, y: 820, w: 100, h: 100 }]
  const run = createRun(file), bot = run.robots[0]; bot.facing = 1
  let airborne = false, reachedTop = false, planted = false
  for (let i = 0; i < 600; i++) {
    tick(run); airborne ||= !bot.actor.grounded
    reachedTop ||= !!(bot.actor.hang || bot.actor.mantle) || bot.actor.grounded && Math.abs(bot.y - 820) < 1
      || bot.x >= 450 && bot.x <= 550 && bot.actor.y <= 820
    planted ||= !!bot.actor.footwork?.feet.some(foot => foot.planted)
    const body = playerContactBody(bot.actor)
    if (!bot.actor.hang && !bot.actor.mantle) assert.equal(bodyIntersects(body.x, body.y, file.platforms[0], body.height), false, `frame ${i}: ${JSON.stringify(body)}`)
  }
  assert.ok(bot.x > 700); assert.ok(airborne); assert.ok(reachedTop); assert.ok(planted)
})

test('a repulsor impulse releases hand support and stops at solid walls through normal controls', () => {
  const file = level(); file.robots = []; file.platforms = [{ x: 200, y: 600, w: 20, h: 320 }]
  const run = createRun(file), actor = run.player
  actor.hang = { side: 1 }; actor.climbing = { kind: 'ladder' }
  repulsePlayer(actor, [1, 0])
  assert.equal(actor.hang, null); assert.equal(actor.climbing, null)
  tick(run, 120)
  assert.ok(actor.x <= 188.01)
  assert.equal(bodyIntersects(actor.x, actor.y, file.platforms[0]), false)
})

test('sight acquisition starts a persistent whole-level hunt, beyond legacy patrol limits', () => {
  const file = level(); file.robots[0].left = 650; file.robots[0].right = 750
  const run = createRun(file), bot = run.robots[0]
  tick(run, 60); assert.equal(bot.seesPlayer, true)
  run.terrain.push({ x: 400, y: 500, w: 20, h: 420 })
  tick(run, 1900)
  assert.equal(bot.seesPlayer, false)
  assert.equal(bot.phase, 'chase', 'losing sight for more than six seconds never clears acquisition')
  assert.ok(bot.x < 650, 'authored shovebot limits do not restrict the hunt')
  assert.equal(bot.shots, 1, 'it cannot keep shooting an occluded player')
})

for (const climb of ['ladder', 'rope']) test(`the bot finds a ${climb} route to a platform higher than its jump`, () => {
  const file = level(); file.entrance.x = 1700; file.goal.x = 100
  file.robots[0].x = 300
  file.platforms = [{ x: 620, y: 550, w: 450, h: 20 }, { x: 1500, y: 0, w: 30, h: 920 }]
  if (climb === 'ladder') file.climbables.ladders = [{ x: 600, top: 550, bottom: 920, side: 1, platform: 0 }]
  else file.climbables.ropes = [{ x: 600, y: 150, length: 770, segments: 97 }]
  const run = createRun(file), bot = run.robots[0]; bot.facing = 1
  let usedClimb = false, landed = false
  for (let i = 0; i < 6500 && !landed; i++) {
    tick(run); usedClimb ||= bot.actor.climbing?.kind === climb
    landed = bot.x > 620 && bot.x < 1070 && Math.abs(bot.y - 550) < .1 && bot.actor.grounded
  }
  assert.ok(usedClimb); assert.ok(landed)
  assert.ok(botNavigationGraph(run).nodes.length <= 160)
  if (climb === 'rope') assert.equal(bot.actor.ropes, run.player.ropes, 'the bot uses the visible shared rope')
})

test('broader rig proportions keep the same planted ankle positions as the player rig', () => {
  const file = level(); file.entrance.x = 1700; file.goal.x = 100; file.robots[0].x = 300
  file.platforms = [{ x: 1500, y: 0, w: 30, h: 920 }]
  const run = createRun(file), bot = run.robots[0]; bot.facing = 1
  let planted = 0
  for (let i = 0; i < 150; i++) {
    tick(run)
    const original = presentedAthletePose(bot.actor), scaled = repulsorBotPose(bot.actor)
    for (const name of ['frontLeg', 'backLeg']) if (original[name].planted) {
      planted++
      assert.ok(Math.abs(scaled[name].end[0] * REPULSOR_BOT_WIDTH_SCALE - original[name].end[0]) < 1e-9)
      assert.equal(scaled[name].end[1], original[name].end[1])
    }
  }
  assert.ok(planted > 10)
})

test('replanning a moving hunt never backs up to an old floor waypoint', () => {
  const file = level(); file.entrance.x = 1700; file.goal.x = 100
  const run = createRun(file), bot = run.robots[0]; bot.facing = 1
  let previous = bot.x
  for (let i = 0; i < 600 && !bot.shots; i++) {
    tick(run)
    assert.ok(bot.x >= previous - .01, `backtracked at frame ${i}: ${previous} → ${bot.x}`)
    previous = bot.x
  }
  assert.ok(bot.x > 1000)
  assert.ok(bot.shots)
})

for (const height of [40, 70, 100, 140, 180, 220, 240, 260]) test(`a ${height}-unit obstacle does not trap the bot in repeated climb transfers`, () => {
  const file = level(); file.entrance.x = 1700; file.goal.x = 100; file.robots[0].x = 300
  file.platforms = [{ x: 450, y: 920 - height, w: 160, h: height }, { x: 1500, y: 0, w: 30, h: 920 }]
  const run = createRun(file), bot = run.robots[0]; bot.facing = 1
  let longestTransfer = 0, transfer = 0
  for (let i = 0; i < 1800 && bot.x < 800; i++) {
    tick(run); transfer = bot.actor.hang || bot.actor.mantle ? transfer + STEP : 0
    longestTransfer = Math.max(longestTransfer, transfer)
  }
  assert.ok(bot.x > 800, `stuck at ${bot.x}, ${bot.y}`)
  assert.ok(longestTransfer < 2, 'a clear climb completes without cycling back into its entry')
})

test('leaving a rope does not reintroduce the humanoid body as an obstacle and fling the rope', () => {
  const file = level(); file.entrance.x = 1700; file.goal.x = 100; file.robots[0].x = 300
  file.platforms = [{ x: 620, y: 550, w: 450, h: 20 }, { x: 1500, y: 0, w: 30, h: 920 }]
  file.climbables.ropes = [{ x: 600, y: 150, length: 770, segments: 97 }]
  const run = createRun(file), bot = run.robots[0]; bot.facing = 1
  let climbing = false, released = false, peak = 0, framesAfterExit = 0
  for (let frame = 0; frame < 5500 && framesAfterExit < 90; frame++) {
    tick(run)
    const attached = bot.actor.climbing?.kind === 'rope'
    released ||= climbing && !attached
    if (released) {
      framesAfterExit++
      for (const node of run.player.ropes[0].nodes) peak = Math.max(peak, Math.hypot(node.x - node.oldX, node.y - node.oldY) / STEP)
    }
    climbing = attached
  }
  assert.equal(framesAfterExit, 90, 'the bot completes a real rope-to-ledge handoff')
  assert.ok(peak < 400, `exit velocity ${peak}; the body collision regression exceeded 1,100`)
})

test('cover preserves the last confirmed sighting; moving unseen cannot rewrite hunt knowledge', () => {
  const run = createRun(level()), bot = run.robots[0]
  tick(run, 60)
  const sighting = botLastSighting(bot)
  run.terrain.push({ x: 400, y: 0, w: 20, h: 920 })
  tick(run, 100, { move: -1 })
  assert.equal(bot.seesPlayer, false)
  assert.deepEqual(botLastSighting(bot), sighting)
  assert.equal(bot.phase, 'recover')
  tick(run, 600)
  assert.equal(bot.phase, 'chase')
  assert.deepEqual(botLastSighting(bot), sighting)
})

for (const mode of ['player', 'objects']) test(`${mode === 'player' ? 'blue lets Rbot through' : 'red contains Rbot'} throughout a sustained hunt`, () => {
  const file = level(); file.entrance.x = 1700; file.goal.x = 100; file.robots[0].x = 300
  file.forceFields = [{ id: 'field', mode, orientation: 'vertical', x: 500, y: 0, w: 12, h: 920 }]
  const run = createRun(file), bot = run.robots[0]; bot.facing = 1
  tick(run, 1200)
  if (mode === 'player') assert.ok(bot.x > 800)
  else { assert.ok(bot.x <= 488.01); assert.equal(run.forceFields[0].active, true) }
})

for (const kind of ['box', 'ball']) test(`Rbot climbs over a loose ${kind} without a pushing motor`, () => {
  const file = level(); file.entrance.x = 1700; file.goal.x = 100; file.robots[0].x = 300
  file.platforms = [{ x: 1500, y: 0, w: 30, h: 920 }]
  file.props = [{ kind, x: 500, y: 920, size: 100 }]
  const run = createRun(file), bot = run.robots[0]; bot.facing = 1
  let airborne = false
  for (let i = 0; i < 1600 && bot.x < 800; i++) { tick(run); airborne ||= !bot.actor.grounded }
  assert.ok(bot.x > 800); assert.ok(airborne)
  assert.ok(Math.abs(run.props[0].x - 500) < 4, `the ${kind} was displaced to ${run.props[0].x}`)
})

test('an alerted Rbot deliberately reaches a physical plate to close a relevant gate', () => {
  const file = level()
  file.mechanisms = [{ id: 'cutoff', kind: 'gate', x: 950, y: 600, w: 20, h: 320, travel: 320, power: 'switched', switchReversed: true }]
  file.triggers = [{ x: 780, y: 920, w: 80, mode: 'touch', targets: ['cutoff'] }]
  const run = createRun(file), bot = run.robots[0]
  tick(run, 20)
  assert.equal(run.triggers[0].active, false, 'it must physically reach the control')
  tick(run, 200)
  assert.ok(bot.x >= 780 && bot.x <= 860)
  assert.equal(run.triggers[0].active, true)
  assert.equal(run.mechanisms[0].active, false)
  const x = bot.x; tick(run, 120)
  assert.equal(bot.x, x, 'guarding the control holds its physical press')
})

test('Rbot can intentionally repulse plate cargo to disrupt a gate through ordinary wiring', () => {
  const file = level()
  file.mechanisms = [{ id: 'cutoff', kind: 'gate', x: 950, y: 600, w: 20, h: 320, travel: 320, power: 'switched' }]
  file.triggers = [{ x: 450, y: 920, w: 100, mode: 'weight', targets: ['cutoff'] }]
  file.props = [{ kind: 'box', x: 500, y: 920, size: 30 }]
  const run = createRun(file), bot = run.robots[0]
  bot.phase = 'recover'; bot.time = 0
  tick(run, 60)
  assert.equal(run.triggers[0].active, true)
  for (let i = 0; i < 350 && !bot.shots; i++) tick(run)
  assert.equal(bot.shots, 1)
  tick(run, 60)
  assert.ok(Math.abs(run.props[0].x - 500) > 50)
  assert.equal(run.triggers[0].active, false)
  assert.equal(run.mechanisms[0].active, false)
})

test('a low rope grip releases onto nearby footing instead of hanging in the waypoint deadband', () => {
  const file = level(); file.climbables.ropes = [{ x: 600, y: 300, length: 560, segments: 71 }]
  const run = createRun(file), bot = run.robots[0], actor = bot.actor, rope = createRope(file.climbables.ropes[0])
  Object.assign(actor, { x: 600, y: 907, grounded: false, ropes: [rope], climbing: {
    kind: 'rope', index: 0, distance: 540, time: 1, direction: 0, swing: 0, lean: 0, hangBlend: 1, swingVelocity: 0,
    ladder: null, rope, caught: { x: 600, y: 907 } } })
  let released = false
  for (let i = 0; i < 120; i++) {
    const input = botMovement(run, bot, STEP, { x: 1000, y: 920 })
    assert.equal(input.climb && input.descend, false, 'Up and Down never cancel each other')
    stepPlayer(actor, input, STEP, run.terrain, file.climbables, { checkpoints: [], fallY: Infinity })
    released ||= !actor.climbing
  }
  assert.ok(released); assert.ok(actor.grounded); assert.ok(actor.x > 650)
})

test('an unreachable last sighting starts an expanding search, and a stalled search chooses another route', () => {
  const file = level(); file.width = 3200; file.goal.x = 3100
  const run = createRun(file), bot = run.robots[0]
  const memory = { x: 200, y: 100, vx: 0, vy: 0, inverted: false, time: 0 }
  const goals = new Set()
  for (let frame = 0; frame < 2000; frame++) {
    run.activeTime += STEP
    const plan = chooseBotTactic(run, bot, memory, false, STEP)
    if (plan.kind === 'search') goals.add(`${plan.x}:${plan.y}`)
  }
  assert.ok(goals.size >= 3, `a stationary hunter must try other routes; visited ${goals.size}`)
  assert.equal(botLastSighting(bot), undefined, 'the planner cannot invent a sighting')
})

test('a lost player on another floor is found by searching a real climb route', () => {
  const file = level(); file.platforms = [{ x: 620, y: 390, w: 450, h: 20 }]
  file.climbables.ladders = [{ x: 600, top: 390, bottom: 920, side: 1, platform: 0 }]
  const run = createRun(file), bot = run.robots[0]
  tick(run, 20)
  assert.ok(botLastSighting(bot))
  translatePlayer(run.player, 850 - run.player.x, 390 - run.player.y)
  run.player.vx = 0; run.player.vy = 0
  let climbed = false, found = false
  for (let frame = 0; frame < 10000 && !found; frame++) {
    tick(run); climbed ||= !!bot.actor.climbing
    found = botLastSighting(bot)?.y === 390
  }
  assert.ok(climbed, 'search includes routes to other floors')
  assert.ok(found, `the search stopped at ${bot.x}, ${bot.y}`)
})

test('route reachability follows live red barriers and closed gates, while blue fields are traversable', () => {
  const file = level(); file.robots[0].x = 300
  file.forceFields = [{ id: 'barrier', mode: 'objects', orientation: 'vertical', x: 650, y: 0, w: 12, h: 920 }]
  const run = createRun(file), bot = run.robots[0], goal = { x: 1000, y: 920 }
  assert.equal(botCanReach(run, bot, goal), false)
  run.forceFields[0].active = false
  assert.equal(botCanReach(run, bot, goal), true)
  run.forceFields[0].active = true; run.forceFields[0].definition.mode = 'player'
  assert.equal(botCanReach(run, bot, goal), true)
  run.mechanisms.push({ definition: { id: 'gate', kind: 'gate', x: 650, y: 0, w: 20, h: 920 }, x: 650, y: 0 })
  assert.equal(botCanReach(run, bot, goal), false)
  run.mechanisms[0].y = -920
  assert.equal(botCanReach(run, bot, goal), true)
})

test('a red field across the floor causes a real ladder detour instead of an endless blocked approach', () => {
  const file = level(); file.entrance.x = 1000; file.goal.x = 100; file.robots[0].x = 300
  file.platforms = [{ x: 400, y: 500, w: 800, h: 20 }]
  file.climbables.ladders = [{ x: 380, top: 500, bottom: 920, side: 1, platform: 0 }]
  file.forceFields = [{ id: 'barrier', mode: 'objects', orientation: 'vertical', x: 650, y: 650, w: 12, h: 270 }]
  const run = createRun(file), bot = run.robots[0]; bot.facing = 1
  tick(run); assert.ok(bot.seesPlayer, 'the field is transparent to sight but blocks the palm shot')
  let climbed = false
  for (let frame = 0; frame < 6500 && bot.x < 900; frame++) { tick(run); climbed ||= !!bot.actor.climbing }
  assert.ok(climbed); assert.ok(bot.x > 900, `blocked at ${bot.x}, ${bot.y}`)
})

test('Rbot jumps over a shovebot during patrol without the bots walking through each other', () => {
  const file = level(); file.entrance.x = 1700; file.goal.x = 200
  file.platforms = [{ x: 1500, y: 0, w: 30, h: 920 }]
  file.robots = [{ x: 550, y: 920, left: 500, right: 650 }, { kind: 'repulsor', x: 300, y: 920, left: 26, right: 1774 }]
  const run = createRun(file), [shove, bot] = run.robots; bot.facing = 1
  let jumped = false, overlap = 0
  for (let frame = 0; frame < 1800 && bot.x < 850; frame++) {
    tick(run); jumped ||= !bot.actor.grounded
    if (Math.abs(bot.y - shove.y) < 15 && Math.abs(bot.x - shove.x) < 30) overlap++
  }
  assert.ok(bot.x > 850, `blocked at ${bot.x}, ${bot.y}`); assert.ok(jumped); assert.equal(overlap, 0)
})

test('an alerted Rbot repulses a shovebot blocking its last-seen route, then continues the hunt', () => {
  const file = level(); file.robots[0].x = 700
  const run = createRun(file), bot = run.robots[0]
  tick(run, 10); assert.ok(botLastSighting(bot))
  const shove = { definition: { x: 500, y: 920, left: 480, right: 520 }, x: 500, y: 920, vx: 0, angle: 0,
    facing: 1, phase: 'recover', time: -10, seesPlayer: false }
  run.robots.unshift(shove)
  bot.phase = 'chase'; bot.time = 0
  assert.equal(chooseBotTactic(run, bot, botLastSighting(bot), false, 1).kind, 'clear')
  const start = shove.x
  let continued = false
  for (let frame = 0; frame < 1100; frame++) {
    tick(run)
    continued ||= bot.x < 450
  }
  assert.ok(shove.x < start - 50, 'the palm shot actually displaces the blocker')
  assert.ok(shove.deactivated, 'force carries the shovebot beyond its range')
  assert.ok(continued, `the hunter stayed at ${bot.x}, ${bot.y}`)
})

for (const mirror of [false, true]) test(`an irregular overlapping ledge approach brakes before its lip and completes the next jump (${mirror ? 'left' : 'right'})`, () => {
  const x = value => mirror ? 1800 - value : value, file = level()
  file.platforms = [
    { x: 680, y: 340, w: 530, h: 55, polygon: [[0,0],[530,0],[530,15],[450,25],[405,25],[375,55],[345,30],[265,45],[120,50],[30,35],[0,15]] },
    { x: 205, y: 600, w: 530, h: 220, polygon: [[0,0],[530,0],[530,15],[455,15],[375,30],[330,70],[315,130],[290,220],[280,145],[255,95],[210,25],[145,15],[80,20],[0,15]] },
  ]
  if (mirror) file.platforms = file.platforms.map(p => ({ ...p, x: 1800 - p.x - p.w, polygon: p.polygon.map(([px, py]) => [p.w - px, py]).reverse() }))
  file.entrance = { x: x(600), y: 600 }; file.robots[0] = { ...file.robots[0], x: x(396), y: 600 }
  const run = createRun(file), bot = run.robots[0]; bot.facing = mirror ? -1 : 1
  tick(run, 10); assert.ok(botLastSighting(bot))
  run.player = createPlayer({ x: x(850), y: 340 })
  let landed = false, fellOff = false
  for (let frame = 0; frame < 1800 && !landed; frame++) {
    tick(run); fellOff ||= bot.y > 605
    landed = bot.actor.grounded && Math.abs(bot.y - 340) < .1
  }
  assert.equal(fellOff, false, 'the setup waypoint must not coast over the lower lip')
  assert.ok(landed, `missed the irregular ledge at ${bot.x}, ${bot.y}`)
})

for (const offset of [-40, 40]) for (const direction of [-1, 1]) test(`a midair player collision cannot leave Rbot hanging from a vanished body (${offset}, ${direction})`, () => {
  const file = level(); file.robots[0].x = 700
  const run = createRun(file), bot = run.robots[0]
  run.player = createPlayer({ x: 700 - direction * 80, y: 500 + offset })
  Object.assign(run.player, { vx: direction * 400, vy: 50, grounded: false })
  Object.assign(bot.actor, { x: 700, y: 500, vx: -direction * 400, vy: -50, grounded: false })
  bot.x = 700; bot.y = 500; bot.facing = -direction
  let touched = false, landed = false
  for (let frame = 0; frame < 500; frame++) {
    tick(run, 1, { move: direction }); touched ||= robotTouchesPlayer(bot, run.player)
    assert.equal(bot.actor.hang, null, 'the player is never a ledge')
    assert.equal(bot.actor.mantle, null, 'the player is never a step-up platform')
    landed ||= bot.actor.grounded && Math.abs(bot.y - 920) < .1
  }
  assert.ok(touched, 'the test includes an actual actor contact')
  assert.ok(landed, `the bot froze at ${bot.x}, ${bot.y}`)
})

for (const direction of [-1, 1]) test(`airborne Rbot keeps its travel heading while braking toward a waypoint (${direction})`, () => {
  const run = createRun(level()), bot = run.robots[0]
  tick(run)
  Object.assign(bot.actor, { x: 700, y: 650, vx: direction * 260, vy: 0, grounded: false })
  bot.x = 700; bot.y = 650
  for (let frame = 0; frame < 24; frame++) {
    tick(run)
    assert.ok(!bot.actor.grounded && Math.abs(bot.actor.vx) > 100)
    assert.equal(bot.facing, direction, 'a braking command or opposite sighting cannot spin the airborne body')
  }
})

for (const mirror of [false, true]) test(`Rbot settles at a real takeoff instead of jumping into an overlapping deck (${mirror ? 'left' : 'right'})`, () => {
  const file = level(), x = value => mirror ? 1800 - value : value
  file.platforms = [{ x: 750, y: 625, w: 575, h: 25 }, { x: 600, y: 425, w: 400, h: 25 }]
  if (mirror) file.platforms = file.platforms.map(p => ({ ...p, x: 1800 - p.x - p.w }))
  file.entrance = { x: x(950), y: 425 }
  file.robots[0] = { ...file.robots[0], x: x(1250), y: 625 }
  const run = createRun(file), bot = run.robots[0]
  let landed = false, launched = false
  for (let frame = 0; frame < 900 && !landed; frame++) {
    const before = bot.actor.vy
    tick(run)
    const actor = bot.actor
    launched ||= !actor.grounded && actor.vy < -100
    assert.ok(!(before < -50 && actor.vy >= 0 && !actor.grounded && !actor.hang && !actor.mantle && !actor.climbing),
      `the ascending body hit a ceiling at ${actor.x}, ${actor.y}`)
    landed = actor.grounded && Math.abs(actor.y - 425) < .1
  }
  assert.ok(launched && landed, `the safe alternative must still reach the upper deck: ${bot.x}, ${bot.y}`)
})
