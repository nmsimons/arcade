import { DEFAULT_LEVEL, createPlayer, stepPlayer } from './helpers/jumping-fixtures.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { copyLevel, levelPlayer, levelRules, levelTerrain, newLevel, parseLevel, snapToGround, spawnProblem } from '../src/games/jumping/level.ts'
import { addItem, deleteItem, insertTerrainNode, moveItem, replacePlatform, resizeItem, terrainNodeTarget } from '../src/games/jumping/editor.ts'
import { polygonArea, polygonPoints } from '../src/games/jumping/geometry.ts'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { createRope, NO_CLIMBABLES, stepRope } from '../src/games/jumping/climbables.ts'
import { groundAt } from '../src/games/jumping/terrain.ts'

function advance(p, frames, move, platforms, rules) {
  for (let i = 0; i < frames; i++) stepPlayer(p, { ...NEUTRAL_INPUT, move }, STEP, platforms, NO_CLIMBABLES, rules)
}
test('joined slopes have no internal wall in either direction, including uphill and downhill seams', () => {
  const terrain = [{ x: 0, y: 620, w: 200, h: 320 },
    { x: 200, y: 560, w: 200, h: 380, profile: [[0, 60], [200, 0]] },
    { x: 400, y: 560, w: 200, h: 380, profile: [[0, 0], [200, 60]] },
    { x: 600, y: 620, w: 500, h: 320 }]
  for (const direction of [-1, 1]) {
    const p = createPlayer(); p.x = direction === 1 ? 120 : 850
    for (let frame = 0; frame < 225; frame++) {
      const before = p.x
      advance(p, 1, direction, terrain)
      assert.ok(p.grounded); assert.ok((p.x - before) * direction > 0, `blocked at ${p.x}`)
      assert.ok(Math.abs(p.y - groundAt(terrain, p.x, p.y).y) < .001)
    }
    assert.ok(direction === 1 ? p.x > 720 : p.x < 250)
  }
})
test('level boundaries enclose the visible rectangle at either width', () => {
  for (const width of [3200,7000]) for (const direction of [-1,1]) {
    const level = newLevel(); level.width = width; level.spawn = { x: direction > 0 ? width - 30 : 30, y: 1000 }
    const p = levelPlayer(level); advance(p, 100, direction, levelTerrain(level), levelRules(level))
    assert.ok(p.x >= 12 && p.x <= width - 12); assert.ok(p.grounded); assert.equal(p.y, 1000)
  }
})

test('rope collisions use the visible slope rather than its rectangular bounding box', () => {
  const terrain = [{ x: 0, y: 400, w: 1000, h: 200, profile: [[0, 200], [1000, 0]] }]
  const rope = createRope({ x: 200, y: 200, length: 300, segments: 24 })
  for (let i = 0; i < 60; i++) stepRope(rope, STEP, terrain, null)
  assert.ok(rope.nodes.at(-1).y > 495, 'rope should hang freely above the actual surface at y=560')
})
test('custom checkpoints and falling use the custom spawn rather than playground coordinates', () => {
  const level = newLevel(); level.spawn = { x: 600, y: 1000 }; level.checkpoints = [{ x: 1000, y: 1000 }]
  const p = levelPlayer(level); p.x = 960
  advance(p, 1, 0, levelTerrain(level), levelRules(level)); assert.equal(p.spawnX, 1000)
  p.y = levelRules(level).fallY + 1; p.grounded = false
  advance(p, 1, 0, levelTerrain(level), levelRules(level)); assert.equal(p.x, 1000); assert.equal(p.y, 1000)
  const other = newLevel(); other.checkpoints = []
  const q = levelPlayer(other); q.x = 1500
  advance(q, 1, 0, levelTerrain(other), levelRules(other)); assert.equal(q.spawnX, 200)
})
test('builder operations create editable terrain, keep the source unchanged, and move attached markers', () => {
  const level = newLevel(), original = copyLevel(level)
  const result = addItem(level, 'rough', { x: 400, y: 620 }, { x: 900, y: 520 })
  assert.equal(result.level.platforms.length, 1); assert.equal(result.level.platforms[0].profile.length, 11)
  assert.deepEqual(level, original)
  let edited = addItem(result.level, 'spawn', { x: 500, y: 520 }, { x: 500, y: 520 }).level
  assert.equal(spawnProblem(edited), null)
  const spawn = { ...edited.spawn }
  edited = moveItem(edited, result.selection, 100, -20)
  assert.equal(edited.spawn.x, spawn.x + 100); assert.equal(edited.spawn.y, spawn.y - 20)
  edited = resizeItem(edited, result.selection, 1000, 120)
  assert.equal(edited.platforms[0].profile.at(-1)[0], 1000)
  assert.equal(spawnProblem(edited), null)
  assert.deepEqual(parseLevel(edited), edited)
  assert.equal(deleteItem(edited, result.selection).platforms.length, 0)
})
test('deleting terrain detaches its ladders and reindexes the remaining attachments', () => {
  const level = copyLevel(DEFAULT_LEVEL)
  const removed = deleteItem(level, { kind: 'platform', index: 4 })
  assert.equal(removed.climbables.ladders.length, 2); assert.equal(removed.climbables.ladders[0].platform, -1); assert.equal(removed.climbables.ladders[1].platform, 4)
  const moved = replacePlatform(removed, 4, { ...removed.platforms[4], x: 2300, y: 470 })
  assert.equal(moved.climbables.ladders[1].x, 2284); assert.equal(moved.climbables.ladders[1].top, 470)
  assert.deepEqual(parseLevel(moved), moved)
})

