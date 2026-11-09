import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRun, settleRun } from '../src/games/jumping/challenge.ts'
import { facilityProgress, parseCampaign } from '../src/games/jumping/campaign.ts'
import { campaignWiring, campaignWiringProblems, courseGrades, resolveCampaign, wiredDoorsOpen } from '../src/games/jumping/facility.ts'
import { areaComplete, gradeGateActive, gradePoints } from '../src/games/jumping/hub.ts'
import { blankTrial, levelProblems, parseLevel } from '../src/games/jumping/level.ts'
import { addItem, deleteItem, editGradeGate, setObjectPower, setSwitchTargets } from '../src/games/jumping/editor.ts'
import { resolveSwitchStates, switchWiringProblems } from '../src/games/jumping/switchPower.ts'

const root = new URL('../public/levels/jumping/', import.meta.url)
const builtIns = new Map(JSON.parse(readFileSync(new URL('index.json', root), 'utf8')).levels
  .map(file => parseLevel(JSON.parse(readFileSync(new URL(encodeURIComponent(file), root), 'utf8')))).map(level => [level.id, level]))
const builtInCampaign = resolveCampaign(parseCampaign(JSON.parse(readFileSync(new URL('../jumping-campaign.json', root), 'utf8'))), builtIns)

/** A facility area with three level doors and logic relays that show what each signal does. */
function area(extra = {}) {
  const door = (id, x, course, more = {}) => ({ id, x, y: 920, course, ...more })
  return parseLevel({ ...blankTrial(), kind: 'hub', timing: 'untimed', goal: undefined, times: undefined,
    courseDoors: [door('one', 300, 'c1'), door('two', 700, 'c2'), door('three', 1100, 'c3')], bulkheads: [], evaluationBoards: [],
    logicRelays: ['ra', 'rb', 'rc', 'rd'].map((id, i) => ({ id, x: 100 + i * 100, y: 100 })), ...extra })
}
const grades = values => course => values[course] ?? null
const records = (values, complete = []) => ({ grade: grades(values), complete: area => complete.includes(area) })

test('a level door is a switch, on once its level is passed at D or better', () => {
  assert.deepEqual(['A', 'B', 'C', 'D', 'F', null].map(gradePoints), [4, 3, 2, 1, 0, 0])
  const level = area({ courseDoors: [{ id: 'one', x: 300, y: 920, course: 'c1', targets: ['ra', 'rb'] }] })
  const on = grade => ['ra', 'rb'].filter(id => resolveSwitchStates(level, [], [], records({ c1: grade })).get(id))
  for (const grade of ['A', 'B', 'C', 'D']) assert.deepEqual(on(grade), ['ra', 'rb'], grade)
  assert.deepEqual(on('F'), [], 'an F does not pass')
  assert.deepEqual(on(null), [], 'nor does a level not yet finished')
  assert.deepEqual(['ra', 'rb'].filter(id => resolveSwitchStates(level, [], []).get(id)), [], 'outside the facility the door is off')
})

test('a grade average scores A 4 to D 1, and an F or no finish 0', () => {
  const level = area(), doors = level.courseDoors
  const gate = (grade, extra = {}) => ({ id: 'g', x: 400, y: 300, doors: ['one', 'two'], grade, ...extra })
  // An A and an unplayed level average 2: a C.
  const played = grades({ c1: 'A' })
  assert.equal(gradeGateActive(gate('c'), doors, played), true)
  assert.equal(gradeGateActive(gate('b'), doors, played), false)
  assert.equal(gradeGateActive(gate('b', { switchReversed: true }), doors, played), true)
  assert.equal(gradeGateActive(gate('d'), doors, grades({ c1: 'F', c2: 'D' })), false, 'an F and a D average half a D')
  assert.equal(gradeGateActive(gate('d', { doors: [] }), doors, grades({ c1: 'A' })), false, 'averaging nothing is off')
  const wired = area({ gradeGates: [gate('b', { targets: ['ra'] })] })
  assert.equal(resolveSwitchStates(wired, [], [], records({ c1: 'A', c2: 'C' })).get('ra'), true)
  assert.equal(resolveSwitchStates(wired, [], [], records({ c1: 'A', c2: 'D' })).get('ra'), false)
})

