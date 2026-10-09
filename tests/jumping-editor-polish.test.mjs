import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial, levelProblems } from '../src/games/jumping/level.ts'
import { addItem, itemBounds, resizeItem, setShovebotLimit } from '../src/games/jumping/editor.ts'
import { placeOnSurface, surfacePlacement } from '../src/games/jumping/editorPlacement.ts'
import { polygonIntersects, polygonPoints } from '../src/games/jumping/geometry.ts'
import { ballShape } from '../src/games/jumping/propGeometry.ts'

test('click placement follows the cursor height instead of choosing a distant support', () => {
  const source = blankTrial()
  source.platforms = [{ x: 300, y: 700, w: 400, h: 20 }]
  const original = structuredClone(source)
  for (const tool of ['box', 'ball', 'pusher', 'plate', 'gate', 'spawn', 'checkpoint', 'goal']) {
    for (const y of [320, 440, source.floor]) {
      const added = addItem(source, tool, { x: 500, y }, { x: 500, y })
      const bounds = itemBounds(added.level, added.selection)
      assert.equal(bounds.y + bounds.h, y, `${tool} should keep the cursor's height`)
      if (y !== source.floor) {
        assert.equal(placeOnSurface(added.level, added.selection, 12), added.level, `${tool} should ignore distant support`)
        const grounded = placeOnSurface(added.level, added.selection)
        const placed = itemBounds(grounded, added.selection)
        assert.equal(placed.y + placed.h, 700, `${tool} can still be explicitly placed on a surface`)
      }
    }
  }
  assert.deepEqual(source, original)
})

test('new objects catch only nearby surfaces and stay inside the room near its ceiling', () => {
  const source = blankTrial()
  for (const tool of ['box', 'ball', 'pusher', 'plate', 'gate']) {
    const point = { x: 500, y: source.floor - 10 }, added = addItem(source, tool, point, point)
    assert.equal(placeOnSurface(added.level, added.selection, 9), added.level)
    const snapped = placeOnSurface(added.level, added.selection, 12), bounds = itemBounds(snapped, added.selection)
    assert.equal(bounds.y + bounds.h, source.floor, `${tool} catches a surface within reach`)
    const ceiling = addItem(source, tool, { x: 500, y: -100 }, { x: 500, y: -100 })
    assert.equal(itemBounds(ceiling.level, ceiling.selection).y, 0, `${tool} stays inside the ceiling`)
  }
})

test('placement limits use each object footprint without pinning small items far from room edges', () => {
  const source = blankTrial()
  for (const [tool, x] of [['box', source.width - 70], ['ball', source.width - 60], ['pusher', source.width - 50]]) {
    const point = { x, y: 400 }, added = addItem(source, tool, point, point)
    const bounds = itemBounds(added.level, added.selection)
    assert.equal(bounds.x + bounds.w / 2, x, `${tool} follows a cursor that leaves enough room`)
  }
  const point = { x: 500, y: source.floor - 30 }, horizontal = addItem(source, 'horizontal-gate', point, point)
  assert.equal(horizontal.level.mechanisms[0].y, point.y, 'a thin gate follows the cursor near the floor')
  const gate = addItem(source, 'gate', point, { ...point, y: point.y - 20 })
  assert.equal(gate.level.mechanisms[0].y, point.y - 20, 'a short drawn gate uses its actual height')
})

test('patrol limits preserve the shovebot spawn, room clearance and minimum span', () => {
  const level = blankTrial(); level.robots = [{ x: 700, y: 920, left: 400, right: 1000 }]
  assert.deepEqual(setShovebotLimit(level, 0, 'left', 300).robots[0], { ...level.robots[0], left: 300 })
  assert.equal(setShovebotLimit(level, 0, 'left', -100).robots[0].left, 26)
  assert.equal(setShovebotLimit(level, 0, 'left', 1200).robots[0].left, 700)
  assert.equal(setShovebotLimit(level, 0, 'right', 300).robots[0].right, 700)
  assert.equal(setShovebotLimit(level, 0, 'right', 5000).robots[0].right, 1774)
  const narrow = setShovebotLimit(level, 0, 'left', 700)
  assert.equal(setShovebotLimit(narrow, 0, 'right', 650).robots[0].right, 750)
  const other = setShovebotLimit(level, 0, 'right', 700)
  assert.equal(setShovebotLimit(other, 0, 'left', 720).robots[0].left, 650)
  assert.deepEqual(level.robots[0], { x: 700, y: 920, left: 400, right: 1000 })
  assert.equal(setShovebotLimit(level, 0, 'left', NaN), level)
  assert.equal(setShovebotLimit(level, 1, 'right', 900), level)
  assert.equal(setShovebotLimit(level, 0, 'left', 300.4).robots[0].left, 300)
  assert.equal(setShovebotLimit(level, 0, 'right', 1000.8).robots[0].right, 1001)
})

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
