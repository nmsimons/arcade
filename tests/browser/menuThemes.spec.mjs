import { test, expect } from './helpers/test.mjs'
import { setup, tap } from './helpers/controller.mjs'

const titles = ['Hard Vacuum', 'Bumper Ball', 'Urban Fire', 'Untitled Jumping Game']
const paint = button => button.evaluate(element => {
  const style = getComputedStyle(element)
  return { font: style.fontFamily, fill: style.backgroundColor, outline: style.outlineColor, width: style.outlineWidth }
})

test('homepage account label stays readable on hover and keyboard focus', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const button = page.getByRole('button', { name: 'Sign in', exact: true })
  await expect(button).toBeVisible()
  const contrast = () => button.evaluate(element => {
    const luminance = color => {
      const rgb = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => value / 255)
        .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
      return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722
    }
    const text = luminance(getComputedStyle(element.querySelector('.account-name')).color)
    const background = luminance(getComputedStyle(element).backgroundColor)
    return (Math.max(text, background) + .05) / (Math.min(text, background) + .05)
  })
  expect(await contrast()).toBeGreaterThanOrEqual(4.5)
  await button.hover()
  await expect.poll(contrast).toBeGreaterThanOrEqual(4.5)
  await page.mouse.move(0, 0)
  await page.keyboard.press('Home')
  await expect(button).toBeFocused()
  expect(await contrast()).toBeGreaterThanOrEqual(4.5)
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
  const signIn = page.getByRole('button', { name: 'Sign in', exact: true })
  const piggyBanks = page.getByRole('link', { name: 'Piggy Banks Online', exact: true })
  const downloads = page.getByRole('link', { name: 'Downloads', exact: true })
  const privacy = page.getByRole('link', { name: 'Privacy policy', exact: true })
  const terms = page.getByRole('link', { name: 'Terms of service', exact: true })
  await expect(signIn).toBeVisible()
  await expect(cards[0]).toBeFocused()
  await expect(page.locator('.arcade-games').getByRole('button')).toHaveCount(titles.length)
  await expect(page.locator('.arcade-choice img[aria-hidden="true"][data-art-state="ready"]')).toHaveCount(titles.length)
  expect((await paint(cards[0])).font).toContain('monospace')
  expect((await paint(cards[1])).font).toContain('Trebuchet')
  const fills = await Promise.all(cards.map(async card => (await paint(card)).fill))
  expect(new Set(fills).size).toBe(titles.length)
  expect(scripts.filter(url => /Game-[^/]+\.js/.test(url))).toEqual([])
  for (const [key, target] of [['ArrowRight', cards[1]], ['ArrowDown', cards[2]], ['Tab', cards[3]], ['Tab', piggyBanks], ['Tab', downloads], ['Tab', privacy], ['Tab', terms], ['Tab', signIn], ['Tab', cards[0]], ['End', terms], ['Home', signIn], ['Tab', cards[0]]]) {
    await page.keyboard.press(key)
    await expect(target).toBeFocused()
    if (target !== signIn) await expect(target).toHaveCSS('outline-width', '2px')
  }
  await page.screenshot({ path: info.outputPath('arcade-desktop.png') })
  await cards[3].focus()
  await cards[3].screenshot({ path: info.outputPath('jumping-card.png') })
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
    for (const [path, title] of [['/', 'Dream Large Arcade'], ['/urban-fire', 'Urban Fire'], ['/bumper-ball', 'BUMPER BALL'], ['/hard-vacuum', 'Hard Vacuum']]) {
      await page.goto(path)
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
      if (path === '/') await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
      const dialog = page.getByRole('dialog'), buttons = dialog.locator('button, a[data-menu-link]')
      expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
      await page.screenshot({ path: info.outputPath(`${path.replaceAll('/', '') || 'arcade'}-${viewport.width}.png`) })
      for (let i = 0; i < await buttons.count(); i++) {
        const active = dialog.locator('button:focus, a[data-menu-link]:focus')
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

test('real-renderer covers stay still, resize sharply, and never start audio or save a game', async ({ browser }, info) => {
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
    await expect(page.locator('.game-art[data-art-state="ready"]')).toHaveCount(titles.length)
    await covers.evaluateAll(images => Promise.all(images.map(image => image.decode())))
    const sources = await covers.evaluateAll(images => images.map(image => image.src))
    const checkPlayerContrast = async () => {
      const contrast = await page.locator('.game-art-jumping').evaluate(image => {
        const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight
        const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0)
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data, light = []
        // The central artwork contains the athlete and surrounding scenery,
        // excluding the bright lamp in the upper corner.
        for (let y = Math.floor(canvas.height * .25); y < canvas.height * .65; y++) for (let x = Math.floor(canvas.width * .3); x < canvas.width * .7; x++) {
          const i = (y * canvas.width + x) * 4
          const rgb = [...pixels.slice(i, i + 3)].map(c => c / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4)
          light.push(rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722)
        }
        light.sort((a, b) => a - b)
        return (light[Math.floor(light.length * .99)] + .05) / (light[Math.floor(light.length / 2)] + .05)
      })
      expect(contrast).toBeGreaterThan(4.5)
    }
    await checkPlayerContrast()
    for (let i = 0; i < 6; i++) await page.keyboard.press('Tab')
    expect(await covers.evaluateAll(images => images.map(image => image.src))).toEqual(sources)
    await page.setViewportSize({ width: 620, height: 360 })
    await expect.poll(() => covers.evaluateAll(images => images.every(image => image.complete && image.naturalWidth === Math.round(image.getBoundingClientRect().width * 2)
      && image.naturalHeight === Math.round(image.getBoundingClientRect().height * 2)))).toBe(true)
    expect(await covers.evaluateAll(images => images.map(image => image.src))).not.toEqual(sources)
    await checkPlayerContrast()
    await page.getByRole('button', { name: 'Untitled Jumping Game', exact: true }).screenshot({ path: info.outputPath('jumping-card-compact.png') })
    expect(await page.evaluate(() => window.previewEffects)).toEqual({ audio: 0, saves: 0 })
    await expect(page.locator('canvas')).toHaveCount(0)
  } finally { await context.close() }
})

