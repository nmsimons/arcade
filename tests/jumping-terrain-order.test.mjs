import test from 'node:test'
import assert from 'node:assert/strict'
import { addItem, addPolygon, deleteTerrainNode, duplicateItem, hitItem, moveVertex, reorderTerrain, terrainNodeTarget, terrainVertexTarget } from '../src/games/jumping/editor.ts'
import { blankTrial, copyLevel, parseLevel } from '../src/games/jumping/level.ts'
import { terrainDrawOrder } from '../src/games/jumping/terrainOrder.ts'
import { drawTerrain } from '../src/games/jumping/render.ts'

function scene() {
  const level = blankTrial()
  level.platforms = Array.from({ length: 3 }, (_, i) => ({ x: 400, y: 400, w: 200, h: 100, name: `Block ${i}` }))
  level.climbables.ropes = [{ x: 440, y: 400, length: 180, segments: 23, anchor: { platform: 0, x: 40, y: 0 } }]
  level.climbables.ladders = [{ x: 384, top: 400, bottom: 700, side: 1, platform: 0 }]
  return level
}
test('terrain depth is optional, bounded and round-trips without changing the legacy order', () => {
  const level = scene()
  assert.deepEqual(terrainDrawOrder(parseLevel(level).platforms), [0, 1, 2])
  for (const value of [-10000, 0, 10000]) {
    level.platforms[0].zIndex = value
    assert.equal(parseLevel(level).platforms[0].zIndex, value)
  }
  for (const value of [10001, -10001, Infinity, NaN, .5, '1', null, {}]) {
    level.platforms[0].zIndex = value
    assert.throws(() => parseLevel(level))
  }
})
test('all four ordering controls preserve terrain indices, geometry and attachments', () => {
  const level = scene(), original = copyLevel(level)
  let changed = reorderTerrain(level, 0, 'front')
  assert.deepEqual(terrainDrawOrder(changed.platforms), [1, 2, 0])
  changed = reorderTerrain(changed, 0, 'backward')
  assert.deepEqual(terrainDrawOrder(changed.platforms), [1, 0, 2])
  changed = reorderTerrain(changed, 0, 'back')
  assert.deepEqual(terrainDrawOrder(changed.platforms), [0, 1, 2])
  changed = reorderTerrain(changed, 0, 'forward')
  assert.deepEqual(terrainDrawOrder(changed.platforms), [1, 0, 2])
  assert.deepEqual(changed.climbables, original.climbables)
  assert.deepEqual(changed.platforms.map(({ zIndex, ...b }) => b), original.platforms)
  assert.deepEqual(parseLevel(changed), changed)
  assert.equal(reorderTerrain(changed, 2, 'front'), changed)
  assert.deepEqual(level, original)
})
test('pointer, vertex and edge selection prefer the visible block after a reordering', () => {
  const level = reorderTerrain(scene(), 0, 'front')
  assert.deepEqual(hitItem(level, 500, 450, 2), { kind: 'platform', index: 0 })
  assert.equal(terrainVertexTarget(level, 400, 400, 1).index, 0)
  assert.equal(terrainNodeTarget(level, 500, 400, 1).index, 0)
})
test('drawing sorts only the authored terrain and retains the enclosing walls above it', () => {
  const authored = [{ x: 10, y: 20, w: 20, h: 20, material: 'chalk', zIndex: 3 },
    { x: 40, y: 20, w: 20, h: 20, material: 'chalk', zIndex: -1 }]
  const wall = { x: -100, y: 0, w: 100, h: 200, material: 'chalk' }, starts = []
  const ctx = { beginPath() {}, moveTo(x) { starts.push(x) }, lineTo() {}, closePath() {}, fill() {} }
  drawTerrain(ctx, [...authored, wall], authored)
  assert.deepEqual(starts, [40, 10, -100])
  assert.deepEqual(authored.map(b => b.x), [10, 40])
  const order = terrainDrawOrder(authored)
  assert.equal(terrainDrawOrder(authored), order)
  authored[0].x++
  assert.equal(terrainDrawOrder(authored), order)
  authored[1].zIndex = 5
  assert.deepEqual(terrainDrawOrder(authored), [0, 1])
})
test('node conversions retain depth and new or duplicated terrain starts in front', () => {
  const level = reorderTerrain(scene(), 0, 'front')
  const moved = moveVertex(level, 0, 0, 0, -20)
  assert.equal(moved.platforms[0].zIndex, level.platforms[0].zIndex)
  assert.equal(deleteTerrainNode(moved, 0, 1).platforms[0].zIndex, level.platforms[0].zIndex)
  for (const tool of ['platform', 'steps-narrow', 'steps-wide']) {
    const added = addItem(level, tool, { x: 800, y: 400 }, { x: 800, y: 400 })
    assert.equal(terrainDrawOrder(added.level.platforms).at(-1), added.selection.index)
  }
  for (const added of [addPolygon(level, [[800,400],[900,400],[900,500]]), duplicateItem(level, { kind: 'platform', index: 1 })]) {
    assert.equal(terrainDrawOrder(added.level.platforms).at(-1), added.selection.index)
  }
})
