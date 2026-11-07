import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial, levelProblems, parseLevel } from '../src/games/jumping/level.ts'
import { addItem, deleteItem, hitItem, itemOutline, moveItem, replacePlatform, setWallDoor } from '../src/games/jumping/editor.ts'
import { copySelections, pasteSelections } from '../src/games/jumping/editorSelection.ts'
import { placeOnSurface } from '../src/games/jumping/editorPlacement.ts'
import { objectLabel } from '../src/games/jumping/objectLabels.ts'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { NEUTRAL_INPUT } from '../src/games/jumping/model.ts'

const course = (wallDoors) => ({ ...blankTrial(), id: 'wall-doors', name: 'Wall doors', wallDoors })

test('wall doors parse with a condition, an optional bulkhead frame and facing', () => {
  const level = parseLevel(course([{ x: 600, y: 920, condition: 'caved-in', frame: 'bulkhead', flipX: true, name: 'Old exit' }, { x: 900, y: 920, condition: 'boarded' }]))
  assert.deepEqual(level.wallDoors, [{ name: 'Old exit', x: 600, y: 920, condition: 'caved-in', frame: 'bulkhead', flipX: true }, { x: 900, y: 920, condition: 'boarded' }])
  assert.deepEqual(levelProblems(level), [])
  for (const broken of [{ x: 600, y: 920, condition: 'open' }, { x: 600, y: 920 }, { x: 600, y: 920, condition: 'sealed', frame: 'door' }, { x: 600, y: 920, condition: 'sealed', flipX: 1 }])
    assert.throws(() => parseLevel(course([broken])), /not a valid jumping level/)
  assert.deepEqual(levelProblems(parseLevel(course([{ x: 5, y: 920, condition: 'sealed' }]))), ['Keep “Sealed door 1” inside the level rectangle.'])
})

test('wall doors are placed, snapped, restyled, moved, copied and deleted in any level', () => {
  const added = addItem(course(), 'wall-door', { x: 600, y: 860 }, { x: 600, y: 860 })
  assert.deepEqual(added.selection, { kind: 'wall-door', index: 0 })
  let level = placeOnSurface(added.level, added.selection)
  assert.deepEqual(level.wallDoors, [{ x: 600, y: 920, condition: 'jammed' }])
  assert.equal(objectLabel(level, added.selection), 'Jammed door 1')
  level = setWallDoor(level, 0, { condition: 'boarded', frame: 'bulkhead', flipX: true })
  assert.deepEqual(level.wallDoors[0], { x: 600, y: 920, condition: 'boarded', frame: 'bulkhead', flipX: true })
  assert.equal(objectLabel(level, added.selection), 'Boarded up bulkhead 1')
  assert.deepEqual(setWallDoor(level, 0, { frame: undefined, flipX: false }).wallDoors[0], { x: 600, y: 920, condition: 'boarded' })
  assert.equal(setWallDoor(level, 0, { condition: 'open' }), level, 'unknown conditions are ignored')
  assert.deepEqual(hitItem(level, 600, 880, 2), added.selection)
  assert.equal(itemOutline(level, added.selection).w, 54, 'the outline holds the bulkhead frame')
  assert.equal(moveItem(level, added.selection, -5000, 0).wallDoors[0].x, 20)
  const pasted = pasteSelections(level, copySelections(level, [added.selection]))
  assert.equal(pasted.level.wallDoors.length, 2)
  assert.deepEqual(deleteItem(level, added.selection).wallDoors, [])
  // A wall door standing on a raised platform travels with it.
  const raised = { ...level, platforms: [{ x: 500, y: 800, w: 300, h: 120 }], wallDoors: [{ ...level.wallDoors[0], y: 800 }] }
  assert.equal(replacePlatform(raised, 0, { x: 500, y: 700, w: 300, h: 220 }).wallDoors[0].y, 700)
  // Wall doors also belong in facility areas.
  assert.ok(parseLevel(added.level))
})

test('a wall door is never an exit: walking into it and pressing Up do nothing', () => {
  const level = parseLevel(course([{ x: 400, y: 920, condition: 'jammed' }]))
  const run = createRun({ ...level, entrance: { x: 400, y: 920 } })
  for (let i = 0; i < 240; i++) stepRun(run, NEUTRAL_INPUT)
  for (let i = 0; i < 30; i++) stepRun(run, { ...NEUTRAL_INPUT, climb: i % 2 === 0 })
  assert.equal(run.finished, false)
  assert.equal(run.exit, null)
})
