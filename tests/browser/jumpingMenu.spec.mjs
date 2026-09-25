import { test, expect } from './helpers/test.mjs'
import { useLevelFixtures } from './helpers/jumpingLevels.mjs'
import { hold, tap } from './helpers/controller.mjs'
import { blankTrial } from '../../src/games/jumping/level.ts'

const levels = () => ['First room', 'Second room', 'Third room'].map((name, i) => ({ ...blankTrial(), id: `menu-${i}`, name, description: `Route ${i + 1}` }))
async function open(page, local = false, maps = levels()) {
  await useLevelFixtures(page, maps)
  await page.addInitScript(maps => {
    window.testPad = { index: 0, id: 'Menu controller', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [window.testPad] })
    window.showDirectoryPicker = async () => ({ name: 'Menu levels', async *values() {
      for (const [i, level] of maps.entries()) { const name = `${i}.json`; yield { kind: 'file', name, getFile: async () => new File([JSON.stringify(level)], name) } }
    } })
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

test('level tiles launch immediately by click, Enter or controller A, with focus selecting the preview', async ({ page }, info) => {
  await open(page)
  await expect(page.locator('.jumping-level-detail button')).toHaveCount(0)
  await expect(page.locator('.jumping-level-edit')).toHaveCount(0)
  const second = page.getByRole('button', { name: 'Level 2: Second room', exact: true })
  await second.hover()
  await expect(second).toBeFocused(); await expect(second).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.jumping-level-detail')).toContainText('Route 2')
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

test('local tiles edit independently by button and Y while arrows browse tiles and A plays', async ({ page }, info) => {
  await open(page, true)
  const first = page.getByRole('button', { name: 'Level 1: First room', exact: true })
  await first.focus(); await page.clock.runFor(64)
  await tap(page, 15)
  await expect(page.getByRole('button', { name: 'Level 2: Second room', exact: true })).toBeFocused()
  await expect(page.locator('.jumping-level-detail')).toContainText('Route 2')
  await tap(page, 3)
  await expect(page.getByRole('textbox', { name: 'Level name' })).toHaveValue('Second room')
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
    expect(tile.x + tile.width - edit.x - edit.width).toBeCloseTo(12, 0)
    expect(tile.y + tile.height - edit.y - edit.height).toBeCloseTo(12, 0)
    expect(play.x + play.width).toBeLessThan(edit.x)
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
  await check(page.locator('.jumping-level-preview .level-thumbnail'))
  await page.screenshot({ path: info.outputPath('all-objects-menu.png') })
  await page.getByRole('button', { name: 'Level builder', exact: true }).click()
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

test('builder and playtest routes preserve unsaved edits and undo history when going back', async ({ page }) => {
  await open(page, true)
  await page.getByRole('button', { name: 'Edit Second room', exact: true }).click()
  await expect(page).toHaveURL(/\/builder\/local\/1.json$/)
  await page.getByRole('textbox', { name: 'Level name' }).fill('Unsaved route')
  await page.getByRole('button', { name: 'Playtest', exact: true }).click()
  await expect(page).toHaveURL(/\/builder\/playtest$/)
  await expect(page.getByRole('img', { name: 'Unsaved route: activate the goal' })).toBeFocused()
  await page.goBack()
  await expect(page.getByRole('textbox', { name: 'Level name' })).toHaveValue('Unsaved route')
  await page.goForward()
  await expect(page.getByRole('button', { name: 'Return to builder', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Return to builder', exact: true }).click()
  await expect(page).toHaveURL(/\/builder\/local\/1.json$/)
  await expect(page.getByRole('textbox', { name: 'Level name' })).toHaveValue('Unsaved route')
  await page.getByRole('button', { name: /^Undo/ }).click()
  await expect(page.getByRole('textbox', { name: 'Level name' })).toHaveValue('Second room')
  await page.goBack()
  await expect(page).toHaveURL(/\/untitled-jumping-game$/)
  await page.goForward()
  await expect(page.getByRole('textbox', { name: 'Level name' })).toHaveValue('Second room')
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: 'Open 0.json', exact: true }).click()
  await expect(page).toHaveURL(/\/builder\/local\/0.json$/)
  await expect(page.getByRole('textbox', { name: 'Level name' })).toHaveValue('First room')
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: 'Use 2.json as template', exact: true }).click()
  await expect(page).toHaveURL(/\/untitled-jumping-game\/builder$/)
  await expect(page.getByRole('textbox', { name: 'Level name' })).toHaveValue('Third room — copy')
  await page.clock.resume(); await page.goto('/untitled-jumping-game/builder')
  await expect(page.getByRole('textbox', { name: 'Level name' })).toBeVisible()
  await page.getByRole('textbox', { name: 'Level name' }).fill('Temporary draft')
  await page.getByRole('button', { name: 'Playtest', exact: true }).click()
  await page.reload()
  await expect(page).toHaveURL(/\/untitled-jumping-game\/builder$/)
  await expect(page.getByRole('textbox', { name: 'Level name' })).not.toHaveValue('Temporary draft')
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
