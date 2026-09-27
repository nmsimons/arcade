import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial, parseLevel, levelProblems } from '../src/games/jumping/level.ts'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { addItem, duplicateItem, moveItem, deleteItem, setPickupSeconds, resizeLevelHeight } from '../src/games/jumping/editor.ts'
import { TIME_BONUS_LABEL_SECONDS, pickupBounds } from '../src/games/jumping/pickups.ts'
import { JumpingAudioState } from '../src/games/jumping/audioState.ts'
import { goalDoor } from '../src/games/jumping/goal.ts'

const bonus = (seconds, x = 160, y = 888) => ({ kind: 'time-bonus', seconds, x, y })
const fixture = pickups => ({ ...blankTrial(), pickups })
for (const seconds of [1, 5, 9]) for (const elapsed of [0, 2, 15]) {
  test(`${seconds}-second bonus removes available time from ${elapsed} seconds once`, () => {
    const level = fixture([bonus(seconds)]), run = createRun(level)
    run.elapsed = elapsed; run.started = true
    stepRun(run, NEUTRAL_INPUT)
    assert.ok(Math.abs(run.elapsed - Math.max(0, elapsed + STEP - seconds)) < 1e-9)
    assert.equal(run.timeStopRemaining, 0)
    assert.equal(run.coinsCollected, 0)
    const after = run.elapsed
    for (let i = 0; i < 120; i++) stepRun(run, NEUTRAL_INPUT)
    assert.ok(Math.abs(run.elapsed - after - 1) < 1e-9, 'excess time is not banked for future use')
    assert.equal(run.pickups[0].collectedAge, TIME_BONUS_LABEL_SECONDS)
    assert.deepEqual(level.pickups, [bonus(seconds)], 'authored definitions are unchanged')
    const restarted = createRun(run.level)
    assert.equal(restarted.elapsed, 0); assert.equal(restarted.pickups[0].collectedAge, null)
  })
}

test('bonuses combine immediately without spending a stopwatch pause or affecting coins', () => {
  const run = createRun(fixture([bonus(3), bonus(4), { kind: 'stopwatch', x: 160, y: 888 }, { kind: 'coin', x: 160, y: 888 }]))
  run.started = true; run.elapsed = 12; run.timeStopRemaining = 2
  stepRun(run, NEUTRAL_INPUT)
  assert.equal(run.elapsed, 5); assert.equal(run.coinsCollected, 1)
  assert.ok(Math.abs(run.timeStopRemaining - (12 - STEP)) < 1e-9)
  for (let i = 0; i < 120; i++) stepRun(run, NEUTRAL_INPUT)
  assert.equal(run.elapsed, 5)
})

test('only player contact collects bonuses, and contact respects crouched height', () => {
  const level = fixture([bonus(5, 160, 852), bonus(5, 500, 888)])
  level.props = [{ kind: 'ball', x: 500, y: 920, size: 80 }]
  const run = createRun(level); run.player.crouching = true
  stepRun(run, NEUTRAL_INPUT)
  assert.ok(run.pickups.every(p => p.collectedAge === null))
  run.player.crouching = false; stepRun(run, NEUTRAL_INPUT)
  assert.equal(run.pickups[0].collectedAge, 0); assert.equal(run.pickups[1].collectedAge, null)
})

test('time bonuses use the stopwatch sound once, including collection at zero and after a reset', () => {
  const run = createRun(fixture([bonus(5)])), audio = new JumpingAudioState()
  audio.reset(run.player, run); stepRun(run, NEUTRAL_INPUT); audio.step(run.player, run, STEP)
  assert.equal(run.elapsed, 0)
  assert.deepEqual(audio.drain().cues.map(c => c.kind), ['timer-paused'])
  for (let i = 0; i < 60; i++) { stepRun(run, NEUTRAL_INPUT); audio.step(run.player, run, STEP) }
  assert.deepEqual(audio.drain().cues, [])
  audio.reset(run.player, run); audio.step(run.player, run, STEP)
  assert.deepEqual(audio.drain().cues, [])
  const fresh = createRun(run.level); audio.reset(fresh.player, fresh)
  stepRun(fresh, NEUTRAL_INPUT); audio.step(fresh.player, fresh, STEP)
  assert.deepEqual(audio.drain().cues.map(c => c.kind), ['timer-paused'])
})

test('bonuses can improve the medal before exit entry, but never after the score locks', () => {
  const level = fixture([bonus(9, 1620)]), run = createRun(level)
  run.started = true; run.elapsed = 15; Object.assign(run.player, level.goal)
  stepRun(run, NEUTRAL_INPUT)
  assert.ok(run.goalLit); assert.ok(run.elapsed < 7)
  run.goalElapsed = 1; run.player.x = goalDoor(level.goal).x + goalDoor(level.goal).w / 2
  stepRun(run, NEUTRAL_INPUT)
  assert.ok(run.exit); assert.equal(run.medal, 'Gold')
  const score = run.elapsed
  run.pickups.push({ definition: bonus(9, run.player.x), collectedAge: null })
  for (let i = 0; i < 240; i++) stepRun(run, NEUTRAL_INPUT)
  assert.equal(run.elapsed, score); assert.equal(run.pickups[1].collectedAge, null)
})

test('time bonuses edit, duplicate, move, undo through immutable values, and round-trip through JSON', () => {
  const added = addItem(blankTrial(), 'time-bonus', { x: 300, y: 800 }, { x: 300, y: 800 })
  assert.equal(added.level.pickups[0].seconds, 5)
  const changed = setPickupSeconds(added.level, 0, 9)
  assert.equal(added.level.pickups[0].seconds, 5)
  assert.equal(setPickupSeconds(changed, 0, 99).pickups[0].seconds, 9)
  assert.equal(setPickupSeconds(changed, 0, -10).pickups[0].seconds, 1)
  assert.equal(setPickupSeconds(changed, 0, 3.6).pickups[0].seconds, 4)
  assert.equal(setPickupSeconds(changed, 0, NaN).pickups[0].seconds, 9)
  const copied = duplicateItem(changed, added.selection)
  const moved = moveItem(copied.level, copied.selection, 160, -80)
  const taller = resizeLevelHeight(moved, 1200)
  assert.equal(taller.pickups[1].seconds, 9)
  assert.deepEqual(parseLevel(JSON.parse(JSON.stringify(taller))), taller)
  assert.deepEqual(levelProblems(taller), [])
  assert.equal(deleteItem(taller, added.selection).pickups.length, 1)
  assert.deepEqual(pickupBounds(bonus(5, 300, 800)), pickupBounds({ kind: 'stopwatch', x: 300, y: 800 }))
})

test('shared levels require a finite integer number from 1 to 9', () => {
  for (const seconds of [undefined, null, '5', 0, -1, 10, 1.5, NaN, Infinity, {}, []]) {
    assert.throws(() => parseLevel(fixture([bonus(seconds)])), String(seconds))
  }
  for (let seconds = 1; seconds <= 9; seconds++) assert.deepEqual(parseLevel(fixture([bonus(seconds)])).pickups, [bonus(seconds)])
  assert.throws(() => parseLevel(fixture(Array.from({ length: 81 }, () => bonus(5)))))
})
