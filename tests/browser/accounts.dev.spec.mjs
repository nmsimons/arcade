import { test, expect } from './helpers/test.mjs'
import { readFileSync } from 'node:fs'
import { freshExpedition, SAVE_KEY } from '../../src/games/hardVacuum/expedition.ts'
import { oneDrive } from '../helpers/oneDrive.mjs'
import { useLevelFixtures } from './helpers/jumpingLevels.mjs'

import { providers, login } from './helpers/googleAccount.mjs'

test('account controls stay in menus and the studio, and switch jumping game saves in place', async ({ page }, testInfo) => {
  await providers(page)
  await useLevelFixtures(page, [JSON.parse(readFileSync(new URL('../fixtures/jumping/00-json-test-lab.json', import.meta.url), 'utf8'))])
  for (const route of ['/hard-vacuum', '/bumper-ball', '/urban-fire']) {
    await page.goto(route)
    await expect(page.locator('canvas').first()).toBeVisible()
    await expect(page.locator('.arcade-account-bar')).toHaveCount(0)
    await page.keyboard.press('F8')
    await expect(page.getByRole('dialog', { name: 'Player account', exact: true })).toHaveCount(0)
  }
  for (const route of ['/', '/untitled-jumping-game']) {
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
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.screenshot({ path: testInfo.outputPath('builder-sign-in.png') })
  await page.getByRole('button', { name: 'Sign in with Google', exact: true }).click()
  await expect(page.getByRole('alertdialog', { name: 'Sign in and switch saves', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'Close account', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Level name', exact: true })).toHaveValue('Keep this draft')
  await page.keyboard.press('F8')
  await page.getByRole('button', { name: 'Sign in with Google', exact: true }).click()
  await page.getByRole('alertdialog', { name: 'Sign in and switch saves', exact: true }).getByRole('button', { name: 'Sign in and switch saves', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Alice Example' })).toBeVisible()
  await page.getByRole('button', { name: 'Close account', exact: true }).click()
  await expect(page).toHaveURL(/untitled-jumping-game/)
  await expect(page.getByRole('textbox', { name: 'Level name', exact: true })).toHaveValue('Untitled level')
  await page.getByRole('button', { name: 'Back to game', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Account levels', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Alice Example', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Built-in levels', exact: true }).click()
  await page.getByRole('button', { name: /^Level 1:/ }).click()
  await expect(page.getByRole('img', { name: 'JSON Test Lab: activate the goal' })).toBeFocused()
  await expect(page.getByRole('dialog', { name: 'Untitled Jumping Game', exact: true })).toHaveCount(0)
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

test('account levels import into the existing level builder and save without a local directory handle', async ({ page }) => {
  await providers(page); await page.goto('/'); await login(page)
  await page.getByRole('button', { name: 'Manage saves', exact: true }).click()
  const fixture = readFileSync(new URL('../fixtures/jumping/00-json-test-lab.json', import.meta.url))
  await page.locator('input[type=file][multiple]').setInputFiles({ name: 'cloud-level.json', mimeType: 'application/json', buffer: fixture })
  await expect(page.locator('.account-status')).toContainText('Imported 1 level')
  await page.getByRole('button', { name: 'Close account' }).click()
  await page.getByRole('button', { name: 'Untitled Jumping Game', exact: true }).click()
  await page.getByRole('button', { name: 'Account levels', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Refresh account levels' })).toBeVisible()
  await page.getByRole('button', { name: `Edit ${JSON.parse(fixture).name}`, exact: true }).click()
  await page.getByRole('textbox', { name: 'Level name', exact: true }).fill('Account edited level')
  await page.getByRole('button', { name: 'Save level', exact: true }).click()
  await expect(page.getByRole('status', { name: 'Builder status' })).toContainText('Saved')
  const name = await page.evaluate(() => JSON.parse(JSON.parse(localStorage.getItem('arcade.player.google%3Aalice.arcade.account.levels.v1')).files['cloud-level.json']).name)
  expect(name).toBe('Account edited level')
})

test('new account levels get distinct suggested filenames and existing edits can be saved repeatedly', async ({ page }) => {
  await providers(page); await page.goto('/'); await login(page)
  await page.getByRole('button', { name: 'Close account' }).click()
  await page.getByRole('button', { name: 'Untitled Jumping Game', exact: true }).click()
  await page.getByRole('button', { name: 'Account levels', exact: true }).click()
  await page.getByRole('button', { name: 'Level studio', exact: true }).click()
  const save = page.getByRole('button', { name: 'Save level', exact: true })
  const status = page.getByRole('status', { name: 'Builder status' })
  await save.click()
  await expect(status).toContainText('Saved')
  await page.getByRole('textbox', { name: 'Level name', exact: true }).fill('First draft')
  await save.click()
  await expect(status).toContainText('Saved')
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: 'New level', exact: true }).click()
  await save.click()
  await expect(status).toContainText('Saved')
  await expect(page.getByRole('alertdialog', { name: 'Save failed' })).toHaveCount(0)
  const files = await page.evaluate(() => JSON.parse(localStorage.getItem('arcade.player.google%3Aalice.arcade.account.levels.v1')).files)
  expect(JSON.parse(files['Untitled level.jump-level.json']).name).toBe('First draft')
  expect(JSON.parse(files['Untitled level 2.jump-level.json']).name).toBe('Untitled level')
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
  expect(params.get('redirect_uri')).toBe('http://127.0.0.1:4176/auth-redirect.html')
  expect(params.get('scope')).not.toContain('Files.')
  await popup.goto(params.get('redirect_uri') + '#error=access_denied&error_description=Cancelled&state=' + encodeURIComponent(params.get('state')), { waitUntil: 'commit' })
  await expect(page.getByRole('button', { name: 'Sign in with Microsoft', exact: true })).toBeEnabled({ timeout: 10000 })
  await expect(page.getByRole('heading', { name: 'Play anywhere' })).toBeVisible()
})

test('OneDrive sync publishes a portable game collection and reads copied files back through the account UI', async ({ page }) => {
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
  await page.getByRole('button', { name: 'Manage saves', exact: true }).click()
  const level = readFileSync(new URL('../fixtures/jumping/00-json-test-lab.json', import.meta.url), 'utf8')
  const index = '{ "version": 1, "order": "listed", "levels": ["Portable.json"], "chapter": "Test" }\n'
  await page.locator('input[type=file][multiple]').setInputFiles([
    { name: 'Portable.json', mimeType: 'application/json', buffer: Buffer.from(level) },
    { name: 'index.json', mimeType: 'application/json', buffer: Buffer.from(index) },
  ])
  await expect(page.locator('.account-status')).toContainText('Imported 1 level')
  await page.getByRole('button', { name: 'Back to cloud saves' }).click()
  await page.getByRole('button', { name: 'Connect OneDrive', exact: true }).click()
  await expect(page.locator('.account-status')).toContainText('Synced with OneDrive')
  await expect(page.getByRole('link', { name: 'Open OneDrive folder' })).toHaveAttribute('href', 'https://onedrive.live.com/?id=test-app-folder')
  await page.getByRole('button', { name: 'Account settings', exact: true }).click()
  await expect(page.getByText('Arcade Test Registration', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Back to cloud saves' }).click()
  expect(drive.find('Untitled Jumping Game/Levels/Portable.json').text).toBe(level)
  expect(drive.find('Untitled Jumping Game/Levels/index.json').text).toBe(index)
  drive.put('Untitled Jumping Game/Levels/Copied.json', JSON.stringify({ ...JSON.parse(level), id: 'copied-level', name: 'Copied from OneDrive' }))
  await page.getByRole('button', { name: 'Sync now', exact: true }).click()
  await expect(page.locator('.account-status')).toContainText('Synced with OneDrive')
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('arcade.player.microsoft%3Afolder-test.arcade.account.levels.v1')).files['Copied.json'])).toBeTruthy()
  expect(errors).toEqual([])
})
