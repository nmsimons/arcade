import test from 'node:test'
import assert from 'node:assert/strict'
import { addItem, transformTerrain } from '../src/games/jumping/editor.ts'
import { blankTrial, copyLevel, parseLevel } from '../src/games/jumping/level.ts'
import { nearestBoundary, pointInside, polygonArea, polygonPoints } from '../src/games/jumping/geometry.ts'

const outline = terrain => polygonPoints(terrain).map(p => p.join(',')).sort()
const transforms = ['rotate-left', 'rotate-right', 'flip-horizontal', 'flip-vertical']

test('step templates match the stepped underside and extended landing, at both tread widths', () => {
  const expected = [[0,5],[0,4],[1,4],[1,3],[2,3],[2,2],[3,2],[3,1],[4,1],[4,0],
    [6,0],[6,1],[5,1],[5,2],[4,2],[4,3],[3,3],[3,4],[2,4],[2,5]]
  for (const [tool, tread] of [['steps-narrow', 20], ['steps-wide', 40]]) {
    const source = blankTrial(), original = copyLevel(source)
    const added = addItem(source, tool, { x: 200, y: 300 }, { x: 200, y: 300 })
    const terrain = added.level.platforms[0]
    assert.deepEqual(added.selection, { kind: 'platform', index: 0 })
    assert.deepEqual([terrain.x, terrain.y, terrain.w, terrain.h], [200, 300, 6 * tread, 100])
    assert.deepEqual(terrain.polygon, expected.map(([x, y]) => [x * tread, y * 20]))
    assert.equal(pointInside(terrain, 200 + tread * 3.5, 390), false, 'the space under the steps remains open')
    assert.equal(pointInside(terrain, 200 + tread * 5.5, 310), true, 'the upper landing is two treads long')
    assert.deepEqual(parseLevel(added.level).platforms, added.level.platforms)
    assert.deepEqual(source, original)
    for (const transform of transforms) assert.doesNotThrow(() => parseLevel(transformTerrain(added.level, 0, transform)))
    for (const point of [{ x: -100, y: -100 }, { x: source.width, y: source.height }]) {
      const edge = addItem(source, tool, point, point).level.platforms[0]
      assert.equal(edge.w, terrain.w); assert.equal(edge.h, terrain.h)
      assert.ok(edge.x >= 0 && edge.y >= 0 && edge.x + edge.w <= source.width && edge.y + edge.h <= source.height)
    }
    source.platforms = Array.from({ length: 160 }, () => ({ x: 400, y: 600, w: 40, h: 40 }))
    assert.throws(() => addItem(source, tool, { x: 200, y: 200 }, { x: 200, y: 200 }), /160 terrain/)
  }
})

test('quarter turns and flips preserve rectangle, slope and concave geometry, names and materials', () => {
  for (const shape of [{}, { profile: [[0, 100], [200, 0]] },
    { polygon: [[0,0],[200,0],[200,100],[80,100],[80,40],[0,40]] }]) {
    const level = blankTrial()
    level.platforms = [{ x: 400, y: 400, w: 200, h: 100, material: 'steel', name: 'Test terrain', ...shape }]
    const original = copyLevel(level), before = level.platforms[0]
    for (const transform of transforms) {
      const changed = transformTerrain(level, 0, transform), terrain = changed.platforms[0]
      assert.equal(terrain.x + terrain.w / 2, 500)
      assert.equal(terrain.y + terrain.h / 2, 450)
      assert.equal(terrain.name, before.name); assert.equal(terrain.material, before.material)
      assert.equal(Math.abs(polygonArea(polygonPoints(terrain))), Math.abs(polygonArea(polygonPoints(before))))
      assert.deepEqual(parseLevel(changed).platforms, changed.platforms)
      assert.deepEqual(changed.spawn, level.spawn); assert.deepEqual(changed.goal, level.goal)
      const inverse = transform === 'rotate-left' ? 'rotate-right' : transform === 'rotate-right' ? 'rotate-left' : transform
      assert.deepEqual(outline(transformTerrain(changed, 0, inverse).platforms[0]), outline(before))
    }
    let turned = level
    for (let i = 0; i < 4; i++) turned = transformTerrain(turned, 0, 'rotate-right')
    assert.deepEqual(outline(turned.platforms[0]), outline(before))
    assert.deepEqual(level, original)
  }
})

test('terrain transforms carry exact rope attachment points and detach upright ladders on rotation', () => {
  const level = blankTrial()
  level.platforms = [{ x: 400, y: 400, w: 200, h: 100 }]
  level.climbables = {
    ropes: [{ x: 440, y: 400, length: 180, segments: 16, anchor: { platform: 0, x: 40, y: 0 }, rest: { key: 'stale' } },
      { x: 100, y: 200, length: 180, segments: 16 }],
    ladders: [{ x: 384, top: 400, bottom: 700, side: 1, platform: 0 }],
  }
  const anchors = { 'rotate-right': [100,40], 'rotate-left': [0,160], 'flip-horizontal': [160,0], 'flip-vertical': [40,100] }
  for (const transform of transforms) {
    const changed = transformTerrain(level, 0, transform), terrain = changed.platforms[0], rope = changed.climbables.ropes[0]
    assert.deepEqual([rope.anchor.x, rope.anchor.y], anchors[transform])
    assert.equal(rope.x, terrain.x + rope.anchor.x); assert.equal(rope.y, terrain.y + rope.anchor.y)
    assert.equal(nearestBoundary(terrain, rope.x, rope.y).distance, 0)
    assert.equal(rope.length, 180); assert.equal(rope.rest, undefined)
    assert.deepEqual(changed.climbables.ropes[1], level.climbables.ropes[1])
    assert.deepEqual(changed.climbables.ladders[0], { ...level.climbables.ladders[0], platform: transform.startsWith('rotate') ? -1 : 0 })
    assert.doesNotThrow(() => parseLevel(changed))
  }
  assert.equal(level.climbables.ropes[0].rest.key, 'stale')
})

test('rotation fits all four room edges without scaling and rejects shapes that cannot fit', () => {
  const level = { ...blankTrial(), width: 1000, height: 800, floor: 800 }
  for (const [x,y,w,h] of [[0,200,100,300],[900,200,100,300],[200,0,300,100],[200,700,300,100]]) {
    level.platforms = [{ x, y, w, h }]
    for (const transform of ['rotate-left', 'rotate-right']) {
      const terrain = transformTerrain(level, 0, transform).platforms[0]
      assert.equal(terrain.w, h); assert.equal(terrain.h, w)
      assert.ok(terrain.x >= 0 && terrain.y >= 0 && terrain.x + terrain.w <= 1000 && terrain.y + terrain.h <= 800)
    }
  }
  level.platforms = [{ x: 0, y: 100, w: 900, h: 40 }]
  const original = copyLevel(level)
  assert.throws(() => transformTerrain(level, 0, 'rotate-right'), /too large/)
  assert.deepEqual(level, original)
  level.platforms[0].h = 8
  level.platforms[0].w = 100
  assert.throws(() => transformTerrain(level, 0, 'rotate-left'), /too thin/)
})
