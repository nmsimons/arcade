import { CAMPAIGN, FIRST_LEVEL, YARD_LEVEL, createPlayer, stepPlayer } from './helpers/jumping-fixtures.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { createRun, formatTime, medalFor, readBest, saveBest, stepRun } from '../src/games/jumping/challenge.ts'
import { blankTrial } from '../src/games/jumping/level.ts'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { levelProblems, levelTerrain, parseLevel } from '../src/games/jumping/level.ts'
import { NO_CLIMBABLES } from '../src/games/jumping/climbables.ts'
import { playLesson } from './helpers/jumping-routes.mjs'
import { GOAL_OPEN_SECONDS, GOAL_EXIT_SECONDS, goalDoor } from '../src/games/jumping/goal.ts'
import { mechanismAnchor } from '../src/games/jumping/mechanisms.ts'
const advance = (run, frames, input = {}) => { for (let i = 0; i < frames; i++) stepRun(run, { ...NEUTRAL_INPUT, ...input }) }
const weightPlate = (level, target = 'lift') => {
  level.triggers.push({ x: 300, y: 920, w: 80, target, mode: 'weight' })
  level.props.push({ kind: 'box', x: 340, y: 920, size: 30 })
}
for (const [index, level] of CAMPAIGN.entries()) test(`${level.name} can be finished from spawn using its taught mechanic`, () => {
  const run = playLesson(index); assert.ok(run.elapsed < level.times.silver)
  const time = run.elapsed, p = structuredClone(run.player); advance(run, 600, { move: -1, jump: true })
  assert.equal(run.elapsed, time); assert.deepEqual(run.player, p)
})
test('a running jump cannot skip either rope lesson', () => {
  for (const [index, level] of CAMPAIGN.entries()) {
    const run = createRun({ ...level, climbables: { ...level.climbables, ropes: [] } }), p = run.player
    if (index === 0) continue
    while (p.x < 535) advance(run, 1, { move: 1 })
    advance(run, 24, { move: 1, jump: true })
    advance(run, 180, { move: 1 }); assert.equal(run.finished, false)
    assert.ok(p.y > level.spawn.y + 100)
  }
})
test('a missed jump lands on the floor, and the ladder returns to the left bank', () => {
  const run = createRun(FIRST_LEVEL), p = run.player; advance(run, 150, { move: 1 }); advance(run, 140)
  assert.equal(p.y, 920); assert.ok(p.x > 560)
  for (let i = 0; i < 240 && p.x > 578; i++) advance(run, 1, { move: -1 })
  advance(run, 800, { climb: true }); assert.equal(p.y, 520); assert.ok(p.x < 560)
  assert.ok(run.elapsed > 6); assert.equal(run.player.spawnX, 170)
})
test('all actors wait for the first input and restarting reconstructs the entire puzzle', () => {
  const run = createRun(YARD_LEVEL), fresh = createRun(YARD_LEVEL)
  advance(run, 1000); assert.deepEqual(run, fresh)
  let pressed = false
  for (let i = 0; i < 360; i++) { advance(run, 1, { move: 1 }); pressed ||= run.triggers[0].active }
  assert.equal(pressed, true); advance(run, 120, { move: -1 }); assert.ok(run.elapsed > 2.9)
  assert.notDeepEqual(run.props, fresh.props); assert.deepEqual(createRun(YARD_LEVEL), fresh)
})
test('a pressure plate powers only its connected mechanism while held', () => {
  const level = blankTrial(); level.mechanisms = [
    { id: 'lift', kind: 'lift', x: 700, y: 890, w: 140, h: 22, travel: 300 },
    { id: 'gate', kind: 'gate', x: 1100, y: 740, w: 44, h: 180, travel: 200 },
  ]; level.triggers = [{ x: 250, y: 920, w: 100, target: 'gate', mode: 'touch' }]
  const run = createRun(level); run.player.x = 290; advance(run, 60, { climb: true })
  assert.equal(run.mechanisms[0].active, false); assert.equal(run.mechanisms[1].active, true)
  advance(run, 300)
  assert.equal(run.mechanisms[1].y, 560); assert.equal(run.mechanisms[0].y, 890)
  run.player.x = 450; advance(run, 360)
  assert.equal(run.triggers[0].active, false); assert.equal(run.mechanisms[1].active, false)
  assert.equal(run.mechanisms[1].y, 740)
})
test('elevators carry the player and reverse above them without crushing or trapping them', () => {
  const level = blankTrial(); level.mechanisms = [{ id: 'lift', kind: 'lift', x: 700, y: 890, w: 140, h: 22, travel: 300 }]
  weightPlate(level)
  const run = createRun(level), lift = run.mechanisms[0]; run.started = true
  Object.assign(run.player, { x: 760, y: 890 }); advance(run, 320); assert.equal(run.player.y, 590)
  Object.assign(run.player, { x: 760, y: 920, footwork: null }); lift.y = 750; lift.direction = 1; lift.wait = 0
  advance(run, 250); assert.ok(lift.y + lift.definition.h <= run.player.y - 62 + .01)
  assert.equal(lift.direction, -1, 'contact underneath turns the elevator back upward')
  advance(run, 130, { move: 1 })
  let returned = false
  for (let i = 0; i < 1200; i++) { advance(run, 1); returned ||= lift.y === 890 }
  assert.ok(returned, 'after the player leaves, a later trip reaches the original lower endpoint')
})

