import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial, parseLevel } from '../src/games/jumping/level.ts'
import { gradeFor, gradeTimes, gradeClock } from '../src/games/jumping/grading.ts'
import { passedLevel, unlockedLevels } from '../src/games/jumping/progression.ts'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { NEUTRAL_INPUT } from '../src/games/jumping/model.ts'
import { drawPickup, PICKUP_LOST_SECONDS } from '../src/games/jumping/pickups.ts'
import { drawCoinSwitch } from '../src/games/jumping/coins.ts'
import { goalDoor } from '../src/games/jumping/goal.ts'
import { drawWallTimer } from '../src/games/jumping/wallTimer.ts'
import { DIGITAL_DIM, DIGITAL_GREEN } from '../src/games/jumping/digitalDisplay.ts'

const scene = () => ({ ...blankTrial(), times: { a: 1, b: 2, c: 3, d: 4 } })
const steps = (run, count, input = NEUTRAL_INPUT) => { for (let i = 0; i < count; i++) stepRun(run, input) }

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

test('F powers the level down for the rest of the run, but its exit opens', () => {
  const level = scene()
  level.pickups = [
    { kind: 'time-bonus', seconds: 10 }, { kind: 'time-penalty', seconds: 10 },
    { kind: 'stopwatch' }, { kind: 'fast-stopwatch' }, { kind: 'coin' }, { kind: 'emp' },
  ].map(pickup => ({ ...pickup, x: level.entrance.x, y: level.entrance.y - 35 }))
  level.goal = { ...level.goal, id: 'exit', power: 'switched' }
  level.forceFields = [{ id: 'barrier', x: 900, y: 520, w: 12, h: 400, orientation: 'vertical', power: 'always' }]
  level.mechanisms = [{ id: 'lift', kind: 'lift', x: 1100, y: 890, w: 140, h: 22, travel: 300, power: 'always' }]
  const powered = createRun({ ...level, pickups: [] })
  steps(powered, 120)
  assert.equal(powered.goalLit, false); assert.equal(powered.forceFields[0].active, true)
  assert.notEqual(powered.mechanisms[0].y, 890, 'the lift runs while the level has power')

  const run = createRun(level)
  run.elapsed = 4
  stepRun(run, { ...NEUTRAL_INPUT, move: 1 })
  assert.equal(run.failed, true)
  assert.ok(run.player.vx > 0, 'ordinary traversal continues')
  assert.ok(run.pickups.every(pickup => pickup.collectedAge === null && pickup.lostAge === 0), 'every pickup is taken away, none collected')
  assert.equal(run.coinsCollected, 0); assert.equal(run.empRemaining, 0)
  assert.equal(run.timeStopRemaining, 0); assert.equal(run.timeFastRemaining, 0)
  assert.equal(run.forceFields[0].active, false, 'fields switch off')
  assert.equal(run.goalLit, true, 'the switched exit opens')
  const liftY = run.mechanisms[0].y
  steps(run, 120)
  assert.equal(run.mechanisms[0].y, liftY, 'the lift stops where it was')
  assert.ok(run.pickups.every(pickup => pickup.lostAge === PICKUP_LOST_SECONDS))
  run.elapsed = 0
  stepRun(run, NEUTRAL_INPUT)
  assert.equal(run.failed, true, 'a score change cannot revive a failed run')
  assert.equal(run.forceFields[0].active, false)
  assert.deepEqual(gradeClock(level, run.elapsed, run.failed), { grade: 'F', remaining: 0 })

  // The player can still leave, with an F.
  const door = goalDoor(level.goal); run.player.x = door.x + door.w / 2
  stepRun(run, { ...NEUTRAL_INPUT, climb: true })
  assert.ok(run.exit); assert.equal(run.grade, 'F')
  for (let i = 0; i < 240 && !run.finished; i++) stepRun(run, NEUTRAL_INPUT)
  assert.equal(run.finished, true)

  // Restart (a fresh run) restores power, every pickup and the shut exit.
  const restarted = createRun(level)
  assert.equal(restarted.failed, false); assert.equal(restarted.goalLit, false)
  assert.ok(restarted.pickups.every(pickup => pickup.collectedAge === null && pickup.lostAge === undefined))
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

test('powered-down pickups flicker out where they stood, with no collection burst', () => {
  globalThis.Path2D ??= class {}
  const capture = pickup => {
    const alphas = []
    const ctx = new Proxy({ globalAlpha: 1, fill() { alphas.push(this.globalAlpha) }, stroke() { alphas.push(this.globalAlpha) } },
      { get: (object, key) => key in object ? object[key] : () => {} })
    drawPickup(ctx, pickup, 0)
    return alphas
  }
  for (const kind of ['time-bonus', 'time-penalty', 'stopwatch', 'fast-stopwatch', 'coin', 'emp']) {
    const definition = { kind, seconds: 5, x: 0, y: 0 }
    assert.ok(capture({ definition, collectedAge: null }).every(alpha => alpha === 1), kind)
    const fading = capture({ definition, collectedAge: null, lostAge: PICKUP_LOST_SECONDS / 2 })
    assert.ok(fading.length && fading.every(alpha => alpha > 0 && alpha < 1), kind)
    assert.deepEqual(capture({ definition, collectedAge: null, lostAge: PICKUP_LOST_SECONDS }), [], kind)
  }
})

test('a powered-down coin meter dims like a failed wall clock', () => {
  globalThis.Path2D ??= class {}
  for (const display of ['digital', 'bar']) {
    const exposures = [], colors = []
    const ctx = new Proxy({ globalAlpha: 1, fill() { colors.push(this.fillStyle) } },
      { get: (object, key) => key in object ? object[key] : () => {} })
    drawCoinSwitch(ctx, { x: 0, y: 0, w: 120, threshold: 3, display }, 3, true, (_ctx, exposure, draw) => { exposures.push(exposure); draw() }, true)
    assert.ok(exposures.every(exposure => exposure === 0), display)
    assert.ok(colors.includes(DIGITAL_DIM) && !colors.includes(DIGITAL_GREEN), display)
  }

})
