import test from 'node:test'
import assert from 'node:assert/strict'
import { isTrialRecord, readTrials, recordTrial, trialCount, TRIALS_KEY } from '../src/games/jumping/trials.ts'
import { courseScreen } from '../src/games/jumping/facility.ts'
import { releaseCertificate } from '../src/games/jumping/releaseCertificate.ts'
import { blankTrial } from '../src/games/jumping/level.ts'
import { parseWorkspace } from '../src/accounts/data.ts'

const storage = () => { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } }

test('the trial log counts how each try ended, and which try set the best time', () => {
  const save = storage()
  assert.equal(readTrials(save, 'c'), null, 'an untried course has no log')
  recordTrial(save, 'c', 'restart'); recordTrial(save, 'c', 'restart')
  recordTrial(save, 'c', 'fail', true)
  const record = recordTrial(save, 'c', 'pass', true)
  assert.deepEqual(record, { passes: 1, fails: 1, restarts: 2, first: 'restart', bestTry: 4 })
  assert.equal(trialCount(record), 4)
  assert.deepEqual(readTrials(save, 'c'), record)
  // A later, slower pass keeps the try that set the best.
  assert.equal(recordTrial(save, 'c', 'pass').bestTry, 4)
  assert.equal(recordTrial(save, 'other', 'pass').first, 'pass', 'each course keeps its own log')
  assert.equal(readTrials(save, 'c').passes, 2)
})

test('an unreadable trial log is replaced, and malformed records are ignored', () => {
  const save = storage()
  save.setItem(TRIALS_KEY, 'not json')
  assert.equal(readTrials(save, 'c'), null)
  assert.deepEqual(recordTrial(save, 'c', 'pass'), { passes: 1, fails: 0, restarts: 0, first: 'pass', bestTry: null })
  save.setItem(TRIALS_KEY, JSON.stringify({ c: { passes: -1, fails: 0, restarts: 0, first: 'pass', bestTry: null } }))
  assert.equal(readTrials(save, 'c'), null)
  assert.equal(isTrialRecord({ passes: 1, fails: 0, restarts: 0, first: 'quit', bestTry: null }), false)
  assert.equal(isTrialRecord({ passes: 1, fails: 0, restarts: 0, first: 'pass', bestTry: 0 }), false, 'tries count from 1')
})

test('a door placard counts the trials run on its course once there are any', () => {
  const course = { ...blankTrial(), id: 'c', times: { a: 30, b: 40, c: 50, d: 60 } }
  const log = { passes: 1, fails: 2, restarts: 11, first: 'restart', bestTry: 14 }
  assert.deepEqual(courseScreen(course, null, false), ['NO RECORD', 'D 1:00'])
  assert.deepEqual(courseScreen(course, null, false, { ...log, passes: 0, fails: 0 }), ['NO RECORD', 'D 1:00', 'TRIALS 11'])
  assert.deepEqual(courseScreen(course, 35, true, log), ['BEST 0:35.00', 'GRADE B', 'TRIALS 14'])
  assert.deepEqual(courseScreen(course, 70, false, log), ['BEST 1:10.00 F', 'D 1:00', 'TRIALS 14'])
  assert.deepEqual(courseScreen({ ...course, timing: 'untimed' }, null, true, log), ['COMPLETE', 'TRIALS 14'])
})

test('the release certificate tallies trials beside the rating, without changing it', () => {
  const passed = (id, grade, trials) => ({ state: 'passed', id, name: id, best: 10, grade, deadline: 60, trials })
  const log = (first, passes, fails, restarts) => ({ passes, fails, restarts, first, bestTry: null })
  const wing = courses => ({ passed: courses.filter(c => c.state === 'passed').length, required: courses.length, wings: [{ id: 'w', name: 'W', open: true, passed: 0, courses }] })
  const clean = releaseCertificate(wing([passed('a', 'A', log('pass', 1, 0, 0)), passed('b', 'A', log('pass', 1, 0, 0))]))
  const ground = releaseCertificate(wing([passed('a', 'A', log('restart', 1, 2, 20)), passed('b', 'A', log('pass', 3, 0, 4)),
    { state: 'open', id: 'c', name: 'c', best: null, grade: null, deadline: 60, trials: log('fail', 0, 3, 5) }]))
  assert.deepEqual(clean.trials, { tries: 2, restarts: 0, fails: 0, firstTry: 2 })
  assert.deepEqual(ground.trials, { tries: 38, restarts: 29, fails: 5, firstTry: 1 }, 'courses not yet passed count their tries too')
  assert.deepEqual([clean.rating, ground.rating], ['Exemplary', 'Exemplary'], 'the rating comes from the grades alone')
  assert.equal(releaseCertificate(wing([passed('a', 'A', null)])).trials, null, 'a save from before the log has no tally')
})

test('cloud saves carry the trial log and refuse a malformed one', () => {
  const parse = raw => parseWorkspace(JSON.stringify({ version: 1, slots: { [TRIALS_KEY]: raw }, levels: { files: {}, deleted: [] } }))
  const good = JSON.stringify({ c: { passes: 1, fails: 0, restarts: 3, first: 'restart', bestTry: 4 } })
  assert.equal(parse(good).slots[TRIALS_KEY], good)
  assert.throws(() => parse(JSON.stringify({ c: { passes: 'many' } })), /Invalid course trials/)
  assert.throws(() => parse('[]'), /Invalid course trials/)
})
