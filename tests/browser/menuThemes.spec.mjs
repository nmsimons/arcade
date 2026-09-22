import { test, expect } from './helpers/test.mjs'
import { setup, tap } from './helpers/controller.mjs'

const titles = ['Hard Vacuum', 'Bumper Ball', 'Urban Fire']
const paint = button => button.evaluate(element => {
  const style = getComputedStyle(element)
  return { font: style.fontFamily, fill: style.backgroundColor, outline: style.outlineColor, width: style.outlineWidth }
})

for (const [path, title] of [['bumper-ball', 'BUMPER BALL'], ['urban-fire', 'Urban Fire']]) {
  test(`${path} action labels retain contrast in default, selected and hovered states`, async ({ page }) => {
    await page.goto(`/${path}`)
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
    const buttons = page.getByRole('dialog').getByRole('button')
    const check = async () => {
      const colors = await buttons.evaluateAll(elements => elements.map(element => {
        const style = getComputedStyle(element)
        return { text: style.color, gradient: style.backgroundImage }
      }))
      const luminance = color => {
        const rgb = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => value / 255)
          .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
        return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722
      }
      for (const { text, gradient } of colors) for (const stop of gradient.match(/rgb\([^)]+\)/g) ?? []) {
        const a = luminance(text), b = luminance(stop)
        expect((Math.max(a, b) + .05) / (Math.min(a, b) + .05), `${text} on ${stop}`).toBeGreaterThanOrEqual(4.5)
      }
    }
    await check()
    for (let i = 0; i < await buttons.count(); i++) {
      await buttons.nth(i).hover(); await check()
      await page.mouse.move(5, 5); await page.keyboard.press('Tab'); await check()
    }
  })
}

