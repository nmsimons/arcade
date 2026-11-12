import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial } from '../src/games/jumping/level.ts'
import { facilityProgress, parseCampaign } from '../src/games/jumping/campaign.ts'
import { areaComplete } from '../src/games/jumping/hub.ts'
import { objectLabel } from '../src/games/jumping/objectLabels.ts'
import { arrivalLevel, campaignWiring, resolveCampaign, facilityDoorName, studioPresentation, evaluationLines, facilityStart, FACILITY_KEY, GAME_KEYS, hubPresentation, linkOpen, linkedPlace, nextPlace, progressRecords, readFacilitySave, savedGameExists, saveFacilityPlace, savedPlace } from '../src/games/jumping/facility.ts'

const course = (id, name, leadsTo) => ({ ...blankTrial(), id, name, times: { a: 10, b: 20, c: 40, d: 75 }, ...(leadsTo ? { goal: { ...blankTrial().goal, leadsTo } } : {}) })
const door = (id, x, course, wiring = {}) => ({ id, x, y: 920, course, ...wiring })
// Wings wire their doors in order, as the built-in wings do: each opens once the level behind the door before it is passed.
const next = id => ({ targets: [id] }), switched = { power: 'switched' }
const bulkhead = (id, x, to) => ({ id, x, y: 920, to })
const hub = (id, courseDoors, bulkheads, evaluationBoards = [], name = id) => ({ ...blankTrial(), id, name, kind: 'hub', timing: 'untimed',
  goal: undefined, times: undefined, entrance: { x: 160, y: 920 }, courseDoors, bulkheads, evaluationBoards })
const levels = new Map([
  // The opening is a facility area: it wakes in its pod and leaves through a bulkhead onto the concourse.
  // Bulkheads name the facility area they open onto by its level ID.
  hub('wake', [], [bulkhead('wake-to-hall', 1600, 'hall')], [], 'Orientation'),
  course('m1', 'Hop Skip Jump I'), course('m2', 'A Bigger Swing'), course('f1', 'Boxes'), course('f2', 'Balls'), course('w1', 'Buoyancy'),
  // The final course's exit leads on to the next, whose exit leads to the last: a bus exit that ends the game.
  course('final', 'Ascent I', { level: 'climb' }), course('climb', 'Ascent II', { level: 'bus' }), { ...course('bus', 'Exit'), timing: 'untimed', goal: { ...blankTrial().goal, kind: 'bus' } },
  // The dispatch door opens once every wing is complete.
  hub('hall', [door('dispatch', 2400, 'final', { power: 'switched', switchLogic: 'and', dispatch: true })],
    // The water wing's bulkhead opens once the freight wing is complete.
    [bulkhead('hall-to-wake', 200, 'wake'), { ...bulkhead('hall-to-m', 1100, 'm-hub'), targets: ['dispatch'] }, { ...bulkhead('hall-to-f', 1400, 'f-hub'), targets: ['hall-to-w', 'dispatch'] },
      { ...bulkhead('hall-to-w', 2000, 'w-hub'), power: 'switched', targets: ['dispatch'] }],
    [{ id: 'board', x: 1600, y: 500, w: 400, h: 200 }], 'Concourse'),
  hub('m-hub', [door('door-m1', 600, 'm1', next('door-m2')), door('door-m2', 900, 'm2', switched)], [bulkhead('m-to-hall', 200, 'hall')], [], 'Movement wing'),
  hub('f-hub', [door('door-f1', 600, 'f1', next('door-f2')), door('door-f2', 900, 'f2', switched)], [bulkhead('f-to-hall', 200, 'hall')], [], 'Freight wing'),
  hub('w-hub', [door('door-w1', 600, 'w1')], [bulkhead('w-to-hall', 200, 'hall')], [], 'Water wing'),
].map(level => [level.id, level]))
// The campaign file names only the start; the levels lay out the wings, the dispatch door and where exits lead.
const campaign = resolveCampaign(parseCampaign({ version: 3, start: 'wake' }), levels)
const at = (level, id) => ({ kind: 'hub', level, arrival: id ? { kind: 'door', id } : { kind: 'entrance' } })
const records = passes => { const grade = id => passes.includes(id) ? 'D' : null; return { grade, complete: area => !!levels.get(area) && areaComplete(levels.get(area), grade) } }
const progress = passes => facilityProgress(campaign, id => passes.includes(id), campaignWiring(campaign, levels, records(passes)))
const storage = () => { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } }
const everything = ['m1', 'm2', 'f1', 'f2', 'w1']

