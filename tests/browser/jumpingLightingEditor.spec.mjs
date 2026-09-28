import { test, expect } from './helpers/folderTest.mjs'
import { installTestFolder, useLevelFixtures, saveTestLevel, reopenTestLevel } from './helpers/jumpingLevels.mjs'
import { blankTrial } from '../../src/games/jumping/level.ts'

async function open(page, level = blankTrial()) {
  await useLevelFixtures(page, [level]); await installTestFolder(page, { 'lighting.json': level })
  await page.addInitScript(() => {
    const fill = CanvasRenderingContext2D.prototype.fillRect
    CanvasRenderingContext2D.prototype.fillRect = function (...args) {
      if (this.fillStyle === '#f1f1ed' && args[0] === 0 && args[1] === 0) this.canvas.jumpCamera = this.getTransform()
      return fill.apply(this, args)
    }
  })
  await page.goto('/untitled-jumping-game')
  await page.getByRole('button', { name: 'Level builder', exact: true }).click()
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  const local = page.getByRole('dialog').getByRole('button', { name: 'Local folder', exact: true })
  if (await local.count()) await local.click()
  await page.getByRole('button', { name: 'Choose folder', exact: true }).click()
  await page.getByRole('button', { name: 'Open lighting.json', exact: true }).click()
  await expect(page.getByRole('application', { name: 'Level canvas' })).toHaveAttribute('aria-busy', 'false')
}
async function number(page, label, value) {
  const input = page.getByRole('spinbutton', { name: label, exact: true })
  await input.fill(String(value)); await input.press('Enter')
}
async function point(page, x, y) {
  const canvas = page.getByRole('application', { name: 'Level canvas' }), rect = await canvas.boundingBox()
  return canvas.evaluate((c, { rect, x, y }) => {
    const t = c.jumpCamera, ratio = c.width / rect.width
    return { x: rect.x + (t.a * x + t.e) / ratio, y: rect.y + (t.d * y + t.f) / ratio }
  }, { rect, x, y })
}
async function select(page, value) { await page.getByRole('combobox', { name: 'Selected object' }).selectOption(value) }

