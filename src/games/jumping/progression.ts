import { gradeFor } from './grading.ts'
import { isPuzzleLevel } from './level.ts'
import type { JumpLevel } from './level.ts'

/** Old completion flags alone cannot turn an over-time finish into a pass. */
export function passedLevel(level: JumpLevel, best: number | null, completed: boolean) {
  return !isPuzzleLevel(level) || (level.timing === 'untimed' ? completed : best !== null && gradeFor(best, level) !== 'F')
}
/** Required levels unlock in catalog order; optional playgrounds never gate it. */
export function unlockedLevels<T extends { fileName: string; level: JumpLevel }>(files: readonly T[], passed: (file: T) => boolean) {
  const unlocked = new Set<string>()
  let available = true
  for (const file of files) {
    if (available) unlocked.add(file.fileName)
    if (isPuzzleLevel(file.level)) available &&= passed(file)
  }
  return unlocked
}
