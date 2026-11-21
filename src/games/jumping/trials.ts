/**
 * The lab's trial log: how each course's tries ended. A try begins when the
 * course clock starts and ends one of three ways. It passes when the course is
 * finished in time, fails once the clock runs past D (whatever happens after,
 * so a fail followed by a restart is one fail), and is restarted when it is
 * abandoned before then, by Restart, by leaving, or by closing the game.
 *
 * The log changes nothing about grades or progress. It makes practice visible:
 * the door placard counts trials, and the release certificate tallies them,
 * with the courses passed on the first try.
 */
export const TRIALS_KEY = 'arcade.jumping.trials.v1'

export type TrialOutcome = 'pass' | 'fail' | 'restart'
export interface TrialRecord {
  passes: number; fails: number; restarts: number
  /** How the first logged try ended. */
  first: TrialOutcome
  /** The try that set the saved best time, counted from 1; null when none has. */
  bestTry: number | null
}

const OUTCOMES: readonly TrialOutcome[] = ['pass', 'fail', 'restart']
const count = (value: unknown) => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 1e9
/** Whether a stored value is a well-formed record, as cloud saves are checked. */
export function isTrialRecord(value: unknown): value is TrialRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return count(record.passes) && count(record.fails) && count(record.restarts) && OUTCOMES.includes(record.first as TrialOutcome)
    && (record.bestTry === null || count(record.bestTry) && (record.bestTry as number) >= 1)
}
export const trialCount = (record: Pick<TrialRecord, 'passes' | 'fails' | 'restarts'>) => record.passes + record.fails + record.restarts

function readAll(storage: Pick<Storage, 'getItem'>): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(TRIALS_KEY) ?? '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch { return {} }
}
export function readTrials(storage: Pick<Storage, 'getItem'>, id: string): TrialRecord | null {
  const record = readAll(storage)[id]
  return isTrialRecord(record) ? record : null
}
/** Log one try's outcome; `newBest` when it set the saved best time. Returns the course's updated record. */
export function recordTrial(storage: Pick<Storage, 'getItem' | 'setItem'>, id: string, outcome: TrialOutcome, newBest = false): TrialRecord {
  const all = readAll(storage), previous = isTrialRecord(all[id]) ? all[id] : null
  const record: TrialRecord = previous ? { ...previous } : { passes: 0, fails: 0, restarts: 0, first: outcome, bestTry: null }
  if (outcome === 'pass') record.passes++; else if (outcome === 'fail') record.fails++; else record.restarts++
  if (newBest) record.bestTry = trialCount(record)
  storage.setItem(TRIALS_KEY, JSON.stringify({ ...all, [id]: record }))
  return record
}
