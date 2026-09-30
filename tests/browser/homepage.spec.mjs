import { test, expect } from './helpers/test.mjs'

const titles = ['Hard Vacuum', 'Bumper Ball', 'Urban Fire', 'Untitled Jumping Game']

for (const width of [320, 390, 768, 1280]) {
  test(`homepage presentation and account controls at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: 'Dream Large Arcade', exact: true })).toBeVisible()
    await expect(page.locator('.arcade-logo')).toBeVisible()
    expect(await page.locator('.arcade-logo').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true)
    await expect(page.locator('.arcade-choice')).toHaveCount(titles.length)
    await expect(page.locator('.game-art[data-art-state="ready"]')).toHaveCount(titles.length)
    expect(await page.locator('.arcade-overlay').evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
    const clippedTitles = await page.locator('.arcade-title').evaluateAll(elements =>
      elements.filter(element => element.scrollWidth > element.clientWidth + 1).map(element => element.textContent))
    expect(clippedTitles).toEqual([])

    const signIn = page.getByRole('button', { name: 'Sign in', exact: true })
    await expect(signIn).toBeVisible()
    const buttonBounds = await signIn.boundingBox()
    const statusBounds = await page.locator('.arcade-account-bar > span').boundingBox()
    expect(statusBounds.x + statusBounds.width).toBeLessThanOrEqual(buttonBounds.x)
    expect(Math.abs(statusBounds.y + statusBounds.height / 2 - buttonBounds.y - buttonBounds.height / 2)).toBeLessThanOrEqual(2)
    expect(buttonBounds.x + buttonBounds.width).toBeLessThanOrEqual(width)

    // Every menu action remains reachable, including cards below the fold.
    await expect(page.getByRole('button', { name: titles[0], exact: true })).toBeFocused()
    for (const name of titles.slice(1)) {
      await page.keyboard.press('Tab')
      const card = page.getByRole('button', { name, exact: true })
      await expect(card).toBeFocused()
      await expect(card).toBeInViewport()
    }
    for (const name of ['Privacy policy', 'Terms of service']) {
      await page.keyboard.press('Tab')
      await expect(page.getByRole('link', { name, exact: true })).toBeFocused()
    }
    await page.keyboard.press('Tab')
    await expect(signIn).toBeFocused()
    await page.keyboard.press('Enter')
    const account = page.getByRole('dialog', { name: 'Player account', exact: true })
    await expect(account).toBeVisible()
    await expect(account.getByRole('button', { name: 'Sign in with Microsoft', exact: true })).toBeVisible()
    await expect(account.getByRole('button', { name: 'Sign in with Google', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Close account', exact: true }).click()
    await expect(account).toHaveCount(0)
    await expect(signIn).toBeFocused()
    expect(errors).toEqual([])
  })
}

test('homepage policy links open their public documents', async ({ page }) => {
  for (const [name, path] of [['Privacy policy', 'privacy.html'], ['Terms of service', 'terms.html']]) {
    await page.goto('/')
    await page.getByRole('link', { name, exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/${path.replace('.', '\\.')}$`))
    await expect(page.getByRole('heading', { level: 1, name, exact: true })).toBeVisible()
  }
})
