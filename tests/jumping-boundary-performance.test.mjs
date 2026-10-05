import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { nearestBoundary, pointInside, polygonPoints, lineBlocked, segmentPenetration, ropeBend } from '../src/games/jumping/geometry.ts'

const cave = JSON.parse(readFileSync(new URL('../public/levels/jumping/spelunk1.jump-level.json', import.meta.url))).platforms

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
