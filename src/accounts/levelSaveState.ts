/** Transient sync state complements the durable, per-file confirmation hashes. */
export type LevelSyncActivity = 'idle' | 'checking' | 'uploading' | 'waiting' | 'attention'
const activity = new Map<string, LevelSyncActivity>()
const listeners = new Set<() => void>()
export const getLevelSyncActivity = (owner: string) => activity.get(owner) ?? 'idle'
export function setLevelSyncActivity(owner: string, next: LevelSyncActivity) {
  if (getLevelSyncActivity(owner) === next) return
  activity.set(owner, next); listeners.forEach(listener => listener())
}
export const subscribeLevelSyncActivity = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
export function confirmedLevelHash(baseline: string | null, fileName: string): string | undefined {
  try {
    const hash = JSON.parse(baseline ?? 'null')?.files?.[fileName]
    if (typeof hash === 'string' && /^[0-9a-f]{64}$/.test(hash)) return hash
  } catch { /* Missing/damaged confirmation cannot claim that a file is synced. */ }
}
export type LevelSaveState = 'unsaved' | 'saving' | 'local' | 'pending' | 'syncing' | 'synced' | 'attention'
export function levelSaveState({ dirty = false, saving = false, connected, confirmed, activity }: {
  dirty?: boolean; saving?: boolean; connected: boolean; confirmed: boolean; activity: LevelSyncActivity
}): LevelSaveState {
  if (saving) return 'saving'
  if (dirty) return 'unsaved'
  if (!connected) return 'local'
  if (activity === 'attention') return 'attention'
  if (confirmed) return 'synced'
  if (activity === 'uploading') return 'syncing'
  return 'pending'
}
