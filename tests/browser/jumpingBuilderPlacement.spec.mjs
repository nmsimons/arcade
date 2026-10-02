import { test, expect } from './helpers/folderTest.mjs'
import { installTestFolder, useLevelFixtures, readTestLevel } from './helpers/jumpingLevels.mjs'
import { hold, tap } from './helpers/controller.mjs'
import { blankTrial } from '../../src/games/jumping/level.ts'

const board = page => page.getByRole('application', { name: 'Level canvas' })
const ghost = page => page.locator('.builder-placement-preview').evaluate(canvas => canvas.placement ?? null)
async function open(page) {
  const level = blankTrial()
  await useLevelFixtures(page, [level]); await installTestFolder(page, { 'preview.json': level })
  await page.addInitScript(() => {
    window.testPad = { index: 0, id: 'Placement controller', connected: true, mapping: 'standard', axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [window.testPad] })
    const proto = CanvasRenderingContext2D.prototype, fill = proto.fillRect, stroke = proto.strokeRect, clear = proto.clearRect
    proto.fillRect = function (...args) {
      if (this.canvas.getAttribute('aria-label') === 'Level canvas') {
        if (this.fillStyle === '#eeeee6' && args[0] === 0 && args[1] === 0) this.canvas.placement = null
        if (this.fillStyle === '#f1f1ed' && args[0] === 0 && args[1] === 0) this.canvas.camera = this.getTransform()
      }
      return fill.apply(this, args)
    }
    proto.clearRect = function (...args) {
      if (this.canvas.classList.contains('builder-placement-preview')) this.canvas.placement = null
      return clear.apply(this, args)
    }
    proto.strokeRect = function (x, y, w, h) {
      const transform = this.getTransform()
      if (this.strokeStyle === '#c65231' && this.getLineDash().length === 2 && Math.abs(this.lineWidth * transform.a / devicePixelRatio - 1.5) < .01) {
        const pad = this.lineWidth * 2
        this.canvas.placement = { x: x + pad, y: y + pad, w: w - pad * 2, h: h - pad * 2 }
      }
      return stroke.call(this, x, y, w, h)
    }
  })
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/untitled-jumping-game')
  await page.getByRole('button', { name: 'Level studio', exact: true }).click()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z')); await page.clock.runFor(64)
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: 'Choose folder', exact: true }).click()
  await page.getByRole('button', { name: 'Open preview.json', exact: true }).click()
  await page.clock.runFor(200)
  await expect(board(page)).toHaveAttribute('aria-busy', 'false')
  return level
}
async function worldPoint(page, x, y) {
  const rect = await board(page).boundingBox(), camera = await board(page).evaluate(canvas => {
    const c = canvas.camera; return { a: c.a, d: c.d, e: c.e, f: c.f, ratio: devicePixelRatio }
  })
  return { x: rect.x + (x * camera.a + camera.e) / camera.ratio, y: rect.y + (y * camera.d + camera.f) / camera.ratio }
}
async function move(page, x, y) {
  const point = await worldPoint(page, x, y)
  await page.mouse.move(point.x, point.y); await page.clock.runFor(64)
}
async function outside(page) {
  const rect = await page.getByRole('button', { name: 'Help', exact: true }).boundingBox()
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2); await page.clock.runFor(64)
}

test('every palette item previews on mouse hover without editing or saving it', async ({ page }, info) => {
  const initial = await open(page)
  for (const name of ['Terrain', 'Steps narrow', 'Steps wide', 'Rope', 'Ladder', 'Ball', 'Box', 'Shovebot', 'Elevator',
    'Moving platform', 'Gate', 'Horizontal gate', 'Pressure plate', 'Coin switch', 'Wall timer', 'Spotlight', 'Wall text',
    'Coin', 'Stopwatch', 'Time bonus', 'Time penalty', 'Fast stopwatch', 'EMP']) {
    await page.getByRole('complementary', { name: 'Building tools' }).getByRole('button', { name, exact: true }).click()
    await move(page, 400, 300)
    await expect.poll(() => ghost(page), { message: `${name} should have a canvas placement preview` }).not.toBeNull()
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
    await expect(page.getByRole('status', { name: 'Builder status' })).not.toContainText('Unsaved changes')
    await outside(page)
    await expect.poll(() => ghost(page)).toBeNull()
  }
  await page.getByRole('button', { name: 'Steps wide', exact: true }).click(); await move(page, 400, 300)
  await page.screenshot({ path: info.outputPath('mouse-terrain-preview.png') })
  await page.getByRole('button', { name: 'Save level', exact: true }).click()
  await expect(page.getByRole('status', { name: 'Builder status' })).toContainText('Saved')
  expect(await readTestLevel(page, 'preview.json')).toEqual(initial)
})