test('a new save starts at the start area’s entrance', () => {
  assert.deepEqual(facilityStart(campaign, progress([]), {}, levels), { kind: 'hub', level: 'wake', arrival: { kind: 'entrance' } })
})

test('a player with records but no saved place starts at the start; a saved place still wins', () => {
  assert.deepEqual(facilityStart(campaign, progress(['m1']), {}, levels), at('wake'))
  const atFreight = at('f-hub', 'door-f1')
  assert.deepEqual(facilityStart(campaign, progress(['m1']), { place: atFreight }, levels), atFreight)
})

test('a direct link opens a course only once its door would be open', () => {
  const open = (passes, id) => linkOpen(campaign, progress(passes), levels, id)
  assert.equal(open([], 'm1'), true, 'the first door of an open wing')
  assert.equal(open([], 'm2'), false, 'the next door waits for the one before it')
  assert.equal(open(['m1'], 'm2'), true)
  assert.equal(open([], 'w1'), false, 'a sealed wing keeps its courses closed')
  assert.equal(open(['f1', 'f2'], 'w1'), true, 'the complete freight wing opens the water wing')
  assert.equal(open(everything.slice(0, -1), 'final'), false, 'the final course waits for the evaluation')
  assert.equal(open(everything, 'final'), true)
  assert.equal(open([], 'bus'), false, 'a course an exit leads into opens with the course its route began at')
  assert.equal(open(everything, 'bus'), true); assert.equal(open(everything, 'climb'), true)
  assert.equal(open([], 'hall'), false, 'facility areas are walked into, never linked')
  assert.equal(open([], 'missing'), false)
  const outside = new Map([...levels, ['practice', course('practice', 'Practice')]])
  assert.equal(linkOpen(campaign, progress([]), outside, 'practice'), true, 'a course outside the campaign is always open')
})

test('a linked course belongs to the door that leads to it, or to the door its route began at', () => {
  assert.deepEqual(linkedPlace(campaign, levels, 'm2'), { kind: 'course', level: 'm2', back: at('m-hub', 'door-m2'), via: 'door' })
  assert.deepEqual(linkedPlace(campaign, levels, 'final'), { kind: 'course', level: 'final', back: at('hall', 'dispatch'), via: 'door' })
  assert.deepEqual(linkedPlace(campaign, levels, 'bus'), { kind: 'course', level: 'bus', back: at('hall', 'dispatch'), via: 'exit' })
  assert.equal(linkedPlace(campaign, new Map([...levels, ['practice', course('practice', 'Practice')]]), 'practice'), null)
})

test('a returning save resumes where it was autosaved', () => {
  const atFreight = { kind: 'hub', level: 'f-hub', arrival: { kind: 'door', id: 'door-f2' } }
  assert.deepEqual(facilityStart(campaign, progress([]), { place: atFreight }, levels), atFreight)
  // The opening is always open, so a save there resumes there.
  const inOpening = { kind: 'hub', level: 'wake', arrival: { kind: 'door', id: 'wake-to-hall' } }
  assert.deepEqual(facilityStart(campaign, progress([]), { place: inOpening }, levels), inOpening)
  // A build that removed the door resumes at the hub's entrance; one that closed or removed the hub resumes at the start.
  assert.deepEqual(facilityStart(campaign, progress([]), { place: { ...atFreight, arrival: { kind: 'door', id: 'gone' } } }, levels).arrival, { kind: 'entrance' })
  assert.deepEqual(facilityStart(campaign, progress([]), { place: at('w-hub') }, levels), at('wake'))
  assert.deepEqual(facilityStart(campaign, progress([]), { place: at('removed') }, levels), at('wake'))
  // A course an exit led into resumes there while its route is open; a save from before exits led on names it as an escape level.
  const bus = { kind: 'course', level: 'bus', back: at('hall', 'dispatch'), via: 'exit' }
  assert.deepEqual(facilityStart(campaign, progress(everything), { place: bus }, levels), bus)
  assert.deepEqual(facilityStart(campaign, progress(everything), { place: { kind: 'escape', level: 'bus' } }, levels), bus)
  assert.deepEqual(facilityStart(campaign, progress([]), { place: bus }, levels), at('wake'), 'not before the unit is released')
  assert.deepEqual(facilityStart(campaign, progress(everything), { place: { ...bus, level: 'm1' } }, levels), at('wake'), 'only a course an exit leads into')
})