test('a failed decorative preview never blocks the selector or game', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await page.route('**/assets/urban-*.js', route => route.abort('failed'))
  await page.goto('/')
  await expect(page.locator('.game-art-urban')).toHaveAttribute('data-art-state', 'unavailable')
  await page.getByRole('button', { name: 'Urban Fire', exact: true }).focus(); await page.keyboard.press('Enter')
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

for (const [path, chunk, title, viewport = { width: 1280, height: 800 }] of [
  ['hard-vacuum', 'HardVacuumGame', 'Hard Vacuum'],
  ['bumper-ball', 'KickballGame', 'Bumper Ball'],
  ['urban-fire', 'UrbanFireGame', 'Urban Fire'],
  ['untitled-jumping-game', 'UntitledJumpingGame', 'Untitled Jumping Game'],
  ['untitled-jumping-game/levels/built-in/07.json', 'UntitledJumpingGame', 'Untitled Jumping Game', { width: 360, height: 640 }],
  ['untitled-jumping-game/levels/built-in/07.json', 'UntitledJumpingGame', 'Untitled Jumping Game', { width: 620, height: 360 }],
]) {
  test(`${path} uses neutral arcade loading and recovery at ${viewport.width}×${viewport.height}`, async ({ page }, info) => {
    await page.setViewportSize(viewport)
    let release
    const pending = new Promise(resolve => { release = resolve })
    await page.route(`**/assets/${chunk}-*.js`, async route => { await pending; await route.abort('failed') })
    try {
      await page.goto(`/${path}`)
      const loading = page.getByRole('dialog', { name: 'Loading game', exact: true })
      await expect(loading.getByText('THE ARCADE', { exact: true })).toBeVisible()
      await expect(loading.getByText(title, { exact: true })).toBeVisible()
      // Check the real appearance while the game implementation is still blocked.
      await expect(loading).toHaveCSS('color', 'rgb(41, 60, 61)')
      await expect(loading.locator('.arcade-route-panel')).toHaveCSS('background-color', 'rgb(252, 250, 244)')
      expect(await loading.evaluate(element => getComputedStyle(element).fontFamily)).toContain('Trebuchet')
      await expect(loading.getByRole('button', { name: 'Back to game selector' })).toBeFocused()
      await page.screenshot({ path: info.outputPath('arcade-loading.png') })
      release()
      const failed = page.getByRole('dialog', { name: 'Game unavailable', exact: true })
      await expect(failed.getByRole('alert')).toContainText('This game could not be loaded')
      await expect(failed.getByText(title, { exact: true })).toBeVisible()
      await expect(failed.getByRole('button', { name: 'Reload game' })).toBeFocused()
      await page.screenshot({ path: info.outputPath('arcade-recovery.png') })
      expect(await failed.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
      for (let i = 0; i < 2; i++) {
        const selected = failed.locator('button:focus')
        await expect(selected).toHaveCSS('outline-width', '2px')
        const bounds = await selected.boundingBox()
        expect(bounds.x).toBeGreaterThanOrEqual(0)
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width)
        expect(bounds.y).toBeGreaterThanOrEqual(0)
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height)
        await page.keyboard.press('Tab')
      }
      await page.keyboard.press('Escape')
      await expect(page.getByRole('heading', { name: 'Dream Large Arcade' })).toBeVisible()
    } finally { release() }
  })
}