test('hover previews match click placement, update snapping and persist for Keep placing', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: 'Wall text', exact: true }).click()
  await move(page, 333.4, 245.6)
  let preview = await ghost(page)
  for (const [axis, value] of Object.entries({ x: 340, y: 240, w: 320, h: 100 })) expect(preview[axis]).toBeCloseTo(value)
  await page.getByRole('checkbox', { name: 'Snap', exact: true }).uncheck(); await move(page, 333.4, 245.6)
  preview = await ghost(page)
  for (const [axis, value] of Object.entries({ x: 333, y: 246, w: 320, h: 100 })) expect(preview[axis]).toBeCloseTo(value)
  await page.getByRole('checkbox', { name: 'Snap', exact: true }).check()
  await page.getByRole('checkbox', { name: 'Keep placing', exact: true }).check(); await move(page, 333.4, 245.6)
  await board(page).focus(); await page.keyboard.down('Alt'); await page.clock.runFor(64)
  preview = await ghost(page)
  expect(preview.x).toBeCloseTo(333.4, 1); expect(preview.y).toBeCloseTo(245.6, 1)
  await page.mouse.down(); await page.mouse.up(); await page.keyboard.up('Alt'); await page.clock.runFor(64)
  await expect(page.getByRole('button', { name: 'Wall text', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await move(page, 700, 200)
  await expect.poll(() => ghost(page)).not.toBeNull()
  await page.getByRole('button', { name: 'Save level', exact: true }).click()
  await expect(page.getByRole('status', { name: 'Builder status' })).toContainText('Saved')
  const saved = await readTestLevel(page, 'preview.json')
  expect(saved.texts).toHaveLength(1)
  expect(saved.texts[0].x).toBeCloseTo(preview.x); expect(saved.texts[0].y).toBeCloseTo(preview.y)
  await page.getByRole('button', { name: 'Pointer', exact: true }).click(); await move(page, 700, 200)
  await expect.poll(() => ghost(page)).toBeNull()
})

test('controller cursor previews hide in controls and dialogs and on disconnect', async ({ page }, info) => {
  await open(page)
  await page.getByRole('button', { name: 'Spotlight', exact: true }).focus(); await page.clock.runFor(64); await tap(page, 0)
  await expect.poll(() => ghost(page)).toBeNull()
  await tap(page, 3)
  await expect.poll(() => ghost(page)).not.toBeNull()
  await expect(page.locator('.builder-controller-cursor')).toBeHidden()
  const first = await ghost(page)
  await page.evaluate(() => { window.testPad.axes[0] = 1 }); await page.clock.runFor(160)
  await page.evaluate(() => { window.testPad.axes[0] = 0 }); await page.clock.runFor(64)
  expect((await ghost(page)).x).toBeGreaterThan(first.x)
  await page.screenshot({ path: info.outputPath('controller-spotlight-preview.png') })
  await tap(page, 3); await expect.poll(() => ghost(page)).toBeNull()
  await tap(page, 3); await expect.poll(() => ghost(page)).not.toBeNull()
  await tap(page, 8); await expect.poll(() => ghost(page)).toBeNull()
  await tap(page, 1); await expect.poll(() => ghost(page)).not.toBeNull()
  await page.evaluate(() => { window.testPad.connected = false }); await page.clock.runFor(64)
  await expect.poll(() => ghost(page)).toBeNull()
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
})

test('night mode keeps placement artwork visible above the lighting preview', async ({ page }, info) => {
  await open(page)
  await page.getByRole('checkbox', { name: 'Night mode', exact: true }).check()
  await expect(board(page)).toHaveAttribute('aria-busy', 'false')
  await page.getByRole('button', { name: 'Wall timer', exact: true }).click(); await move(page, 700, 300)
  await expect.poll(() => ghost(page)).not.toBeNull()
  await page.screenshot({ path: info.outputPath('night-timer-preview.png') })
  await outside(page); await expect.poll(() => ghost(page)).toBeNull()
})
