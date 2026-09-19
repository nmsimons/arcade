import { expect, test } from '@playwright/test'
import { freshExpedition, SAVE_KEY } from '../../src/games/hardVacuum/expedition.ts'
import { SAVE_BACKUP_KEY, SAVE_RECOVERY_KEY } from '../../src/games/hardVacuum/expeditionSave.ts'

const goodSave = () => JSON.stringify({ ...freshExpedition(), banked: 12345 })

async function seed(page, { raw = null, backup = null, denyRead = false, denyWrite = false } = {}) {
  await page.addInitScript(({ raw, backup, denyRead, denyWrite, key, backupKey }) => {
    // Each Playwright test owns an isolated browser context. Seed once so reloads
    // exercise real persistence instead of silently resetting the test fixture.
    if (!sessionStorage.getItem('save-test-seeded')) {
      if (raw !== null) localStorage.setItem(key, raw)
      if (backup !== null) localStorage.setItem(backupKey, backup)
      sessionStorage.setItem('save-test-seeded', 'true')
    }
    const get = Storage.prototype.getItem, set = Storage.prototype.setItem
    Storage.prototype.getItem = function (name) {
      if (denyRead && this === localStorage && name.startsWith(key)) throw new DOMException('Read blocked', 'SecurityError')
      return get.call(this, name)
    }
    Storage.prototype.setItem = function (name, value) {
      if (denyWrite && this === localStorage && name.startsWith(key)) throw new DOMException('Storage full', 'QuotaExceededError')
      return set.call(this, name, value)
    }
  }, { raw, backup, denyRead, denyWrite, key: SAVE_KEY, backupKey: SAVE_BACKUP_KEY })
  await page.goto('/hard-vacuum')
  await expect(page.getByRole('heading', { name: 'Hard Vacuum', exact: true })).toBeVisible()
}

const readSlot = (page, key = SAVE_KEY) => page.evaluate(key => localStorage.getItem(key), key)
const activate = async (page, name) => {
  await page.getByRole('button', { name, exact: true }).focus()
  await page.keyboard.press('Enter')
}

for (const [name, raw, warning] of [
  ['malformed', '{not-json', 'Your original save has been preserved.'],
  ['unsupported', JSON.stringify({ version: 999, banked: 12345 }), 'saved by a newer version'],
]) test(`${name} save survives keyboard menu exit and canceled New`, async ({ page }) => {
  await seed(page, { raw })
  await expect(page.getByRole('alert')).toContainText(warning)
  await expect(page.getByRole('button', { name: /Launch expedition|Continue expedition/ })).toHaveCount(0)
  await activate(page, 'Start a new expedition…')
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cancel · Esc', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(page).toHaveURL(/\/$/)
  expect(await readSlot(page)).toBe(raw)
  expect(await readSlot(page, SAVE_BACKUP_KEY)).toBeNull()
})

test('keyboard backup recovery restores progress, archives unreadable bytes, and survives reload', async ({ page }) => {
  const raw = '{"version":999,"banked":54321}', backup = goodSave()
  await seed(page, { raw, backup })
  await expect(page.getByRole('button', { name: 'Restore backup', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Hard Vacuum', exact: true })).toHaveCount(0)
  expect(JSON.parse(await readSlot(page)).banked).toBe(12345)
  expect(await readSlot(page, SAVE_RECOVERY_KEY)).toBe(raw)
  expect(JSON.parse(await readSlot(page, SAVE_BACKUP_KEY)).banked).toBe(12345)
  await page.keyboard.press('p')
  await activate(page, 'Save & exit')
  await expect(page).toHaveURL(/\/$/)
  await page.goto('/hard-vacuum')
  await expect(page.getByRole('button', { name: 'Continue expedition', exact: true })).toBeVisible()
  expect(JSON.parse(await readSlot(page)).banked).toBe(12345)
})

test('a missing slot stays empty on menu exit and is saved only after launch', async ({ page }) => {
  await seed(page)
  await page.keyboard.press('Escape')
  await expect(page).toHaveURL(/\/$/)
  expect(await readSlot(page)).toBeNull()
  await page.goto('/hard-vacuum')
  await activate(page, 'Launch expedition')
  await expect.poll(() => readSlot(page)).not.toBeNull()
  expect(JSON.parse(await readSlot(page, SAVE_BACKUP_KEY)).version).toBe(1)
})

test('a missing primary with a working backup defaults to recovery, not a fresh launch', async ({ page }) => {
  const backup = goodSave()
  await seed(page, { backup })
  await expect(page.getByRole('alert')).toContainText('a working backup is available')
  await expect(page.getByRole('button', { name: 'Launch expedition', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Restore backup', exact: true })).toBeFocused()
  await activate(page, 'Start a new expedition…')
  await page.keyboard.press('Escape')
  expect(await readSlot(page)).toBeNull()
  expect(await readSlot(page, SAVE_BACKUP_KEY)).toBe(backup)
  await activate(page, 'Restore backup')
  await expect.poll(async () => JSON.parse(await readSlot(page))?.banked).toBe(12345)
})

test('confirming New deliberately replaces an unreadable save', async ({ page }) => {
  const raw = '{broken'
  await seed(page, { raw })
  await activate(page, 'Start a new expedition…')
  await expect(page.getByRole('button', { name: 'Cancel · Esc', exact: true })).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('button', { name: 'Start fresh', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect.poll(async () => JSON.parse(await readSlot(page)).version).toBe(1)
  expect(JSON.parse(await readSlot(page)).banked).toBe(0)
  expect(await readSlot(page, SAVE_RECOVERY_KEY)).toBe(raw)
})

test('storage read errors expose recovery choices without pretending there is no save', async ({ page }) => {
  const raw = goodSave()
  await seed(page, { raw, denyRead: true })
  await expect(page.getByRole('alert')).toContainText('Browser storage could not be read')
  await expect(page.getByRole('button', { name: 'Launch expedition', exact: true })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(page).toHaveURL(/\/$/)
  expect(await page.evaluate(key => localStorage[key], SAVE_KEY)).toBe(raw)
})

test('quota failures show an in-flight warning and require an explicit exit without saving', async ({ page }) => {
  const raw = goodSave()
  await seed(page, { raw, denyWrite: true })
  await activate(page, 'Continue expedition')
  await expect(page.getByRole('alert')).toContainText('Progress could not be saved')
  await page.keyboard.press('p')
  await activate(page, 'Save & exit')
  await expect(page).toHaveURL(/\/hard-vacuum$/)
  await expect(page.getByRole('button', { name: 'Retry save & exit', exact: true })).toBeVisible()
  expect(await readSlot(page)).toBe(raw)
  await activate(page, 'Exit without saving')
  await expect(page).toHaveURL(/\/$/)
  expect(await readSlot(page)).toBe(raw)
})

test('failed backup recovery stays on the menu and preserves both slots', async ({ page }) => {
  const raw = 'broken', backup = goodSave()
  await seed(page, { raw, backup, denyWrite: true })
  await activate(page, 'Restore backup')
  await expect(page.getByRole('heading', { name: 'Hard Vacuum', exact: true })).toBeVisible()
  await expect(page.getByRole('alert').filter({ hasText: 'Progress could not be saved' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page).toHaveURL(/\/$/)
  expect(await readSlot(page)).toBe(raw)
  expect(await readSlot(page, SAVE_BACKUP_KEY)).toBe(backup)
})
