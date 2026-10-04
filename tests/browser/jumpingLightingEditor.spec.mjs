import { test, expect } from './helpers/folderTest.mjs'
import { selectBuilderOption, installTestFolder, useLevelFixtures, saveTestLevel, reopenTestLevel } from './helpers/jumpingLevels.mjs'
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
  await page.getByRole('button', { name: 'Level studio', exact: true }).click()
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
async function select(page, value) {
  await page.getByRole('tab', { name: 'Object', exact: true }).click()
  await selectBuilderOption(page, 'Selected object', value)
}

function flickerLevel(flicker = false) {
  const level = blankTrial(); level.version = 2
  level.lighting = { nightMode: true, ambient: 0, lights: [
    { id: 'faulty-lamp', x: 400, y: 200, direction: 90, spread: 70, intensity: 100, power: 'always', ...(flicker ? { flicker: true } : {}) },
  ] }
  return level
}
async function captureLampOutputs(page) {
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    window.lampOutputs = []
    const fill = CanvasRenderingContext2D.prototype.fillRect
    CanvasRenderingContext2D.prototype.fillRect = function (...args) {
      if (this.fillStyle === '#f4f2e9' && args[0] === 6 && args[1] === -6 && args[2] === 2 && args[3] === 12) window.lampOutputs.push(this.globalAlpha)
      return fill.apply(this, args)
    }
  })
  return errors
}

// Separate file editing and animated gameplay so slower CI runners have the
// normal test time budget for each workflow.
test('spotlight flicker previews live, undoes, duplicates and round-trips through saving', async ({ page }, info) => {
  const errors = await captureLampOutputs(page)
  await open(page, flickerLevel()); await select(page, 'light:0')
  const flicker = page.getByRole('checkbox', { name: 'Flicker', exact: true })
  await expect(flicker).not.toBeChecked(); await flicker.check()
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await select(page, 'light:0')
  await expect(flicker).not.toBeChecked()
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); await select(page, 'light:0')
  await expect(flicker).toBeChecked()
  await page.evaluate(() => { window.lampOutputs = [] })
  await expect.poll(() => page.evaluate(() => window.lampOutputs.some(a => a > 0 && a < .5)), { timeout: 10000 }).toBe(true)
  await flicker.scrollIntoViewIfNeeded()
  await page.screenshot({ path: info.outputPath('spotlight-flicker-inspector.png') })
  await page.getByRole('button', { name: 'Duplicate', exact: true }).click()
  await expect(flicker).toBeChecked()
  const saved = await saveTestLevel(page)
  expect(saved.level.lighting.lights.map(l => l.flicker)).toEqual([true, true])
  await reopenTestLevel(page, saved); await select(page, 'light:0'); await expect(flicker).toBeChecked()
  await flicker.uncheck()
  const steady = await saveTestLevel(page)
  expect(steady.level.lighting.lights[0].flicker).toBeUndefined()
  expect(steady.level.lighting.lights[1].flicker).toBe(true)
  expect(errors).toEqual([])
})

