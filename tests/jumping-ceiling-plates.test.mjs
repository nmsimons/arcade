import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial, parseLevel } from '../src/games/jumping/level.ts'
import { addItem, setPlateCeiling, itemBounds, hitItem, moveItem, resizeItem, duplicateItem } from '../src/games/jumping/editor.ts'
import { placeOnSurface, surfacePlacement } from '../src/games/jumping/editorPlacement.ts'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { NEUTRAL_INPUT } from '../src/games/jumping/model.ts'
import { createGravityField, updateGravityField, gravityAtPoint } from '../src/games/jumping/gravity.ts'
import { propLoadsPlate } from '../src/games/jumping/propGeometry.ts'
import { pressurePlatePosition } from '../src/games/jumping/pressurePlateMount.ts'
import { drawPressurePlate } from '../src/games/jumping/challengeRender.ts'
import { drawGravityPlate } from '../src/games/jumping/gravityRender.ts'
import { copyForEditing } from '../src/games/jumping/puzzleEditor.ts'

const step = (run, frames) => { for (let i = 0; i < frames; i++) stepRun(run, NEUTRAL_INPUT) }
function fixture(load = 'player', behavior = 'pressure') {
  const level = blankTrial(); level.spawn.x = load === 'player' ? 300 : 100
  level.gravityPlates = [{ id: 'field', x: 200, y: 0, w: 400, h: 920, gravity: -1, power: 'always', ceiling: true }]
  level.triggers = [{ x: 240, y: 0, w: 160, mode: 'touch', ceiling: true, behavior, targets: ['lamp'] },
    { x: 240, y: 0, w: 160, mode: 'touch', targets: [] }]
  level.wallLights = [{ id: 'lamp', x: 800, y: 200 }]
  level.props = load === 'player' ? [] : [{ kind: load, x: 300, y: 920, size: 60 }]
  return level
}

for (const load of ['player', 'box', 'ball']) test(`${load} presses a ceiling plate under reverse gravity, then releases it`, () => {
  const run = createRun(parseLevel(fixture(load))); run.started = true
  step(run, 360)
  assert.equal(run.triggers[0].active, true); assert.equal(run.switchStates.get('lamp'), true)
  assert.equal(run.triggers[1].active, false, 'the opposite-facing plate is not pressed')
  if (load === 'player') { assert.equal(run.player.inverted, true); run.player.x = 800 }
  else { assert.equal(run.props[0].grounded, true); run.props.length = 0 }
  step(run, 2)
  assert.equal(run.triggers[0].active, false); assert.equal(run.switchStates.get('lamp'), false)
})

for (const behavior of ['switch', 'toggle']) test(`ceiling ${behavior} uses the ordinary press and release transitions`, () => {
  const run = createRun(fixture('player', behavior)); run.started = true
  step(run, 330); assert.equal(run.triggers[0].active, true)
  run.player.x = 800; step(run, 24); assert.equal(run.triggers[0].active, true)
  assert.equal(run.triggers[0].pressed, false)
  assert.equal(run.triggers[0].depression, behavior === 'switch' ? 1 : 0)
  Object.assign(run.player, { x: 300, y: 0, inverted: true, grounded: true, vy: 0 })
  step(run, 25); assert.equal(run.triggers[0].active, behavior === 'switch')
})

test('only a supported top edge or corner presses a ceiling plate', () => {
  const prop = { kind: 'box', x: 300, y: 100, size: 60, angle: 0, grounded: true, vy: 0 }
  assert.equal(propLoadsPlate(prop, 240, 40, 160, true), true)
  assert.equal(propLoadsPlate({ ...prop, grounded: false }, 240, 40, 160, true), false)
  assert.equal(propLoadsPlate(prop, 240, 70, 160, true), false, 'a side overlap is not a press')
  assert.equal(propLoadsPlate({ ...prop, kind: 'ball' }, 240, 40, 160, true), true)
  const rotated = { ...prop, angle: Math.PI / 4 }, top = 70 - Math.SQRT2 * 30
  assert.equal(propLoadsPlate(rotated, 240, top, 160, true), true)
})

for (const horizontal of [false, true]) for (const load of ['player', 'box', 'ball']) test(`${load} holds a plate beneath a moving ${horizontal ? 'platform' : 'elevator'}`, () => {
  const level = fixture(load)
  level.mechanisms = [{ id: 'carrier', kind: 'lift', x: 200, y: 300, w: 400, h: 20, travel: 100, power: 'always',
    ...(horizontal ? { orientation: 'horizontal', flipX: true } : {}) }]
  level.gravityPlates[0].w = 900
  level.triggers = [{ x: 240, y: 320, w: 160, ceiling: true, mode: 'touch', mount: { mechanism: 'carrier', x: 40 }, targets: ['lamp'] }]
  if (load !== 'player') level.props[0].y = 380
  const run = createRun(level); run.started = true
  if (load === 'player') Object.assign(run.player, { x: 300, y: 320, inverted: true, grounded: true })
  run.mechanisms[0].wait = .4
  step(run, 25); assert.equal(run.triggers[0].active, true)
  const initial = pressurePlatePosition(level.triggers[0], run.mechanisms)
  for (let i = 0; i < 180; i++) {
    step(run, 1)
    assert.equal(run.triggers[0].active, true)
    const p = pressurePlatePosition(level.triggers[0], run.mechanisms), host = run.mechanisms[0]
    assert.equal(p.y, host.y + 20); assert.equal(p.x, host.x + 40)
  }
  assert.notDeepEqual(pressurePlatePosition(level.triggers[0], run.mechanisms), initial)
})

