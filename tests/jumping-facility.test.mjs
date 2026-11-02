import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial } from '../src/games/jumping/level.ts'
import { facilityProgress, parseCampaign } from '../src/games/jumping/campaign.ts'
import { arrivalLevel, dispatchPlace, evaluationLines, facilityStart, FACILITY_KEY, hubPresentation, nextPlace, readFacilitySave, saveFacilityBay } from '../src/games/jumping/facility.ts'

const course = (id, name) => ({ ...blankTrial(), id, name, times: { a: 10, b: 20, c: 40, d: 75 } })
const door = (id, x, course) => ({ id, x, y: 920, course })
const bulkhead = (id, x, to) => ({ id, x, y: 920, to })
const hub = (id, courseDoors, bulkheads, chargingBays = [], evaluationBoards = []) => ({ ...blankTrial(), id, name: id, kind: 'hub', timing: 'untimed',
  goal: undefined, times: undefined, entrance: { x: 160, y: 920 }, courseDoors, bulkheads, chargingBays, evaluationBoards })
const campaign = parseCampaign({ version: 1, opening: 'wake', concourse: 'hall', wings: [
  { id: 'orientation', name: 'Orientation', level: 'o-hub', courses: ['o1', 'o2'] },
  { id: 'freight', name: 'Freight', level: 'f-hub', courses: ['f1', 'f2'] },
  { id: 'water', name: 'Water', level: 'w-hub', courses: ['w1'], clearance: { wings: ['freight'] } },
], finalCourse: 'final', escape: ['climb', 'bus'] })
const levels = new Map([
  { ...course('wake', 'Wake'), timing: 'untimed' }, course('o1', 'First Gap'), course('o2', 'Second Gap'), course('f1', 'Boxes'), course('f2', 'Balls'), course('w1', 'Buoyancy'), course('final', 'Ascent I'), course('climb', 'Ascent II'), { ...course('bus', 'Exit'), timing: 'untimed' },
  hub('o-hub', [door('door-o1', 400, 'o1'), door('door-o2', 700, 'o2')], [bulkhead('o-to-hall', 1500, 'concourse')], [{ id: 'o-bay', x: 250, y: 920 }]),
  hub('hall', [door('dispatch', 1500, 'final')], [bulkhead('hall-to-o', 300, 'orientation'), bulkhead('hall-to-f', 900, 'freight'), bulkhead('hall-to-w', 1200, 'water')],
    [{ id: 'hall-bay', x: 600, y: 920 }], [{ id: 'board', x: 700, y: 500, w: 400, h: 200 }]),
  hub('f-hub', [door('door-f1', 600, 'f1'), door('door-f2', 900, 'f2')], [bulkhead('f-to-hall', 200, 'concourse')]),
  hub('w-hub', [door('door-w1', 600, 'w1')], [bulkhead('w-to-hall', 200, 'concourse')]),
].map(level => [level.id, level]))
const progress = passes => facilityProgress(campaign, id => passes.includes(id))
const storage = () => { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } }

test('a new save starts in the opening, then the first wing or the last bay', () => {
  assert.deepEqual(facilityStart(campaign, progress([]), {}, levels), { kind: 'opening', level: 'wake' })
  assert.deepEqual(facilityStart(campaign, progress(['wake']), {}, levels), { kind: 'hub', level: 'o-hub', arrival: { kind: 'entrance' } })
  const all = ['wake', 'o1', 'o2']
  assert.deepEqual(facilityStart(campaign, progress(all), { bay: { level: 'hall', id: 'hall-bay' } }, levels), { kind: 'hub', level: 'hall', arrival: { kind: 'bay', id: 'hall-bay' } })
  // A bay that no longer exists, or sits behind a closed hub, falls back to the first wing.
  assert.equal(facilityStart(campaign, progress(all), { bay: { level: 'hall', id: 'gone' } }, levels).arrival.kind, 'entrance')
  assert.equal(facilityStart(campaign, progress(['wake']), { bay: { level: 'hall', id: 'hall-bay' } }, levels).level, 'o-hub')
})

test('the bay is saved alone and unreadable saves are ignored', () => {
  const store = storage()
  assert.deepEqual(readFacilitySave(store), {})
  saveFacilityBay(store, 'hall', 'hall-bay')
  assert.deepEqual(readFacilitySave(store), { bay: { level: 'hall', id: 'hall-bay' } })
  store.setItem(FACILITY_KEY, '{"bay":{"level":3}}')
  assert.deepEqual(readFacilitySave(store), {})
  store.setItem(FACILITY_KEY, 'not json')
  assert.deepEqual(readFacilitySave(store), {})
})

