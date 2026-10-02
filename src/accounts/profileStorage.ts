import { transactLibrary } from './workspaceStorage.ts'
import { getPlatform } from '../platform/runtime.ts'
import type { KeyStorage } from '../platform/contracts.ts'
export type { KeyStorage } from '../platform/contracts.ts'

/** Anonymous keys stay unchanged. Account data never shares the anonymous slot. */
export const SAVE_SLOTS = ['hard-vacuum-expedition-v1', 'hard-vacuum-expedition-v1-backup', 'hard-vacuum-expedition-v1-unreadable', 'arcade.jumping.times.v1'] as const
export const LEVELS_SLOT = 'arcade.account.levels.v1'
export const CLOUD_BASELINE_SLOT = 'arcade.cloud.baseline.v2'
const writes = new WeakMap<KeyStorage, Promise<unknown>>()
/** Short read/modify/write transactions; never hold this lock over cloud I/O. */
export async function withWorkspaceLock<T>(store: KeyStorage, work: (current: KeyStorage) => T): Promise<T> {
  if (store.workspaceLock) {
    if (!globalThis.navigator?.locks) return Promise.reject(new Error('Account saves aren’t available in this browser. Try a different browser or use a local folder.'))
    return navigator.locks.request(store.workspaceLock, () => transactLibrary(store, LEVELS_SLOT, work))
  }
  // Non-browser stores (including tests) share a queue by storage identity.
  const next = (writes.get(store) ?? Promise.resolve()).catch(() => {}).then(() => work(store))
  writes.set(store, next)
  return next
}
let profile = ''
const listeners = new Set<() => void>()
const storageListeners = new Set<() => void>()
export function subscribeGameStorage(listener: () => void) {
  storageListeners.add(listener)
  window.addEventListener('storage', listener)
  return () => { storageListeners.delete(listener); window.removeEventListener('storage', listener) }
}
export const currentProfile = () => profile
export function selectProfile(next: string) { profile = next; listeners.forEach(listener => listener()) }
export function subscribeProfile(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } }
export const profileKey = (owner: string, key: string) => owner ? `arcade.player.${encodeURIComponent(owner)}.${key}` : key
export function scopedStorage(store: KeyStorage, owner: string): KeyStorage {
  return {
    getItem: key => store.getItem(profileKey(owner, key)),
    setItem: (key, value) => store.setItem(profileKey(owner, key), value),
    removeItem: key => store.removeItem(profileKey(owner, key)),
  }
}
/** Capture an owner once per game session, never redirect a running game's writes. */
export function gameStorage(owner = profile): KeyStorage {
  const platform = getPlatform()
  const store = () => scopedStorage(platform.storage(), owner)
  return {
    ...(platform.kind === 'web' ? { workspaceLock: `arcade-workspace:${owner}` } : {}),
    getItem: key => store().getItem(key),
    setItem: (key, value) => { store().setItem(key, value); storageListeners.forEach(listener => listener()) },
    removeItem: key => { store().removeItem(key); storageListeners.forEach(listener => listener()) },
  }
}
