import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { blankTrial } from '../src/games/jumping/level.ts'
import { campaignProblems, clearanceCourses, courseAvailable, facilityPassed, facilityProgress, parseCampaign } from '../src/games/jumping/campaign.ts'
import { decodeLevelFile, decodeLevelManifest } from '../src/games/jumping/levelAssets.ts'

const course = (id, name = id) => ({ ...blankTrial(), id, name })
const levels = [{ ...course('wake', 'Wake'), timing: 'untimed' }, ...['i1', 'i2', 'm1', 'm2', 'f1', 'f2', 'w1', 'w2'].map(id => course(id))]
const campaign = overrides => parseCampaign({ version: 1, opening: 'wake', introduction: ['i1', 'i2'], wings: [
  { id: 'movement', name: 'Movement', courses: ['m1', 'm2'], clearance: null },
  { id: 'freight', name: 'Freight', courses: ['f1', 'f2'] },
  { id: 'water', name: 'Water', courses: ['w1', 'w2'], clearance: { wings: ['freight'], courses: ['m1'], count: 2 } },
], ...overrides })
const progress = (passes, value = campaign()) => facilityProgress(value, id => passes.includes(id))
const doors = wing => wing.doors.map(door => door.state)
const introduced = ['wake', 'i1', 'i2']