test('runs lead from the opening into the first wing, through doors and back out of them', () => {
  const wing = nextPlace(campaign, { kind: 'opening', level: 'wake' }, null, levels)
  assert.deepEqual(wing, { kind: 'hub', level: 'o-hub', arrival: { kind: 'entrance' } })
  const into = nextPlace(campaign, wing, { kind: 'course', door: door('door-o2', 700, 'o2') }, levels)
  assert.deepEqual(into, { kind: 'course', level: 'o2', hub: 'o-hub', door: 'door-o2' })
  assert.deepEqual(nextPlace(campaign, into, null, levels), { kind: 'hub', level: 'o-hub', arrival: { kind: 'door', id: 'door-o2' } })
  assert.equal(nextPlace(campaign, wing, null, levels), null)
  assert.equal(nextPlace(campaign, wing, { kind: 'course', door: door('door-x', 0, 'missing') }, levels), null)
})

test('bulkheads arrive at the matching bulkhead on the far side', () => {
  const hall = nextPlace(campaign, { kind: 'hub', level: 'o-hub', arrival: { kind: 'entrance' } }, { kind: 'bulkhead', door: bulkhead('o-to-hall', 1500, 'concourse') }, levels)
  assert.deepEqual(hall, { kind: 'hub', level: 'hall', arrival: { kind: 'door', id: 'hall-to-o' } })
  const freight = nextPlace(campaign, hall, { kind: 'bulkhead', door: bulkhead('hall-to-f', 900, 'freight') }, levels)
  assert.deepEqual(freight, { kind: 'hub', level: 'f-hub', arrival: { kind: 'door', id: 'f-to-hall' } })
  assert.deepEqual(nextPlace(campaign, freight, { kind: 'bulkhead', door: bulkhead('f-to-hall', 200, 'concourse') }, levels),
    { kind: 'hub', level: 'hall', arrival: { kind: 'door', id: 'hall-to-f' } })
  assert.equal(nextPlace(campaign, hall, { kind: 'bulkhead', door: bulkhead('hall-to-x', 0, 'docks') }, levels), null)
})

test('arrivals step out of the door or wake in the bay', () => {
  const wing = levels.get('o-hub')
  assert.equal(arrivalLevel(wing, { kind: 'entrance' }), wing)
  assert.deepEqual(arrivalLevel(wing, { kind: 'door', id: 'door-o2' }).entrance, { x: 700, y: 920 })
  const waking = arrivalLevel(wing, { kind: 'bay', id: 'o-bay' })
  assert.deepEqual(waking.entrance, { x: 250, y: 920, kind: 'charging-bay' })
  assert.deepEqual(waking.chargingBays, [])
  assert.equal(arrivalLevel(wing, { kind: 'door', id: 'gone' }), wing)
})

test('placards show the deadline, then the best time and grade; closed bulkheads show clearance', () => {
  const best = id => ({ o1: 12.5 })[id] ?? null
  const early = hubPresentation(campaign, progress(['wake', 'o1']), levels.get('o-hub'), levels, best)
  assert.deepEqual([...early.open], ['door-o1', 'door-o2'])
  assert.deepEqual(early.placards.get('door-o1'), ['FIRST GAP', '0:12.50 B'])
  assert.deepEqual(early.placards.get('door-o2'), ['SECOND GAP', 'D 1:15'])
  assert.deepEqual(early.placards.get('o-to-hall'), ['CONCOURSE', 'CLEARANCE 1/2'])
  const fresh = hubPresentation(campaign, progress(['wake']), levels.get('o-hub'), levels, best)
  assert.deepEqual([...fresh.open], ['door-o1'])
  assert.deepEqual(fresh.placards.get('door-o2'), [])
  const hall = hubPresentation(campaign, progress(['wake', 'o1', 'o2']), levels.get('hall'), levels, best)
  assert.deepEqual([...hall.open], ['hall-to-o', 'hall-to-f'])
  assert.deepEqual(hall.placards.get('hall-to-f'), ['FREIGHT'])
  assert.deepEqual(hall.placards.get('hall-to-w'), ['WATER', 'CLEARANCE 0/2'])
})

test('the dispatch door opens when the evaluation is complete and leads through the escape route', () => {
  const all = ['wake', 'o1', 'o2', 'f1', 'f2', 'w1']
  const sealed = hubPresentation(campaign, progress(all.slice(0, -1)), levels.get('hall'), levels, () => 20)
  assert.equal(sealed.open.has('dispatch'), false)
  assert.deepEqual(sealed.placards.get('dispatch'), ['DISPATCH', 'SEALED'])
  const released = hubPresentation(campaign, progress(all), levels.get('hall'), levels, () => 20)
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
  assert.deepEqual(evaluationLines(campaign, progress(['wake', 'o1', 'o2', 'f1'])), ['EVALUATION 3 / 5', 'ORIENTATION 2/2', 'FREIGHT 1/2', 'WATER SEALED'])
  assert.deepEqual(evaluationLines(campaign, progress(['wake', 'o1', 'o2', 'f1', 'f2', 'w1'])),
    ['EVALUATION COMPLETE', 'UNIT RELEASED FOR DISPATCH', 'ORIENTATION 2/2', 'FREIGHT 2/2', 'WATER 1/1'])
  assert.deepEqual(hubPresentation(campaign, progress(['wake']), levels.get('hall'), levels, () => null).placards.get('board'), ['EVALUATION 0 / 5', 'ORIENTATION 0/2', 'FREIGHT SEALED', 'WATER SEALED'])
})