test('arcade entries have distinct materials, decorative covers and one clear keyboard selection', async ({ page }, info) => {
  const scripts = []; page.on('request', request => { if (request.resourceType() === 'script') scripts.push(request.url()) })
  await page.goto('/')
  const cards = titles.map(name => page.getByRole('button', { name, exact: true }))
  await expect(cards[0]).toBeFocused()
  await expect(page.getByRole('button')).toHaveCount(3)
  await expect(page.locator('.arcade-choice img[aria-hidden="true"][data-art-state="ready"]')).toHaveCount(3)
  expect((await paint(cards[0])).font).toContain('monospace')
  expect((await paint(cards[1])).font).toContain('Trebuchet')
  const fills = await Promise.all(cards.map(async card => (await paint(card)).fill))
  expect(new Set(fills).size).toBe(3)
  expect(scripts.filter(url => /Game-[^/]+\.js/.test(url))).toEqual([])
  for (const [key, index] of [['ArrowRight', 1], ['ArrowDown', 2], ['Tab', 0], ['End', 2], ['Home', 0]]) {
    await page.keyboard.press(key)
    await expect(cards[index]).toBeFocused()
    await expect(cards[index]).toHaveCSS('outline-width', '2px')
  }
  await page.screenshot({ path: info.outputPath('arcade-desktop.png') })
  // Clicking the illustration is still clicking the one accessible game entry.
  await cards[2].locator('.game-art').click()
  await expect(page.getByRole('button', { name: 'Deploy', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(cards[2]).toBeFocused()
})

test('controller selection, themed pause, connection hints and return focus work across the arcade', async ({ page }) => {
  await setup(page, undefined, 'standard', '/')
  await tap(page, 13); await tap(page, 13)
  await expect(page.getByRole('button', { name: 'Urban Fire', exact: true })).toBeFocused()
  const urbanDownload = page.waitForResponse(/\/assets\/UrbanFireGame-[^/]+\.js$/)
  await tap(page, 0)
  await (await urbanDownload).finished()
  await page.clock.runFor(700) // Resolve Suspense's minimum loading-screen interval.
  const deploy = page.getByRole('button', { name: 'Deploy', exact: true })
  await expect(deploy).toBeFocused()
  await expect(deploy).toHaveCSS('outline-color', 'rgb(52, 77, 62)')
  await expect(page.locator('.urban-help')).toContainText('RT / R2')
  await expect(page.locator('.urban-help')).not.toContainText('WASD')
  await tap(page, 0); await tap(page, 9)
  await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeFocused()
  await expect(page.locator('.urban-report')).toContainText('WAVE')
  await expect(page.locator('.urban-help')).toContainText('B / ○ resumes')
  await page.evaluate(() => { window.testPad.connected = false }); await page.clock.runFor(64)
  await expect(page.locator('.urban-help')).toContainText('P / Esc resumes')
  await expect(page.locator('.urban-help')).not.toContainText('B / ○')
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Urban Fire', exact: true })).toBeFocused()
  const bumperDownload = page.waitForResponse(/\/assets\/KickballGame-[^/]+\.js$/)
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('Enter')
  await (await bumperDownload).finished(); await page.clock.runFor(700)
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeFocused()
  await page.evaluate(() => { window.testPad.connected = true }); await page.clock.runFor(64)
  await expect(page.locator('.bumper-help')).toContainText('RT / R2')
  await expect(page.locator('.bumper-help')).not.toContainText('WASD')
  await tap(page, 0); await tap(page, 9)
  await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeFocused()
  await expect(page.locator('.bumper-menu')).toContainText('TIME OUT')
  await tap(page, 13); await tap(page, 0)
  await expect(page.getByRole('button', { name: 'Bumper Ball', exact: true })).toBeFocused()
})

for (const viewport of [{ width: 360, height: 640 }, { width: 620, height: 360 }, { width: 1280, height: 800 }]) {
  test(`all themed menus fit horizontally and scroll focused actions into view at ${viewport.width}×${viewport.height}`, async ({ page }, info) => {
    await page.setViewportSize(viewport)
    for (const [path, title] of [['/', 'Select Game'], ['/urban-fire', 'Urban Fire'], ['/bumper-ball', 'BUMPER BALL'], ['/hard-vacuum', 'Hard Vacuum']]) {
      await page.goto(path)
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
      const dialog = page.getByRole('dialog'), buttons = dialog.getByRole('button')
      expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
      await page.screenshot({ path: info.outputPath(`${path.replaceAll('/', '') || 'arcade'}-${viewport.width}.png`) })
      for (let i = 0; i < await buttons.count(); i++) {
        const active = dialog.locator('button:focus')
        await expect(active).toHaveCount(1)
        const bounds = await active.boundingBox()
        expect(bounds.x).toBeGreaterThanOrEqual(0)
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width + 1)
        expect(bounds.y).toBeGreaterThanOrEqual(0)
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height + 1)
        await page.keyboard.press('Tab')
      }
      if (path === '/hard-vacuum') {
        expect(await dialog.evaluate(element => getComputedStyle(element).fontFamily)).toContain('monospace')
        await expect(dialog.locator('.menu-surface')).toHaveCSS('border-top-color', 'rgb(49, 71, 63)')
      }
    }
  })
}

test('real-renderer covers stay still, resize sharply, and never start audio or save a game', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 })
  try {
    const page = await context.newPage()
    await page.addInitScript(() => {
      window.previewEffects = { audio: 0, saves: 0 }
      const Audio = window.AudioContext
      window.AudioContext = class extends Audio { constructor(...args) { super(...args); window.previewEffects.audio++ } }
      const save = Storage.prototype.setItem
      Storage.prototype.setItem = function (...args) { window.previewEffects.saves++; return save.apply(this, args) }
      Object.defineProperty(navigator, 'getGamepads', { value: () => [] })
    })
    await page.goto('/')
    const covers = page.locator('.game-art')
    await expect(page.locator('.game-art[data-art-state="ready"]')).toHaveCount(3)
    await covers.evaluateAll(images => Promise.all(images.map(image => image.decode())))
    const sources = await covers.evaluateAll(images => images.map(image => image.src))
    for (let i = 0; i < 6; i++) await page.keyboard.press('Tab')
    expect(await covers.evaluateAll(images => images.map(image => image.src))).toEqual(sources)
    await page.setViewportSize({ width: 620, height: 360 })
    await expect.poll(() => covers.evaluateAll(images => images.every(image => image.complete && image.naturalWidth === Math.round(image.getBoundingClientRect().width * 2)
      && image.naturalHeight === Math.round(image.getBoundingClientRect().height * 2)))).toBe(true)
    expect(await covers.evaluateAll(images => images.map(image => image.src))).not.toEqual(sources)
    expect(await page.evaluate(() => window.previewEffects)).toEqual({ audio: 0, saves: 0 })
    await expect(page.locator('canvas')).toHaveCount(0)
  } finally { await context.close() }
})