test('a thin gate rises while pressed and closes on release without crushing a player underneath', () => {
  const level = blankTrial(); level.spawn.x = 500
  level.mechanisms = [{ id: 'gate', kind: 'gate', x: 600, y: 740, w: 20, h: 180, travel: 220 }]
  level.triggers = [{ x: 300, y: 920, w: 80, target: 'gate', mode: 'touch' }]
  const run = createRun(level), gate = run.mechanisms[0], anchor = mechanismAnchor(gate.definition)
  advance(run, 180, { move: 1 })
  assert.ok(run.player.x < 600); assert.equal(gate.y, 740)
  Object.assign(run.player, { x: 340, vx: 0, footwork: null }); advance(run, 60)
  assert.equal(gate.active, true)
  advance(run, 360)
  assert.equal(gate.y, anchor.y); assert.equal(gate.definition.h, 180)
  Object.assign(run.player, { x: 610, vx: 0, footwork: null }); advance(run, 360)
  assert.equal(gate.active, false)
  assert.equal(gate.y, anchor.y, 'obstruction reopens the gate instead of pinning the player')
  assert.ok(gate.y + gate.definition.h <= run.player.y - 62 + .01)
  advance(run, 80, { move: 1 }); assert.ok(run.player.x > 660)
  advance(run, 420); assert.equal(gate.y, 740)
  Object.assign(run.player, { x: 340, vx: 0, footwork: null }); advance(run, 360)
  assert.equal(gate.y, anchor.y)
  const restarted = createRun(level)
  assert.equal(restarted.mechanisms[0].y, 740); assert.equal(restarted.mechanisms[0].active, false)
})

test('a suspended elevator keeps its anchor fixed while carrying a rider through a complete cycle', () => {
  const level = blankTrial(); level.mechanisms = [{ id: 'lift', kind: 'lift', x: 700, y: 890, w: 160, h: 20, travel: 200 }]
  weightPlate(level)
  const run = createRun(level), lift = run.mechanisms[0], anchor = mechanismAnchor(lift.definition)
  run.started = true
  Object.assign(run.player, { x: 750, y: 890, footwork: null })
  let reachedAnchor = false, returned = false
  for (let i = 0; i < 1100; i++) {
    advance(run, 1)
    assert.ok(Math.abs(run.player.y - lift.y) < .01)
    assert.ok(lift.y >= anchor.y && lift.y <= 890)
    assert.deepEqual(mechanismAnchor(lift.definition), anchor)
    if (lift.y === anchor.y) reachedAnchor = true
    if (reachedAnchor && lift.y === 890) returned = true
  }
  assert.equal(reachedAnchor, true); assert.equal(returned, true)
})

