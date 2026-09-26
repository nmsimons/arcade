import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial, levelProblems } from '../src/games/jumping/level.ts'
import { addItem, resizeItem } from '../src/games/jumping/editor.ts'
import { placeOnSurface, surfacePlacement } from '../src/games/jumping/editorPlacement.ts'
import { jumpOriginAt, previewJump } from '../src/games/jumping/jumpPreview.ts'
import { polygonIntersects, polygonPoints } from '../src/games/jumping/geometry.ts'
import { ballShape } from '../src/games/jumping/propGeometry.ts'

test('boxes draw to size and inspector resizing preserves the center and floor contact', () => {
  const source = blankTrial(), selection = { kind: 'prop', index: 0 }
  const drawn = addItem(source, 'box', { x: 400, y: 760 }, { x: 560, y: 920 }).level
  assert.deepEqual(drawn.props, [{ kind: 'box', x: 480, y: 920, size: 160 }])
  const resized = resizeItem(drawn, selection, 130, 160)
  assert.deepEqual(resized.props, [{ kind: 'box', x: 480, y: 920, size: 130 }])
  const floating = structuredClone(drawn); floating.props[0].y = 800
  for (const corner of ['top-left', 'top-right', 'bottom-left', 'bottom-right']) {
    const b = resizeItem(floating, selection, 180, 160, corner).props[0]
    assert.equal(b.size, 180)
    assert.equal(b.x, corner.endsWith('left') ? 470 : 490)
    assert.equal(b.y, corner.startsWith('top') ? 800 : 820)
  }
  assert.equal(source.props.length, 0)
})

test('gates draw to length and extend from the base or the opposite dragged edge', () => {
  const drawn = addItem(blankTrial(), 'gate', { x: 700, y: 920 }, { x: 700, y: 620 }).level
  const selection = { kind: 'mechanism', index: 0 }, gate = drawn.mechanisms[0]
  assert.deepEqual([gate.x, gate.y, gate.w, gate.h], [700, 620, 20, 300])
  const grown = resizeItem(drawn, selection, 50, 400).mechanisms[0]
  assert.deepEqual([grown.y, grown.w, grown.h], [520, 20, 400])
  const shrunk = resizeItem(drawn, selection, 20, 200, 'bottom').mechanisms[0]
  assert.deepEqual([shrunk.y, shrunk.h], [620, 200])
})

test('surface placement uses the footprint, catches nearby surfaces and stops at the first clear support', () => {
  const level = blankTrial(), selected = { kind: 'prop', index: 0 }
  level.platforms = [{ x: 380, y: 700, w: 220, h: 20 }]
  level.props = [{ kind: 'box', x: 400, y: 687, size: 100 }]
  assert.equal(placeOnSurface(level, selected, 12), level)
  const placed = placeOnSurface(level, selected, 14)
  assert.equal(placed.props[0].y, 700)
  assert.equal(surfacePlacement(placed, selected).delta, 0)
  level.props[0].y = 520
  assert.equal(placeOnSurface(level, selected).props[0].y, 700)
  assert.equal(level.props[0].y, 520)
  level.props.push({ kind: 'box', x: 400, y: 700, size: 100 })
  assert.equal(placeOnSurface(level, selected).props[0].y, 600, 'boxes can be stacked')
})

test('boxes and balls meet sloping terrain without burying their corners or hull', () => {
  for (const kind of ['box', 'ball']) {
    const level = blankTrial(), selected = { kind: 'prop', index: 0 }
    level.platforms = [{ x: 300, y: 600, w: 400, h: 200, profile: [[0, 200], [400, 0]] }]
    level.props = [{ kind, x: 500, y: 500, size: 100 }]
    const placed = placeOnSurface(level, selected), b = placed.props[0]
    const shape = kind === 'ball' ? ballShape(b) : { x: b.x - 50, y: b.y - 100, w: 100, h: 100 }
    assert.ok(b.y > 650 && b.y < 700)
    assert.ok(!polygonIntersects(polygonPoints(shape), level.platforms[0], .02))
  }
})

test('start and goal placement respects their standing space and fixed terrain support', () => {
  const level = blankTrial()
  level.spawn = { x: 200, y: 500 }; level.goal = { x: 700, y: 500 }
  level.props = [{ kind: 'box', x: 200, y: 920, size: 160 }]
  assert.equal(surfacePlacement(level, { kind: 'spawn', index: 0 }), null, 'a start cannot be snapped through a box to the floor')
  level.props = []; level.platforms = [{ x: 100, y: 700, w: 900, h: 20 }]
  const start = placeOnSurface(level, { kind: 'spawn', index: 0 })
  const both = placeOnSurface(start, { kind: 'goal', index: 0 })
  assert.equal(both.spawn.y, 700); assert.equal(both.goal.y, 700)
  assert.deepEqual(levelProblems(both), [])
})

test('jump preview follows actual tap and charged jumps, directions, and approach speeds', () => {
  const level = blankTrial(), origin = { x: 900, y: 920 }, before = JSON.stringify(level)
  const tap = previewJump(level, origin, 1, false, true), charged = previewJump(level, origin, 1, true, true)
  const left = previewJump(level, origin, -1, true, true), standing = previewJump(level, origin, 1, true, false)
  assert.equal(tap.outcome, 'Lands'); assert.equal(charged.outcome, 'Lands')
  assert.ok(charged.rise > tap.rise * 2); assert.ok(charged.distance > tap.distance * 1.5)
  assert.ok(standing.distance < charged.distance)
  assert.ok(Math.abs(left.distance - charged.distance) < .001); assert.equal(charged.end.y, 920)
  assert.equal(JSON.stringify(level), before)
})

test('jump guide rejects blocked takeoffs and stops at walls instead of drawing through them', () => {
  const level = blankTrial(), origin = { x: 500, y: 920 }
  level.platforms = [{ x: 550, y: 300, w: 60, h: 620 }]
  assert.deepEqual(jumpOriginAt(level, { x: 500, y: 905 }), origin)
  assert.equal(jumpOriginAt(level, { x: 560, y: 920 }), null)
  const path = previewJump(level, origin, 1, true, true)
  assert.equal(path.outcome, 'Blocked'); assert.ok(path.end.x <= 538.01)
})
