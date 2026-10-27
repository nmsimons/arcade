import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial, parseLevel, levelProblems } from '../src/games/jumping/level.ts'
import { parseEnvironment, hasRegionLighting, regionLighting, usesRegionLighting } from '../src/games/jumping/environment.ts'
import { setBackground, setLightingLayout } from '../src/games/jumping/environmentEditor.ts'
import { EnvironmentLighting, daylightPortals } from '../src/games/jumping/environmentLighting.ts'
import { createRun } from '../src/games/jumping/challenge.ts'
import { addItem, moveItem, resizeItem, renameItem, hitItems, allSelections, resizeLevelHeight } from '../src/games/jumping/editor.ts'
import { copySelections, pasteSelections, deleteSelections, selectionsInRect, transformSelections } from '../src/games/jumping/editorSelection.ts'
import { encodeEditorClipboard, decodeEditorClipboard } from '../src/games/jumping/editorClipboard.ts'
import { groupSelections } from '../src/games/jumping/editorGroups.ts'
import { reorderBackWall, backWallPoints } from '../src/games/jumping/backWallEditing.ts'
import { shapePoints, shapeVertexTarget, shapeNodeTarget, insertShapeNode, moveShapeVertex, deleteShapeNode } from '../src/games/jumping/editorShape.ts'
import { portalExposure } from '../src/games/jumping/environmentLighting.ts'

const region = { kind: 'back-wall', index: 0 }
const indoor = () => parseLevel({ ...blankTrial(), version: 2, width: 1600, height: 1000, floor: 1000,
  entrance: { x: 100, y: 1000 }, goal: { x: 1450, y: 1000 }, lighting: { nightMode: true, ambient: 0, lights: [] },
  environment: { kind: 'interior', lighting: 'regions', baseLighting: 'day', walls: [
    { kind: 'facility', name: 'Cave', lighting: 'night', x: 100, y: 300, w: 600, h: 600, polygon: [[0, 0], [600, 0], [560, 600], [0, 600]] },
  ] } })

test('indoor regions round-trip independently of the background and reject malformed settings', () => {
  const level = indoor()
  assert.deepEqual(parseLevel(JSON.parse(JSON.stringify(level))), level)
  assert.deepEqual(levelProblems(level), [])
  assert.equal(level.environment.horizon, undefined)
  assert.equal(regionLighting(level.environment, 50, 200), 'day')
  assert.equal(regionLighting(level.environment, 200, 500), 'night')
  for (const patch of [{ kind: 'unknown' }, { lighting: 'automatic' }, { baseLighting: false },
    { walls: [{ ...level.environment.walls[0], lighting: 'dim' }] }, { walls: [{ ...level.environment.walls[0], name: 'x'.repeat(81) }] }])
    assert.throws(() => parseEnvironment({ ...level.environment, ...patch }, 1600, 1000), /Invalid environment/)
  const legacy = blankTrial()
  assert.equal(parseLevel(legacy).environment, undefined)
  assert.equal(hasRegionLighting(setBackground(legacy, 'landscape').environment), false)
})

test('background and uniform/region lighting changes retain outlines, lamps and physical geometry', () => {
  const level = indoor(), before = structuredClone(level)
  level.lighting.lights.push({ id: 'lamp', x: 900, y: 200, intensity: 100, direction: 90, spread: 60, power: 'always' })
  const sky = setBackground(level, 'landscape'), inside = setBackground(sky, 'interior')
  assert.deepEqual(inside.environment.walls, level.environment.walls)
  assert.deepEqual(inside.lighting.lights, level.lighting.lights)
  assert.deepEqual(inside.platforms, level.platforms)
  assert.equal(inside.environment.kind, 'interior')
  const day = setLightingLayout(inside, 'uniform')
  assert.equal(hasRegionLighting(day.environment), false); assert.equal(day.lighting.nightMode, false)
  const night = { ...day, lighting: { ...day.lighting, nightMode: true } }
  const mixed = setLightingLayout(night, 'regions')
  assert.equal(mixed.environment.baseLighting, 'night'); assert.equal(mixed.lighting.nightMode, true)
  assert.deepEqual(mixed.environment.walls, level.environment.walls)
  const legacyDay = { ...sky, environment: { ...sky.environment, lighting: undefined }, lighting: { ...sky.lighting, nightMode: false } }
  assert.equal(usesRegionLighting(legacyDay), false)
  const uniform = setLightingLayout(legacyDay, 'uniform')
  assert.equal(usesRegionLighting({ ...uniform, lighting: { ...uniform.lighting, nightMode: true } }), false, 'enabling whole-level Night must not activate legacy regions')
  const grown = resizeLevelHeight(level, 1200)
  assert.equal(grown.environment.walls[0].y, 500)
  assert.equal(grown.environment.horizon, undefined)
  assert.deepEqual({ ...level, lighting: before.lighting }, before)
})

