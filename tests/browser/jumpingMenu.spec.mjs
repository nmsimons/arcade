import { test, expect } from './helpers/test.mjs'
import { useLevelFixtures } from './helpers/jumpingLevels.mjs'
import { hold, tap } from './helpers/controller.mjs'
import { blankTrial } from '../../src/games/jumping/level.ts'
import { expectAccessibleSelection } from './helpers/jumpingAccessibility.mjs'

const levels = () => ['First room', 'Second room', 'Third room'].map((name, i) => ({ ...blankTrial(), id: `menu-${i}`, name }))
async function open(page, local = false, maps = levels()) {
  await useLevelFixtures(page, maps)
  await page.addInitScript(maps => {
    window.testPad = { index: 0, id: 'Menu controller', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [window.testPad] })
    window.folderContents = Object.fromEntries(maps.map((level, i) => [`${i}.json`, JSON.stringify(level)]))
    const handle = name => ({ kind: 'file', name, getFile: async () => new File([window.folderContents[name] ?? ''], name),
      createWritable: async () => {
        let staged
        return { write: async text => { staged = text }, close: async () => { window.folderContents[name] = staged }, abort: async () => {} }
      } })
    window.showDirectoryPicker = async () => ({ name: 'Menu levels',
      async *values() { for (const name of Object.keys(window.folderContents)) yield handle(name) },
      async getFileHandle(name, options) {
        if (!(name in window.folderContents) && !options?.create) throw new DOMException('Missing', 'NotFoundError')
        return handle(name)
      },
    })
  }, maps)
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/untitled-jumping-game')
  await expect(page.getByRole('button', { name: `Level 1: ${maps[0].name}`, exact: true })).toBeVisible()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z')); await page.clock.runFor(64)
  if (local) {
    await page.getByRole('button', { name: 'Local folder', exact: true }).click()
    await page.getByRole('button', { name: 'Choose folder', exact: true }).click()
    await expect(page.locator('.jumping-level-edit')).toHaveCount(maps.length)
  }
}

test('level tiles launch immediately by click, Enter or controller A, with focus updating the details', async ({ page }, info) => {
  await open(page)
  await expect(page.locator('.jumping-level-detail button')).toHaveCount(0)
  await expect(page.locator('.jumping-level-detail canvas')).toHaveCount(0)
  await expect(page.locator('.jumping-level-edit')).toHaveCount(0)
  const second = page.getByRole('button', { name: 'Level 2: Second room', exact: true })
  await second.hover()
  await expect(second).toBeFocused(); await expect(second).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.jumping-level-detail')).toContainText('Second room')
  await tap(page, 3)
  await expect(page.getByRole('dialog', { name: 'Untitled Jumping Game', exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath('direct-level-menu.png') })
  await second.click()
  await expect(page.getByRole('img', { name: 'Second room: activate the goal' })).toBeFocused()
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'Level menu', exact: true }).click()
  await page.getByRole('button', { name: 'Level 3: Third room', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('img', { name: 'Third room: activate the goal' })).toBeFocused()
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'Level menu', exact: true }).click()
  await page.getByRole('button', { name: 'Level 1: First room', exact: true }).focus(); await page.clock.runFor(64)
  await hold(page, 0, 1, 600)
  await expect(page.getByRole('img', { name: 'First room: activate the goal' })).toBeFocused()
  await expect(page.locator('.jumping-state')).toHaveText('Ready')
  await hold(page, 0, 0)
})