test('an elevator pauses on plate release and resumes its direction on pressure in either direction', () => {
  const level = blankTrial(); level.mechanisms = [{ id: 'lift', kind: 'lift', x: 700, y: 890, w: 160, h: 20, travel: 200 }]
  weightPlate(level)
  const run = createRun(level), lift = run.mechanisms[0], weight = run.props[0]
  run.started = true; advance(run, 80)
  for (const direction of [-1, 1]) {
    assert.equal(lift.direction, direction)
    const y = lift.y
    weight.x = 450; advance(run, 1)
    assert.equal(lift.active, false); assert.equal(lift.y, y)
    advance(run, 120); assert.equal(lift.y, y)
    weight.x = 340; advance(run, 60)
    assert.equal(lift.active, true); assert.ok((lift.y - y) * direction > 0)
    if (direction < 0) {
      for (let i = 0; i < 800 && !(lift.direction === 1 && lift.y > 710); i++) advance(run, 1)
    }
  }
})

test('one plate powers several mechanisms and shared connections remain active until every plate releases', () => {
  const level = blankTrial(); level.spawn.x = 340
  level.mechanisms = [
    { id: 'gate', kind: 'gate', x: 1000, y: 740, w: 20, h: 180, travel: 180 },
    { id: 'lift', kind: 'lift', x: 700, y: 900, w: 160, h: 20, travel: 300 },
    { id: 'horizontal', kind: 'gate', orientation: 'horizontal', x: 1300, y: 700, w: 180, h: 20, travel: 180 },
  ]
  level.triggers = [{ x: 300, y: 920, w: 80, targets: ['gate', 'lift', 'horizontal'], mode: 'weight' },
    { x: 500, y: 920, w: 80, target: 'gate', mode: 'touch' }]
  level.props = [{ kind: 'box', x: 540, y: 920, size: 30 }]
  const run = createRun(level), [gate, lift, horizontal] = run.mechanisms
  run.started = true; advance(run, 150)
  assert.ok(run.mechanisms.every(m => m.active))
  assert.ok(gate.y < 740 && lift.y < 900 && horizontal.x < 1300)
  run.player.x = 160; advance(run, 1)
  const stopped = lift.y
  advance(run, 300)
  assert.equal(lift.active, false); assert.equal(lift.y, stopped)
  assert.equal(horizontal.active, false); assert.equal(horizontal.x, 1300)
  assert.equal(gate.active, true); assert.equal(gate.y, 560)
  run.props[0].x = 650; advance(run, 360)
  assert.equal(gate.active, false); assert.equal(gate.y, 740)
})

test('the player or either of two weighted plates can keep a gate open', () => {
  const level = blankTrial(); level.mechanisms = [{ id: 'gate', kind: 'gate', x: 1000, y: 740, w: 20, h: 180, travel: 220 }]
  level.triggers = [{ x: 300, y: 920, w: 80, target: 'gate', mode: 'weight' }, { x: 500, y: 920, w: 80, target: 'gate', mode: 'weight' }]
  level.props = [{ kind: 'box', x: 700, y: 920, size: 30 }, { kind: 'ball', x: 800, y: 920, size: 30 }]
  const run = createRun(level), gate = run.mechanisms[0]
  run.started = true; run.player.x = 340; advance(run, 60)
  assert.equal(gate.active, true); assert.ok(gate.y < 740)
  run.player.x = 160; run.props[0].x = 340; run.props[1].x = 540; advance(run, 360)
  assert.equal(gate.y, 560)
  run.props[0].x = 700; advance(run, 180)
  assert.equal(run.triggers[0].active, false); assert.equal(run.triggers[1].active, true); assert.equal(gate.y, 560)
  run.props[1].x = 800; advance(run, 360)
  assert.equal(gate.active, false); assert.equal(gate.y, 740)
})