test('the autosave keeps the hub and door, a course resumes at its door, and unreadable saves are ignored', () => {
  const store = storage()
  assert.deepEqual(readFacilitySave(store), {})
  saveFacilityPlace(store, { kind: 'course', level: 'm2', back: at('m-hub', 'door-m2'), via: 'door' })
  assert.deepEqual(readFacilitySave(store), { place: at('m-hub', 'door-m2') }, 'a course entered by its door resumes at the door')
  saveFacilityPlace(store, at('wake'))
  assert.deepEqual(readFacilitySave(store), { place: at('wake') }, 'the start saves like any facility area')
  const route = { kind: 'course', level: 'climb', back: at('hall', 'dispatch'), via: 'exit' }
  saveFacilityPlace(store, route)
  assert.deepEqual(readFacilitySave(store), { place: route }, 'a course an exit led into resumes in itself')
  store.setItem(FACILITY_KEY, '{"place":{"kind":"escape","level":"climb","index":0}}')
  assert.deepEqual(readFacilitySave(store), { place: { kind: 'escape', level: 'climb' } }, 'an older save names its escape level')
  assert.deepEqual(savedPlace({ kind: 'course', level: 'f1', back: at('f-hub', 'door-f1'), via: 'door' }), at('f-hub', 'door-f1'))
  for (const broken of ['{"place":{"kind":"hub","level":3}}', '{"place":{"kind":"escape","level":"climb","index":-1}}', '{"place":{"kind":"opening","level":"wake"}}',
    '{"place":{"kind":"course","level":"climb","via":"exit"}}', '{"place":{"kind":"course","level":"m2","via":"door","back":{"kind":"hub","level":"m-hub"}}}', 'not json']) {
    store.setItem(FACILITY_KEY, broken)
    assert.deepEqual(readFacilitySave(store), {}, broken)
  }
  store.setItem(FACILITY_KEY, '{"place":{"kind":"hub","level":"hall","arrival":{"kind":"bay"}}}')
  assert.deepEqual(readFacilitySave(store), { place: at('hall') })
})

test('the start and the concourse join through their bulkheads', () => {
  const opening = { kind: 'hub', level: 'wake', arrival: { kind: 'entrance' } }
  const hall = nextPlace(campaign, opening, { kind: 'bulkhead', door: bulkhead('wake-to-hall', 1600, 'hall') }, levels)
  assert.deepEqual(hall, { kind: 'hub', level: 'hall', arrival: { kind: 'door', id: 'hall-to-wake' } })
  // Going back steps out of the opening's own bulkhead, at its far end.
  assert.deepEqual(nextPlace(campaign, hall, { kind: 'bulkhead', door: bulkhead('hall-to-wake', 200, 'wake') }, levels),
    { kind: 'hub', level: 'wake', arrival: { kind: 'door', id: 'wake-to-hall' } })
})

test('doors lead into their levels and back out of the same door', () => {
  const wing = at('m-hub')
  const into = nextPlace(campaign, wing, { kind: 'course', door: door('door-m2', 900, 'm2') }, levels)
  assert.deepEqual(into, { kind: 'course', level: 'm2', back: at('m-hub', 'door-m2'), via: 'door' })
  assert.deepEqual(nextPlace(campaign, into, null, levels, false), at('m-hub', 'door-m2'))
  assert.deepEqual(nextPlace(campaign, into, null, levels, true), at('m-hub', 'door-m2'), 'an exit that leads nowhere else goes back where it came from')
  assert.equal(nextPlace(campaign, wing, null, levels), null)
  assert.equal(nextPlace(campaign, wing, { kind: 'course', door: door('door-x', 0, 'missing') }, levels), null)
})

