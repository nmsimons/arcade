import type { Grade } from './grading'
import type { WingRecord } from './facility'
import { trialCount } from './trials.ts'

/** A passed course's grade. Untimed courses pass without one. */
type CourseGrade = Exclude<Grade, 'F'>
export const RELEASE_GRADES: readonly CourseGrade[] = ['A', 'B', 'C', 'D']

/**
 * The robot's release certificate, earned by finishing the game: how it was
 * rated, from its best grade on each course, with the tallies behind that. It is
 * derived from the saved course records, so it improves as they do and a
 * restart erases it with them. The trial log (`trials.ts`) is reported beside
 * the rating and never changes it.
 */
export interface ReleaseCertificate {
  rating: string
  passed: number
  required: number
  grades: Record<CourseGrade, number>
  /** The sum of the best times on every passed course with a time, in seconds; null when there are none. */
  total: number | null
  /** The lab's trial log across the courses, null when none was kept, as for a save from before it. */
  trials: TrialTally | null
}
export interface TrialTally {
  tries: number; restarts: number; fails: number
  /** Passed courses whose first logged try passed. */
  firstTry: number
}

const points: Record<CourseGrade, number> = { A: 4, B: 3, C: 2, D: 1 }
/** Ratings from the average grade, A = 4 to D = 1: Exemplary needs an A on every graded course. */
const ratings: [number, string][] = [[3.5, 'Distinguished'], [3, 'Commendable'], [2, 'Proficient'], [0, 'Satisfactory']]

export function releaseCertificate(progress: { passed: number; required: number; wings: readonly WingRecord[] }): ReleaseCertificate {
  const grades: Record<CourseGrade, number> = { A: 0, B: 0, C: 0, D: 0 }
  let total: number | null = null, graded = 0, sum = 0, trials: TrialTally | null = null
  // Optional wings are extra challenges: they never change the rating, the tallies or the trial log.
  for (const wing of progress.wings) if (!wing.optional) for (const course of wing.courses) {
    if (course.state === 'locked') continue
    const log = course.trials ?? null
    if (log && trialCount(log)) {
      trials ??= { tries: 0, restarts: 0, fails: 0, firstTry: 0 }
      trials.tries += trialCount(log); trials.restarts += log.restarts; trials.fails += log.fails
      if (course.state === 'passed' && log.first === 'pass') trials.firstTry++
    }
    if (course.state !== 'passed') continue
    if (course.grade && course.grade !== 'F') { grades[course.grade]++; graded++; sum += points[course.grade] }
    if (course.best !== null) total = (total ?? 0) + course.best
  }
  const average = graded ? sum / graded : 0
  const rating = graded && grades.A === graded ? 'Exemplary' : ratings.find(([floor]) => average >= floor)![1]
  return { rating, passed: progress.passed, required: progress.required, grades, total, trials }
}