test('saved spotlight flicker runs during play and returns to the builder', async ({ page }) => {
  const errors = await captureLampOutputs(page)
  await open(page, flickerLevel(true))
  await saveTestLevel(page, 'Save and Test')
  await expect(page.getByRole('button', { name: 'Return to builder', exact: true })).toBeVisible()
  await page.locator('.jumping-game > canvas').focus(); await page.keyboard.press('ArrowRight')
  await page.evaluate(() => { window.lampOutputs = [] })
  await expect.poll(() => page.evaluate(() => window.lampOutputs.some(a => a > 0 && a < .5)), { timeout: 10000 }).toBe(true)
  await page.keyboard.press('Escape')
  await page.evaluate(() => { window.lampOutputs = [] })
  await expect(page.getByRole('dialog', { name: 'Game paused', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Return to builder', exact: true }).click()
  await select(page, 'light:0')
  await expect(page.getByRole('checkbox', { name: 'Flicker', exact: true })).toBeChecked()
  expect(errors).toEqual([])
})

test('optional shovebot headlights undo, preview in day and night, duplicate and round-trip through save and play', async ({ page }, info) => {
  const level = blankTrial(); level.robots = [{ x: 700, y: 920, left: 400, right: 1000 }]
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    window.headlightDraws = 0
    const fill = CanvasRenderingContext2D.prototype.fillRect
    CanvasRenderingContext2D.prototype.fillRect = function (...args) {
      if (this.fillStyle === '#f4f2e9' && args[0] === 25 && args[2] === 2 && args[3] === 8) window.headlightDraws++
      return fill.apply(this, args)
    }
  })
  await open(page, level); await select(page, 'robot:0')
  const headlight = page.getByRole('checkbox', { name: 'Headlight', exact: true }), canvas = page.getByRole('application', { name: 'Level canvas' })
  await expect(headlight).not.toBeChecked(); await headlight.check()
  await expect.poll(() => page.evaluate(() => window.headlightDraws)).toBeGreaterThan(0)
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await select(page, 'robot:0')
  await expect(headlight).not.toBeChecked()
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); await select(page, 'robot:0')
  await expect(headlight).toBeChecked()
  await page.getByRole('tab', { name: 'Level', exact: true }).click(); await page.getByRole('checkbox', { name: 'Night mode', exact: true }).check()
  await expect(canvas).toHaveAttribute('aria-busy', 'false')
  await expect.poll(() => page.evaluate(() => window.headlightDraws)).toBeGreaterThan(0)
  await select(page, 'robot:0'); await page.getByRole('button', { name: 'Duplicate', exact: true }).click()
  await expect(headlight).toBeChecked()
  let saved = await saveTestLevel(page)
  expect(saved.level.lighting.lights).toEqual([]); expect(saved.level.robots.map(r => r.headlight)).toEqual([true, true])
  await reopenTestLevel(page, saved); await select(page, 'robot:0'); await expect(headlight).toBeChecked()
  await page.screenshot({ path: info.outputPath('shovebot-headlight-inspector.png') })
  await headlight.uncheck(); saved = await saveTestLevel(page)
  expect(saved.level.robots[0].headlight).toBeUndefined(); expect(saved.level.robots[1].headlight).toBe(true)
  await saveTestLevel(page, 'Save and Test')
  await expect(page.getByRole('button', { name: 'Return to builder', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Return to builder', exact: true }).click()
  await page.getByRole('tab', { name: 'Level', exact: true }).click(); await page.getByRole('checkbox', { name: 'Night mode', exact: true }).uncheck()
  await select(page, 'robot:1'); await expect(headlight).toBeChecked()
  await expect(canvas).toHaveAttribute('aria-busy', 'false')
  await page.evaluate(() => { window.headlightDraws = 0 })
  await page.getByRole('button', { name: 'Fit level', exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.headlightDraws)).toBeGreaterThan(0)
  expect((await saveTestLevel(page)).level.robots[1].headlight).toBe(true)
  expect(errors).toEqual([])
})

test('spotlight names identify the inspector, errors and connections and survive undo and save', async ({ page }, info) => {
  const level = blankTrial()
  level.version = 2
  level.lighting = { nightMode: false, ambient: 0, lights: [
    { id: 'lamp-a', x: 400, y: 200, direction: 90, spread: 60, intensity: 100, power: 'always' },
    { id: 'lamp-b', x: 600, y: 200, direction: 90, spread: 60, intensity: 100, power: 'always' },
  ] }
  level.mechanisms = [{ id: 'host', kind: 'lift', x: 800, y: 700, w: 160, h: 20, travel: 200, name: 'Cargo lift' }]
  level.triggers = [{ x: 400, y: 920, w: 80, mode: 'weight', targets: ['host'], name: 'Entry switch' }]
  await open(page, level)
  const selected = page.getByRole('combobox', { name: 'Selected object' })
  const name = page.getByRole('textbox', { name: 'Object name', exact: true })
  const inspector = page.getByRole('complementary', { name: 'Inspector' })
  await select(page, 'light:0')
  await expect(name).toBeEditable()
  await expect(name).toHaveAttribute('placeholder', 'Spotlight 1')
  await name.fill('  Stair light  '); await name.press('Enter')
  await expect(name).toHaveValue('Stair light')
  await expect(inspector.getByRole('heading', { name: 'Stair light · Spotlight 1', exact: true })).toBeVisible()
  await expect(selected).toHaveText('Stair light · Spotlight 1')
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await select(page, 'light:0')
  await expect(name).toHaveValue('')
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); await select(page, 'light:0')
  await expect(name).toHaveValue('Stair light')
  await name.fill('Discard me'); await name.press('Escape')
  await expect(name).toHaveValue('Stair light')
  await selectBuilderOption(page, 'Light power', 'switched')
  await expect(inspector.getByRole('alert')).toHaveCount(0)
  await page.getByRole('group', { name: 'Switched by' }).getByRole('checkbox', { name: 'Entry switch · Pressure plate 1', exact: true }).check()
  await expect(page.getByRole('combobox', { name: 'Light mount' })).toHaveCount(0)
  await select(page, 'light:1')
  await selectBuilderOption(page, 'Light power', 'switched')
  await page.getByRole('group', { name: 'Switched by' }).getByRole('checkbox').check()
  await select(page, 'trigger:0')
  await expect(page.getByRole('checkbox', { name: 'Stair light · Spotlight 1', exact: true })).toBeChecked()
  await expect(page.getByRole('checkbox', { name: 'Spotlight 2', exact: true })).toBeChecked()
  const saved = await saveTestLevel(page)
  expect(saved.level.lighting.lights[0]).toMatchObject({ id: 'lamp-a', name: 'Stair light', x: 400, y: 200 })
  expect(saved.level.triggers[0].targets).toEqual(['host', 'lamp-a', 'lamp-b'])
  await reopenTestLevel(page, saved); await select(page, 'light:0')
  await expect(name).toHaveValue('Stair light')
  await name.fill(''); await name.press('Tab')
  await expect(inspector.getByRole('heading', { name: 'Spotlight 1', exact: true })).toBeVisible()
  await name.fill('Stair light'); await name.press('Enter')
  await page.getByRole('button', { name: 'Duplicate', exact: true }).click()
  await expect(selected).toHaveText('Stair light · Spotlight 3')
  await expect(inspector.getByRole('alert')).toHaveCount(0)
  await name.fill('W'.repeat(80)); await name.press('Enter')
  expect(await inspector.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  await name.fill('Upper light'); await name.press('Enter')
  await inspector.evaluate(el => { el.scrollTop = 0 })
  await page.screenshot({ path: info.outputPath('spotlight-names.png') })
  await inspector.evaluate(el => { el.scrollTop = el.scrollHeight })
  const lamp = await point(page, 600, 200)
  await page.mouse.click(lamp.x, lamp.y)
  await expect(selected).toHaveAttribute('data-value', 'light:1')
  await expect(name).toBeInViewport()
  await expect(inspector.getByRole('heading', { name: 'Spotlight 2', exact: true })).toBeInViewport()
})

test('every switchable object shares a bidirectional Switched by list with undo and saved connections', async ({ page }, info) => {
  const level = blankTrial()
  level.version = 2
  level.mechanisms = [
    { id: 'gate', kind: 'gate', x: 600, y: 740, w: 20, h: 180, travel: 180, name: 'Main door' },
    { id: 'hatch', kind: 'gate', orientation: 'horizontal', x: 800, y: 600, w: 180, h: 20, travel: 180, name: 'Ceiling hatch' },
    { id: 'lift', kind: 'lift', x: 1000, y: 700, w: 140, h: 20, travel: 200, name: 'Cargo lift' },
    { id: 'platform', kind: 'lift', orientation: 'horizontal', x: 600, y: 450, w: 140, h: 20, travel: 200, name: 'Shuttle' },
  ]
  level.lighting = { nightMode: false, ambient: 0, lights: [
    { id: 'lamp', x: 400, y: 200, direction: 90, spread: 60, intensity: 100, power: 'switched', name: 'Door lamp' },
  ] }
  level.triggers = [
    { x: 200, y: 920, w: 80, target: 'gate', mode: 'weight', name: 'Entry plate' },
    { x: 320, y: 920, w: 80, target: 'lift', mode: 'touch' },
    { x: 1000, y: 180, w: 140, targets: ['platform', 'lamp'], mode: 'coins', threshold: 1, name: 'Toll' },
  ]
  level.pickups = [{ kind: 'coin', x: 240, y: 800 }]
  await open(page, level)
  const switches = ['Entry plate · Pressure plate 1', 'Pressure plate 2', 'Toll · Coin switch 3']
  const objects = [
    ['mechanism:0', 'Main door · Gate 1'], ['mechanism:1', 'Ceiling hatch · Horizontal gate 2'],
    ['mechanism:2', 'Cargo lift · Elevator 3'], ['mechanism:3', 'Shuttle · Moving platform 4'], ['light:0', 'Door lamp · Spotlight 1'],
  ]
  const incoming = page.getByRole('group', { name: 'Switched by', exact: true })
  const outgoing = page.getByRole('group', { name: 'Activates', exact: true })
  for (const [value, label] of objects) {
    await select(page, value)
    await expect(incoming).toBeVisible()
    await expect(incoming.getByRole('checkbox')).toHaveCount(3)
    await expect(page.getByRole('group', { name: 'Powered by', exact: true })).toHaveCount(0)
    for (const [i, name] of switches.entries()) {
      await incoming.getByRole('checkbox', { name, exact: true }).check()
      await select(page, `trigger:${i}`)
      await expect(outgoing.getByRole('checkbox', { name: label, exact: true })).toBeChecked()
      await select(page, value)
    }
  }
  await select(page, 'mechanism:0')
  await incoming.getByRole('checkbox', { name: switches[0], exact: true }).uncheck()
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await select(page, 'mechanism:0')
  await expect(incoming.getByRole('checkbox', { name: switches[0], exact: true })).toBeChecked()
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); await select(page, 'mechanism:0')
  await expect(incoming.getByRole('checkbox', { name: switches[0], exact: true })).not.toBeChecked()
  await expect(incoming.getByRole('checkbox', { checked: true })).toHaveCount(2)
  await select(page, 'trigger:0')
  await expect(outgoing.getByRole('checkbox', { name: objects[0][1], exact: true })).not.toBeChecked()
  await expect(outgoing.getByRole('checkbox', { checked: true })).toHaveCount(4)
  // Editing the switch updates the object's incoming list immediately too.
  await outgoing.getByRole('checkbox', { name: objects[0][1], exact: true }).check()
  await select(page, 'mechanism:0')
  await expect(incoming.getByRole('checkbox', { checked: true })).toHaveCount(3)
  const saved = await saveTestLevel(page)
  for (const trigger of saved.level.triggers) expect([...trigger.targets].sort()).toEqual(['gate', 'hatch', 'lamp', 'lift', 'platform'])
  await reopenTestLevel(page, saved)
  for (const [value] of objects) {
    await select(page, value)
    await expect(incoming.getByRole('checkbox', { checked: true })).toHaveCount(3)
  }
  await select(page, 'mechanism:0')
  await incoming.scrollIntoViewIfNeeded()
  await page.screenshot({ path: info.outputPath('mechanism-switched-by.png') })
  for (let i = 0; i < switches.length; i++) {
    await select(page, `trigger:${i}`)
    for (const [, label] of objects) await outgoing.getByRole('checkbox', { name: label, exact: true }).uncheck()
  }
  await expect(page.getByRole('complementary', { name: 'Inspector' }).getByRole('alert')).toHaveCount(0)
  const disconnected = await saveTestLevel(page, 'Save and Test')
  expect(disconnected.level.triggers.every(t => t.targets.length === 0)).toBe(true)
  expect(disconnected.level.lighting.lights[0].power).toBe('switched')
  await page.getByRole('button', { name: 'Return to builder', exact: true }).click()
  await reopenTestLevel(page, disconnected)
  for (const [value] of objects) {
    await select(page, value)
    await expect(incoming.getByRole('checkbox', { checked: true })).toHaveCount(0)
  }
})

test('switchable objects show a clear empty list until a switch exists', async ({ page }) => {
  const level = blankTrial()
  level.mechanisms = [{ id: 'gate', kind: 'gate', x: 600, y: 740, w: 20, h: 180, travel: 180 }]
  level.triggers = []
  await open(page, level); await select(page, 'mechanism:0')
  const incoming = page.getByRole('group', { name: 'Switched by', exact: true })
  await expect(incoming).toContainText('No switches')
  await expect(incoming.getByRole('checkbox')).toHaveCount(0)
  await select(page, 'spawn:0')
  await expect(incoming).toHaveCount(0)
})

test('spotlight placement, aim handles, night mode, undo, save/reopen and playtest work together', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message))
  await open(page)
  await page.getByRole('checkbox', { name: 'Night mode', exact: true }).check()
  await expect(page.getByRole('spinbutton', { name: 'Ambient light', exact: true })).toHaveCount(0)
  await expect(page.getByRole('application', { name: 'Level canvas' })).toHaveAttribute('aria-busy', 'false')
  await page.getByRole('button', { name: 'Spotlight', exact: true }).click()
  const a = await point(page, 600, 200), b = await point(page, 620, 400)
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y); await page.mouse.up()
  await expect(page.getByRole('combobox', { name: 'Selected object' })).toHaveAttribute('data-value', 'light:0')
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

