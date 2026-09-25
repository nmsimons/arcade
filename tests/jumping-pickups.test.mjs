import test from 'node:test'
import assert from 'node:assert/strict'
import { createRun, formatTime, readBest, saveBest, stepRun } from '../src/games/jumping/challenge.ts'
import { blankTrial, levelProblems, parseLevel } from '../src/games/jumping/level.ts'
import { addItem, allSelections, deleteItem, duplicateItem, hitItem, itemBounds, moveItem, resizeLevelHeight } from '../src/games/jumping/editor.ts'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { PICKUP_ANIMATION_SECONDS } from '../src/games/jumping/pickups.ts'
import { goalDoor } from '../src/games/jumping/goal.ts'
import { copyForEditing } from '../src/games/jumping/puzzleEditor.ts'

const stopwatch = (x, y) => ({ kind: 'stopwatch', x, y })
const step = (run, frames, input = NEUTRAL_INPUT) => { for (let i = 0; i < frames; i++) stepRun(run, input) }

test('touching a stopwatch stops the clock once; start pickups keep their duration and extra watches extend it', () => {
  const level = blankTrial(); level.pickups = [stopwatch(160, 888), stopwatch(320, 888)]
  const run = createRun(level)
  step(run, 1)
  assert.equal(run.elapsed, 0); assert.equal(run.started, false); assert.equal(run.timeStopRemaining, 10)
  assert.equal(run.pickups[0].collectedAge, 0); assert.equal(run.pickups[1].collectedAge, null)
  step(run, 120)
  assert.equal(run.elapsed, 0); assert.equal(run.timeStopRemaining, 10); assert.equal(run.pickups[0].collectedAge, PICKUP_ANIMATION_SECONDS)
  step(run, 120, { ...NEUTRAL_INPUT, move: 1 })
  assert.equal(run.elapsed, 0); assert.ok(Math.abs(run.timeStopRemaining - 19) < 1e-9)
  assert.ok(run.pickups.every(p => p.collectedAge === PICKUP_ANIMATION_SECONDS))
  assert.deepEqual(level.pickups, [stopwatch(160, 888), stopwatch(320, 888)], 'collecting never changes the authored file')
  const reset = createRun(run.level)
  assert.equal(reset.elapsed, 0); assert.equal(reset.timeStopRemaining, 0); assert.ok(reset.pickups.every(p => p.collectedAge === null))
})

test('the clock resumes after exactly ten gameplay seconds, including a partial expiration step', () => {
  const level = blankTrial(); level.pickups = [stopwatch(160, 888)]
  const run = createRun(level); step(run, 1)
  const input = { ...NEUTRAL_INPUT, climb: true }
  step(run, 1200, input)
  assert.ok(Math.abs(run.elapsed) < 1e-9)
  assert.ok(run.timeStopRemaining < 1e-9)
  step(run, 120, input)
  assert.ok(Math.abs(run.elapsed - 1) < 1e-9)
  assert.equal(run.timeStopRemaining, 0)
  run.timeStopRemaining = STEP / 2; run.elapsed = 4
  step(run, 1, input)
  assert.equal(run.timeStopRemaining, 0)
  assert.ok(Math.abs(run.elapsed - (4 + STEP / 2)) < 1e-9)
})

test('overlapping stopwatches each grant ten seconds and cannot be collected twice', () => {
  const level = blankTrial(); level.pickups = [stopwatch(160, 888), stopwatch(165, 888)]
  const run = createRun(level); step(run, 1)
  assert.equal(run.timeStopRemaining, 20); assert.equal(run.elapsed, 0)
  step(run, 2400, { ...NEUTRAL_INPUT, climb: true })
  assert.ok(run.timeStopRemaining < 1e-9); assert.ok(run.elapsed < 1e-9)
  step(run, 120)
  assert.ok(Math.abs(run.elapsed - 1) < 1e-9)
})

test('pickup contact is local to the player, includes the crown, and ignores nearby props', () => {
  const level = blankTrial()
  level.pickups = [stopwatch(195, 888), stopwatch(160, 812), stopwatch(160, 950), stopwatch(700, 880)]
  level.props = [{ kind: 'ball', x: 700, y: 920, size: 80 }]
  const run = createRun(level); step(run, 1)
  assert.deepEqual(run.pickups.map(p => p.collectedAge !== null), [false, false, true, false])
  assert.equal(run.elapsed, 0); assert.equal(run.timeStopRemaining, 10)
})

test('collecting changes only scoring and pickup state, with identical movement, props and robot behavior', () => {
  const level = blankTrial()
  level.props = [{ kind: 'ball', x: 900, y: 920, size: 60 }]
  level.robots = [{ x: 1250, y: 920, left: 1100, right: 1450 }]
  const plain = createRun(level), bonus = createRun({ ...level, pickups: [stopwatch(320, 888), stopwatch(650, 770)] })
  for (let i = 0; i < 400; i++) {
    const input = { ...NEUTRAL_INPUT, move: 1, jump: i >= 80 && i < 120 }
    stepRun(plain, input); stepRun(bonus, input)
    assert.deepEqual(bonus.player, plain.player); assert.deepEqual(bonus.props, plain.props)
    assert.deepEqual(bonus.robots, plain.robots); assert.deepEqual(bonus.platforms, plain.platforms)
    assert.equal(bonus.activeTime, plain.activeTime)
    const count = bonus.pickups.filter(p => p.collectedAge !== null).length
    assert.ok(Math.abs(bonus.elapsed + 10 * count - bonus.timeStopRemaining - plain.elapsed) < 1e-8)
    assert.ok(bonus.elapsed >= 0)
  }
  assert.ok(bonus.elapsed < plain.elapsed)
})

