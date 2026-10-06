import { test, expect } from './helpers/folderTest.mjs'
import { installTestFolder, useLevelFixtures, readTestLevel, waitForBuilderPreview } from './helpers/jumpingLevels.mjs'
import { hold, tap } from './helpers/controller.mjs'
import { blankTrial } from '../../src/games/jumping/level.ts'
import { itemBounds } from '../../src/games/jumping/editor.ts'
import { nearestBoundary } from '../../src/games/jumping/geometry.ts'

const board = page => page.getByRole('application', { name: 'Level canvas' })
const ghost = page => page.locator('.builder-placement-preview').evaluate(canvas => canvas.placement ?? null)
async function open(page, level = blankTrial()) {
  await useLevelFixtures(page, [level]); await installTestFolder(page, { 'preview.json': level })
  await page.addInitScript(() => {
    window.testPad = { index: 0, id: 'Placement controller', connected: true, mapping: 'standard', axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [window.testPad] })
    const proto = CanvasRenderingContext2D.prototype, fill = proto.fillRect, stroke = proto.strokeRect, clear = proto.clearRect, arc = proto.arc
    proto.fillRect = function (...args) {
      if (this.fillStyle === '#f1f1ed' && args[0] === 0 && args[1] === 0) {
        this.canvas.camera = this.getTransform(); this.canvas.robotPose = null
      }
      if (this.canvas.getAttribute('aria-label') === 'Level canvas') {
        if (this.fillStyle === '#eeeee6' && args[0] === 0 && args[1] === 0) this.canvas.placement = null
        if (this.fillStyle === '#f1f1ed' && args[0] === 0 && args[1] === 0) this.canvas.camera = this.getTransform()
      }
      return fill.apply(this, args)
    }
    proto.clearRect = function (...args) {
      if (this.canvas.classList.contains('builder-placement-preview')) { this.canvas.placement = null; this.canvas.robotPose = null }
      return clear.apply(this, args)
    }
    proto.arc = function (...args) {
      const camera = this.canvas.camera ?? document.querySelector('canvas[aria-label="Level canvas"]')?.camera
      if (args[2] === 9 && this.fillStyle === '#68736e' && camera) {
        const transform = camera.inverse().multiply(this.getTransform())
        const point = transform.transformPoint(new DOMPoint(args[0], args[1]))
        if (args[0] === -17) this.canvas.robotWheels = []
        this.canvas.robotWheels.push({ x: point.x, y: point.y })
        if (args[0] === 17) {
          const [a, b] = this.canvas.robotWheels, facing = Math.sign(transform.a * transform.d - transform.b * transform.c)
          this.canvas.robotPose = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + 9,
            angle: Math.atan2(transform.b * facing, transform.a * facing), wheels: this.canvas.robotWheels }
        }
      }
      return arc.apply(this, args)
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
  await waitForBuilderPreview(page)
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

function slopeLevel(slope) {
  const rise = Math.abs(slope) * 200
  return { ...blankTrial(), name: 'Bot placement', width: 1200, height: 1200, floor: 1200,
    spawn: { x: 1100, y: 1200 }, goal: { x: 1040, y: 1200 },
    platforms: [{ x: 300, y: 700 - rise / 2, w: 200, h: rise + 20,
      polygon: slope > 0 ? [[0, 0], [200, rise], [200, rise + 20], [0, 20]]
        : [[0, rise], [200, 0], [200, 20], [0, rise + 20]] }] }
}

test('Place on surface seats a freely placed shovebot on a steep ramp', async ({ page }) => {
  await open(page, slopeLevel(3))
  await page.getByRole('checkbox', { name: 'Snap', exact: true }).uncheck()
  await page.getByRole('button', { name: 'Shovebot', exact: true }).click(); await move(page, 400, 690)
  const floating = await page.locator('.builder-placement-preview').evaluate(c => c.robotPose)
  expect(floating.y).toBeCloseTo(690); expect(floating.angle).toBeCloseTo(0)
  await page.mouse.down(); await page.mouse.up(); await page.clock.runFor(64)
  const button = page.getByRole('button', { name: 'Place on surface', exact: true })
  await expect(button).toBeEnabled(); await button.click(); await page.clock.runFor(64)
  const placed = await board(page).evaluate(c => c.robotPose)
  expect(placed.angle).toBeCloseTo(Math.atan(3), 3)
  for (const wheel of placed.wheels) expect(nearestBoundary(slopeLevel(3).platforms[0], wheel.x, wheel.y).distance).toBeCloseTo(9, 2)
  await expect(button).toBeDisabled()
})

for (const slope of [-3, -.5, .5, 3]) test(`shovebot slope placement previews, drags, saves and plays consistently (${slope})`, async ({ page }, info) => {
  const level = slopeLevel(slope)
  await open(page, level)
  const pose = canvas => canvas.evaluate(c => c.robotPose)
  const supported = state => {
    expect(state.angle).toBeCloseTo(Math.atan(slope), 3)
    for (const wheel of state.wheels) expect(nearestBoundary(level.platforms[0], wheel.x, wheel.y).distance).toBeCloseTo(9, 2)
  }
  await page.getByRole('button', { name: 'Shovebot', exact: true }).click()
  await move(page, 400, 690)
  const preview = await pose(page.locator('.builder-placement-preview'))
  supported(preview)
  await page.mouse.down(); await page.mouse.up(); await page.clock.runFor(64)
  const placed = await pose(board(page)); supported(placed)
  for (const key of ['x', 'y', 'angle']) expect(placed[key]).toBeCloseTo(preview[key], 5)
  await page.screenshot({ path: info.outputPath('placed-shovebot-on-slope.png') })
  // Grab the actual tilted chassis, including the part outside its old upright bounds.
  const centerX = placed.x + 22 * Math.sin(placed.angle), centerY = placed.y - 9 - 22 * Math.cos(placed.angle)
  const from = await worldPoint(page, centerX, centerY), to = await worldPoint(page, centerX + 20, centerY + slope * 20 - 5)
  await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps: 8 }); await page.mouse.up()
  await page.clock.runFor(64)
  const dragged = await pose(board(page)); supported(dragged)
  expect(dragged.x).toBeGreaterThan(placed.x + 15)
  await page.getByRole('button', { name: 'Save and Test', exact: true }).click(); await page.clock.runFor(64)
  const playing = page.getByRole('img', { name: 'Bot placement: reach the exit' })
  await expect(playing).toBeVisible()
  const initial = await pose(playing); supported(initial)
  for (const key of ['x', 'y', 'angle']) expect(initial[key]).toBeCloseTo(dragged[key], 5)
  const saved = await readTestLevel(page, 'preview.json')
  expect(saved.robots[0].y).toBeCloseTo(700 + slope * (saved.robots[0].x - 400), 5)
  await page.keyboard.down('w'); await page.clock.runFor(64); await page.keyboard.up('w'); await page.clock.runFor(436)
  const moving = await pose(playing); supported(moving)
  expect(moving.x).toBeLessThan(initial.x - 40)
  await page.getByRole('button', { name: 'Return to builder' }).click(); await page.clock.runFor(64)
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: 'Open preview.json', exact: true }).click(); await page.clock.runFor(64)
  const reloaded = await pose(board(page)); supported(reloaded)
  for (const key of ['x', 'y', 'angle']) expect(reloaded[key]).toBeCloseTo(dragged[key], 5)
})

