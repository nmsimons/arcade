import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial } from '../src/games/jumping/level.ts'
import { facilityProgress, parseCampaign } from '../src/games/jumping/campaign.ts'
import { arrivalLevel, dispatchPlace, evaluationLines, facilityLevel, facilityStart, FACILITY_KEY, hubPresentation, nextPlace, readFacilitySave, saveFacilityPlace, savedPlace } from '../src/games/jumping/facility.ts'

const course = (id, name) => ({ ...blankTrial(), id, name, times: { a: 10, b: 20, c: 40, d: 75 } })
const door = (id, x, course) => ({ id, x, y: 920, course })
const bulkhead = (id, x, to) => ({ id, x, y: 920, to })
const hub = (id, courseDoors, bulkheads, evaluationBoards = []) => ({ ...blankTrial(), id, name: id, kind: 'hub', timing: 'untimed',
  goal: undefined, times: undefined, entrance: { x: 160, y: 920 }, courseDoors, bulkheads, evaluationBoards })
const campaign = parseCampaign({ version: 1, opening: 'wake', introduction: ['i1', 'i2'], concourse: 'hall', wings: [
  { id: 'movement', name: 'Movement', level: 'm-hub', courses: ['m1', 'm2'] },
  { id: 'freight', name: 'Freight', level: 'f-hub', courses: ['f1', 'f2'] },
  { id: 'water', name: 'Water', level: 'w-hub', courses: ['w1'], clearance: { wings: ['freight'] } },
], finalCourse: 'final', escape: ['climb', 'bus'] })
const levels = new Map([
  { ...course('wake', 'Wake'), timing: 'untimed' }, { ...course('i1', 'First Gap'), timers: [{ x: 100, y: 100 }] }, course('i2', 'Company'),
  course('m1', 'Hop Skip Jump I'), course('m2', 'A Bigger Swing'), course('f1', 'Boxes'), course('f2', 'Balls'), course('w1', 'Buoyancy'),
  course('final', 'Ascent I'), course('climb', 'Ascent II'), { ...course('bus', 'Exit'), timing: 'untimed' },
  hub('hall', [door('door-wake', 200, 'wake'), door('door-i1', 500, 'i1'), door('door-i2', 800, 'i2'), door('dispatch', 2400, 'final')],
    [bulkhead('hall-to-m', 1100, 'movement'), bulkhead('hall-to-f', 1400, 'freight'), bulkhead('hall-to-w', 2000, 'water')], [{ id: 'board', x: 1600, y: 500, w: 400, h: 200 }]),
  hub('m-hub', [door('door-m1', 600, 'm1'), door('door-m2', 900, 'm2')], [bulkhead('m-to-hall', 200, 'concourse')]),
  hub('f-hub', [door('door-f1', 600, 'f1'), door('door-f2', 900, 'f2')], [bulkhead('f-to-hall', 200, 'concourse')]),
  hub('w-hub', [door('door-w1', 600, 'w1')], [bulkhead('w-to-hall', 200, 'concourse')]),
].map(level => [level.id, level]))
const progress = passes => facilityProgress(campaign, id => passes.includes(id))
const storage = () => { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } }
const introduced = ['wake', 'i1', 'i2'], everything = [...introduced, 'm1', 'm2', 'f1', 'f2', 'w1']

test('a new save plays the opening, then the first unfinished introduction level', () => {
  assert.deepEqual(facilityStart(campaign, progress([]), {}, levels), { kind: 'opening', level: 'wake' })
  assert.deepEqual(facilityStart(campaign, progress(['wake']), {}, levels), { kind: 'introduction', level: 'i1', index: 0 })
  assert.deepEqual(facilityStart(campaign, progress(['wake', 'i1']), {}, levels), { kind: 'introduction', level: 'i2', index: 1 })
  assert.deepEqual(facilityStart(campaign, progress(introduced), {}, levels), { kind: 'hub', level: 'hall', arrival: { kind: 'entrance' } })
})

test('a returning save resumes where it was autosaved', () => {
  const atFreight = { kind: 'hub', level: 'f-hub', arrival: { kind: 'door', id: 'door-f2' } }
  assert.deepEqual(facilityStart(campaign, progress(introduced), { place: atFreight }, levels), atFreight)
  // A build that removed the door resumes at the hub's entrance; one that closed the hub resumes at the concourse.
  assert.deepEqual(facilityStart(campaign, progress(introduced), { place: { ...atFreight, arrival: { kind: 'door', id: 'gone' } } }, levels).arrival, { kind: 'entrance' })
  assert.deepEqual(facilityStart(campaign, progress(introduced), { place: { kind: 'hub', level: 'w-hub', arrival: { kind: 'entrance' } } }, levels).level, 'hall')
  // The escape route resumes only once the evaluation is complete, at a level it really lists.
  const escape = { kind: 'escape', level: 'bus', index: 1 }
  assert.deepEqual(facilityStart(campaign, progress(everything), { place: escape }, levels), escape)
  assert.equal(facilityStart(campaign, progress(introduced), { place: escape }, levels).kind, 'hub')
  assert.equal(facilityStart(campaign, progress(everything), { place: { ...escape, index: 0 } }, levels).kind, 'hub')
})

