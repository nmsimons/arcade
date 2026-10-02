import { test, expect } from './helpers/test.mjs'
import { DESKTOP_DOWNLOADS, DESKTOP_RELEASES_API, DESKTOP_RELEASES_URL } from '../../src/platform/web/desktopRelease.ts'

function release(options = {}) {
  return { tag_name: 'desktop-v0.1.0', draft: false, prerelease: false, assets: DESKTOP_DOWNLOADS.map(option => ({ name: option.asset, state: 'uploaded', size: 42, browser_download_url: `${DESKTOP_RELEASES_URL}/download/desktop-v0.1.0/${option.asset}` })), ...options }
}

for (const width of [320, 1280]) {
  test(`published downloads remain readable and keyboard reachable at ${width}px`, async ({ page }, info) => {
    const scripts = []
    page.on('request', request => { if (request.resourceType() === 'script') scripts.push(request.url()) })
    await page.setViewportSize({ width, height: 800 })
    await page.route(DESKTOP_RELEASES_API, route => route.fulfill({ json: [release()] }))
    await page.goto('/downloads/')
    const section = page.getByRole('region', { name: 'Play offline on your computer' })
    await expect(section.getByRole('status')).toHaveText('Desktop version 0.1.0')
    await expect(page).toHaveTitle('Downloads — Dream Large Arcade')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Download Dream Large Arcade')
    await expect(page.getByRole('img', { name: 'Dream Large Arcade' })).toHaveJSProperty('naturalWidth', 264)
    expect(await page.getByRole('link', { name: 'Dream Large Arcade home' }).evaluate(link => new URL(link.href).pathname)).toBe('/')
    expect(await page.getByRole('link', { name: 'Privacy policy' }).evaluate(link => new URL(link.href).pathname)).toBe('/privacy.html')
    expect(await page.getByRole('link', { name: 'Terms of service' }).evaluate(link => new URL(link.href).pathname)).toBe('/terms.html')
    await expect(page.getByRole('heading', { name: 'Mac — Intel', exact: true })).toHaveCount(0)
    await page.getByRole('link', { name: 'Play in browser', exact: true }).focus()
    await page.keyboard.press('Tab')
    for (const option of DESKTOP_DOWNLOADS) {
      const link = section.getByRole('link', { name: `Download for ${option.label}`, exact: true })
      await expect(link).toBeFocused()
      await expect(link).toBeInViewport()
      await expect(link).toHaveAttribute('href', `${DESKTOP_RELEASES_URL}/download/desktop-v0.1.0/${option.asset}`)
      await page.keyboard.press('Tab')
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(scripts.some(url => /(?:AccountControls|\w+Game)-[^/]+\.js/.test(url))).toBe(false)
    await page.screenshot({ path: info.outputPath('downloads.png'), fullPage: true })
  })
}

test('unpublished downloads show availability honestly while browser games stay playable', async ({ page }) => {
  await page.route(DESKTOP_RELEASES_API, route => route.fulfill({ json: [release({ draft: true }), release({ prerelease: true })] }))
  await page.goto('/downloads/')
  const section = page.getByRole('region', { name: 'Play offline on your computer' })
  await expect(section.getByRole('status')).toHaveText('Desktop downloads are coming soon.')
  await expect(section.getByRole('link')).toHaveCount(0)
  await page.getByRole('link', { name: 'Play in browser', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Hard Vacuum', exact: true })).toBeFocused()
})

test('missing Mac assets stay unavailable and API failures retain a releases fallback', async ({ page }) => {
  await page.route(DESKTOP_RELEASES_API, route => route.fulfill({ json: [release({ assets: release().assets.slice(0, 2) })] }))
  await page.goto('/downloads/')
  const section = page.getByRole('region', { name: 'Play offline on your computer' })
  await expect(section.getByRole('link', { name: /^Download for/ })).toHaveCount(2)
  await expect(section.getByText('Coming soon', { exact: true })).toHaveCount(1)
  await page.route(DESKTOP_RELEASES_API, route => route.fulfill({ status: 403, json: { message: 'Rate limited' } }))
  await page.reload()
  await expect(section.getByRole('status')).toHaveText('Download availability could not be checked.')
  await expect(section.getByRole('link', { name: 'View desktop releases', exact: true })).toHaveAttribute('href', DESKTOP_RELEASES_URL)
  await expect(section.getByRole('link', { name: /^Download for/ })).toHaveCount(0)
})

test('homepage links to the separate downloads page without checking releases or loading downloads', async ({ page }) => {
  const requests = []
  page.on('request', request => requests.push(request.url()))
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Hard Vacuum', exact: true })).toBeFocused()
  await expect(page.getByRole('region', { name: 'Play offline on your computer' })).toHaveCount(0)
  const link = page.getByRole('link', { name: 'Downloads', exact: true })
  await expect(link).toHaveAttribute('href', '/downloads/')
  expect(requests.some(url => url.startsWith('https://api.github.com/'))).toBe(false)
  await link.focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/downloads\/$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Download Dream Large Arcade' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Download Dream Large Arcade' })).toBeVisible()
})

test('downloads retain a public releases link without JavaScript', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL })
  try {
    const page = await context.newPage()
    const response = await page.goto('/downloads/')
    expect(response.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1, name: 'Download Dream Large Arcade' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'desktop releases on GitHub' })).toHaveAttribute('href', DESKTOP_RELEASES_URL)
  } finally { await context.close() }
})
