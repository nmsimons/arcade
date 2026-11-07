import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial } from '../src/games/jumping/level.ts'
import { facilityProgress, parseCampaign } from '../src/games/jumping/campaign.ts'
import { arrivalLevel, dispatchPlace, evaluationLines, facilityStart, FACILITY_KEY, hubPresentation, linkOpen, linkedPlace, nextPlace, readFacilitySave, saveFacilityPlace, savedPlace } from '../src/games/jumping/facility.ts'

const course = (id, name) => ({ ...blankTrial(), id, name, times: { a: 10, b: 20, c: 40, d: 75 } })
const door = (id, x, course) => ({ id, x, y: 920, course })
const bulkhead = (id, x, to) => ({ id, x, y: 920, to })
const hub = (id, courseDoors, bulkheads, evaluationBoards = [], name = id) => ({ ...blankTrial(), id, name, kind: 'hub', timing: 'untimed',
  goal: undefined, times: undefined, entrance: { x: 160, y: 920 }, courseDoors, bulkheads, evaluationBoards })
const campaign = parseCampaign({ version: 1, opening: 'wake', concourse: 'hall', wings: [
  { id: 'movement', name: 'Movement', level: 'm-hub', courses: ['m1', 'm2'] },
  { id: 'freight', name: 'Freight', level: 'f-hub', courses: ['f1', 'f2'] },
  { id: 'water', name: 'Water', level: 'w-hub', courses: ['w1'], clearance: { wings: ['freight'] } },
], finalCourse: 'final', escape: ['climb', 'bus'] })
const levels = new Map([
  // The opening is a facility area: it wakes in its pod and leaves through a bulkhead onto the concourse.
  // Bulkheads name the facility area they open onto by its level ID.
  hub('wake', [], [bulkhead('wake-to-hall', 1600, 'hall')], [], 'Orientation'),
  course('m1', 'Hop Skip Jump I'), course('m2', 'A Bigger Swing'), course('f1', 'Boxes'), course('f2', 'Balls'), course('w1', 'Buoyancy'),
  course('final', 'Ascent I'), course('climb', 'Ascent II'), { ...course('bus', 'Exit'), timing: 'untimed' },
  hub('hall', [door('dispatch', 2400, 'final')],
    [bulkhead('hall-to-wake', 200, 'wake'), bulkhead('hall-to-m', 1100, 'm-hub'), bulkhead('hall-to-f', 1400, 'f-hub'), bulkhead('hall-to-w', 2000, 'w-hub')],
    [{ id: 'board', x: 1600, y: 500, w: 400, h: 200 }], 'Concourse'),
  hub('m-hub', [door('door-m1', 600, 'm1'), door('door-m2', 900, 'm2')], [bulkhead('m-to-hall', 200, 'hall')], [], 'Movement wing'),
  hub('f-hub', [door('door-f1', 600, 'f1'), door('door-f2', 900, 'f2')], [bulkhead('f-to-hall', 200, 'hall')], [], 'Freight wing'),
  hub('w-hub', [door('door-w1', 600, 'w1')], [bulkhead('w-to-hall', 200, 'hall')], [], 'Water wing'),
].map(level => [level.id, level]))
const progress = passes => facilityProgress(campaign, id => passes.includes(id))
const storage = () => { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } }
const everything = ['m1', 'm2', 'f1', 'f2', 'w1']

test('a new save wakes at the opening’s entrance', () => {
  assert.deepEqual(facilityStart(campaign, progress([]), {}, levels), { kind: 'hub', level: 'wake', arrival: { kind: 'entrance' } })
})

test('a player with courses passed before the facility opened starts at the concourse', () => {
  assert.deepEqual(facilityStart(campaign, progress(['m1']), {}, levels), { kind: 'hub', level: 'hall', arrival: { kind: 'entrance' } })
  // A saved place still wins.
  const atFreight = { kind: 'hub', level: 'f-hub', arrival: { kind: 'door', id: 'door-f1' } }
  assert.deepEqual(facilityStart(campaign, progress(['m1']), { place: atFreight }, levels), atFreight)
})