test('pause controls keep their panel size and return controller focus without resuming the game', async ({ page }, info) => {
  await open(page)
  await page.getByRole('button', { name: 'Play First room', exact: true }).click()
  await expect(page.locator('canvas[role="img"]')).toBeFocused()
  await page.clock.runFor(64); await tap(page, 9)
  const panel = page.locator('.jumping-dialog-panel')
  const pause = page.getByRole('dialog', { name: 'Game paused' })
  await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeFocused()
  for (const size of [{ width: 1280, height: 800 }, { width: 320, height: 740 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size); await page.clock.runFor(64)
    const bounds = await panel.boundingBox()
    if (size.height === 800) {
      const scrollbars = await pause.locator('.jumping-dialog-panel, .jumping-dialog-body').evaluateAll(elements => elements.map(el => el.scrollHeight > el.clientHeight + 1))
      expect(scrollbars).toEqual([false, false])
      const row = page.locator('.jumping-night-ambient'), slider = page.getByRole('slider', { name: 'Night brightness' })
      const rowBounds = await row.boundingBox(), sliderBounds = await slider.boundingBox()
      expect(rowBounds.x + rowBounds.width - sliderBounds.x - sliderBounds.width).toBeCloseTo(14, 0)
    }
    await page.getByRole('button', { name: 'Controls', exact: true }).focus()
    await tap(page, 0)
    await expect(page.getByRole('region', { name: 'How to play' })).toContainText('B / ○')
    await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeFocused()
    await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeInViewport()
    expect(await panel.boundingBox()).toEqual(bounds)
    expect(await panel.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    await tap(page, 1)
    await expect(pause).toBeVisible()
    await expect(page.getByRole('button', { name: 'Controls', exact: true })).toBeFocused()
    await page.getByRole('button', { name: 'Back to arcade', exact: true }).focus()
    await expect(page.getByRole('button', { name: 'Back to arcade', exact: true })).toBeInViewport()
    await page.screenshot({ path: info.outputPath(`pause-panel-${size.width}.png`) })
  }
  await tap(page, 9)
  await expect(pause).toHaveCount(0)
  await expect(page.locator('canvas[role="img"]')).toBeFocused()
})

test('pause selection stays distinct for keyboard, controller and forced colors while hover remains quiet', async ({ page }, info) => {
  await open(page)
  await page.getByRole('button', { name: 'Play First room', exact: true }).click()
  await expect(page.locator('canvas[role="img"]')).toBeFocused()
  await page.keyboard.press('Escape')
  await page.mouse.move(0, 0)
  const button = name => page.getByRole('button', { name, exact: true })
  const names = ['Resume', 'Restart level', 'Level menu', 'Controls', 'Level studio', 'Back to arcade']
  for (const name of names) {
    await expectAccessibleSelection(button(name))
    await page.keyboard.press('Tab')
    if (name === 'Controls') {
      await expect(page.getByRole('slider', { name: 'Night brightness' })).toBeFocused()
      await page.keyboard.press('Tab')
    }
  }
  await button('Controls').hover()
  await expect(button('Controls')).toHaveCSS('background-color', 'rgb(171, 185, 167)')
  await button('Controls').click()
  await button('Back').click()
  await page.mouse.move(0, 0)
  // Controller input after a pointer click must restore visible focus even if
  // the browser would not give programmatic focus :focus-visible styling.
  await page.clock.runFor(64); await tap(page, 13)
  await expect(page.getByRole('slider', { name: 'Night brightness' })).toBeFocused()
  await tap(page, 13)
  await expectAccessibleSelection(button('Level studio'))
  await expect(button('Controls')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  expect(await button('Controls').evaluate(el => el.getAnimations().length)).toBe(0)
  await page.screenshot({ path: info.outputPath('accessible-selection.png') })
  for (const colorScheme of ['light', 'dark']) {
    await page.emulateMedia({ forcedColors: 'active', colorScheme })
    await page.keyboard.press('Home')
    for (const name of names) {
      await expectAccessibleSelection(button(name))
      await expect(button(name)).toHaveCSS('forced-color-adjust', 'none')
      await page.keyboard.press('Tab')
      if (name === 'Controls') await page.keyboard.press('Tab')
    }
    await tap(page, 13)
    await expectAccessibleSelection(button('Restart level'))
    await page.screenshot({ path: info.outputPath(`high-contrast-${colorScheme}.png`) })
  }
})

test('pause and controls reflow at double text size with every action reachable', async ({ page }, info) => {
  await open(page)
  await page.getByRole('button', { name: 'Play First room', exact: true }).click()
  await expect(page.locator('canvas[role="img"]')).toBeFocused()
  await page.keyboard.press('Escape')
  const panel = page.locator('.jumping-dialog-panel')
  // Enlarge type independently of the viewport, as text-only zoom does.
  await page.getByRole('dialog', { name: 'Game paused' }).evaluate(el => {
    el.style.setProperty('--jumping-type-large', '112px')
    el.style.setProperty('--jumping-type-normal', '32px')
    el.style.setProperty('--jumping-type-small', '24px')
  })
  for (const size of [{ width: 1280, height: 800 }, { width: 320, height: 740 }]) {
    await page.setViewportSize(size)
    const bounds = await panel.boundingBox()
    await page.keyboard.press('Home')
    for (const name of ['Resume', 'Restart level', 'Level menu', 'Controls', 'Level studio', 'Back to arcade']) {
      const button = page.getByRole('button', { name, exact: true })
      await expect(button).toBeFocused()
      await expect(button).toBeInViewport({ ratio: 1 })
      await page.keyboard.press('Tab')
      if (name === 'Controls') {
        const slider = page.getByRole('slider', { name: 'Night brightness' })
        await expect(slider).toBeFocused(); await expect(slider).toBeInViewport({ ratio: 1 })
        await page.keyboard.press('Tab')
      }
    }
    await page.getByRole('button', { name: 'Controls', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeInViewport({ ratio: 1 })
    expect(await panel.boundingBox()).toEqual(bounds)
    const clipped = await panel.evaluate(el => [el, ...el.querySelectorAll('h2, p, button, dl, dt, dd')]
      .filter(node => node.clientWidth && node.scrollWidth > node.clientWidth + 1).map(node => node.textContent))
    expect(clipped).toEqual([])
    await page.getByRole('heading', { name: 'Controls.' }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: info.outputPath(`double-text-${size.width}.png`) })
    await page.keyboard.press('Escape')
  }
})

test('night ambient slider updates the paused scene, supports keyboard/controller and survives restarts and reload', async ({ page }, info) => {
  const maps = levels()
  maps[0].version = 2; maps[0].lighting = { nightMode: true, ambient: 0, lights: [] }
  await open(page, false, maps)
  await page.getByRole('button', { name: 'Play First room', exact: true }).click()
  // Level preparation runs in a worker; advancing the clock does not await it.
  await expect(page.locator('canvas[role="img"]')).toBeFocused()
  await page.clock.runFor(64); await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await expect(page.getByRole('status')).toContainText('Paused while the game was out of focus.')
  const scrollbars = await page.locator('.jumping-dialog-panel, .jumping-dialog-body').evaluateAll(elements => elements.map(el => el.scrollHeight > el.clientHeight + 1))
  expect(scrollbars).toEqual([false, false])
  const slider = page.getByRole('slider', { name: 'Night brightness' })
  await expect(slider).toHaveAttribute('min', '35'); await expect(slider).toHaveAttribute('max', '45')
  await expect(slider).toHaveValue('35')
  const wallColor = () => page.locator('canvas[role="img"]').evaluate(canvas => {
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data, counts = new Map()
    for (let i = 0; i < pixels.length; i += 4) {
      const key = [...pixels.slice(i, i + 3)].join(','); counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return [...counts].sort((a, b) => b[1] - a[1])[0][0].split(',').map(Number)
  })
  const before = await wallColor()
  await slider.focus(); await page.keyboard.press('End')
  await expect(slider).toHaveValue('45'); await expect(slider).toBeFocused()
  const after = await wallColor()
  after.forEach((value, i) => expect(Math.abs(value - before[i] * 45 / 35)).toBeLessThanOrEqual(2))
  await page.keyboard.press('ArrowRight'); await expect(slider).toHaveValue('45')
  await page.keyboard.press('Home'); await page.keyboard.press('ArrowLeft'); await expect(slider).toHaveValue('35')
  await page.clock.runFor(64) // Arm the controller after entering the pause screen.
  await tap(page, 15); await expect(slider).toHaveValue('36'); await expect(slider).toBeFocused()
  await tap(page, 14); await expect(slider).toHaveValue('35')
  // Pointer adjustment and controller focus both keep the same saved value.
  const bounds = await slider.boundingBox()
  await slider.click({ position: { x: bounds.width * .65, y: bounds.height / 2 } })
  const chosen = await slider.inputValue(); expect(Number(chosen)).toBeGreaterThan(35)
  await expect.poll(() => page.evaluate(() => localStorage.getItem('arcade.jumping.night-ambient.v1'))).toBe(chosen)
  await tap(page, 13); await expect(page.getByRole('button', { name: 'Level studio', exact: true })).toBeFocused()
  await tap(page, 12); await expect(slider).toBeFocused()
  await page.getByRole('button', { name: 'Controls', exact: true }).click()
  await page.getByRole('button', { name: 'Back', exact: true }).click(); await expect(slider).toHaveValue(chosen)
  await page.getByRole('button', { name: 'Restart level', exact: true }).click()
  await page.keyboard.press('Escape'); await expect(slider).toHaveValue(chosen)
  await page.getByRole('button', { name: 'Level menu', exact: true }).click()
  await page.getByRole('button', { name: 'Play Second room', exact: true }).click()
  await expect(page.locator('canvas[role="img"]')).toBeFocused()
  await page.keyboard.press('Escape'); await expect(slider).toHaveValue(chosen)
  // Daytime ignores the setting, while the preference remains adjustable.
  const dayBefore = await wallColor(); await slider.focus(); await page.keyboard.press('End'); expect(await wallColor()).toEqual(dayBefore)
  await page.clock.resume(); await page.reload(); await expect(page.locator('canvas[role="img"]')).toBeFocused()
  await page.keyboard.press('Escape'); await expect(slider).toHaveValue('45')
  await page.screenshot({ path: info.outputPath('night-ambient-pause.png') })
})

test('night ambient slider stays usable when browser storage is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('Storage disabled', 'SecurityError') } })
  })
  await open(page)
  await page.getByRole('button', { name: 'Play First room', exact: true }).click()
  await expect(page.locator('canvas[role="img"]')).toBeFocused()
  await page.keyboard.press('Escape')
  const slider = page.getByRole('slider', { name: 'Night brightness' })
  await expect(slider).toHaveValue('35'); await slider.focus(); await page.keyboard.press('End')
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowLeft')
  await expect(slider).toHaveValue('42')
  await page.getByRole('button', { name: 'Resume', exact: true }).click(); await page.keyboard.press('Escape')
  await expect(slider).toHaveValue('42')
})

test('completion actions retain accessible selection and reflow with enlarged text', async ({ page }, info) => {
  const maps = levels()
  maps[0].goal = { ...maps[0].spawn }
  await open(page, false, maps)
  await page.getByRole('button', { name: 'Play First room', exact: true }).click()
  await expect(page.locator('canvas[role="img"]')).toBeFocused()
  // Cross the plate and continue through the exit door beside it.
  await page.keyboard.down('d'); await page.clock.runFor(2500); await page.keyboard.up('d')
  await expect(page.getByRole('dialog', { name: 'Level complete' })).toBeVisible()
  await page.mouse.move(0, 0)
  const names = ['Next level', 'Try again', 'Level menu', 'Back to arcade']
  for (const forcedColors of ['none', 'active']) {
    await page.emulateMedia({ forcedColors })
    for (const name of names) {
      await expectAccessibleSelection(page.getByRole('button', { name, exact: true }))
      await page.keyboard.press('Tab')
    }
  }
  await page.emulateMedia({ forcedColors: 'none' })
  // Also honor the user's default font size, without dialog-specific overrides.
  await page.addStyleTag({ content: 'html { font-size: 200%; }' })
  await expect(page.getByRole('button', { name: 'Next level' })).toHaveCSS('font-size', '32px')
  await page.setViewportSize({ width: 320, height: 740 })
  for (const name of names) {
    await expect(page.getByRole('button', { name, exact: true })).toBeFocused()
    await expect(page.getByRole('button', { name, exact: true })).toBeInViewport({ ratio: 1 })
    await page.keyboard.press('Tab')
  }
  expect(await page.locator('.jumping-dialog-panel').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath('completion-double-text.png') })
})

test('local tiles edit independently by button and Y while arrows browse tiles and A plays', async ({ page }, info) => {
  await open(page, true)
  const first = page.getByRole('button', { name: 'Level 1: First room', exact: true })
  await first.focus(); await page.clock.runFor(64)
  await tap(page, 15)
  await expect(page.getByRole('button', { name: 'Level 2: Second room', exact: true })).toBeFocused()
  await expect(page.locator('.jumping-level-detail')).toContainText('Second room')
  await tap(page, 3)
  await expect(page.getByRole('textbox', { name: 'Level name' })).toHaveValue('Second room')
  await expect(page.getByRole('textbox', { name: 'Player hint', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Back to game', exact: true }).click()
  await page.getByRole('button', { name: 'Edit Third room', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Level name' })).toHaveValue('Third room')
  await page.getByRole('button', { name: 'Back to game', exact: true }).click()
  await first.focus(); await page.keyboard.press('y')
  await expect(page.getByRole('textbox', { name: 'Level name' })).toHaveValue('First room')
  await page.getByRole('button', { name: 'Back to game', exact: true }).click()
  await first.focus(); await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Play First room', exact: true })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Edit First room', exact: true })).toBeFocused()
  await page.keyboard.press('ArrowRight'); await expect(first).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('button', { name: 'Level 2: Second room', exact: true })).toBeFocused()
  for (const size of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size); await page.clock.runFor(64)
    await page.getByRole('button', { name: 'Edit Second room', exact: true }).focus()
    await expect(page.getByRole('button', { name: 'Edit Second room', exact: true })).toBeInViewport()
    const tile = await page.locator('.jumping-level-tile').filter({ has: page.getByRole('button', { name: 'Edit Second room', exact: true }) }).boundingBox()
    const edit = await page.getByRole('button', { name: 'Edit Second room', exact: true }).boundingBox()
    const play = await page.getByRole('button', { name: 'Play Second room', exact: true }).boundingBox()
    const remove = await page.locator('.jumping-level-tile').filter({ has: page.getByRole('button', { name: 'Edit Second room', exact: true }) }).getByRole('button', { name: /^Delete / }).boundingBox()
    expect(tile.x + tile.width - remove.x - remove.width).toBeCloseTo(12, 0)
    expect(tile.y + tile.height - edit.y - edit.height).toBeCloseTo(12, 0)
    expect(play.x).toBeGreaterThanOrEqual(tile.x + 10)
    expect(play.x + play.width).toBeLessThan(edit.x)
    expect(edit.x + edit.width).toBeLessThan(remove.x)
    expect(await page.getByRole('dialog').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath(`local-tiles-${size.width}.png`) })
  }
  await page.getByRole('button', { name: 'Edit First room', exact: true }).focus(); await page.clock.runFor(64); await tap(page, 0)
  await expect(page.getByRole('img', { name: 'First room: activate the goal' })).toBeFocused()
})