for (const mode of ['weight', 'touch']) for (const kind of ['gate', 'lift']) test(`the player alone activates a ${mode} plate for a ${kind}, and leaving releases it`, () => {
  const level = blankTrial(); level.spawn.x = 340
  level.mechanisms = [{ id: 'mechanism', kind, x: 700, y: 740, w: kind === 'gate' ? 20 : 160, h: kind === 'gate' ? 180 : 20, travel: 220 }]
  level.triggers = [{ x: 300, y: 920, w: 80, target: 'mechanism', mode }]
  const run = createRun(level), mechanism = run.mechanisms[0]
  run.started = true; advance(run, 60)
  assert.equal(run.triggers[0].active, true); assert.equal(mechanism.active, true)
  assert.ok(mechanism.y < 740)
  const y = mechanism.y
  run.player.x = 450; advance(run, 1)
  assert.equal(run.triggers[0].active, false); assert.equal(mechanism.active, false)
  advance(run, 300)
  assert.equal(mechanism.y, kind === 'gate' ? 740 : y)
  Object.assign(run.player, { x: 340, y: 820, vy: 0, grounded: false, footwork: null }); advance(run, 1)
  assert.equal(run.triggers[0].active, false, 'passing above a plate does not press it')
  Object.assign(run.player, { y: 920, vy: 0, grounded: true, footwork: null }); advance(run, 60)
  assert.equal(mechanism.active, true)
})
test('pushers spot distant players, close the distance quickly, and repeat their attacks', () => {
  const level = blankTrial(); level.robots = [{ x: 1000, y: 920, left: 80, right: 1700 }]
  const run = createRun(level); run.player.x = 440; advance(run, 120, { climb: true })
  assert.equal(run.robots[0].phase, 'chase'); assert.ok(run.robots[0].x < 770)
  const seen = new Set(); let charges = 0, previous = run.robots[0].phase
  const startX = run.player.x
  for (let i = 0; i < 720; i++) {
    advance(run, 1); const r = run.robots[0]; seen.add(r.phase)
    if (r.phase === 'charge' && previous !== 'charge') charges++; previous = r.phase
  }
  assert.ok(seen.has('windup')); assert.ok(seen.has('charge')); assert.ok(charges >= 2, 'pusher repeats its charge')
  assert.ok(run.player.x < startX - 100, 'physical contact pushes the player back')
  assert.ok(run.player.x >= 12); assert.equal(run.finished, false)
})
test('pushers respect a pit and solid pillar while chasing', () => {
  const level = structuredClone(FIRST_LEVEL); level.robots = [{ x: 400, y: 520, left: 80, right: 1200 }]
  const run = createRun(level); Object.assign(run.player, { x: 1050, y: 520 }); advance(run, 600, { climb: true })
  assert.ok(run.robots[0].x <= 560); assert.equal(run.robots[0].y, 520)
})
test('loose crates displace players, stop at obstacles, and provide stable support', () => {
  const level = blankTrial(); level.props = [{ kind: 'box', x: 1000, y: 920, size: 80 }]
  const run = createRun(level); run.started = true; run.props[0].vx = 240; Object.assign(run.player, { x: 1053, y: 920 })
  advance(run, 30); assert.ok(run.player.x > 1065); assert.ok(run.player.x - 12 >= run.props[0].x + 40 - .01)
  Object.assign(run.player, { x: run.props[0].x, y: 840, vx: 0, footwork: null }); advance(run, 240)
  assert.ok(Math.abs(run.player.y - 840) < .01)
})
test('a lift landing is a passable seam in either direction', () => {
  const terrain = [{ x: 0, y: 540, w: 200, h: 22 }, { x: 200, y: 540, w: 400, h: 22 }]
  for (const move of [-1, 1]) {
    const p = createPlayer(); Object.assign(p, { x: move === 1 ? 140 : 260, y: 540 })
    for (let i = 0; i < 50; i++) { stepPlayer(p, { ...NEUTRAL_INPUT, move }, STEP, terrain, NO_CLIMBABLES); assert.equal(p.y, 540) }
    assert.ok(move === 1 ? p.x > 230 : p.x < 170)
  }
})
test('medals use each level’s thresholds and an unmedalled finish is still successful', () => {
  assert.equal(medalFor(3.5, FIRST_LEVEL), 'Gold'); assert.equal(medalFor(3.51, FIRST_LEVEL), 'Silver'); assert.equal(medalFor(6, FIRST_LEVEL), 'Silver'); assert.equal(medalFor(15, FIRST_LEVEL), 'Bronze'); assert.equal(medalFor(15.01, FIRST_LEVEL), 'No medal')
  const run = createRun(FIRST_LEVEL); run.started = true; run.elapsed = 100; Object.assign(run.player, run.level.goal); advance(run, 1)
  assert.equal(run.goalLit, true); assert.equal(run.finished, false); assert.equal(run.medal, null)
  const door = goalDoor(run.level.goal); Object.assign(run.player, { x: door.x + door.w / 2 })
  advance(run, 180)
  assert.equal(run.finished, true); assert.equal(run.medal, 'No medal'); assert.equal(formatTime(100.019), '1:40.01')
})
test('personal bests are isolated by level and survive slower runs and corrupt storage', () => {
  let raw = null; const storage = { getItem: () => raw, setItem: (_, value) => { raw = value } }
  assert.equal(saveBest(storage, 4, 'first-leap'), 4); assert.equal(saveBest(storage, 9, 'one-rope'), 9); assert.equal(saveBest(storage, 5, 'first-leap'), 4)
  assert.equal(readBest(storage, 'one-rope'), 9); raw = 'corrupt'; assert.equal(readBest(storage, FIRST_LEVEL.id), null); assert.equal(saveBest(storage, 3, FIRST_LEVEL.id), 3)
})
test('authored maps round-trip with their complete game data and continuous floor', () => {
  for (const level of [...CAMPAIGN, YARD_LEVEL]) {
    assert.deepEqual(parseLevel(JSON.parse(JSON.stringify(level))), level)
    assert.deepEqual(levelProblems(level), [])
    assert.ok(levelTerrain(level).some(b => b.x <= 0 && b.y === level.floor && b.x + b.w >= level.width))
  }
})

