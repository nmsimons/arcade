import test from 'node:test'
import assert from 'node:assert/strict'
import { copyLevel, levelTerrain, newLevel, parseLevel, prepareLevelRopes } from '../src/games/jumping/level.ts'
import { deleteTerrainNode, duplicateItem, insertTerrainNode, moveItem, moveVertex, resizeItem, resizeLevelHeight } from '../src/games/jumping/editor.ts'
import { ropeSegmentCount } from '../src/games/jumping/climbables.ts'

test('terrain materials round-trip without changing legacy level data, and reject unrecognized values', () => {
  const level = newLevel()
  level.platforms = [{ x: 200, y: 300, w: 400, h: 200 }]
  assert.deepEqual(parseLevel(level), level)
  for (const material of ['stone', 'earth', 'chalk', 'steel']) {
    const colored = copyLevel(level)
    colored.floorMaterial = material; colored.platforms[0].material = material
    assert.deepEqual(parseLevel(JSON.parse(JSON.stringify(colored))), colored)
    assert.equal(levelTerrain(colored)[1].material, material)
  }
  for (const invalid of ['wood', '#ffffff', '__proto__', null, 1, {}, ['stone']]) {
    assert.throws(() => parseLevel({ ...level, floorMaterial: invalid }))
    assert.throws(() => parseLevel({ ...level, platforms: [{ ...level.platforms[0], material: invalid }] }))
  }
})

test('moving, resizing, reshaping and duplicating terrain preserve its material', () => {
  let level = newLevel()
  level.floorMaterial = 'earth'
  level.platforms = [{ x: 200, y: 300, w: 400, h: 200, material: 'chalk' }]
  const selection = { kind: 'platform', index: 0 }
  level = moveItem(level, selection, 20, 20)
  level = resizeItem(level, selection, 420, 220)
  level = insertTerrainNode(level, { index: 0, edge: 0, x: 400, y: 320 })
  level = moveVertex(level, 0, 1, 0, -20)
  assert.equal(level.platforms[0].material, 'chalk')
  level = deleteTerrainNode(level, 0, 1)
  assert.equal(level.platforms[0].material, 'chalk')
  level = duplicateItem(level, selection).level
  level = resizeLevelHeight(level, 1200)
  assert.deepEqual(level.platforms.map(p => p.material), ['chalk', 'chalk'])
  assert.equal(level.floorMaterial, 'earth')
  assert.deepEqual(parseLevel(level), level)
})

test('material edits keep the exact settled rope layout, including preview cache keys', () => {
  const level = newLevel()
  level.platforms = [{ x: 200, y: 300, w: 400, h: 200 }]
  level.climbables.ropes = [{ x: 190, y: 200, length: 240, segments: ropeSegmentCount(240) }]
  const prepared = prepareLevelRopes(level)
  const colored = { ...prepared, floorMaterial: 'earth', platforms: [{ ...prepared.platforms[0], material: 'chalk' }] }
  for (const preview of [true, false]) {
    const next = prepareLevelRopes(colored, preview)
    assert.equal(next.climbables.ropes[0], prepared.climbables.ropes[0])
  }
})
