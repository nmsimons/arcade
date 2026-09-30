import { test, expect } from './helpers/test.mjs'
import { providers, login, picker } from './helpers/googleAccount.mjs'
import { useLevelFixtures } from './helpers/jumpingLevels.mjs'
import { FIRST_LEVEL } from '../helpers/jumping-fixtures.mjs'
import { readFileSync } from 'node:fs'

const ACCESS = 'arcade.google.access.v1', SESSION = 'arcade.google.session.v1'
const levelText = readFileSync(new URL('../fixtures/jumping/00-json-test-lab.json', import.meta.url), 'utf8')
async function connected(page) {
  const mock = await providers(page)
  await page.goto('/'); await login(page)
  await page.evaluate(async () => (await import('/src/accounts/profileStorage.ts')).gameStorage().setItem('arcade.jumping.times.v1', '{"Tower":123}'))
  await page.getByRole('button', { name: 'Connect Google Drive', exact: true }).click()
  await expect(page.locator('.account-status')).toContainText('Your saves are up to date')
  return mock
}

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
  await expect(page.getByText(/Google gives Arcade access per file/)).toBeVisible()
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
})

test('expired Google access keeps the selected profile and offers an explicit reconnect', async ({ page, context }) => {
  const { drive } = await connected(page)
  await page.evaluate(key => { const value = JSON.parse(sessionStorage.getItem(key)); value.expires = 1; sessionStorage.setItem(key, JSON.stringify(value)) }, ACCESS)
  const before = drive.requests.length
  await page.reload()
  await page.getByRole('button', { name: 'Alice Example', exact: true }).click()
  await expect(page.locator('.account-status')).toContainText('Reconnect Google Drive to keep syncing')
  expect(drive.requests.length).toBe(before)
  expect(await page.evaluate(() => window.testTokenRequests)).toBe(0)
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
  await page.evaluate(() => { window.testAccount = 'bob' })
  await page.getByRole('button', { name: 'Reconnect Google Drive', exact: true }).click()
  await expect(page.locator('.account-status')).toContainText('account changed')
  await expect(page.getByRole('heading', { name: 'Alice Example' })).toBeVisible()
})

test('Google restores the save owner before a game starts, without granting cloud access', async ({ page }) => {
  await providers(page); await useLevelFixtures(page, [FIRST_LEVEL])
  await page.goto('/'); await login(page)
  await page.goto('/untitled-jumping-game/levels/built-in/00-fixture.json')
  await expect(page.locator('.jumping-game > canvas')).toBeFocused()
  expect(await page.evaluate(async () => ({ profile: (await import('/src/accounts/profileStorage.ts')).currentProfile(), cloud: (await import('/src/accounts/session.ts')).getSession().cloudEnabled }))).toEqual({ profile: 'google:alice', cloud: false })
  await expect(page.locator('.arcade-account-bar')).toHaveCount(0)
})

test('Drive picker finds manually copied levels in place and refreshes the game without duplicate uploads', async ({ page }) => {
  const { drive } = await connected(page); await picker(page, drive)
  const file = drive.put('Untitled Jumping Game/Levels/From Drive.json', levelText)
  file.appAccessible = false
  await page.getByRole('button', { name: 'Sync now', exact: true }).click()
  await expect(page.locator('.account-status')).toContainText('Your saves are up to date')
  expect(await page.evaluate(async () => (await import('/src/accounts/data.ts')).readWorkspace((await import('/src/accounts/profileStorage.ts')).gameStorage()).levels.files['From Drive.json'])).toBeUndefined()
  await page.getByRole('button', { name: 'Manage saves', exact: true }).click()
  await page.evaluate(id => { window.testPickedFileIds = [id] }, file.id)
  await page.getByRole('button', { name: 'Choose from Google Drive', exact: true }).click()
  await expect(page.locator('iframe[title="Google Drive picker"]')).toBeFocused()
  const options = await page.evaluate(() => ({ parent: window.testPickerOptions.view.parent, token: window.testPickerOptions.token, feature: window.testPickerOptions.feature }))
  expect(options).toEqual({ parent: drive.find('Untitled Jumping Game/Levels').id, token: 'alice-token', feature: 'multiselect' })
  await page.frameLocator('iframe[title="Google Drive picker"]').getByRole('button', { name: 'Select files' }).click()
  await expect(page.locator('.account-status')).toContainText('Google Drive levels are ready')
  await expect(page.locator('.account-overlay')).not.toHaveAttribute('inert')
  expect(drive.find('Untitled Jumping Game/Levels/From Drive.json').id).toBe(file.id)
  await page.getByRole('button', { name: 'Close account', exact: true }).click()
  await page.getByRole('button', { name: 'Untitled Jumping Game', exact: true }).click()
  await page.getByRole('button', { name: 'Account levels', exact: true }).click()
  await expect(page.getByRole('button', { name: 'From Drive.json' })).toBeVisible()
})

