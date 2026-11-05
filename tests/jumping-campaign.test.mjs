import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { blankTrial, isHubLevel } from '../src/games/jumping/level.ts'
import { campaignProblems, clearanceCourses, courseAvailable, facilityProgress, parseCampaign } from '../src/games/jumping/campaign.ts'
import { decodeLevelFile, decodeLevelManifest } from '../src/games/jumping/levelAssets.ts'

const course = (id, name = id) => ({ ...blankTrial(), id, name })
const hub = (id, courseDoors = [], bulkheads = []) => ({ id, name: id, kind: 'hub', courseDoors, bulkheads })
// A bulkhead names the facility area it opens onto by its level ID.
const to = target => ({ id: `to-${target}`, x: 0, y: 0, to: target })
// The opening is a facility area whose bulkhead leads onto the concourse, and back.
const wake = { ...hub('wake', [], [to('hall')]), name: 'Wake' }
const levels = [wake, hub('hall', [], [to('wake')]), ...['m1', 'm2', 'f1', 'f2', 'w1', 'w2'].map(id => course(id))]
const others = levels.filter(level => level.id !== 'hall')
const campaign = overrides => parseCampaign({ version: 1, opening: 'wake', concourse: 'hall', wings: [
  { id: 'movement', name: 'Movement', courses: ['m1', 'm2'], clearance: null },
  { id: 'freight', name: 'Freight', courses: ['f1', 'f2'] },
  { id: 'water', name: 'Water', courses: ['w1', 'w2'], clearance: { wings: ['freight'], courses: ['m1'], count: 2 } },
], ...overrides })
const progress = (passes, value = campaign()) => facilityProgress(value, id => passes.includes(id))
const doors = wing => wing.doors.map(door => door.state)

test('campaign files decode strictly', () => {
  assert.deepEqual(campaign().wings[2].clearance, { courses: ['m1'], wings: ['freight'], count: 2 })
  assert.equal(campaign().wings[1].clearance, null)
  assert.throws(() => parseCampaign({ version: 2, opening: 'wake', wings: [] }), /Unsupported campaign version/)
  for (const broken of [
    { wings: [] },
    { opening: '' },
    { wings: [{ id: 'Movement', name: 'Movement', courses: ['m1'] }] },
    { wings: [{ id: 'movement', name: ' ', courses: ['m1'] }] },
    { wings: [{ id: 'movement', name: 'Movement', courses: [] }] },
    { wings: [{ id: 'movement', name: 'Movement', courses: ['m1'], clearance: {} }] },
    { wings: [{ id: 'movement', name: 'Movement', courses: ['m1'], clearance: { courses: ['m2'], count: 0 } }] },
  ]) assert.throws(() => campaign(broken), /not a valid campaign/)
})

test('clearance counts each named course once, in campaign order', () => {
  const value = campaign()
  assert.deepEqual(clearanceCourses(value, value.wings[2].clearance), ['m1', 'f1', 'f2'])
  assert.deepEqual(clearanceCourses(value, { courses: ['f2', 'f2'], wings: ['freight'] }), ['f1', 'f2'])
})

test('a valid campaign has no problems', () => {
  assert.deepEqual(campaignProblems(campaign(), levels), [])
})

test('campaign problems name missing levels and levels given two roles', () => {
  const problems = campaignProblems(campaign({ opening: 'gone', wings: [
    { id: 'movement', name: 'Movement', courses: ['m1', 'wake', 'void'] },
    { id: 'freight', name: 'Freight', courses: ['m1', 'f1'], level: 'f1' },
    { id: 'freight', name: 'Freight again', courses: ['f2'] },
  ] }), [...levels, { ...course('flat'), goal: undefined }])
  assert.deepEqual(problems, [
    'The Movement wing lists “Wake”, which is not a timed course.',
    'The Movement wing lists “void”, which is not in the collection.',
    '“m1” is listed as a Movement course and in the Freight wing.',
    'Two wings use the ID “freight”.',
    'The opening level “gone” is not in the collection.',
    'The Freight wing level “f1” is already listed as a Freight course.',
  ])
  assert.deepEqual(campaignProblems(campaign({ wings: [{ id: 'movement', name: 'Movement', courses: ['m1', 'wake'] }] }), levels), [
    'The Movement wing lists “Wake”, which is not a timed course.',
    'The opening level “Wake” is already listed as a Movement course.',
  ])
  assert.deepEqual(campaignProblems(campaign({ opening: 'plain' }), [...levels, course('plain')]), ['The opening level “plain” is not a facility area.'])
})

