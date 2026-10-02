import { SAVE_KEY } from './stationDefinitions.ts'
import { parseExpedition, SAVE_SCHEMA_VERSION } from './saveMigrations.ts'
import type { Expedition } from './expedition'
import { gameStorage } from '../../accounts/profileStorage.ts'

export const SAVE_BACKUP_KEY = `${SAVE_KEY}-backup`
export const SAVE_RECOVERY_KEY = `${SAVE_KEY}-unreadable`

export type SaveLoadResult =
  | { status: 'missing'; raw: null }
  | { status: 'valid'; raw: string; expedition: Expedition }
  | { status: 'invalid' | 'unsupported'; raw: string }
  | { status: 'storage-unavailable' }

export type SaveWriteResult =
  | { status: 'saved' | 'inactive' }
  | { status: 'blocked' | 'invalid' | 'storage-unavailable'; message: string }

type SaveStorage = Pick<Storage, 'getItem' | 'setItem'>
type StorageProvider = () => SaveStorage
const browserStorage: StorageProvider = () => gameStorage()
const sessionBrowserStorage = (): StorageProvider => { const store = gameStorage(); return () => store }

/** Classify before migrating, including the independently versioned campaign/finale. */
export function parseSave(raw: string | null): SaveLoadResult {
  if (raw === null) return { status: 'missing', raw }
  try {
    const value = JSON.parse(raw)
    const versions = [[value?.version, SAVE_SCHEMA_VERSION], [value?.campaign?.version, 1], [value?.finaleVersion, 2]]
    if (versions.some(([version, supported]) => Number.isInteger(version) && version > supported)) {
      return { status: 'unsupported', raw }
    }
    const expedition = parseExpedition(raw)
    return expedition ? { status: 'valid', raw, expedition } : { status: 'invalid', raw }
  } catch {
    return { status: 'invalid', raw }
  }
}

export function readExpedition(storage: StorageProvider = browserStorage, key = SAVE_KEY): SaveLoadResult {
  try { return parseSave(storage().getItem(key)) }
  catch { return { status: 'storage-unavailable' } }
}

/** Opening a menu is read-only. Only launching, restoring, or confirming New enables writes. */
export function createExpeditionSaveSession(storage: StorageProvider = sessionBrowserStorage()) {
  const load = readExpedition(storage)
  const backup = readExpedition(storage, SAVE_BACKUP_KEY)
  let active = false
  let replace = false
  let expectedRaw = 'raw' in load ? load.raw : undefined

  const save = (state: Expedition): SaveWriteResult => {
    if (!active) return { status: 'inactive' }
    try {
      const raw = JSON.stringify(state)
      if (parseSave(raw).status !== 'valid') {
        return { status: 'invalid', message: 'Progress could not be saved. Your previous save and backup are unchanged.' }
      }
      const store = storage()
      const previousRaw = store.getItem(SAVE_KEY)
      if (!replace && previousRaw !== expectedRaw) {
        return { status: 'blocked', message: 'The saved expedition changed in another tab. Reload before saving; this session has not replaced it.' }
      }
      const previous = parseSave(previousRaw)
      const backupRaw = store.getItem(SAVE_BACKUP_KEY)
      // Archive unreadable bytes before an explicit replacement or recovery.
      // If any protective write fails (including quota errors), leave the slot alone.
      if (previous.status === 'invalid' || previous.status === 'unsupported') {
        store.setItem(SAVE_RECOVERY_KEY, previous.raw)
      }
      if (previous.status === 'valid') {
        if (backupRaw !== previous.raw) store.setItem(SAVE_BACKUP_KEY, previous.raw)
      } else if (parseSave(backupRaw).status !== 'valid') {
        store.setItem(SAVE_BACKUP_KEY, raw)
      }
      store.setItem(SAVE_KEY, raw)
      expectedRaw = raw
      replace = false
      return { status: 'saved' }
    } catch {
      return { status: 'storage-unavailable', message: 'Progress could not be saved. Local storage may be unavailable or full. Keep the game open and try again.' }
    }
  }

  return {
    load,
    backup,
    activate() {
      if (!active && load.status !== 'valid' && !(load.status === 'missing' && backup.status !== 'valid')) return false
      active = true
      return true
    },
    startNew() {
      active = true
      replace = true
    },
    save,
    recoverBackup(): { status: 'recovered'; expedition: Expedition } | { status: 'failed'; message: string } {
      const recovery = readExpedition(storage, SAVE_BACKUP_KEY)
      if (recovery.status !== 'valid') {
        return { status: 'failed', message: 'The backup could not be read. Your saved expedition has not been replaced.' }
      }
      active = true
      replace = true
      const result = save(recovery.expedition)
      if (result.status !== 'saved') {
        // A failed recovery must never enable autosaves of the fresh menu state.
        active = false
        replace = false
        return { status: 'failed', message: 'message' in result ? result.message : 'The backup could not be restored.' }
      }
      return { status: 'recovered', expedition: recovery.expedition }
    },
  }
}