test('a level door can return the robot through another door, and a bulkhead can arrive at a chosen door', () => {
  const back = nextPlace(campaign, at('m-hub'), { kind: 'course', door: { ...door('door-m2', 900, 'm2'), returnsTo: 'm-to-hall' } }, levels)
  assert.deepEqual(back.back, at('m-hub', 'm-to-hall'))
  assert.deepEqual(nextPlace(campaign, back, null, levels, false), at('m-hub', 'm-to-hall'), 'an F and leaving use it too')
  // A door that is no longer in the area falls back to the level door itself.
  assert.deepEqual(nextPlace(campaign, at('m-hub'), { kind: 'course', door: { ...door('door-m2', 900, 'm2'), returnsTo: 'gone' } }, levels).back, at('m-hub', 'door-m2'))
  assert.deepEqual(nextPlace(campaign, at('hall'), { kind: 'bulkhead', door: { ...bulkhead('hall-to-m', 1100, 'm-hub'), arrivesAt: 'door-m2' } }, levels), at('m-hub', 'door-m2'))
  assert.deepEqual(nextPlace(campaign, at('hall'), { kind: 'bulkhead', door: { ...bulkhead('hall-to-m', 1100, 'm-hub'), arrivesAt: 'gone' } }, levels), at('m-hub', 'm-to-hall'))
})