test('the autosave keeps the hub and door, a course resumes at its door, and unreadable saves are ignored', () => {
  const store = storage()
  assert.deepEqual(readFacilitySave(store), {})
  saveFacilityPlace(store, { kind: 'course', level: 'm2', hub: 'm-hub', door: 'door-m2' })
  assert.deepEqual(readFacilitySave(store), { place: { kind: 'hub', level: 'm-hub', arrival: { kind: 'door', id: 'door-m2' } } })
  saveFacilityPlace(store, { kind: 'opening', level: 'wake' })
  saveFacilityPlace(store, { kind: 'introduction', level: 'i1', index: 0 })
  assert.equal(readFacilitySave(store).place.level, 'm-hub', 'the opening and introduction are never saved')
  saveFacilityPlace(store, { kind: 'escape', level: 'climb', index: 0 })
  assert.deepEqual(readFacilitySave(store), { place: { kind: 'escape', level: 'climb', index: 0 } })
  assert.equal(savedPlace({ kind: 'introduction', level: 'i2', index: 1 }), undefined)
  for (const broken of ['{"place":{"kind":"hub","level":3}}', '{"place":{"kind":"escape","level":"climb","index":-1}}', '{"bay":{"level":"hall","id":"hall-bay"}}', 'not json']) {
    store.setItem(FACILITY_KEY, broken)
    assert.deepEqual(readFacilitySave(store), {}, broken)
  }
  store.setItem(FACILITY_KEY, '{"place":{"kind":"hub","level":"hall","arrival":{"kind":"bay"}}}')
  assert.deepEqual(readFacilitySave(store), { place: { kind: 'hub', level: 'hall', arrival: { kind: 'entrance' } } })
})

test('the opening leads through the introduction and out of its last door into the concourse', () => {
  const first = nextPlace(campaign, { kind: 'opening', level: 'wake' }, null, levels)
  assert.deepEqual(first, { kind: 'introduction', level: 'i1', index: 0 })
  const second = nextPlace(campaign, first, null, levels)
  assert.deepEqual(second, { kind: 'introduction', level: 'i2', index: 1 })
  assert.deepEqual(nextPlace(campaign, second, null, levels), { kind: 'hub', level: 'hall', arrival: { kind: 'door', id: 'door-i2' } })
  // With no introduction, the opening opens straight onto the concourse at its own door.
  const bare = { ...campaign, introduction: [] }
  assert.deepEqual(nextPlace(bare, { kind: 'opening', level: 'wake' }, null, levels), { kind: 'hub', level: 'hall', arrival: { kind: 'door', id: 'door-wake' } })
})

test('doors lead into their levels and back out of the same door', () => {
  const hall = { kind: 'hub', level: 'hall', arrival: { kind: 'entrance' } }
  const replay = nextPlace(campaign, hall, { kind: 'course', door: door('door-i1', 500, 'i1') }, levels)
  assert.deepEqual(replay, { kind: 'course', level: 'i1', hub: 'hall', door: 'door-i1' })
  assert.deepEqual(nextPlace(campaign, replay, null, levels), { kind: 'hub', level: 'hall', arrival: { kind: 'door', id: 'door-i1' } })
  const wing = { kind: 'hub', level: 'm-hub', arrival: { kind: 'entrance' } }
  const into = nextPlace(campaign, wing, { kind: 'course', door: door('door-m2', 900, 'm2') }, levels)
  assert.deepEqual(into, { kind: 'course', level: 'm2', hub: 'm-hub', door: 'door-m2' })
  assert.deepEqual(nextPlace(campaign, into, null, levels, false), { kind: 'hub', level: 'm-hub', arrival: { kind: 'door', id: 'door-m2' } })
  assert.equal(nextPlace(campaign, wing, null, levels), null)
  assert.equal(nextPlace(campaign, wing, { kind: 'course', door: door('door-x', 0, 'missing') }, levels), null)
})

test('bulkheads arrive at the matching bulkhead on the far side', () => {
  const hall = { kind: 'hub', level: 'hall', arrival: { kind: 'entrance' } }
  const freight = nextPlace(campaign, hall, { kind: 'bulkhead', door: bulkhead('hall-to-f', 1400, 'freight') }, levels)
  assert.deepEqual(freight, { kind: 'hub', level: 'f-hub', arrival: { kind: 'door', id: 'f-to-hall' } })
  assert.deepEqual(nextPlace(campaign, freight, { kind: 'bulkhead', door: bulkhead('f-to-hall', 200, 'concourse') }, levels),
    { kind: 'hub', level: 'hall', arrival: { kind: 'door', id: 'hall-to-f' } })
  assert.equal(nextPlace(campaign, hall, { kind: 'bulkhead', door: bulkhead('hall-to-x', 0, 'docks') }, levels), null)
})

