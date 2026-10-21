import { unlockJumpingLevels } from './helpers/jumpingLevels.mjs'
import { finishJumpingEntrance, installBuiltInFixtures } from './helpers/jumpingLevels.mjs'
import { test, expect } from './helpers/test.mjs'
import { useLevelFixtures } from './helpers/jumpingLevels.mjs'
import { hold, tap } from './helpers/controller.mjs'
import { blankTrial } from '../../src/games/jumping/level.ts'
import { expectAccessibleSelection } from './helpers/jumpingAccessibility.mjs'
import { androidMaterials } from '../../src/games/jumping/androidArtwork.ts'

const levels = () => ['First room', 'Second room', 'Third room'].map((name, i) => ({ ...blankTrial(), id: `menu-${i}`, name }))
async function open(page, _legacy = false, maps = levels()) {
  await useLevelFixtures(page, maps)
  await unlockJumpingLevels(page, maps.slice(0, -1))
  await installBuiltInFixtures(page, Object.fromEntries(maps.map((level, i) => [`${String(i).padStart(2, '0')}-fixture.json`, level])))
  await page.addInitScript(() => {
    window.testPad = { index: 0, id: 'Menu controller', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [window.testPad] })
  })
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/lab')
  await expect(page.getByRole('button', { name: `Level 1: ${maps[0].name}`, exact: true })).toBeVisible()
  // Finish thumbnail worker preparation before jumping past its deadline.
  await expect.poll(() => page.locator('.jumping-level-browser .jumping-level-card .level-thumbnail').first().evaluate(c => c.width)).toBeGreaterThan(1)
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z')); await page.clock.runFor(64)

}

