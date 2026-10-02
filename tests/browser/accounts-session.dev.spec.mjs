import { test, expect } from './helpers/test.mjs'
import { oneDrive } from '../helpers/oneDrive.mjs'
import { useLevelFixtures } from './helpers/jumpingLevels.mjs'
import { FIRST_LEVEL } from '../helpers/jumping-fixtures.mjs'
import { newBrowserSession } from './helpers/accountSession.mjs'

const SESSION_KEY = 'arcade.microsoft.session.v1'
const ACCOUNT_KEY = 'arcade.account.v1'
const tenant = '9188040d-6c67-4c5b-b112-36a304b66dad'
const alice = `alice.${tenant}`

async function microsoftProviders(page, context, drive = oneDrive({ downloadOrigin: 'https://my.microsoftpersonalcontent.com' })) {
  const handle = async route => {
    const request = route.request()
    const response = await drive.fetch(request.url(), { method: request.method(), headers: request.headers(), body: request.postData() ?? undefined })
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() })
  }
  await page.route('https://graph.microsoft.com/**', handle)
  await page.route('https://my.microsoftpersonalcontent.com/**', handle)
  await page.route('https://accounts.google.com/**', route => route.abort())
  const authority = 'https://login.microsoftonline.com/consumers'
  await context.route('https://login.microsoftonline.com/**', route => {
    const url = new URL(route.request().url())
    if (url.pathname.includes('/discovery/instance')) return route.fulfill({ json: {
      tenant_discovery_endpoint: authority + '/v2.0/.well-known/openid-configuration',
      metadata: [{ preferred_network: 'login.microsoftonline.com', preferred_cache: 'login.windows.net', aliases: ['login.microsoftonline.com', 'login.windows.net', 'sts.windows.net'] }],
    } })
    if (url.pathname.includes('.well-known')) return route.fulfill({ json: {
      authorization_endpoint: authority + '/oauth2/v2.0/authorize', token_endpoint: authority + '/oauth2/v2.0/token',
      end_session_endpoint: authority + '/oauth2/v2.0/logout', issuer: 'https://login.microsoftonline.com/{tenantid}/v2.0',
      jwks_uri: authority + '/discovery/v2.0/keys',
    } })
    return route.fulfill({ status: 400, json: { error: 'interaction_required', error_description: 'Test requires reconnection.' } })
  })
  return drive
}

