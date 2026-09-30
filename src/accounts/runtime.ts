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
export async function refreshAccountCloud() {
  if (!sync) {
    if (getSession().cloudEnabled) throw new Error('Cloud saves are starting. Try Refresh again in a moment.')
    return
  }
  await sync()
}
