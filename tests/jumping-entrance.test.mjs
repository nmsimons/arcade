import test from 'node:test'
import assert from 'node:assert/strict'
import { createRun, createPreviewRun, stepRun } from '../src/games/jumping/challenge.ts'
import { blankTrial, parseLevel, spawnProblem } from '../src/games/jumping/level.ts'
import { ENTRANCE_SECONDS, entranceDoor, entranceOpening, GOAL_DOOR_HEIGHT, GOAL_DOOR_WIDTH } from '../src/games/jumping/goal.ts'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { itemOutline, hitItem, moveItem } from '../src/games/jumping/editor.ts'
import { placeOnSurface } from '../src/games/jumping/editorPlacement.ts'

test('entrance holds a silhouette, closes like the exit, and activates without input', () => {
  const level = blankTrial()
  level.mechanisms = [{ id: 'carrier', kind: 'lift', x: 500, y: 700, w: 140, h: 20, travel: 100, power: 'always' }]
  level.pickups = [{ kind: 'coin', x: level.entrance.x, y: level.entrance.y - 30 }]
  for (let restart = 0; restart < 2; restart++) {
    const run = createRun(level), player = structuredClone(run.player), machinery = structuredClone(run.mechanisms)
    assert.equal(entranceOpening(run.entrance.elapsed), 1)
    stepRun(run, { ...NEUTRAL_INPUT, move: 1, jump: true }, ENTRANCE_SECONDS - STEP)
    assert.deepEqual(run.player, player, 'input cannot move or buffer a jump during entry')
    assert.deepEqual(run.mechanisms, machinery)
    assert.equal(run.coinsCollected, 0); assert.equal(run.elapsed, 0); assert.equal(run.activeTime, 0)
    assert.ok(entranceOpening(run.entrance.elapsed) > 0 && entranceOpening(run.entrance.elapsed) < 1)
    stepRun(run, NEUTRAL_INPUT)
    assert.equal(run.entrance, null); assert.equal(run.started, true)
    assert.equal(run.elapsed, 0); assert.equal(run.activeTime, 0)
    stepRun(run, NEUTRAL_INPUT)
    assert.equal(run.elapsed, STEP); assert.equal(run.activeTime, STEP)
    assert.ok(run.mechanisms[0].y < machinery[0].y, 'machinery activates without player input')
    assert.equal(run.coinsCollected, 1)
    assert.equal(run.player.grounded, true, 'early jump has not been queued')
  }
})

test('a step crossing closure only spends its remaining time on gameplay; previews stay static', () => {
  const run = createRun(blankTrial())
  stepRun(run, NEUTRAL_INPUT, ENTRANCE_SECONDS - .02)
  stepRun(run, NEUTRAL_INPUT, .05)
  assert.ok(Math.abs(run.elapsed - .03) < 1e-9)
  const preview = createPreviewRun(blankTrial()), before = structuredClone(preview)
  stepRun(preview, { ...NEUTRAL_INPUT, move: 1 }, 10)
  assert.deepEqual(preview, before)
})

test('legacy player positions load as entrances; saving uses the entrance field and retains names', () => {
  const old = blankTrial(), start = { ...old.entrance, name: 'Side door' }
  delete old.entrance; old.spawn = start
  const level = parseLevel(old)
  assert.deepEqual(level.entrance, start); assert.equal('spawn' in level, false)
  assert.deepEqual(parseLevel({ ...old, entrance: { x: 300, y: 920 } }).entrance, { x: 300, y: 920 })
})

test('entrances require a flat, supported, unobstructed doorway, and editor selection covers the door', () => {
  const level = blankTrial(), door = entranceDoor(level.entrance)
  assert.equal(door.w, GOAL_DOOR_WIDTH); assert.equal(door.h, GOAL_DOOR_HEIGHT)
  assert.equal(spawnProblem(level), null)
  assert.deepEqual(itemOutline(level, { kind: 'entrance', index: 0 }), door)
  assert.deepEqual(hitItem(level, door.x + 1, door.y + 1, 0), { kind: 'entrance', index: 0 })
  const moved = moveItem(level, { kind: 'entrance', index: 0 }, -10000, -10000)
  assert.deepEqual(moved.entrance, { x: GOAL_DOOR_WIDTH / 2, y: GOAL_DOOR_HEIGHT })
  level.entrance = { x: 300, y: 720 }
  level.platforms = [{ x: 200, y: 700, w: 200, h: 220, profile: [[0, 40], [200, 0]] }]
  assert.match(spawnProblem(level), /continuous flat surface/)
  assert.equal(placeOnSurface(level, { kind: 'entrance', index: 0 }), level, 'placement cannot choose the slope or buried floor')
  level.platforms = [{ x: 280, y: 720, w: 40, h: 200 }]; level.entrance.y = 650
  assert.equal(placeOnSurface(level, { kind: 'entrance', index: 0 }).entrance.y, 720)
  level.platforms = [{ x: 295, y: 720, w: 10, h: 200 }]
  assert.match(spawnProblem(level), /continuous flat surface/)
  level.entrance.y = level.floor
  level.platforms = [{ x: 270, y: level.floor - 75, w: 60, h: 10 }]
  assert.match(spawnProblem(level), /clear doorway/)
  assert.equal(placeOnSurface(level, { kind: 'entrance', index: 0 }, 20), level, 'placement uses the whole doorway height')
})
