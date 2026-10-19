import { test, expect } from './helpers/test.mjs'
import { providers, login } from './helpers/googleAccount.mjs'
import { useLevelFixtures } from './helpers/jumpingLevels.mjs'
import { FIRST_LEVEL } from '../helpers/jumping-fixtures.mjs'
import { newBrowserSession } from './helpers/accountSession.mjs'

const ACCESS = 'arcade.google.access.v1', SESSION = 'arcade.google.session.v1'
const ACCOUNT = 'arcade.account.v1'
async function connected(page) {
  const mock = await providers(page)
  await page.goto('/'); await login(page)
  await page.evaluate(async () => (await import('/src/accounts/profileStorage.ts')).gameStorage().setItem('arcade.jumping.times.v1', '{"Tower":123}'))
  await page.getByRole('button', { name: 'Connect Google Drive', exact: true }).click()
  await expect(page.locator('.account-status')).toContainText('Your saves are up to date', { timeout: 15_000 })
  return mock
}

test('player accounts manage progress without level imports or custom libraries', async ({ page }) => {
  await connected(page)
  await page.getByRole('button', { name: 'Manage saves', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Download backup', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /Import level files|Choose from Google Drive/ })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Custom levels', exact: true })).toHaveCount(0)
})

test('Google refresh restores its account and connected saves; disconnect and sign-out persist', async ({ page, context }) => {
  const { drive } = await connected(page)
  await expect(page.getByRole('link', { name: 'Open Google Drive folder' })).toHaveAttribute('href', /https:\/\/drive.google.com\/drive\/folders\//)
  expect(drive.find('Untitled Jumping Game/personal-bests.json').text).toBe('{"Tower":123}')
  await page.reload()
  await expect(page.getByRole('button', { name: 'Alice Example', exact: true })).toBeVisible()
  await expect(page.locator('.arcade-account-bar')).toContainText('Saved to Google Drive')
  expect(await page.evaluate(() => window.testTokenRequests ?? 0)).toBe(0)
  expect(context.pages()).toHaveLength(1)
  expect(await page.evaluate(() => Object.values(localStorage).join(' '))).not.toContain('alice-token')
  await page.getByRole('button', { name: 'Alice Example', exact: true }).click()
  await page.getByRole('button', { name: 'Account settings', exact: true }).click()
  await expect(page.getByRole('button', { name: /Import level files|Choose from Google Drive/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Disconnect cloud', exact: true }).click()
  await page.reload()
  await page.getByRole('button', { name: 'Alice Example', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Connect Google Drive', exact: true })).toBeEnabled()
  expect(await page.evaluate(key => sessionStorage.getItem(key), ACCESS)).toBeNull()
  await page.getByRole('button', { name: 'Account settings', exact: true }).click()
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
  expect(await page.evaluate(key => sessionStorage.getItem(key), SESSION)).toBeNull()
  expect(await page.evaluate(key => localStorage.getItem(key), ACCOUNT)).toBeNull()
})

test('Google keeps the selected player and saves across browser sessions; reconnect and sign-out remain explicit', async ({ page, context, browser }, testInfo) => {
  test.setTimeout(90_000)
  const { drive } = await connected(page)
  const before = drive.requests.length
  let reopened = await newBrowserSession(browser, context, testInfo)
  try {
    const next = await reopened.newPage()
    await providers(next, drive)
    await next.goto('/lab')
    await expect(next.getByRole('button', { name: 'Alice Example', exact: true })).toBeVisible()
    expect(await next.evaluate(async () => {
      const { currentProfile, gameStorage } = await import('/src/accounts/profileStorage.ts')
      return { profile: currentProfile(), bests: gameStorage().getItem('arcade.jumping.times.v1') }
    })).toEqual({ profile: 'google:alice', bests: '{"Tower":123}' })
    await next.getByRole('button', { name: 'Alice Example', exact: true }).click()
    await expect(next.locator('.account-status')).toContainText('Reconnect Google Drive')
    expect(await next.evaluate(() => window.testTokenRequests ?? 0)).toBe(0)
    expect(await next.evaluate(key => sessionStorage.getItem(key), ACCESS)).toBeNull()
    expect(drive.requests.length).toBe(before)
    expect(reopened.pages()).toHaveLength(1)
    await next.getByRole('button', { name: 'Reconnect Google Drive', exact: true }).click()
    await expect(next.locator('.account-status')).toContainText('Synced with Google Drive')
    await next.getByRole('button', { name: 'Account settings', exact: true }).click()
    await next.getByRole('button', { name: 'Disconnect cloud', exact: true }).click()
    reopened = await newBrowserSession(browser, reopened, testInfo)
    const disconnected = await reopened.newPage()
    await providers(disconnected, drive)
    await disconnected.goto('/')
    await disconnected.getByRole('button', { name: 'Alice Example', exact: true }).click()
    await expect(disconnected.getByRole('button', { name: 'Connect Google Drive', exact: true })).toBeEnabled()
    expect(await disconnected.evaluate(async () => (await import('/src/accounts/session.ts')).getSession().cloudEnabled)).toBe(false)
    await disconnected.getByRole('button', { name: 'Account settings', exact: true }).click()
    await disconnected.getByRole('button', { name: 'Sign out', exact: true }).click()
    reopened = await newBrowserSession(browser, reopened, testInfo)
    const guest = await reopened.newPage()
    await providers(guest, drive)
    await guest.goto('/')
    await expect(guest.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
    expect(await guest.evaluate(key => localStorage.getItem(key), ACCOUNT)).toBeNull()
  } finally { await reopened.close() }
})

test('an existing Google tab session upgrades without losing its cloud access', async ({ page }) => {
  await connected(page)
  await page.evaluate(({ account, legacy }) => {
    sessionStorage.setItem(legacy, localStorage.getItem(account))
    localStorage.removeItem(account)
  }, { account: ACCOUNT, legacy: SESSION })
  await page.reload()
  await expect(page.getByRole('button', { name: 'Alice Example', exact: true })).toBeVisible()
  await expect(page.locator('.arcade-account-bar')).toContainText('Saved to Google Drive')
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), ACCOUNT)).toEqual({ identity: { provider: 'google', id: 'alice', name: 'Alice Example' }, cloudEnabled: true })
  expect(await page.evaluate(key => sessionStorage.getItem(key), SESSION)).toBeNull()
})

test('blocked persistent storage falls back to a usable tab sign-in', async ({ page }) => {
  await providers(page)
  await page.addInitScript(key => {
    const set = Storage.prototype.setItem
    Storage.prototype.setItem = function(name, value) {
      if (this === localStorage && name === key) throw new DOMException('Storage full', 'QuotaExceededError')
      return set.call(this, name, value)
    }
  }, ACCOUNT)
  await page.goto('/'); await login(page)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Alice Example', exact: true })).toBeVisible()
  expect(await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)).identity.id, ACCOUNT)).toBe('alice')
  await page.getByRole('button', { name: 'Alice Example', exact: true }).click()
  await page.getByRole('button', { name: 'Account settings', exact: true }).click()
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
  expect(await page.evaluate(key => sessionStorage.getItem(key), ACCOUNT)).toBeNull()
})

test('expired Google access keeps the selected profile and offers an explicit reconnect', async ({ page, context }) => {
  const { drive } = await connected(page)
  await page.evaluate(key => { const value = JSON.parse(sessionStorage.getItem(key)); value.expires = 1; sessionStorage.setItem(key, JSON.stringify(value)) }, ACCESS)
  const before = drive.requests.length
  await page.reload()
  await page.getByRole('button', { name: 'Alice Example', exact: true }).click()
  await expect(page.locator('.account-status')).toContainText('Reconnect Google Drive to keep syncing')
  expect(drive.requests.length).toBe(before)
  expect(await page.evaluate(() => window.testTokenRequests ?? 0)).toBe(0)
  expect(await page.evaluate(async () => (await import('/src/accounts/profileStorage.ts')).currentProfile())).toBe('google:alice')
  await page.getByRole('button', { name: 'Reconnect Google Drive', exact: true }).click()
  await expect(page.locator('.account-status')).toContainText('Your saves are up to date')
  expect(await page.evaluate(() => window.testTokenRequests)).toBe(1)
  expect(context.pages()).toHaveLength(1)
})

test('a cached Google token for another account cannot read or write Drive', async ({ page }) => {
  const { drive } = await connected(page)
  await page.evaluate(key => { const value = JSON.parse(sessionStorage.getItem(key)); value.access = 'bob-token'; sessionStorage.setItem(key, JSON.stringify(value)) }, ACCESS)
  const before = drive.requests.length
  await page.reload()
  await page.getByRole('button', { name: 'Alice Example', exact: true }).click()
  await expect(page.locator('.account-status')).toContainText('Reconnect Google Drive')
  expect(drive.requests.length).toBe(before)
  expect(await page.evaluate(key => sessionStorage.getItem(key), ACCESS)).toBeNull()
  const reconnect = page.getByRole('button', { name: 'Reconnect Google Drive', exact: true })
  // Loading the mocked SDK initializes its account choice. Wait for that
  // before selecting Bob, otherwise a delayed SDK response resets it to Alice.
  await expect(reconnect).toBeEnabled()
  await page.evaluate(() => { window.testAccount = 'bob' })
  await reconnect.click()
  await expect(page.locator('.account-status')).toContainText('account changed')
  await expect(page.getByRole('heading', { name: 'Alice Example' })).toBeVisible()
})

test('Google restores the save owner before a game starts, without granting cloud access', async ({ page }) => {
  await providers(page); await useLevelFixtures(page, [FIRST_LEVEL])
  await page.goto('/'); await login(page)
  await page.goto('/lab/levels/built-in/00-fixture.json')
  await expect(page.locator('.jumping-game > canvas')).toBeFocused()
  expect(await page.evaluate(async () => ({ profile: (await import('/src/accounts/profileStorage.ts')).currentProfile(), cloud: (await import('/src/accounts/session.ts')).getSession().cloudEnabled }))).toEqual({ profile: 'google:alice', cloud: false })
  await expect(page.locator('.arcade-account-bar')).toHaveCount(0)
})
