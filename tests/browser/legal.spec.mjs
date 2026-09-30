import { test, expect } from './helpers/test.mjs'
import { hold, setup, tap } from './helpers/controller.mjs'

const policies = [['privacy.html', 'Privacy policy'], ['terms.html', 'Terms of service']]

test.describe('public policy documents', () => {
  test.use({ javaScriptEnabled: false })
  for (const [path, heading] of policies) {
    test(`${path} serves readable policy content without the game or JavaScript`, async ({ page }) => {
      const response = await page.goto(`/${path}`)
      expect(response.status()).toBe(200)
      await expect(page).toHaveTitle(`${heading} — Dream Large Arcade`)
      await expect(page.getByRole('heading', { level: 1, name: heading, exact: true })).toBeVisible()
      await expect(page.locator('script')).toHaveCount(0)
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await expect(page.locator('main')).toContainText('cloud')
      for (const [target, label] of policies) {
        await expect(page.getByRole('navigation').getByRole('link', { name: label })).toHaveAttribute('href', `./${target}`)
      }
      for (const width of [1280, 360]) {
        await page.setViewportSize({ width, height: 800 })
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      }
      await expect(page.getByRole('link', { name: 'Return to Arcade' })).toHaveAttribute('href', './')
    })
  }
})

test('homepage policy links are reachable and open with the keyboard', async ({ page }) => {
  for (const [path, heading] of policies) {
    await page.goto('/')
    await expect(page).toHaveTitle('Dream Large Arcade')
    await expect(page.locator('.arcade-brand-name')).toHaveText('Dream Large')
    await expect(page.getByRole('button', { name: 'Hard Vacuum', exact: true })).toBeFocused()
    await page.keyboard.press('End')
    if (path === 'privacy.html') await page.keyboard.press('Shift+Tab')
    const link = page.getByRole('link', { name: heading, exact: true })
    await expect(link).toBeFocused()
    await expect(link).toHaveAttribute('href', `/${path}`)
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(new RegExp(`/${path.replace('.', '\\.')}$`))
    await expect(page.getByRole('heading', { level: 1, name: heading, exact: true })).toBeVisible()
  }
})

test('controller navigation can select and open a homepage policy link', async ({ page }) => {
  await setup(page, undefined, 'standard', '/')
  for (let i = 0; i < 4; i++) await tap(page, 13)
  await expect(page.getByRole('link', { name: 'Privacy policy', exact: true })).toBeFocused()
  // This leaves the app document, so there is no gamepad context to release in.
  await hold(page, 0, 1)
  await expect(page).toHaveURL(/\/privacy\.html$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy policy', exact: true })).toBeVisible()
})