test('a direct link opens a course only once its door would be open', () => {
  const open = (passes, id) => linkOpen(campaign, progress(passes), levels, id)
  assert.equal(open([], 'm1'), true, 'the first door of an open wing')
  assert.equal(open([], 'm2'), false, 'the next door waits for the one before it')
  assert.equal(open(['m1'], 'm2'), true)
  assert.equal(open([], 'w1'), false, 'a sealed wing keeps its courses closed')
  assert.equal(open(['f1', 'f2'], 'w1'), true, 'clearance opens the wing')
  assert.equal(open(everything.slice(0, -1), 'final'), false, 'the final course waits for the evaluation')
  assert.equal(open(everything, 'final'), true)
  assert.equal(open([], 'bus'), false); assert.equal(open(everything, 'bus'), true)
  assert.equal(open([], 'hall'), false, 'facility areas are walked into, never linked')
  assert.equal(open([], 'missing'), false)
  const outside = new Map([...levels, ['practice', course('practice', 'Practice')]])
  assert.equal(linkOpen(campaign, progress([]), outside, 'practice'), true, 'a course outside the campaign is always open')
})

test('a linked course belongs to the door that leads to it', () => {
  assert.deepEqual(linkedPlace(campaign, levels, 'm2'), { kind: 'course', level: 'm2', hub: 'm-hub', door: 'door-m2' })
  assert.deepEqual(linkedPlace(campaign, levels, 'final'), { kind: 'course', level: 'final', hub: 'hall', door: 'dispatch' })
  assert.deepEqual(linkedPlace(campaign, levels, 'bus'), { kind: 'escape', level: 'bus', index: 1 })
  assert.equal(linkedPlace(campaign, new Map([...levels, ['practice', course('practice', 'Practice')]]), 'practice'), null)
})

test('a returning save resumes where it was autosaved', () => {
  const atFreight = { kind: 'hub', level: 'f-hub', arrival: { kind: 'door', id: 'door-f2' } }
  assert.deepEqual(facilityStart(campaign, progress([]), { place: atFreight }, levels), atFreight)
  // The opening is always open, so a save there resumes there.
  const inOpening = { kind: 'hub', level: 'wake', arrival: { kind: 'door', id: 'wake-to-hall' } }
  assert.deepEqual(facilityStart(campaign, progress([]), { place: inOpening }, levels), inOpening)
  // A build that removed the door resumes at the hub's entrance; one that closed the hub resumes at the concourse.
  assert.deepEqual(facilityStart(campaign, progress([]), { place: { ...atFreight, arrival: { kind: 'door', id: 'gone' } } }, levels).arrival, { kind: 'entrance' })
  assert.deepEqual(facilityStart(campaign, progress([]), { place: { kind: 'hub', level: 'w-hub', arrival: { kind: 'entrance' } } }, levels).level, 'hall')
  assert.deepEqual(facilityStart(campaign, progress([]), { place: { kind: 'hub', level: 'removed', arrival: { kind: 'entrance' } } }, levels).level, 'hall')
  // The escape route resumes only once the evaluation is complete, at a level it really lists.
  const escape = { kind: 'escape', level: 'bus', index: 1 }
  assert.deepEqual(facilityStart(campaign, progress(everything), { place: escape }, levels), escape)
  assert.equal(facilityStart(campaign, progress([]), { place: escape }, levels).kind, 'hub')
  assert.equal(facilityStart(campaign, progress(everything), { place: { ...escape, index: 0 } }, levels).kind, 'hub')
})

test('the autosave keeps the hub and door, a course resumes at its door, and unreadable saves are ignored', () => {
  const store = storage()
  assert.deepEqual(readFacilitySave(store), {})
  saveFacilityPlace(store, { kind: 'course', level: 'm2', hub: 'm-hub', door: 'door-m2' })
  assert.deepEqual(readFacilitySave(store), { place: { kind: 'hub', level: 'm-hub', arrival: { kind: 'door', id: 'door-m2' } } })
  saveFacilityPlace(store, { kind: 'hub', level: 'wake', arrival: { kind: 'entrance' } })
  assert.deepEqual(readFacilitySave(store), { place: { kind: 'hub', level: 'wake', arrival: { kind: 'entrance' } } }, 'the opening saves like any facility area')
  saveFacilityPlace(store, { kind: 'escape', level: 'climb', index: 0 })
  assert.deepEqual(readFacilitySave(store), { place: { kind: 'escape', level: 'climb', index: 0 } })
  assert.deepEqual(savedPlace({ kind: 'course', level: 'f1', hub: 'f-hub', door: 'door-f1' }), { kind: 'hub', level: 'f-hub', arrival: { kind: 'door', id: 'door-f1' } })
  for (const broken of ['{"place":{"kind":"hub","level":3}}', '{"place":{"kind":"escape","level":"climb","index":-1}}', '{"place":{"kind":"opening","level":"wake"}}', 'not json']) {
    store.setItem(FACILITY_KEY, broken)
    assert.deepEqual(readFacilitySave(store), {}, broken)
  }
  store.setItem(FACILITY_KEY, '{"place":{"kind":"hub","level":"hall","arrival":{"kind":"bay"}}}')
  assert.deepEqual(readFacilitySave(store), { place: { kind: 'hub', level: 'hall', arrival: { kind: 'entrance' } } })
})

