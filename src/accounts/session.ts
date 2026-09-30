import type { Identity, Login } from './auth.ts'
import { selectProfile } from './profileStorage.ts'
export interface AccountSession { login?: Login; cloudEnabled: boolean; revision: number }
let session: AccountSession = { cloudEnabled: false, revision: 0 }
const subscribers = new Set<() => void>()
const aborters = new Set<AbortController>()
const SESSION_KEY = 'arcade.microsoft.session.v1'
const GOOGLE_SESSION_KEY = 'arcade.google.session.v1'
interface RememberedSession { id: string; cloudEnabled: boolean; identity?: Identity }
function rememberedSession(): RememberedSession | undefined {
  try {
    const google = JSON.parse(window.sessionStorage.getItem(GOOGLE_SESSION_KEY) || 'null')
    if (google?.identity?.provider === 'google' && typeof google.identity.id === 'string' && /^[a-zA-Z0-9_-]{1,255}$/.test(google.identity.id) && typeof google.identity.name === 'string' && google.identity.name.length <= 160 && typeof google.cloudEnabled === 'boolean') return { id: google.identity.id, identity: google.identity, cloudEnabled: google.cloudEnabled }
    const value = JSON.parse(window.sessionStorage.getItem(SESSION_KEY) || 'null')
    if (value && typeof value.id === 'string' && value.id.length > 0 && value.id.length <= 1024 && typeof value.cloudEnabled === 'boolean') return { id: value.id, cloudEnabled: value.cloudEnabled }
  } catch { /* Storage may be disabled; sign-in still works for this page. */ }
}
export const hasRememberedAccount = () => !!rememberedSession()
function rememberSession() {
  try {
    if (session.login?.identity.provider === 'microsoft') window.sessionStorage.setItem(SESSION_KEY, JSON.stringify({ id: session.login.identity.id, cloudEnabled: session.cloudEnabled }))
    else window.sessionStorage.removeItem(SESSION_KEY)
    if (session.login?.identity.provider === 'google') window.sessionStorage.setItem(GOOGLE_SESSION_KEY, JSON.stringify({ identity: session.login.identity, cloudEnabled: session.cloudEnabled }))
    else window.sessionStorage.removeItem(GOOGLE_SESSION_KEY)
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
    const login = remembered.identity ? restoreGoogleLogin(remembered.identity, remembered.cloudEnabled) : await restoreMicrosoftLogin(remembered.id, remembered.cloudEnabled)
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
