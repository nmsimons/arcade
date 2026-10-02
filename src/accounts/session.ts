import type { Identity, Login } from './auth.ts'
import { selectProfile } from './profileStorage.ts'
export interface AccountSession { login?: Login; cloudEnabled: boolean; revision: number }
let session: AccountSession = { cloudEnabled: false, revision: 0 }
const subscribers = new Set<() => void>()
const aborters = new Set<AbortController>()
const ACCOUNT_KEY = 'arcade.account.v1'
const SESSION_KEY = 'arcade.microsoft.session.v1'
const GOOGLE_SESSION_KEY = 'arcade.google.session.v1'
interface RememberedSession { id: string; cloudEnabled: boolean; identity?: Identity }
function validIdentity(value: unknown): value is Identity {
  if (!value || typeof value !== 'object') return false
  const identity = value as Partial<Identity>
  return typeof identity.name === 'string' && identity.name.length <= 160 && typeof identity.id === 'string' &&
    (identity.provider === 'google' ? /^[a-zA-Z0-9_-]{1,255}$/.test(identity.id) : identity.provider === 'microsoft' && identity.id.length > 0 && identity.id.length <= 1024)
}
function storedAccount(storage: 'localStorage' | 'sessionStorage'): RememberedSession | undefined {
  try {
    const value = JSON.parse(window[storage].getItem(ACCOUNT_KEY) || 'null')
    if (validIdentity(value?.identity) && typeof value.cloudEnabled === 'boolean') return { id: value.identity.id, identity: value.identity, cloudEnabled: value.cloudEnabled }
  } catch { /* Storage may be disabled or contain an invalid record. */ }
}
function rememberedSession(): RememberedSession | undefined {
  const account = storedAccount('localStorage') ?? storedAccount('sessionStorage')
  if (account) return account
  // Upgrade existing tab-scoped sign-ins on their next successful restoration.
  try {
    const google = JSON.parse(window.sessionStorage.getItem(GOOGLE_SESSION_KEY) || 'null')
    if (validIdentity(google?.identity) && google.identity.provider === 'google' && typeof google.cloudEnabled === 'boolean') return { id: google.identity.id, identity: google.identity, cloudEnabled: google.cloudEnabled }
    const value = JSON.parse(window.sessionStorage.getItem(SESSION_KEY) || 'null')
    if (value && typeof value.id === 'string' && value.id.length > 0 && value.id.length <= 1024 && typeof value.cloudEnabled === 'boolean') return { id: value.id, cloudEnabled: value.cloudEnabled }
  } catch { /* Storage may be disabled; sign-in still works for this page. */ }
}
export const hasRememberedAccount = () => !!rememberedSession()
function rememberSession() {
  const value = session.login ? JSON.stringify({ identity: session.login.identity, cloudEnabled: session.cloudEnabled }) : undefined
  let persisted = false
  try {
    if (value) window.localStorage.setItem(ACCOUNT_KEY, value)
    else window.localStorage.removeItem(ACCOUNT_KEY)
    persisted = true
  } catch { /* Fall back to this tab when persistent storage is unavailable. */ }
  try {
    if (value && !persisted) window.sessionStorage.setItem(ACCOUNT_KEY, value)
    else window.sessionStorage.removeItem(ACCOUNT_KEY)
    window.sessionStorage.removeItem(SESSION_KEY)
    window.sessionStorage.removeItem(GOOGLE_SESSION_KEY)
  } catch { /* Keep the current session usable when browser storage is unavailable. */ }
}
export const getSession = () => session
export const subscribeSession = (listener: () => void) => { subscribers.add(listener); return () => { subscribers.delete(listener) } }
function publish(next: Omit<AccountSession, 'revision'>) { session = { ...next, revision: session.revision + 1 }; rememberSession(); subscribers.forEach(fn => fn()) }
let restoring: Promise<void> | undefined
/** Startup waits for this before mounting a game, so saves never bind to a guest slot first. */
export function restoreSession(): Promise<void> {
  if (restoring) return restoring
  const remembered = rememberedSession(), revision = session.revision
  if (!remembered || session.login) return Promise.resolve()
  restoring = (async () => {
    const { restoreMicrosoftLogin, restoreGoogleLogin } = await import('./auth')
    const login = remembered.identity?.provider === 'google' ? restoreGoogleLogin(remembered.identity, remembered.cloudEnabled) : await restoreMicrosoftLogin(remembered.id, remembered.cloudEnabled, remembered.identity)
    if (session.revision !== revision) return
    if (!login) throw new Error('Your saved Microsoft sign-in is no longer available. Return to the arcade to sign in again.')
    abortOperations(); selectProfile(`${login.identity.provider}:${login.identity.id}`)
    publish({ login, cloudEnabled: remembered.cloudEnabled })
  })().finally(() => { restoring = undefined })
  return restoring
}
export function setLogin(login: Login) {
  abortOperations()
  selectProfile(`${login.identity.provider}:${login.identity.id}`)
  publish({ login, cloudEnabled: false })
}
export function enableCloud() { if (session.login) publish({ login: session.login, cloudEnabled: true }) }
export function abortOperations() { aborters.forEach(controller => controller.abort()); aborters.clear() }
export function operation() {
  const controller = new AbortController(); aborters.add(controller)
  return { controller, release: () => aborters.delete(controller) }
}
export function disconnectCloud() { abortOperations(); session.login?.disconnect(); publish({ login: session.login, cloudEnabled: false }) }
export async function leaveAccount() {
  const login = session.login
  abortOperations(); selectProfile(''); publish({ cloudEnabled: false })
  await login?.signOut()
}
