import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial, levelProblems, levelTerrain } from '../src/games/jumping/level.ts'
import { addItem, hitItem, itemOutline, moveItem } from '../src/games/jumping/editor.ts'
import { placeOnSurface, surfacePlacement } from '../src/games/jumping/editorPlacement.ts'
import { placementPreview } from '../src/games/jumping/builderPlacement.ts'
import { createPreviewRun, createRun } from '../src/games/jumping/challenge.ts'
import { nearestBoundary, polygonIntersects } from '../src/games/jumping/geometry.ts'
import { robotHulls } from '../src/games/jumping/robotPhysics.ts'

function ramp(slope) {
  const rise = Math.abs(slope) * 400
  return { ...blankTrial(), height: 1800, floor: 1800,
    spawn: { x: 150, y: 1800 }, goal: { x: 1650, y: 1800 },
    platforms: [{ x: 400, y: 800 - rise / 2, w: 400, h: rise + 20,
      polygon: slope > 0 ? [[0, 0], [400, rise], [400, rise + 20], [0, 20]]
        : [[0, rise], [400, 0], [400, 20], [0, rise + 20]] }] }
}

function supported(level, slope) {
  const preview = createPreviewRun(level).robots[0], playing = createRun(level).robots[0]
  for (const key of ['x', 'y', 'angle']) assert.equal(preview[key], playing[key], 'editing and playing use the same pose')
  assert.ok(Math.abs(preview.angle - Math.atan(slope)) < .001)
  for (const side of [-1, 1]) {
    const x = preview.x + side * 17 * Math.cos(preview.angle)
    const y = preview.y - 9 + side * 17 * Math.sin(preview.angle)
    assert.ok(Math.abs(nearestBoundary(level.platforms[0], x, y).distance - 9) < .01, 'both wheels touch the slope')
  }
  for (const hull of robotHulls(preview)) for (const solid of levelTerrain(level)) {
    assert.equal(polygonIntersects(hull, solid, .02), false, 'the tilted chassis and wheels clear terrain')
  }
  const outline = itemOutline(level, { kind: 'robot', index: 0 })
  for (const point of robotHulls(preview).flat()) {
    assert.ok(point[0] >= outline.x - .01 && point[0] <= outline.x + outline.w + .01)
    assert.ok(point[1] >= outline.y - .01 && point[1] <= outline.y + outline.h + .01)
  }
  const hull = robotHulls(preview)[0], center = hull.reduce((sum, point) => [sum[0] + point[0] / 4, sum[1] + point[1] / 4], [0, 0])
  assert.deepEqual(hitItem(level, ...center, 0), { kind: 'robot', index: 0 }, 'the tilted body remains selectable')
}

for (const slope of [-3, -1, -.5, -.125, .125, .5, 1, 3]) test(`shovebot click placement seats both wheels on a slope (${slope})`, () => {
  const source = ramp(slope), original = structuredClone(source)
  const point = { x: 600, y: 790 }, added = addItem(source, 'pusher', point, point)
  assert.equal(placeOnSurface(added.level, added.selection, 9), added.level, 'nearby snapping respects its reach')
  const preview = placementPreview(source, 'pusher', point, true, 1)
  assert.equal(preview.level.robots[0].y, 800)
  assert.deepEqual([preview.level.robots[0].left, preview.level.robots[0].right], [430, 770])
  assert.deepEqual(levelProblems(preview.level), [])
  supported(preview.level, slope)
  assert.deepEqual(source, original, 'hover does not edit the draft')
})

for (const slope of [-3, 3]) test(`dropping and dragging a shovebot uses sloping wheel support (${slope})`, () => {
  const point = { x: 600, y: 600 }, added = addItem(ramp(slope), 'pusher', point, point)
  assert.equal(placeOnSurface(added.level, added.selection, 12), added.level)
  const dropped = placeOnSurface(added.level, added.selection)
  assert.equal(dropped.robots[0].y, 800)
  supported(dropped, slope)
  const moved = moveItem(dropped, added.selection, 20, slope * 20 - 8)
  const dragged = placeOnSurface(moved, added.selection, 12)
  assert.equal(dragged.robots[0].y, 800 + slope * 20)
  supported(dragged, slope)
})

test('Snap off and Alt keep a floating shovebot at the cursor near a slope', () => {
  const source = ramp(3), point = { x: 600, y: 790 }
  for (const [snap, free] of [[false, false], [true, true]]) {
    const preview = placementPreview(source, 'pusher', { ...point, free }, snap, 1)
    const robot = createPreviewRun(preview.level).robots[0]
    assert.equal(preview.level.robots[0].y, point.y)
    assert.equal(robot.y, point.y); assert.equal(robot.angle, 0)
  }
})

test('a slope snap still needs both wheels and a clear chassis', () => {
  const source = ramp(3), point = { x: 403, y: 209 }, added = addItem(source, 'pusher', point, point)
  assert.equal(surfacePlacement(added.level, added.selection, 12), null, 'a wheel cannot hang over a cliff')
  const centered = addItem(source, 'pusher', { x: 600, y: 790 }, { x: 600, y: 790 })
  centered.level.platforms.push({ x: 610, y: 740, w: 50, h: 40 })
  assert.equal(surfacePlacement(centered.level, centered.selection, 12), null, 'a nearby wall blocks the tilted chassis')
})