test('each terrain corner resizes the shape from its opposite corner and carries attached objects', () => {
  const corners = ['top-left', 'top-right', 'bottom-left', 'bottom-right']
  for (const shape of [{}, { polygon: [[0, 0], [200, 0], [200, 100], [60, 100], [0, 40]] }, { profile: [[0, 0], [100, 40], [200, 0]] }]) {
    const level = newLevel(), selection = { kind: 'platform', index: 0 }
    level.platforms = [{ x: 200, y: 200, w: 200, h: 100, ...shape }]
    level.spawn = { x: 200, y: 200 }
    const ladder = { x: 184, top: 200, bottom: 600, platform: shape.polygon || shape.profile ? -1 : 0, side: 1 }
    level.climbables = { ladders: [ladder],
      ropes: [{ x: 400, y: 200, length: 200, segments: 24, anchor: { platform: 0, x: 200, y: 0 } }] }
    const original = copyLevel(level)
    for (const corner of corners) {
      const next = resizeItem(level, selection, 300, 200, corner), b = next.platforms[0]
      const x = corner.endsWith('left') ? 100 : 200, y = corner.startsWith('top') ? 100 : 200
      assert.deepEqual([b.x, b.y, b.w, b.h], [x, y, 300, 200])
      for (const key of ['polygon', 'profile']) if (shape[key]) {
        assert.deepEqual(b[key].map(([px, py]) => [px / b.w, py / b.h]), shape[key].map(([px, py]) => [px / 200, py / 100]))
      }
      assert.deepEqual(next.spawn, { x, y })
      assert.deepEqual(next.climbables.ladders[0], ladder.platform === -1 ? ladder : { x: x - 16, top: y, bottom: y + 400, platform: 0, side: 1 })
      assert.deepEqual(next.climbables.ropes[0].anchor, { platform: 0, x: 300, y: 0 })
      assert.equal(next.climbables.ropes[0].x, x + 300); assert.equal(next.climbables.ropes[0].y, y)
      assert.doesNotThrow(() => parseLevel(next))
      assert.deepEqual(level, original)
    }
  }
})

test('terrain corner resizing respects room bounds, attached ladders and minimum size without flipping', () => {
  const level = newLevel(), selection = { kind: 'platform', index: 0 }
  level.platforms = [{ x: 200, y: 200, w: 200, h: 100 }]
  level.climbables.ladders = [{ x: 184, top: 200, bottom: 600, platform: 0, side: 1 }, { x: 416, top: 200, bottom: 600, platform: 0, side: -1 }]
  for (const corner of ['top-left', 'top-right', 'bottom-left', 'bottom-right']) {
    const left = corner.endsWith('left'), top = corner.startsWith('top')
    const large = resizeItem(level, selection, 10000, 10000, corner).platforms[0]
    assert.equal(large.x, left ? 16 : 200); assert.equal(large.x + large.w, left ? 400 : level.width - 16)
    assert.equal(large.y, top ? 0 : 200); assert.equal(large.y + large.h, top ? 300 : level.height)
    const small = resizeItem(level, selection, -200, -100, corner).platforms[0]
    assert.equal(small.w, 20); assert.equal(small.h, 10)
    assert.equal(small.x, left ? 380 : 200); assert.equal(small.y, top ? 290 : 200)
  }
})
test('a ladder can be placed independently and a rope keeps its authored length', () => {
  const level = newLevel(); level.platforms.push({ x: 600, y: 400, w: 200, h: 20 })
  const ladder = addItem(level, 'ladder', { x: 580, y: 400 }, { x: 580, y: 620 })
  assert.equal(ladder.level.climbables.ladders[0].x, 580)
  const rope = addItem(ladder.level, 'rope', { x: 900, y: 200 }, { x: 900, y: 500 })
  assert.equal(rope.level.climbables.ropes[0].length, 300)
  assert.deepEqual(parseLevel(rope.level), rope.level)
})

