import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { blankTrial, isHubLevel, parseLevel } from '../src/games/jumping/level.ts'
import { campaignProblems, courseAvailable, facilityProgress, parseCampaign, wingName } from '../src/games/jumping/campaign.ts'
import { resolveCampaign } from '../src/games/jumping/facility.ts'
import { decodeLevelFile, decodeLevelManifest } from '../src/games/jumping/levelAssets.ts'

const course = (id, name = id, more = {}) => ({ ...blankTrial(), id, name, ...more })
// A course whose plain exit leads on when its run passes.
const leading = (id, to, more = {}) => course(id, id, { goal: { ...blankTrial().goal, leadsTo: to }, ...more })
const door = (course, x = 300, more = {}) => ({ id: `door-${course}`, x, y: 920, course, ...more })
// A bulkhead names the facility area it opens onto by its level ID.
const to = (target, x = 900, more = {}) => ({ id: `to-${target}`, x, y: 920, to: target, ...more })
const hub = (id, courseDoors = [], bulkheads = [], name = id) => parseLevel({ ...blankTrial(), id, name, kind: 'hub', timing: 'untimed',
  goal: undefined, times: undefined, courseDoors, bulkheads, evaluationBoards: [] })
const file = (more = {}) => parseCampaign({ version: 3, start: 'wake', ...more })
/**
 * A facility as the studio lays it out. The start leads onto the concourse, whose bulkheads open onto three
 * wings and a store room, and whose one level door is the dispatch door to the final course. Its exit leads on
 * to a climb, whose exit leads to a bus. Gate and Movement are open from the start, Gate further left; Freight
 * opens once Movement is complete. Freight's doors stand against their wiring: the right-hand door opens first.
 */
const world = (changes = {}) => [
  hub('wake', [], [to('hall')], 'Wake'),
  hub('hall', [door('final', 1500, { power: 'switched', dispatch: true })], [to('wake', 100), to('f-hub', 200, { power: 'switched' }), to('g-hub', 300), to('m-hub', 600, { targets: ['to-f-hub', 'door-final'] }), to('store', 700)], 'Concourse'),
  hub('m-hub', [door('m1', 300, { targets: ['door-m2'] }), door('m2', 600, { power: 'switched' })], [to('hall')], 'Movement'),
  hub('f-hub', [door('f2', 300, { power: 'switched' }), door('f1', 600, { targets: ['door-f2'] })], [to('hall')], 'Freight'),
  hub('g-hub', [door('g1')], [to('hall')], 'Gate'),
  hub('store', [], [to('hall')], 'Store'),
  ...['m1', 'm2', 'f1', 'f2', 'g1'].map(id => course(id)), leading('final', { level: 'climb' }), leading('climb', { level: 'bus' }),
  course('bus', 'Exit', { timing: 'untimed', goal: { x: 1500, y: 920, kind: 'bus' }, times: undefined }),
].map(level => changes[level.id] ? { ...level, ...changes[level.id] } : level)
const resolve = (levels, value = file()) => resolveCampaign(value, new Map(levels.map(level => [level.id, level])))

test('the campaign file names only where a new game starts', () => {
  assert.deepEqual(file(), { version: 3, start: 'wake' })
  // Earlier versions named the opening, the concourse and the escape route, which the levels now say.
  for (const old of [{ version: 2 }, { version: 1 }, { opening: 'wake' }, { concourse: 'hall' }, { escape: [] }, { wings: [] }, { finalCourse: 'final' }])
    assert.throws(() => file(old), /names only where a new game starts/)
  assert.throws(() => file({ version: 4 }), /Unsupported campaign version/)
  for (const broken of [{ start: '' }, { start: undefined }, { start: 3 }]) assert.throws(() => file(broken), /not a valid campaign/)
})