test('campaign files decode strictly', () => {
  assert.deepEqual(campaign().wings[2].clearance, { courses: ['m1'], wings: ['freight'], count: 2 })
  assert.equal(campaign().wings[1].clearance, null)
  assert.deepEqual(campaign().introduction, ['i1', 'i2'])
  assert.deepEqual(campaign({ introduction: undefined }).introduction, [])
  assert.throws(() => parseCampaign({ version: 2, opening: 'wake', wings: [] }), /Unsupported campaign version/)
  for (const broken of [
    { wings: [] },
    { opening: '' },
    { introduction: [''] },
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
  const problems = campaignProblems(campaign({ opening: 'gone', introduction: ['i1', 'nowhere', 'i1'], wings: [
    { id: 'movement', name: 'Movement', courses: ['m1', 'wake', 'i2', 'void'] },
    { id: 'freight', name: 'Freight', courses: ['m1', 'f1'], level: 'f1' },
    { id: 'freight', name: 'Freight again', courses: ['f2'] },
  ] }), [...levels, { ...course('flat'), goal: undefined }])
  assert.deepEqual(problems, [
    'The opening level “gone” is not in the collection.',
    'The introduction level “nowhere” is not in the collection.',
    'The introduction lists “i1” twice.',
    'The Movement wing lists “Wake”, which is not a timed course.',
    'The Movement wing lists “void”, which is not in the collection.',
    '“m1” is listed as a Movement course and in the Freight wing.',
    'Two wings use the ID “freight”.',
    'The Freight wing level “f1” is already listed as a Freight course.',
  ])
  assert.deepEqual(campaignProblems(campaign({ wings: [{ id: 'movement', name: 'Movement', courses: ['i1', 'wake'] }] }), levels), [
    '“i1” is listed as an introduction level and in the Movement wing.',
    'The Movement wing lists “Wake”, which is not a timed course.',
    '“Wake” is listed as the opening and in the Movement wing.',
  ])
})

test('clearance must come from other wings that can open first', () => {
  const problems = campaignProblems(campaign({ wings: [
    { id: 'movement', name: 'Movement', courses: ['m1'], clearance: { courses: ['f1'] } },
    { id: 'freight', name: 'Freight', courses: ['f1', 'f2'], clearance: { wings: ['freight', 'docks'], courses: ['w1'] } },
    { id: 'water', name: 'Water', courses: ['w1', 'w2'], clearance: { courses: ['m1', 'i1'], count: 3 } },
  ] }), levels)
  assert.deepEqual(problems, [
    "The Freight wing's clearance cannot depend on its own courses.",
    "The Freight wing's clearance names an unknown wing, “docks”.",
    "The Water wing's clearance names “i1”, which is not a wing course.",
    "The Water wing's clearance needs 3 courses but names only 1.",
    'The Movement wing can never open: its clearance needs courses that are only behind it.',
    'The Freight wing can never open: its clearance needs courses that are only behind it.',
    'The Water wing can never open: its clearance needs courses that are only behind it.',
  ])
})

test('wing levels need one door per course and bulkheads both ways', () => {
  const hub = (id, courseDoors, bulkheads) => ({ id, name: id, kind: 'hub', courseDoors, bulkheads })
  const door = course => ({ id: `door-${course}`, x: 0, y: 0, course })
  const to = target => ({ id: `to-${target}`, x: 0, y: 0, to: target })
  const value = campaign({ concourse: 'hall', wings: [
    { id: 'movement', name: 'Movement', level: 'movement-hub', courses: ['m1', 'm2'] },
    { id: 'freight', name: 'Freight', level: 'freight-hub', courses: ['f1', 'f2'] },
  ] })
  const replays = [door('wake'), door('i1'), door('i2')]
  const world = [...levels, course('plain'), hub('hall', replays, [to('movement'), to('docks')]),
    hub('movement-hub', [door('m1'), door('m1'), door('f1')], [to('concourse')]), hub('freight-hub', [door('f2')], [])]
  assert.deepEqual(campaignProblems(value, world), [
    'The Movement wing level has 2 doors for “m1”. Give each course one door.',
    'The Movement wing level has no door for “m2”. Give each course one door.',
    "Course door “door-f1” in the Movement wing leads to “f1”, which is not one of that wing's courses.",
    'The Freight wing level has no door for “f1”. Give each course one door.',
    'The Freight wing level needs a bulkhead to the concourse.',
    'The concourse needs a bulkhead to the Freight wing.',
    'Bulkhead “to-docks” in the concourse leads to an unknown wing, “docks”.',
  ])
  assert.deepEqual(campaignProblems(campaign({ concourse: 'plain' }), world), ['The concourse level “plain” is not a hub level.'])
})

test('the concourse holds doors back into the opening and introduction, and the dispatch door', () => {
  const extra = [course('final', 'Ascent I'), course('climb', 'Ascent II'), { ...course('bus', 'Exit'), timing: 'untimed' }]
  const hall = doors => ({ id: 'hall', name: 'hall', kind: 'hub', courseDoors: doors.map(id => ({ id: `door-${id}`, x: 0, y: 0, course: id })), bulkheads: [] })
  const value = campaign({ concourse: 'hall', finalCourse: 'final', escape: ['climb', 'bus'] })
  assert.deepEqual(campaignProblems(value, [...levels, ...extra, hall(['wake', 'i1', 'i2', 'final'])]), [])
  assert.deepEqual(campaignProblems(value, [...levels, ...extra, hall(['wake', 'i1', 'i1', 'm1'])]), [
    'The concourse needs one door to “i1”.',
    'The concourse needs one door to “i2”.',
    'The concourse needs one dispatch door to the final course.',
    'The concourse has course doors. Courses belong in wings; the concourse holds only the opening, introduction and dispatch doors.',
  ])
})

test('the final course and escape route each have their own role', () => {
  const world = [...levels, course('final', 'Ascent I'), course('climb', 'Ascent II'), { ...course('bus', 'Exit'), timing: 'untimed' }]
  assert.deepEqual(campaignProblems(campaign({ finalCourse: 'final', escape: ['climb', 'bus'] }), world), [])
  assert.deepEqual(campaignProblems(campaign({ finalCourse: 'm1', escape: ['gone', 'f1', 'i1', 'climb'] }), world), [
    'The final course “m1” is already listed as a Movement course.',
    'The escape level “gone” is not in the collection.',
    'The escape level “f1” is already listed as a Freight course.',
    'The escape level “i1” is already listed as an introduction level.',
  ])
  assert.deepEqual(campaignProblems(campaign({ finalCourse: 'bus' }), world), ['The final course “Exit” is not a timed course.'])
  assert.deepEqual(campaign({ escape: undefined }).escape, [])
})

test('a fresh save opens nothing; finishing the introduction opens the concourse and its wings', () => {
  const fresh = progress([])
  assert.equal(fresh.started, false)
  assert.equal(fresh.concourseOpen, false)
  assert.deepEqual(fresh.wings.map(wing => wing.open), [false, false, false])
  const partway = progress(['wake', 'i1'])
  assert.deepEqual(partway.introduction, [true, false])
  assert.equal(partway.concourseOpen, false)
  assert.equal(courseAvailable(partway, 'm1'), false)
  const open = progress(introduced)
  assert.equal(open.concourseOpen, true)
  assert.deepEqual(open.wings.map(wing => wing.open), [true, true, false])
  assert.deepEqual(doors(open.wings[0]), ['open', 'locked'])
  assert.deepEqual(open.wings[2].clearance, { passed: 0, count: 2 })
  assert.equal(courseAvailable(open, 'm1'), true)
  assert.equal(courseAvailable(open, 'm2'), false)
  // An empty introduction opens the concourse with the opening.
  assert.equal(progress(['wake'], campaign({ introduction: [] })).concourseOpen, true)
})

test('clearance opens a wing exactly at its threshold', () => {
  assert.equal(progress([...introduced, 'm1']).wings[2].open, false)
  const opened = progress([...introduced, 'm1', 'f1'])
  assert.equal(opened.wings[2].open, true)
  assert.deepEqual(opened.wings[2].clearance, { passed: 2, count: 2 })
  assert.deepEqual(doors(opened.wings[2]), ['open', 'locked'])
})

test('passes carried over from the level grid keep their doors and open the next one', () => {
  const carried = progress([...introduced, 'f2'])
  assert.deepEqual(doors(carried.wings[1]), ['open', 'passed'])
  assert.equal(courseAvailable(carried, 'f2'), true)
  // A pass behind a closed wing still counts, but its door stays out of reach.
  const behind = progress([...introduced, 'w2'])
  assert.deepEqual(doors(behind.wings[2]), ['locked', 'passed'])
  assert.equal(courseAvailable(behind, 'w2'), false)
  assert.equal(behind.passed, 1)
})

test('the evaluation completes when every wing course is passed; the introduction does not count', () => {
  const all = [...introduced, 'm1', 'm2', 'f1', 'f2', 'w1', 'w2']
  assert.deepEqual([progress(all.slice(0, 7)).passed, progress(all.slice(0, 7)).required], [4, 6])
  assert.equal(progress(all.slice(0, 8)).complete, false)
  assert.equal(progress(all).complete, true)
})

test('introduction levels pass on completion; wing courses still need a time within D', () => {
  const value = campaign(), timed = levels.find(level => level.id === 'i1'), wing = levels.find(level => level.id === 'm1')
  assert.equal(facilityPassed(value, timed, null, true), true)
  assert.equal(facilityPassed(value, timed, null, false), false)
  assert.equal(facilityPassed(value, wing, null, true), false)
  assert.equal(facilityPassed(value, wing, 30, false), true)
})

test('the built-in campaign names valid built-in levels', () => {
  const root = new URL('../public/levels/jumping/', import.meta.url)
  const manifest = decodeLevelManifest(readFileSync(new URL('index.json', root), 'utf8'))
  const builtIns = manifest.levels.map(name => decodeLevelFile(readFileSync(new URL(encodeURIComponent(name), root), 'utf8')))
  const value = parseCampaign(JSON.parse(readFileSync(new URL('../public/levels/jumping-campaign.json', import.meta.url), 'utf8')))
  assert.deepEqual(campaignProblems(value, builtIns), [])
  const name = id => builtIns.find(level => level.id === id)?.name
  assert.equal(name(value.opening), 'Orientation')
  assert.deepEqual(value.introduction, [], 'Orientation holds Wake, the controls hall and Company in one level')
})