test('clearance must come from other wings that can open first', () => {
  const problems = campaignProblems(campaign({ wings: [
    { id: 'movement', name: 'Movement', courses: ['m1'], clearance: { courses: ['f1'] } },
    { id: 'freight', name: 'Freight', courses: ['f1', 'f2'], clearance: { wings: ['freight', 'docks'], courses: ['w1'] } },
    { id: 'water', name: 'Water', courses: ['w1', 'w2'], clearance: { courses: ['m1', 'x1'], count: 3 } },
  ] }), levels)
  assert.deepEqual(problems, [
    "The Freight wing's clearance cannot depend on its own courses.",
    "The Freight wing's clearance names an unknown wing, “docks”.",
    "The Water wing's clearance names “x1”, which is not a wing course.",
    "The Water wing's clearance needs 3 courses but names only 1.",
    'The Movement wing can never open: its clearance needs courses that are only behind it.',
    'The Freight wing can never open: its clearance needs courses that are only behind it.',
    'The Water wing can never open: its clearance needs courses that are only behind it.',
  ])
})

test('wing levels need one door per course and bulkheads both ways', () => {
  const door = course => ({ id: `door-${course}`, x: 0, y: 0, course })
  const value = campaign({ wings: [
    { id: 'movement', name: 'Movement', level: 'movement-hub', courses: ['m1', 'm2'] },
    { id: 'freight', name: 'Freight', level: 'freight-hub', courses: ['f1', 'f2'] },
  ] })
  const world = [...others, course('plain'), hub('hall', [], [to('wake'), to('movement-hub'), to('docks'), to('plain')]),
    hub('movement-hub', [door('m1'), door('m1'), door('f1')], [to('hall')]), hub('freight-hub', [door('f2')], []), hub('annex', [], [to('hall'), to('m1')])]
  assert.deepEqual(campaignProblems(value, world), [
    'The Movement wing level has 2 doors for “m1”. Give each course one door.',
    'The Movement wing level has no door for “m2”. Give each course one door.',
    "Level door “door-f1” in the Movement wing leads to “f1”, which is not one of that wing's courses.",
    'The Freight wing level has no door for “f1”. Give each course one door.',
    'The Freight wing level needs a bulkhead to the concourse.',
    'The concourse needs a bulkhead to the Freight wing.',
    // Every facility area in the collection is checked, in the campaign or not.
    'Bulkhead “to-docks” in the concourse leads to “docks”, which is not in the collection.',
    'Bulkhead “to-plain” in the concourse leads to “plain”, which is not a facility area.',
    'Bulkhead “to-m1” in “annex” leads to “m1”, which is not a facility area.',
  ])
  assert.deepEqual(campaignProblems(campaign({ concourse: 'plain' }), [...levels, course('plain')]), ['The concourse level “plain” is not a facility area.'])
})

