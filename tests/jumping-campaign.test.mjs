import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { blankTrial } from '../src/games/jumping/level.ts'
import { campaignProblems, clearanceCourses, courseAvailable, facilityProgress, parseCampaign } from '../src/games/jumping/campaign.ts'
import { decodeLevelFile, decodeLevelManifest } from '../src/games/jumping/levelAssets.ts'

const course = (id, name = id) => ({ ...blankTrial(), id, name })
const levels = [{ ...course('wake', 'Wake'), timing: 'untimed' }, ...['o1', 'o2', 'f1', 'f2', 'w1', 'w2'].map(id => course(id))]
const campaign = overrides => parseCampaign({ version: 1, opening: 'wake', wings: [
  { id: 'orientation', name: 'Orientation', courses: ['o1', 'o2'], clearance: null },
  { id: 'freight', name: 'Freight', courses: ['f1', 'f2'] },
  { id: 'water', name: 'Water', courses: ['w1', 'w2'], clearance: { wings: ['freight'], courses: ['o1'], count: 2 } },
], ...overrides })
const progress = (passes, value = campaign()) => facilityProgress(value, id => passes.includes(id))
const doors = wing => wing.doors.map(door => door.state)

test('campaign files decode strictly', () => {
  assert.deepEqual(campaign().wings[2].clearance, { courses: ['o1'], wings: ['freight'], count: 2 })
  assert.equal(campaign().wings[1].clearance, null)
  assert.throws(() => parseCampaign({ version: 2, opening: 'wake', wings: [] }), /Unsupported campaign version/)
  for (const broken of [
    { wings: [] },
    { opening: '' },
    { wings: [{ id: 'Orientation', name: 'Orientation', courses: ['o1'] }] },
    { wings: [{ id: 'orientation', name: ' ', courses: ['o1'] }] },
    { wings: [{ id: 'orientation', name: 'Orientation', courses: [] }] },
    { wings: [{ id: 'orientation', name: 'Orientation', courses: ['o1'], clearance: {} }] },
    { wings: [{ id: 'orientation', name: 'Orientation', courses: ['o1'], clearance: { courses: ['o2'], count: 0 } }] },
  ]) assert.throws(() => campaign(broken), /not a valid campaign/)
})

test('clearance counts each named course once, in campaign order', () => {
  const value = campaign()
  assert.deepEqual(clearanceCourses(value, value.wings[2].clearance), ['o1', 'f1', 'f2'])
  assert.deepEqual(clearanceCourses(value, { courses: ['f2', 'f2'], wings: ['freight'] }), ['f1', 'f2'])
})

test('a valid campaign has no problems', () => {
  assert.deepEqual(campaignProblems(campaign(), levels), [])
})

test('campaign problems name missing, misplaced and duplicate courses', () => {
  const problems = campaignProblems(campaign({ opening: 'gone', wings: [
    { id: 'orientation', name: 'Orientation', courses: ['o1', 'wake', 'nowhere'], clearance: null },
    { id: 'freight', name: 'Freight', courses: ['o1', 'f1'], level: 'f1' },
    { id: 'freight', name: 'Freight again', courses: ['f2'] },
  ] }), levels)
  assert.deepEqual(problems, [
    'The opening level “gone” is not in the collection.',
    'The Orientation wing lists “Wake”, which is not a timed course.',
    'The Orientation wing lists “nowhere”, which is not in the collection.',
    '“o1” appears in both the Orientation and Freight wings.',
    'Two wings use the ID “freight”.',
    'The Freight wing level “f1” is already used as a course or the opening.',
  ])
})

