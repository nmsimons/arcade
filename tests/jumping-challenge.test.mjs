import { CAMPAIGN, FIRST_LEVEL, YARD_LEVEL, createPlayer, stepPlayer } from './helpers/jumping-fixtures.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { createRun, formatTime, medalFor, readBest, saveBest, stepRun } from '../src/games/jumping/challenge.ts'
import { blankTrial } from '../src/games/jumping/level.ts'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { levelProblems, levelTerrain, parseLevel } from '../src/games/jumping/level.ts'
import { NO_CLIMBABLES } from '../src/games/jumping/climbables.ts'
import { playLesson } from './helpers/jumping-routes.mjs'
import { GOAL_PLATE_WIDTH, GOAL_REVEAL_SECONDS } from '../src/games/jumping/goal.ts'
const advance = (run, frames, input = {}) => { for (let i = 0; i < frames; i++) stepRun(run, { ...NEUTRAL_INPUT, ...input }) }
for (const [index, level] of CAMPAIGN.entries()) test(`${level.name} can be finished from spawn using its taught mechanic`, () => {
  const run = playLesson(index); assert.ok(run.elapsed < level.times.silver)
  const time = run.elapsed, p = structuredClone(run.player); advance(run, 600, { move: -1, jump: true })
  assert.equal(run.elapsed, time); assert.notDeepEqual(run.player, p)
})
test('a short hop cannot clear lesson one and a charged jump cannot skip either rope lesson', () => {
  for (const [index, level] of CAMPAIGN.entries()) {
    const run = createRun({ ...level, climbables: { ...level.climbables, ropes: [] } }), p = run.player
    while (p.x < 535) advance(run, 1, { move: 1, jump: index > 0 })
    if (index === 0) advance(run, 1, { move: 1, jump: true })
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
  advance(run, 360, { move: 1 }); assert.equal(run.triggers[0].active, true); assert.ok(run.elapsed > 2.9)
  assert.notDeepEqual(run.props, fresh.props); assert.deepEqual(createRun(YARD_LEVEL), fresh)
})
test('a pressure plate starts only its connected mechanism and keeps it latched', () => {
  const level = blankTrial(); level.mechanisms = [
    { id: 'lift', kind: 'lift', x: 700, y: 890, w: 140, h: 22, travel: 300 },
    { id: 'gate', kind: 'gate', x: 1100, y: 740, w: 44, h: 180, travel: 200 },
  ]; level.triggers = [{ x: 250, y: 920, w: 100, target: 'gate', mode: 'touch' }]
  const run = createRun(level); run.player.x = 290; advance(run, 60, { climb: true })
  assert.equal(run.mechanisms[0].active, false); assert.equal(run.mechanisms[1].active, true)
  run.player.x = 450; advance(run, 300)
  assert.equal(run.mechanisms[1].y, 540); assert.equal(run.mechanisms[0].y, 890)
})
test('elevators carry the player and stop above them without crushing or trapping them', () => {
  const level = blankTrial(); level.mechanisms = [{ id: 'lift', kind: 'lift', x: 700, y: 890, w: 140, h: 22, travel: 300 }]
  const run = createRun(level), lift = run.mechanisms[0]; run.started = true; lift.active = true
  Object.assign(run.player, { x: 760, y: 890 }); advance(run, 280); assert.equal(run.player.y, 590)
  Object.assign(run.player, { x: 760, y: 920, footwork: null }); lift.y = 750; lift.direction = 1; lift.wait = 0
  advance(run, 250); assert.ok(lift.y + 22 <= run.player.y - 62 + .01)
  advance(run, 130, { move: 1 }); assert.ok(lift.y > 865)
})
test('pushers spot distant players, close the distance quickly, and repeat their attacks', () => {
  const level = blankTrial(); level.robots = [{ x: 1000, y: 920, left: 80, right: 1700 }]
  const run = createRun(level); run.player.x = 440; advance(run, 120, { climb: true })
  assert.equal(run.robots[0].phase, 'chase'); assert.ok(run.robots[0].x < 770)
  const seen = new Set(); let hits = 0, wasHit = false
  for (let i = 0; i < 720; i++) {
    advance(run, 1); const r = run.robots[0]; seen.add(r.phase)
    if (r.hit && !wasHit) hits++; wasHit = r.hit
  }
  assert.ok(seen.has('windup')); assert.ok(seen.has('charge')); assert.ok(hits >= 2, 'pusher comes back after the first shove')
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
  assert.equal(run.player.y, 840)
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

test('the player must load the goal plate from above; touching the pole or jumping over it does not finish', () => {
  const level = blankTrial(); level.goal.x = 800
  const run = createRun(level); run.started = true
  Object.assign(run.player, { x: 800, y: 860, grounded: false })
  advance(run, 1); assert.equal(run.finished, false)
  Object.assign(run.player, { x: 844, y: 920, grounded: true, vy: 0, footwork: null })
  advance(run, 1); assert.equal(run.finished, false, 'standing at the pole is not plate contact')
  Object.assign(run.player, { x: 800, footwork: null })
  advance(run, 1); assert.equal(run.finished, true)
})

for (const kind of ['box', 'ball']) test(`a ${kind} can light the goal with the player elsewhere`, () => {
  const level = blankTrial(); level.goal.x = 1000
  level.props = [{ kind, x: 1000, y: 920, size: 80 }]
  const run = createRun(level)
  advance(run, 100); assert.equal(run.finished, false, 'the puzzle still waits for first input')
  advance(run, 1, { move: -1 })
  assert.equal(run.finished, true); assert.equal(run.medal, 'Gold'); assert.ok(run.player.x < 200)
  const time = run.elapsed, player = structuredClone(run.player), prop = structuredClone(run.props[0])
  advance(run, Math.ceil((GOAL_REVEAL_SECONDS - .2) / STEP), { move: 1, jump: true })
  assert.ok(run.finishElapsed < GOAL_REVEAL_SECONDS)
  assert.equal(run.elapsed, time); assert.notDeepEqual(run.player, player); assert.deepEqual(run.props[0], prop)
  advance(run, 100)
  assert.equal(run.finishElapsed, GOAL_REVEAL_SECONDS); assert.equal(run.elapsed, time)
  const fresh = createRun(level)
  assert.equal(fresh.finished, false); assert.equal(fresh.finishElapsed, 0); assert.equal(fresh.elapsed, 0)
})

test('a crate edge presses the plate, while a ball must put its bottom contact on the plate', () => {
  for (const kind of ['box', 'ball']) {
    const level = blankTrial(); level.goal.x = 1000
    level.props = [{ kind, x: 1000 + GOAL_PLATE_WIDTH / 2 + 30, y: 920, size: 80 }]
    const run = createRun(level); run.started = true; advance(run, 1)
    assert.equal(run.finished, kind === 'box')
  }
})

test('an object above the plate only activates it after landing', () => {
  const level = blankTrial(); level.goal.x = 1000
  level.props = [{ kind: 'ball', x: 1000, y: 840, size: 80 }]
  const run = createRun(level); run.started = true
  advance(run, 1); assert.equal(run.finished, false)
  advance(run, 90); assert.equal(run.finished, true); assert.equal(run.props[0].y, level.goal.y)
})

test('walking off the goal releases its plate while the light, medal, and finishing time stay latched', () => {
  const level = blankTrial(); level.goal.x = 800
  const run = createRun(level); run.started = true; run.player.x = 800
  advance(run, 20)
  assert.equal(run.finished, true); assert.equal(run.goalDepression, 1)
  const time = run.elapsed, medal = run.medal
  advance(run, 100, { move: 1 })
  assert.ok(run.player.x > 1000); assert.equal(run.goalDepression, 0)
  assert.equal(run.finished, true); assert.equal(run.medal, medal); assert.equal(run.elapsed, time)
})
