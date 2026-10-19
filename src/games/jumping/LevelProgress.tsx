import { formatTime, medalFor } from './challenge'
import type { PuzzleLevel } from './level'

export function LevelProgress({ id, level, best, completed = false }: { id: string; level: PuzzleLevel; best: number | null; completed?: boolean }) {
  if (level.timing === 'untimed') return <span id={id} className="jumping-level-progress"><span className="jumping-level-best">Untimed</span><span>{completed ? 'Completed' : 'Not completed'}</span></span>
  const medal = best === null ? null : medalFor(best, level)
  return <span id={id} className="jumping-level-progress">
    <span className="jumping-level-best">{best === null ? 'Best —' : `Best ${formatTime(best)}`}</span>
    <span className="jumping-level-medal">
      {medal && medal !== 'No medal' && <svg className={medal.toLowerCase()} viewBox="0 0 24 32" fill="currentColor" aria-hidden="true"><path d="M5 17 2 32l10-5 10 5-3-15Z" /><circle cx="12" cy="11" r="11" /></svg>}
      {medal === null ? 'No medal yet' : medal === 'No medal' ? 'No medal' : `${medal} medal`}
    </span>
  </span>
}
