import test from 'node:test'
import assert from 'node:assert/strict'
import { terrainRegionLighting } from '../src/games/jumping/terrainRegionLighting.ts'
import { EnvironmentLighting } from '../src/games/jumping/environmentLighting.ts'
import { blankTrial } from '../src/games/jumping/level.ts'
import { createPreviewRun } from '../src/games/jumping/challenge.ts'
import { regionLighting } from '../src/games/jumping/environment.ts'

const wall = (x, y, w, h, lighting = 'night') => ({ kind: 'cave', x, y, w, h, lighting })
const environment = (walls = [], baseLighting = 'day') => ({ kind: 'interior', lighting: 'regions', baseLighting, walls })
const rock = { x: 100, y: 100, w: 200, h: 200 }

test('terrain has one shade, with Day only when its entire area belongs to Day', () => {
  assert.equal(terrainRegionLighting(environment(), rock), 'day')
  assert.equal(terrainRegionLighting(environment([], 'night'), rock), 'night')
  assert.equal(terrainRegionLighting(environment([wall(0, 200, 500, 300)]), rock), 'night')
  // A region wholly inside the rock cannot be found by testing its corners.
  assert.equal(terrainRegionLighting(environment([wall(150, 150, 10, 10)]), rock), 'night')
  assert.equal(terrainRegionLighting(environment([wall(299.999, 200, 20, 20)]), rock), 'night')
  assert.equal(terrainRegionLighting(environment([wall(300, 100, 20, 200)]), rock), 'day', 'edge contact alone has no Night area')
})

test('the actual concave and sloping outlines determine overlap, rather than bounding boxes', () => {
  const c = { ...rock, polygon: [[0,0],[200,0],[200,40],[40,40],[40,160],[200,160],[200,200],[0,200]] }
  assert.equal(terrainRegionLighting(environment([wall(200, 180, 20, 20)]), c), 'day', 'the Night region is in the empty notch')
  assert.equal(terrainRegionLighting(environment([wall(130, 180, 20, 20)]), c), 'night')
  const slope = { ...rock, profile: [[0,100],[200,0]] }
  assert.equal(terrainRegionLighting(environment([wall(100, 100, 20, 20)]), slope), 'day')
  assert.equal(terrainRegionLighting(environment([wall(260, 150, 20, 20)]), slope), 'night')
  const triangle = { ...wall(200, 200, 100, 100), polygon: [[0,0],[100,0],[0,100]] }
  assert.equal(terrainRegionLighting(environment([triangle]), { x: 270, y: 270, w: 20, h: 20 }), 'day')
  for (const polygon of [triangle.polygon, [...triangle.polygon].reverse()])
    assert.equal(terrainRegionLighting(environment([{ ...triangle, polygon }]), rock), 'night')
})

test('frontmost Day regions mask Night, including unions of separate covers and a Night base', () => {
  const covers = [wall(100, 100, 100, 200, 'day'), wall(200, 100, 100, 200, 'day')]
  assert.equal(terrainRegionLighting(environment([wall(0, 0, 500, 500), ...covers]), rock), 'day')
  assert.equal(terrainRegionLighting(environment(covers, 'night'), rock), 'day')
  assert.equal(terrainRegionLighting(environment([covers[0]], 'night'), rock), 'night')
  assert.equal(terrainRegionLighting(environment([...covers, wall(250, 150, 10, 10)]), rock), 'night')
  assert.equal(terrainRegionLighting(environment([wall(0, 0, 500, 500), ...covers.map(c => ({ ...c, w: c.w - .001 }))]), rock), 'night')
})

test('piece shade and frame shade ignore spill, respect terrain layers and refresh after region edits', () => {
  const level = { ...blankTrial(), width: 1000, height: 800, floor: 800,
    platforms: [rock, { x: 180, y: 100, w: 40, h: 40 }],
    environment: environment([wall(0, 200, 1000, 600)]), lighting: { nightMode: true, ambient: 0, lights: [] } }
  const run = createPreviewRun(level), light = new EnvironmentLighting(), before = JSON.stringify(level)
  assert.equal(light.terrainExposureAt(run, 120, 120), .35, 'the upper part of the crossing rock stays dark')
  assert.equal(light.terrainExposureAt(run, 200, 120), .95, 'the separate Day piece is in front')
  assert.equal(light.terrainExposureAt(run, 200, 250), .35)
  assert.ok(light.exposureAt(run, 600, 220) > .9, 'spill can stay bright beside dark rock')
  assert.equal(light.frameExposureAt(run), .35)
  const changed = createPreviewRun({ ...level, environment: environment() })
  assert.equal(light.terrainExposureAt(changed, 120, 120), .95)
  assert.equal(light.frameExposureAt(changed), .95)
  const covered = createPreviewRun({ ...level, environment: environment([
    wall(0, 0, 1000, 800), wall(0, 0, 500, 800, 'day'), wall(500, 0, 500, 800, 'day'),
  ]) })
  assert.equal(light.frameExposureAt(covered), .95, 'fully hidden Night regions do not darken the frame')
  assert.equal(JSON.stringify(level), before)
})

test('layered rectangle arrangements agree with the visible region at every exact cell', () => {
  let seed = 1729
  const random = max => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % max }
  const piece = { x: 0, y: 0, w: 100, h: 100 }
  for (let trial = 0; trial < 80; trial++) {
    const walls = Array.from({ length: 8 }, () => wall(random(100), random(100), random(80) + 1, random(80) + 1, random(2) ? 'day' : 'night'))
    const env = environment(walls, random(2) ? 'day' : 'night')
    const cuts = axis => [...new Set([0, 100, ...walls.flatMap(w => [w[axis], Math.min(100, w[axis] + w[axis === 'x' ? 'w' : 'h'])])])].sort((a,b) => a-b)
    const xs = cuts('x'), ys = cuts('y')
    let night = false
    for (let x = 1; x < xs.length; x++) for (let y = 1; y < ys.length; y++)
      night ||= regionLighting(env, (xs[x-1] + xs[x]) / 2, (ys[y-1] + ys[y]) / 2) === 'night'
    assert.equal(terrainRegionLighting(env, piece), night ? 'night' : 'day', `arrangement ${trial}`)
  }
})