test('all object types appear in menu, library and overview previews through the game renderer', async ({ page }, info) => {
  const level = { ...blankTrial(), id: 'preview-all', name: 'All objects', width: 800, height: 600, floor: 600,
    spawn: { x: 60, y: 600 }, goal: { x: 650, y: 600 }, checkpoints: [{ x: 90, y: 600 }],
    platforms: [{ x: 50, y: 420, w: 100, h: 20 }],
    props: [{ kind: 'ball', x: 160, y: 600, size: 60 }, { kind: 'box', x: 240, y: 600, size: 60 }],
    robots: [{ x: 340, y: 600, left: 300, right: 400 }],
    mechanisms: [{ id: 'g', kind: 'gate', x: 450, y: 480, w: 20, h: 120, travel: 120 },
      { id: 'h', kind: 'gate', orientation: 'horizontal', x: 180, y: 300, w: 140, h: 20, travel: 140 },
      { id: 'f', kind: 'gate', orientation: 'horizontal', flipX: true, x: 440, y: 300, w: 120, h: 20, travel: 120 },
      { id: 'l', kind: 'lift', x: 540, y: 480, w: 80, h: 20, travel: 120 }],
    triggers: [{ x: 50, y: 600, w: 60, mode: 'weight', target: 'g' }],
    climbables: { ropes: [{ x: 390, y: 100, length: 250, segments: 12 }], ladders: [{ x: 730, top: 250, bottom: 600, platform: -1, side: 1 }] },
    timers: [{ x: 40, y: 90 }], texts: [{ x: 50, y: 30, w: 220, h: 40, text: 'Preview', fontSize: 24, align: 'left' }], pickups: [{ kind: 'stopwatch', x: 300, y: 180 }] }
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype
    for (const method of ['roundRect', 'arc', 'fillRect', 'fillText', 'ellipse', 'strokeRect', 'fill']) {
      const original = proto[method]
      proto[method] = function (...args) {
        if (this.canvas.classList.contains('level-thumbnail')) (this.canvas.previewDraws ??= []).push({ method, args: args.slice(0, 4), color: this.fillStyle })
        return original.apply(this, args)
      }
    }
  })
  await open(page, false, [level])
  const check = async canvas => {
    const calls = await canvas.evaluate(c => c.previewDraws ?? [])
    const has = (method, match) => calls.some(call => call.method === method && match(call.args, call.color))
    for (const [w, h, color] of [[60, 60, '#b3a28d'], [20, 120, '#8f9e98'], [140, 20, '#8f9e98'], [120, 20, '#8f9e98'], [80, 20, '#b3a28d'], [51, 34, '#b3a28d']])
      expect(has('roundRect', (a, c) => a[2] === w && a[3] === h && c === color)).toBe(true)
    expect(has('arc', (a, c) => a[2] === 30 && c === '#8f9e98')).toBe(true)
    expect(has('arc', a => a[0] === 390 && a[1] === 100 && a[2] === 5)).toBe(true)
    expect(has('fillRect', (a, c) => a[2] === 60 && a[3] === 3 && c === '#c4a66b')).toBe(true)
    expect(has('fillRect', (a, c) => a[2] === 2.5 && a[3] === 350 && c === '#87958b')).toBe(true)
    expect(has('fillRect', (a, c) => a[0] === 86 && c === '#a0a3a4')).toBe(true)
    expect(has('fillText', a => a[0] === 'Preview')).toBe(true)
    expect(has('fillText', a => a[0] === '0:00.00')).toBe(true)
    expect(has('fill', (_, c) => c === '#ba8542')).toBe(true)
    expect(has('ellipse', a => a[2] === 6.2)).toBe(true)
    expect(has('strokeRect', a => a[2] === 40 && a[3] === 80)).toBe(true)
  }
  await check(page.locator('.jumping-level-card .level-thumbnail'))
  await page.screenshot({ path: info.outputPath('all-objects-menu.png') })
  await page.getByRole('button', { name: 'Level studio', exact: true }).click()
  await page.getByRole('button', { name: 'Library', exact: true }).click(); await page.clock.runFor(64)
  await check(page.locator('.builder-templates .level-thumbnail'))
  await page.locator('.builder-templates').getByRole('button', { name: /All objects/ }).click(); await page.clock.runFor(64)
  await check(page.locator('.builder-minimap .level-thumbnail'))
  await page.screenshot({ path: info.outputPath('all-objects-overview.png') })
})

