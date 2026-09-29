import test from 'node:test'
import assert from 'node:assert/strict'
import { JSON_LAB } from './helpers/jumping-fixtures.mjs'
import { blankTrial, levelProblems, parseLevel, prepareLevelRopes, triggerTargets } from '../src/games/jumping/level.ts'
import { defaultObjectLabel, objectLabel } from '../src/games/jumping/objectLabels.ts'
import { allSelections, itemDefinition, renameItem, duplicateItem, moveItem, resizeLevelHeight, moveVertex, deleteTerrainNode, insertTerrainNode, setTriggerTargets } from '../src/games/jumping/editor.ts'
import { copyForEditing } from '../src/games/jumping/puzzleEditor.ts'

const NAMING_LAB = { ...structuredClone(JSON_LAB), version: 2,
  lighting: { nightMode: false, ambient: 0, lights: [{ id: 'lamp', x: 600, y: 120, direction: 90, spread: 60, intensity: 100, power: 'always' }] } }

test('every object type keeps its name through movement, duplication, templates and JSON round trips', () => {
  const selections = allSelections(NAMING_LAB)
  assert.deepEqual([...new Set(selections.map(s => s.kind))].sort(),
    ['spawn', 'goal', 'platform', 'rope', 'ladder', 'checkpoint', 'timer', 'text', 'light', 'pickup', 'prop', 'robot', 'trigger', 'mechanism'].sort())
  let level = NAMING_LAB
  for (const selection of selections) level = renameItem(level, selection, `  ${selection.kind} ${selection.index} — north  `)
  for (const selection of selections) {
    const expected = `${selection.kind} ${selection.index} — north`
    assert.equal(itemDefinition(NAMING_LAB, selection).name, undefined, 'renaming leaves the source intact')
    assert.equal(itemDefinition(level, selection).name, expected)
    assert.equal(objectLabel(level, selection), `${expected} · ${defaultObjectLabel(level, selection)}`)
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
  for (const selection of allSelections(NAMING_LAB)) {
    for (const name of [null, 12, {}, [], 'x'.repeat(81)]) {
      const level = structuredClone(NAMING_LAB)
      itemDefinition(level, selection).name = name
      assert.throws(() => parseLevel(level), /valid jumping level|Invalid lighting/)
    }
    const level = structuredClone(NAMING_LAB)
    itemDefinition(level, selection).name = '  café <door>  '
    assert.equal(itemDefinition(parseLevel(level), selection).name, 'café <door>')
    itemDefinition(level, selection).name = '   '
    assert.equal('name' in itemDefinition(parseLevel(level), selection), false)
  }
})

test('validation identifies every offending named object, including individual switch connections', () => {
  const level = blankTrial()
  level.spawn = { x: 100, y: 300, name: 'Arrival' }
  level.goal = { x: 1500, y: 300, name: 'Departure' }
  level.platforms = [{ x: -10, y: 800, w: 40, h: 120, name: 'West wall' }]
  level.texts = [{ x: -100, y: 100, w: 80, h: 40, text: 'Hint', fontSize: 24, align: 'left', name: 'Warning' }]
  level.triggers = [{ x: 0, y: 200, w: 160, mode: 'coins', threshold: 3, targets: [], name: 'Toll' },
    { x: 400, y: 920, w: 80, mode: 'touch', target: 'missing', name: 'Door switch' }]
  level.robots = [{ x: 300, y: 300, left: 100, right: 600, name: 'Guard' }]
  level.timers = [{ x: -20, y: 300, name: 'Clock' }]
  level.pickups = [{ x: 0, y: 300, kind: 'coin', name: 'Prize' }]
  const issues = levelProblems(level)
  for (const name of ['Arrival', 'Departure', 'West wall', 'Warning', 'Toll', 'Door switch', 'Guard', 'Clock', 'Prize']) {
    assert.ok(issues.some(issue => issue.includes(`“${name} · `)), `missing diagnostic for ${name}`)
  }
  assert.equal(issues.filter(issue => issue.startsWith('Connect “Toll')).length, 1)
  assert.equal(issues.filter(issue => issue.startsWith('Connect “Door switch')).length, 1)
})

test('spotlight errors use names and numbered fallbacks and never substitute UUIDs', () => {
  const level = { ...blankTrial(), version: 2, lighting: { nightMode: true, ambient: 0, lights: [
    { id: 'internal-lamp-id', x: 500, y: 500, direction: 90, spread: 60, intensity: 100, power: 'switched', name: 'Stairs' },
    { id: 'other-internal-id', x: 700, y: 500, direction: 90, spread: 60, intensity: 100, power: 'switched' },
  ] }, mechanisms: [{ id: 'host', kind: 'gate', x: 900, y: 700, w: 20, h: 220, travel: 220, name: 'East door' }] }
  const issues = levelProblems(level).join('\n')
  assert.match(issues, /Connect switched light “Stairs · Spotlight 1”/)
  assert.match(issues, /Connect switched light “Spotlight 2”/)
  assert.doesNotMatch(issues, /internal-lamp-id|other-internal-id/)
  level.lighting.lights[1].id = 'host'
  assert.match(levelProblems(level).join('\n'), /“East door · Gate 1” and “Spotlight 2” must have unique IDs/)
})