test('Drive picker imports from elsewhere, preserves collisions, and returns focus on cancellation', async ({ page }) => {
  const { drive } = await connected(page); await picker(page, drive)
  const file = drive.put('Elsewhere/External.json', levelText); file.appAccessible = false
  await page.getByRole('button', { name: 'Manage saves', exact: true }).click()
  const choose = page.getByRole('button', { name: 'Choose from Google Drive', exact: true })
  await choose.click()
  await expect(page.locator('iframe[title="Google Drive picker"]')).toBeFocused()
  await page.frameLocator('iframe[title="Google Drive picker"]').getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect.poll(() => page.evaluate(() => ({ messages: window.testPickerMessages, disposed: window.testPickerDisposed }))).toEqual({ messages: [{ origin: 'https://docs.google.com', data: 'cancel' }], disposed: true })
  await expect(choose).toBeEnabled()
  await expect(choose).toBeFocused()
  await expect(page.locator('.account-overlay')).not.toHaveAttribute('inert')
  expect(drive.find('Untitled Jumping Game/Levels/External.json')).toBeUndefined()
  await page.evaluate(id => { window.testPickedFileIds = [id] }, file.id)
  await choose.click()
  await page.frameLocator('iframe[title="Google Drive picker"]').getByRole('button', { name: 'Select files' }).click()
  // Import completes only after the selected files, backup, and published
  // workspace have all been written and verified, even on a busy CI worker.
  await expect(page.locator('.account-status')).toContainText('Google Drive levels imported', { timeout: 15_000 })
  expect(drive.find('Untitled Jumping Game/Levels/External.json').text).toBe(levelText)
  expect(drive.find('Elsewhere/External.json').id).toBe(file.id)
  await choose.click()
  await page.frameLocator('iframe[title="Google Drive picker"]').getByRole('button', { name: 'Select files' }).click()
  await expect(page.locator('.account-status')).toContainText('already exists')
  expect(drive.find('Untitled Jumping Game/Levels/External.json').text).toBe(levelText)
})

test('Google shows upload progress and the chooser Refresh loads another browser’s levels', async ({ page, browser }, testInfo) => {
  const { drive } = await connected(page)
  const otherContext = await browser.newContext({ baseURL: testInfo.project.use.baseURL }), other = await otherContext.newPage()
  let finishUpload
  try {
    await providers(other, drive); await other.goto('/'); await login(other)
    await other.getByRole('button', { name: 'Connect Google Drive', exact: true }).click()
    await expect(other.locator('.account-status')).toContainText('Your saves are up to date')
    await other.getByRole('button', { name: 'Back to arcade', exact: true }).click()
    await other.getByRole('button', { name: 'Untitled Jumping Game', exact: true }).click()
    await other.getByRole('button', { name: 'Account levels', exact: true }).click()
    const upload = new Promise(resolve => { finishUpload = resolve })
    drive.before = async request => { if (request.url.pathname.startsWith('/upload/')) await upload }
    await page.getByRole('button', { name: 'Manage saves', exact: true }).click()
    await page.locator('input[type=file][multiple]').setInputFiles({ name: 'Portable.json', mimeType: 'application/json', buffer: readFileSync(new URL('../fixtures/jumping/00-json-test-lab.json', import.meta.url)) })
    await expect(page.locator('.account-status')).toContainText('Saving to Google Drive')
    await expect(page.locator('.account-status')).not.toContainText('OneDrive')
    expect(drive.find('Untitled Jumping Game/Levels/Portable.json')).toBeUndefined()
    finishUpload()
    await expect(page.locator('.account-status')).toContainText('Synced with Google Drive')
    await other.getByRole('button', { name: 'Refresh account levels', exact: true }).click()
    await expect(other.getByRole('button', { name: 'Level 1: JSON Test Lab', exact: true })).toContainText('Saved to Google Drive')
    await expect(other).toHaveURL(/untitled-jumping-game/)
  } finally { finishUpload?.(); await otherContext.close() }
})