test('every palette item follows mouse hover in both directions without editing or saving it', async ({ page }, info) => {
  const initial = await open(page)
  for (const name of ['Terrain', 'Steps narrow', 'Steps wide', 'Rope', 'Ladder', 'Ball', 'Box', 'Shovebot', 'Elevator',
    'Moving platform', 'Gate', 'Horizontal gate', 'Pressure plate', 'Coin switch', 'Wall timer', 'Spotlight', 'Wall text',
    'Coin', 'Stopwatch', 'Time bonus', 'Time penalty', 'Fast stopwatch', 'EMP']) {
    await page.getByRole('complementary', { name: 'Building tools' }).getByRole('button', { name, exact: true }).click()
    await move(page, 405, 305)
    await expect.poll(() => ghost(page), { message: `${name} should have a canvas placement preview` }).not.toBeNull()
    const first = await ghost(page)
    await move(page, 610, 430)
    const second = await ghost(page)
    expect(second.x - first.x, `${name} follows horizontal movement`).toBeCloseTo(205)
    expect(second.y - first.y, `${name} follows vertical movement`).toBeCloseTo(125)
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

for (const mode of ['Snap', 'Snap off', 'Alt']) test(`objects stay at the cursor and clicks match their previews with ${mode}`, async ({ page }) => {
  await open(page)
  if (mode === 'Snap off') await page.getByRole('checkbox', { name: 'Snap', exact: true }).uncheck()
  const expected = []
  for (const [index, name] of ['Ball', 'Box', 'Shovebot', 'Pressure plate', 'Gate'].entries()) {
    await page.getByRole('button', { name, exact: true }).click()
    const x = 333.4 + index * 220, y = 365.6
    await move(page, x, y); await board(page).focus()
    if (mode === 'Alt') { await page.keyboard.down('Alt'); await page.clock.runFor(64) }
    const preview = await ghost(page)
    expect(preview.y + preview.h).toBeCloseTo(mode === 'Snap' ? 365 : mode === 'Alt' ? y : 366, 1)
    expected.push(preview)
    await page.mouse.down(); await page.mouse.up(); await page.clock.runFor(64)
    if (mode === 'Alt') await page.keyboard.up('Alt')
  }
  await page.getByRole('button', { name: 'Save level', exact: true }).click()
  await expect(page.getByRole('status', { name: 'Builder status' })).toContainText('Saved')
  const saved = await readTestLevel(page, 'preview.json')
  for (const [index, selection] of [{ kind: 'prop', index: 0 }, { kind: 'prop', index: 1 }, { kind: 'robot', index: 0 },
    { kind: 'trigger', index: 0 }, { kind: 'mechanism', index: 0 }].entries()) {
    const bounds = itemBounds(saved, selection)
    for (const axis of ['x', 'y', 'w', 'h']) expect(bounds[axis]).toBeCloseTo(expected[index][axis], 1)
  }
})

test('a box follows controller movement in both directions and places at the preview', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: 'Box', exact: true }).focus(); await page.clock.runFor(64); await tap(page, 0)
  await tap(page, 3)
  await expect.poll(() => ghost(page)).not.toBeNull()
  const first = await ghost(page)
  await page.evaluate(() => { window.testPad.axes[0] = 1; window.testPad.axes[1] = -1 }); await page.clock.runFor(160)
  await page.evaluate(() => { window.testPad.axes[0] = 0; window.testPad.axes[1] = 0 }); await page.clock.runFor(64)
  const preview = await ghost(page)
  expect(preview.x).toBeGreaterThan(first.x); expect(preview.y).toBeLessThan(first.y)
  await tap(page, 0)
  await expect.poll(() => ghost(page)).toBeNull()
  await page.getByRole('button', { name: 'Save level', exact: true }).click()
  await expect(page.getByRole('status', { name: 'Builder status' })).toContainText('Saved')
  const saved = await readTestLevel(page, 'preview.json'), bounds = itemBounds(saved, { kind: 'prop', index: 0 })
  for (const axis of ['x', 'y', 'w', 'h']) expect(bounds[axis]).toBeCloseTo(preview[axis], 1)
})

