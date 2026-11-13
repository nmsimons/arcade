import test from 'node:test'
import assert from 'node:assert/strict'
import { releaseCertificate } from '../src/games/jumping/releaseCertificate.ts'
import { gameReleased } from '../src/games/jumping/facility.ts'
import { blankTrial } from '../src/games/jumping/level.ts'

/** A wing of passed courses with the given grades (null for an untimed course), each best time 10 s. */
const wing = (grades, extra = []) => ({ id: 'w', name: 'Wing', open: true, passed: grades.length, courses: [
  ...grades.map((grade, i) => ({ state: 'passed', id: `c${i}`, name: `Course ${i}`, best: grade ? 10 : null, grade, deadline: null })), ...extra] })
const certificate = (grades, extra) => releaseCertificate({ passed: grades.length, required: grades.length + (extra?.length ?? 0), wings: [wing(grades, extra)] })

test('the release certificate rates the unit from its best course grades', () => {
  assert.equal(certificate(['A', 'A', 'A']).rating, 'Exemplary', 'an A on every graded course')
  assert.equal(certificate(['A', 'A', 'A', 'B']).rating, 'Distinguished')
  assert.equal(certificate(['A', 'B', 'B', 'C']).rating, 'Commendable')
  assert.equal(certificate(['B', 'C', 'C', 'D']).rating, 'Proficient')
  assert.equal(certificate(['C', 'D', 'D', 'D']).rating, 'Satisfactory')
  // Untimed courses pass without a grade and leave the rating to the graded ones.
  assert.equal(certificate(['A', null, 'A']).rating, 'Exemplary')
})

test('the release certificate tallies the grades, courses and best times behind the rating', () => {
  const open = { state: 'open', id: 'o', name: 'Open', best: null, grade: null, deadline: 30 }
  const result = certificate(['A', 'B', 'B', null], [open, { state: 'locked' }])
  assert.deepEqual(result.grades, { A: 1, B: 2, C: 0, D: 0 })
  assert.equal(result.passed, 4); assert.equal(result.required, 6)
  assert.equal(result.total, 30, 'the sum of best times on passed, timed courses')
  assert.equal(certificate([null]).total, null, 'no time when no passed course has one')
})

test('the game is released once a level that ends it has been completed', () => {
  const exit = { ...blankTrial(), id: 'exit', timing: 'untimed', goal: { kind: 'bus', x: 1500, y: 920 } }
  const course = { ...blankTrial(), id: 'course' }
  const levels = new Map([[exit.id, exit], [course.id, course]])
  assert.equal(gameReleased(levels, id => id === 'course'), false)
  assert.equal(gameReleased(levels, id => id === 'exit'), true)
})