test('the opening and the concourse join through their bulkheads', () => {
  const opening = { kind: 'hub', level: 'wake', arrival: { kind: 'entrance' } }
  const hall = nextPlace(campaign, opening, { kind: 'bulkhead', door: bulkhead('wake-to-hall', 1600, 'hall') }, levels)
  assert.deepEqual(hall, { kind: 'hub', level: 'hall', arrival: { kind: 'door', id: 'hall-to-wake' } })
  // Going back steps out of the opening's own bulkhead, at its far end.
  assert.deepEqual(nextPlace(campaign, hall, { kind: 'bulkhead', door: bulkhead('hall-to-wake', 200, 'wake') }, levels),
    { kind: 'hub', level: 'wake', arrival: { kind: 'door', id: 'wake-to-hall' } })
})

test('doors lead into their levels and back out of the same door', () => {
  const wing = { kind: 'hub', level: 'm-hub', arrival: { kind: 'entrance' } }
  const into = nextPlace(campaign, wing, { kind: 'course', door: door('door-m2', 900, 'm2') }, levels)
  assert.deepEqual(into, { kind: 'course', level: 'm2', hub: 'm-hub', door: 'door-m2' })
  assert.deepEqual(nextPlace(campaign, into, null, levels, false), { kind: 'hub', level: 'm-hub', arrival: { kind: 'door', id: 'door-m2' } })
  assert.equal(nextPlace(campaign, wing, null, levels), null)
  assert.equal(nextPlace(campaign, wing, { kind: 'course', door: door('door-x', 0, 'missing') }, levels), null)
})

test('bulkheads arrive at the matching bulkhead on the far side', () => {
  const hall = { kind: 'hub', level: 'hall', arrival: { kind: 'entrance' } }
  const freight = nextPlace(campaign, hall, { kind: 'bulkhead', door: bulkhead('hall-to-f', 1400, 'f-hub') }, levels)
  assert.deepEqual(freight, { kind: 'hub', level: 'f-hub', arrival: { kind: 'door', id: 'f-to-hall' } })
  assert.deepEqual(nextPlace(campaign, freight, { kind: 'bulkhead', door: bulkhead('f-to-hall', 200, 'hall') }, levels),
    { kind: 'hub', level: 'hall', arrival: { kind: 'door', id: 'hall-to-f' } })
  // Only a facility area in the collection is somewhere to go.
  assert.equal(nextPlace(campaign, hall, { kind: 'bulkhead', door: bulkhead('hall-to-x', 0, 'docks') }, levels), null)
  assert.equal(nextPlace(campaign, hall, { kind: 'bulkhead', door: bulkhead('hall-to-x', 0, 'm1') }, levels), null)
})

test('arrivals step out of the door they came through', () => {
  const hall = levels.get('hall')
  assert.equal(arrivalLevel(hall, { kind: 'entrance' }), hall)
  assert.deepEqual(arrivalLevel(hall, { kind: 'door', id: 'dispatch' }).entrance, { x: 2400, y: 920 })
  assert.deepEqual(arrivalLevel(hall, { kind: 'door', id: 'hall-to-f' }).entrance, { x: 1400, y: 920 })
  assert.equal(arrivalLevel(hall, { kind: 'door', id: 'gone' }), hall)
})

test('placards show deadlines, best times and grades; bulkheads are lettered with their area', () => {
  const best = id => ({ m1: 12.5 })[id] ?? null
  const hall = hubPresentation(campaign, progress(['m1']), levels.get('hall'), levels, best)
  assert.deepEqual([...hall.open], ['hall-to-wake', 'hall-to-m', 'hall-to-f'])
  assert.deepEqual(hall.placards.get('hall-to-wake'), ['ORIENTATION'])
  assert.deepEqual(hall.placards.get('hall-to-f'), ['FREIGHT WING'])
  // A sealed wing's bulkhead stays shut; the board shows the clearance it needs.
  assert.deepEqual(hall.placards.get('hall-to-w'), ['WATER WING'])
  assert.equal(hall.placards.get('board').at(-1), 'WATER WING CLEARANCE 0/2')
  const opening = hubPresentation(campaign, progress([]), levels.get('wake'), levels, best)
  assert.deepEqual([...opening.open], ['wake-to-hall'])
  assert.deepEqual(opening.placards.get('wake-to-hall'), ['CONCOURSE'])
  const wing = hubPresentation(campaign, progress(['m1']), levels.get('m-hub'), levels, best)
  assert.deepEqual(wing.placards.get('door-m1'), ['HOP SKIP JUMP I', '0:12.50 B'])
  assert.deepEqual(wing.placards.get('door-m2'), ['A BIGGER SWING', 'D 1:15'])
  const fresh = hubPresentation(campaign, progress([]), levels.get('m-hub'), levels, best)
  assert.deepEqual([...fresh.open], ['door-m1', 'm-to-hall'])
  assert.deepEqual(fresh.placards.get('door-m2'), [])
  // A door saved before its destination was chosen stays shut and blank.
  const unfinished = hubPresentation(campaign, progress([]), hub('draft', [door('door-new', 600, '')], [bulkhead('to-new', 900, '')]), levels, best)
  assert.deepEqual([...unfinished.open], [])
  assert.deepEqual([...unfinished.placards.values()], [[], []])
})