for (const tool of ['plate', 'gravity-plate']) test(`${tool} clicks and snaps onto the room ceiling and terrain undersides`, () => {
  const level = blankTrial()
  level.platforms = [{ x: 200, y: 100, w: 400, h: 40 }]
  for (const y of [0, 140]) {
    const added = addItem(level, tool, { x: 350, y }, { x: 350, y })
    const get = l => tool === 'plate' ? l.triggers[0] : l.gravityPlates[0]
    const p = get(added.level)
    assert.equal(p.ceiling, true); assert.equal(p.y, y)
    if (tool === 'gravity-plate') assert.equal(p.h, 920 - y)
    assert.deepEqual(parseLevel(added.level), added.level)
    assert.deepEqual(hitItem(added.level, 350, y + 6, 2), added.selection)
    const floated = moveItem(added.level, added.selection, 0, 7)
    if (get(floated).y !== y) assert.equal(get(placeOnSurface(floated, added.selection, 12)).y, y)
  }
  const near = addItem(level, tool, { x: 350, y: 145 }, { x: 350, y: 145 })
  assert.equal(surfacePlacement(near.level, near.selection, 12).ceiling, true)
  assert.equal((tool === 'plate' ? placeOnSurface(near.level, near.selection, 12).triggers[0]
    : placeOnSurface(near.level, near.selection, 12).gravityPlates[0]).y, 140)
})

test('vertical gravity flip keeps the rectangle, acceleration, power and wiring unchanged', () => {
  const level = fixture(), selection = { kind: 'gravity-plate', index: 0 }
  const flipped = setPlateCeiling(level, selection, false)
  assert.equal(flipped.gravityPlates[0].ceiling, undefined)
  assert.deepEqual({ ...flipped.gravityPlates[0], ceiling: true }, level.gravityPlates[0])
  const field = createGravityField()
  updateGravityField(field, level.gravityPlates, new Map(), true)
  const before = gravityAtPoint(field, 300, 500)
  updateGravityField(field, flipped.gravityPlates, new Map(), true)
  assert.equal(gravityAtPoint(field, 300, 500), before); assert.ok(before < 0)
  assert.deepEqual(setPlateCeiling(flipped, selection, true), level)
  const copy = duplicateItem(level, selection), template = copyForEditing(level)
  assert.equal(copy.level.gravityPlates[1].ceiling, true); assert.equal(template.gravityPlates[0].ceiling, true)
  const resized = resizeItem(level, selection, 400, 500, 'bottom')
  assert.equal(resized.gravityPlates[0].y, 0, 'the ceiling emitter stays fixed while the bottom handle resizes')
})

test('pressure flip preserves the anchor and mounted plates follow the platform underside', () => {
  const level = fixture(); level.triggers[0].y = 500
  const selection = { kind: 'trigger', index: 0 }, floor = setPlateCeiling(level, selection, false)
  assert.equal(floor.triggers[0].y, 500); assert.equal(itemBounds(floor, selection).y, 492)
  assert.equal(itemBounds(level, selection).y, 500)
  level.mechanisms = [{ id: 'carrier', kind: 'lift', x: 200, y: 100, w: 400, h: 20, travel: 100 }]
  const placed = addItem(level, 'plate', { x: 350, y: 120 }, { x: 350, y: 120 })
  const p = placed.level.triggers.at(-1)
  assert.equal(p.ceiling, true); assert.deepEqual(p.mount, { mechanism: 'carrier', x: 100 })
  const moved = moveItem(placed.level, { kind: 'mechanism', index: 0 }, 50, 100)
  assert.equal(moved.triggers.at(-1).y, 220)
  assert.deepEqual(pressurePlatePosition(p, [{ definition: moved.mechanisms[0], x: 250, y: 200 }]), { x: 350, y: 220 })
  assert.deepEqual(parseLevel(moved), moved)
})

test('plate artwork is reflected exactly, including pressure depression', () => {
  const ctx = () => ({ fillStyle: '', rectangles: [], fillRect(...args) { this.rectangles.push(args) } })
  for (const depression of [0, .5, 1]) {
    const floor = ctx(), ceiling = ctx()
    drawPressurePlate(floor, 100, 200, 100, true, depression)
    drawPressurePlate(ceiling, 100, 200, 100, true, depression, true)
    assert.deepEqual(ceiling.rectangles, floor.rectangles.map(([x, y, w, h]) => [x, 400 - y - h, w, h]))
  }
  const floor = ctx(), ceiling = ctx(), plate = { x: 100, y: 20, w: 160, h: 180 }
  drawGravityPlate(floor, plate, true); drawGravityPlate(ceiling, { ...plate, ceiling: true }, true)
  assert.deepEqual(ceiling.rectangles, floor.rectangles.map(([x, y, w, h]) => [x, 220 - y - h, w, h]))
})

test('ceiling flags round-trip in both versions and reject malformed values and coin switches', () => {
  for (const version of [1, 2]) {
    const level = fixture(); level.version = version
    if (version === 2) level.lighting = { nightMode: true, ambient: 0, lights: [] }
    assert.deepEqual(parseLevel(level), level)
    for (const value of ['yes', 1, null]) {
      const bad = structuredClone(level); bad.triggers[0].ceiling = value; assert.throws(() => parseLevel(bad))
      const other = structuredClone(level); other.gravityPlates[0].ceiling = value; assert.throws(() => parseLevel(other))
    }
  }
  const level = fixture(); level.triggers = [{ x: 400, y: 100, w: 120, mode: 'coins', threshold: 1, ceiling: true, targets: [] }]
  assert.throws(() => parseLevel(level))
})