test('clearance must come from other wings that can open first', () => {
  const problems = campaignProblems(campaign({ wings: [
    { id: 'orientation', name: 'Orientation', courses: ['o1'], clearance: { courses: ['f1'] } },
    { id: 'freight', name: 'Freight', courses: ['f1', 'f2'], clearance: { wings: ['freight', 'docks'], courses: ['w1'] } },
    { id: 'water', name: 'Water', courses: ['w1', 'w2'], clearance: { courses: ['o1', 'f1'], count: 3 } },
  ] }), levels)
  assert.deepEqual(problems, [
    'The Orientation wing opens after the opening level, so it cannot have a clearance.',
    "The Freight wing's clearance cannot depend on its own courses.",
    "The Freight wing's clearance names an unknown wing, “docks”.",
    "The Water wing's clearance needs 3 courses but names only 2.",
    'The Freight wing can never open: its clearance needs courses that are only behind it.',
    'The Water wing can never open: its clearance needs courses that are only behind it.',
  ])
  // Two wings that each wait on the other can never open.
  const cycle = campaignProblems(campaign({ wings: [
    { id: 'orientation', name: 'Orientation', courses: ['o1', 'o2'] },
    { id: 'freight', name: 'Freight', courses: ['f1', 'f2'], clearance: { wings: ['water'] } },
    { id: 'water', name: 'Water', courses: ['w1', 'w2'], clearance: { wings: ['freight'] } },
  ] }), levels)
  assert.deepEqual(cycle.filter(problem => problem.includes('never open')).length, 2)
})

test('wing levels need one door per course and bulkheads both ways', () => {
  const hub = (id, courseDoors, bulkheads) => ({ id, name: id, kind: 'hub', courseDoors, bulkheads, chargingBays: [] })
  const door = course => ({ id: `door-${course}`, x: 0, y: 0, course })
  const to = target => ({ id: `to-${target}`, x: 0, y: 0, to: target })
  const value = campaign({ concourse: 'hall', wings: [
    { id: 'orientation', name: 'Orientation', level: 'orientation-hub', courses: ['o1', 'o2'] },
    { id: 'freight', name: 'Freight', level: 'freight-hub', courses: ['f1', 'f2'] },
  ] })
  const world = [...levels, course('plain'), hub('hall', [], [to('orientation'), to('docks')]),
    hub('orientation-hub', [door('o1'), door('o1'), door('f1')], [to('concourse')]), hub('freight-hub', [door('f2')], [])]
  assert.deepEqual(campaignProblems(value, world), [
    'The Orientation wing level has 2 doors for “o1”. Give each course one door.',
    'The Orientation wing level has no door for “o2”. Give each course one door.',
    'The Orientation wing level needs one door to the opening level “Wake”.',
    "Course door “door-f1” in the Orientation wing leads to “f1”, which is not one of that wing's courses.",
    'The Freight wing level has no door for “f1”. Give each course one door.',
    'The Freight wing level needs a bulkhead to the concourse.',
    'The concourse needs a bulkhead to the Freight wing.',
    'Bulkhead “to-docks” in the concourse leads to an unknown wing, “docks”.',
  ])
  assert.deepEqual(campaignProblems(campaign({ concourse: 'plain' }), world), ['The concourse level “plain” is not a hub level.'])
  assert.deepEqual(campaignProblems(campaign({ concourse: 'hall' }), [...world.slice(0, -3), hub('hall', [door('o1')], [to('orientation'), to('freight'), to('water')])]),
    ['The concourse has course doors. Courses belong in wings; only the dispatch door leads to the final course.'])
})

test('the final course and escape route are separate from the wings', () => {
  const extra = [course('final', 'Ascent I'), course('climb', 'Ascent II'), { ...course('bus', 'Exit'), timing: 'untimed' }]
  const world = [...levels, ...extra]
  assert.deepEqual(campaignProblems(campaign({ finalCourse: 'final', escape: ['climb', 'bus'] }), world), [])
  assert.deepEqual(campaignProblems(campaign({ finalCourse: 'o1', escape: ['gone', 'f1', 'climb', 'climb'] }), world), [
    'The final course “o1” is already used as a wing course or the opening.',
    'The escape level “gone” is not in the collection.',
    'The escape level “f1” is already used elsewhere in the campaign.',
    'The escape route lists a level twice.',
  ])
  assert.deepEqual(campaignProblems(campaign({ finalCourse: 'bus' }), world), ['The final course “Exit” is not a timed course.'])
  // The concourse's dispatch door is its one course door, and it leads to the final course.
  const hall = (doors) => ({ id: 'hall', name: 'hall', kind: 'hub', courseDoors: doors, bulkheads: [], chargingBays: [] })
  const dispatch = { id: 'dispatch', x: 0, y: 0, course: 'final' }
  assert.deepEqual(campaignProblems(campaign({ concourse: 'hall', finalCourse: 'final' }), [...world, hall([dispatch])]), [])
  assert.deepEqual(campaignProblems(campaign({ concourse: 'hall', finalCourse: 'final' }), [...world, hall([])]), ['The concourse needs one dispatch door to the final course.'])
  assert.deepEqual(campaign({ escape: undefined }).escape, [])
})

