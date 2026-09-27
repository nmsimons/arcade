import test from 'node:test'
import assert from 'node:assert/strict'
import { JSON_LAB } from './helpers/jumping-fixtures.mjs'
import { parseLevel, prepareLevelRopes, triggerTargets } from '../src/games/jumping/level.ts'
import { allSelections, itemDefinition, renameItem, duplicateItem, moveItem, resizeLevelHeight, moveVertex, deleteTerrainNode, insertTerrainNode, setTriggerTargets } from '../src/games/jumping/editor.ts'
import { copyForEditing } from '../src/games/jumping/puzzleEditor.ts'

test('every object type keeps its name through movement, duplication, templates and JSON round trips', () => {
  const selections = allSelections(JSON_LAB)
  let level = JSON_LAB
  for (const selection of selections) level = renameItem(level, selection, `  ${selection.kind} ${selection.index} — north  `)
  for (const selection of selections) {
    const expected = `${selection.kind} ${selection.index} — north`
    assert.equal(itemDefinition(JSON_LAB, selection).name, undefined, 'renaming leaves the source intact')
    assert.equal(itemDefinition(level, selection).name, expected)
    assert.equal(itemDefinition(moveItem(level, selection, 20, 0), selection).name, expected)
    const duplicate = duplicateItem(level, selection)
    if (duplicate) {
      assert.equal(itemDefinition(duplicate.level, duplicate.selection).name, expected)
      assert.equal(itemDefinition(parseLevel(prepareLevelRopes(duplicate.level)), duplicate.selection).name, expected)
    }
  }
  const restored = parseLevel(JSON.parse(JSON.stringify(level)))
  assert.deepEqual(restored, level)
  for (const next of [resizeLevelHeight(restored, 1600), copyForEditing(restored)]) {
    for (const selection of selections) assert.equal(itemDefinition(next, selection).name, itemDefinition(level, selection).name)
  }
  const selection = selections[0]
  const cleared = renameItem(restored, selection, '   ')
  assert.equal('name' in itemDefinition(cleared, selection), false)
  assert.equal(itemDefinition(restored, selection).name, 'spawn 0 — north')
})

test('names survive terrain node edits and pressure-plate connection edits without changing mechanism IDs', () => {
  let level = renameItem(JSON_LAB, { kind: 'platform', index: 0 }, 'North wall')
  const terrain = level.platforms[0]
  level = insertTerrainNode(level, { index: 0, edge: 0, x: terrain.x + terrain.w / 2, y: terrain.y })
  level = moveVertex(level, 0, 1, 0, -20)
  assert.equal(level.platforms[0].name, 'North wall')
  level = deleteTerrainNode(level, 0, 1)
  assert.equal(level.platforms[0].name, 'North wall')
  const ids = level.mechanisms.map(m => m.id)
  level = renameItem(level, { kind: 'mechanism', index: 0 }, 'West elevator')
  level = renameItem(level, { kind: 'trigger', index: 0 }, 'Elevator switch')
  level = setTriggerTargets(level, 0, ids)
  assert.equal(level.triggers[0].name, 'Elevator switch')
  assert.deepEqual(triggerTargets(level.triggers[0]), ids)
  assert.deepEqual(level.mechanisms.map(m => m.id), ids)
  assert.equal(parseLevel(prepareLevelRopes(level)).mechanisms[0].name, 'West elevator')
})

test('object names are bounded strings, normalized on import, and optional for old files', () => {
  assert.deepEqual(parseLevel(JSON_LAB), JSON_LAB)
  for (const selection of allSelections(JSON_LAB)) {
    for (const name of [null, 12, {}, [], 'x'.repeat(81)]) {
      const level = structuredClone(JSON_LAB)
      itemDefinition(level, selection).name = name
      assert.throws(() => parseLevel(level), /valid jumping level/)
    }
    const level = structuredClone(JSON_LAB)
    itemDefinition(level, selection).name = '  café <door>  '
    assert.equal(itemDefinition(parseLevel(level), selection).name, 'café <door>')
    itemDefinition(level, selection).name = '   '
    assert.equal('name' in itemDefinition(parseLevel(level), selection), false)
  }
})