test('small objects follow the cursor near room edges when their footprints fit', async ({ page }) => {
  await open(page)
  await page.getByRole('checkbox', { name: 'Snap', exact: true }).uncheck()
  for (const [name, x] of [['Box', 1730], ['Ball', 1740], ['Shovebot', 1750]]) {
    await page.getByRole('button', { name, exact: true }).click(); await move(page, x, 500)
    const preview = await ghost(page)
    expect(preview.x + preview.w / 2).toBeCloseTo(x)
  }
  await page.getByRole('button', { name: 'Horizontal gate', exact: true }).click(); await move(page, 700, 890)
  const preview = await ghost(page)
  expect(preview.y).toBeCloseTo(890)
  await page.mouse.down(); await page.mouse.up(); await page.clock.runFor(64)
  await page.getByRole('button', { name: 'Save level', exact: true }).click()
  await expect(page.getByRole('status', { name: 'Builder status' })).toContainText('Saved')
  const saved = await readTestLevel(page, 'preview.json')
  expect(saved.mechanisms[0].y).toBeCloseTo(preview.y)
})

test('hover previews match click placement, update snapping and persist for Keep placing', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: 'Wall text', exact: true }).click()
  await move(page, 333.4, 245.6)
  let preview = await ghost(page)
  for (const [axis, value] of Object.entries({ x: 335, y: 245, w: 320, h: 100 })) expect(preview[axis]).toBeCloseTo(value)
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
