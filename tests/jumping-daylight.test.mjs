import test from 'node:test'
import assert from 'node:assert/strict'
import { DAYLIGHT_DIRECTION, daylightShadowPolygons } from '../src/games/jumping/daylight.ts'
import { staticCasters } from '../src/games/jumping/lightingModel.ts'
import { terrainBoundary } from '../src/games/jumping/lightingBoundary.ts'
import { pointInside } from '../src/games/jumping/geometry.ts'

const bounds = { x: 0, y: 0, w: 1200, h: 1000 }
const slope = DAYLIGHT_DIRECTION.x / DAYLIGHT_DIRECTION.y
const shadows = (polygons, x, y) => polygons.some(polygon => pointInside({ x: 0, y: 0, w: 1200, h: 1000, polygon }, x, y))

test('daylight remains parallel at every depth and starts below the actual silhouette', () => {
  const shape = { x: 200, y: 100, w: 100, h: 40, polygon: [[0, 0], [100, 0], [100, 40], [0, 20]] }
  const polygons = daylightShadowPolygons(terrainBoundary([shape]), bounds)
  assert.equal(shadows(polygons, 250, 120), false)
  assert.equal(shadows(polygons, 250, 135), true)
  for (const y of [160, 500, 999]) {
    const left = 200 + slope * (y - 120), right = 300 + slope * (y - 100)
    assert.equal(shadows(polygons, left - 1, y), false)
    assert.equal(shadows(polygons, left + 1, y), true)
    assert.equal(shadows(polygons, right - 1, y), true)
    assert.equal(shadows(polygons, right + 1, y), false)
  }
})

test('the enclosing frame admits daylight while authored roofs and real openings block it', () => {
  const level = { width: 1200, height: 1000, platforms: [
    { x: 200, y: 0, w: 100, h: 40 }, { x: 380, y: 0, w: 100, h: 40 },
  ] }
  const edges = staticCasters({ level }).flatMap(group => group.boundary)
  const polygons = daylightShadowPolygons(edges, bounds, level.width)
  assert.equal(shadows(polygons, 100, 500), false)
  assert.equal(shadows(polygons, 250 + slope * 500, 500), true)
  assert.equal(shadows(polygons, 340 + slope * 500, 500), false)
  assert.equal(shadows(polygons, 430 + slope * 500, 500), true)
})

test('offscreen overhead blockers remain visible in the shadow field, with no tile seams', () => {
  const edges = terrainBoundary([{ x: 200, y: 100, w: 50, h: 20 }, { x: 250, y: 100, w: 50, h: 20 }])
  const polygons = daylightShadowPolygons(edges, { x: 500, y: 700, w: 60, h: 100 })
  for (const x of [500.1, 543.7, 543.9, 559.9]) assert.equal(shadows(polygons, x, 750), true)
  for (const polygon of polygons) for (const [x, y] of polygon) {
    assert.ok(x >= 500 && x <= 560 && y >= 700 && y <= 800)
  }
})

test('the sunlight field covers the viewport without treating the enclosing frame as a caster', () => {
  const level = { width: 1200, height: 600, platforms: [{ x: 200, y: 100, w: 100, h: 20 }] }
  const edges = staticCasters({ level }).flatMap(group => group.boundary)
  const polygons = daylightShadowPolygons(edges, { x: -40, y: 500, w: 1280, h: 500 }, level.width, level.height)
  for (const y of [599, 601, 900]) {
    assert.equal(shadows(polygons, 250 + slope * (y - 120), y), true)
    assert.equal(shadows(polygons, 100, y), false)
  }
})
