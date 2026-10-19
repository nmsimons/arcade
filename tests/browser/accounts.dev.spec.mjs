import { test, expect } from './helpers/test.mjs'
import { readFileSync } from 'node:fs'
import { freshExpedition, SAVE_KEY } from '../../src/games/hardVacuum/expedition.ts'
import { oneDrive } from '../helpers/oneDrive.mjs'
import { useLevelFixtures } from './helpers/jumpingLevels.mjs'

import { providers, login } from './helpers/googleAccount.mjs'

test('account controls stay in menus, the studio stays private, and signed-in players can play built-in levels', async ({ page }, testInfo) => {
  await providers(page)
  await useLevelFixtures(page, [JSON.parse(readFileSync(new URL('../fixtures/jumping/00-json-test-lab.json', import.meta.url), 'utf8'))])
  for (const route of ['/hard-vacuum', '/bumper-ball', '/urban-fire']) {
    await page.goto(route)
    await expect(page.locator('canvas').first()).toBeVisible()
    await expect(page.locator('.arcade-account-bar')).toHaveCount(0)
    await page.keyboard.press('F8')
    await expect(page.getByRole('dialog', { name: 'Player account', exact: true })).toHaveCount(0)
  }
  for (const route of ['/', '/lab']) {
    await page.goto(route)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Player account', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Close account', exact: true }).click()
    await page.keyboard.press('F8')
    await expect(page.getByRole('dialog', { name: 'Player account', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Close account', exact: true }).click()
  }
  await page.getByRole('button', { name: 'Level studio', exact: true }).click()
  await page.getByRole('textbox', { name: 'Level name', exact: true }).fill('Keep this draft')
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toHaveCount(0)
  await page.keyboard.press('F8')
  await expect(page.getByRole('dialog', { name: 'Player account', exact: true })).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: 'Level name', exact: true })).toHaveValue('Keep this draft')
  await page.screenshot({ path: testInfo.outputPath('private-local-studio.png') })
  await page.getByRole('button', { name: 'Back to game', exact: true }).click()
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.getByRole('button', { name: 'Sign in with Google', exact: true }).click()
  await page.getByRole('alertdialog', { name: 'Sign in and switch saves', exact: true }).getByRole('button', { name: 'Sign in and switch saves', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Alice Example' })).toBeVisible()
  await page.getByRole('button', { name: 'Close account', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Account levels', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Alice Example', exact: true })).toBeVisible()
  await page.getByRole('button', { name: /^Level 1:/ }).click()
  await expect(page.getByRole('img', { name: 'JSON Test Lab: reach the exit' })).toBeFocused()
  await expect(page.getByRole('dialog', { name: 'L.A.B. Experiments', exact: true })).toHaveCount(0)
  await expect(page.locator('.arcade-account-bar')).toHaveCount(0)
  await page.keyboard.press('F8')
  await expect(page.getByRole('dialog', { name: 'Player account', exact: true })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Level menu', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Alice Example', exact: true })).toBeVisible()
})

test('Google sign-in separates storage consent, isolates anonymous saves, syncs and signs out', async ({ page }) => {
  const mock = await providers(page), errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  await page.evaluate(({ key, data }) => localStorage.setItem(key, data), { key: SAVE_KEY, data: JSON.stringify({ ...freshExpedition(), banked: 750 }) })
  await login(page)
  expect(await page.evaluate(() => window.testScope)).not.toContain('drive')
  await expect(page.getByRole('button', { name: 'Import guest progress', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Connect Google Drive', exact: true }).click()
  await expect(page.locator('.account-status')).toContainText('Synced with Google Drive')
  expect(mock.drive.paths()).toHaveLength(0)
  await page.getByRole('button', { name: 'Manage saves', exact: true }).click()
  await page.getByRole('button', { name: 'Import guest progress', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Import guest progress', exact: true }).click()
  await expect(page.locator('.account-status')).toContainText('Synced with Google Drive')
  expect(JSON.parse(mock.drive.find('Hard Vacuum/expedition.json').text).banked).toBe(750)
  expect(mock.scopes.every(scope => scope.includes('drive.file') && !scope.includes('drive.appdata'))).toBe(true)
  const browserValues = await page.evaluate(() => Object.values(localStorage).join(' '))
  expect(browserValues).not.toContain('alice-token')
  await page.getByRole('button', { name: 'Back to cloud saves' }).click()
  await page.getByRole('button', { name: 'Account settings', exact: true }).click()
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Play anywhere' })).toBeVisible()
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).banked, SAVE_KEY)).toBe(750)
  expect(errors).toEqual([])
})

test('denied or partial consent and choosing another Google account keep the current player isolated', async ({ page }) => {
  const { drive } = await providers(page); await page.goto('/'); await login(page)
  await page.evaluate(() => { window.testDeny = true })
  await page.getByRole('button', { name: 'Connect Google Drive', exact: true }).click()
  await expect(page.locator('.account-status')).toContainText('not completed')
  await expect(page.getByRole('button', { name: 'Sync now', exact: true })).toHaveCount(0)
  await page.evaluate(() => { window.testDeny = false; window.testPartial = true })
  await page.getByRole('button', { name: 'Connect Google Drive', exact: true }).click()
  await expect(page.locator('.account-status')).toContainText('not completed')
  expect(drive.requests).toHaveLength(0)
  expect(await page.evaluate(() => sessionStorage.getItem('arcade.google.access.v1'))).toBeNull()
  await page.evaluate(() => { window.testPartial = false; window.testAccount = 'bob' })
  await page.getByRole('button', { name: 'Connect Google Drive', exact: true }).click()
  await expect(page.locator('.account-status')).toContainText('account changed')
  await expect(page.getByRole('heading', { name: 'Alice Example' })).toBeVisible()
})

test('leaving a pending sign-in rejects a late successful response', async ({ page }) => {
  await providers(page); await page.goto('/')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('button', { name: 'Sign in with Google', exact: true })).toBeEnabled()
  await page.evaluate(() => { window.testDelay = true })
  await page.getByRole('button', { name: 'Sign in with Google', exact: true }).click()
  await expect(page.locator('.account-status')).toContainText('Signing in with Google')
  await expect(page.locator('.account-status')).toContainText('popup window')
  await page.getByRole('button', { name: 'Close account' }).click()
  const response = page.waitForResponse('https://openidconnect.googleapis.com/v1/userinfo')
  await page.evaluate(() => window.testComplete()); await response
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Play anywhere' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Alice Example' })).toHaveCount(0)
})

