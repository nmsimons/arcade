import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { blankTrial, isHubLevel, parseLevel } from '../src/games/jumping/level.ts'
import { campaignProblems, courseAvailable, facilityProgress, parseCampaign, wingName } from '../src/games/jumping/campaign.ts'
import { resolveCampaign } from '../src/games/jumping/facility.ts'
import { decodeLevelFile, decodeLevelManifest } from '../src/games/jumping/levelAssets.ts'

const course = (id, name = id, more = {}) => ({ ...blankTrial(), id, name, ...more })
const door = (course, x = 300, more = {}) => ({ id: `door-${course}`, x, y: 920, course, ...more })
// A bulkhead names the facility area it opens onto by its level ID.
const to = (target, x = 900, more = {}) => ({ id: `to-${target}`, x, y: 920, to: target, ...more })
const hub = (id, courseDoors = [], bulkheads = [], name = id) => parseLevel({ ...blankTrial(), id, name, kind: 'hub', timing: 'untimed',
  goal: undefined, times: undefined, courseDoors, bulkheads, evaluationBoards: [] })
const file = (more = {}) => parseCampaign({ version: 2, opening: 'wake', concourse: 'hall', escape: ['climb', 'bus'], ...more })
/**
 * A facility as the studio lays it out. The opening leads onto the concourse, whose bulkheads open onto
 * three wings and a store room, and whose one level door is the dispatch door. Gate and Movement are open
 * from the start, Gate further left; Freight opens once Movement is complete. Freight's doors stand
 * against their wiring: the right-hand door opens first.
 */
const world = (changes = {}) => [
  hub('wake', [], [to('hall')], 'Wake'),
  hub('hall', [door('final', 1500, { power: 'switched' })], [to('wake', 100), to('f-hub', 200, { power: 'switched' }), to('g-hub', 300), to('m-hub', 600, { targets: ['to-f-hub', 'door-final'] }), to('store', 700)], 'Concourse'),
  hub('m-hub', [door('m1', 300, { targets: ['door-m2'] }), door('m2', 600, { power: 'switched' })], [to('hall')], 'Movement'),
  hub('f-hub', [door('f2', 300, { power: 'switched' }), door('f1', 600, { targets: ['door-f2'] })], [to('hall')], 'Freight'),
  hub('g-hub', [door('g1')], [to('hall')], 'Gate'),
  hub('store', [], [to('hall')], 'Store'),
  ...['m1', 'm2', 'f1', 'f2', 'g1', 'final', 'climb'].map(id => course(id)), course('bus', 'Exit', { timing: 'untimed' }),
].map(level => changes[level.id] ? { ...level, ...changes[level.id] } : level)
const resolve = (levels, value = file()) => resolveCampaign(value, new Map(levels.map(level => [level.id, level])))

test('the campaign file names only the opening, the concourse and the escape route', () => {
  assert.deepEqual(file(), { version: 2, opening: 'wake', concourse: 'hall', escape: ['climb', 'bus'] })
  assert.deepEqual(file({ escape: undefined }).escape, [])
  // Version 1 listed the wings and the final course, which the levels already say.
  for (const old of [{ version: 1 }, { wings: [] }, { finalCourse: 'final' }]) assert.throws(() => file(old), /now come from the concourse’s bulkheads and level doors/)
  assert.throws(() => file({ version: 3 }), /Unsupported campaign version/)
  for (const broken of [{ opening: '' }, { concourse: undefined }, { escape: 'climb' }]) assert.throws(() => file(broken), /not a valid campaign/)
})

test('the levels lay out the wings, their courses and the final course, in the order the wiring opens them', () => {
  const campaign = resolve(world())
  // The store room has no level doors, so it is not a wing; Gate and Movement open together, left to right.
  assert.deepEqual(campaign.wings, [{ level: 'g-hub', courses: ['g1'] }, { level: 'm-hub', courses: ['m1', 'm2'] }, { level: 'f-hub', courses: ['f1', 'f2'] }])
  assert.equal(campaign.finalCourse, 'final')
  assert.deepEqual([campaign.opening, campaign.concourse, campaign.escape], ['wake', 'hall', ['climb', 'bus']])
  const levels = new Map(world().map(level => [level.id, level])), value = file()
  assert.equal(resolveCampaign(value, levels), resolveCampaign(value, levels), 'a collection resolves once')
  // A door that never opens is listed last.
  const stuck = resolve(world({ 'f-hub': hub('f-hub', [door('f2', 300, { power: 'switched' }), door('f1', 600, { power: 'switched' })], [to('hall')], 'Freight') }))
  assert.deepEqual(stuck.wings[2].courses, ['f2', 'f1'], 'neither opens, so left to right')
  // Without its concourse the facility has no wings.
  assert.deepEqual(resolve(world().filter(level => level.id !== 'hall')).wings, [])
})