test('a switched door in a running area opens while its wiring is on, from grades or a plate', () => {
  const level = area({ courseDoors: [
    { id: 'one', x: 300, y: 920, course: 'c1', targets: ['two'] },
    { id: 'two', x: 700, y: 920, course: 'c2', power: 'switched' },
    { id: 'three', x: 1100, y: 920, course: 'c3', power: 'switched' },
  ], triggers: [{ x: 1300, y: 920, w: 80, mode: 'weight', behavior: 'toggle', targets: ['three'] }] })
  const run = createRun(level)
  run.hub.open = new Set(['one']); run.hub.switched = new Set(['two', 'three'])
  settleRun(run)
  assert.deepEqual([...run.hub.open].sort(), ['one'], 'shut before any grade or press')
  run.hub.grades = new Map([['c1', 'D']]); settleRun(run)
  assert.deepEqual([...run.hub.open].sort(), ['one', 'two'], 'passing the first door’s level opens the second')
  run.triggers[0].active = true; settleRun(run)
  assert.deepEqual([...run.hub.open].sort(), ['one', 'three', 'two'])
  run.triggers[0].active = false; settleRun(run)
  assert.deepEqual([...run.hub.open].sort(), ['one', 'two'], 'and shuts again when its plate turns off')
})

test('an area’s doors open by its wiring, with its switches as last left', () => {
  const level = area({ courseDoors: [
    { id: 'one', x: 300, y: 920, course: 'c1' },
    { id: 'two', x: 700, y: 920, course: 'c2', power: 'switched' },
  ], bulkheads: [{ id: 'out', x: 1500, y: 920, to: 'elsewhere', power: 'switched', switchReversed: true }],
  triggers: [{ x: 1300, y: 920, w: 80, mode: 'weight', behavior: 'toggle', targets: ['two', 'out'] }] })
  assert.deepEqual([...wiredDoorsOpen(level, records({}))].sort(), ['one', 'out'], 'as authored: plate off, the reversed bulkhead open')
  const pressed = { triggers: [{ held: 0, pressed: false, active: true, depression: 0 }], floats: [] }
  assert.deepEqual([...wiredDoorsOpen(level, records({}), pressed)].sort(), ['one', 'two'])
  // A passed course's door stays open with its plate off: a pass never relocks.
  assert.deepEqual([...wiredDoorsOpen(level, records({ c2: 'D' }))].sort(), ['one', 'out', 'two'])
  assert.deepEqual([...wiredDoorsOpen(level, records({ c2: 'F' }))].sort(), ['one', 'out'], 'an F is not a pass')
})

test('a bulkhead is a switch, on once every level door in the area beyond is passed', () => {
  const level = area({ bulkheads: [{ id: 'out', x: 1500, y: 920, to: 'annex', targets: ['ra'] }, { id: 'nowhere', x: 1700, y: 920, to: '', targets: ['rb'] }] })
  assert.equal(resolveSwitchStates(level, [], [], records({}, ['annex'])).get('ra'), true)
  assert.equal(resolveSwitchStates(level, [], [], records({}, [])).get('ra'), false)
  assert.equal(resolveSwitchStates(level, [], [], records({}, [''])).get('rb'), false, 'a bulkhead leading nowhere stays off')
  // Complete means every level door passed; an area with none has nothing left to pass.
  const doors = area().courseDoors
  assert.equal(areaComplete({ courseDoors: doors }, grades({ c1: 'A', c2: 'D', c3: 'B' })), true)
  assert.equal(areaComplete({ courseDoors: doors }, grades({ c1: 'A', c2: 'F', c3: 'B' })), false)
  assert.equal(areaComplete({ courseDoors: [] }, grades({})), true)
})

