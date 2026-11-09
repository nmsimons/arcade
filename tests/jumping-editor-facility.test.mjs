import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial, isHubLevel, isPuzzleLevel, levelProblems, parseLevel } from '../src/games/jumping/level.ts'
import { addItem, allSelections, deleteItem, hitItem, itemOutline, moveItem, replacePlatform, resizeItem, setHubDoorDestination, setLevelType } from '../src/games/jumping/editor.ts'
import { copySelections, deleteSelections, pasteSelections } from '../src/games/jumping/editorSelection.ts'
import { placeOnSurface } from '../src/games/jumping/editorPlacement.ts'
import { objectLabel } from '../src/games/jumping/objectLabels.ts'
import { goalDoor } from '../src/games/jumping/goal.ts'

// A course with an exit door on its floor, ready to become a facility area.
const course = () => ({ ...blankTrial(), id: 'room', name: 'Room', goal: { name: 'Way out', x: 1500, y: 920 } })
// Bulkheads name the facility area they open onto by its level ID.
const facility = () => setHubDoorDestination(setLevelType(course(), 'hub'), { kind: 'bulkhead', index: 0 }, 'facility-concourse')

test('a course becomes a facility area whose exit door becomes a bulkhead, its destination still to choose', () => {
  const before = course(), hub = setLevelType(before, 'hub')
  assert.equal(isHubLevel(hub), true)
  assert.equal(isPuzzleLevel(hub), false)
  assert.equal(hub.timing, 'untimed')
  assert.equal(hub.goal, undefined)
  assert.equal(hub.times, undefined)
  const door = goalDoor(before.goal)
  // A bulkhead goes by where it leads, so the exit's name stays behind.
  assert.deepEqual(hub.bulkheads.map(({ name, x, y, to }) => ({ name, x, y, to })), [{ name: undefined, x: door.x + door.w / 2, y: 920, to: '' }])
  assert.deepEqual([hub.courseDoors, hub.evaluationBoards], [[], []])
  assert.deepEqual(levelProblems(parseLevel(hub)), ['Choose where “Bulkhead 1” leads.'])
  const chosen = setHubDoorDestination(hub, { kind: 'bulkhead', index: 0 }, 'facility-concourse')
  assert.equal(chosen.bulkheads[0].to, 'facility-concourse')
  assert.deepEqual(levelProblems(parseLevel(chosen)), [])
  assert.equal(setLevelType(hub, 'hub'), hub, 'already a facility area')
})

test('a facility area becomes a course again, its first bulkhead becoming the exit', () => {
  const hub = facility(), back = setLevelType(hub, 'course')
  assert.equal(isPuzzleLevel(back), true)
  assert.equal(back.kind, undefined)
  assert.deepEqual([back.courseDoors, back.bulkheads, back.evaluationBoards, back.timing], [undefined, undefined, undefined, undefined])
  assert.deepEqual({ x: back.goal.x, y: back.goal.y }, { x: 1500, y: 920 })
  assert.equal(back.goal.name, undefined, 'a bulkhead goes by where it leads, so it has no name to pass on')
  assert.deepEqual(levelProblems(parseLevel(back)), [])
  // A bulkhead near the left wall leaves the exit's indicator facing inward.
  const left = setLevelType({ ...hub, bulkheads: [{ ...hub.bulkheads[0], x: 100 }] }, 'course')
  assert.equal(left.goal.flipX, true)
  assert.equal(goalDoor(left.goal).x + 20, 100)
})

