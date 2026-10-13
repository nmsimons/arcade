import { test, expect } from './helpers/test.mjs'

test('the development lighting study opens under /lab and returns to the level menu', async ({ page }) => {
  await page.goto('/lab/lighting-lab')
  await expect(page.getByRole('heading', { name: 'After hours.', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Back to game', exact: true }).click()
  await expect(page).toHaveURL(/\/lab$/)
  await expect(page.getByRole('img', { name: 'L.A.B. Experiments', exact: true })).toBeVisible()
})