test('bright indoor regions spill light through real openings; frontmost regions and terrain control it', () => {
  const level = indoor()
  level.environment.baseLighting = 'night'
  level.environment.walls[0] = { kind: 'facility', lighting: 'night', x: 0, y: 0, w: 1600, h: 1000 }
  level.environment.walls.push({ kind: 'facility', name: 'Service bay', lighting: 'day', x: 400, y: 500, w: 200, h: 200 })
  const light = new EnvironmentLighting(), run = createRun(level)
  assert.ok(daylightPortals(level).length > 0)
  assert.equal(light.exposureAt(run, 500, 600), .95)
  assert.ok(light.exposureAt(run, 700, 600) > .5)
  assert.equal(light.exposureAt(run, 1300, 950), .35)
  const sky = setBackground(level, 'landscape'), skyLight = new EnvironmentLighting(), skyRun = createRun(sky)
  for (const p of [[500, 600], [700, 600], [1300, 950]]) assert.equal(skyLight.exposureAt(skyRun, ...p), light.exposureAt(run, ...p))
  const blocked = { ...level, platforms: [{ x: 605, y: 0, w: 20, h: 1000 }] }
  assert.equal(new EnvironmentLighting().exposureAt(createRun(blocked), 700, 600), .35)
  const covered = reorderBackWall(level, 0, true).level
  assert.equal(new EnvironmentLighting().exposureAt(createRun(covered), 500, 600), .35)
})

test('a wide opening has continuous light across its width and a smooth day/night transition', () => {
  const level = indoor()
  level.environment.walls = [{ kind: 'facility', x: 0, y: 300, w: 1600, h: 700 }]
  level.platforms = [{ x: 0, y: 0, w: 200, h: 1000 }, { x: 1400, y: 0, w: 200, h: 1000 }]
  const run = createRun(level), light = new EnvironmentLighting()
  for (let x = 220; x < 1390; x += 17) {
    assert.ok(Math.abs(light.exposureAt(run, x, 300.1) - light.exposureAt(run, x, 299.9)) < .0001)
    for (const depth of [1, 40, 120, 300, 590])
      assert.ok(Math.abs(light.exposureAt(run, x, 300 + depth) - portalExposure(depth + 2)) < 1e-12, 'a planar opening must not inherit lobes from its visibility samples')
  }
})