test('facility areas and courses outside the campaign are always open', () => {
  // A new area, not yet in the campaign, joined to the concourse both ways.
  const annex = hub('annex', [door('door-extra', 600, 'extra'), door('door-f1', 900, 'f1'), door('door-gone', 1200, 'gone')], [bulkhead('annex-to-hall', 200, 'hall')], [], 'Annex')
  const hallLevel = levels.get('hall'), world = new Map([...levels, ['extra', course('extra', 'Extra')], ['annex', annex],
    ['hall', { ...hallLevel, bulkheads: [...hallLevel.bulkheads, bulkhead('hall-to-annex', 2200, 'annex')] }]])
  const hall = hubPresentation(campaign, progress([]), world.get('hall'), world, () => null)
  assert.equal(hall.open.has('hall-to-annex'), true)
  assert.deepEqual(hall.placards.get('hall-to-annex'), ['ANNEX'])
  const into = nextPlace(campaign, { kind: 'hub', level: 'hall', arrival: { kind: 'entrance' } }, { kind: 'bulkhead', door: bulkhead('hall-to-annex', 2200, 'annex') }, world)
  assert.deepEqual(into, { kind: 'hub', level: 'annex', arrival: { kind: 'door', id: 'annex-to-hall' } })
  assert.deepEqual(facilityStart(campaign, progress([]), { place: into }, world), into, 'a save in the area resumes there')
  // Its door to a course in no wing opens at once; a wing's course keeps its wing's order.
  const inside = hubPresentation(campaign, progress([]), annex, world, id => ({ extra: 30 })[id] ?? null)
  assert.deepEqual([...inside.open], ['door-extra', 'door-f1', 'annex-to-hall'])
  assert.deepEqual(inside.placards.get('door-extra'), ['EXTRA', '0:30.00 C'])
  assert.deepEqual(hubPresentation(campaign, progress([]), annex, world, () => null).placards.get('door-extra'), ['EXTRA', 'D 1:15'])
  assert.deepEqual(inside.placards.get('door-gone'), [])
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
  assert.deepEqual(evaluationLines(campaign, progress(['m1', 'f1']), levels), ['EVALUATION 2 / 5', 'MOVEMENT WING 1/2', 'FREIGHT WING 1/2', 'WATER WING CLEARANCE 1/2'])
  assert.deepEqual(evaluationLines(campaign, progress(everything), levels), ['EVALUATION COMPLETE', 'UNIT RELEASED FOR DISPATCH', 'MOVEMENT WING 2/2', 'FREIGHT WING 2/2', 'WATER WING 1/1'])
  assert.deepEqual(hubPresentation(campaign, progress([]), levels.get('hall'), levels, () => null).placards.get('board'),
    ['EVALUATION 0 / 5', 'MOVEMENT WING 0/2', 'FREIGHT WING 0/2', 'WATER WING CLEARANCE 0/2'])
})

test('a wing goes by its level’s name, which wins over the campaign’s', () => {
  const renamed = new Map([...levels, ['m-hub', { ...levels.get('m-hub'), name: 'Boot Camp' }]])
  assert.deepEqual(evaluationLines(campaign, progress([]), renamed).slice(1), ['BOOT CAMP 0/2', 'FREIGHT WING 0/2', 'WATER WING CLEARANCE 0/2'])
  // Until the level exists, the campaign's name stands in.
  const missing = new Map([...levels].filter(([id]) => id !== 'm-hub'))
  assert.equal(evaluationLines(campaign, progress([]), missing)[1], 'MOVEMENT 0/2')
  const placard = hubPresentation(campaign, progress([]), levels.get('hall'), renamed, () => null).placards.get('hall-to-m')
  assert.deepEqual(placard, ['BOOT CAMP'])
})
