import { unlockJumpingLevels } from './helpers/jumpingLevels.mjs'
import { finishJumpingEntrance, waitForBuilderPreview, installBuiltInFixtures } from './helpers/jumpingLevels.mjs'
import { test, expect } from './helpers/test.mjs'
import { useLevelFixtures } from './helpers/jumpingLevels.mjs'
import { hold, tap } from './helpers/controller.mjs'
import { blankTrial } from '../../src/games/jumping/level.ts'
import { expectAccessibleSelection } from './helpers/jumpingAccessibility.mjs'
import { androidMaterials } from '../../src/games/jumping/androidArtwork.ts'
import { EMP_PALETTE, ROBOT_PALETTE } from '../../src/games/jumping/equipmentPalette.ts'

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

test('built-in tiles edit independently by button and Y while arrows browse tiles and A plays', async ({ page }, info) => {
  await page.route('**/src/games/jumping/LevelBuilder.tsx*', async route => {
    await new Promise(resolve => setTimeout(resolve, 250))
    await route.continue()
  })
  await open(page, true)
  const first = page.getByRole('button', { name: 'Level 1: First room', exact: true })
  await first.focus(); await page.clock.runFor(64)
  await tap(page, 15)
  await expect(page.getByRole('button', { name: 'Level 2: Second room', exact: true })).toBeFocused()
  await expect(page.getByRole('button', { name: 'Level 2: Second room', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await tap(page, 3)
  // React's lazy editor must load with a running scheduler before freezing
  // time again for the remaining controller assertions.
  await page.clock.resume()
  await expect(page.getByRole('textbox', { name: 'Level name' })).toHaveValue('Second room')
  await waitForBuilderPreview(page)
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 1000)))
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
  await expect(page.getByRole('img', { name: 'First room: reach the exit' })).toBeFocused()
})

test('all object types appear in menu, library and overview previews through the game renderer', async ({ page }, info) => {
  // Reproduce slow worker loading instead of relying on the CI machine's speed.
  await page.route('**/assets/lightingGeometry.worker-*.js', async route => {
    await new Promise(resolve => setTimeout(resolve, 250))
    await route.continue()
  })
  const level = { ...blankTrial(), id: 'preview-all', name: 'All objects', width: 800, height: 600, floor: 600,
    entrance: { x: 60, y: 600 }, goal: { x: 650, y: 600 }, checkpoints: [{ x: 90, y: 600 }],
    platforms: [{ x: 50, y: 420, w: 100, h: 20 }],
    props: [{ kind: 'ball', x: 160, y: 600, size: 60 }, { kind: 'box', x: 240, y: 600, size: 60 }],
    robots: [{ x: 340, y: 600, left: 300, right: 400 }, { x: 400, y: 600, left: 380, right: 430, mode: 'emp' }],
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
    // A reused overview canvas can still contain the previous document's art.
    await expect.poll(() => canvas.evaluate(c => c.previewDraws?.some(call => call.method === 'fillText' && call.args[0] === 'Preview') ?? false)).toBe(true)
    const calls = await canvas.evaluate(c => c.previewDraws ?? [])
    const has = (method, match) => calls.some(call => call.method === method && match(call.args, call.color))
    for (const [w, h, color] of [[60, 60, '#b3a28d'], [20, 120, '#8f9e98'], [140, 20, '#8f9e98'], [120, 20, '#8f9e98'], [80, 20, '#b3a28d'], [51, 34, ROBOT_PALETTE.body], [51, 34, EMP_PALETTE.body]])
      expect(has('roundRect', (a, c) => a[2] === w && a[3] === h && c === color)).toBe(true)
    expect(has('arc', (a, c) => a[2] === 30 && c === '#8f9e98')).toBe(true)
    expect(has('arc', a => a[0] === 390 && a[1] === 100 && a[2] === 5)).toBe(true)
    expect(has('fillRect', (a, c) => a[2] === 60 && a[3] === 3 && c === '#c4a66b')).toBe(true)
    expect(has('fillRect', (a, c) => a[2] === 2.5 && a[3] === 350 && c === '#87958b')).toBe(true)
    expect(has('fillRect', (a, c) => a[0] === 86 && c === '#a0a3a4')).toBe(true)
    expect(has('fillText', a => a[0] === 'Preview')).toBe(true)
    expect(has('roundRect', (a, c) => a[2] === 120 && a[3] === 40 && c === '#45504b')).toBe(true)
    expect(has('fill', (_, c) => c === '#a9ef82')).toBe(true)
    expect(has('fillRect', (a, c) => a[0] === 66 && a[1] === 12 && a[2] === 3 && a[3] === 3 && c === '#a9ef82')).toBe(true)
    expect(has('fill', (_, c) => c === '#ba8542')).toBe(true)
    const faces = ['#686b6e', '#e5e7e6'].map(ink => androidMaterials(ink).face)
    expect(has('fill', (_, c) => faces.includes(c))).toBe(true)
    expect(has('fillRect', (a, c) => a[2] === 40 && a[3] === 80 && c === '#000000')).toBe(true)
  }
  await check(page.locator('.jumping-level-browser .jumping-level-card .level-thumbnail'))
  await page.screenshot({ path: info.outputPath('all-objects-menu.png') })
  await page.clock.resume()
  await page.getByRole('button', { name: 'Level studio', exact: true }).click()
  await waitForBuilderPreview(page)
  await page.getByRole('button', { name: 'Library', exact: true }).click(); await page.clock.runFor(64)
  await check(page.getByRole('button', { name: 'Open 00-fixture.json', exact: true }).locator('.level-thumbnail'))
  await page.getByRole('button', { name: 'Use 00-fixture.json as template', exact: true }).click(); await page.clock.runFor(64)
  await check(page.locator('.builder-minimap .level-thumbnail'))
  await page.screenshot({ path: info.outputPath('all-objects-overview.png') })
})