test('the levels lay out the areas, wings, final course and the courses exits lead into', () => {
  const campaign = resolve(world())
  assert.deepEqual(campaign.areas, ['wake', 'hall', 'f-hub', 'g-hub', 'm-hub', 'store'], 'nearest the start first')
  // The store room has no level doors, so it is not a wing; Gate and Movement open together, left to right.
  assert.deepEqual(campaign.wings, [{ level: 'g-hub', courses: ['g1'] }, { level: 'm-hub', courses: ['m1', 'm2'] }, { level: 'f-hub', courses: ['f1', 'f2'] }])
  assert.equal(campaign.finalCourse, 'final')
  assert.deepEqual(campaign.dispatch, { area: 'hall', door: 'door-final' })
  assert.deepEqual(campaign.chained, { climb: 'final', bus: 'final' })
  const levels = new Map(world().map(level => [level.id, level])), value = file()
  assert.equal(resolveCampaign(value, levels), resolveCampaign(value, levels), 'a collection resolves once')
  // A door that never opens is listed last.
  const stuck = resolve(world({ 'f-hub': hub('f-hub', [door('f2', 300, { power: 'switched' }), door('f1', 600, { power: 'switched' })], [to('hall')], 'Freight') }))
  assert.deepEqual(stuck.wings[2].courses, ['f2', 'f1'], 'neither opens, so left to right')
  // Without a dispatch door, no course is final; without its start, the facility has nothing.
  const plain = resolve(world({ hall: { courseDoors: [door('final', 1500)] } }))
  assert.equal(plain.finalCourse, undefined)
  assert.deepEqual(plain.wings.map(wing => wing.level), ['hall', 'g-hub', 'm-hub', 'f-hub'], 'an ordinary door in the concourse makes it a wing')
  assert.deepEqual(resolve(world().filter(level => level.id !== 'wake')).wings, [])
})

test('a wing goes by its level’s name', () => {
  const levels = new Map(world().map(level => [level.id, level]))
  assert.equal(wingName({ level: 'm-hub', courses: [] }, levels), 'Movement')
  assert.equal(wingName({ level: 'gone', courses: [] }, levels), 'gone')
})

test('a facility laid out as the studio builds it has no problems', () => {
  assert.deepEqual(campaignProblems(resolve(world()), world()), [])
})

test('campaign problems: the start is a facility area in the collection', () => {
  assert.deepEqual(campaignProblems(resolve(world(), file({ start: 'gone' })), world()).slice(0, 1), ['The level for the start, “gone”, is not in the collection.'])
  assert.deepEqual(campaignProblems(resolve(world(), file({ start: 'm1' })), world()).slice(0, 1), ['The level for the start, “m1”, is not a facility area.'])
})

test('campaign problems: each course has one way in, behind a level door to a timed course', () => {
  const levels = world({ 'g-hub': { courseDoors: [door('g1', 300), door('m1', 700), door('wake', 900), door('void', 1100), door('climb', 1300)] } })
  assert.deepEqual(campaignProblems(resolve(levels), levels), [
    'Level door “door-wake” in “Gate” leads to “Wake”, which is not a timed course.',
    'Level door “door-void” in “Gate” leads to “void”, which is not in the collection.',
    '“m1” is reached from a level door in “Gate” and from a level door in “Movement”. Give each course one way in.',
    '“climb” is reached from a level door in “Gate” and from the exit of “final”. Give each course one way in.',
  ])
})

test('campaign problems: one dispatch door', () => {
  const levels = world({ 'g-hub': { courseDoors: [door('g1', 300, { dispatch: true })] } })
  assert.deepEqual(campaignProblems(resolve(levels), levels), [
    'The facility has 2 dispatch doors, in “Concourse” and “Gate”. Mark one.',
  ])
})

test('campaign problems: exits and bulkheads lead and arrive somewhere real, and exits never loop', () => {
  const levels = [...world({
    m1: leading('m1', { level: 'gone' }), m2: leading('m2', { level: 'm2' }), g1: leading('g1', { level: 'f-hub', arrival: 'nowhere' }),
    f1: leading('f1', { level: 'f2', arrival: 'door-f2' }), f2: leading('f2', { level: 'f1' }),
    store: { bulkheads: [to('hall', 900, { arrivesAt: 'missing' })] },
  }), hub('annex', [], [to('docks'), to('m1', 1100)], 'Annex')]
  assert.deepEqual(campaignProblems(resolve(levels), levels), [
    'Bulkhead “to-hall” in “Store” arrives at a door that is not in “Concourse”.',
    'The exit of “m1” leads to “gone”, which is not in the collection.',
    'The exit of “m2” leads back into itself.',
    'The exit of “f1” arrives at a door in “f2”, but a course is entered only at its start.',
    '“f2” is reached from a level door in “Freight” and from the exit of “f1”. Give each course one way in.',
    '“f1” is reached from a level door in “Freight” and from the exit of “f2”. Give each course one way in.',
    'The exit of “g1” arrives at a door that is not in “Freight”.',
    'Bulkhead “to-docks” in “Annex” leads to “docks”, which is not in the collection.',
    'Bulkhead “to-m1” in “Annex” leads to “m1”, which is not a facility area.',
    'The exits of “f1”, “f2” lead round in a loop.',
    'The robot can never reach “Annex” from the start.',
  ])
})

