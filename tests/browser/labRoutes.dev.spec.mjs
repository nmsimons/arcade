import { test, expect } from './helpers/test.mjs'

// The level library is a development tool reached by its own address. Back to game means the game itself:
// the facility, where a fresh save wakes in Orientation.
async function expectFacility(page) {
  await expect(page).toHaveURL(/\/lab$/)
  await expect(page.getByRole('img', { name: 'Orientation', exact: true })).toBeVisible({ timeout: 30000 })
  await expect(page.locator('.jumping-level-browser')).toHaveCount(0)
}

test('the development lighting study opens under /lab and goes back to the facility', async ({ page }) => {
  await page.goto('/lab/lighting-lab')
  await expect(page.getByRole('heading', { name: 'After hours.', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Back to game', exact: true }).click()
  await expectFacility(page)
})

test('the level studio goes back to the facility, not the level library', async ({ page }) => {
  await page.goto('/lab/builder')
  await expect(page.getByRole('textbox', { name: 'Level name', exact: true })).toBeVisible({ timeout: 30000 })
  await page.getByRole('button', { name: 'Back to game', exact: true }).click()
  await expectFacility(page)
})