test('the concourse’s wiring opens a sealed wing; a wing that can never open is a campaign problem', () => {
  const door = (id, course, more = {}) => ({ id, x: 300, y: 920, course, ...more })
  const hub = (id, courseDoors, bulkheads) => parseLevel({ ...blankTrial(), id, name: id, kind: 'hub', timing: 'untimed', goal: undefined, times: undefined, courseDoors, bulkheads, evaluationBoards: [] })
  const to = (id, target, more = {}) => ({ id, x: 900, y: 920, to: target, ...more })
  const make = sealed => new Map([
    hub('wake', [], [to('wake-hall', 'hall')]),
    hub('hall', [], [to('hall-wake', 'wake'), to('hall-a', 'a-hub', { targets: ['hall-b'] }), to('hall-b', 'b-hub', sealed)]),
    hub('a-hub', [door('a1', 'a1')], [to('a-hall', 'hall')]),
    hub('b-hub', [door('b1', 'b1')], [to('b-hall', 'hall')]),
    { ...blankTrial(), id: 'a1', name: 'A1' }, { ...blankTrial(), id: 'b1', name: 'B1' },
  ].map(level => [level.id, level]))
  const file = parseCampaign({ version: 2, opening: 'wake', concourse: 'hall' })
  const levels = make({ power: 'switched' }), campaign = resolveCampaign(file, levels)
  assert.deepEqual(campaign.wings, [{ level: 'a-hub', courses: ['a1'] }, { level: 'b-hub', courses: ['b1'] }])
  const opens = passes => { const grade = id => passes.includes(id) ? 'C' : null
    return campaignWiring(campaign, levels, { grade, complete: id => !!levels.get(id) && areaComplete(levels.get(id), grade) }) }
  assert.deepEqual(campaign.wings.map(opens([]).wing), [true, false])
  assert.deepEqual(campaign.wings.map(opens(['a1']).wing), [true, true], 'wing A complete opens wing B')
  assert.deepEqual(campaignWiringProblems(campaign, levels), [])
  // Wired from itself, wing B waits on its own completion.
  const loop = make({ power: 'switched', targets: ['hall-b'] })
  loop.get('hall').bulkheads[1].targets = []
  assert.deepEqual(campaignWiringProblems(resolveCampaign(file, loop), loop), ['The wing “b-hub” can never open: its bulkhead on the concourse waits on wings or courses that are only behind it.'])
  // A switched door that nothing switches never opens.
  const stuck = make({ power: 'switched' })
  stuck.get('a-hub').courseDoors[0] = { ...stuck.get('a-hub').courseDoors[0], power: 'switched' }
  assert.deepEqual(campaignWiringProblems(resolveCampaign(file, stuck), stuck), [
    'The wing “b-hub” can never open: its bulkhead on the concourse waits on wings or courses that are only behind it.',
    'The door to “A1” in “a-hub” can never open: its wiring waits on courses that are only behind it.'])
  // The way back is checked too: a switched bulkhead back to the concourse that nothing opens traps the robot.
  const trapped = make({ power: 'switched' })
  trapped.get('a-hub').bulkheads[0] = { ...trapped.get('a-hub').bulkheads[0], power: 'switched' }
  assert.deepEqual(campaignWiringProblems(resolveCampaign(file, trapped), trapped), ['The bulkhead to “hall” in “a-hub” can never open: its wiring waits on courses that are only behind it.'])
  // So is the dispatch door: here it waits on a plate nobody can reach, wired to nothing.
  const dispatch = make({ power: 'switched' })
  dispatch.set('final', { ...blankTrial(), id: 'final', name: 'Final' })
  dispatch.get('hall').courseDoors.push({ id: 'dispatch', x: 1500, y: 920, course: 'final', power: 'switched' })
  assert.deepEqual(campaignWiringProblems(resolveCampaign(file, dispatch), dispatch), ['The dispatch door can never open: its wiring waits on courses that are only behind it.'])
  dispatch.get('hall').bulkheads[2].targets = ['dispatch']
  assert.deepEqual(campaignWiringProblems(resolveCampaign(file, dispatch), dispatch), [], 'wired from wing B, it opens once B is complete')
})

test('records give grades: a timed course by its best time, an untimed level A once completed', () => {
  const timed = [...builtIns.values()].find(level => level.times && level.timing !== 'untimed')
  const untimed = builtIns.get(builtInCampaign.escape.at(-1))
  const grade = courseGrades(builtIns, id => id === timed.id ? timed.times.a ?? timed.times.gold : null, id => id === untimed.id)
  assert.equal(grade(timed.id), 'A')
  assert.equal(grade(untimed.id), 'A')
  assert.equal(grade('missing'), null)
})

