import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial, levelProblems, parseLevel } from '../src/games/jumping/level.ts'
import { addItem, deleteItem, duplicateItem, hitItem, moveItem, resizeLevelHeight } from '../src/games/jumping/editor.ts'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { NEUTRAL_INPUT } from '../src/games/jumping/model.ts'
import { WALL_TIMER_WIDTH, WALL_TIMER_HEIGHT, formatWallTime } from '../src/games/jumping/wallTimer.ts'

test('multiple wall timers can be authored, moved, copied, deleted, and exported', () => {
  const added = addItem(blankTrial(), 'timer', { x: 320, y: 720 }, { x: 320, y: 720 })
  assert.deepEqual(added.selection, { kind: 'timer', index: 0 })
  const copied = duplicateItem(added.level, added.selection)
  assert.deepEqual(copied.level.timers, [{ x: 320, y: 720 }, { x: 360, y: 720 }])
  const moved = moveItem(copied.level, copied.selection, 120, -60)
  assert.deepEqual(moved.timers[1], { x: 480, y: 660 })
  assert.deepEqual(parseLevel(JSON.parse(JSON.stringify(moved))), moved)
  assert.deepEqual(levelProblems(moved), [])
  assert.deepEqual(hitItem(moved, 490, 670, 0), copied.selection)
  assert.deepEqual(deleteItem(moved, added.selection).timers, [{ x: 480, y: 660 }])
})

test('timers stay on the back wall when terrain moves and preserve height above the floor when the room grows', () => {
  const level = blankTrial(); level.timers = [{ x: 320, y: 300 }]
  level.platforms = [{ x: 300, y: 280, w: 300, h: 100 }]
  assert.deepEqual(hitItem(level, 330, 320, 0), { kind: 'platform', index: 0 }, 'terrain is in front of the timer')
  const moved = moveItem(level, { kind: 'platform', index: 0 }, 100, 100)
  assert.deepEqual(moved.timers, level.timers)
  const taller = resizeLevelHeight(moved, 1200)
  assert.deepEqual(taller.timers, [{ x: 320, y: 580 }])
  assert.equal(taller.floor - taller.timers[0].y, level.floor - level.timers[0].y)
  const bounded = moveItem(taller, { kind: 'timer', index: 0 }, 10000, 10000)
  assert.deepEqual(bounded.timers[0], { x: level.width - WALL_TIMER_WIDTH, y: 1200 - WALL_TIMER_HEIGHT })
})

test('wall timers do not obstruct players, boxes, or balls', () => {
  const level = blankTrial()
  level.props = [{ kind: 'box', x: 420, y: 920, size: 60 }, { kind: 'ball', x: 700, y: 920, size: 60 }]
  const empty = createRun(level), decorated = createRun({ ...level, timers: [{ x: 250, y: 860 }, { x: 500, y: 860 }] })
  for (let i = 0; i < 500; i++) {
    const input = { ...NEUTRAL_INPUT, move: 1, jump: i >= 100 && i < 135 }
    stepRun(empty, input); stepRun(decorated, input)
    assert.deepEqual(decorated.player, empty.player)
    assert.deepEqual(decorated.props, empty.props)
  }
  assert.deepEqual(decorated.platforms, empty.platforms)
  assert.equal(decorated.elapsed, empty.elapsed)
})

test('timer JSON is bounded and older files without timers remain readable', () => {
  const legacy = blankTrial(); delete legacy.timers
  assert.deepEqual(parseLevel(legacy), legacy)
  for (const timers of [null, [{ x: NaN, y: 10 }], [{ x: 1681, y: 10 }], [{ x: 10, y: 900 }], Array.from({ length: 41 }, () => ({ x: 20, y: 20 }))]) {
    assert.throws(() => parseLevel({ ...legacy, timers }))
  }
})


test('wall faces show whole minutes and seconds, saturating without truncating run scoring', () => {
  for (const [seconds, face] of [[0, '00:00'], [9.99, '00:09'], [59.99, '00:59'], [60, '01:00'],
    [3598.9, '59:58'], [3599, '59:59'], [3600, '59:59'], [7200, '59:59']]) assert.equal(formatWallTime(seconds), face)
  const run = createRun(blankTrial()); run.elapsed = 3600; run.started = true
  stepRun(run, NEUTRAL_INPUT)
  assert.ok(run.elapsed > 3600)
  assert.equal(formatWallTime(run.elapsed), '59:59')
})

test('old clock positions remain unchanged and smaller clocks fit at new room edges', () => {
  const level = blankTrial()
  for (const timer of [{ x: 1600, y: 860 }, { x: 1608, y: 868 }, { x: 1680, y: 880 }]) {
    assert.deepEqual(parseLevel({ ...level, timers: [timer] }).timers, [timer])
  }
})
