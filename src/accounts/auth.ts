import type { AccountInfo, IPublicClientApplication } from '@azure/msal-browser'

export type Provider = 'google' | 'microsoft'
export interface Identity { provider: Provider; id: string; name: string }
export interface Login {
  identity: Identity
  authorize(): Promise<void>
  token(): Promise<string>
  disconnect(): void
  signOut(): Promise<void>
}
export const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata'
export const MICROSOFT_SCOPE = 'Files.ReadWrite.AppFolder'
const googleId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim()
const microsoftId = import.meta.env.VITE_MICROSOFT_CLIENT_ID?.trim()
export const configured = { google: !!googleId, microsoft: !!microsoftId }
const reconnect = () => new Error('Cloud access expired or was revoked. Reconnect to continue; your local progress is safe.')

interface GoogleResponse { access_token: string; expires_in: number; scope: string; error?: string }
interface GoogleSDK {
  accounts: { oauth2: {
    initTokenClient(options: { client_id: string; scope: string; include_granted_scopes: boolean; prompt: string; login_hint?: string; callback: (response: GoogleResponse) => void; error_callback: () => void }): { requestAccessToken(): void }
    hasGrantedAllScopes(response: GoogleResponse, ...scopes: string[]): boolean
  } }
}
let googleLoad: Promise<GoogleSDK> | undefined
let microsoftLoad: Promise<IPublicClientApplication> | undefined
let microsoft: IPublicClientApplication | undefined
let google: GoogleSDK | undefined
export function prepareAuth(provider: Provider): Promise<unknown> {
  if (!configured[provider]) return Promise.reject(new Error('This sign-in provider has not been configured.'))
  if (provider === 'microsoft') {
    microsoftLoad ??= import('@azure/msal-browser').then(async ({ PublicClientApplication, BrowserCacheLocation }) => {
      const app = new PublicClientApplication({
        auth: { clientId: microsoftId!, authority: 'https://login.microsoftonline.com/consumers', redirectUri: new URL(`${import.meta.env.BASE_URL}auth-redirect.html`, location.origin).href },
        cache: { cacheLocation: BrowserCacheLocation.MemoryStorage },
        system: { loggerOptions: { piiLoggingEnabled: false, loggerCallback: () => {} } },
      })
      await app.initialize(); microsoft = app; return app
    }).catch(error => { microsoftLoad = undefined; throw error })
    return microsoftLoad
  }
  googleLoad ??= new Promise<GoogleSDK>((resolve, reject) => {
    const script = document.createElement('script')
    const timer = window.setTimeout(() => fail(), 15000)
    const fail = () => { clearTimeout(timer); script.remove(); reject(new Error('Google sign-in could not load. Check your connection and try again.')) }
    script.src = 'https://accounts.google.com/gsi/client'; script.async = true; script.referrerPolicy = 'no-referrer'
    script.onerror = fail
    script.onload = () => {
      clearTimeout(timer)
      const sdk = (window as Window & { google?: GoogleSDK }).google
      if (!sdk?.accounts.oauth2) { fail(); return }
      google = sdk; resolve(sdk)
    }
    document.head.append(script)
  }).catch(error => { googleLoad = undefined; throw error })
  return googleLoad
}

function googleToken(storage: boolean, subject?: string) {
  if (!google) throw new Error('Google sign-in is still loading.')
  const sdk = google
  return new Promise<GoogleResponse>((resolve, reject) => {
    let done = false
    const timer = window.setTimeout(() => finish(undefined), 120000)
    function finish(response: GoogleResponse | undefined) {
      if (done) return
      done = true; clearTimeout(timer)
      if (!response || response.error || !response.access_token || !sdk.accounts.oauth2.hasGrantedAllScopes(response, 'openid', ...(storage ? [GOOGLE_SCOPE] : []))) reject(new Error('Sign-in or requested access was not completed. You can keep playing locally.'))
      else resolve(response)
    }
    sdk.accounts.oauth2.initTokenClient({ client_id: googleId!, scope: `openid profile email${storage ? ` ${GOOGLE_SCOPE}` : ''}`, include_granted_scopes: false,
      prompt: subject ? '' : 'select_account', login_hint: subject, callback: finish, error_callback: () => finish(undefined),
    }).requestAccessToken()
  })
}
async function googleIdentity(token: string): Promise<Identity> {
  const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${token}` }, credentials: 'omit', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error('Could not verify the Google account.')
  const value = await response.json()
  if (typeof value.sub !== 'string' || !/^[a-zA-Z0-9_-]{1,255}$/.test(value.sub)) throw new Error('Invalid Google identity.')
  return { provider: 'google', id: value.sub, name: String(value.name || value.email || 'Google player').slice(0, 160) }
}
function microsoftIdentity(account: AccountInfo): Identity {
  if (!account.homeAccountId || account.tenantId !== '9188040d-6c67-4c5b-b112-36a304b66dad') throw new Error('Use a personal Microsoft account for this arcade.')
  return { provider: 'microsoft', id: account.homeAccountId, name: (account.name || account.username || 'Microsoft player').slice(0, 160) }
}
/** Called directly by a click after prepareAuth, preserving popup activation. */
export async function signIn(provider: Provider): Promise<Login> {
  let live = true, cloud = false
  if (provider === 'google') {
    const response = await googleToken(false)
    const identity = await googleIdentity(response.access_token)
    let access = '', expires = 0
    return {
      identity,
      async authorize() {
        if (!live) throw reconnect()
        const next = await googleToken(true, identity.id)
        const actual = await googleIdentity(next.access_token)
        if (!live || actual.id !== identity.id) throw new Error('The account changed. Sign out before connecting a different account.')
        access = next.access_token; expires = Date.now() + Math.max(0, Math.min(Number(next.expires_in) || 0, 3600) - 60) * 1000; cloud = true
      },
      async token() { if (!live || !cloud || !access || Date.now() >= expires) throw reconnect(); return access },
      disconnect() { cloud = false; access = ''; expires = 0 },
      async signOut() { live = false; cloud = false; access = ''; expires = 0 },
    }
  }
  if (!microsoft) throw new Error('Microsoft sign-in is still loading.')
  const app = microsoft
  const result = await app.loginPopup({ scopes: ['openid', 'profile'], prompt: 'select_account' })
  if (!result.account) throw new Error('Microsoft sign-in did not return an account.')
  const account = result.account, identity = microsoftIdentity(account)
  const verify = (next: { account: AccountInfo | null; accessToken: string; scopes: string[] }) => {
    if (!live || !next.account || microsoftIdentity(next.account).id !== identity.id || !next.scopes.some(scope => scope.toLowerCase().endsWith('files.readwrite.appfolder'))) throw reconnect()
    return next.accessToken
  }
  return {
    identity,
    async authorize() { verify(await app.acquireTokenPopup({ scopes: [MICROSOFT_SCOPE], account })); cloud = true },
    async token() {
      if (!live || !cloud) throw reconnect()
      try { return verify(await app.acquireTokenSilent({ scopes: [MICROSOFT_SCOPE], account })) } catch { throw reconnect() }
    },
    disconnect() { cloud = false; void app.clearCache({ account }).catch(() => {}) },
    async signOut() { live = false; cloud = false; await app.clearCache({ account }) },
  }
}