test('level tiles launch immediately by click, Enter or controller A, with focus updating the selection', async ({ page }, info) => {
  await open(page)
  await expect(page.locator('.jumping-level-detail')).toHaveCount(0)
  await expect(page.locator('.jumping-level-edit')).toHaveCount(0)
  const second = page.getByRole('button', { name: 'Level 2: Second room', exact: true })
  await second.hover()
  await expect(second).toBeFocused(); await expect(second).toHaveAttribute('aria-pressed', 'true')
  await expect(second).toHaveAccessibleDescription('Best 0:00.00 Grade A')
  await tap(page, 3)
  await expect(page.getByRole('dialog', { name: 'L.A.B. Experiments', exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath('direct-level-menu.png') })
  await second.click()
  await expect(page.getByRole('img', { name: 'Second room: reach the exit' })).toBeFocused()
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'Level menu', exact: true }).click()
  await page.getByRole('button', { name: 'Level 3: Third room', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('img', { name: 'Third room: reach the exit' })).toBeFocused()
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'Level menu', exact: true }).click()
  await page.getByRole('button', { name: 'Level 1: First room', exact: true }).focus(); await page.clock.runFor(64)
  await hold(page, 0, 1, 600)
  await expect(page.getByRole('img', { name: 'First room: reach the exit' })).toBeFocused()
  await expect(page.locator('.jumping-state')).toHaveText('Entering the level')
  await finishJumpingEntrance(page)
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
  const names = ['Resume', 'Restart level', 'Level menu', 'Controls', 'Back to arcade']
  for (const name of names) {
    await expectAccessibleSelection(button(name))
    await page.keyboard.press('Tab')
  }
  await button('Controls').hover()
  await expect(button('Controls')).toHaveCSS('background-color', 'rgb(171, 185, 167)')
  await button('Controls').click()
  await button('Back').click()
  await page.mouse.move(0, 0)
  // Controller input after a pointer click must restore visible focus even if
  // the browser would not give programmatic focus :focus-visible styling.
  await page.clock.runFor(64); await tap(page, 13)
  await expectAccessibleSelection(button('Back to arcade'))
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
    for (const name of ['Resume', 'Restart level', 'Level menu', 'Controls', 'Back to arcade']) {
      const button = page.getByRole('button', { name, exact: true })
      await expect(button).toBeFocused()
      await expect(button).toBeInViewport({ ratio: 1 })
      await page.keyboard.press('Tab')
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

test('pause has no brightness control and night ignores the retired saved preference', async ({ page }, info) => {
  const maps = levels()
  maps[0].version = 2; maps[0].lighting = { nightMode: true, ambient: 0, lights: [] }
  await page.addInitScript(() => localStorage.setItem('arcade.jumping.night-ambient.v1', '45'))
  await open(page, false, maps)
  await page.getByRole('button', { name: 'Play First room', exact: true }).click()
  await expect(page.locator('canvas[role="img"]')).toBeFocused()
  await page.clock.runFor(64); await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await expect(page.getByRole('status')).toContainText('Paused while the game was out of focus.')
  await expect(page.getByRole('slider', { name: 'Night brightness' })).toHaveCount(0)
  const wallColor = () => page.locator('canvas[role="img"]').evaluate(canvas => {
    // This fixture's empty central wall stays clear of actors and the enclosing
    // solid. Panel pigments split the wall into several subtly different colors.
    const size = Math.max(1, Math.floor(Math.min(canvas.width, canvas.height) * .08))
    const pixels = canvas.getContext('2d').getImageData(Math.floor(canvas.width / 2 - size / 2),
      Math.floor(canvas.height * .45 - size / 2), size, size).data, counts = new Map()
    for (let i = 0; i < pixels.length; i += 4) {
      const key = [...pixels.slice(i, i + 3)].join(','); counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return [...counts].sort((a, b) => b[1] - a[1])[0][0].split(',').map(Number)
  })
  const baseline = [241, 241, 237].map(channel => Math.round(channel * .35))
  // Quiet panel pigments vary slightly; the retired 45% preference would
  // brighten these channels by more than twenty steps.
  const expectWallBaseline = async () => (await wallColor()).forEach((channel, i) =>
    expect(Math.abs(channel - baseline[i])).toBeLessThanOrEqual(2))
  await expectWallBaseline()
  await page.getByRole('button', { name: 'Restart level', exact: true }).click()
  await page.keyboard.press('Escape')
  await expectWallBaseline()
  await page.clock.resume(); await page.reload()
  await expect(page.locator('canvas[role="img"]')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('slider', { name: 'Night brightness' })).toHaveCount(0)
  await expectWallBaseline()
  await page.screenshot({ path: info.outputPath('fixed-night-pause.png') })
})

test('completion actions retain accessible selection and reflow with enlarged text', async ({ page }, info) => {
  const maps = levels()
  maps[0].goal = { ...maps[0].entrance }
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

test('level URLs support direct entry, reload, Back and Forward without extra menu history', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: 'Play Second room', exact: true }).click()
  await expect(page).toHaveURL(/\/levels\/built-in\/01-fixture.json$/)
  await page.goBack()
  await expect(page).toHaveURL(/\/lab$/)
  await expect(page.getByRole('button', { name: 'Level 2: Second room', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.goForward()
  await expect(page.getByRole('img', { name: 'Second room: reach the exit' })).toBeFocused()
  await page.clock.resume(); await page.reload()
  await expect(page.getByRole('img', { name: 'Second room: reach the exit' })).toBeFocused()
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'Level menu', exact: true }).click()
  await expect(page).toHaveURL(/\/lab$/)
  await page.goForward()
  await expect(page.getByRole('img', { name: 'Second room: reach the exit' })).toBeFocused()
})

test('unavailable level links stay recoverable and retired local links have no folder workflow', async ({ page }) => {
  await open(page)
  await page.clock.resume()
  await page.goto('/lab/levels/built-in/missing.json')
  await expect(page.getByText('Could not find missing.json.', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Play First room', exact: true }).click()
  await expect(page.getByRole('img', { name: 'First room: reach the exit' })).toBeFocused()
  await page.goto('/lab/not-a-route')
  await expect(page.getByText('That level link is unavailable. Choose a level below.')).toBeVisible()
})