test('node insertion targets every edge and preserves the surface, markers and attached objects', () => {
  const level = newLevel()
  level.platforms = [{ x: 200, y: 200, w: 200, h: 200 }]
  level.spawn = { x: 250, y: 200 }
  level.climbables = { ladders: [{ x: 184, top: 200, bottom: 600, platform: 0, side: 1 }],
    ropes: [{ x: 400, y: 200, length: 200, segments: 24, anchor: { platform: 0, x: 200, y: 0 } }] }
  const original = copyLevel(level)
  for (const [x, y, edge, px, py] of [[263, 198, 0, 260, 200], [402, 263, 1, 400, 260], [337, 403, 2, 340, 400], [196, 337, 3, 200, 340]]) {
    const target = terrainNodeTarget(level, x, y, 12, 20)
    assert.deepEqual(target, { index: 0, edge, x: px, y: py })
    const inserted = insertTerrainNode(level, target), points = polygonPoints(inserted.platforms[0])
    assert.deepEqual(points[edge + 1], [px, py]); assert.equal(points.length, 5)
    assert.equal(polygonArea(points), 40000)
    assert.deepEqual(inserted.spawn, level.spawn); assert.deepEqual(inserted.climbables.ropes, level.climbables.ropes)
    assert.deepEqual(inserted.climbables.ladders[0], { ...level.climbables.ladders[0], platform: -1 })
    assert.doesNotThrow(() => parseLevel(inserted)); assert.deepEqual(level, original)
  }
  assert.equal(terrainNodeTarget(level, 300, 300, 12), null)
  assert.equal(terrainNodeTarget(level, 200, 200, 12), null)
  const slope = copyLevel(level)
  slope.platforms[0].profile = [[0, 40], [200, 100]]
  slope.climbables.ladders[0].platform = -1
  slope.climbables.ropes[0].y = 300; slope.climbables.ropes[0].anchor.y = 100
  slope.spawn = { x: 200, y: 240 }
  const split = insertTerrainNode(slope, terrainNodeTarget(slope, 300, 270, 12))
  assert.deepEqual(split.platforms[0], { x: 200, y: 200, w: 200, h: 200, polygon: [[0, 40], [100, 70], [200, 100], [200, 200], [0, 200]] })
  assert.deepEqual(split.climbables, slope.climbables); assert.deepEqual(split.spawn, slope.spawn)
  assert.doesNotThrow(() => parseLevel(split))
})

test('node placement keeps sloping and concave edges intact with snapping on or off', () => {
  const level = newLevel(); level.height = 1037
  level.platforms = [{ x: 200, y: 200, w: 300, h: 240, polygon: [[0, 0], [300, 120], [180, 240], [180, 160], [0, 240]] }]
  const target = terrainNodeTarget(level, 271, 228.4, 12, 20)
  assert.deepEqual(target, { index: 0, edge: 0, x: 280, y: 232 })
  const free = terrainNodeTarget(level, 271, 228.4, 12)
  assert.ok(Math.abs(free.x - 271) < .001); assert.ok(Math.abs(free.y - 228.4) < .001)
  const vertical = terrainNodeTarget(level, 380, 393, 12, 20)
  assert.deepEqual(vertical, { index: 0, edge: 2, x: 380, y: 397 })
  for (const point of [target, free, vertical]) {
    const next = insertTerrainNode(level, point)
    assert.equal(polygonArea(polygonPoints(next.platforms[0])), polygonArea(polygonPoints(level.platforms[0])))
    assert.doesNotThrow(() => parseLevel(next))
  }
  const crowded = newLevel()
  crowded.platforms = [{ x: 200, y: 200, w: 400, h: 200, polygon: [...Array.from({ length: 61 }, (_, i) => [i * 400 / 61, 0]), [400, 0], [400, 200], [0, 200]] }]
  assert.throws(() => insertTerrainNode(crowded, terrainNodeTarget(crowded, 400, 400, 12)), /64 nodes/)
})
test('import rejects malformed, unbounded and non-finite geometry before it reaches the simulation', () => {
  for (const change of [v => { v.platforms[0].w = Infinity }, v => { v.platforms[0].profile = [[0, 0], [0, 20]] },
    v => { v.platforms[0].profile = [[0, 0], [v.platforms[0].w, 9000]] }, v => { v.climbables.ropes = [{ x: 0, y: 0, length: 100, segments: 1e9 }] },
    v => { v.climbables.ladders = [{ x: 0, top: 0, bottom: 100, platform: 900, side: 1 }] }, v => { v.spawn.x = -40 }]) {
    const value = newLevel(); value.platforms.push({x:100,y:400,w:300,h:200}); change(value); assert.throws(() => parseLevel(value))
  }
  const valid = parseLevel(JSON.parse(JSON.stringify(DEFAULT_LEVEL))); assert.deepEqual(valid, DEFAULT_LEVEL)
})
test('spawn validation flags missing ground and low ceilings, and start placement snaps to terrain', () => {
  const level = newLevel(); level.spawn = { x: 200, y: 500 }; assert.ok(spawnProblem(level))
  level.spawn = snapToGround(level, 200, 580); assert.equal(spawnProblem(level), null)
  level.platforms.push({ x: 100, y: 940, w: 300, h: 40 }); assert.match(spawnProblem(level), /space/)
})
