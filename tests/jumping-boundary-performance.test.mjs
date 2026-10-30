import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { nearestBoundary, nearbyBoundary, pointInside, polygonPoints, lineBlocked, segmentPenetration, ropeBend, withTerrainQueries } from '../src/games/jumping/geometry.ts'

const cave = JSON.parse(readFileSync(new URL('../public/levels/jumping/spelunk.jump-level.json', import.meta.url))).platforms

test('repeated cave contacts reuse edge lengths and reject distant edge distances', t => {
  const shape = cave.find(b => b.polygon?.length > 12), [x, y] = polygonPoints(shape)[0]
  const expected = nearestBoundary(shape, x - 1, y - 1)
  let roots = 0
  const hypot = Math.hypot
  t.mock.method(Math, 'hypot', (...values) => { roots++; return hypot(...values) })
  for (let i = 0; i < 100; i++) assert.deepEqual(nearestBoundary(shape, x - 1, y - 1), expected)
  assert.ok(roots < shape.polygon.length * 100, 'do not recompute every edge length and distance for every rope particle')
})

test('cached cave queries match fresh geometry after translation, resizing and in-place outline edits', () => {
  const shapes = [structuredClone(cave[0]), { x: 0, y: 0, w: 100, h: 80, profile: [[0, 10], [50, 0], [100, 40]] },
    { x: 0, y: 0, w: 100, h: 80 }]
  for (const shape of shapes) {
    const check = () => {
      // Fresh identities force independent geometry preparation for all queries.
      for (const [dx, dy] of [[-1, -1], [0, 0], [20, 30], [shape.w / 2, shape.h / 2], [shape.w, shape.h]]) {
        const x = shape.x + dx, y = shape.y + dy, from = [x - 30, y - 20], to = [x + 30, y + 20]
        const fresh = () => structuredClone(shape)
        for (const normal of [undefined, [0, -1], [1, 0]]) assert.deepEqual(nearestBoundary(shape, x, y, normal), nearestBoundary(fresh(), x, y, normal))
        assert.equal(pointInside(shape, x, y), pointInside(fresh(), x, y))
        assert.equal(lineBlocked(from, to, [shape]), lineBlocked(from, to, [fresh()]))
        assert.deepEqual(segmentPenetration(from, to, shape, 1.5), segmentPenetration(from, to, fresh(), 1.5))
        assert.deepEqual(ropeBend(from, to, [shape], 1.5), ropeBend(from, to, [fresh()], 1.5))
      }
    }
    check()
    shape.x += 200; shape.y -= 100; check()
    shape.w += 20; shape.h += 10; check()
    const outline = shape.polygon ?? shape.profile
    if (outline) { outline[0][1] += 8; check(); outline.push([shape.w - 1, shape.h - 1]); check() }
    // Authoring consumers may edit their returned point array.
    polygonPoints(shape).splice(0)
    check()
  }
})

test('read-only solves validate outlines once and observe edits after nested or interrupted queries', t => {
  const shape = structuredClone(cave.find(b => b.polygon?.length > 12))
  const [x, y] = polygonPoints(shape)[0], expected = nearestBoundary(shape, x, y)
  let validations = 0
  const every = shape.polygon.every
  Object.defineProperty(shape.polygon, 'every', { configurable: true, value(...args) { validations++; return every.apply(this, args) } })
  t.after(() => { delete shape.polygon.every })
  withTerrainQueries(() => {
    for (let i = 0; i < 100; i++) withTerrainQueries(() => {
      assert.deepEqual(nearestBoundary(shape, x, y), expected)
      assert.equal(pointInside(shape, x, y), true)
    })
  })
  assert.equal(validations, 1, 'limb samples share validation for the entire synchronous pose')
  assert.throws(() => withTerrainQueries(() => { nearestBoundary(shape, x, y); throw new Error('interrupted') }))
  shape.polygon[0][0] += 10
  const fresh = { ...shape, polygon: shape.polygon.map(p => [...p]) }
  assert.deepEqual(nearestBoundary(shape, x, y), nearestBoundary(fresh, x, y))
  withTerrainQueries(() => assert.deepEqual(nearestBoundary(shape, x, y), nearestBoundary(fresh, x, y)))
})

