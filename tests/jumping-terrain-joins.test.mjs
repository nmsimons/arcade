import test from 'node:test'
import assert from 'node:assert/strict'
import { terrainUnderlaps } from '../src/games/jumping/terrainJoins.ts'
import { pointInside, polygonArea } from '../src/games/jumping/geometry.ts'

const blocks = () => [{ x: 100, y: 100, w: 100, h: 400, material: 'steel' },
  { x: 320, y: 100, w: 30, h: 30, material: 'chalk' },
  { x: 200, y: 200, w: 100, h: 300, material: 'steel' }]

test('touching terrain underlaps stay inside the front shape and scale to one canvas pixel', () => {
  const shapes = blocks(), before = structuredClone(shapes)
  for (const zoom of [.25, .63, 1, 2]) {
    const patches = terrainUnderlaps(shapes, [0, 1, 2], zoom)
    assert.equal(patches[0].length, 1)
    assert.deepEqual(patches[1], []); assert.deepEqual(patches[2], [])
    const patch = patches[0][0]
    assert.ok(polygonArea(patch) > 0)
    assert.equal(Math.max(...patch.map(p => p[0])), 200 + 1 / zoom)
    assert.ok(patch.every(([x, y]) => pointInside(shapes[2], x, y)))
  }
  assert.deepEqual(shapes, before)
})

test('real gaps and point contacts receive no underlap', () => {
  for (const gap of [.00001, .5, 2]) {
    const shapes = blocks(); shapes[2].x += gap
    assert.deepEqual(terrainUnderlaps(shapes, [0, 1, 2], 1), [[], [], []])
  }
  const shapes = blocks(); shapes[2].y = 500
  assert.deepEqual(terrainUnderlaps(shapes, [0, 1, 2], 1), [[], [], []])
})

test('underlaps clip acute and concave neighbor corners instead of enlarging the silhouette', () => {
  for (const polygon of [[[0, 0], [100, 80], [0, 200]], [[0, 0], [100, 0], [100, 30], [10, 30], [10, 200], [0, 200]]]) {
    const shapes = [{ x: 100, y: 100, w: 100, h: 200 }, { x: 200, y: 100, w: 100, h: 200, polygon }]
    const patches = terrainUnderlaps(shapes, [0, 1], .25)[0]
    assert.ok(patches.length)
    for (const patch of patches) for (let i = 0; i < patch.length; i++) {
      const a = patch[i], b = patch[(i + 1) % patch.length]
      assert.ok(pointInside(shapes[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2))
    }
  }
})

test('cached underlaps follow draw order, movement, resize and in-place polygon edits', () => {
  const shapes = blocks(), order = [0, 1, 2]
  const first = terrainUnderlaps(shapes, order, 1)
  assert.equal(terrainUnderlaps(shapes, order, 1), first)
  const reversed = terrainUnderlaps(shapes, [2, 1, 0], 1)
  assert.equal(reversed[0].length, 0); assert.equal(reversed[2].length, 1)
  shapes[2].x++
  assert.deepEqual(terrainUnderlaps(shapes, order, 1), [[], [], []])
  shapes[0].w++
  assert.equal(terrainUnderlaps(shapes, order, 1)[0].length, 1)
  shapes[2].polygon = [[0,0],[100,0],[100,300],[0,300]]
  assert.equal(terrainUnderlaps(shapes, order, 1)[0].length, 1)
  shapes[2].polygon[0][0] = 5
  assert.deepEqual(terrainUnderlaps(shapes, order, 1), [[], [], []])
})