test('level files keep door power, door outputs and grade averages, and only in facility areas', () => {
  const level = area({ courseDoors: [
    { id: 'one', x: 300, y: 920, course: 'c1', targets: ['ra'] },
    { id: 'two', x: 700, y: 920, course: 'c2', power: 'switched', switchLogic: 'and' },
  ], bulkheads: [{ id: 'out', x: 1500, y: 920, to: 'x', power: 'switched' }],
  gradeGates: [{ id: 'g', x: 400, y: 300, doors: ['one', 'two'], grade: 'b', targets: ['two'], switchReversed: true }] })
  assert.deepEqual(level.courseDoors[0].targets, ['ra'])
  const copy = JSON.parse(JSON.stringify(level))
  assert.equal(parseLevel({ ...copy, courseDoors: [{ ...copy.courseDoors[0], targets: [] }, copy.courseDoors[1]] }).courseDoors[0].targets, undefined, 'an empty list is dropped')
  assert.deepEqual([level.courseDoors[1].power, level.courseDoors[1].switchLogic, level.bulkheads[0].power], ['switched', 'and', 'switched'])
  assert.deepEqual(parseLevel(JSON.parse(JSON.stringify(level))), level)
  const json = JSON.parse(JSON.stringify(level))
  for (const broken of [
    { ...json, gradeGates: [{ ...json.gradeGates[0], grade: 'e' }] },
    { ...json, courseDoors: [{ ...json.courseDoors[0], power: 'always' }] },
    { ...json, courseDoors: [{ ...json.courseDoors[0], relay: true }] },
    { ...blankTrial(), gradeGates: [] },
  ]) assert.throws(() => parseLevel(broken), undefined, JSON.stringify(broken).slice(0, 80))
  // Wiring to a door that is not switched, or averaging a door that is not here, is an authoring problem.
  assert.throws(() => parseLevel({ ...json, courseDoors: [json.courseDoors[0], { ...json.courseDoors[1], power: undefined }] }), /only to existing switched items/)
  const stray = { ...json, gradeGates: [{ ...json.gradeGates[0], doors: ['one', 'gone'], targets: [] }] }
  assert.match(switchWiringProblems(stray).join(' '), /Average only level doors in this area/)
  assert.match(levelProblems(area({ gradeGates: [{ id: 'g', x: 400, y: 300, doors: [], grade: 'd' }] })).join(' '), /Choose the level doors that/)
})

test('the studio switches door power, wires doors and averages, and cleans up after deleting a door', () => {
  let level = area()
  level = setObjectPower(level, { kind: 'course-door', index: 1 }, 'switched')
  assert.equal(level.courseDoors[1].power, 'switched')
  level = setSwitchTargets(level, { kind: 'course-door', index: 0 }, ['two', 'missing'])
  assert.deepEqual(level.courseDoors[0].targets, ['two'], 'only existing switched items connect')
  const added = addItem(level, 'grade-gate', { x: 500, y: 200 }, { x: 500, y: 200 })
  level = editGradeGate(added.level, 0, { doors: ['three', 'one'], grade: 'b' })
  assert.deepEqual([level.gradeGates[0].doors, level.gradeGates[0].grade], [['one', 'three'], 'b'], 'doors keep their order in the area')
  assert.equal(editGradeGate(level, 0, { doors: ['nowhere'] }), level)
  level = setSwitchTargets(level, { kind: 'grade-gate', index: 0 }, ['two'])
  assert.deepEqual(level.gradeGates[0].targets, ['two'])
  // Always open again: nothing switches the door any more.
  const always = setObjectPower(level, { kind: 'course-door', index: 1 }, 'always')
  assert.deepEqual([always.courseDoors[1].power, always.courseDoors[0].targets, always.gradeGates[0].targets], [undefined, undefined, []])
  // Deleting a door takes it out of every average and every wiring list.
  const removed = deleteItem(level, { kind: 'course-door', index: 0 })
  assert.deepEqual(removed.gradeGates[0].doors, ['three'])
  const gone = deleteItem(level, { kind: 'course-door', index: 1 })
  assert.deepEqual([gone.courseDoors[0].targets, gone.gradeGates[0].targets], [undefined, []])
  assert.throws(() => addItem(blankTrial(), 'grade-gate', { x: 1, y: 1 }, { x: 1, y: 1 }), /belong in facility areas/)
})