test('spatial cave queries retain exhaustive distances, face ties and inside tests at cell boundaries', () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/jumping/ascent-chimney-clearance.json', import.meta.url)))
  const shapes = [...fixture.platforms, ...cave.filter(b => b.polygon?.length > 12),
    { x: -128, y: -128, w: 256, h: 256 }, { x: -160, y: -128, w: 320, h: 256, profile: [[0, 60], [160, 0], [320, 60]] }]
  for (const shape of shapes) {
    const points = polygonPoints(shape), samples = []
    for (let i = 0; i < 100; i++) samples.push([shape.x + shape.w * (i * 37 % 101) / 100, shape.y + shape.h * (i * 61 % 101) / 100])
    for (const [x, y] of points) for (const epsilon of [-1e-8, 0, 1e-8]) {
      samples.push([x + epsilon, y - epsilon], [Math.round(x / 64) * 64 + epsilon, y], [x, Math.round(y / 64) * 64 + epsilon])
    }
    for (const [x, y] of samples) withTerrainQueries(() => {
      const edges = points.map((a, i) => {
        const b = points[(i + 1) % points.length], dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy)
        const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (length * length)))
        const px = a[0] + dx * t, py = a[1] + dy * t
        return { x: px, y: py, distance: Math.hypot(px - x, py - y), nx: dy / length, ny: -dx / length }
      })
      for (const normal of [undefined, [1, 0], [0, 1], [-1, -1]]) {
        let expected = { x, y, distance: Infinity, nx: 0, ny: -1 }
        for (const edge of edges) {
          if (normal && edge.nx * normal[0] + edge.ny * normal[1] <= 1e-7) continue
          const tied = normal && Math.abs(edge.distance - expected.distance) < 1e-5
          if (tied ? edge.nx * normal[0] + edge.ny * normal[1] > expected.nx * normal[0] + expected.ny * normal[1]
            : edge.distance < expected.distance) expected = edge
        }
        assert.deepEqual(nearestBoundary(shape, x, y, normal), expected)
        if (!normal) for (const radius of [0, .03, 2.8, 10, expected.distance]) {
          assert.deepEqual(nearbyBoundary(shape, x, y, radius), expected.distance <= radius ? expected : null)
        }
      }
      let inside = false, onEdge = false
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const a = points[i], b = points[j]
        const cross = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0])
        onEdge ||= x >= Math.min(a[0], b[0]) - 1e-7 && x <= Math.max(a[0], b[0]) + 1e-7
          && y >= Math.min(a[1], b[1]) - 1e-7 && y <= Math.max(a[1], b[1]) + 1e-7 && Math.abs(cross) < 1e-7
        if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside
      }
      assert.equal(pointInside(shape, x, y), x >= shape.x && x <= shape.x + shape.w && y >= shape.y && y <= shape.y + shape.h && (inside || onEdge))
    })
  }
})


test('bounded clearance rejects distant cached faces without repeated distance roots', t => {
  const shape = { x: 0, y: 0, w: 1000, h: 1000,
    polygon: [[0, 0], [1000, 0], [1000, 100], [100, 100], [100, 1000], [0, 1000]] }
  // The empty inside corner remains within the shape's broad bounding box.
  assert.equal(pointInside(shape, 500, 500), false)
  const nearest = nearestBoundary(shape, 500, 500)
  assert.equal(nearest.distance, 400)
  let roots = 0
  const hypot = Math.hypot
  t.mock.method(Math, 'hypot', (...values) => { roots++; return hypot(...values) })
  withTerrainQueries(() => {
    for (let i = 0; i < 100; i++) assert.equal(nearbyBoundary(shape, 500, 500, 1.5), null)
  })
  assert.equal(roots, 0, 'a cached face outside the radius must not require a distance root')
  assert.deepEqual(nearbyBoundary(shape, 101, 500, 1), { x: 100, y: 500, distance: 1, nx: 1, ny: -0 })
  shape.polygon[3][0] = 120; shape.polygon[4][0] = 120
  assert.deepEqual(nearbyBoundary(shape, 121, 500, 1), { x: 120, y: 500, distance: 1, nx: 1, ny: -0 })
})
