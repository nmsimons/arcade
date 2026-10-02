import { test, expect } from './helpers/test.mjs'

const games = [['final-approach', 'Final Approach'], ['no-exit', 'No Exit'], ['sling-load', 'Sling Load']]

for (const [path, title] of games) {
  test(`${title}: Tab and arrows activate the focused action, including after pause`, async ({ page }) => {
    for (const key of ['Tab', 'ArrowDown']) {
      await page.goto(`/${path}`)
      await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeFocused()
      await page.keyboard.press(key)
      await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(page).toHaveURL(/\/$/)
    }
    await page.goto(`/${path}`)
    await page.getByRole('button', { name: 'Start', exact: true }).press('Enter')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.keyboard.press('p')
    await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeFocused()
    await page.keyboard.press('Space')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.keyboard.press('p')
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeFocused()
    await page.keyboard.press('Space')
    await expect(page).toHaveURL(/\/$/)
  })
}

for (const viewport of [{ width: 360, height: 640 }, { width: 620, height: 360 }, { width: 1280, height: 800 }]) {
  test(`vector menus fit and scroll every focused action into view at ${viewport.width}×${viewport.height}`, async ({ page }, info) => {
    await page.setViewportSize(viewport)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    for (const [path, title] of games) {
      await page.goto(`/${path}`)
      const heading = page.getByRole('heading', { name: title, exact: true })
      await expect(heading).toBeVisible()
      const dialog = page.getByRole('dialog')
      expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
      // Measure rendered text too: a fitting element can still contain an
      // overflowing unbreakable title or button label.
      const textBounds = await dialog.locator('h1, h2, p, button').evaluateAll(elements => elements.flatMap(element => {
        const range = document.createRange()
        range.selectNodeContents(element)
        return [...range.getClientRects()].map(rect => ({ left: rect.left, right: rect.right }))
      }))
      for (const bounds of textBounds) {
        expect(bounds.left).toBeGreaterThanOrEqual(0)
        expect(bounds.right).toBeLessThanOrEqual(viewport.width)
      }
      const buttons = dialog.getByRole('button')
      for (let i = 0; i < await buttons.count(); i++) {
        const active = dialog.locator('button:focus')
        await expect(active).toHaveCount(1)
        const bounds = await active.boundingBox()
        expect(bounds.x).toBeGreaterThanOrEqual(0)
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width)
        expect(bounds.y).toBeGreaterThanOrEqual(0)
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height)
        await page.keyboard.press('Tab')
      }
      await heading.scrollIntoViewIfNeeded()
      await page.screenshot({ path: info.outputPath(`${path}-${viewport.width}.png`) })
    }
  })
}

test('Final Approach difficulty selection uses focus without accidentally starting the game', async ({ page }) => {
  await page.goto('/final-approach')
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeFocused()
  await page.keyboard.press('Home')
  await expect(page.getByRole('button', { name: 'easy', exact: true })).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Space')
  await expect(page.getByRole('button', { name: 'medium', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'hard', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible()
})

test('Final Approach crash dialog focuses replay and honors Back on a short screen', async ({ page }, info) => {
  await page.setViewportSize({ width: 620, height: 360 })
  await page.clock.install()
  await page.goto('/final-approach')
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await page.clock.runFor(15000) // Let the unpiloted lander fall and finish exploding.
  await expect(page.getByRole('heading', { name: 'Crashed', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Play Again', exact: true })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeFocused()
  await page.screenshot({ path: info.outputPath('final-approach-result.png') })
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/$/)
})

test('Sling Load mission text and all flight hints fit at phone width', async ({ page }, info) => {
  await page.setViewportSize({ width: 360, height: 640 })
  await page.addInitScript(() => {
    Math.random = () => .9 // Include the longest cargo name in the first mission.
    window.hudText = []
    const fillText = CanvasRenderingContext2D.prototype.fillText
    CanvasRenderingContext2D.prototype.fillText = function(text, x, y, ...rest) {
      if (x === 16 && y <= 200 && this.getTransform().isIdentity) {
        window.hudText.push({ text, right: x + this.measureText(text).width })
        window.hudText = window.hudText.slice(-100)
      }
      return fillText.call(this, text, x, y, ...rest)
    }
  })
  await page.goto('/sling-load')
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.locator('.sling-control-hints')).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.hudText.some(line => line.text.includes('ORDINANCE')))).toBe(true)
  const text = await page.evaluate(() => window.hudText)
  for (const line of text) expect(line.right, line.text).toBeLessThanOrEqual(344)
  for (const hint of await page.locator('.sling-control-hints span').all()) {
    const bounds = await hint.boundingBox()
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(344)
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(624)
  }
  await page.screenshot({ path: info.outputPath('sling-load-hud-360.png') })
})
