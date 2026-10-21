export type Grade = 'A' | 'B' | 'C' | 'D' | 'F'
export const GRADE_TARGETS = ['a', 'b', 'c', 'd'] as const
export interface GradeTimes { a: number; b: number; c: number; d: number }
/** Read old collections without rewriting their files. New saves use letters. */
export interface LegacyGradeTimes { gold: number; silver: number; bronze: number; d?: number }
export type TimeTargets = GradeTimes | LegacyGradeTimes

export function gradeTimes(level: { times: TimeTargets }): GradeTimes {
  const times = level.times
  return 'a' in times ? times : { a: times.gold, b: times.silver, c: times.bronze,
    d: times.d ?? Math.ceil(times.bronze * 1.5) }
}
export function gradeFor(seconds: number, level: { times: TimeTargets }): Grade {
  const times = gradeTimes(level)
  return seconds <= times.a + 1e-7 ? 'A' : seconds <= times.b + 1e-7 ? 'B' : seconds <= times.c + 1e-7 ? 'C' : seconds <= times.d + 1e-7 ? 'D' : 'F'
}
export function gradeClock(level: { times: TimeTargets }, elapsed: number, failed = false) {
  const grade = failed ? 'F' : gradeFor(elapsed, level)
  return { grade, remaining: grade === 'F' ? 0 : Math.max(0, gradeTimes(level).d - elapsed) }
}
