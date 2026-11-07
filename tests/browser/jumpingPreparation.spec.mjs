import { readFile } from 'node:fs/promises'
import { test, expect } from './helpers/test.mjs'
import { followLevelLink, openLevelLink, useLevelFixtures, unlockJumpingLevels } from './helpers/jumpingLevels.mjs'
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
  await openLevelLink(page)
  await expect(page.getByRole('dialog', { name: 'Preparing level' })).toBeVisible()
  await expect(page.getByRole('img', { name: `${FIRST_LEVEL.name}: reach the exit`, exact: true })).toBeFocused({ timeout: 15000 })
  expect(delayed).toBe(true)
  await expect(page.locator('.jumping-route-notice')).toHaveCount(0)
})

test('different prepared levels can be opened repeatedly in one session', async ({ page }) => {
  test.setTimeout(60000)
  const escapade = JSON.parse(await readFile(new URL('../../public/levels/jumping/escapade.jump-level.json', import.meta.url), 'utf8'))
  const levels = [FIRST_LEVEL, CAMPAIGN[1], escapade]
  await useLevelFixtures(page, levels)
  await unlockJumpingLevels(page, levels)
  await openLevelLink(page)
  // Each level opens from its link inside the running game, paused before the next one.
  for (let repeat = 0; repeat < 2; repeat++) for (const [index, level] of levels.entries()) {
    if (repeat || index) await followLevelLink(page, `0${index}-fixture.json`)
    await expect(page.getByRole('img', { name: `${level.name}: reach the exit`, exact: true })).toBeFocused()
    await expect(page.getByRole('alert')).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Game paused', exact: true })).toBeVisible()
  }
})
