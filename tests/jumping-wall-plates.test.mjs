import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial, parseLevel } from '../src/games/jumping/level.ts'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { NEUTRAL_INPUT } from '../src/games/jumping/model.ts'
import { addItem, flipWallPlate, itemBounds, moveItem, resizeItem, setPressurePlateFacing } from '../src/games/jumping/editor.ts'
import { propPressesWallPlate } from '../src/games/jumping/wallPlates.ts'

const steps = (run, frames, input = NEUTRAL_INPUT) => { for (let i = 0; i < frames; i++) stepRun(run, input) }
const RIGHT = { ...NEUTRAL_INPUT, move: 1 }, LEFT = { ...NEUTRAL_INPUT, move: -1 }

/** A pillar from x 900 to 1000 standing on the floor, with a plate low on its left face. */
function pillar({ plate = { y: 820, w: 90 }, props = [], behavior } = {}) {
  const level = blankTrial()
  level.entrance = { x: 700, y: 920 }
  level.platforms = [{ x: 900, y: 600, w: 100, h: 320 }]
  level.triggers = [{ x: 900, ...plate, facing: 'left', mode: 'touch', ...behavior ? { behavior } : {}, targets: ['lamp'] }]
  level.wallLights = [{ id: 'lamp', x: 400, y: 300 }]
  level.props = props
  return parseLevel(level)
}

test('wall plate files need a facing on a pressure plate, and no ceiling or mount', () => {
  const level = pillar()
  assert.equal(level.triggers[0].facing, 'left')
  for (const change of [{ facing: 'up' }, { ceiling: true }, { mount: { mechanism: 'x', x: 0 } }]) {
    const copy = structuredClone(level); Object.assign(copy.triggers[0], change)
    assert.throws(() => parseLevel(copy))
  }
  const coins = structuredClone(level); coins.triggers[0] = { x: 900, y: 820, w: 90, mode: 'coins', threshold: 1, facing: 'left', targets: [] }
  assert.throws(() => parseLevel(coins))
})

test('walking into a wall plate presses it with the body and palms, and stepping back releases it', () => {
  const run = createRun(pillar()); run.started = true
  steps(run, 20)
  assert.equal(run.triggers[0].active, false)
  steps(run, 90, RIGHT)
  assert.equal(run.triggers[0].active, true, `pressed from x ${run.player.x}`)
  assert.equal(run.switchStates.get('lamp'), true)
  steps(run, 40, LEFT)
  assert.equal(run.triggers[0].active, false)
})

test('a plate above reach on the same face stays up', () => {
  const run = createRun(pillar({ plate: { y: 640, w: 80 } })); run.started = true
  steps(run, 120, RIGHT)
  assert.equal(run.triggers[0].active, false)
})

for (const kind of ['box', 'ball']) test(`a ${kind} pushed against a wall plate holds it`, () => {
  const run = createRun(pillar({ props: [{ kind, x: 800, y: 920, size: 50 }] })); run.started = true
  run.player.x = 700
  steps(run, 200, RIGHT)
  assert.ok(propPressesWallPlate(run.props[0], run.level.triggers[0]), `${kind} at ${run.props[0].x}`)
  assert.equal(run.triggers[0].active, true)
})

test('a switch plate on a wall latches on the first press', () => {
  const run = createRun(pillar({ behavior: 'switch' })); run.started = true
  steps(run, 90, RIGHT); steps(run, 60, LEFT)
  assert.equal(run.triggers[0].active, true)
  assert.equal(run.triggers[0].pressed, false)
})

test('the studio turns a floor plate onto the nearest wall face, snaps moves to it, and resizes it along the face', () => {
  let level = blankTrial()
  level.platforms = [{ x: 900, y: 600, w: 100, h: 320 }]
  level.triggers = [{ x: 820, y: 920, w: 100, mode: 'touch', targets: [] }]
  level = setPressurePlateFacing(level, 0, 'left')
  assert.deepEqual([level.triggers[0].x, level.triggers[0].facing, level.triggers[0].w], [900, 'left', 100])
  assert.deepEqual(itemBounds(level, { kind: 'trigger', index: 0 }), { x: 892, y: level.triggers[0].y, w: 8, h: 100 })
  level = moveItem(level, { kind: 'trigger', index: 0 }, -6, 700 - level.triggers[0].y)
  assert.deepEqual([level.triggers[0].x, level.triggers[0].y], [900, 700], 'snapped back onto the face')
  level = resizeItem(level, { kind: 'trigger', index: 0 }, 8, 150)
  assert.equal(level.triggers[0].w, 150)
  level = setPressurePlateFacing(level, 0, 'up')
  assert.equal(level.triggers[0].facing, undefined)
})

test('the vertical pressure plate tool snaps to the nearest wall face, and Flip horizontally moves it across its wall', () => {
  const base = blankTrial()
  base.platforms = [{ x: 900, y: 600, w: 100, h: 320 }]
  // Beside the pillar's right face, the plate faces right on it; beside its left face, left.
  let level = addItem(base, 'vertical-plate', { x: 1008, y: 760 }, { x: 1008, y: 760 }).level
  assert.deepEqual([level.triggers[0].facing, level.triggers[0].x, level.triggers[0].y], ['right', 1000, 710])
  assert.equal(addItem(base, 'vertical-plate', { x: 893, y: 760 }, { x: 893, y: 760 }).level.triggers[0].facing, 'left')
  // In open air it faces right where it was clicked.
  assert.deepEqual([addItem(base, 'vertical-plate', { x: 400, y: 500 }, { x: 400, y: 500 }).level.triggers[0].facing,
    addItem(base, 'vertical-plate', { x: 400, y: 500 }, { x: 400, y: 500 }).level.triggers[0].x], ['right', 400])
  level = flipWallPlate(level, 0)
  assert.deepEqual([level.triggers[0].facing, level.triggers[0].x], ['left', 900], 'onto the far face of the pillar')
  level = flipWallPlate(level, 0)
  assert.deepEqual([level.triggers[0].facing, level.triggers[0].x], ['right', 1000])
  // The ordinary plate tool stays on floors and ceilings beside a wall.
  assert.equal(addItem(base, 'plate', { x: 1010, y: 760 }, { x: 1010, y: 760 }).level.triggers[0].facing, undefined)
})