test('switched wall lights keep their position and power links through save and mechanism deletion', async ({ page }) => {
  const level = blankTrial()
  level.mechanisms = [{ id: 'lift', kind: 'lift', x: 800, y: 700, w: 160, h: 20, travel: 200 }]
  level.triggers = [{ x: 400, y: 920, w: 80, mode: 'weight', targets: ['lift'] }]
  await open(page, level)
  await page.getByRole('button', { name: 'Spotlight', exact: true }).click()
  const placement = await point(page, 600, 300)
  await page.mouse.click(placement.x, placement.y)
  await selectBuilderOption(page, 'Light power', 'switched')
  await expect(page.getByRole('button', { name: 'Save and Test' })).toBeEnabled()
  await page.getByRole('group', { name: 'Switched by' }).getByRole('checkbox').check()
  await number(page, 'Object x', 400); await number(page, 'Object y', 600)
  await expect(page.getByRole('combobox', { name: 'Light mount' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Save and Test' })).toBeEnabled()
  const held = page.getByRole('button', { name: 'Hold to preview' })
  await held.focus(); await page.keyboard.down('Space'); await expect(held).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.up('Space'); await expect(held).toHaveAttribute('aria-pressed', 'false')
  const saved = await saveTestLevel(page), lamp = saved.level.lighting.lights[0]
  expect(lamp).toMatchObject({ power: 'switched', x: 400, y: 320 })
  expect(saved.level.triggers[0].targets).toEqual(['lift', lamp.id])
  await select(page, 'mechanism:0'); await page.getByRole('button', { name: 'Delete object' }).click()
  const detached = await saveTestLevel(page)
  expect(detached.level.lighting.lights[0]).toEqual(lamp)
  expect(lamp.mount).toBeUndefined()
  expect(detached.level.triggers[0].targets).toEqual([lamp.id])
})

test('opening an older attached spotlight preserves its position as a wall light through editing and saving', async ({ page }) => {
  const level = blankTrial()
  level.version = 2
  level.mechanisms = [{ id: 'lift', kind: 'lift', x: 800, y: 700, w: 160, h: 20, travel: 200 }]
  const lamp = { id: 'old-lamp', name: 'Old spotlight', x: 880, y: 690, direction: 90, spread: 70, intensity: 100, power: 'always' }
  level.lighting = { nightMode: true, ambient: 0, lights: [{ ...lamp, mount: 'lift' }] }
  await open(page, level); await select(page, 'light:0')
  await expect(page.getByRole('combobox', { name: 'Light mount' })).toHaveCount(0)
  await select(page, 'mechanism:0'); await number(page, 'Object x', 1000)
  let saved = await saveTestLevel(page)
  expect(saved.level.mechanisms[0].x).toBe(1000)
  expect(saved.level.lighting.lights[0]).toEqual(lamp)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  saved = await saveTestLevel(page)
  expect(saved.level.mechanisms[0].x).toBe(800)
  expect(saved.level.lighting.lights[0]).toEqual(lamp)
  await reopenTestLevel(page, saved); await select(page, 'mechanism:0')
  await page.getByRole('button', { name: 'Delete object' }).click()
  expect((await saveTestLevel(page)).level.lighting.lights[0]).toEqual(lamp)
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
