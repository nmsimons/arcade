import { readFile } from 'node:fs/promises'
import { test, expect } from './helpers/test.mjs'
import { useLevelFixtures } from './helpers/jumpingLevels.mjs'
import { FIRST_LEVEL, CAMPAIGN } from '../helpers/jumping-fixtures.mjs'

test('slow worker loading does not consume the level geometry budget', async ({ page, context }) => {
  test.setTimeout(25000)
  await useLevelFixtures(page, [FIRST_LEVEL])
  let delayed = false
  await context.route('**/*ropeLayout.worker*', async route => {
    if (!delayed) {
      delayed = true
      await new Promise(resolve => setTimeout(resolve, 6000))
    }
    await route.continue()
  })
  await page.goto('/lab')
  await page.getByRole('button', { name: `Play ${FIRST_LEVEL.name}`, exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Preparing level' })).toBeVisible()
  await expect(page.getByRole('img', { name: `${FIRST_LEVEL.name}: reach the exit`, exact: true })).toBeFocused({ timeout: 15000 })
  expect(delayed).toBe(true)
  await expect(page.locator('.jumping-route-notice')).toHaveCount(0)
})

test('different prepared levels can be opened repeatedly through the menu', async ({ page }) => {
  test.setTimeout(60000)
  const escapade = JSON.parse(await readFile(new URL('../../public/levels/jumping/escapade.jump-level.json', import.meta.url), 'utf8'))
  const levels = [FIRST_LEVEL, CAMPAIGN[1], escapade]
  await useLevelFixtures(page, levels)
  await page.goto('/lab')
  for (let repeat = 0; repeat < 2; repeat++) for (const level of levels) {
    await page.getByRole('button', { name: `Play ${level.name}`, exact: true }).click()
    await expect(page.getByRole('img', { name: `${level.name}: reach the exit`, exact: true })).toBeFocused()
    await expect(page.locator('.jumping-route-notice')).toHaveCount(0)
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Level menu', exact: true }).click()
    await expect(page.getByRole('button', { name: `Play ${level.name}`, exact: true })).toBeVisible()
  }
})
