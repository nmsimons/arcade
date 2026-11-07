import { getSession } from './session'
/** One account UI and sync lifetime, independent of the current game route. */
export interface AccountSurface { node: HTMLElement; compact: boolean }
const surfaces = new Map<symbol, AccountSurface>()
const listeners = new Set<() => void>()
let surface: AccountSurface | undefined, openRequest = 0, gameRevision = 0
const downloads = new Map<symbol, boolean>()
const drafts = new Set<symbol>()
export const hasUnsavedDraft = () => drafts.size > 0
export function protectUnsavedDraft() { const key = Symbol(); drafts.add(key); return () => { drafts.delete(key) } }
let sync: (() => Promise<void>) | undefined
const publish = () => listeners.forEach(listener => listener())
export const subscribeAccountRuntime = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
export const getAccountSurface = () => surface
export const getAccountOpenRequest = () => openRequest
export const getAccountGameRevision = () => gameRevision
export function restartAccountGame() { gameRevision++; publish() }
export function openAccount() { openRequest++; publish() }
export function registerAccountSurface(value: AccountSurface) {
  const key = Symbol(); surfaces.set(key, value); surface = value; publish()
  return () => { surfaces.delete(key); surface = [...surfaces.values()].at(-1); publish() }
}
export function allowCloudDownloads(allowed: boolean) {
  const key = Symbol(); downloads.set(key, allowed); publish()
  return () => { downloads.delete(key); publish() }
}
export const cloudDownloadsAllowed = () => [...downloads.values()].some(Boolean)
export function registerAccountSync(handler: () => Promise<void>) {
  sync = handler
  return () => { if (sync === handler) sync = undefined }
}
/**
 * The first cloud check of an account's sync. A game that opens straight into play, as L.A.B.'s
 * facility does, waits briefly for it so saves from another device arrive before it reads them.
 */
let cloudChecked = false
const checkWaiters = new Set<() => void>()
/** Called as an account's sync starts; the returned function settles its first check, once. */
export function beginCloudCheck() {
  cloudChecked = false
  let settled = false
  return () => {
    if (settled) return
    settled = true; cloudChecked = true
    for (const waiter of [...checkWaiters]) waiter()
  }
}
/** A synced account's first cloud check has not settled yet. */
export function cloudCheckPending() {
  const { login, cloudEnabled } = getSession()
  return !!login && cloudEnabled && !cloudChecked
}
/** Resolves once the first check settles, at once without cloud saves, and after `timeout` regardless. */
export function waitForCloudCheck(timeout: number) {
  // A synced account whose sync has not started yet still waits, for the check about to begin.
  if (!cloudCheckPending()) return Promise.resolve()
  return new Promise<void>(resolve => {
    const done = () => { clearTimeout(timer); checkWaiters.delete(done); resolve() }
    const timer = setTimeout(done, timeout)
    checkWaiters.add(done)
  })
}
export async function refreshAccountCloud() {
  if (!sync) {
    if (getSession().cloudEnabled) throw new Error('Cloud saves are starting. Try Refresh again in a moment.')
    return
  }
  await sync()
}
