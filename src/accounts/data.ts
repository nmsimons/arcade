import { SAVE_SLOTS, LEVELS_SLOT, withWorkspaceLock } from './profileStorage.ts'
import type { KeyStorage } from './profileStorage.ts'
import { decodeLevelFile, decodeLevelManifest, isLevelFileName } from '../games/jumping/levelAssets.ts'
import { textBytes, MAX_LEVEL_BYTES, MAX_LEVEL_FILES } from '../games/jumping/levelLimits.ts'

// Keep cloud workspaces bounded, including before JSON.parse. Local disk folders
// retain their existing, larger collection limit.
export const MAX_WORKSPACE_BYTES = 4_000_000
export interface LevelLibrary { files: Record<string, string>; deleted: { id: string; name: string; text: string; at: string }[] }
export interface Workspace { version: 1; slots: Record<string, string>; levels: LevelLibrary }
export const emptyLibrary = (): LevelLibrary => ({ files: {}, deleted: [] })
export const emptyWorkspace = (): Workspace => ({ version: 1, slots: {}, levels: emptyLibrary() })
export function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value) }
export function validateLibrary(value: unknown): LevelLibrary {
  if (!object(value) || !object(value.files) || !Array.isArray(value.deleted) || Object.keys(value.files).filter(name => name !== 'index.json').length + value.deleted.length > MAX_LEVEL_FILES) throw new Error('Invalid account level library.')
  const files: Record<string, string> = {}, ids = new Set<string>()
  for (const [name, text] of Object.entries(value.files)) {
    if (typeof text !== 'string' || textBytes(text) > MAX_LEVEL_BYTES || name.length > 200) throw new Error('Invalid level file.')
    if (name === 'index.json') decodeLevelManifest(text)
    else {
      if (!isLevelFileName(name)) throw new Error('Invalid level filename.')
      const level = decodeLevelFile(text)
      if (ids.has(level.id)) throw new Error('Account levels must have unique IDs.')
      ids.add(level.id)
    }
    files[name] = text
  }
  const deleted = value.deleted.map(item => {
    if (!object(item) || typeof item.id !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(item.id) || typeof item.name !== 'string' || !isLevelFileName(item.name) || item.name.length > 200 || typeof item.text !== 'string' || typeof item.at !== 'string' || !Number.isFinite(Date.parse(item.at))) throw new Error('Invalid deleted level.')
    decodeLevelFile(item.text)
    return { id: item.id, name: item.name, text: item.text, at: item.at }
  })
  if (new Set(deleted.map(item => item.id)).size !== deleted.length) throw new Error('Duplicate deleted level.')
  // A collection imported without an index gets the same filename-order index
  // as a writable local folder. Existing manifests and level bytes are retained.
  if (!files['index.json'] && Object.keys(files).length) files['index.json'] = JSON.stringify({ version: 1, order: 'filename', levels: Object.keys(files).sort() }, null, 2) + '\n'
  return { files, deleted }
}
export function parseWorkspace(text: string): Workspace {
  if (textBytes(text) > MAX_WORKSPACE_BYTES) throw new Error('Account saves and levels must fit within 4 MB.')
  const value: unknown = JSON.parse(text)
  if (!object(value) || value.version !== 1 || !object(value.slots)) throw new Error('Unsupported cloud save format. Existing progress has been kept.')
  const slots: Record<string, string> = {}
  for (const [key, raw] of Object.entries(value.slots)) {
    if (!(SAVE_SLOTS as readonly string[]).includes(key) || typeof raw !== 'string' || textBytes(raw) > MAX_WORKSPACE_BYTES / 2) throw new Error('Invalid saved game data.')
    // Expedition bytes are deliberately preserved, including unsupported saves.
    // The game's existing parser validates/migrates them before gameplay.
    if (key === 'arcade.jumping.times.v1') {
      const times: unknown = JSON.parse(raw)
      if (!object(times) || Object.keys(times).length > 10000 || Object.entries(times).some(([id, time]) => id.length > 400 || typeof time !== 'number' || !Number.isFinite(time) || time < 0)) throw new Error('Invalid personal best times.')
    }
    slots[key] = raw
  }
  return { version: 1, slots, levels: validateLibrary(value.levels) }
}
export function readWorkspace(store: KeyStorage): Workspace {
  const slots = Object.fromEntries(SAVE_SLOTS.flatMap(key => { const raw = store.getItem(key); return raw === null ? [] : [[key, raw]] }))
  return parseWorkspace(JSON.stringify({ version: 1, slots, levels: JSON.parse(store.getItem(LEVELS_SLOT) ?? JSON.stringify(emptyLibrary())) }))
}
/** Refresh the library from its committed transaction before taking a snapshot. */
export const readCurrentWorkspace = (store: KeyStorage) => withWorkspaceLock(store, readWorkspace)
export function serializeWorkspace(data: Workspace) {
  return JSON.stringify({ version: 1, slots: Object.fromEntries(Object.entries(data.slots).sort()), levels: { files: Object.fromEntries(Object.entries(data.levels.files).sort()), deleted: [...data.levels.deleted].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0) } })
}
export async function digest(text: string) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(byte => byte.toString(16).padStart(2, '0')).join('') }

/** Retain a recovery copy before replacing any local data. Roll back partial writes. */
export function replaceWorkspace(store: KeyStorage, data: Workspace, expected: string, beforeWrite: () => void = () => {}) {
  return withWorkspaceLock(store, current => {
    beforeWrite()
    const previous = readWorkspace(current)
    if (serializeWorkspace(previous) !== expected) throw new Error('Progress changed in another tab. Sync again before replacing it.')
    const next = parseWorkspace(serializeWorkspace(data))
    current.setItem('arcade.cloud.recovery.v1', serializeWorkspace(previous))
    try {
      for (const key of SAVE_SLOTS) { if (next.slots[key] === undefined) current.removeItem(key); else current.setItem(key, next.slots[key]) }
      current.setItem(LEVELS_SLOT, JSON.stringify(next.levels))
    } catch {
      try {
        for (const key of SAVE_SLOTS) { if (previous.slots[key] === undefined) current.removeItem(key); else current.setItem(key, previous.slots[key]) }
        current.setItem(LEVELS_SLOT, JSON.stringify(previous.levels))
      } catch { /* The complete pre-restore workspace remains in the recovery slot. */ }
      throw new Error('Browser storage is full or unavailable. A recovery copy was kept; free space before restoring it.')
    }
  })
}
