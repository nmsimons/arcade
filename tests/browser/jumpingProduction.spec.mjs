import { test, expect } from './helpers/test.mjs'
import { useLevelFixtures, finishJumpingEntrance } from './helpers/jumpingLevels.mjs'
import { blankTrial } from '../../src/games/jumping/level.ts'

const opening = { ...blankTrial(), id: 'production-opening', name: 'Opening', width: 1000, timing: 'untimed', goal: { x: 600, y: 920 } }

test('published LAB offers play and progress without authoring or folder controls', async ({ page }, info) => {
  await useLevelFixtures(page, [opening])
  await page.addInitScript(() => {
    localStorage.setItem('arcade.jumping.collection.v1', 'local')
    window.folderPickerCalls = 0
    window.showDirectoryPicker = () => { window.folderPickerCalls++; throw new Error('Retired folder picker must not open') }
  })
  const editorRequests = []
  page.on('request', request => { if (/LevelBuilder|builtInLevels|__arcade\/jumping-levels/.test(request.url())) editorRequests.push(request.url()) })
  await page.clock.install()
  await page.goto('/lab')
  await expect(page.getByRole('button', { name: 'Play Opening', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /Level studio|Edit |Delete |Local folder|Account levels|Choose folder|Refresh built-in/ })).toHaveCount(0)
  await expect(page.locator('input[webkitdirectory]')).toHaveCount(0)
  await page.keyboard.press('y')
  await expect(page.getByRole('application', { name: 'Level canvas' })).toHaveCount(0)
  await expect.poll(() => page.locator('.jumping-level-card canvas').first().evaluate(canvas => canvas.width)).toBeGreaterThan(1)
  await page.screenshot({ path: info.outputPath('published-lab-menu.png') })
  await page.getByRole('button', { name: 'Play Opening', exact: true }).click()
  await finishJumpingEntrance(page)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Level studio', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Resume', exact: false }).click()
  await page.keyboard.down('d'); await page.clock.runFor(4000); await page.keyboard.up('d')
  await expect(page.getByRole('dialog', { name: 'Level complete', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /builder|studio/i })).toHaveCount(0)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('arcade.jumping.completed.v1'))['production-opening'])).toBe(true)
  expect(editorRequests).toEqual([])
  expect(await page.evaluate(() => window.folderPickerCalls)).toBe(0)
})

for (const path of ['/lab/builder', '/lab/builder/built-in', '/lab/builder/built-in/00-fixture.json', '/lab/builder/built-in/00-fixture.json/playtest', '/lab/builder/playtest/draft', '/lab/builder/local/old.json']) {
  test(`published authoring link returns to the menu: ${path}`, async ({ page }) => {
    await useLevelFixtures(page, [opening])
    await page.goto(path)
    await expect(page).toHaveURL(/\/lab$/)
    await expect(page.getByRole('button', { name: 'Play Opening', exact: true })).toBeVisible()
    await expect(page.getByRole('application', { name: 'Level canvas' })).toHaveCount(0)
  })
}

test('retired local links and an empty catalog never offer folder access', async ({ page }) => {
  await useLevelFixtures(page, [])
  await page.goto('/lab/levels/local/old.json')
  await expect(page.getByRole('status').filter({ hasText: 'No levels are available.' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Local folder|Choose folder|Account levels|Level studio/ })).toHaveCount(0)
  await expect(page.getByRole('application', { name: 'Level canvas' })).toHaveCount(0)
})