test('spotlight placement, aim handles, night mode, undo, save/reopen and playtest work together', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message))
  await open(page)
  await page.getByRole('checkbox', { name: 'Night mode', exact: true }).check()
  await expect(page.getByRole('spinbutton', { name: 'Ambient light', exact: true })).toHaveCount(0)
  await expect(page.getByRole('application', { name: 'Level canvas' })).toHaveAttribute('aria-busy', 'false')
  await page.getByRole('button', { name: 'Spotlight', exact: true }).click()
  const a = await point(page, 600, 200), b = await point(page, 620, 400)
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y); await page.mouse.up()
  await expect(page.getByRole('combobox', { name: 'Selected object' })).toHaveValue('light:0')
  await expect(page.getByRole('spinbutton', { name: 'Object x', exact: true })).toHaveValue('600')
  await expect(page.getByRole('spinbutton', { name: 'Light intensity', exact: true })).toHaveCount(0)
  await number(page, 'Light direction', 90); await number(page, 'Light spread', 60)
  // The aim handle stays 60 CSS pixels from the source at every zoom.
  const origin = await point(page, 600, 200)
  await page.mouse.move(origin.x, origin.y + 60); await page.mouse.down()
  await page.mouse.move(origin.x + 60, origin.y, { steps: 5 }); await page.mouse.up()
  await expect(page.getByRole('spinbutton', { name: 'Light direction' })).toHaveValue('0')
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await select(page, 'light:0')
  await expect(page.getByRole('spinbutton', { name: 'Light direction' })).toHaveValue('90')
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); await select(page, 'light:0')
  await expect(page.getByRole('spinbutton', { name: 'Light direction' })).toHaveValue('0')
  // Selecting and dragging the fixture snaps its center, not the bounding-box corner.
  await select(page, ''); const start = await point(page, 600, 200), end = await point(page, 640, 220)
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y); await page.mouse.up()
  await expect(page.getByRole('spinbutton', { name: 'Object x', exact: true })).toHaveValue('640')
  await expect(page.getByRole('spinbutton', { name: 'Object y', exact: true })).toHaveValue('700')
  await page.getByRole('checkbox', { name: 'Lighting', exact: true }).uncheck()
  const saved = await saveTestLevel(page)
  expect(saved.level.version).toBe(2); expect(saved.level.lighting.ambient).toBe(0)
  expect(saved.level.lighting.lights).toHaveLength(1)
  expect(saved.level.lighting.lights[0]).toMatchObject({ x: 640, y: 220, direction: 0, spread: 60, intensity: 100, power: 'always' })
  expect(Object.keys(saved.level.lighting).sort()).toEqual(['ambient', 'lights', 'nightMode'])
  await reopenTestLevel(page, saved); await select(page, 'light:0')
  await expect(page.getByRole('spinbutton', { name: 'Light spread' })).toHaveValue('60')
  await saveTestLevel(page, 'Save and Test')
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'Controls', exact: true }).click()
  await expect(page.getByRole('switch', { name: /Brighter dark levels/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await page.getByRole('button', { name: 'Return to builder', exact: true }).click()
  await expect(page.getByRole('application', { name: 'Level canvas' })).toBeVisible()
  expect((await saveTestLevel(page)).level.lighting.ambient).toBe(0)
  expect(errors).toEqual([])
})

test('switched light previews never persist; mount and switch links survive save and host deletion', async ({ page }) => {
  const level = blankTrial()
  level.mechanisms = [{ id: 'lift', kind: 'lift', x: 800, y: 700, w: 160, h: 20, travel: 200 }]
  level.triggers = [{ x: 400, y: 920, w: 80, mode: 'weight', targets: ['lift'] }]
  await open(page, level)
  await page.getByRole('button', { name: 'Spotlight', exact: true }).click()
  const placement = await point(page, 600, 300)
  await page.mouse.click(placement.x, placement.y)
  await page.getByRole('combobox', { name: 'Light power' }).selectOption('switched')
  await expect(page.getByRole('button', { name: 'Save and Test' })).toBeDisabled()
  await page.getByRole('group', { name: 'Powered by' }).getByRole('checkbox').check()
  await number(page, 'Object x', 400); await number(page, 'Object y', 600)
  await page.getByRole('combobox', { name: 'Light mount' }).selectOption('lift')
  await expect(page.getByRole('button', { name: 'Save and Test' })).toBeEnabled()
  const held = page.getByRole('button', { name: 'Hold to preview' })
  await held.focus(); await page.keyboard.down('Space'); await expect(held).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.up('Space'); await expect(held).toHaveAttribute('aria-pressed', 'false')
  const saved = await saveTestLevel(page), lamp = saved.level.lighting.lights[0]
  expect(lamp).toMatchObject({ power: 'switched', mount: 'lift', x: 880, y: 690 })
  expect(saved.level.triggers[0].targets).toEqual(['lift', lamp.id])
  await select(page, 'mechanism:0'); await page.getByRole('button', { name: 'Delete object' }).click()
  const detached = await saveTestLevel(page)
  expect(detached.level.lighting.lights[0].mount).toBeUndefined()
  expect(detached.level.triggers[0].targets).toEqual([lamp.id])
})

test('older ambient settings normalize on open and full-bright preview leaves night mode unchanged', async ({ page }) => {
  const level = blankTrial()
  level.version = 2; level.lighting = { nightMode: true, ambient: 85, lights: [] }
  await page.addInitScript(() => localStorage.setItem('jumping:brighter-dark-levels', 'true'))
  await open(page, level)
  await expect(page.getByRole('checkbox', { name: 'Night mode', exact: true })).toBeChecked()
  await expect(page.getByRole('slider', { name: 'Ambient light slider' })).toHaveCount(0)
  await expect(page.getByRole('spinbutton', { name: 'Ambient light', exact: true })).toHaveCount(0)
  await page.getByRole('checkbox', { name: 'Lighting', exact: true }).uncheck()
  expect((await saveTestLevel(page)).level.lighting).toEqual({ nightMode: true, ambient: 0, lights: [] })
})

test('returning from repeated lit playtests restores the editor without reloading', async ({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  const level = blankTrial()
  level.version = 2
  level.lighting = { ambient: 0, lights: [{ id: 'ceiling-light', x: 600, y: 200, direction: 90, spread: 60, intensity: 100, power: 'always' }] }
  await open(page, level)
  for (let i = 0; i < 3; i++) {
    await select(page, 'light:0'); await number(page, 'Light spread', 60 + i * 20)
    await expect(page.getByRole('checkbox', { name: 'Lighting', exact: true })).toBeChecked()
    await saveTestLevel(page, 'Save and Test')
    await page.getByRole('button', { name: 'Return to builder', exact: true }).click()
    await expect(page.getByRole('application', { name: 'Level canvas' }), errors.join('\n')).toBeVisible()
    await expect(page.getByRole('application', { name: 'Level canvas' })).toHaveAttribute('aria-busy', 'false')
    await select(page, 'light:0')
    await expect(page.getByRole('spinbutton', { name: 'Light spread' })).toHaveValue(String(60 + i * 20))
  }
  expect(errors).toEqual([])
})


test('night mode uses fixed brightness through undo, reload and playtest', async ({ page }, info) => {
  await open(page)
  const night = page.getByRole('checkbox', { name: 'Night mode', exact: true })
  const field = page.getByRole('spinbutton', { name: 'Ambient light', exact: true })
  const slider = page.getByRole('slider', { name: 'Ambient light slider' })
  await expect(night).not.toBeChecked(); await expect(field).toHaveCount(0); await expect(slider).toHaveCount(0)
  await night.check(); await night.uncheck()
  const saved = await saveTestLevel(page)
  expect(saved.level.lighting).toEqual({ nightMode: false, ambient: 0, lights: [] })
  await page.reload()
  await expect(night).not.toBeChecked(); await expect(field).toHaveCount(0)
  await night.check()
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await expect(night).not.toBeChecked()
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); await expect(night).toBeChecked()
  const tested = await saveTestLevel(page, 'Save and Test')
  expect(tested.level.lighting).toEqual({ nightMode: true, ambient: 0, lights: [] })
  await page.getByRole('button', { name: 'Return to builder', exact: true }).click()
  await expect(night).toBeChecked(); await expect(field).toHaveCount(0)
  await night.scrollIntoViewIfNeeded()
  await page.screenshot({ path: info.outputPath('night-mode-inspector.png') })
})
