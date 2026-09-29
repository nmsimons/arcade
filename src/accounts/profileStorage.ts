/** Anonymous keys stay unchanged. Account data never shares the anonymous slot. */
export const SAVE_SLOTS = ['hard-vacuum-expedition-v1', 'hard-vacuum-expedition-v1-backup', 'hard-vacuum-expedition-v1-unreadable', 'arcade.jumping.times.v1'] as const
export const LEVELS_SLOT = 'arcade.account.levels.v1'
export type KeyStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
let profile = ''
const listeners = new Set<() => void>()
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
  return {
    getItem: key => scopedStorage(window.localStorage, owner).getItem(key),
    setItem: (key, value) => scopedStorage(window.localStorage, owner).setItem(key, value),
    removeItem: key => scopedStorage(window.localStorage, owner).removeItem(key),
  }
}