test('stopwatches still work after the light opens; entry locks the score and ends collection', () => {
  const level = blankTrial(); level.pickups = [stopwatch(1620, 888), stopwatch(1700, 888)]
  const run = createRun(level); run.started = true; run.elapsed = 45
  Object.assign(run.player, level.goal)
  step(run, 1)
  assert.equal(run.goalLit, true); assert.equal(run.finished, false); assert.equal(run.medal, null)
  assert.ok(Math.abs(run.elapsed - (45 + STEP)) < 1e-9); assert.equal(run.timeStopRemaining, 10)
  const score = run.elapsed
  run.player.x = 1675; step(run, 60)
  assert.equal(run.elapsed, score); assert.equal(run.exit, null)
  assert.equal(run.pickups[1].collectedAge, PICKUP_ANIMATION_SECONDS)
  assert.equal(run.pickups[0].collectedAge, PICKUP_ANIMATION_SECONDS)
  assert.ok(Math.abs(run.timeStopRemaining - 19.5) < 1e-9)
  const door = goalDoor(level.goal); run.player.x = door.x + door.w / 2; step(run, 1)
  assert.ok(run.exit); assert.equal(run.medal, 'No medal')
  const remaining = run.timeStopRemaining
  run.pickups.push({ definition: stopwatch(run.player.x, 888), collectedAge: null })
  step(run, 240)
  assert.equal(run.finished, true); assert.equal(run.elapsed, score); assert.equal(run.timeStopRemaining, remaining)
  assert.equal(run.pickups[2].collectedAge, null)
})

test('signed times format cleanly and zero/negative personal bests survive storage', () => {
  for (const [seconds, expected] of [[0, '0:00.00'], [-0, '0:00.00'], [-.001, '0:00.00'], [-.01, '-0:00.01'], [-10, '-0:10.00'], [-61.239, '-1:01.23'], [61.239, '1:01.23']]) assert.equal(formatTime(seconds), expected)
  let raw = '{}'
  const storage = { getItem: () => raw, setItem: (_, value) => { raw = value } }
  assert.equal(saveBest(storage, 0, 'level'), 0); assert.equal(readBest(storage, 'level'), 0)
  assert.equal(saveBest(storage, -9.5, 'level'), -9.5); assert.equal(readBest(storage, 'level'), -9.5)
  assert.equal(saveBest(storage, -8, 'level'), -9.5)
  assert.equal(saveBest(storage, -19, 'level'), -19)
  for (const value of [null, '0', {}, false]) { raw = JSON.stringify({ level: value }); assert.equal(readBest(storage, 'level'), null) }
})

test('stopwatches can be authored, moved, copied, deleted, exported and used as templates', () => {
  const added = addItem(blankTrial(), 'stopwatch', { x: 320, y: 840 }, { x: 320, y: 840 })
  assert.deepEqual(added.selection, { kind: 'pickup', index: 0 })
  assert.deepEqual(itemBounds(added.level, added.selection), { x: 320, y: 840, w: 48, h: 52 })
  const copied = duplicateItem(added.level, added.selection)
  const moved = moveItem(copied.level, copied.selection, 100, -80)
  assert.deepEqual(moved.pickups, [stopwatch(344, 872), stopwatch(484, 792)])
  assert.deepEqual(hitItem(moved, 484, 792, 0), copied.selection)
  assert.ok(allSelections(moved).some(s => s.kind === 'pickup' && s.index === 1))
  assert.deepEqual(parseLevel(JSON.parse(JSON.stringify(moved))), moved)
  assert.deepEqual(levelProblems(moved), [])
  assert.deepEqual(copyForEditing(moved).pickups, moved.pickups)
  assert.deepEqual(deleteItem(moved, added.selection).pickups, [stopwatch(484, 792)])
  const taller = resizeLevelHeight(moved, 1200)
  assert.deepEqual(taller.pickups, moved.pickups.map(p => ({ ...p, y: p.y + 280 })))
  const bounded = moveItem(taller, copied.selection, 10000, -10000)
  assert.deepEqual(bounded.pickups[1], stopwatch(1776, 32))
  assert.deepEqual(levelProblems(bounded), [])
  assert.equal(resizeLevelHeight(bounded, 400).height, 1200, 'shrinking cannot crop a pickup at the ceiling')
})

test('pickup JSON validates kind, coordinates, and limits while keeping old files compatible', () => {
  const legacy = blankTrial(); delete legacy.pickups
  assert.deepEqual(parseLevel(legacy), legacy)
  for (const pickups of [null, [{ kind: 'unknown', x: 80, y: 80 }], [stopwatch(NaN, 80)], [stopwatch(80, Infinity)], [stopwatch(0, 80)], [stopwatch(80, 0)], [stopwatch(1800, 80)], [stopwatch(80, 920)], Array.from({ length: 81 }, () => stopwatch(80, 80))]) assert.throws(() => parseLevel({ ...legacy, pickups }))
  const full = { ...legacy, pickups: Array.from({ length: 80 }, () => stopwatch(80, 80)) }
  assert.deepEqual(parseLevel(full), full)
  assert.throws(() => addItem(full, 'stopwatch', { x: 80, y: 80 }, { x: 80, y: 80 }), /80 power-ups/)
  assert.equal(duplicateItem(full, { kind: 'pickup', index: 0 }), null)
})
