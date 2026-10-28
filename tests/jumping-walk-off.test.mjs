import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { readLevelAsset } from './helpers/jumping-fixtures.mjs'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { parseLevel, levelProblems, levelTerrain } from '../src/games/jumping/level.ts'
import { NEUTRAL_INPUT, TUNING, STEP } from '../src/games/jumping/model.ts'
import { drawGoal, drawGoalDoor } from '../src/games/jumping/challengeRender.ts'
import { gameCamera } from '../src/games/jumping/camera.ts'
import { moveItem, setFinish } from '../src/games/jumping/editor.ts'
import { saveExteriorProgress, restoreExteriorProgress } from '../src/games/jumping/exteriorProgress.ts'

const fixture = () => readLevelAsset('walk-off.json')

test('a run-off ending round-trips, requires the right edge, and validates clear supported footing', () => {
  const level = fixture()
  assert.deepEqual(parseLevel(JSON.parse(JSON.stringify(level))), level)
  assert.deepEqual(levelProblems(level), [])
  for (const patch of [{ timing: undefined }, { goal: { ...level.goal, x: 1100 } },
    { goal: { ...level.goal, flipX: true } }, { goal: { ...level.goal, power: 'switched', id: 'bad' } }]) {
    assert.throws(() => parseLevel({ ...level, ...patch }))
  }
  assert.ok(levelProblems({ ...level, platforms: [] }).some(p => p.includes('run-off')))
  assert.ok(levelProblems({ ...level, platforms: [...level.platforms, { x: 1160, y: 320, w: 40, h: 20 }] }).some(p => p.includes('run-off')))
})

for (const dt of [STEP, 1 / 30]) for (const jumping of [false, true]) test(`normal ${jumping ? 'jumping' : 'running'} input leaves the right edge at ${1 / dt} Hz`, () => {
  const level = fixture(), run = createRun(level)
  let crossed = false
  for (let tick = 0; tick < 8 / dt && !run.finished; tick++) {
    const jump = jumping && run.player.x > level.width - 120
    stepRun(run, { ...NEUTRAL_INPUT, move: 1, jump }, dt)
    crossed ||= run.player.x > level.width
    if (run.player.x < level.width + TUNING.width) assert.equal(run.finished, false)
  }
  assert.ok(crossed && run.finished)
  assert.ok(run.player.x >= level.width + TUNING.width)
  assert.equal(run.grade, null); assert.equal(run.elapsed, 0); assert.equal(run.exit, null)
  const view = gameCamera(1280, 800, run.player, level, true)
  assert.equal(view.x + 1280 / view.zoom, level.width, 'the final view ends at the open edge')
})

test('a crate crossing the edge does not finish the player; ordinary right boundaries remain solid', () => {
  const level = fixture(); level.props = [{ kind: 'box', x: 1160, y: 400, size: 40 }]
  const run = createRun(level); run.props[0].vx = 500
  for (let tick = 0; tick < 120; tick++) stepRun(run, NEUTRAL_INPUT)
  assert.ok(run.props[0].x > level.width, 'the crate actually crosses the open boundary')
  assert.equal(run.finished, false)
  const regular = setFinish(level, 'doorway'), wall = levelTerrain(regular).at(-1)
  assert.equal(wall.x, regular.width); assert.equal(wall.y, 0)
  assert.equal(levelTerrain(level).at(-1).y, level.goal.y)
})

test('the run-off marker stays on the edge when moved, and no door or indicator is painted during play', () => {
  const level = fixture(), moved = moveItem(level, { kind: 'goal', index: 0 }, 200, 300)
  assert.equal(moved.goal.x, level.width)
  const ctx = new Proxy({}, { get() { return () => assert.fail('run-off artwork must be studio-only') } })
  drawGoal(ctx, level.goal); drawGoalDoor(ctx, level.goal, 1)
  const door = setFinish(level, 'doorway')
  assert.deepEqual(levelProblems(door), [])
  assert.deepEqual(levelProblems(setFinish(door, 'walk-off')), [])
})

test('Exit ends on its continuous outdoor ground instead of its former door platform', () => {
  const level = parseLevel(JSON.parse(readFileSync(new URL('../public/levels/jumping/exit.jump-level.json', import.meta.url))))
  assert.deepEqual(level.goal, { kind: 'walk-off', x: level.width, y: 2320 })
  assert.equal(level.timing, 'untimed'); assert.deepEqual(levelProblems(level), [])
  assert.ok(!level.platforms.some(b => b.x === 19780 && b.y === 2245), 'the raised door plinth is removed')
})

test('run-off progress resumes safe outdoor footing and never replaces it with an off-map position', () => {
  const data = new Map(), storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }
  const run = createRun(fixture())
  for (let tick = 0; tick < 120; tick++) stepRun(run, { ...NEUTRAL_INPUT, move: 1 })
  saveExteriorProgress(storage, run)
  assert.equal(data.size, 1)
  const resumed = createRun(fixture()), saved = [...data.values()][0]
  assert.equal(restoreExteriorProgress(storage, resumed), true)
  assert.equal(resumed.player.x, run.player.x)
  let departing = false
  for (let tick = 0; tick < 8 / STEP && !resumed.finished; tick++) {
    stepRun(resumed, { ...NEUTRAL_INPUT, move: 1 })
    if (resumed.player.x > resumed.level.width - 30) {
      departing = true; saveExteriorProgress(storage, resumed)
      assert.equal([...data.values()][0], saved)
    }
  }
  assert.ok(departing && resumed.finished)
})
