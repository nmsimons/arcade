import type { Login } from './auth.ts'
import { selectProfile } from './profileStorage.ts'
export interface AccountSession { login?: Login; cloudEnabled: boolean; revision: number }
let session: AccountSession = { cloudEnabled: false, revision: 0 }
const subscribers = new Set<() => void>()
const aborters = new Set<AbortController>()
export const getSession = () => session
export const subscribeSession = (listener: () => void) => { subscribers.add(listener); return () => { subscribers.delete(listener) } }
function publish(next: Omit<AccountSession, 'revision'>) { session = { ...next, revision: session.revision + 1 }; subscribers.forEach(fn => fn()) }
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