test('the concourse holds only the dispatch door, and bulkheads join it to the opening', () => {
  const extra = [course('final', 'Ascent I'), course('climb', 'Ascent II'), { ...course('bus', 'Exit'), timing: 'untimed' }]
  const hall = (doors, bulkheads = [to('wake')]) => hub('hall', doors.map(id => ({ id: `door-${id}`, x: 0, y: 0, course: id })), bulkheads)
  const value = campaign({ finalCourse: 'final', escape: ['climb', 'bus'] })
  assert.deepEqual(campaignProblems(value, [...others, ...extra, hall(['final'])]), [])
  assert.deepEqual(campaignProblems(value, [...others, ...extra, hall(['m1'], [])]), [
    'The concourse needs one dispatch door to the final course.',
    'The concourse has level doors. Courses belong in wings; the concourse holds only the dispatch door.',
    'The concourse needs a bulkhead to the opening, “Wake”.',
  ])
  // The opening leads only onto the concourse.
  const opening = { ...hub('wake', [{ id: 'door-m1', x: 0, y: 0, course: 'm1' }], []), name: 'Wake' }
  assert.deepEqual(campaignProblems(value, [opening, ...others.slice(1), ...extra, hall(['final'])]), [
    'The opening has level doors. Courses belong in wings.',
    'The opening, “Wake”, needs a bulkhead to the concourse.',
  ])
})

test('the final course and escape route each have their own role', () => {
  // Without a concourse, nothing needs a dispatch door.
  const world = [...levels, course('final', 'Ascent I'), course('climb', 'Ascent II'), { ...course('bus', 'Exit'), timing: 'untimed' }]
  assert.deepEqual(campaignProblems(campaign({ concourse: undefined, finalCourse: 'final', escape: ['climb', 'bus'] }), world), [])
  assert.deepEqual(campaignProblems(campaign({ concourse: undefined, finalCourse: 'm1', escape: ['gone', 'f1', 'climb'] }), world), [
    'The final course “m1” is already listed as a Movement course.',
    'The escape level “gone” is not in the collection.',
    'The escape level “f1” is already listed as a Freight course.',
  ])
  assert.deepEqual(campaignProblems(campaign({ concourse: undefined, finalCourse: 'bus' }), world), ['The final course “Exit” is not a timed course.'])
  assert.deepEqual(campaign({ escape: undefined }).escape, [])
})

test('wings without clearance open at once; the others wait for theirs', () => {
  const fresh = progress([])
  assert.deepEqual(fresh.wings.map(wing => wing.open), [true, true, false])
  assert.deepEqual(doors(fresh.wings[0]), ['open', 'locked'])
  assert.deepEqual(fresh.wings[2].clearance, { passed: 0, count: 2 })
  assert.equal(courseAvailable(fresh, 'm1'), true)
  assert.equal(courseAvailable(fresh, 'm2'), false)
})

test('clearance opens a wing exactly at its threshold', () => {
  assert.equal(progress(['m1']).wings[2].open, false)
  const opened = progress(['m1', 'f1'])
  assert.equal(opened.wings[2].open, true)
  assert.deepEqual(opened.wings[2].clearance, { passed: 2, count: 2 })
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

test('the evaluation completes when every wing course is passed', () => {
  const all = ['m1', 'm2', 'f1', 'f2', 'w1', 'w2']
  assert.deepEqual([progress(all.slice(0, 4)).passed, progress(all.slice(0, 4)).required], [4, 6])
  assert.equal(progress(all.slice(0, 5)).complete, false)
  assert.equal(progress(all).complete, true)
})

test('the built-in campaign names valid built-in levels', () => {
  const root = new URL('../public/levels/jumping/', import.meta.url)
  const manifest = decodeLevelManifest(readFileSync(new URL('index.json', root), 'utf8'))
  const builtIns = manifest.levels.map(name => decodeLevelFile(readFileSync(new URL(encodeURIComponent(name), root), 'utf8')))
  const value = parseCampaign(JSON.parse(readFileSync(new URL('../public/levels/jumping-campaign.json', import.meta.url), 'utf8')))
  assert.deepEqual(campaignProblems(value, builtIns), [])
  const opening = builtIns.find(level => level.id === value.opening)
  assert.equal(opening.name, 'Orientation')
  assert.equal(isHubLevel(opening), true, 'Orientation is a facility area that opens onto the concourse')
})