test('arrivals step out of the door they came through', () => {
  const hall = levels.get('hall')
  assert.equal(arrivalLevel(hall, { kind: 'entrance' }), hall)
  assert.deepEqual(arrivalLevel(hall, { kind: 'door', id: 'door-i2' }).entrance, { x: 800, y: 920 })
  assert.deepEqual(arrivalLevel(hall, { kind: 'door', id: 'hall-to-f' }).entrance, { x: 1400, y: 920 })
  assert.equal(arrivalLevel(hall, { kind: 'door', id: 'gone' }), hall)
})

test('introduction levels play untimed without wall clocks; other levels are unchanged', () => {
  const played = facilityLevel(campaign, levels.get('i1'))
  assert.equal(played.timing, 'untimed')
  assert.deepEqual(played.timers, [])
  assert.equal(levels.get('i1').timing, undefined, 'the level file stays a timed course')
  assert.equal(facilityLevel(campaign, levels.get('m1')), levels.get('m1'))
  assert.equal(facilityLevel(campaign, levels.get('wake')), levels.get('wake'))
})

test('placards show replay doors, deadlines, best times and grades; closed bulkheads show clearance', () => {
  const best = id => ({ m1: 12.5 })[id] ?? null
  const hall = hubPresentation(campaign, progress([...introduced, 'm1']), levels.get('hall'), levels, best)
  assert.deepEqual([...hall.open], ['door-wake', 'door-i1', 'door-i2', 'hall-to-m', 'hall-to-f'])
  assert.deepEqual(['door-wake', 'door-i1', 'door-i2'].map(id => hall.placards.get(id)), [['WAKE'], ['FIRST GAP'], ['COMPANY']])
  assert.deepEqual(hall.placards.get('hall-to-f'), ['FREIGHT'])
  assert.deepEqual(hall.placards.get('hall-to-w'), ['WATER', 'CLEARANCE 0/2'])
  const wing = hubPresentation(campaign, progress([...introduced, 'm1']), levels.get('m-hub'), levels, best)
  assert.deepEqual(wing.placards.get('door-m1'), ['HOP SKIP JUMP I', '0:12.50 B'])
  assert.deepEqual(wing.placards.get('door-m2'), ['A BIGGER SWING', 'D 1:15'])
  const fresh = hubPresentation(campaign, progress(introduced), levels.get('m-hub'), levels, best)
  assert.deepEqual([...fresh.open], ['door-m1', 'm-to-hall'])
  assert.deepEqual(fresh.placards.get('door-m2'), [])
})

test('the dispatch door opens when the evaluation is complete and leads through the escape route', () => {
  const sealed = hubPresentation(campaign, progress(everything.slice(0, -1)), levels.get('hall'), levels, () => 20)
  assert.equal(sealed.open.has('dispatch'), false)
  assert.deepEqual(sealed.placards.get('dispatch'), ['DISPATCH', 'SEALED'])
  const released = hubPresentation(campaign, progress(everything), levels.get('hall'), levels, () => 20)
  assert.equal(released.open.has('dispatch'), true)
  assert.deepEqual(released.placards.get('dispatch'), ['DISPATCH', 'UNIT RELEASED'])
  const final = { kind: 'course', level: 'final', hub: 'hall', door: 'dispatch' }
  assert.deepEqual(nextPlace(campaign, final, null, levels, false), { kind: 'hub', level: 'hall', arrival: { kind: 'door', id: 'dispatch' } })
  const climb = nextPlace(campaign, final, null, levels, true)
  assert.deepEqual(climb, { kind: 'escape', level: 'climb', index: 0 })
  const bus = nextPlace(campaign, climb, null, levels, false)
  assert.deepEqual(bus, { kind: 'escape', level: 'bus', index: 1 })
  assert.equal(nextPlace(campaign, bus, null, levels), null)
  assert.deepEqual(dispatchPlace(campaign, levels), { kind: 'hub', level: 'hall', arrival: { kind: 'door', id: 'dispatch' } })
})

test('the evaluation board shows the total and each wing, then the release', () => {
  assert.deepEqual(evaluationLines(campaign, progress([...introduced, 'm1', 'f1'])), ['EVALUATION 2 / 5', 'MOVEMENT 1/2', 'FREIGHT 1/2', 'WATER SEALED'])
  assert.deepEqual(evaluationLines(campaign, progress(everything)), ['EVALUATION COMPLETE', 'UNIT RELEASED FOR DISPATCH', 'MOVEMENT 2/2', 'FREIGHT 2/2', 'WATER 1/1'])
  assert.deepEqual(hubPresentation(campaign, progress(introduced), levels.get('hall'), levels, () => null).placards.get('board'),
    ['EVALUATION 0 / 5', 'MOVEMENT 0/2', 'FREIGHT 0/2', 'WATER SEALED'])
})