async function microsoftCache(page, legacy = false) {
  await page.evaluate(async ({ tenant, legacy }) => {
    const { prepareAuth } = await import('/src/accounts/auth.ts')
    let app
    if (legacy) {
      const { PublicClientApplication } = await import('/node_modules/.vite/deps/@azure_msal-browser.js')
      app = new PublicClientApplication({ auth: { clientId: '00000000-0000-4000-8000-000000000001', authority: 'https://login.microsoftonline.com/consumers' }, cache: { cacheLocation: 'sessionStorage' } })
      await app.initialize()
    } else app = await prepareAuth('microsoft')
    // Populate the real MSAL cache using its public API; popup responses alone
    // are stubbed. Reloads run a new SDK instance with no method overrides.
    async function response(id, scopes) {
      const now = Math.floor(Date.now() / 1000)
      const claims = { aud: '00000000-0000-4000-8000-000000000001', iss: `https://login.microsoftonline.com/${tenant}/v2.0`, tid: tenant, oid: id, sub: id, name: `${id === 'alice' ? 'Alice' : 'Bob'} Microsoft`, preferred_username: `${id}@example.test`, iat: now, exp: now + 3600 }
      const encode = value => btoa(JSON.stringify(value)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
      const account = { homeAccountId: `${id}.${tenant}`, localAccountId: id, environment: 'login.windows.net', tenantId: tenant, username: claims.preferred_username, name: claims.name, idTokenClaims: claims }
      const result = { authority: 'https://login.microsoftonline.com/consumers', uniqueId: id, tenantId: tenant, scopes, account, idToken: `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode(claims)}.test`, idTokenClaims: claims, accessToken: `${id}-cached-token`, fromCache: false, expiresOn: new Date(Date.now() + 3600000), extExpiresOn: new Date(Date.now() + 3600000), tokenType: 'Bearer', correlationId: crypto.randomUUID() }
      await app.hydrateCache(result, { scopes, account })
      return result
    }
    // The first cached account is deliberately not the one selected in Arcade.
    await response('bob', ['openid', 'profile'])
    if (legacy) await response('alice', ['openid', 'profile'])
    app.loginPopup = () => response('alice', ['openid', 'profile'])
    app.acquireTokenPopup = () => response('alice', ['Files.ReadWrite.AppFolder'])
  }, { tenant, legacy })
}

async function microsoftSession(page, context) {
  const drive = await microsoftProviders(page, context)
  await page.goto('/')
  await microsoftCache(page)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByRole('button', { name: 'Sign in with Microsoft', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Alice Microsoft' })).toBeVisible()
  return drive
}

test('Microsoft refresh restores the selected account and consent; disconnect and sign-out stay effective', async ({ page, context }) => {
  await microsoftSession(page, context)
  await page.getByRole('button', { name: 'Connect OneDrive', exact: true }).click()
  await expect(page.locator('.account-status')).toContainText('Synced with OneDrive')
  await page.reload()
  await expect(page.getByRole('button', { name: 'Alice Microsoft', exact: true })).toBeVisible()
  await expect(page.locator('.arcade-account-bar')).toContainText('Saved to OneDrive')
  expect(context.pages()).toHaveLength(1)
  expect(await page.evaluate(() => Object.values(localStorage).join(' '))).not.toContain('alice-cached-token')
  await page.getByRole('button', { name: 'Alice Microsoft', exact: true }).click()
  await page.getByRole('button', { name: 'Account settings', exact: true }).click()
  await page.getByRole('button', { name: 'Disconnect cloud', exact: true }).click()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Alice Microsoft', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Alice Microsoft', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Connect OneDrive', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Account settings', exact: true }).click()
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Play anywhere' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  expect(await page.evaluate(key => sessionStorage.getItem(key), SESSION_KEY)).toBeNull()
  expect(await page.evaluate(key => localStorage.getItem(key), ACCOUNT_KEY)).toBeNull()
  // Bob's cache is still present, but does not silently sign the user back in.
  const accounts = await page.evaluate(async () => (await (await import('/src/accounts/auth.ts')).prepareAuth('microsoft')).getAllAccounts().map(account => account.homeAccountId))
  expect(accounts).not.toContain(alice)
  expect(accounts).toContain(`bob.${tenant}`)
})

test('refreshing a game restores its save owner before mounting, without granting cloud access', async ({ page, context }) => {
  await microsoftSession(page, context)
  await useLevelFixtures(page, [FIRST_LEVEL])
  await page.goto('/untitled-jumping-game/levels/built-in/00-fixture.json')
  await expect(page.locator('.jumping-game > canvas')).toBeFocused()
  await page.reload()
  await expect(page.locator('.jumping-game > canvas')).toBeFocused()
  const owner = await page.evaluate(async () => {
    const { currentProfile } = await import('/src/accounts/profileStorage.ts')
    const { getSession } = await import('/src/accounts/session.ts')
    return { profile: currentProfile(), cloud: getSession().cloudEnabled }
  })
  expect(owner).toEqual({ profile: `microsoft:${alice}`, cloud: false })
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Level menu', exact: true }).click()
  await page.getByRole('button', { name: 'Account levels', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Refresh account levels' })).toBeVisible()
  expect(context.pages()).toHaveLength(1)
})

test('a missing cached account blocks game startup and offers recovery without selecting another account', async ({ page, context }) => {
  await microsoftSession(page, context)
  await page.evaluate(({ account, legacy }) => {
    localStorage.removeItem(account)
    sessionStorage.setItem(legacy, JSON.stringify({ id: 'missing-account', cloudEnabled: true }))
  }, { account: ACCOUNT_KEY, legacy: SESSION_KEY })
  await page.goto('/untitled-jumping-game')
  await expect(page.getByRole('status')).toHaveText('Your account couldn’t be restored')
  await expect(page.locator('.jumping-game')).toHaveCount(0)
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Your account couldn’t be restored')
  await page.getByRole('button', { name: 'Back to arcade', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  expect(await page.evaluate(key => sessionStorage.getItem(key), SESSION_KEY)).toBeNull()
})

test('a fresh tab restores Microsoft and silently syncs the selected account', async ({ page, context }) => {
  const drive = await microsoftSession(page, context)
  await page.getByRole('button', { name: 'Connect OneDrive', exact: true }).click()
  await expect(page.locator('.account-status')).toContainText('Synced with OneDrive')
  await page.close()
  const next = await context.newPage()
  await microsoftProviders(next, context, drive)
  await next.goto('/')
  await expect(next.getByRole('button', { name: 'Alice Microsoft', exact: true })).toBeVisible()
  await expect(next.locator('.arcade-account-bar')).toContainText('Saved to OneDrive')
  expect(await next.evaluate(() => sessionStorage.length)).toBe(0)
  expect(context.pages()).toHaveLength(1)
})

test('Microsoft stays signed in after browser credentials expire and reconnects only the same account', async ({ page, context, browser }, testInfo) => {
  test.setTimeout(90_000)
  const drive = await microsoftSession(page, context)
  await page.evaluate(async () => (await import('/src/accounts/profileStorage.ts')).gameStorage().setItem('arcade.jumping.times.v1', '{"Tower":123}'))
  await page.getByRole('button', { name: 'Connect OneDrive', exact: true }).click()
  await expect(page.locator('.account-status')).toContainText('Synced with OneDrive')
  const before = drive.requests.length
  let reopened = await newBrowserSession(browser, context, testInfo)
  try {
    const next = await reopened.newPage()
    await microsoftProviders(next, reopened, drive)
    await next.goto('/untitled-jumping-game')
    await expect(next.getByRole('button', { name: 'Alice Microsoft', exact: true })).toBeVisible()
    expect(await next.evaluate(async () => {
      const { currentProfile, gameStorage } = await import('/src/accounts/profileStorage.ts')
      return { profile: currentProfile(), bests: gameStorage().getItem('arcade.jumping.times.v1') }
    })).toEqual({ profile: `microsoft:${alice}`, bests: '{"Tower":123}' })
    await next.getByRole('button', { name: 'Alice Microsoft', exact: true }).click()
    await expect(next.locator('.account-status')).toContainText('Reconnect OneDrive')
    expect(drive.requests.length).toBe(before)
    expect(reopened.pages()).toHaveLength(1)
    await microsoftCache(next)
    const reconnect = next.getByRole('button', { name: 'Reconnect OneDrive', exact: true })
    await next.evaluate(async () => {
      const app = await (await import('/src/accounts/auth.ts')).prepareAuth('microsoft')
      const original = app.acquireTokenPopup
      app.acquireTokenPopup = async (...args) => {
        const response = await original(...args)
        return { ...response, account: app.getAllAccounts().find(account => account.username === 'bob@example.test') }
      }
      window.testReconnect = original
    })
    await reconnect.click()
    await expect(next.locator('.account-status')).toContainText('Reconnect')
    expect(drive.requests.length).toBe(before)
    await next.evaluate(async () => { (await (await import('/src/accounts/auth.ts')).prepareAuth('microsoft')).acquireTokenPopup = window.testReconnect })
    await reconnect.click()
    await expect(next.locator('.account-status')).toContainText('Synced with OneDrive')
    await next.getByRole('button', { name: 'Account settings', exact: true }).click()
    await next.getByRole('button', { name: 'Sign out', exact: true }).click()
    reopened = await newBrowserSession(browser, reopened, testInfo)
    const guest = await reopened.newPage()
    await microsoftProviders(guest, reopened, drive)
    await guest.goto('/')
    await expect(guest.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
    expect(await guest.evaluate(key => localStorage.getItem(key), ACCOUNT_KEY)).toBeNull()
  } finally { await reopened.close() }
})

test('an existing Microsoft tab session upgrades to a persistent selected profile', async ({ page, context }) => {
  await microsoftProviders(page, context)
  await page.goto('/')
  await microsoftCache(page, true)
  await page.evaluate(({ key, id }) => sessionStorage.setItem(key, JSON.stringify({ id, cloudEnabled: false })), { key: SESSION_KEY, id: alice })
  await page.reload()
  await expect(page.getByRole('button', { name: 'Alice Microsoft', exact: true })).toBeVisible()
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), ACCOUNT_KEY)).toEqual({ identity: { provider: 'microsoft', id: alice, name: 'Alice Microsoft' }, cloudEnabled: false })
  expect(await page.evaluate(key => sessionStorage.getItem(key), SESSION_KEY)).toBeNull()
  await page.close()
  const next = await context.newPage()
  await microsoftProviders(next, context)
  await next.goto('/')
  await expect(next.getByRole('button', { name: 'Alice Microsoft', exact: true })).toBeVisible()
})
