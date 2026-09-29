import { test, expect } from './helpers/test.mjs'

test('anonymous play stays available and providers load only after opening the account panel', async ({ page }) => {
  const external = [], errors = []
  page.on('request', request => { if (/google|microsoft|live\.com/.test(request.url())) external.push(request.url()) })
  page.on('pageerror', error => errors.push(error.message))
  const response = await page.goto('/')
  expect(response.headers()['content-security-policy']).toContain("frame-ancestors 'none'")
  expect(external).toEqual([])
  await page.getByRole('button', { name: 'Sign in / Cloud saves' }).click()
  await expect(page.getByRole('dialog', { name: 'Player account' })).toBeVisible()
  if (await page.getByText('Sign-in is not configured on this deployment yet.').isVisible()) {
    await expect(page.getByRole('button', { name: 'Sign in with Google', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Sign in with Microsoft', exact: true })).toBeDisabled()
  }
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Sign in / Cloud saves' })).toBeFocused()
  await page.getByRole('button', { name: 'Hard Vacuum', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Hard Vacuum', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('account panel fits mobile and supports keyboard navigation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/')
  await page.getByRole('button', { name: 'Sign in / Cloud saves' }).click()
  const panel = page.locator('.account-panel')
  const box = await panel.boundingBox(); expect(box.x).toBeGreaterThanOrEqual(0); expect(box.width).toBeLessThanOrEqual(390)
  await expect(page.getByRole('button', { name: 'Close account' })).toBeFocused()
  await page.keyboard.press('Escape'); await expect(panel).toHaveCount(0)
})
