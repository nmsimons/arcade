import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial, levelProblems, parseLevel } from '../src/games/jumping/level.ts'
import { deleteItem, setBulkheadArrival, setDoorDispatch, setDoorReturn, setExitDestination, setFinish, setHubDoorDestination } from '../src/games/jumping/editor.ts'

// Where exits, level doors and bulkheads lead and arrive: the level format and the studio's edits.
const area = (more = {}) => parseLevel({ ...blankTrial(), id: 'hall', name: 'Hall', kind: 'hub', timing: 'untimed', goal: undefined, times: undefined,
  courseDoors: [{ id: 'one', x: 300, y: 920, course: 'c1' }, { id: 'two', x: 700, y: 920, course: 'c2' }],
  bulkheads: [{ id: 'out', x: 1100, y: 920, to: 'yard' }], evaluationBoards: [], ...more })
const exitLevel = goal => parseLevel({ ...blankTrial(), id: 'c1', goal: { ...blankTrial().goal, ...goal } })

test('a plain exit keeps where it leads; an ending exit cannot lead on', () => {
  assert.deepEqual(exitLevel({ leadsTo: { level: 'c2' } }).goal.leadsTo, { level: 'c2' })
  assert.deepEqual(exitLevel({ leadsTo: { level: 'hall', arrival: 'two' } }).goal.leadsTo, { level: 'hall', arrival: 'two' })
  assert.equal('leadsTo' in exitLevel({}).goal, false, 'no destination: back where the robot came from')
  for (const broken of [{ leadsTo: 'c2' }, { leadsTo: {} }, { leadsTo: { level: '' } }, { leadsTo: { level: 'c2', arrival: 3 } }])
    assert.throws(() => exitLevel(broken), /not a valid jumping level/, JSON.stringify(broken))
  assert.throws(() => parseLevel({ ...blankTrial(), timing: 'untimed', goal: { x: 1500, y: 920, kind: 'bus', leadsTo: { level: 'c2' } } }), /not a valid jumping level/)
})

test('level doors keep their return door and the dispatch mark; bulkheads keep their arrival door', () => {
  const hall = area({ courseDoors: [{ id: 'one', x: 300, y: 920, course: 'c1', returnsTo: 'out', dispatch: true }, { id: 'two', x: 700, y: 920, course: 'c2' }],
    bulkheads: [{ id: 'out', x: 1100, y: 920, to: 'yard', arrivesAt: 'gate' }] })
  assert.deepEqual([hall.courseDoors[0].returnsTo, hall.courseDoors[0].dispatch, hall.bulkheads[0].arrivesAt], ['out', true, 'gate'])
  assert.deepEqual([hall.courseDoors[1].returnsTo, hall.courseDoors[1].dispatch, area().bulkheads[0].arrivesAt], [undefined, undefined, undefined])
  assert.deepEqual(levelProblems(hall), [])
  for (const broken of [{ courseDoors: [{ id: 'one', x: 300, y: 920, course: 'c1', dispatch: false }] }, { courseDoors: [{ id: 'one', x: 300, y: 920, course: 'c1', returnsTo: '' }] },
    { bulkheads: [{ id: 'out', x: 1100, y: 920, to: 'yard', arrivesAt: 7 }] }]) assert.throws(() => area(broken), /not a valid jumping level/)
  // A return door must be in the area, and an area marks one dispatch door.
  const stray = area({ courseDoors: [{ id: 'one', x: 300, y: 920, course: 'c1', returnsTo: 'gone', dispatch: true }, { id: 'two', x: 700, y: 920, course: 'c2', dispatch: true }] })
  assert.deepEqual(levelProblems(stray).filter(problem => /comes back|dispatch/.test(problem)), [
    'Choose where the robot comes back out after “Level door 1”: the door it names is no longer in this area.',
    'This area has 2 dispatch doors. Mark one.',
  ])
})

test('the studio sets where an exit leads and arrives, and clears it', () => {
  const course = exitLevel({})
  const led = setExitDestination(course, { level: 'hall', arrival: 'two' })
  assert.deepEqual(led.goal.leadsTo, { level: 'hall', arrival: 'two' })
  assert.equal(course.goal.leadsTo, undefined, 'edits copy the level')
  assert.equal(setExitDestination(led, { level: 'hall', arrival: 'two' }), led, 'no change, no copy')
  assert.deepEqual(setExitDestination(led, { level: 'c2' }).goal.leadsTo, { level: 'c2' })
  assert.equal('leadsTo' in setExitDestination(led, undefined).goal, false)
  // An overlook or bus exit ends the game, so changing the finish drops the destination.
  assert.equal(setFinish(led, 'overlook').goal.leadsTo, undefined)
  assert.equal(setFinish(led, 'bus').goal.leadsTo, undefined)
  assert.equal(setExitDestination(setFinish(course, 'overlook'), { level: 'c2' }).goal.leadsTo, undefined, 'an ending exit cannot be given one')
})

test('the studio sets a level door’s return door and dispatch mark, and a bulkhead’s arrival door', () => {
  const hall = area(), one = { kind: 'course-door', index: 0 }, two = { kind: 'course-door', index: 1 }, out = { kind: 'bulkhead', index: 0 }
  assert.equal(setDoorReturn(hall, one, 'out').courseDoors[0].returnsTo, 'out')
  assert.equal('returnsTo' in setDoorReturn(setDoorReturn(hall, one, 'out'), one, undefined).courseDoors[0], false)
  assert.equal(setDoorReturn(hall, one, 'one'), hall, 'its own doorway is the default')
  // Marking a dispatch door clears any other in the area.
  const marked = setDoorDispatch(setDoorDispatch(hall, one, true), two, true)
  assert.deepEqual(marked.courseDoors.map(door => !!door.dispatch), [false, true])
  assert.deepEqual(setDoorDispatch(marked, two, false).courseDoors.map(door => !!door.dispatch), [false, false])
  assert.equal(setBulkheadArrival(hall, out, 'gate').bulkheads[0].arrivesAt, 'gate')
  assert.equal('arrivesAt' in setBulkheadArrival(setBulkheadArrival(hall, out, 'gate'), out, undefined).bulkheads[0], false)
  // A bulkhead that leads somewhere else no longer arrives at the old area's door.
  assert.equal(setHubDoorDestination(setBulkheadArrival(hall, out, 'gate'), out, 'docks').bulkheads[0].arrivesAt, undefined)
})

test('deleting a door or bulkhead sends doors that returned through it back through their own doorway', () => {
  const hall = setDoorReturn(setDoorReturn(area(), { kind: 'course-door', index: 0 }, 'out'), { kind: 'course-door', index: 1 }, 'one')
  assert.equal(deleteItem(hall, { kind: 'bulkhead', index: 0 }).courseDoors[0].returnsTo, undefined)
  const withoutOne = deleteItem(hall, { kind: 'course-door', index: 0 })
  assert.deepEqual(withoutOne.courseDoors.map(door => door.id), ['two'])
  assert.equal(withoutOne.courseDoors[0].returnsTo, undefined)
})