test('builder and playtest routes save edits and preserve undo history when going back', async ({ page }) => {
  await open(page, true)
  await page.clock.resume()
  await page.getByRole('button', { name: 'Edit Second room', exact: true }).click()
  await expect(page).toHaveURL(/\/builder\/built-in\/01-fixture.json$/)
  await page.getByRole('textbox', { name: 'Level name' }).fill('Edited route')
  await page.getByRole('button', { name: 'Save and Test', exact: true }).click()
  await expect(page).toHaveURL(/\/builder\/built-in\/01-fixture.json\/playtest$/)
  await expect(page.getByRole('img', { name: 'Edited route: reach the exit' })).toBeFocused()
  expect(await page.evaluate(async () => JSON.parse(await (await (await window.testLevelDirectory()).getFileHandle('01-fixture.json')).getFile().then(file => file.text())).name)).toBe('Edited route')
  await page.goBack()
  await expect(page.getByRole('textbox', { name: 'Level name' })).toHaveValue('Edited route')
  await page.goForward()
  await expect(page.getByRole('button', { name: 'Return to builder', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Return to builder', exact: true }).click()
  await expect(page).toHaveURL(/\/builder\/built-in\/01-fixture.json$/)
  await expect(page.getByRole('textbox', { name: 'Level name' })).toHaveValue('Edited route')
  await page.getByRole('button', { name: /^Undo/ }).click()
  await expect(page.getByRole('textbox', { name: 'Level name' })).toHaveValue('Second room')
  await page.goBack()
  await expect(page).toHaveURL(/\/lab$/)
  await page.goForward()
  await expect(page.getByRole('textbox', { name: 'Level name' })).toHaveValue('Second room')
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: 'Open 00-fixture.json', exact: true }).click()
  await page.getByRole('button', { name: 'Discard changes', exact: true }).click()
  await expect(page).toHaveURL(/\/builder\/built-in\/00-fixture.json$/)
  await expect(page.getByRole('textbox', { name: 'Level name' })).toHaveValue('First room')
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: 'Use 02-fixture.json as template', exact: true }).click()
  await expect(page).toHaveURL(/\/lab\/builder\/built-in$/)
  await expect(page.getByRole('textbox', { name: 'Level name' })).toHaveValue('Third room — copy')
  await page.clock.resume(); await page.goto('/lab/builder')
  await expect(page.getByRole('textbox', { name: 'Level name' })).toBeVisible()
  await page.getByRole('textbox', { name: 'Level name' }).fill('Temporary draft')
  await page.getByRole('button', { name: 'Save and Test', exact: true }).click()
  await expect(page).toHaveURL(/\/builder\/built-in\/Temporary%20draft.jump-level.json\/playtest$/)
  expect(await page.evaluate(async () => JSON.parse(await (await (await window.testLevelDirectory()).getFileHandle('Temporary draft.jump-level.json')).getFile().then(file => file.text())).name)).toBe('Temporary draft')
})

test('file playtest URLs reload saved levels and return to their own builder', async ({ page }) => {
  await open(page)
  await page.clock.resume()
  await page.goto('/lab/builder/built-in/01-fixture.json/playtest')
  await expect(page.getByRole('img', { name: 'Second room: reach the exit' })).toBeFocused()
  await expect(page.getByRole('button', { name: 'Return to builder', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('img', { name: 'Second room: reach the exit' })).toBeFocused()
  await page.getByRole('button', { name: 'Return to builder', exact: true }).click()
  await expect(page).toHaveURL(/\/builder\/built-in\/01-fixture.json$/)
  await expect(page.getByRole('textbox', { name: 'Level name' })).toHaveValue('Second room')

})