test('level URLs support direct entry, reload, Back and Forward without extra menu history', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: 'Play Second room', exact: true }).click()
  await expect(page).toHaveURL(/\/levels\/built-in\/01-fixture.json$/)
  await page.goBack()
  await expect(page).toHaveURL(/\/untitled-jumping-game$/)
  await expect(page.getByRole('button', { name: 'Level 2: Second room', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.goForward()
  await expect(page.getByRole('img', { name: 'Second room: activate the goal' })).toBeFocused()
  await page.clock.resume(); await page.reload()
  await expect(page.getByRole('img', { name: 'Second room: activate the goal' })).toBeFocused()
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'Level menu', exact: true }).click()
  await expect(page).toHaveURL(/\/untitled-jumping-game$/)
  await page.goForward()
  await expect(page.getByRole('img', { name: 'Second room: activate the goal' })).toBeFocused()
})

test('builder and playtest routes save edits and preserve undo history when going back', async ({ page }) => {
  await open(page, true)
  await page.getByRole('button', { name: 'Edit Second room', exact: true }).click()
  await expect(page).toHaveURL(/\/builder\/local\/1.json$/)
  await page.getByRole('textbox', { name: 'Level name' }).fill('Edited route')
  await page.getByRole('button', { name: 'Save and Test', exact: true }).click()
  await expect(page).toHaveURL(/\/builder\/local\/1.json\/playtest$/)
  await expect(page.getByRole('img', { name: 'Edited route: activate the goal' })).toBeFocused()
  expect(await page.evaluate(() => JSON.parse(window.folderContents['1.json']).name)).toBe('Edited route')
  await page.goBack()
  await expect(page.getByRole('textbox', { name: 'Level name' })).toHaveValue('Edited route')
  await page.goForward()
  await expect(page.getByRole('button', { name: 'Return to builder', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Return to builder', exact: true }).click()
  await expect(page).toHaveURL(/\/builder\/local\/1.json$/)
  await expect(page.getByRole('textbox', { name: 'Level name' })).toHaveValue('Edited route')
  await page.getByRole('button', { name: /^Undo/ }).click()
  await expect(page.getByRole('textbox', { name: 'Level name' })).toHaveValue('Second room')
  await page.goBack()
  await expect(page).toHaveURL(/\/untitled-jumping-game$/)
  await page.goForward()
  await expect(page.getByRole('textbox', { name: 'Level name' })).toHaveValue('Second room')
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: 'Open 0.json', exact: true }).click()
  await page.getByRole('button', { name: 'Discard changes', exact: true }).click()
  await expect(page).toHaveURL(/\/builder\/local\/0.json$/)
  await expect(page.getByRole('textbox', { name: 'Level name' })).toHaveValue('First room')
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: 'Use 2.json as template', exact: true }).click()
  await expect(page).toHaveURL(/\/untitled-jumping-game\/builder$/)
  await expect(page.getByRole('textbox', { name: 'Level name' })).toHaveValue('Third room — copy')
  await page.clock.resume(); await page.goto('/untitled-jumping-game/builder')
  await expect(page.getByRole('textbox', { name: 'Level name' })).toBeVisible()
  await page.getByRole('textbox', { name: 'Level name' }).fill('Temporary draft')
  await page.getByRole('button', { name: 'Save and Test', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Level library', exact: true })).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Level library', exact: true }).locator('.builder-library-message')).toContainText('Choose a writable level folder')
  await page.getByRole('button', { name: /^(Choose|Reselect) folder$/, exact: true }).click()
  await page.getByRole('button', { name: 'Close library', exact: true }).click()
  await page.getByRole('button', { name: 'Save and Test', exact: true }).click()
  await expect(page).toHaveURL(/\/builder\/local\/Temporary%20draft.jump-level.json\/playtest$/)
  expect(await page.evaluate(() => JSON.parse(window.folderContents['Temporary draft.jump-level.json']).name)).toBe('Temporary draft')
})

