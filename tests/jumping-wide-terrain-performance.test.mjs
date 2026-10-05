import test from 'node:test'
import assert from 'node:assert/strict'
import { bodyIntersects, bodyPolygon, moveBody, movePoint, nearestBoundary, polygonIntersects } from '../src/games/jumping/geometry.ts'

// A single concave terrain object spans several empty pits. Its overall bounds
// are deliberately much larger than the neighborhood of a loaded rope.
const wideTerrain = () => ({ x: 0, y: 880, w: 8000, h: 520, polygon: [
  [0, 0], [540, 0], [540, 500], [780, 500], [780, 0], [1640, 0], [1640, 500], [2100, 500], [2100, 0],
  [2900, 0], [2900, 500], [4060, 500], [4060, 0], [4840, 0], [4840, 500], [6600, 500], [6600, 0], [8000, 0], [8000, 520], [0, 520],
] })

test('loaded rope body queries reuse convex terrain axes and reject distant pieces', t => {
  const shape = wideTerrain(), from = [3390, 1040], to = [3390.01, 1040.01]
  assert.deepEqual(moveBody(from, to, [shape]).contacts, []) // Warm immutable geometry.
  let roots = 0
  const hypot = Math.hypot
  t.mock.method(Math, 'hypot', (...values) => { roots++; return hypot(...values) })
  for (let i = 0; i < 100; i++) {
    const moved = moveBody(from, to, [shape])
    assert.deepEqual([moved.x, moved.y], to)
    assert.deepEqual(moved.contacts, [])
  }
  assert.ok(roots < 1000, 'a local body correction must not rebuild separating axes for every distant terrain triangle')
})

test('piece culling includes the entire body and particle sweep across a wide pit', () => {
  const shape = wideTerrain(), from = [3390, 1040]
  assert.deepEqual(moveBody(from, [3700, 1040], [shape]), { x: 3700, y: 1040, contacts: [] })
  const right = moveBody(from, [5000, 1040], [shape]), left = moveBody(from, [2500, 1040], [shape])
  assert.equal(right.x, 4048); assert.equal(left.x, 2912)
  assert.deepEqual(right.contacts.map(c => c.normal), [[-1, -0]])
  assert.deepEqual(left.contacts.map(c => c.normal), [[1, 0]])
  assert.deepEqual(movePoint(from, [5000, 1040], [shape], 1.5), { x: 4058.5, y: 1040 })
  assert.deepEqual(movePoint(from, [2500, 1040], [shape], 1.5), { x: 2901.5, y: 1040 })
  for (const orientation of [1, -1]) for (const angle of [0, .4, -.4]) {
    const result = moveBody(from, [5000, 1040], [shape], 62, orientation, angle)
    assert.ok(result.x < 4060 && result.contacts.length)
    assert.equal(bodyIntersects(result.x, result.y, shape, 62, orientation, angle), false)
  }
})

test('convex terrain caches refresh after translation, resize and edits to either outline format', () => {
  for (const shape of [wideTerrain(), { x: 0, y: 20, w: 100, h: 80, profile: [[0, 30], [50, 0], [100, 30]] },
    { x: 0, y: 20, w: 100, h: 80 }]) {
    const check = () => {
      for (const [dx, dy] of [[10, 10], [shape.w / 2, 30], [shape.w - 10, shape.h - 10]]) {
        const x = shape.x + dx, y = shape.y + dy, from = [x - 30, y - 100], to = [x + 80, y + 100]
        const fresh = () => structuredClone(shape)
        assert.deepEqual(moveBody(from, to, [shape]), moveBody(from, to, [fresh()]))
        assert.deepEqual(movePoint(from, to, [shape], 1.5), movePoint(from, to, [fresh()], 1.5))
        assert.equal(bodyIntersects(x, y, shape), bodyIntersects(x, y, fresh()))
        assert.equal(polygonIntersects(bodyPolygon(x, y, 62), shape, .01), polygonIntersects(bodyPolygon(x, y, 62), fresh(), .01))
      }
    }
    check(); shape.x += 200; shape.y -= 100; check()
    shape.w += 20; shape.h += 10; check()
    const outline = shape.polygon ?? shape.profile
    if (outline) { outline[0][1] += 8; check() }
  }
})

test('nearest-edge hints retain first-edge ties and normal-directed face selection', () => {
  const shape = { x: 0, y: 0, w: 100, h: 100 }
  const expected = nearestBoundary(structuredClone(shape), 50, 50)
  for (const [x, y] of [[99, 50], [1, 50], [50, 99], [50, 1]]) {
    nearestBoundary(shape, x, y) // Seed each of the four faces before the equal-distance query.
    assert.deepEqual(nearestBoundary(shape, 50, 50), expected)
    for (const normal of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1]]) {
      assert.deepEqual(nearestBoundary(shape, 50, 50, normal), nearestBoundary(structuredClone(shape), 50, 50, normal))
    }
  }
})

test('nearby rope particles avoid repeated square roots for remote pit edges', t => {
  const shape = wideTerrain(), expected = nearestBoundary(shape, 3390, 1040)
  let roots = 0
  const hypot = Math.hypot
  t.mock.method(Math, 'hypot', (...values) => { roots++; return hypot(...values) })
  for (let i = 0; i < 100; i++) assert.deepEqual(nearestBoundary(shape, 3390, 1040), expected)
  assert.ok(roots < 200, 'the previous exact face distance should bound the remaining edge searches')
})
