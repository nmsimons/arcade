import { test, expect } from './helpers/test.mjs'

test('anonymous play stays available and providers load only after opening the account panel', async ({ page }) => {
  const external = [], errors = []
  page.on('request', request => { if (/google|microsoft|live\.com/.test(request.url())) external.push(request.url()) })
  page.on('pageerror', error => errors.push(error.message))
  const response = await page.goto('/')
  expect(response.headers()['content-security-policy']).toContain("frame-ancestors 'none'")
  expect(external).toEqual([])
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('dialog', { name: 'Player account' })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Cloud save setup' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Keep playing as a guest' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Import backup', exact: true })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeFocused()
  await page.getByRole('button', { name: 'Hard Vacuum', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Hard Vacuum', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('account panel fits mobile and supports keyboard navigation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/')
  await page.getByRole('button', { name: 'Sign in' }).click()
  const panel = page.locator('.account-panel')
  const box = await panel.boundingBox(); expect(box.x).toBeGreaterThanOrEqual(0); expect(box.width).toBeLessThanOrEqual(390)
  await expect(page.getByRole('button', { name: 'Close account' })).toBeFocused()
  await page.keyboard.press('Escape'); await expect(panel).toHaveCount(0)
})

test('production CSP permits personal OneDrive downloads without credentials', async ({ page }) => {
  const url = 'https://my.microsoftpersonalcontent.com/personal/test/_layouts/15/download.aspx?UniqueId=file&tempauth=test-only'
  let headers
  await page.route(url, route => {
    headers = route.request().headers()
    return route.fulfill({ json: { banked: 42 }, headers: { 'Access-Control-Allow-Origin': '*' } })
  })
  await page.goto('/')
  const result = await page.evaluate(async url => {
    const response = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error' })
    return response.json()
  }, url)
  expect(result).toEqual({ banked: 42 })
  expect(headers.authorization).toBeUndefined()
  expect(headers.cookie).toBeUndefined()
  expect(headers.referer).toBeUndefined()
})
