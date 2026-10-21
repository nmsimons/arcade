import { readBest } from './challenge.ts'

export const COMPLETION_KEY = 'arcade.jumping.completed.v1'
type Reader = Pick<Storage, 'getItem'>
/** Retain completion history for untimed levels and older saves. Timed
 * progression additionally checks the saved best against the D deadline. */
export function readCompleted(storage: Reader, id: string): boolean {
  try { if (JSON.parse(storage.getItem(COMPLETION_KEY) ?? '{}')?.[id] === true) return true } catch { /* Retain valid older times. */ }
  return readBest(storage, id) !== null
}
export function saveCompleted(storage: Reader & Pick<Storage, 'setItem'>, id: string) {
  let values: Record<string, unknown> = {}
  try {
    const parsed: unknown = JSON.parse(storage.getItem(COMPLETION_KEY) ?? '{}')
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) values = parsed as Record<string, unknown>
  } catch { /* Replace an unreadable record after a demonstrated completion. */ }
  storage.setItem(COMPLETION_KEY, JSON.stringify({ ...values, [id]: true }))
}