test('campaign problems: every area can be reached from the start, and left again', () => {
  const levels = world({ store: { bulkheads: [] }, 'g-hub': { bulkheads: [to('store', 900)] } })
  assert.deepEqual(campaignProblems(resolve(levels), [...levels, hub('attic', [], [to('hall')], 'Attic')]), [
    'The robot can never reach “Attic” from the start.',
    'The robot cannot get back from “Gate” to the start. Give it a bulkhead toward the rest of the facility.',
    'The robot cannot get back from “Store” to the start. Give it a bulkhead toward the rest of the facility.',
  ])
})

// The wiring as facility.ts resolves it, stubbed: each door opens once the one before it is passed, and
// the concourse opens the water wing once the freight wing is complete.
const campaign = { opening: 'wake', concourse: 'hall', escape: [], wings: [
  { level: 'movement', courses: ['m1', 'm2'] }, { level: 'freight', courses: ['f1', 'f2'] }, { level: 'water', courses: ['w1', 'w2'] }] }
const wiring = passes => ({
  wing: wing => wing.level !== 'water' || ['f1', 'f2'].every(course => passes.includes(course)),
  door: course => {
    const wing = campaign.wings.find(wing => wing.courses.includes(course)), i = wing ? wing.courses.indexOf(course) : -1
    return i === 0 || i > 0 && passes.includes(wing.courses[i - 1])
  },
})
const progress = passes => facilityProgress(campaign, id => passes.includes(id), wiring(passes))
const doors = wing => wing.doors.map(door => door.state)

test('wings open by the wiring: the sealed one waits for it', () => {
  const fresh = progress([])
  assert.deepEqual(fresh.wings.map(wing => [wing.id, wing.open]), [['movement', true], ['freight', true], ['water', false]])
  assert.deepEqual(doors(fresh.wings[0]), ['open', 'locked'])
  assert.equal(courseAvailable(fresh, 'm1'), true)
  assert.equal(courseAvailable(fresh, 'm2'), false)
})

test('a sealed wing opens once its wiring does', () => {
  assert.equal(progress(['f1']).wings[2].open, false)
  const opened = progress(['f1', 'f2'])
  assert.equal(opened.wings[2].open, true)
  assert.deepEqual(doors(opened.wings[2]), ['open', 'locked'])
})

test('passes carried over from the level grid keep their doors and open the next one', () => {
  const carried = progress(['f2'])
  assert.deepEqual(doors(carried.wings[1]), ['open', 'passed'])
  assert.equal(courseAvailable(carried, 'f2'), true)
  // A pass behind a closed wing still counts, but its door stays out of reach.
  const behind = progress(['w2'])
  assert.deepEqual(doors(behind.wings[2]), ['locked', 'passed'])
  assert.equal(courseAvailable(behind, 'w2'), false)
  assert.equal(behind.passed, 1)
})

test('the evaluation completes when every wing course is passed; with no dispatch door, that releases the unit', () => {
  const all = ['m1', 'm2', 'f1', 'f2', 'w1', 'w2']
  assert.deepEqual([progress(all.slice(0, 4)).passed, progress(all.slice(0, 4)).required], [4, 6])
  assert.deepEqual([progress(all.slice(0, 5)).complete, progress(all.slice(0, 5)).released], [false, false])
  assert.deepEqual([progress(all).complete, progress(all).released], [true, true])
  // The dispatch door's wiring decides the release on its own.
  const early = facilityProgress(campaign, () => false, { ...wiring([]), dispatch: () => true })
  assert.deepEqual([early.complete, early.released], [false, true])
})

test('the built-in campaign names valid built-in levels', () => {
  const root = new URL('../public/levels/jumping/', import.meta.url)
  const manifest = decodeLevelManifest(readFileSync(new URL('index.json', root), 'utf8'))
  const builtIns = manifest.levels.map(name => decodeLevelFile(readFileSync(new URL(encodeURIComponent(name), root), 'utf8')))
  const value = resolveCampaign(parseCampaign(JSON.parse(readFileSync(new URL('../public/levels/jumping-campaign.json', import.meta.url), 'utf8'))), new Map(builtIns.map(level => [level.id, level])))
  assert.deepEqual(campaignProblems(value, builtIns), [])
  const start = builtIns.find(level => level.id === value.start)
  assert.equal(start.name, 'Orientation')
  assert.equal(isHubLevel(start), true, 'Orientation is a facility area')
  assert.ok(value.wings.length >= 7 && value.finalCourse, 'the facility opens onto the wings and holds the dispatch door')
  // Ascent I's exit leads through Ascent II and Spelunk to Exit.
  const name = id => builtIns.find(level => level.id === id).name
  assert.deepEqual(Object.keys(value.chained).map(name), ['Ascent II', 'Spelunk', 'Exit'])
  assert.ok(Object.values(value.chained).every(root => root === value.finalCourse))
})