for (const flipX of [false, true]) test(`${flipX ? 'flipped' : 'normal'} switched exit opens from a separate switch and finishes only through its doorway`, () => {
  const level = blankTrial(); level.goal.x = 800; level.goal.flipX = flipX
  level.goal.id = 'exit'; level.goal.power = 'switched'
  level.triggers = [{ x: 480, y: 920, w: 80, mode: 'weight', behavior: 'switch', targets: ['exit'] }]
  const run = createRun(level), p = run.player, door = goalDoor(level.goal), direction = flipX ? -1 : 1
  run.started = true
  Object.assign(p, { x: 800, y: 860, grounded: false })
  advance(run, 1); assert.equal(run.goalLit, false)
  Object.assign(p, { x: 800 + direction * 44, y: 920, grounded: true, vy: 0, footwork: null })
  advance(run, 1); assert.equal(run.goalLit, false, 'standing at the pole is not plate contact')
  Object.assign(p, { x: door.x + door.w / 2, footwork: null })
  advance(run, 120); assert.equal(run.exit, null, 'the closed hidden door is inactive')
  Object.assign(p, { x: 520, footwork: null })
  advance(run, 20); assert.equal(run.goalLit, true); assert.equal(run.finished, false)
  const time = run.elapsed
  advance(run, 600); assert.equal(run.finished, false); assert.equal(run.exit, null); assert.ok(Math.abs(run.elapsed - time - 5) < 1e-9)
  assert.equal(run.medal, null, 'opening the door does not award a medal')
  Object.assign(p, { x: door.x + door.w / 2, y: 800, vy: 0, grounded: false, footwork: null })
  advance(run, 1); assert.equal(run.exit, null, 'airborne passage does not enter the doorway')
  Object.assign(p, { x: 800, y: 920, vx: 0, vy: 0, grounded: true, footwork: null })
  for (let i = 0; i < 120 && !run.exit; i++) advance(run, 1, { move: direction })
  assert.ok(run.exit); assert.equal(run.finished, false)
  const captured = run.exit.fromX, finishTime = run.elapsed
  assert.ok(finishTime > time + 5); assert.equal(run.medal, medalFor(finishTime, level))
  advance(run, Math.floor(GOAL_EXIT_SECONDS / STEP) - 2, { move: -direction, jump: true })
  assert.equal(run.finished, false, 'the full exit animation plays before results')
  assert.ok(Math.abs(p.x - (door.x + door.w / 2)) < .01); assert.notEqual(p.x, captured)
  advance(run, 5)
  assert.equal(run.finished, true); assert.equal(run.elapsed, finishTime, 'the exit animation does not count toward the score')
  const completed = structuredClone(run)
  advance(run, 240, { move: 1, jump: true }); assert.deepEqual(run, completed)
})