test('back walls use normal placement, hit testing, move, resize, transform and deletion without changing physics', () => {
  const level = indoor(), before = structuredClone(level)
  const corner = addItem(level, 'back-wall', { x: 1590, y: 990 }, { x: 1600, y: 1000 }).level.environment.walls.at(-1)
  assert.deepEqual([corner.x, corner.y, corner.w, corner.h], [1590, 990, 10, 10])
  assert.ok(allSelections(level).some(s => s.kind === 'back-wall'))
  assert.equal([...hitItems(level, 100, 600, 8)].at(-1).kind, 'back-wall')
  assert.ok(![...hitItems(level, 400, 500, 8)].some(s => s.kind === 'back-wall'), 'empty interiors remain available to the pointer')
  assert.ok(!selectionsInRect(level, { x: 200, y: 400, w: 100, h: 100 }).some(s => s.kind === 'back-wall'))
  assert.ok(selectionsInRect(level, { x: 50, y: 250, w: 700, h: 700 }).some(s => s.kind === 'back-wall'))
  const moved = renameItem(moveItem(level, region, 40, -20), region, 'Maintenance cave')
  assert.equal(moved.environment.walls[0].name, 'Maintenance cave')
  assert.equal(moved.environment.walls[0].x, 140)
  const resized = resizeItem(moved, region, 500, 400, 'top-left')
  assert.equal(resized.environment.walls[0].x + resized.environment.walls[0].w, 740)
  assert.deepEqual(levelProblems(parseLevel(resized)), [])
  const turned = transformSelections(level, [region], 'rotate-right')
  const restored = transformSelections(turned, [region], 'rotate-left')
  assert.deepEqual(backWallPoints(restored.environment.walls[0]), backWallPoints(level.environment.walls[0]))
  for (const field of ['platforms', 'climbables', 'entrance', 'goal']) assert.deepEqual(resized[field], level[field])
  assert.deepEqual(level, before)
  const empty = deleteSelections(level, [region]); assert.equal(empty.environment.walls.length, 0)
  const added = addItem(blankTrial(), 'back-wall', { x: 200, y: 300 }, { x: 500, y: 700 })
  assert.equal(added.selection.kind, 'back-wall')
  assert.equal(added.level.environment.kind, 'interior')
  assert.equal(added.level.environment.walls[0].lighting, 'night')
  const fromNight = addItem({ ...blankTrial(), version: 2, lighting: { nightMode: true, ambient: 0, lights: [] } }, 'back-wall', { x: 100, y: 200 }, { x: 400, y: 600 })
  assert.equal(fromNight.level.environment.baseLighting, 'night')
  assert.equal(fromNight.level.environment.walls[0].lighting, 'day')
})

test('back-wall nodes use the regular Node tool even underneath terrain, with bounded valid outlines', () => {
  const level = indoor()
  level.platforms.push({ x: 90, y: 290, w: 200, h: 200 })
  const target = shapeVertexTarget(level, 100, 300, 10, region)
  assert.equal(target.kind, 'back-wall')
  const edge = shapeNodeTarget(level, 400, 300, 10, 5, region)
  const inserted = insertShapeNode(level, edge)
  assert.equal(shapePoints(inserted, region).length, 5)
  const moved = moveShapeVertex(inserted, region, 1, 20, -40)
  assert.deepEqual(shapePoints(moved, region)[1], [420, 260])
  assert.deepEqual(deleteShapeNode(moved, region, 1).environment.walls[0].polygon, level.environment.walls[0].polygon)
  assert.deepEqual(moved.platforms, level.platforms)
})

test('clipboard and groups retain back-wall names, lighting, layer order and geometry across levels', () => {
  const level = indoor()
  level.environment.walls.push({ kind: 'facility', x: 800, y: 300, w: 400, h: 600, lighting: 'day', name: 'Lit bay' })
  const selections = [region, { kind: 'back-wall', index: 1 }]
  const grouped = groupSelections(level, selections)
  const clipboard = decodeEditorClipboard(encodeEditorClipboard(copySelections(grouped, selections)))
  const pasted = pasteSelections(blankTrial(), clipboard, 0, 0)
  assert.equal(pasted.level.environment.kind, 'interior')
  assert.deepEqual(pasted.level.environment.walls.map(w => [w.name, w.lighting]), [['Cave', 'night'], ['Lit bay', 'day']])
  assert.equal(pasted.level.editorGroups[0].members.length, 2)
  const reordered = reorderBackWall(pasted.level, 0, true).level
  assert.equal(reordered.environment.walls[1].name, 'Cave')
  assert.deepEqual(reordered.editorGroups[0].members.map(s => s.index), [1, 0])
  assert.deepEqual(parseLevel(reordered).environment, reordered.environment)
})
