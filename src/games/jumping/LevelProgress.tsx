import { formatTime, gradeFor } from './challenge'
import type { PuzzleLevel } from './level'

export function LevelProgress({ id, level, best, completed = false }: { id: string; level: PuzzleLevel; best: number | null; completed?: boolean }) {
  if (level.timing === 'untimed') return <span id={id} className="jumping-level-progress"><span className="jumping-level-best">Untimed</span><span>{completed ? 'Completed' : 'Not completed'}</span></span>
  const grade = best === null ? null : gradeFor(best, level)
  return <span id={id} className="jumping-level-progress">
    <span className="jumping-level-best">{best === null ? 'Best —' : `Best ${formatTime(best)}`}</span>
    <span className={`jumping-level-grade${grade === 'F' ? ' failed' : ''}`}>
      {grade === null ? 'Not graded' : `Grade ${grade}`}
    </span>
  </span>
}
