import { test, expect } from './helpers/test.mjs'

test('the neck shaft and collar overlap as solid artwork in both facings and gravity frames', async ({ page }) => {
  await page.goto('/lab/model-review')
  const pixels = await page.evaluate(async () => {
    const { createPlayer } = await import('/src/games/jumping/model.ts')
    const { drawAthlete } = await import('/src/games/jumping/athlete.ts')
    const canvas = document.createElement('canvas'); canvas.width = 300; canvas.height = 1400
    const ctx = canvas.getContext('2d'), pixels = []
    for (const facing of [-1, 1]) for (const inverted of [false, true]) {
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.translate(150, 700); ctx.scale(10, 10)
      const player = createPlayer(); player.facing = facing; player.inverted = inverted
      drawAthlete(ctx, player, '#686b6e')
      // These points belong to both the neck shaft and the flared collar.
      // Opposite contour winding cuts white holes through their overlap.
      for (const y of [-50.3, -50.2]) pixels.push([...ctx.getImageData(150, Math.round(700 + y * (inverted ? -10 : 10)), 1, 1).data])
    }
    return pixels
  })
  for (const pixel of pixels) expect(pixel).toEqual([101, 122, 112, 255])
})

test('model review synchronizes frozen and current artwork, supports inspection and keeps local notes', async ({ page }, info) => {
  await page.goto('/lab/model-review')
  const workspace = page.getByRole('region', { name: 'Player comparison', exact: true })
  await expect(workspace).toHaveAttribute('data-ready', 'true')
  await page.getByRole('button', { name: 'Catch, brace, pull up' }).click()
  await expect(workspace).toHaveAttribute('data-ready', 'true')
  await page.getByRole('button', { name: 'Key pose', exact: true }).click()
  await expect(page.locator('.model-review-frame-info')).toContainText('Braced hang')
  await page.getByLabel('Hand size', { exact: true }).selectOption('1')
  const comparison = page.locator('canvas[aria-label="Player comparison reference"]')
  const artwork = page.locator('canvas[aria-label="Current player model"]')
  const game = page.locator('canvas[aria-label="Player in the game renderer"]')
  const before = await Promise.all([comparison, artwork, game].map(canvas => canvas.evaluate(el => el.toDataURL())))
  await page.getByLabel('Hand size', { exact: true }).selectOption('1.2')
  await expect.poll(() => artwork.evaluate(el => el.toDataURL())).not.toBe(before[1])
  expect(await comparison.evaluate(el => el.toDataURL())).toBe(before[0])
  expect(await game.evaluate(el => el.toDataURL())).toBe(before[2])
  await page.getByLabel('Hand size', { exact: true }).selectOption('1')
  await expect.poll(() => artwork.evaluate(el => el.toDataURL())).toBe(before[1])
  await page.getByLabel('Hand size', { exact: true }).selectOption('1.12')
  await page.getByLabel('Comparison reference', { exact: true }).selectOption('saved')
  await expect(workspace).toHaveAttribute('data-ready', 'true')
  const frame = Number(await page.getByRole('slider', { name: 'Recording frame' }).inputValue())
  await page.getByRole('button', { name: 'Next frame', exact: true }).click()
  await expect(page.getByRole('slider', { name: 'Recording frame' })).toHaveValue(String(frame + 1))
  await page.getByRole('button', { name: 'Previous frame', exact: true }).click()
  await expect(page.getByRole('slider', { name: 'Recording frame' })).toHaveValue(String(frame))
  await page.getByLabel('Backdrop', { exact: true }).selectOption('night')
  await page.getByLabel('Joints', { exact: true }).check()
  await page.screenshot({ path: info.outputPath('ledge-night-review.png'), fullPage: true })
  await page.getByLabel('Review notes', { exact: true }).fill('Keep normal foot proportions. Inspect the toe pad.')
  await page.reload(); await expect(workspace).toHaveAttribute('data-ready', 'true')
  await expect(page.getByLabel('Review notes', { exact: true })).toHaveValue('Keep normal foot proportions. Inspect the toe pad.')
  await page.getByRole('button', { name: 'Play recording', exact: true }).click()
  await expect.poll(async () => Number(await page.getByRole('slider', { name: 'Recording frame' }).inputValue())).toBeGreaterThan(5)
  await page.getByRole('button', { name: 'Pause playback', exact: true }).click()
  const paused = await page.getByRole('slider', { name: 'Recording frame' }).inputValue()
  await page.getByLabel('Silhouette', { exact: true }).check()
  await expect(page.getByRole('slider', { name: 'Recording frame' })).toHaveValue(paused)
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export frame', exact: false }).click()
  expect((await download).suggestedFilename()).toMatch(/^player-ledge-\d+-hands-\d+\.png$/)
})

test('model review stays usable in portrait without horizontal page overflow', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/lab/model-review?clip=water-push')
  await expect(page.getByRole('region', { name: 'Player comparison', exact: true })).toHaveAttribute('data-ready', 'true')
  await page.getByRole('button', { name: 'Key pose', exact: true }).click()
  await expect(page.locator('.model-review-frame-info')).toContainText('Swimming push')
  expect(await page.locator('.model-review').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath('water-push-portrait.png'), fullPage: true })
})
