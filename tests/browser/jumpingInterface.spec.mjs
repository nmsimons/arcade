import { test, expect } from './helpers/test.mjs'
import { useLevelFixtures } from './helpers/jumpingLevels.mjs'
import { expectAccessibleSelection } from './helpers/jumpingAccessibility.mjs'
import { FIRST_LEVEL } from '../helpers/jumping-fixtures.mjs'

async function open(page) {
  await useLevelFixtures(page, [FIRST_LEVEL])
  await page.goto('/lab')
  await expect(page.locator('.jumping-level-browser .jumping-level-card')).toHaveCount(1)
  await page.locator('.jumping-menu-navigation button').first().focus()
  await page.mouse.move(0, 0)
}

test('level picker keeps its bands stable and gives each keyboard action a contrasting selection', async ({ page }, info) => {
  await open(page)
  const header = page.locator('.jumping-menu-header')
  const bounds = await header.boundingBox()
  await page.keyboard.press('Home')
  expect(await header.boundingBox()).toEqual(bounds)
  for (const forcedColors of ['none', 'active']) {
    await page.emulateMedia({ forcedColors })
    await page.keyboard.press('Home')
    const buttons = page.getByRole('dialog').locator('button:not(:disabled):visible')
    for (let i = 0; i < await buttons.count(); i++) {
      await expectAccessibleSelection(buttons.nth(i))
      await page.keyboard.press('Tab')
    }
  }
  await page.emulateMedia({ forcedColors: 'none' })
  await page.addStyleTag({ content: 'html { font-size: 200%; }' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.keyboard.press('Home')
  const buttons = page.getByRole('dialog').locator('button:not(:disabled):visible')
  for (let i = 0; i < await buttons.count(); i++) {
    await expect(buttons.nth(i)).toBeFocused()
    await expect(buttons.nth(i)).toBeInViewport()
    await page.keyboard.press('Tab')
  }
  expect(await page.locator('.jumping-level-menu').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath('picker-enlarged-text.png') })
})
