import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial, parseLevel, levelProblems } from '../src/games/jumping/level.ts'
import { createRun, stepRun, saveBest } from '../src/games/jumping/challenge.ts'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { addItem, duplicateItem, moveItem, deleteItem, setPickupSeconds, resizeLevelHeight } from '../src/games/jumping/editor.ts'
import { FAST_STOPWATCH_SECONDS, TIME_BONUS_LABEL_SECONDS, pickupBounds } from '../src/games/jumping/pickups.ts'
import { JumpingAudioState } from '../src/games/jumping/audioState.ts'
import { goalDoor } from '../src/games/jumping/goal.ts'

const penalty = (seconds = 5, x = 160, y = 888) => ({ kind: 'time-penalty', seconds, x, y })
const fastWatch = (x = 160, y = 888) => ({ kind: 'fast-stopwatch', x, y })
const fixture = pickups => ({ ...blankTrial(), pickups })
const step = (run, frames, input = NEUTRAL_INPUT) => { for (let i = 0; i < frames; i++) stepRun(run, input) }
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} ≈ ${expected}`)

for (const seconds of [1, 5, 9]) for (const elapsed of [0, 2, 15]) {
  test(`${seconds}-second penalty adds to ${elapsed} seconds once`, () => {
    const level = fixture([penalty(seconds)]), run = createRun(level)
    run.elapsed = elapsed; run.started = true
    step(run, 1); near(run.elapsed, elapsed + STEP + seconds)
    assert.equal(run.timeStopRemaining, 0); assert.equal(run.timeFastRemaining, 0); assert.equal(run.coinsCollected, 0)
    step(run, 120); near(run.elapsed, elapsed + STEP + seconds + 1)
    assert.equal(run.pickups[0].collectedAge, TIME_BONUS_LABEL_SECONDS)
    assert.deepEqual(level.pickups, [penalty(seconds)])
    const reset = createRun(level)
    assert.equal(reset.elapsed, 0); assert.equal(reset.pickups[0].collectedAge, null)
  })
}

test('a fast stopwatch runs at double speed for exactly five gameplay seconds', () => {
  const run = createRun(fixture([fastWatch()]))
  step(run, 120)
  assert.equal(run.started, false); assert.equal(run.elapsed, 0)
  assert.equal(run.timeFastRemaining, FAST_STOPWATCH_SECONDS, 'waiting to start never spends the effect')
  step(run, 600, { ...NEUTRAL_INPUT, climb: true })
  near(run.elapsed, 10); near(run.timeFastRemaining, 0); near(run.activeTime, 5)
  step(run, 120); near(run.elapsed, 11); assert.equal(run.timeFastRemaining, 0)
  const reset = createRun(run.level)
  assert.equal(reset.elapsed, 0); assert.equal(reset.timeFastRemaining, 0); assert.equal(reset.pickups[0].collectedAge, null)
})

test('extra fast watches extend the effect without increasing the multiplier', () => {
  const run = createRun(fixture([fastWatch(), fastWatch(165), fastWatch(500)]))
  step(run, 1); assert.equal(run.timeFastRemaining, 10)
  run.started = true; step(run, 120)
  near(run.elapsed, 2); near(run.timeFastRemaining, 9)
  run.player.x = 500; step(run, 1)
  near(run.elapsed, 2 + 2 * STEP); near(run.timeFastRemaining, 14 - STEP)
  step(run, 1680); near(run.timeFastRemaining, 0); near(run.elapsed, 30 + STEP)
})

test('freeze takes precedence while both durations count down, including fractional expiration', () => {
  const run = createRun(fixture([fastWatch(), { kind: 'stopwatch', x: 160, y: 888 }]))
  step(run, 1); run.started = true
  step(run, 600); near(run.elapsed, 0); near(run.timeFastRemaining, 0); near(run.timeStopRemaining, 5)
  step(run, 720); near(run.elapsed, 1)
  for (const [frozen, fast, added] of [[0, .5, 1.5], [.25, .75, 1.25], [.75, .25, .25], [.25, 2, 1.5], [2, .5, 0]]) {
    run.timeStopRemaining = frozen * STEP; run.timeFastRemaining = fast * STEP; run.elapsed = 4
    step(run, 1)
    near(run.elapsed, 4 + added * STEP)
    near(run.timeFastRemaining, Math.max(0, (fast - 1) * STEP))
  }
})

test('numbered penalties apply during a freeze and simultaneous bonuses combine independent of file order', () => {
  const items = [penalty(9), { kind: 'time-bonus', seconds: 5, x: 160, y: 888 }, { kind: 'coin', x: 160, y: 888 }]
  for (const pickups of [items, [...items].reverse()]) {
    const run = createRun(fixture(pickups)); run.timeStopRemaining = 10; run.started = true
    step(run, 1); assert.equal(run.elapsed, 4); assert.equal(run.coinsCollected, 1)
    near(run.timeStopRemaining, 10 - STEP)
  }
})

test('harmful pickups change scoring without changing player, prop, or robot simulation', () => {
  const level = blankTrial()
  level.props = [{ kind: 'box', x: 700, y: 920, size: 60 }]
  level.robots = [{ x: 1000, y: 920, left: 900, right: 1300 }]
  parseLevel(level)
  const plain = createRun(level), harmful = createRun({ ...level, pickups: [fastWatch(), penalty(5)] })
  for (let i = 0; i < 180; i++) {
    const input = { ...NEUTRAL_INPUT, move: 1, crouch: i > 90 }
    stepRun(plain, input); stepRun(harmful, input)
    assert.deepEqual(harmful.player, plain.player); assert.deepEqual(harmful.props, plain.props); assert.deepEqual(harmful.robots, plain.robots)
  }
  assert.ok(harmful.elapsed > plain.elapsed + 5)
})

for (const item of [penalty(), fastWatch()]) {
  test(`${item.kind} respects player contact, crouching, and the collection sound does not repeat`, () => {
    const level = fixture([{ ...item, y: 852 }, { ...item, x: 500 }])
    level.props = [{ kind: 'ball', x: 500, y: 920, size: 80 }]
    const run = createRun(level), audio = new JumpingAudioState()
    run.player.crouching = true; audio.reset(run.player, run)
    step(run, 1); assert.ok(run.pickups.every(p => p.collectedAge === null))
    run.player.crouching = false; step(run, 1); audio.step(run.player, run, STEP)
    assert.equal(run.pickups[0].collectedAge, 0); assert.equal(run.pickups[1].collectedAge, null)
    assert.deepEqual(audio.drain().cues.map(c => c.kind), ['time-penalty'])
    step(run, 120); audio.step(run.player, run, STEP); assert.deepEqual(audio.drain().cues, [])
    audio.reset(run.player, run); audio.step(run.player, run, STEP); assert.deepEqual(audio.drain().cues, [])
    const fresh = createRun(level); audio.reset(fresh.player, fresh); step(fresh, 1); audio.step(fresh.player, fresh, STEP)
    assert.deepEqual(audio.drain().cues.map(c => c.kind), ['time-penalty'])
  })
}

test('penalties affect the medal and saved result before exit, but cannot alter a locked score', () => {
  const level = fixture([penalty(9, 1620), fastWatch(1620)]), run = createRun(level)
  level.times = { gold: 10, silver: 20, bronze: 30 }
  run.started = true; run.elapsed = 5; Object.assign(run.player, level.goal)
  step(run, 1); assert.ok(run.goalLit); assert.ok(run.elapsed > 14)
  run.goalElapsed = 1; run.player.x = goalDoor(level.goal).x + goalDoor(level.goal).w / 2
  step(run, 1); assert.ok(run.exit); assert.equal(run.medal, 'Silver')
  const score = run.elapsed
  const storage = { value: null, getItem() { return this.value }, setItem(key, value) { this.value = value } }
  assert.equal(saveBest(storage, score, level.id), score)
  run.pickups.push({ definition: penalty(9, run.player.x), collectedAge: null })
  step(run, 240); assert.equal(run.elapsed, score); assert.equal(run.pickups[2].collectedAge, null)
})

for (const kind of ['time-penalty', 'fast-stopwatch']) {
  test(`${kind} can be authored, duplicated, moved, resized, deleted, and round-tripped`, () => {
    const added = addItem(blankTrial(), kind, { x: 300, y: 800 }, { x: 300, y: 800 })
    const changed = setPickupSeconds(added.level, 0, 7)
    if (kind === 'time-penalty') {
      assert.equal(added.level.pickups[0].seconds, 5); assert.equal(changed.pickups[0].seconds, 7)
      for (const [input, expected] of [[-1, 1], [99, 9], [3.6, 4], [NaN, 7]]) assert.equal(setPickupSeconds(changed, 0, input).pickups[0].seconds, expected)
    } else assert.deepEqual(changed, added.level)
    const copied = duplicateItem(changed, added.selection)
    const taller = resizeLevelHeight(moveItem(copied.level, copied.selection, 160, -80), 1200)
    assert.equal(taller.pickups[1].kind, kind)
    assert.deepEqual(parseLevel(JSON.parse(JSON.stringify(taller))), taller); assert.deepEqual(levelProblems(taller), [])
    assert.equal(deleteItem(taller, added.selection).pickups.length, 1)
    assert.deepEqual(pickupBounds(taller.pickups[1]), pickupBounds({ ...taller.pickups[1], kind: 'stopwatch' }))
    assert.throws(() => parseLevel(fixture(Array.from({ length: 81 }, () => taller.pickups[0]))))
  })
}

test('shared penalties require a finite integer from 1 to 9 and reject invalid positions', () => {
  for (const seconds of [undefined, null, '5', 0, -1, 10, 1.5, NaN, Infinity, {}, []]) assert.throws(() => parseLevel(fixture([{ ...penalty(), seconds }])), String(seconds))
  for (let seconds = 1; seconds <= 9; seconds++) assert.deepEqual(parseLevel(fixture([penalty(seconds)])).pickups, [penalty(seconds)])
  for (const item of [penalty(), fastWatch()]) for (const point of [{ x: 0 }, { y: 0 }, { x: NaN }, { y: Infinity }, { x: 1800 }, { y: 920 }]) {
    assert.throws(() => parseLevel(fixture([{ ...item, ...point }])))
  }
})