test('a wing goes by its level’s name', () => {
  const levels = new Map(world().map(level => [level.id, level]))
  assert.equal(wingName({ level: 'm-hub', courses: [] }, levels), 'Movement')
  assert.equal(wingName({ level: 'gone', courses: [] }, levels), 'gone')
})

test('a facility laid out as the studio builds it has no problems', () => {
  assert.deepEqual(campaignProblems(resolve(world()), world()), [])
})

test('campaign problems: the opening and the concourse are different facility areas, joined both ways', () => {
  const levels = world({ wake: { courseDoors: [door('m1')], bulkheads: [] }, hall: { bulkheads: [to('m-hub', 600)] } })
  assert.deepEqual(campaignProblems(resolve(levels), levels), [
    'The concourse needs a bulkhead to the opening, “Wake”.',
    'The opening has level doors. Courses belong in wings.',
    'The opening, “Wake”, needs a bulkhead to the concourse.',
  ])
  assert.deepEqual(campaignProblems(resolve(world(), file({ opening: 'gone', concourse: 'm1' })), world()), [
    'The level for the opening, “gone”, is not in the collection.',
    'The level for the concourse, “m1”, is not a facility area.',
  ])
  assert.deepEqual(campaignProblems(resolve(world(), file({ concourse: 'wake' })), world()).slice(0, 1), ['The opening and the concourse need to be different facility areas.'])
})

test('campaign problems: each wing door leads to its own timed course, and each wing leads back', () => {
  const levels = world({
    'g-hub': { courseDoors: [door('g1', 300), { ...door('g1', 500), id: 'door-g1-again' }, door('m1', 700), door('wake', 900), door('void', 1100), door('bus', 1300)], bulkheads: [] },
  })
  assert.deepEqual(campaignProblems(resolve(levels), levels), [
    'The wing “Gate” has 2 doors to “g1”. Give each course one door.',
    'Level door “door-wake” in the wing “Gate” leads to “Wake”, which is not a timed course.',
    'Level door “door-void” in the wing “Gate” leads to “void”, which is not in the collection.',
    'Level door “door-bus” in the wing “Gate” leads to “Exit”, which is not a timed course.',
    'The wing “Gate” needs a bulkhead back to the concourse.',
    '“m1” has doors in the wing “Gate” and in the wing “Movement”.',
    'The escape level “Exit” already has a door in the wing “Gate”.',
  ])
})

test('campaign problems: the concourse holds only the dispatch door, to a course of its own', () => {
  const two = world({ hall: { courseDoors: [door('final', 1500), door('climb', 1700)] } })
  assert.deepEqual(campaignProblems(resolve(two), two), ['The concourse has 2 level doors. Courses belong in wings; the concourse holds only the dispatch door.'])
  const shared = world({ hall: { courseDoors: [door('m1', 1500)] } })
  assert.deepEqual(campaignProblems(resolve(shared), shared), ['The dispatch door leads to “m1”, which has a door in the wing “Movement”.'])
  const untimed = world({ hall: { courseDoors: [door('bus', 1500)] } })
  assert.deepEqual(campaignProblems(resolve(untimed, file({ escape: ['climb'] })), untimed), ['The dispatch door leads to “Exit”, which is not a timed course.'])
})

test('campaign problems: the escape route lists levels of its own, and bulkheads lead to facility areas', () => {
  const levels = [...world(), hub('annex', [], [to('docks'), to('m1', 1100)], 'Annex')]
  assert.deepEqual(campaignProblems(resolve(levels, file({ escape: ['gone', 'g1', 'climb', 'climb', 'store'] })), levels), [
    'The escape level “gone” is not in the collection.',
    'The escape level “g1” already has a door in the wing “Gate”.',
    'The escape route lists “climb” twice.',
    'The escape level “Store” is a facility area.',
    'Bulkhead “to-docks” in “Annex” leads to “docks”, which is not in the collection.',
    'Bulkhead “to-m1” in “Annex” leads to “m1”, which is not a facility area.',
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
  const opening = builtIns.find(level => level.id === value.opening)
  assert.equal(opening.name, 'Orientation')
  assert.equal(isHubLevel(opening), true, 'Orientation is a facility area that opens onto the concourse')
  assert.ok(value.wings.length >= 7 && value.finalCourse, 'the concourse opens onto the wings and holds the dispatch door')
})