for (const kind of ['box', 'ball']) test(`a ${kind} can switch an exit remotely without finishing the level`, () => {
  const level = blankTrial(); level.goal.x = 1000
  level.goal.id = 'exit'; level.goal.power = 'switched'
  level.triggers = [{ x: 772, y: 920, w: 56, mode: 'weight', behavior: 'switch', targets: ['exit'] }]
  level.props = [{ kind, x: 800, y: 920, size: 80 }]
  const run = createRun(level)
  advance(run, 100); assert.equal(run.goalLit, false, 'the puzzle still waits for first input')
  advance(run, 20, { move: -1 })
  assert.equal(run.goalLit, true); assert.equal(run.finished, false); assert.equal(run.medal, null); assert.ok(run.player.x < 200)
  const time = run.elapsed, player = structuredClone(run.player)
  advance(run, 240, { move: 1, jump: true })
  assert.equal(run.goalElapsed, GOAL_OPEN_SECONDS); assert.equal(run.finished, false); assert.equal(run.exit, null)
  assert.ok(Math.abs(run.elapsed - time - 2) < 1e-9); assert.notDeepEqual(run.player, player)
  const door = goalDoor(level.goal)
  run.props[0].x = door.x + door.w / 2
  advance(run, 240)
  assert.equal(run.finished, false, 'a prop in the door cannot complete the level')
  const fresh = createRun(level)
  assert.equal(fresh.finished, false); assert.equal(fresh.goalLit, false); assert.equal(fresh.goalElapsed, 0); assert.equal(fresh.exit, null); assert.equal(fresh.elapsed, 0)
})

test('a crate edge presses the plate, while a ball must put its bottom contact on the plate', () => {
  for (const kind of ['box', 'ball']) {
    const level = blankTrial(); level.goal.x = 1000
    level.goal.id = 'exit'; level.goal.power = 'switched'
    level.triggers = [{ x: 972, y: 920, w: 56, mode: 'weight', behavior: 'switch', targets: ['exit'] }]
    level.props = [{ kind, x: 1000 + 28 + 30, y: 920, size: 80 }]
    const run = createRun(level); run.started = true; advance(run, 20)
    assert.equal(run.goalLit, kind === 'box'); assert.equal(run.finished, false)
  }
})

test('an object above the plate only activates it after landing', () => {
  const level = blankTrial(); level.goal.x = 1000
  level.goal.id = 'exit'; level.goal.power = 'switched'
  level.triggers = [{ x: 972, y: 920, w: 56, mode: 'weight', behavior: 'switch', targets: ['exit'] }]
  level.props = [{ kind: 'ball', x: 1000, y: 840, size: 80 }]
  const run = createRun(level); run.started = true
  advance(run, 1); assert.equal(run.goalLit, false)
  advance(run, 90); assert.equal(run.goalLit, true); assert.equal(run.finished, false); assert.ok(Math.abs(run.props[0].y - level.goal.y) < .01)
})

test('walking away releases a Switch plate while the exit stays open and the timer keeps running', () => {
  const level = blankTrial(); level.goal.x = 800
  level.goal.id = 'exit'; level.goal.power = 'switched'
  level.triggers = [{ x: 772, y: 920, w: 56, mode: 'weight', behavior: 'switch', targets: ['exit'] }]
  const run = createRun(level); run.started = true; run.player.x = 800
  advance(run, 20)
  assert.equal(run.goalLit, true); assert.equal(run.triggers[0].depression, 1)
  const time = run.elapsed
  advance(run, 100, { move: -1 })
  assert.ok(run.player.x < 600); assert.equal(run.triggers[0].depression, 0)
  assert.equal(run.goalLit, true); assert.equal(run.finished, false); assert.equal(run.medal, null)
  assert.ok(Math.abs(run.elapsed - time - 100 * STEP) < 1e-9)
})