test('a failed decorative preview never blocks the selector or game', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await page.route('**/assets/urban-*.js', route => route.abort('failed'))
  await page.goto('/')
  await expect(page.locator('.game-art-urban')).toHaveAttribute('data-art-state', 'unavailable')
  await page.keyboard.press('End'); await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Deploy', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('img', { name: 'Urban Fire battlefield', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

for (const [path, title] of [['hard-vacuum', 'Hard Vacuum'], ['bumper-ball', 'BUMPER BALL'], ['urban-fire', 'Urban Fire']]) {
  test(`${path} focus has one stable ring and preserves secondary button hierarchy`, async ({ page }) => {
    await page.goto(`/${path}`)
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
    const buttons = page.getByRole('dialog').getByRole('button')
    const positions = await buttons.evaluateAll(elements => elements.map(element => {
      const { x, y, width, height } = element.getBoundingClientRect()
      return { x, y, width, height }
    }))
    for (let i = 0; i < await buttons.count(); i++) {
      const selected = buttons.nth(i)
      await selected.focus()
      await expect(selected).toHaveCSS('outline-width', '2px')
      expect(await selected.evaluate(element => getComputedStyle(element, '::after').content)).toBe('none')
      await selected.hover()
      await expect(selected).toBeFocused()
      await expect(selected).toHaveCSS('outline-width', '2px')
      expect(await selected.boundingBox()).toEqual(positions[i])
    }
    if (path === 'bumper-ball' || path === 'urban-fire') {
      const secondary = buttons.last()
      const text = await secondary.evaluate(element => getComputedStyle(element).color)
      const primary = buttons.first()
      await primary.focus()
      expect(await primary.evaluate(element => getComputedStyle(element).color)).not.toBe(text)
    }
  })
}

for (const [path, chunk, theme] of [['bumper-ball', 'KickballGame', 'bumper'], ['urban-fire', 'UrbanFireGame', 'urban']]) {
  test(`${path} keeps its own theme while loading and recovering from a failed download`, async ({ page }, info) => {
    let release
    const pending = new Promise(resolve => { release = resolve })
    await page.route(`**/assets/${chunk}-*.js`, async route => { await pending; await route.abort('failed') })
    try {
      await page.goto(`/${path}`)
      const loading = page.getByRole('dialog', { name: 'Loading game', exact: true })
      await expect(loading).toHaveClass(new RegExp(`${theme}-overlay`))
      await expect(loading.getByRole('button', { name: 'Back to game selector' })).toBeFocused()
      release()
      const failed = page.getByRole('dialog', { name: 'Game unavailable', exact: true })
      await expect(failed).toHaveClass(new RegExp(`${theme}-overlay`))
      await expect(failed.getByRole('button', { name: 'Reload game' })).toBeFocused()
      await page.screenshot({ path: info.outputPath(`${theme}-recovery.png`) })
      await page.keyboard.press('Escape')
      await expect(page.getByRole('heading', { name: 'Select Game' })).toBeVisible()
    } finally { release() }
  })
}