test('Microsoft uses a personal-account PKCE popup and denied consent leaves anonymous play intact', async ({ page, context }) => {
  await providers(page)
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
    return route.fulfill({ contentType: 'text/html', body: '<p>Microsoft login test</p>' })
  })
  await page.goto('/'); await page.getByRole('button', { name: 'Sign in' }).click()
  const popupPromise = page.waitForEvent('popup')
  await page.getByRole('button', { name: 'Sign in with Microsoft', exact: true }).click()
  await expect(page.locator('.account-status')).toContainText('Signing in with Microsoft')
  const popup = await popupPromise
  await expect(popup).toHaveURL(/login\.microsoftonline\.com\/consumers\/oauth2\/v2\.0\/authorize/)
  const params = new URL(popup.url()).searchParams
  expect(params.get('response_type')).toBe('code'); expect(params.get('code_challenge_method')).toBe('S256')
  expect(params.get('code_challenge')).toBeTruthy(); expect(params.get('state')).toBeTruthy(); expect(params.get('nonce')).toBeTruthy()
  expect(params.get('redirect_uri')).toBe(new URL('/auth-redirect.html', page.url()).href)
  expect(params.get('scope')).not.toContain('Files.')
  await popup.goto(params.get('redirect_uri') + '#error=access_denied&error_description=Cancelled&state=' + encodeURIComponent(params.get('state')), { waitUntil: 'commit' })
  await expect(page.getByRole('button', { name: 'Sign in with Microsoft', exact: true })).toBeEnabled({ timeout: 10000 })
  await expect(page.getByRole('heading', { name: 'Play anywhere' })).toBeVisible()
})

test('OneDrive sync publishes progress and reads remote progress back through the account UI', async ({ page }) => {
  const drive = oneDrive(), errors = []
  drive.items.get('root').name = 'Arcade Test Registration'
  page.on('pageerror', error => errors.push(error.message))
  const handle = async route => {
    const request = route.request()
    const response = await drive.fetch(request.url(), { method: request.method(), headers: request.headers(), body: request.postData() ?? undefined })
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() })
  }
  await page.route('https://graph.microsoft.com/**', handle)
  await page.route('https://files.1drv.com/**', handle)
  await page.goto('/')
  await page.evaluate(async () => {
    const { setLogin } = await import('/src/accounts/session.ts')
    setLogin({ identity: { provider: 'microsoft', id: 'folder-test', name: 'Folder Test' }, authorize: async () => {}, token: async () => 'folder-test-token', disconnect() {}, signOut: async () => {} })
  })
  await page.getByRole('button', { name: 'Folder Test', exact: true }).click()
  await page.getByRole('button', { name: 'Account settings', exact: true }).click()
  await expect(page.getByText(/Connect OneDrive and sync to find your app folder/)).toBeVisible()
  await page.getByRole('button', { name: 'Back to cloud saves' }).click()
  await page.evaluate(async () => {
    const { gameStorage } = await import('/src/accounts/profileStorage.ts')
    gameStorage().setItem('arcade.jumping.times.v1', '{"Tower":123}')
  })
  await page.getByRole('button', { name: 'Connect OneDrive', exact: true }).click()
  await expect(page.locator('.account-status')).toContainText('Synced with OneDrive')
  await expect(page.getByRole('link', { name: 'Open OneDrive folder' })).toHaveAttribute('href', 'https://onedrive.live.com/?id=test-app-folder')
  await page.getByRole('button', { name: 'Account settings', exact: true }).click()
  await expect(page.getByText('Arcade Test Registration', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Back to cloud saves' }).click()
  expect(drive.find('Untitled Jumping Game/personal-bests.json').text).toBe('{"Tower":123}')
  drive.put('Untitled Jumping Game/personal-bests.json', '{"Tower":111}')
  await page.getByRole('button', { name: 'Sync now', exact: true }).click()
  await expect(page.locator('.account-status')).toContainText('Synced with OneDrive')
  await expect.poll(() => page.evaluate(async () => {
    const { gameStorage } = await import('/src/accounts/profileStorage.ts')
    return JSON.parse(gameStorage().getItem('arcade.jumping.times.v1')).Tower
  })).toBe(111)
  expect(errors).toEqual([])
})
