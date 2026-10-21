import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial, parseLevel } from '../src/games/jumping/level.ts'
import { gradeFor, gradeTimes, gradeClock } from '../src/games/jumping/grading.ts'
import { passedLevel, unlockedLevels } from '../src/games/jumping/progression.ts'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { NEUTRAL_INPUT } from '../src/games/jumping/model.ts'
import { drawPickup, INACTIVE_TIME_COLOR, STOPWATCH_COLOR } from '../src/games/jumping/pickups.ts'
import { drawWallTimer } from '../src/games/jumping/wallTimer.ts'
import { DIGITAL_DIM } from '../src/games/jumping/digitalDisplay.ts'

const scene = () => ({ ...blankTrial(), times: { a: 1, b: 2, c: 3, d: 4 } })

test('A through D include their exact deadlines; F has no remaining time', () => {
  const level = scene()
  for (const [time, grade] of [[-1, 'A'], [1, 'A'], [1.001, 'B'], [2, 'B'], [2.001, 'C'], [3, 'C'], [3.001, 'D'], [4, 'D'], [4.001, 'F']]) {
    assert.equal(gradeFor(time, level), grade)
    assert.deepEqual(gradeClock(level, time), { grade, remaining: Math.max(0, 4 - time) })
  }
  assert.deepEqual(gradeClock(level, 0, true), { grade: 'F', remaining: 0 })
})

test('old medal files load without rewriting; new saves use four increasing grade targets', () => {
  const level = scene()
  const old = parseLevel({ ...level, times: { gold: 1, silver: 2, bronze: 3 } })
  assert.deepEqual(old.times, { a: 1, b: 2, c: 3, d: 5 })
  assert.deepEqual(gradeTimes({ times: { gold: 1, silver: 2, bronze: 3, d: 8 } }), { a: 1, b: 2, c: 3, d: 8 })
  assert.deepEqual(parseLevel(level).times, level.times)
  for (const times of [{ a: 1, b: 2, c: 3 }, { a: 1, b: 2, c: 3, d: 3 }, { a: 1, b: 2, c: 3, d: NaN }]) {
    assert.throws(() => parseLevel({ ...level, times }))
  }
})

test('F leaves exploration running but time pickups inactive; coins and EMP still collect', () => {
  const level = scene()
  level.pickups = [
    { kind: 'time-bonus', seconds: 10 }, { kind: 'time-penalty', seconds: 10 },
    { kind: 'stopwatch' }, { kind: 'fast-stopwatch' }, { kind: 'coin' }, { kind: 'emp' },
  ].map(pickup => ({ ...pickup, x: level.entrance.x, y: level.entrance.y - 35 }))
  const run = createRun(level)
  run.elapsed = 4
  stepRun(run, { ...NEUTRAL_INPUT, move: 1 })
  assert.equal(run.failed, true)
  assert.ok(run.elapsed > 4)
  assert.ok(run.player.vx > 0, 'ordinary traversal continues')
  assert.ok(run.pickups.slice(0, 4).every(pickup => pickup.collectedAge === null))
  assert.equal(run.timeStopRemaining, 0); assert.equal(run.timeFastRemaining, 0)
  assert.equal(run.coinsCollected, 1); assert.ok(run.empRemaining > 0)
  run.elapsed = 0
  stepRun(run, NEUTRAL_INPUT)
  assert.equal(run.failed, true, 'a score change cannot revive a failed run')
  assert.deepEqual(gradeClock(level, run.elapsed, run.failed), { grade: 'F', remaining: 0 })
})

test('a penalty crossing D fails that run; restart restores collectible time items', () => {
  const level = scene()
  level.pickups = [{ kind: 'time-penalty', seconds: 5, x: level.entrance.x, y: level.entrance.y - 35 }]
  const run = createRun(level)
  stepRun(run, NEUTRAL_INPUT)
  assert.equal(run.failed, true)
  const restarted = createRun(level)
  assert.equal(restarted.failed, false)
  assert.equal(restarted.pickups[0].collectedAge, null)
})

test('only a passing best time proves a timed completion, including older save flags', () => {
  const level = scene()
  assert.equal(passedLevel(level, null, true), false)
  assert.equal(passedLevel(level, 4.001, true), false)
  assert.equal(passedLevel(level, 4, false), true)
  assert.equal(passedLevel({ ...level, timing: 'untimed' }, null, true), true)
  assert.equal(passedLevel({ ...level, timing: 'untimed' }, null, false), false)
  const files = ['one', 'two', 'three'].map(fileName => ({ fileName, level }))
  assert.deepEqual([...unlockedLevels(files, () => false)], ['one'])
  assert.deepEqual([...unlockedLevels(files, file => file.fileName === 'one')], ['one', 'two'])
  assert.deepEqual([...unlockedLevels(files, () => true)], ['one', 'two', 'three'])
})

test('failed wall timers dim their grade and zero digits without an emissive pass', () => {
  const exposures = [], colors = [], blur = []
  const ctx = new Proxy({ globalAlpha: 1, fill() { colors.push(this.fillStyle); blur.push(this.shadowBlur) } },
    { get: (object, key) => key in object ? object[key] : () => {} })
  drawWallTimer(ctx, { x: 0, y: 0 }, 0, 'fast', (_ctx, exposure, draw) => { exposures.push(exposure); draw() }, 'F')
  assert.deepEqual(exposures, [0, 0])
  assert.ok(colors.includes(DIGITAL_DIM))
  assert.equal(blur.at(-1), 0)
})

test('inactive time bonuses, penalties and stopwatches draw grey while coins keep their color', () => {
  globalThis.Path2D ??= class {}
  const capture = (kind, inactive) => {
    const colors = []
    const ctx = new Proxy({ globalAlpha: 1, fill() { colors.push(this.fillStyle) }, stroke() { colors.push(this.strokeStyle) } },
      { get: (object, key) => key in object ? object[key] : () => {} })
    drawPickup(ctx, { definition: { kind, seconds: 5, x: 0, y: 0 }, collectedAge: null }, 0, inactive)
    return colors
  }
  for (const kind of ['time-bonus', 'time-penalty', 'stopwatch', 'fast-stopwatch']) {
    assert.ok(capture(kind, true).every(color => color === INACTIVE_TIME_COLOR))
    assert.ok(!capture(kind, false).includes(INACTIVE_TIME_COLOR))
  }
  assert.ok(capture('stopwatch', false).includes(STOPWATCH_COLOR))
  assert.deepEqual(capture('coin', true), capture('coin', false))
})