test('a fresh save opens nothing until the opening is passed', () => {
  const fresh = progress([])
  assert.equal(fresh.concourseOpen, false)
  assert.deepEqual(fresh.wings.map(wing => wing.open), [false, false, false])
  assert.deepEqual(doors(fresh.wings[0]), ['locked', 'locked'])
  assert.equal(courseAvailable(fresh, 'o1'), false)
  const awake = progress(['wake'])
  assert.deepEqual(doors(awake.wings[0]), ['open', 'locked'])
  assert.equal(courseAvailable(awake, 'o1'), true)
  assert.equal(courseAvailable(awake, 'o2'), false)
})

test('passing the first wing opens the concourse and the wings without clearance', () => {
  const partway = progress(['wake', 'o1'])
  assert.deepEqual(doors(partway.wings[0]), ['passed', 'open'])
  assert.equal(partway.concourseOpen, false)
  assert.equal(partway.wings[1].open, false)
  const concourse = progress(['wake', 'o1', 'o2'])
  assert.equal(concourse.concourseOpen, true)
  assert.deepEqual(doors(concourse.wings[1]), ['open', 'locked'])
  assert.equal(concourse.wings[2].open, false)
  assert.deepEqual(concourse.wings[2].clearance, { passed: 1, count: 2 })
})

test('clearance opens a wing exactly at its threshold', () => {
  const value = campaign()
  assert.equal(progress(['wake', 'o1', 'o2'], value).wings[2].open, false)
  const opened = progress(['wake', 'o1', 'o2', 'f1'], value)
  assert.equal(opened.wings[2].open, true)
  assert.deepEqual(opened.wings[2].clearance, { passed: 2, count: 2 })
  assert.deepEqual(doors(opened.wings[2]), ['open', 'locked'])
})

test('passes carried over from the level grid keep their doors and open the next one', () => {
  const carried = progress(['wake', 'o1', 'o2', 'f2'])
  assert.deepEqual(doors(carried.wings[1]), ['open', 'passed'])
  assert.equal(courseAvailable(carried, 'f2'), true)
  // A pass behind a closed wing still counts, but its door stays out of reach.
  const behind = progress(['wake', 'w2'])
  assert.deepEqual(doors(behind.wings[2]), ['locked', 'passed'])
  assert.equal(courseAvailable(behind, 'w2'), false)
  assert.equal(behind.passed, 1)
})

test('the evaluation completes when every wing course is passed', () => {
  const all = ['wake', 'o1', 'o2', 'f1', 'f2', 'w1', 'w2']
  assert.deepEqual([progress(all.slice(0, 5)).passed, progress(all.slice(0, 5)).required], [4, 6])
  assert.equal(progress(all.slice(0, 6)).complete, false)
  assert.equal(progress(all).complete, true)
})

test('the built-in campaign names valid built-in courses', () => {
  const root = new URL('../public/levels/jumping/', import.meta.url)
  const manifest = decodeLevelManifest(readFileSync(new URL('index.json', root), 'utf8'))
  const builtIns = manifest.levels.map(name => decodeLevelFile(readFileSync(new URL(encodeURIComponent(name), root), 'utf8')))
  const value = parseCampaign(JSON.parse(readFileSync(new URL('../public/levels/jumping-campaign.json', import.meta.url), 'utf8')))
  assert.deepEqual(campaignProblems(value, builtIns), [])
  assert.equal(builtIns.find(level => level.id === value.opening)?.name, 'Wake')
})
