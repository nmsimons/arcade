import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial, parseLevel, levelProblems } from '../src/games/jumping/level.ts'
import { createRun, createPreviewRun, stepRun } from '../src/games/jumping/challenge.ts'
import { NEUTRAL_INPUT } from '../src/games/jumping/model.ts'
import { pressurePlatePosition } from '../src/games/jumping/pressurePlateMount.ts'
import { addItem, moveItem, resizeItem, setPressurePlateMount, duplicateItem, deleteItem } from '../src/games/jumping/editor.ts'
import { placeOnSurface } from '../src/games/jumping/editorPlacement.ts'
import { copyForEditing } from '../src/games/jumping/puzzleEditor.ts'

function fixture(horizontal = false, load = 'box') {
  const level = blankTrial()
  level.mechanisms = [
    { id: 'carrier', kind: 'lift', x: 400, y: 700, w: 240, h: 20, travel: 240, power: 'always', ...(horizontal ? { orientation: 'horizontal', flipX: true } : {}) },
    { id: 'gate', kind: 'gate', x: 1200, y: 740, w: 20, h: 180, travel: 180 },
  ]
  level.triggers = [{ mode: 'weight', x: 420, y: 700, w: 160, mount: { mechanism: 'carrier', x: 20 }, targets: ['gate'] }]
  level.props = load === 'player' ? [] : [{ kind: load, x: 480, y: 700, size: 50 }]
  return level
}
const step = (run, frames = 1) => { for (let i = 0; i < frames; i++) stepRun(run, NEUTRAL_INPUT) }

for (const horizontal of [false, true]) for (const load of ['box', 'ball', 'player']) test(`${load} holds a mounted plate on a travelling ${horizontal ? 'platform' : 'elevator'}`, () => {
  const level = parseLevel(fixture(horizontal, load)), run = createRun(level); run.started = true
  if (load === 'player') Object.assign(run.player, { x: 480, y: 700, grounded: true })
  step(run, 30)
  assert.equal(run.triggers[0].active, true); assert.equal(run.mechanisms[1].active, true)
  const initial = pressurePlatePosition(level.triggers[0], run.mechanisms)
  for (let i = 0; i < 150; i++) {
    step(run)
    const plate = pressurePlatePosition(level.triggers[0], run.mechanisms), host = run.mechanisms[0]
    assert.equal(plate.x, host.x + 20); assert.equal(plate.y, host.y)
    assert.equal(run.triggers[0].active, true, 'travel and passenger carrying preserve the load')
  }
  const moved = pressurePlatePosition(level.triggers[0], run.mechanisms)
  assert.notDeepEqual(moved, initial)
  run.empRemaining = 1; const frozen = { ...moved }; step(run, 30)
  assert.deepEqual(pressurePlatePosition(level.triggers[0], run.mechanisms), frozen)
  assert.equal(run.triggers[0].active, false, 'pressure turns off during EMP')
  step(run, 150); assert.equal(run.triggers[0].active, true)
  if (load === 'player') Object.assign(run.player, { x: 160, y: 920, grounded: true })
  else run.props.length = 0
  step(run); assert.equal(run.triggers[0].active, false); assert.equal(run.mechanisms[1].active, false)
  assert.deepEqual(createPreviewRun(level).level.triggers[0], level.triggers[0])
  assert.deepEqual(pressurePlatePosition(level.triggers[0], createRun(level).mechanisms), { x: 420, y: 700 })
})

test('new placement and Place on surface mount to lifts; dragging away detaches', () => {
  const level = fixture(); level.triggers = []; level.props = []
  const placed = addItem(level, 'plate', { x: 480, y: 700 }, { x: 480, y: 700 })
  assert.deepEqual(placed.level.triggers[0].mount, { mechanism: 'carrier', x: 30 })
  const away = moveItem(placed.level, placed.selection, 0, -80)
  assert.equal(away.triggers[0].mount, undefined)
  const dropped = placeOnSurface(away, placed.selection)
  assert.deepEqual(dropped.triggers[0].mount, { mechanism: 'carrier', x: 30 })
  const supported = structuredClone(dropped); delete supported.triggers[0].mount
  assert.ok(placeOnSurface(supported, placed.selection).triggers[0].mount, 'zero-distance placement can attach an existing plate')
  assert.deepEqual(parseLevel(dropped), dropped)
})

test('mounts follow host edits, clamp on resizing, detach on deletion and remap in templates', () => {
  const level = fixture(), selection = { kind: 'mechanism', index: 0 }
  const moved = moveItem(level, selection, 80, -40)
  assert.deepEqual({ x: moved.triggers[0].x, y: moved.triggers[0].y }, { x: 500, y: 660 })
  const resized = resizeItem(moved, selection, 160, 20)
  assert.equal(resized.triggers[0].mount.x, 0); assert.equal(resized.triggers[0].x, 480)
  assert.equal(resizeItem(resized, selection, 40, 20).mechanisms[0].w, 160, 'host must remain wide enough for its plate')
  const copy = duplicateItem(moved, { kind: 'trigger', index: 0 })
  assert.equal(copy.level.triggers[1].mount.mechanism, 'carrier')
  const template = copyForEditing(moved)
  assert.equal(template.triggers[0].mount.mechanism, template.mechanisms[0].id)
  assert.notEqual(template.triggers[0].mount.mechanism, 'carrier')
  for (const edited of [moved, resized, copy.level, template]) assert.deepEqual(parseLevel(edited), edited)
  const deleted = deleteItem(moved, selection)
  assert.equal(deleted.triggers[0].mount, undefined); assert.equal(deleted.triggers[0].x, 500); assert.equal(deleted.triggers[0].y, 660)
  assert.deepEqual(levelProblems(deleted), [])
  const detached = setPressurePlateMount(moved, 0, null)
  assert.equal(detached.triggers[0].mount, undefined)
  assert.deepEqual(setPressurePlateMount(detached, 0, 'carrier'), moved)
})

test('files reject unsupported mounts and normalize mounted positions to their host', () => {
  for (const mount of [null, {}, { mechanism: 'missing', x: 0 }, { mechanism: 'gate', x: 0 }, { mechanism: 'carrier', x: -1 }, { mechanism: 'carrier', x: 100 }, { mechanism: 'carrier', x: '20' }]) {
    const level = fixture(); level.triggers[0].mount = mount
    assert.throws(() => parseLevel(level))
  }
  const level = fixture(); level.triggers[0].x = 200; level.triggers[0].y = 900
  assert.deepEqual(parseLevel(level).triggers[0], fixture().triggers[0])
  level.triggers = [{ mode: 'coins', x: 420, y: 100, w: 120, threshold: 1, targets: ['gate'], mount: { mechanism: 'carrier', x: 20 } }]
  assert.throws(() => parseLevel(level))
})