test('a passing exit leads where it says: into a course at its start, or a facility area at a chosen door', () => {
  const via = leadsTo => new Map([...levels, ['m2', course('m2', 'A Bigger Swing', leadsTo)]])
  const into = { kind: 'course', level: 'm2', back: at('m-hub', 'door-m2'), via: 'door' }
  assert.deepEqual(nextPlace(campaign, into, null, via({ level: 'f-hub', arrival: 'door-f2' }), true), at('f-hub', 'door-f2'))
  assert.deepEqual(nextPlace(campaign, into, null, via({ level: 'f-hub' }), true), at('f-hub'))
  assert.deepEqual(nextPlace(campaign, into, null, via({ level: 'f-hub', arrival: 'gone' }), true), at('f-hub'))
  assert.deepEqual(nextPlace(campaign, into, null, via({ level: 'f1' }), true), { kind: 'course', level: 'f1', back: at('m-hub', 'door-m2'), via: 'exit' })
  assert.deepEqual(nextPlace(campaign, into, null, via({ level: 'f1' }), false), at('m-hub', 'door-m2'), 'an F goes back')
  assert.deepEqual(nextPlace(campaign, into, null, via({ level: 'missing' }), true), at('m-hub', 'door-m2'))
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

test('doors are lettered with where they lead; a level door’s placard shows its data: deadline, best time and grade', () => {
  const best = id => ({ m1: 12.5, m2: 99 })[id] ?? null
  const hall = hubPresentation(campaign, progress(['m1']), levels.get('hall'), levels, best)
  assert.deepEqual([...hall.open], ['hall-to-wake', 'hall-to-m', 'hall-to-f'])
  assert.deepEqual([hall.signs.get('hall-to-wake'), hall.signs.get('hall-to-f')], ['ORIENTATION', 'FREIGHT WING'])
  // A sealed wing's bulkhead waits for its wiring, still lettered; the board shows it SEALED.
  assert.equal(hall.signs.get('hall-to-w'), 'WATER WING')
  assert.equal(hall.placards.get('board').at(-1), 'WATER WING SEALED')
  assert.equal(hall.placards.has('hall-to-w'), false, 'a bulkhead has no placard')
  const opening = hubPresentation(campaign, progress([]), levels.get('wake'), levels, best)
  assert.deepEqual([...opening.open], ['wake-to-hall'])
  assert.equal(opening.signs.get('wake-to-hall'), 'CONCOURSE')
  const wing = hubPresentation(campaign, progress(['m1']), levels.get('m-hub'), levels, best)
  assert.deepEqual([wing.signs.get('door-m1'), wing.signs.get('door-m2')], ['HOP SKIP JUMP I', 'A BIGGER SWING'])
  assert.deepEqual(wing.placards.get('door-m1'), ['BEST 0:12.50', 'GRADE B'])
  assert.deepEqual(wing.placards.get('door-m2'), ['BEST 1:39.00 F', 'D 1:15'], 'a run past the deadline is not a pass')
  assert.deepEqual(hubPresentation(campaign, progress([]), levels.get('m-hub'), levels, () => null).placards.get('door-m1'), ['NO RECORD', 'D 1:15'])
  // A switched door is left to the area's wiring: the run opens it while its switches are on, and its placard is dark while shut.
  const fresh = hubPresentation(campaign, progress([]), levels.get('m-hub'), levels, best)
  assert.deepEqual([...fresh.open], ['door-m1', 'm-to-hall'])
  assert.deepEqual([...fresh.switched], ['door-m2'])
  // A door saved before its destination was chosen stays shut and blank.
  const unfinished = hubPresentation(campaign, progress([]), hub('draft', [door('door-new', 600, '')], [bulkhead('to-new', 900, '')]), levels, best)
  assert.deepEqual([...unfinished.open], [])
  assert.deepEqual([...unfinished.placards.values()], [[]])
  assert.deepEqual([...unfinished.signs.values()], [])
})

test('any area the robot can reach with level doors is a wing, after the wings nearer the start', () => {
  // A side room off a wing, two bulkheads from the concourse.
  const annex = hub('annex', [door('door-extra', 600, 'extra')], [bulkhead('annex-to-m', 200, 'm-hub')], [], 'Annex')
  const wingLevel = levels.get('m-hub'), world = new Map([...levels, ['extra', course('extra', 'Extra')], ['annex', annex],
    ['m-hub', { ...wingLevel, bulkheads: [...wingLevel.bulkheads, bulkhead('m-to-annex', 1500, 'annex')] }]])
  const wider = resolveCampaign(parseCampaign({ version: 3, start: 'wake' }), world)
  assert.deepEqual(wider.wings.map(wing => wing.level), ['m-hub', 'f-hub', 'w-hub', 'annex'])
  assert.deepEqual(wider.areas, ['wake', 'hall', 'm-hub', 'f-hub', 'w-hub', 'annex'])
  const into = nextPlace(wider, at('m-hub'), { kind: 'bulkhead', door: bulkhead('m-to-annex', 1500, 'annex') }, world)
  assert.deepEqual(into, at('annex', 'annex-to-m'))
  const fresh = facilityProgress(wider, () => false, campaignWiring(wider, world, records([])))
  assert.deepEqual(facilityStart(wider, fresh, { place: into }, world), into, 'a save in the area resumes there')
  assert.equal(linkOpen(wider, fresh, world, 'extra'), true, 'its first door is open')
  // A course behind no door in the facility is outside the campaign, and always open.
  const outside = new Map([...world, ['practice', course('practice', 'Practice')]])
  assert.equal(linkOpen(wider, fresh, outside, 'practice'), true)
  assert.equal(linkedPlace(wider, outside, 'practice'), null)
})

test('the dispatch door opens by its wiring, here once every wing is complete, and leads on through the exits', () => {
  const wingTimes = id => id === 'final' ? null : 20
  const sealed = hubPresentation(campaign, progress(everything.slice(0, -1)), levels.get('hall'), levels, wingTimes)
  assert.deepEqual([...sealed.switched], ['dispatch', 'hall-to-w'], 'left to its wiring, like any switched door')
  assert.deepEqual([sealed.signs.get('dispatch'), sealed.placards.get('dispatch')], ['DISPATCH', ['SEALED']])
  const released = progress(everything)
  assert.deepEqual([released.complete, released.released], [true, true])
  assert.deepEqual(hubPresentation(campaign, released, levels.get('hall'), levels, wingTimes).placards.get('dispatch'), ['UNIT RELEASED'])
  // Once the final course is passed, its door stays open like any other.
  assert.equal(hubPresentation(campaign, progress([]), levels.get('hall'), levels, () => 20).open.has('dispatch'), true)
  // The door's wiring decides, not the count: wired from the water wing alone, passing it releases the unit.
  const hallLevel = levels.get('hall'), early = new Map([...levels, ['hall', { ...hallLevel, courseDoors: [{ ...hallLevel.courseDoors[0], switchLogic: undefined }],
    bulkheads: hallLevel.bulkheads.map(bulkhead => ({ ...bulkhead, targets: bulkhead.targets?.filter(id => id !== 'dispatch' || bulkhead.id === 'hall-to-w') })) }]])
  const water = facilityProgress(campaign, id => ['f1', 'f2', 'w1'].includes(id), campaignWiring(campaign, early, records(['f1', 'f2', 'w1'])))
  assert.deepEqual([water.complete, water.released], [false, true])
  assert.equal(linkOpen(campaign, water, early, 'final'), true, 'its course can be linked once released')
  assert.equal(evaluationLines(campaign, water, early)[1], 'UNIT RELEASED FOR DISPATCH', 'the board follows the door')
  // Always open means always open, for the dispatch door too.
  const always = new Map([...levels, ['hall', { ...hallLevel, courseDoors: [{ ...hallLevel.courseDoors[0], power: undefined, switchLogic: undefined }] }]])
  assert.equal(facilityProgress(campaign, () => false, campaignWiring(campaign, always, records([]))).released, true)
  assert.equal(facilityProgress(campaign, () => false, campaignWiring(campaign, levels, records([]))).released, false)
  // An F goes back to the dispatch door; a pass follows the exits, and the bus exit ends the game.
  const final = { kind: 'course', level: 'final', back: at('hall', 'dispatch'), via: 'door' }
  assert.deepEqual(nextPlace(campaign, final, null, levels, false), at('hall', 'dispatch'))
  const climb = nextPlace(campaign, final, null, levels, true)
  assert.deepEqual(climb, { kind: 'course', level: 'climb', back: at('hall', 'dispatch'), via: 'exit' })
  assert.deepEqual(nextPlace(campaign, climb, null, levels, false), at('hall', 'dispatch'), 'an F on the route goes back too')
  const bus = nextPlace(campaign, climb, null, levels, true)
  assert.deepEqual(bus, { kind: 'course', level: 'bus', back: at('hall', 'dispatch'), via: 'exit' })
  assert.equal(nextPlace(campaign, bus, null, levels), null)
})

test('the evaluation board shows the total and each wing, then the release', () => {
  assert.deepEqual(evaluationLines(campaign, progress(['m1', 'f1']), levels), ['EVALUATION 2 / 5', 'MOVEMENT WING 1/2', 'FREIGHT WING 1/2', 'WATER WING SEALED'])
  assert.deepEqual(evaluationLines(campaign, progress(everything), levels), ['EVALUATION COMPLETE', 'UNIT RELEASED FOR DISPATCH', 'MOVEMENT WING 2/2', 'FREIGHT WING 2/2', 'WATER WING 1/1'])
  assert.deepEqual(hubPresentation(campaign, progress([]), levels.get('hall'), levels, () => null).placards.get('board'),
    ['EVALUATION 0 / 5', 'MOVEMENT WING 0/2', 'FREIGHT WING 0/2', 'WATER WING SEALED'])
})

test('a wing goes by its level’s name', () => {
  const renamed = new Map([...levels, ['m-hub', { ...levels.get('m-hub'), name: 'Boot Camp' }]])
  assert.deepEqual(evaluationLines(campaign, progress([]), renamed).slice(1), ['BOOT CAMP 0/2', 'FREIGHT WING 0/2', 'WATER WING SEALED'])
  assert.equal(hubPresentation(campaign, progress([]), levels.get('hall'), renamed, () => null).signs.get('hall-to-m'), 'BOOT CAMP')
})

test('a passed course’s door stays open, whatever its wiring says', () => {
  // A pass carried over from the level grid, behind a door whose wiring is still off.
  const carried = hubPresentation(campaign, progress(['m2']), levels.get('m-hub'), levels, id => id === 'm2' ? 12 : null)
  assert.deepEqual([...carried.open], ['door-m1', 'door-m2', 'm-to-hall'])
  assert.deepEqual([...carried.switched], [])
  assert.equal(linkOpen(campaign, progress(['m2']), levels, 'm2'), true)
  // An untimed level counts once completed.
  const lounge = hub('lounge', [door('door-bus', 600, 'bus', switched)], [])
  assert.deepEqual([...hubPresentation(campaign, progress([]), lounge, levels, () => null, id => id === 'bus').open], ['door-bus'])
  assert.deepEqual(hubPresentation(campaign, progress([]), lounge, levels, () => null, id => id === 'bus').placards.get('door-bus'), ['COMPLETE'])
})

test('the start screen lists each wing’s courses, dark while locked, and a sealed wing', () => {
  const best = id => ({ m1: 12.5, f1: 90 })[id] ?? null
  const [movement, freight, water] = progressRecords(campaign, progress(['m1']), levels, best)
  assert.deepEqual(movement, { id: 'm-hub', name: 'Movement wing', open: true, passed: 1, courses: [
    { state: 'passed', id: 'm1', name: 'Hop Skip Jump I', best: 12.5, grade: 'B', deadline: 75 },
    { state: 'open', id: 'm2', name: 'A Bigger Swing', best: null, grade: null, deadline: 75 },
  ] })
  // A run slower than the D deadline leaves the door open, not passed; the next door stays dark.
  assert.deepEqual(freight.courses, [{ state: 'open', id: 'f1', name: 'Boxes', best: 90, grade: 'F', deadline: 75 }, { state: 'locked' }])
  assert.deepEqual(water, { id: 'w-hub', name: 'Water wing', open: false, passed: 0, courses: [{ state: 'locked' }] })
})

test('a new game has no saved place or course records; restarting erases them and every saved place', () => {
  const save = storage()
  assert.equal(savedGameExists(save), false)
  save.setItem('arcade.jumping.times.v1', '{}'); save.setItem('arcade.jumping.completed.v1', '{}')
  assert.equal(savedGameExists(save), false, 'empty records are still a new game')
  save.setItem(FACILITY_KEY, 'not json')
  assert.equal(savedGameExists(save), false, 'an unreadable place starts a new game')
  saveFacilityPlace(save, { kind: 'hub', level: 'wake', arrival: { kind: 'entrance' } })
  assert.equal(savedGameExists(save), true, 'a robot that has woken can continue')
  const records = storage()
  records.setItem('arcade.jumping.completed.v1', JSON.stringify({ m1: true }))
  assert.equal(savedGameExists(records), true, 'passes from the level grid can continue')
  assert.deepEqual([...GAME_KEYS].sort(), ['arcade.jumping.areas.v1', 'arcade.jumping.completed.v1', FACILITY_KEY, 'arcade.jumping.times.v1'].sort())
})

test('the studio names doors and bulkheads as the facility shows them, never by their saved names', () => {
  const name = facilityDoorName(levels)
  const hall = { ...levels.get('hall'), courseDoors: [{ ...levels.get('hall').courseDoors[0], name: 'Dispatch door' }],
    bulkheads: levels.get('hall').bulkheads.map(bulkhead => ({ ...bulkhead, name: 'Saved name' })) }
  assert.equal(name(hall.courseDoors[0]), 'Dispatch')
  assert.equal(name(hall.bulkheads[2]), 'Freight wing')
  assert.equal(objectLabel(hall, { kind: 'bulkhead', index: 2 }, name), 'Freight wing · Bulkhead 3')
  assert.equal(objectLabel(hall, { kind: 'course-door', index: 0 }, name), 'Dispatch · Level door 1')
  assert.equal(objectLabel(hall, { kind: 'bulkhead', index: 2 }), 'Bulkhead 3', 'without the collection, only the kind and number')
  assert.equal(name(levels.get('m-hub').courseDoors[1]), 'A Bigger Swing')
  // The canvas reads as a new save sees it: lettering, deadlines, a sealed dispatch door and the board.
  const shown = studioPresentation(hall, levels, campaign)
  assert.deepEqual([shown.signs.get('dispatch'), shown.placards.get('dispatch')], ['DISPATCH', ['SEALED']])
  assert.equal(shown.signs.get('hall-to-f'), 'FREIGHT WING')
  assert.deepEqual(shown.placards.get('board'), ['EVALUATION 0 / 5', 'MOVEMENT WING 0/2', 'FREIGHT WING 0/2', 'WATER WING SEALED'])
  const wing = studioPresentation(levels.get('m-hub'), levels, campaign)
  assert.deepEqual([wing.signs.get('door-m2'), wing.placards.get('door-m2')], ['A BIGGER SWING', ['NO RECORD', 'D 1:15']])
  // Without the campaign, each door is still lettered with where it leads; one with no destination says so.
  const draft = studioPresentation(hub('draft', [door('door-new', 600, ''), door('door-m1', 900, 'm1')], [bulkhead('to-new', 900, '')]), levels, null)
  assert.deepEqual([...draft.signs.values()], ['NO LEVEL', 'HOP SKIP JUMP I', 'NOWHERE'])
  assert.deepEqual([...draft.placards.values()], [[], ['NO RECORD', 'D 1:15']])
})