test('level doors, bulkheads and evaluation boards are placed, snapped, moved and resized in facility areas', () => {
  let level = facility()
  const door = addItem(level, 'course-door', { x: 600, y: 860 }, { x: 600, y: 860 })
  assert.deepEqual(door.selection, { kind: 'course-door', index: 0 })
  level = placeOnSurface(door.level, door.selection)
  assert.deepEqual({ x: level.courseDoors[0].x, y: level.courseDoors[0].y, course: level.courseDoors[0].course }, { x: 600, y: 920, course: '' }, 'snapped to the floor, destination still to choose')
  assert.deepEqual(levelProblems(parseLevel(level)), ['Choose the level that “Level door 1” leads to.'])
  level = setHubDoorDestination(level, door.selection, 'course-one')
  assert.equal(level.courseDoors[0].course, 'course-one')
  assert.deepEqual(levelProblems(parseLevel(level)), [])

  const bulkhead = addItem(level, 'bulkhead', { x: 300, y: 920 }, { x: 300, y: 920 })
  assert.equal(bulkhead.level.bulkheads[1].to, '', 'a new bulkhead waits for a destination')
  level = setHubDoorDestination(bulkhead.level, bulkhead.selection, 'facility-movement')
  assert.equal(level.bulkheads[1].to, 'facility-movement')
  assert.equal(objectLabel(level, bulkhead.selection), 'Bulkhead 2')

  // Doors keep their doorway inside the level, like the entrance.
  assert.equal(moveItem(level, door.selection, -5000, 0).courseDoors[0].x, 20)
  // Clicking a door's placard selects the door, and the lettering above a bulkhead the bulkhead.
  assert.deepEqual(hitItem(level, 600 + 80, 920 - 50, 2), door.selection)
  assert.deepEqual(hitItem(level, 300, 920 - 105, 2), bulkhead.selection)
  assert.ok(itemOutline(level, bulkhead.selection).y <= 920 - 117, 'the bulkhead outline includes its lettering')

  const board = addItem(level, 'evaluation-board', { x: 800, y: 300 }, { x: 800, y: 300 })
  assert.deepEqual(board.level.evaluationBoards.map(({ x, y, w, h }) => ({ x, y, w, h })), [{ x: 800, y: 300, w: 460, h: 250 }])
  const resized = resizeItem(board.level, board.selection, 50, 900, 'bottom-right').evaluationBoards[0]
  assert.deepEqual([resized.w, resized.h], [120, 600], 'boards keep their limits')
  assert.deepEqual(levelProblems(parseLevel(board.level)), [])
  assert.deepEqual(allSelections(board.level).filter(s => ['course-door', 'bulkhead', 'evaluation-board'].includes(s.kind)),
    [{ kind: 'course-door', index: 0 }, { kind: 'bulkhead', index: 0 }, { kind: 'bulkhead', index: 1 }, { kind: 'evaluation-board', index: 0 }])
  assert.ok(itemOutline(board.level, door.selection).w > 40, 'the outline includes the placard')
})

test('doors belong in facility areas; a course has its exit instead', () => {
  assert.throws(() => addItem(course(), 'bulkhead', { x: 300, y: 920 }, { x: 300, y: 920 }), /belong in facility areas/)
  assert.throws(() => addItem(facility(), 'goal', { x: 300, y: 920 }, { x: 300, y: 920 }), /Facility areas have no exit/)
  // Other objects keep a facility area as it is.
  const box = addItem(facility(), 'box', { x: 900, y: 920 }, { x: 900, y: 920 })
  assert.equal(isHubLevel(box.level), true)
  assert.equal(box.level.goal, undefined)
})

test('doors are deleted, copied and pasted with new IDs, and carried by the terrain under them', () => {
  const start = facility(), withDoor = addItem(start, 'course-door', { x: 600, y: 920 }, { x: 600, y: 920 }).level
  const selection = { kind: 'course-door', index: 0 }
  assert.deepEqual(deleteItem(withDoor, selection).courseDoors, [])
  assert.deepEqual(deleteSelections(withDoor, [selection, { kind: 'bulkhead', index: 0 }]).bulkheads, [])
  const pasted = pasteSelections(withDoor, copySelections(withDoor, [selection, { kind: 'bulkhead', index: 0 }]))
  assert.equal(pasted.level.courseDoors.length, 2)
  assert.notEqual(pasted.level.courseDoors[1].id, withDoor.courseDoors[0].id)
  assert.notEqual(pasted.level.bulkheads[1].id, withDoor.bulkheads[0].id)
  assert.throws(() => pasteSelections(course(), copySelections(withDoor, [selection])), /belong in facility areas/)
  // A door standing on a raised platform travels with it.
  const raised = { ...withDoor, platforms: [{ x: 500, y: 800, w: 300, h: 120 }], courseDoors: [{ ...withDoor.courseDoors[0], y: 800 }] }
  const moved = replacePlatform(raised, 0, { x: 500, y: 700, w: 300, h: 220 })
  assert.deepEqual([moved.courseDoors[0].x, moved.courseDoors[0].y], [600, 700])
})