test('file playtest URLs reload saved levels and return to their own builder', async ({ page }) => {
  await open(page)
  await page.clock.resume()
  await page.goto('/untitled-jumping-game/builder/built-in/01-fixture.json/playtest')
  await expect(page.getByRole('img', { name: 'Second room: activate the goal' })).toBeFocused()
  await expect(page.getByRole('button', { name: 'Return to builder', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('img', { name: 'Second room: activate the goal' })).toBeFocused()
  await page.getByRole('button', { name: 'Return to builder', exact: true }).click()
  await expect(page).toHaveURL(/\/builder\/built-in\/01-fixture.json$/)
  await expect(page.getByRole('textbox', { name: 'Level name' })).toHaveValue('Second room')
  await page.goto('/untitled-jumping-game/builder/local/1.json/playtest')
  await expect(page.getByText('Open the local folder containing 1.json to continue.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Choose folder', exact: true }).click()
  await expect(page).toHaveURL(/\/builder\/local\/1.json\/playtest$/)
  await expect(page.getByRole('img', { name: 'Second room: activate the goal' })).toBeFocused()
  await page.getByRole('button', { name: 'Return to builder', exact: true }).click()
  await expect(page).toHaveURL(/\/builder\/local\/1.json$/)
  await expect(page.getByRole('textbox', { name: 'Level name' })).toHaveValue('Second room')
})

test('unavailable level links stay recoverable and local links open after choosing their folder', async ({ page }) => {
  await open(page)
  await page.clock.resume()
  await page.goto('/untitled-jumping-game/levels/built-in/missing.json')
  await expect(page.getByText('Could not find missing.json.', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Play First room', exact: true }).click()
  await expect(page.getByRole('img', { name: 'First room: activate the goal' })).toBeFocused()
  await page.goto('/untitled-jumping-game/levels/local/1.json')
  await expect(page.getByText('Open the local folder containing 1.json to continue.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Choose folder', exact: true }).click()
  await expect(page.getByRole('img', { name: 'Second room: activate the goal' })).toBeFocused()
  await expect(page).toHaveURL(/\/levels\/local\/1.json$/)
  await page.goto('/untitled-jumping-game/not-a-route')
  await expect(page.getByText('That link does not point to a level or builder. Choose a level below.')).toBeVisible()
})
