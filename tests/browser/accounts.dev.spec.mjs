import { test, expect } from './helpers/test.mjs'
import { readFileSync } from 'node:fs'
import { freshExpedition, SAVE_KEY } from '../../src/games/hardVacuum/expedition.ts'

async function providers(page) {
  const uploads = [], scopes = [], files = [], bodies = new Map()
  await page.route('https://accounts.google.com/gsi/client', route => route.fulfill({ contentType: 'text/javascript', body: `
    window.testAccount = 'alice';
    window.google = { accounts: { oauth2: {
      initTokenClient: options => ({ requestAccessToken() {
        window.testScope = options.scope;
        if (window.testDeny) { options.callback({ error: 'access_denied' }); return; }
        const complete = () => options.callback({ access_token: window.testAccount + '-token', expires_in: 3600, scope: options.scope });
        if (window.testDelay) { window.testComplete = complete; return; }
        complete();
      } }),
      hasGrantedAllScopes: (response, ...scopes) => scopes.every(scope => response.scope.split(' ').includes(scope))
    } } };
  ` }))
  await page.route('https://openidconnect.googleapis.com/v1/userinfo', route => {
    const who = route.request().headers().authorization.includes('bob') ? 'bob' : 'alice'
    return route.fulfill({ json: { sub: who, name: who === 'alice' ? 'Alice Example' : 'Bob Example' } })
  })
  await page.route('https://www.googleapis.com/**', async route => {
    const request = route.request(), url = new URL(request.url())
    scopes.push(await page.evaluate(() => window.testScope))
    if (url.pathname.startsWith('/upload/')) {
      const body = request.postData(), boundary = request.headers()['content-type'].split('boundary=')[1], parts = body.split('--' + boundary)
      const meta = JSON.parse(parts[1].split('\r\n\r\n')[1].trim()), text = parts[2].split('\r\n\r\n')[1].trim()
      const id = 'file-' + files.length; files.push({ ...meta, id, size: text.length }); bodies.set(id, text); uploads.push({ meta, text })
      return route.fulfill({ json: { id } })
    }
    const id = url.pathname.match(/\/files\/(.+)/)?.[1]
    if (id) return route.fulfill({ contentType: 'application/json', body: bodies.get(id) ?? '{}' })
    return route.fulfill({ json: { files } })
  })
  return { uploads, scopes, files, bodies }
}
async function login(page) {
  await page.getByRole('button', { name: 'Sign in / Cloud saves' }).click()
  await page.getByRole('button', { name: 'Sign in with Google', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Alice Example' })).toBeVisible()
}

test('Google sign-in separates storage consent, isolates anonymous saves, syncs and signs out', async ({ page }) => {
  const mock = await providers(page), errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  await page.evaluate(({ key, data }) => localStorage.setItem(key, data), { key: SAVE_KEY, data: JSON.stringify({ ...freshExpedition(), banked: 750 }) })
  await login(page)
  expect(await page.evaluate(() => window.testScope)).not.toContain('drive')
  await page.getByRole('button', { name: 'Enable Google Drive' }).click()
  await expect(page.locator('.account-status')).toContainText('Synced with Google Drive')
  expect(mock.uploads.length).toBe(0)
  await page.getByRole('button', { name: 'Import anonymous progress', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Import anonymous progress', exact: true }).click()
  await page.getByRole('button', { name: 'Sync now', exact: true }).click()
  await expect(page.locator('.account-status')).toContainText('Synced with Google Drive')
  expect(mock.uploads.length).toBe(1)
  expect(mock.uploads[0].meta.parents).toEqual(['appDataFolder'])
  expect(JSON.parse(JSON.parse(mock.uploads[0].text).slots[SAVE_KEY]).banked).toBe(750)
  expect(mock.scopes.every(scope => scope.includes('drive.appdata') && !scope.includes('drive.file'))).toBe(true)
  const browserValues = await page.evaluate(() => Object.values(localStorage).join(' '))
  expect(browserValues).not.toContain('alice-token')
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Play anywhere' })).toBeVisible()
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).banked, SAVE_KEY)).toBe(750)
  expect(errors).toEqual([])
})

test('denied consent and choosing another Google account keep the current player isolated', async ({ page }) => {
  await providers(page); await page.goto('/'); await login(page)
  await page.evaluate(() => { window.testDeny = true })
  await page.getByRole('button', { name: 'Enable Google Drive' }).click()
  await expect(page.locator('.account-status')).toContainText('not completed')
  await expect(page.getByRole('button', { name: 'Sync now', exact: true })).toHaveCount(0)
  await page.evaluate(() => { window.testDeny = false; window.testAccount = 'bob' })
  await page.getByRole('button', { name: 'Enable Google Drive' }).click()
  await expect(page.locator('.account-status')).toContainText('account changed')
  await expect(page.getByRole('heading', { name: 'Alice Example' })).toBeVisible()
})

test('leaving a pending sign-in rejects a late successful response', async ({ page }) => {
  await providers(page); await page.goto('/')
  await page.getByRole('button', { name: 'Sign in / Cloud saves' }).click()
  await expect(page.getByRole('button', { name: 'Sign in with Google', exact: true })).toBeEnabled()
  await page.evaluate(() => { window.testDelay = true })
  await page.getByRole('button', { name: 'Sign in with Google', exact: true }).click()
  await page.getByRole('button', { name: 'Close account' }).click()
  const response = page.waitForResponse('https://openidconnect.googleapis.com/v1/userinfo')
  await page.evaluate(() => window.testComplete()); await response
  await page.getByRole('button', { name: 'Sign in / Cloud saves' }).click()
  await expect(page.getByRole('heading', { name: 'Play anywhere' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Alice Example' })).toHaveCount(0)
})

test('account levels import into the existing level builder and save without a local directory handle', async ({ page }) => {
  await providers(page); await page.goto('/'); await login(page)
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
  await page.goto('/'); await page.getByRole('button', { name: 'Sign in / Cloud saves' }).click()
  const popupPromise = page.waitForEvent('popup')
  await page.getByRole('button', { name: 'Sign in with Microsoft', exact: true }).click()
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
