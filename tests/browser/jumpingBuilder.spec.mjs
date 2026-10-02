import { test, expect } from './helpers/folderTest.mjs'
import { selectBuilderOption, selectBuilderObject, restartFromPause, useLevelFixtures, installTestFolder, saveTestLevel, reopenTestLevel } from './helpers/jumpingLevels.mjs'
import { blankTrial } from '../../src/games/jumping/level.ts'
import { ropeTower } from '../helpers/rope-tower.mjs'
import { JSON_LAB } from '../helpers/jumping-fixtures.mjs'
import { allSelections, itemDefinition } from '../../src/games/jumping/editor.ts'
import { defaultObjectLabel } from '../../src/games/jumping/objectLabels.ts'

async function open(page, level) {
  if (level) await useLevelFixtures(page, [level])
  await installTestFolder(page, level ? { 'fixture.json': level } : {})
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype, rect = proto.fillRect, ellipse = proto.ellipse, text = proto.fillText, arc = proto.arc, begin = proto.beginPath, move = proto.moveTo, fill = proto.fill
    proto.beginPath = function (...args) { this.jumpPath = []; return begin.apply(this, args) }
    proto.moveTo = function (x, y) { this.jumpPath?.push([x, y]); return move.call(this, x, y) }
    proto.fill = function (...args) {
      if (this.shadowBlur === 3) this.jumpDigitalFace = JSON.stringify(this.jumpPath)
      return fill.apply(this, args)
    }
    proto.fillRect = function (...args) {
      if (args[0] === 0 && args[1] === 0 && this.fillStyle === '#f1f1ed') { this.canvas.jumpCamera = this.getTransform(); this.canvas.wallTimers = []; this.canvas.wallTexts = []; this.canvas.builderHandles = []; this.canvas.builderLabels = [] }
      if (args[0] === 66 && args[1] === 12 && args[2] === 3 && args[3] === 3) {
        const t = this.getTransform(), camera = this.canvas.jumpCamera
        if (camera) this.canvas.wallTimers?.push({ face: this.jumpDigitalFace, x: (t.e - camera.e) / camera.a, screenX: t.e })
      }
      if (this.fillStyle === '#c65231' && args[2] === args[3]) this.canvas.builderHandles?.push({ x: args[0] + args[2] / 2, y: args[1] + args[3] / 2 })
      return rect.apply(this, args)
    }
    proto.arc = function (...args) {
      if (this.fillStyle === '#c65231') this.canvas.builderHandles?.push({ x: args[0], y: args[1] })
      return arc.apply(this, args)
    }
    proto.ellipse = function (...args) {
      if (args[2] === 6.2 && args[3] === 6.2 && this.canvas.jumpCamera) {
        const body = this.getTransform(), camera = this.canvas.jumpCamera
        window.jumpPlayer = { x: (body.e - camera.e) / camera.a, y: (body.f - camera.f) / camera.d }
      }
      return ellipse.apply(this, args)
    }
    proto.fillText = function (value, x, y, ...rest) {
      this.canvas.builderLabels?.push(String(value))
      if (['#718074', '#94433f'].includes(this.fillStyle)) {
        const t = this.getTransform()
        this.canvas.wallTexts?.push({ text: value, x, y, color: this.fillStyle, font: this.font, rotation: Math.atan2(t.b, t.a) * 180 / Math.PI,
          screenX: x * t.a + y * t.c + t.e, screenY: x * t.b + y * t.d + t.f })
      }
      return text.call(this, value, x, y, ...rest)
    }
  })
  await page.goto('/untitled-jumping-game')
  await page.getByRole('button', { name: 'Level studio', exact: true }).click()
  await expect(page.getByRole('application', { name: 'Level canvas' })).toBeVisible()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.clock.runFor(64)
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: 'Choose folder', exact: true }).click()
  if (level) {
    await page.getByRole('button', { name: 'Open fixture.json', exact: true }).click()
    await page.clock.runFor(200)
    await expect(page.getByRole('application', { name: 'Level canvas' })).toHaveAttribute('aria-busy', 'false', { timeout: 15000 })
  } else await page.getByRole('button', { name: 'Close library', exact: true }).click()
}
async function worldPoint(page, point) {
  const canvas = await page.getByRole('application', { name: 'Level canvas' }).boundingBox()
  const camera = await page.getByRole('application', { name: 'Level canvas' }).evaluate(canvas => { const c = canvas.jumpCamera; return { a: c.a, d: c.d, e: c.e, f: c.f, ratio: devicePixelRatio } })
  const x = v => canvas.x + (v * camera.a + camera.e) / camera.ratio, y = v => canvas.y + (v * camera.d + camera.f) / camera.ratio
  return { x: x(point.x), y: y(point.y) }
}
async function dragWorld(page, start, end) {
  const a = await worldPoint(page, start), b = await worldPoint(page, end)
  await page.mouse.move(a.x, a.y); await page.mouse.down()
  await page.mouse.move(b.x, b.y, { steps: 8 }); await page.mouse.up()
}
async function expectHandle(page, point) {
  const canvas = page.getByRole('application', { name: 'Level canvas' })
  await expect.poll(() => canvas.evaluate((c, p) => c.builderHandles.some(h => Math.hypot(h.x - p.x, h.y - p.y) < .01), point)).toBe(true)
}

test('Terrain step templates and toolbar transforms support undo, redo and folder round trips', async ({ page }, info) => {
  await open(page, { ...blankTrial(), width: 1200, height: 800, floor: 800, spawn: { x: 120, y: 800 }, goal: { x: 1040, y: 800 } })
  const wideOutline = [[0,100],[0,80],[40,80],[40,60],[80,60],[80,40],[120,40],[120,20],[160,20],[160,0],
    [220,0],[220,20],[180,20],[180,40],[140,40],[140,60],[100,60],[100,80],[60,80],[60,100]]
  const terrainTools = page.locator('.builder-tool-group').filter({ has: page.getByRole('heading', { name: 'Terrain', exact: true }) })
  const transforms = page.getByRole('group', { name: 'Canvas controls' }).getByRole('group', { name: 'Terrain transforms' })
  for (const button of await transforms.getByRole('button').all()) await expect(button).toBeDisabled()
  const selected = page.getByRole('combobox', { name: 'Selected object' })
  const width = page.getByRole('spinbutton', { name: 'Object w', exact: true })
  const height = page.getByRole('spinbutton', { name: 'Object h', exact: true })
  await terrainTools.getByRole('button', { name: 'Steps narrow', exact: true }).click()
  await dragWorld(page, { x: 300, y: 600 }, { x: 300, y: 600 })
  await expect(width).toHaveValue('120'); await expect(height).toHaveValue('100')
  await expect(page.getByRole('button', { name: 'Pointer', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await terrainTools.getByRole('button', { name: 'Steps wide', exact: true }).click()
  await page.getByRole('checkbox', { name: 'Keep placing' }).check()
  await dragWorld(page, { x: 600, y: 480 }, { x: 600, y: 480 })
  await expect(width).toHaveValue('220'); await expect(height).toHaveValue('100')
  await expect(terrainTools.getByRole('button', { name: 'Steps wide', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Pointer', exact: true }).click()
  await transforms.getByRole('button', { name: 'Rotate right', exact: true }).click()
  await expect(width).toHaveValue('100'); await expect(height).toHaveValue('220')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await selectBuilderObject(page, 'platform:1')
  await expect(width).toHaveValue('220'); await expect(height).toHaveValue('100')
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await selectBuilderObject(page, 'platform:1')
  await expect(width).toHaveValue('100'); await expect(height).toHaveValue('220')
  await transforms.getByRole('button', { name: 'Rotate left', exact: true }).click()
  await expect(width).toHaveValue('220'); await expect(height).toHaveValue('100')
  await transforms.getByRole('button', { name: 'Flip horizontal', exact: true }).click()
  const mirrored = await saveTestLevel(page)
  expect(mirrored.level.platforms[1].polygon).toContainEqual([0, 0])
  expect(mirrored.level.platforms[1].polygon).toContainEqual([220, 100])
  await transforms.getByRole('button', { name: 'Flip vertical', exact: true }).click()
  const saved = await saveTestLevel(page)
  expect(saved.level.platforms).toHaveLength(2)
  expect(saved.level.platforms[0]).toMatchObject({ x: 300, y: 600, w: 120, h: 100 })
  expect(saved.level.platforms[1]).toMatchObject({ x: 600, y: 480, w: 220, h: 100 })
  expect(saved.level.platforms[1].polygon.map(([x,y]) => `${x},${y}`).sort()).toEqual(
    wideOutline.map(([x,y]) => `${220 - x},${100 - y}`).sort())
  await reopenTestLevel(page, saved)
  await selectBuilderObject(page, 'platform:1')
  await expect(width).toHaveValue('220'); await expect(height).toHaveValue('100')
  await transforms.getByRole('button', { name: 'Flip vertical', exact: true }).click()
  await transforms.getByRole('button', { name: 'Flip horizontal', exact: true }).click()
  for (let i = 0; i < 7; i++) await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await page.getByRole('application', { name: 'Level canvas' }).screenshot({ path: info.outputPath('steps-wide-template.png') })
  await page.screenshot({ path: info.outputPath('terrain-tools-desktop.png') })
  await selectBuilderObject(page, 'spawn:0')
  for (const button of await transforms.getByRole('button').all()) await expect(button).toBeDisabled()
  await page.setViewportSize({ width: 390, height: 844 })
  await selectBuilderObject(page, 'platform:0')
  await transforms.getByRole('button', { name: 'Rotate right', exact: true }).click()
  await expect(width).toHaveValue('100'); await expect(height).toHaveValue('120')
  expect(await page.getByRole('complementary', { name: 'Building tools' }).evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath('terrain-tools-narrow.png') })
})

test('builder help contains the guidance, isolates shortcuts, and restores the editing focus and draft', async ({ page }) => {
  const level = { ...blankTrial(), platforms: [{ x: 400, y: 680, w: 240, h: 120 }] }
  await open(page, level)
  await selectBuilderObject(page, 'platform:0')
  const width = page.getByRole('spinbutton', { name: 'Object w', exact: true })
  await width.fill('300'); await width.press('Enter')
  const node = page.getByRole('button', { name: 'Node', exact: true })
  await node.click()
  const help = page.getByRole('button', { name: 'Help', exact: true })
  await help.click()
  const dialog = page.getByRole('dialog', { name: 'Level builder help' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Close help' })).toBeFocused()
  await expect(dialog.getByRole('heading', { name: 'Reshape', exact: true })).toBeVisible()
  await page.keyboard.press('ControlOrMeta+z')
  await page.keyboard.press('Delete')
  await page.keyboard.press('v')
  await page.keyboard.press('Tab')
  await expect(dialog.getByRole('tab', { name: 'Canvas', exact: true })).toBeFocused()
  await page.keyboard.press('End')
  await expect(dialog.getByRole('tab', { name: 'Controller', exact: true })).toBeFocused()
  await expect(dialog.getByRole('tabpanel', { name: 'Controller', exact: true })).toBeVisible()
  await page.keyboard.press('ArrowLeft')
  await expect(dialog.getByRole('tab', { name: 'Shortcuts', exact: true })).toBeFocused()
  await expect(dialog.getByRole('tabpanel', { name: 'Shortcuts', exact: true })).toBeVisible()
  await page.keyboard.press('Tab')
  await expect(dialog.getByRole('tabpanel', { name: 'Shortcuts', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(help).toBeFocused()
  await expect(width).toHaveValue('300')
  await expect(node).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('complementary', { name: 'Inspector' })).not.toContainText('Enter applies')
  await help.press('F1')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addStyleTag({ content: 'html { font-size: 200%; }' })
  await expect(dialog.getByRole('button', { name: 'Close help' })).toBeInViewport()
  await dialog.getByRole('tab', { name: 'Shortcuts', exact: true }).click()
  const instructions = dialog.getByRole('tabpanel', { name: 'Shortcuts', exact: true })
  expect(await instructions.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  expect(await instructions.evaluate(el => el.clientHeight)).toBeGreaterThan(100)
  await instructions.getByText('Step one unit', { exact: true }).scrollIntoViewIfNeeded()
  await expect(instructions.getByText('Step one unit', { exact: true })).toBeInViewport()
  await dialog.getByRole('button', { name: 'Close help' }).click()
  await expect(help).toBeFocused()
})

test('object names apply as one edit, label mechanism connections, and survive folder saves', async ({ page }, info) => {
  const level = { ...blankTrial(), mechanisms: [{ id: 'exit-gate', kind: 'gate', x: 900, y: 720, w: 20, h: 200, travel: 200 }],
    triggers: [{ x: 400, y: 920, w: 100, mode: 'weight', targets: ['exit-gate'] }] }
  await open(page, level)
  const selected = page.getByRole('combobox', { name: 'Selected object' }), name = page.getByRole('textbox', { name: 'Object name', exact: true })
  await selectBuilderObject(page, 'mechanism:0')
  await expect(name).toHaveAttribute('placeholder', 'Gate 1')
  await name.fill('  West gate  ')
  await expect(selected).toHaveText('Gate 1')
  await name.press('Enter')
  await expect(name).toHaveValue('West gate')
  await expect(selected).toHaveText('West gate · Gate 1')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await selectBuilderObject(page, 'mechanism:0'); await expect(name).toHaveValue('')
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await selectBuilderObject(page, 'mechanism:0'); await expect(name).toHaveValue('West gate')
  await name.fill('Unwanted change'); await name.press('Escape')
  await expect(name).toHaveValue('West gate')
  await page.getByRole('button', { name: 'Duplicate', exact: true }).click()
  await expect(selected).toHaveText('West gate · Gate 2')
  await selectBuilderObject(page, 'trigger:0')
  await name.fill('Gate switch'); await name.press('Tab')
  const connection = page.getByRole('checkbox', { name: 'West gate · Gate 1', exact: true })
  await connection.uncheck(); await connection.check()
  await expect(name).toHaveValue('Gate switch')
  await page.getByRole('complementary', { name: 'Inspector' }).evaluate(el => { el.scrollTop = 0 })
  await page.screenshot({ path: info.outputPath('named-object-inspector.png') })
  const saved = await saveTestLevel(page)
  expect(saved.level.triggers[0]).toMatchObject({ name: 'Gate switch', targets: ['exit-gate'] })
  expect(saved.level.mechanisms[0]).toMatchObject({ name: 'West gate', id: 'exit-gate' })
  expect(saved.level.mechanisms[1].name).toBe('West gate')
  expect(saved.level.mechanisms[1].id).not.toBe('exit-gate')
  await reopenTestLevel(page, saved)
  await selectBuilderObject(page, 'mechanism:0'); await expect(name).toHaveValue('West gate')
  await name.fill(''); await name.press('Enter')
  await expect(selected).toHaveText('Gate 1')
  await selectBuilderObject(page, 'trigger:0')
  await expect(page.getByRole('checkbox', { name: 'Gate 1', exact: true })).toBeChecked()
  const cleared = await saveTestLevel(page)
  expect(cleared.level.mechanisms[0]).not.toHaveProperty('name')
  expect(cleared.level.triggers[0].name).toBe('Gate switch')
  await selectBuilderObject(page, 'mechanism:0')
  await name.fill('W'.repeat(80)); await name.press('Enter')
  await selectBuilderObject(page, 'trigger:0')
  await expect(page.getByRole('checkbox', { name: `${'W'.repeat(80)} · Gate 1`, exact: true })).toBeVisible()
  expect(await page.getByRole('complementary', { name: 'Inspector' }).evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
})

test('every selectable item can be named in the inspector and reopened with its name', async ({ page }) => {
  const level = { ...structuredClone(JSON_LAB), version: 2, lighting: { nightMode: false, ambient: 0, lights: [
    { id: 'lamp', x: 600, y: 200, direction: 90, spread: 60, intensity: 100, power: 'always' },
  ] } }
  level.platforms[0].name = 'Rope support'
  await open(page, level)
  const selected = page.getByRole('combobox', { name: 'Selected object' })
  const field = page.getByRole('textbox', { name: 'Object name', exact: true })
  const selections = [...new Map(allSelections(level).map(s => [s.kind, s])).values()]
  expect(selections).toHaveLength(14)
  for (const selection of selections) {
    await selectBuilderObject(page, `${selection.kind}:${selection.index}`)
    const name = `Named ${selection.kind}`
    await expect(field).toBeEditable()
    await field.fill(name); await field.press('Enter')
    await expect(field).toHaveValue(name)
    await expect(selected).toHaveText(`${name} · ${defaultObjectLabel(level, selection)}`)
  }
  const saved = await saveTestLevel(page)
  for (const selection of selections) expect(itemDefinition(saved.level, selection).name).toBe(`Named ${selection.kind}`)
  await reopenTestLevel(page, saved)
  for (const selection of selections) {
    await selectBuilderObject(page, `${selection.kind}:${selection.index}`)
    await expect(field).toHaveValue(`Named ${selection.kind}`)
  }
  await selectBuilderObject(page, 'rope:0')
  await expect(page.locator('.builder-anchor')).toContainText('Anchored to Rope support · Terrain 1')
})

test('terrain and floor materials undo, save and render consistently in the editor and game', async ({ page }, info) => {
  const level = { ...blankTrial(), width: 1200, height: 800, floor: 800, spawn: { x: 120, y: 800 }, goal: { x: 1040, y: 800 },
    platforms: [{ x: 400, y: 680, w: 240, h: 120 }] }
  await open(page, level)
  await selectBuilderObject(page, 'platform:0')
  const material = page.getByRole('group', { name: 'Terrain material', exact: true })
  await expect(material.getByRole('button', { name: 'Stone', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await material.getByRole('button', { name: 'Chalk', exact: true }).click()
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await selectBuilderObject(page, 'platform:0')
  await expect(material.getByRole('button', { name: 'Stone', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await selectBuilderObject(page, 'platform:0')
  await expect(material.getByRole('button', { name: 'Chalk', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await material.getByRole('button', { name: 'Steel', exact: true }).click()
  await page.getByRole('tab', { name: 'Level', exact: true }).click()
  await page.getByRole('group', { name: 'Floor material', exact: true }).getByRole('button', { name: 'Earth', exact: true }).click()
  const saved = await saveTestLevel(page)
  expect(saved.level.platforms[0].material).toBe('steel')
  expect(saved.level.floorMaterial).toBe('earth')
  await reopenTestLevel(page, saved)
  await selectBuilderObject(page, 'platform:0')
  await expect(material.getByRole('button', { name: 'Steel', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.clock.runFor(100)
  const pixel = (canvas, x, y) => canvas.evaluate((canvas, { x, y }) => {
    const t = canvas.jumpCamera
    return [...canvas.getContext('2d').getImageData(Math.round(x * t.a + t.e), Math.round(y * t.d + t.f), 1, 1).data]
  }, { x, y })
  const editor = page.getByRole('application', { name: 'Level canvas' })
  expect(await pixel(editor, 500, 740)).toEqual([154, 168, 177, 255])
  expect(await pixel(editor, 500, 810)).toEqual([178, 161, 140, 255])
  await page.screenshot({ path: info.outputPath('terrain-materials-editor.png') })
  await saveTestLevel(page, 'Save and Test'); await page.clock.runFor(100)
  const game = page.getByRole('img', { name: `${level.name}: reach the exit`, exact: true })
  expect(await pixel(game, 500, 740)).toEqual([154, 168, 177, 255])
  expect(await pixel(game, 500, 810)).toEqual([178, 161, 140, 255])
  await page.screenshot({ path: info.outputPath('terrain-materials-game.png') })
})

test('tower edits settle ropes off-thread only after dragging, and never overwrite newer edits', async ({ page }) => {
  await page.addInitScript(() => {
    window.ropeWorkerStarts = 0
    const fill = CanvasRenderingContext2D.prototype.fillRect
    CanvasRenderingContext2D.prototype.fillRect = function (...args) {
      if (this.fillStyle === '#eeeee6') this.canvas.editorPaints = (this.canvas.editorPaints ?? 0) + 1
      return fill.apply(this, args)
    }
    const OriginalWorker = window.Worker
    window.Worker = class extends OriginalWorker {
      constructor(url, options) { super(url, options); if (String(url).includes('ropeLayout.worker')) window.ropeWorkerStarts++ }
    }
  })
  await open(page, ropeTower())
  const canvas = page.getByRole('application', { name: 'Level canvas' })
  await page.getByRole('button', { name: 'Fit level overview' }).click()
  await selectBuilderObject(page, 'platform:1')
  const before = await page.evaluate(() => window.ropeWorkerStarts)
  await dragWorld(page, { x: 500, y: 390 }, { x: 560, y: 410 })
  expect(await page.evaluate(() => window.ropeWorkerStarts)).toBe(before)
  await page.clock.runFor(130)
  expect(await page.evaluate(() => window.ropeWorkerStarts)).toBe(before + 1)
  // Replace the edit while its layout is still outstanding.
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await selectBuilderObject(page, 'platform:1')
  await page.getByRole('spinbutton', { name: 'Object x', exact: true }).fill('440'); await page.getByRole('spinbutton', { name: 'Object x', exact: true }).press('Enter')
  await page.clock.runFor(200)
  await expect(canvas).toHaveAttribute('aria-busy', 'false', { timeout: 15000 })
  const paints = await canvas.evaluate(canvas => canvas.editorPaints)
  await page.clock.runFor(1000)
  expect(await canvas.evaluate(canvas => canvas.editorPaints)).toBe(paints)
  const { level } = await saveTestLevel(page)
  expect(level.platforms[1].x).toBe(440)
  expect(level.platforms[1].y).toBe(360)
  expect(level.climbables.ropes.every(r => !r.rest.key.startsWith('preview:'))).toBe(true)
})

test('object tools place editable balls, boxes, elevators, gates and shovebots with connected pressure plates', async ({ page }, info) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await open(page)
  await page.getByRole('textbox', { name: 'Level name' }).fill('Object workshop')
  const selected = page.getByRole('combobox', { name: 'Selected object' })
  const place = async (name, point, end = point) => {
    await page.getByRole('button', { name, exact: true }).click()
    await dragWorld(page, point, end)
  }
  await place('Ball', { x: 260, y: 880 })
  await expect(selected).toHaveAttribute('data-value', 'prop:0')
  await page.getByRole('spinbutton', { name: 'Object w', exact: true }).fill('60'); await page.getByRole('spinbutton', { name: 'Object w', exact: true }).press('Enter')
  await place('Box', { x: 380, y: 880 })
  await expect(selected).toHaveAttribute('data-value', 'prop:1')
  await page.getByRole('spinbutton', { name: 'Object w', exact: true }).fill('100'); await page.getByRole('spinbutton', { name: 'Object w', exact: true }).press('Enter')
  await place('Elevator', { x: 500, y: 900 }, { x: 500, y: 660 })
  await expect(selected).toHaveAttribute('data-value', 'mechanism:0')
  await page.getByRole('spinbutton', { name: 'Object w', exact: true }).fill('180'); await page.getByRole('spinbutton', { name: 'Object w', exact: true }).press('Enter')
  await expect(page.getByRole('spinbutton', { name: 'Object h', exact: true })).toHaveValue('20')
  await expect(page.getByRole('spinbutton', { name: 'Travel height' })).toHaveValue('240')
  await place('Gate', { x: 820, y: 900 })
  await expect(selected).toHaveAttribute('data-value', 'mechanism:1')
  await page.getByRole('spinbutton', { name: 'Object h', exact: true }).fill('200'); await page.getByRole('spinbutton', { name: 'Object h', exact: true }).press('Enter')
  await expect(page.getByRole('spinbutton', { name: 'Object w', exact: true })).toHaveValue('20')
  await place('Shovebot', { x: 740, y: 900 })
  await expect(selected).toHaveAttribute('data-value', 'robot:0')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await selected.click()
  await expect(page.getByRole('listbox').locator('[role=option][data-value="robot:0"]')).toHaveCount(0)
  await selected.press('Escape')
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await selectBuilderObject(page, 'robot:0')
  await page.getByRole('spinbutton', { name: 'Shovebot left limit' }).fill('660'); await page.getByRole('spinbutton', { name: 'Shovebot left limit' }).press('Enter')
  await page.getByRole('spinbutton', { name: 'Shovebot right limit' }).fill('780'); await page.getByRole('spinbutton', { name: 'Shovebot right limit' }).press('Enter')
  for (const [x, target] of [[100, 'Elevator 1'], [660, 'Gate 2']]) {
    await place('Pressure plate', { x, y: 900 })
    const connections = page.getByRole('group', { name: 'Activates', exact: true })
    for (const checkbox of await connections.getByRole('checkbox').all()) await checkbox.uncheck()
    await connections.getByRole('checkbox', { name: target, exact: true }).check()
  }
  await expect(page.getByRole('button', { name: 'Save and Test', exact: true })).toBeEnabled()
  const saved = await saveTestLevel(page, 'Save level')
  expect(saved.level.props).toEqual([{ kind: 'ball', x: 260, y: 920, size: 60 }, { kind: 'box', x: 380, y: 920, size: 100 }])
  expect(saved.level.mechanisms.map(({ kind, x, y, w, h, travel }) => ({ kind, x, y, w, h, travel }))).toEqual([
    { kind: 'lift', x: 500, y: 900, w: 180, h: 20, travel: 240 },
    { kind: 'gate', x: 820, y: 720, w: 20, h: 200, travel: 200 },
  ])
  expect(saved.level.robots).toEqual([{ x: 740, y: 920, left: 660, right: 780 }])
  expect(saved.level.triggers.map(p => p.targets)).toEqual(saved.level.mechanisms.map(m => [m.id]))
  await reopenTestLevel(page, saved); await page.clock.runFor(32)
  expect((await saveTestLevel(page)).level).toEqual(saved.level)
  await selectBuilderObject(page, 'mechanism:0')
  await page.getByRole('button', { name: 'Elevator', exact: true }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: info.outputPath('object-tools-builder.png') })
  await saveTestLevel(page, 'Save and Test'); await page.clock.runFor(64)
  await expect(page.getByRole('img', { name: 'Object workshop: reach the exit' })).toBeVisible()
  await page.keyboard.down('d'); await page.clock.runFor(64); await page.keyboard.up('d')
  await page.getByRole('button', { name: 'Return to builder' }).click()
  expect((await saveTestLevel(page)).level).toEqual(saved.level)
  expect(errors).toEqual([])
})

test('elevator anchor dragging adjusts travel with snap, undo, and save while keeping the platform fixed', async ({ page }, info) => {
  const level = blankTrial()
  level.mechanisms = [{ id: 'lift', kind: 'lift', x: 500, y: 900, w: 180, h: 20, travel: 240 }]
  await open(page, level)
  const selected = page.getByRole('combobox', { name: 'Selected object' }), travel = page.getByRole('spinbutton', { name: 'Travel height' })
  await selectBuilderObject(page, 'mechanism:0')
  await expect(travel).toHaveValue('240')
  await dragWorld(page, { x: 590, y: 660 }, { x: 630, y: 427 })
  await expect(travel).toHaveValue('480')
  expect((await saveTestLevel(page)).level.mechanisms[0]).toEqual({ ...level.mechanisms[0], travel: 480 })
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await selectBuilderObject(page, 'mechanism:0'); await expect(travel).toHaveValue('240')
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await selectBuilderObject(page, 'mechanism:0'); await expect(travel).toHaveValue('480')
  await page.getByRole('checkbox', { name: 'Snap' }).uncheck()
  await dragWorld(page, { x: 590, y: 420 }, { x: 590, y: 437 })
  await expect(travel).toHaveValue('463')
  await travel.fill('360')
  const saved = await saveTestLevel(page)
  expect(saved.level.mechanisms[0]).toEqual({ ...level.mechanisms[0], travel: 360 })
  await reopenTestLevel(page, saved)
  await selectBuilderObject(page, 'mechanism:0'); await expect(travel).toHaveValue('360')
  await page.screenshot({ path: info.outputPath('elevator-travel-height.png') })
})

test('one pressure plate controls a gate and elevator through editing, save and play', async ({ page }, info) => {
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype, roundRect = proto.roundRect, arc = proto.arc
    proto.roundRect = function (x, y, w, h, ...rest) {
      const kind = this.fillStyle === '#8f9e98' && w === 20 ? 'gate' : this.fillStyle === '#b3a28d' && h === 20 ? 'lift' : null
      if (kind) (this.canvas.mechanismBodies ??= {})[kind] = { x, y, w, h }
      return roundRect.call(this, x, y, w, h, ...rest)
    }
    proto.arc = function (x, y, r, ...rest) {
      if (this.fillStyle === '#697d72' && r === 5) (this.canvas.mechanismAnchors ??= {})[x] = y
      return arc.call(this, x, y, r, ...rest)
    }
  })
  const level = blankTrial(); level.spawn.x = 340
  level.mechanisms = [
    { id: 'gate', kind: 'gate', x: 600, y: 740, w: 44, h: 180, travel: 220 },
    { id: 'lift', kind: 'lift', x: 900, y: 890, w: 160, h: 22, travel: 200 },
  ]
  level.triggers = [{ x: 300, y: 920, w: 80, target: 'gate', mode: 'weight' }]
  await open(page, level)
  const selected = page.getByRole('combobox', { name: 'Selected object' }), editor = page.getByRole('application', { name: 'Level canvas' })
  await selectBuilderObject(page, 'trigger:0')
  await expect(page.getByRole('checkbox', { name: 'Gate 1', exact: true })).toBeChecked()
  await page.getByRole('checkbox', { name: 'Elevator 2', exact: true }).check()
  await expect(page.getByRole('combobox', { name: 'Pressure mode' })).toHaveCount(0)
  await expect(page.getByRole('group', { name: 'Activates', exact: true }).getByRole('checkbox', { checked: true })).toHaveCount(2)
  await selectBuilderObject(page, 'mechanism:0')
  await expect(page.getByRole('spinbutton', { name: 'Object w', exact: true })).toHaveValue('20')
  await expect(page.getByRole('spinbutton', { name: 'Object w', exact: true })).toBeDisabled()
  await page.getByRole('spinbutton', { name: 'Object h', exact: true }).fill('160'); await page.getByRole('spinbutton', { name: 'Object h', exact: true }).press('Enter')
  await expect(page.getByRole('spinbutton', { name: 'Travel height' })).toHaveCount(0)
  await selectBuilderObject(page, 'mechanism:1')
  await expect(page.getByRole('spinbutton', { name: 'Object h', exact: true })).toHaveValue('20')
  await expect(page.getByRole('spinbutton', { name: 'Object h', exact: true })).toBeDisabled()
  await page.getByRole('spinbutton', { name: 'Object w', exact: true }).fill('200'); await page.getByRole('spinbutton', { name: 'Object w', exact: true }).press('Enter')
  await page.getByRole('spinbutton', { name: 'Travel height' }).fill('240'); await page.getByRole('spinbutton', { name: 'Travel height' }).press('Enter')
  await page.clock.runFor(32)
  expect(await editor.evaluate(canvas => canvas.mechanismBodies)).toEqual({
    gate: { x: 612, y: 760, w: 20, h: 160 }, lift: { x: 900, y: 890, w: 200, h: 20 },
  })
  const exported = await saveTestLevel(page)
  expect(exported.level.triggers).toEqual([{ x: 300, y: 920, w: 80, targets: ['gate', 'lift'], mode: 'weight' }])
  expect(exported.level.mechanisms.map(m => [m.w, m.h, m.travel])).toEqual([[20, 160, 160], [200, 20, 240]])
  await reopenTestLevel(page, exported); await page.clock.runFor(32)
  expect(await editor.evaluate(canvas => canvas.mechanismAnchors?.[622])).toBeUndefined()
  expect(await editor.evaluate(canvas => canvas.mechanismAnchors?.[1000])).toBeUndefined()
  await page.screenshot({ path: info.outputPath('suspended-mechanisms-builder.png') })
  await saveTestLevel(page, 'Save and Test'); await page.clock.runFor(64)
  const game = page.getByRole('img', { name: 'Untitled level: reach the exit' })
  await page.keyboard.down('d'); await page.clock.runFor(32); await page.keyboard.up('d')
  await page.clock.runFor(2600)
  expect(await game.evaluate(canvas => canvas.mechanismBodies.gate.y)).toBe(600)
  expect(await game.evaluate(canvas => canvas.mechanismBodies.lift.y)).toBe(650)
  expect(await game.evaluate(canvas => canvas.mechanismAnchors?.[622])).toBeUndefined()
  expect(await game.evaluate(canvas => canvas.mechanismAnchors?.[1000])).toBeUndefined()
  await page.screenshot({ path: info.outputPath('suspended-mechanisms-raised.png') })
  await page.clock.runFor(4000)
  expect(await game.evaluate(canvas => canvas.mechanismBodies.gate.y)).toBe(600)
  expect(await game.evaluate(canvas => canvas.mechanismBodies.lift.y)).toBeGreaterThan(650)
  await page.keyboard.down('d'); await page.clock.runFor(320); await page.keyboard.up('d'); await page.clock.runFor(32)
  const stoppedY = await game.evaluate(canvas => canvas.mechanismBodies.lift.y)
  await page.clock.runFor(2400)
  expect(await game.evaluate(canvas => canvas.mechanismBodies.gate.y)).toBe(760)
  expect(await game.evaluate(canvas => canvas.mechanismBodies.lift.y)).toBe(stoppedY)
  await page.screenshot({ path: info.outputPath('suspended-mechanisms-released.png') })
})

test('moving platforms edit horizontal stops, flip, save and cycle during play', async ({ page }, info) => {
  // This exercises several complete trips and a stopped interval. CI's software
  // renderer takes longer than real time to advance the virtual animation clock.
  test.setTimeout(60_000)
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    const roundRect = CanvasRenderingContext2D.prototype.roundRect
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, ...rest) {
      if (this.fillStyle === '#b3a28d' && h === 20) this.canvas.movingPlatform = { x, y, w, h }
      return roundRect.call(this, x, y, w, h, ...rest)
    }
  })
  const level = blankTrial(); level.spawn.x = 340
  await open(page, level)
  await page.getByRole('button', { name: 'Moving platform', exact: true }).click()
  await dragWorld(page, { x: 700, y: 700 }, { x: 400, y: 700 })
  const selected = page.getByRole('combobox', { name: 'Selected object' })
  const travel = page.getByRole('spinbutton', { name: 'Travel distance', exact: true })
  const flip = page.getByRole('button', { name: 'Flip horizontally', exact: true })
  await expect(selected).toHaveText('Moving platform 1')
  await expect(travel).toHaveValue('300')
  await expect(flip).toHaveAttribute('aria-pressed', 'false')
  await dragWorld(page, { x: 470, y: 700 }, { x: 430, y: 700 })
  await expect(travel).toHaveValue('340')
  await dragWorld(page, { x: 430, y: 700 }, { x: 470, y: 700 })
  await expect(travel).toHaveValue('300')
  const width = page.getByRole('spinbutton', { name: 'Object w', exact: true })
  await width.fill('200'); await width.press('Enter')
  await expect(page.getByRole('spinbutton', { name: 'Object h', exact: true })).toBeDisabled()
  await expect(travel).toHaveValue('300')
  await dragWorld(page, { x: 500, y: 700 }, { x: 440, y: 700 })
  await expect(travel).toHaveValue('360')
  await flip.click(); await expect(flip).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await selectBuilderObject(page, 'mechanism:0')
  await expect(flip).toHaveAttribute('aria-pressed', 'false')
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await selectBuilderObject(page, 'mechanism:0')
  await expect(flip).toHaveAttribute('aria-pressed', 'true')
  await dragWorld(page, { x: 1160, y: 700 }, { x: 1100, y: 700 })
  await expect(travel).toHaveValue('300')
  await travel.fill('360'); await travel.press('Enter')
  await page.screenshot({ path: info.outputPath('moving-platform-builder.png') })
  await page.getByRole('button', { name: 'Pressure plate', exact: true }).click()
  await dragWorld(page, { x: 340, y: 900 }, { x: 340, y: 900 })
  await expect(page.getByRole('checkbox', { name: 'Moving platform 1', exact: true })).toBeChecked()
  const saved = await saveTestLevel(page)
  expect(saved.level.mechanisms[0]).toMatchObject({ kind: 'lift', orientation: 'horizontal', flipX: true, x: 700, y: 700, w: 200, h: 20, travel: 360 })
  await reopenTestLevel(page, saved); await selectBuilderObject(page, 'mechanism:0')
  await expect(travel).toHaveValue('360'); await expect(flip).toHaveAttribute('aria-pressed', 'true')
  expect((await saveTestLevel(page)).level).toEqual(saved.level)
  await saveTestLevel(page, 'Save and Test'); await page.clock.runFor(64)
  const game = page.getByRole('img', { name: 'Untitled level: reach the exit' })
  expect(await game.evaluate(canvas => canvas.movingPlatform)).toEqual({ x: 700, y: 700, w: 200, h: 20 })
  await page.keyboard.down('d'); await page.clock.runFor(32); await page.keyboard.up('d')
  await page.clock.runFor(3100)
  expect(await game.evaluate(canvas => canvas.movingPlatform)).toEqual({ x: 1060, y: 700, w: 200, h: 20 })
  await page.screenshot({ path: info.outputPath('moving-platform-far-stop.png') })
  await page.clock.runFor(4000)
  const returning = await game.evaluate(canvas => canvas.movingPlatform)
  expect(returning.y).toBe(700); expect(returning.x).toBeLessThan(1060); expect(returning.x).toBeGreaterThan(700)
  await page.keyboard.down('d'); await page.clock.runFor(640); await page.keyboard.up('d')
  await page.clock.runFor(32)
  const stopped = await game.evaluate(canvas => canvas.movingPlatform)
  await page.clock.runFor(4000)
  expect(await game.evaluate(canvas => canvas.movingPlatform)).toEqual(stopped)
  await restartFromPause(page); await page.clock.runFor(64)
  expect(await game.evaluate(canvas => canvas.movingPlatform)).toEqual({ x: 700, y: 700, w: 200, h: 20 })
  expect(errors).toEqual([])
})

test('horizontal gates resize, flip, round-trip and retract one width only while pressed', async ({ page }, info) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype, roundRect = proto.roundRect, arc = proto.arc
    proto.roundRect = function (x, y, w, h, ...rest) {
      if (this.fillStyle === '#8f9e98' && h === 20) this.canvas.gateBody = { x, y, w, h }
      return roundRect.call(this, x, y, w, h, ...rest)
    }
    proto.arc = function (x, y, r, ...rest) {
      if (this.fillStyle === '#697d72' && r === 5) this.canvas.gateAnchor = { x, y }
      return arc.call(this, x, y, r, ...rest)
    }
  })
  const level = blankTrial(); level.spawn.x = 340
  await open(page, level)
  await page.getByRole('button', { name: 'Horizontal gate', exact: true }).click()
  await dragWorld(page, { x: 700, y: 780 }, { x: 880, y: 780 })
  const editor = page.getByRole('application', { name: 'Level canvas' }), selected = page.getByRole('combobox', { name: 'Selected object' })
  await expect(selected).toHaveAttribute('data-value', 'mechanism:0')
  await page.getByRole('spinbutton', { name: 'Object w', exact: true }).fill('200'); await page.getByRole('spinbutton', { name: 'Object w', exact: true }).press('Enter')
  await expect(page.getByRole('spinbutton', { name: 'Object h', exact: true })).toBeDisabled()
  await expect(page.getByRole('spinbutton', { name: 'Travel height' })).toHaveCount(0)
  await page.clock.runFor(32)
  expect(await editor.evaluate(canvas => canvas.gateAnchor)).toBeUndefined()
  await page.getByRole('button', { name: 'Flip horizontally', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Flip horizontally', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await page.clock.runFor(32)
  expect((await saveTestLevel(page)).level.mechanisms[0].flipX).toBeUndefined()
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); await page.clock.runFor(32)
  expect((await saveTestLevel(page)).level.mechanisms[0].flipX).toBe(true)
  await page.getByRole('button', { name: 'Pressure plate', exact: true }).click()
  await dragWorld(page, { x: 340, y: 900 }, { x: 340, y: 900 })
  await expect(page.getByRole('checkbox', { name: 'Horizontal gate 1', exact: true })).toBeChecked()
  const saved = await saveTestLevel(page)
  expect(saved.level.mechanisms[0]).toMatchObject({ kind: 'gate', orientation: 'horizontal', flipX: true, x: 700, y: 780, w: 200, h: 20, travel: 200 })
  await reopenTestLevel(page, saved); await page.clock.runFor(32)
  expect((await saveTestLevel(page)).level).toEqual(saved.level)
  await selectBuilderObject(page, 'mechanism:0')
  await page.screenshot({ path: info.outputPath('horizontal-gate-builder.png') })
  await saveTestLevel(page, 'Save and Test'); await page.clock.runFor(64)
  const game = page.getByRole('img', { name: 'Untitled level: reach the exit' })
  expect(await game.evaluate(canvas => canvas.gateBody)).toEqual({ x: 700, y: 780, w: 200, h: 20 })
  await page.keyboard.down('d'); await page.clock.runFor(32); await page.keyboard.up('d'); await page.clock.runFor(2300)
  expect(await game.evaluate(canvas => canvas.gateBody)).toEqual({ x: 900, y: 780, w: 200, h: 20 })
  expect(await game.evaluate(canvas => canvas.gateAnchor)).toBeUndefined()
  await page.screenshot({ path: info.outputPath('horizontal-gate-open.png') })
  await page.keyboard.down('d'); await page.clock.runFor(640); await page.keyboard.up('d'); await page.clock.runFor(3500)
  expect(await game.evaluate(canvas => canvas.gateBody)).toEqual({ x: 700, y: 780, w: 200, h: 20 })
  await page.screenshot({ path: info.outputPath('horizontal-gate-closed.png') })
  expect(errors).toEqual([])
})

test('goal lights flip horizontally, survive moving and save, and still activate in play', async ({ page }, info) => {
  await page.addInitScript(() => {
    const arc = CanvasRenderingContext2D.prototype.arc
    CanvasRenderingContext2D.prototype.arc = function (...args) {
      if (args[2] === 11 && ['#9aa38e', '#a9d56b'].includes(this.fillStyle))
        this.canvas.goalLight = { x: args[0], y: args[1], lit: this.fillStyle === '#a9d56b' }
      return arc.apply(this, args)
    }
  })
  const level = blankTrial(); level.goal = { x: 500, y: 920, id: 'exit', power: 'switched' }
  level.triggers = [{ x: 520, y: 920, w: 80, mode: 'weight', behavior: 'switch', targets: ['exit'] }]
  await open(page, level)
  const selected = page.getByRole('combobox', { name: 'Selected object' }), editor = page.getByRole('application', { name: 'Level canvas' })
  await selectBuilderObject(page, 'goal:0')
  const flip = page.getByRole('button', { name: 'Flip horizontally', exact: true })
  await expect(flip).toHaveAttribute('aria-pressed', 'false')
  expect(await editor.evaluate(canvas => canvas.goalLight.x)).toBe(544)
  await flip.click(); await page.clock.runFor(32)
  await expect(flip).toHaveAttribute('aria-pressed', 'true')
  expect(await editor.evaluate(canvas => canvas.goalLight.x)).toBe(456)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await selectBuilderObject(page, 'goal:0')
  await expect(flip).toHaveAttribute('aria-pressed', 'false')
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await selectBuilderObject(page, 'goal:0')
  await expect(flip).toHaveAttribute('aria-pressed', 'true')
  await flip.click(); await expect(flip).toHaveAttribute('aria-pressed', 'false')
  await flip.click()
  await page.getByRole('spinbutton', { name: 'Object x', exact: true }).fill('600'); await page.getByRole('spinbutton', { name: 'Object x', exact: true }).press('Enter')
  await selectBuilderObject(page, 'spawn:0'); await page.clock.runFor(32)
  await dragWorld(page, { x: 556, y: 824 }, { x: 556, y: 824 })
  await expect(selected).toHaveAttribute('data-value', 'goal:0')
  const exported = await saveTestLevel(page)
  expect(exported.level.goal).toEqual({ x: 600, y: 920, id: 'exit', power: 'switched', flipX: true })
  await reopenTestLevel(page, exported); await page.clock.runFor(32)
  expect(await editor.evaluate(canvas => canvas.goalLight)).toEqual({ x: 556, y: 824, lit: false })
  await selectBuilderObject(page, 'goal:0')
  await expect(flip).toHaveAttribute('aria-pressed', 'true')
  await page.screenshot({ path: info.outputPath('flipped-goal-builder.png') })
  await saveTestLevel(page, 'Save and Test'); await page.clock.runFor(64)
  const game = page.getByRole('img', { name: 'Untitled level: reach the exit' })
  expect(await game.evaluate(canvas => canvas.goalLight)).toEqual({ x: 556, y: 824, lit: false })
  await page.keyboard.down('d')
  for (let i = 0; i < 120 && !await game.evaluate(canvas => canvas.goalLight.lit); i++) await page.clock.runFor(16)
  await page.keyboard.up('d')
  expect(await game.evaluate(canvas => canvas.goalLight.lit)).toBe(true)
  await page.screenshot({ path: info.outputPath('flipped-goal-lit.png') })
  await page.clock.runFor(1600)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.keyboard.down('a'); await page.clock.runFor(1800); await page.keyboard.up('a')
  await expect(page.getByRole('dialog', { name: 'Level complete' })).toBeVisible()
})

test('stopwatches can be placed, edited, duplicated, undone, saved, reopened and playtested', async ({ page }, info) => {
  await open(page)
  await page.getByRole('button', { name: 'Stopwatch', exact: true }).click()
  await dragWorld(page, { x: 320, y: 840 }, { x: 320, y: 840 })
  await expect(page.getByRole('combobox', { name: 'Selected object' })).toHaveAttribute('data-value', 'pickup:0')
  await page.getByRole('button', { name: 'Duplicate', exact: true }).click()
  await page.getByRole('spinbutton', { name: 'Object x', exact: true }).fill('600'); await page.getByRole('spinbutton', { name: 'Object x', exact: true }).press('Enter')
  await page.getByRole('spinbutton', { name: 'Object y', exact: true }).fill('240'); await page.getByRole('spinbutton', { name: 'Object y', exact: true }).press('Enter')
  await page.getByRole('button', { name: 'Delete object' }).click()
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  const exported = await saveTestLevel(page)
  expect(exported.level.pickups).toEqual([{ kind: 'stopwatch', x: 344, y: 872 }, { kind: 'stopwatch', x: 624, y: 712 }])
  await reopenTestLevel(page, exported)
  expect((await saveTestLevel(page)).level.pickups).toEqual(exported.level.pickups)
  await selectBuilderObject(page, 'pickup:0')
  await page.screenshot({ path: info.outputPath('stopwatch-builder.png') })
  await saveTestLevel(page, 'Save and Test'); await page.clock.runFor(64)
  await page.keyboard.down('d'); await page.clock.runFor(800); await page.keyboard.up('d')
  const frozenTime = await page.getByTestId('level-time').innerText()
  expect(frozenTime).toMatch(/^0:00\./)
  await page.clock.runFor(2000)
  await expect(page.getByTestId('level-time')).toHaveText(frozenTime)
  await page.getByRole('button', { name: 'Return to builder' }).click()
  expect((await saveTestLevel(page)).level.pickups).toEqual(exported.level.pickups)
})

test('wall text edits, wraps, duplicates, resizes, and survives save, reopen and playtest', async ({ page }, info) => {
  await open(page)
  await page.getByRole('button', { name: 'Wall text', exact: true }).click()
  await dragWorld(page, { x: 320, y: 700 }, { x: 720, y: 820 })
  await expect(page.getByRole('combobox', { name: 'Selected object' })).toHaveAttribute('data-value', 'text:0')
  const content = page.getByRole('textbox', { name: 'Wall text content' })
  await content.fill('Hold to charge.')
  await content.press('End'); await content.press('Enter'); await content.pressSequentially('Release to jump.')
  await page.getByRole('spinbutton', { name: 'Text font size' }).fill('32'); await page.getByRole('spinbutton', { name: 'Text font size' }).press('Enter')
  await selectBuilderOption(page, 'Text alignment', 'center')
  await page.getByRole('button', { name: 'Duplicate', exact: true }).click()
  await page.getByRole('spinbutton', { name: 'Object x', exact: true }).fill('800'); await page.getByRole('spinbutton', { name: 'Object x', exact: true }).press('Enter')
  await page.getByRole('spinbutton', { name: 'Object w', exact: true }).fill('200'); await page.getByRole('spinbutton', { name: 'Object w', exact: true }).press('Enter')
  await page.getByRole('spinbutton', { name: 'Object h', exact: true }).fill('200'); await page.getByRole('spinbutton', { name: 'Object h', exact: true }).press('Enter')
  await page.getByRole('button', { name: 'Delete object' }).click()
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  const exported = await saveTestLevel(page)
  expect(exported.level.texts).toEqual([
    { x: 320, y: 700, w: 400, h: 120, text: 'Hold to charge.\nRelease to jump.', fontSize: 32, align: 'center' },
    { x: 800, y: 700, w: 200, h: 200, text: 'Hold to charge.\nRelease to jump.', fontSize: 32, align: 'center' },
  ])
  await reopenTestLevel(page, exported)
  const editor = page.getByRole('application', { name: 'Level canvas' })
  const readings = await editor.evaluate(canvas => canvas.wallTexts.map(t => t.text))
  expect(readings.slice(0, 2)).toEqual(['Hold to charge.', 'Release to jump.'])
  expect(readings.slice(2)).toEqual(['Hold to', 'charge.', 'Release to', 'jump.'])
  expect((await saveTestLevel(page)).level.texts).toEqual(exported.level.texts)
  await page.screenshot({ path: info.outputPath('wall-text-builder.png') })
  await saveTestLevel(page, 'Save and Test'); await page.clock.runFor(64)
  const game = page.getByRole('img', { name: 'Untitled level: reach the exit' })
  expect(await game.evaluate(canvas => canvas.wallTexts.map(t => t.text))).toEqual(readings)
  await page.screenshot({ path: info.outputPath('wall-text-play.png') })
})

test('wall text styles and rotation preserve selection, rotated resizing, save and play', async ({ page }, info) => {
  await open(page, blankTrial())
  await page.getByRole('button', { name: 'Wall text', exact: true }).click()
  await dragWorld(page, { x: 320, y: 600 }, { x: 720, y: 720 })
  const selected = page.getByRole('combobox', { name: 'Selected object' })
  const style = page.getByRole('combobox', { name: 'Text style', exact: true })
  const rotation = page.getByRole('spinbutton', { name: 'Text rotation', exact: true })
  const editor = page.getByRole('application', { name: 'Level canvas' })
  await page.getByRole('textbox', { name: 'Wall text content' }).fill('KEEP GOING!')
  await page.getByRole('spinbutton', { name: 'Text font size' }).fill('48')
  await page.getByRole('spinbutton', { name: 'Text font size' }).press('Enter')
  await selectBuilderOption(page, 'Text style', 'graffiti')
  await rotation.fill('-90'); await rotation.press('Enter')
  await page.evaluate(() => document.fonts.load('48px "UJG Graffiti"'))
  await page.clock.runFor(64)
  expect(await page.evaluate(() => [...document.fonts].some(f => f.family.replaceAll('"', '') === 'UJG Graffiti' && f.status === 'loaded'))).toBe(true)
  // The visible left edge now lies outside the original unrotated box.
  await selectBuilderObject(page, 'spawn:0')
  await dragWorld(page, { x: 480, y: 830 }, { x: 480, y: 830 })
  await expect(selected).toHaveAttribute('data-value', 'text:0')
  // Bottom-right corner rotates to the upper right; dragging it up widens the text.
  const zoom = await editor.evaluate(c => c.jumpCamera.a / devicePixelRatio)
  await dragWorld(page, { x: 580 + 8 / zoom, y: 460 - 8 / zoom }, { x: 580 + 8 / zoom, y: 420 - 8 / zoom })
  await expect(page.getByRole('spinbutton', { name: 'Object w', exact: true })).toHaveValue('440')
  await rotation.fill('-12'); await rotation.press('Enter')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await selectBuilderObject(page, 'text:0'); await expect(rotation).toHaveValue('-90')
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await selectBuilderObject(page, 'text:0'); await expect(rotation).toHaveValue('-12')
  await page.getByRole('button', { name: 'Duplicate', exact: true }).click()
  await selectBuilderOption(page, 'Text style', 'official')
  await rotation.fill('8'); await rotation.press('Enter')
  await page.getByRole('spinbutton', { name: 'Object y', exact: true }).fill('600')
  await page.getByRole('spinbutton', { name: 'Object y', exact: true }).press('Enter')
  await page.getByRole('textbox', { name: 'Wall text content' }).fill('AUTHORIZED ROUTE')
  const saved = await saveTestLevel(page)
  expect(saved.level.texts.map(t => [t.style, t.rotation])).toEqual([['graffiti', -12], ['official', 8]])
  await reopenTestLevel(page, saved); await page.clock.runFor(64)
  const text = await editor.evaluate(c => c.wallTexts)
  expect(text.some(t => t.text === 'KEEP GOING!' && t.color === '#94433f' && t.font.includes('UJG Graffiti') && Math.abs(t.rotation + 12) < .001)).toBe(true)
  expect(text.some(t => t.color === '#718074' && Math.abs(t.rotation - 8) < .001)).toBe(true)
  await selectBuilderObject(page, 'text:0')
  await page.screenshot({ path: info.outputPath('wall-text-styles-builder.png') })
  await saveTestLevel(page, 'Save and Test'); await page.clock.runFor(64)
  const game = page.getByRole('img', { name: 'Untitled level: reach the exit' })
  const rendered = await game.evaluate(c => c.wallTexts.map(({ text, color, font, rotation }) => ({ text, color, font, rotation })))
  expect(rendered.map(({ text, color, font }) => ({ text, color, font }))).toEqual(text.map(({ text, color, font }) => ({ text, color, font })))
  rendered.forEach((line, i) => expect(line.rotation).toBeCloseTo(text[i].rotation, 6))
  await page.screenshot({ path: info.outputPath('wall-text-styles-play.png') })
})

test('wall timers can be placed, duplicated, edited, deleted, undone, saved and reopened', async ({ page }, info) => {
  await open(page)
  await page.getByRole('button', { name: 'Wall timer', exact: true }).click()
  await dragWorld(page, { x: 320, y: 780 }, { x: 320, y: 780 })
  await expect(page.getByRole('combobox', { name: 'Selected object' })).toHaveAttribute('data-value', 'timer:0')
  await page.getByRole('button', { name: 'Duplicate', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Selected object' })).toHaveAttribute('data-value', 'timer:1')
  await page.getByRole('spinbutton', { name: 'Object x', exact: true }).fill('640'); await page.getByRole('spinbutton', { name: 'Object x', exact: true }).press('Enter')
  await page.getByRole('spinbutton', { name: 'Object y', exact: true }).fill('240'); await page.getByRole('spinbutton', { name: 'Object y', exact: true }).press('Enter')
  await page.getByRole('button', { name: 'Delete object' }).click()
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  const exported = await saveTestLevel(page)
  expect(exported.level.timers).toEqual([{ x: 320, y: 780 }, { x: 640, y: 680 }])
  await reopenTestLevel(page, exported)
  const roundtrip = await saveTestLevel(page)
  expect(roundtrip.level.timers).toEqual(exported.level.timers)
  await page.screenshot({ path: info.outputPath('wall-timers-in-builder.png') })
})

test('wall timers share the run clock, travel with the map, and allow the player to pass through', async ({ page }, info) => {
  const level = blankTrial(); level.width = 3200; level.spawn.x = 800; level.goal.x = 2800
  level.timers = [{ x: 920, y: 860 }, { x: 1180, y: 740 }]
  await open(page, level)
  await saveTestLevel(page, 'Save and Test'); await page.clock.runFor(64)
  const canvas = page.getByRole('img', { name: 'Untitled level: reach the exit' })
  const readings = () => canvas.evaluate(el => el.wallTimers)
  const initial = await readings()
  expect(initial).toHaveLength(2); expect(initial[0].face).toBe(initial[1].face)
  await expect(page.locator('.jumping-race')).toHaveCount(0)
  await page.keyboard.down('d'); await page.clock.runFor(1100); await page.keyboard.up('d')
  const moving = await readings()
  expect(moving).toHaveLength(2); expect(moving[0].face).toBe(moving[1].face); expect(moving[0].face).not.toBe(initial[0].face)
  expect(moving[0].x).toBe(initial[0].x); expect(moving[0].screenX).toBeLessThan(initial[0].screenX - 80)
  expect((await page.evaluate(() => window.jumpPlayer)).x).toBeGreaterThan(1120)
  await page.screenshot({ path: info.outputPath('wall-timers-during-play.png') })
  await page.keyboard.press('Escape'); await page.clock.runFor(2000)
  expect((await readings()).map(timer => timer.face)).toEqual(moving.map(timer => timer.face))
  await page.getByRole('button', { name: 'Restart level', exact: true }).click(); await page.clock.runFor(160)
  expect((await readings()).map(timer => timer.face)).toEqual(initial.map(timer => timer.face))
})

test('build, edit, undo, save, playtest, return and reload a custom level', async ({ page }, info) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await open(page)
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: 'New level', exact: true }).click()
  await page.getByRole('textbox', { name: 'Level name' }).fill('Slope workshop')
  await page.getByRole('button', { name: 'Terrain', exact: true }).click()
  await dragWorld(page, { x: 360, y: 800 }, { x: 660, y: 920 })
  await dragWorld(page, { x: 360, y: 920 }, { x: 380, y: 920 })
  await dragWorld(page, { x: 360, y: 800 }, { x: 360, y: 920 })
  await expect(page.getByRole('spinbutton', { name: 'Object w', exact: true })).toHaveValue('300')
  await expect(page.getByRole('spinbutton', { name: 'Object h', exact: true })).toHaveValue('120')
  await page.getByRole('spinbutton', { name: 'Object w', exact: true }).fill('400'); await page.getByRole('spinbutton', { name: 'Object w', exact: true }).press('Enter')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await selectBuilderObject(page, 'platform:0')
  await expect(page.getByRole('spinbutton', { name: 'Object w', exact: true })).toHaveValue('300')
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await selectBuilderObject(page, 'platform:0')
  await expect(page.getByRole('spinbutton', { name: 'Object w', exact: true })).toHaveValue('400')
  const saved = await saveTestLevel(page, 'Save level')
  await expect(page.getByRole('status', { name: 'Builder status' })).toContainText('Saved “Slope workshop.jump-level.json”')
  await page.clock.runFor(600)
  await page.screenshot({ path: info.outputPath('level-builder.png') })
  const tested = await saveTestLevel(page, 'Save and Test')
  expect(tested.level).toEqual(saved.level)
  await page.clock.runFor(100)
  await expect(page.locator('canvas[aria-label="Slope workshop: reach the exit"]')).toBeFocused()
  await page.keyboard.down('d'); await page.clock.runFor(1100); await page.keyboard.up('d'); await page.clock.runFor(100)
  const p = await page.evaluate(() => window.jumpPlayer)
  expect(p.x).toBeGreaterThan(450); expect(p.y).toBeLessThan(900)
  await page.screenshot({ path: info.outputPath('custom-level-playtest.png') })
  await page.getByRole('button', { name: 'Return to builder' }).click()
  await page.getByRole('tab', { name: 'Level', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Level name' })).toHaveValue('Slope workshop')
  await page.getByRole('tab', { name: 'Object', exact: true }).click()
  await expect(page.getByRole('spinbutton', { name: 'Object w', exact: true })).toHaveValue('400')
  // Let React's lazy-route scheduling run normally across the reload.
  await page.clock.resume(); await page.reload()
  await expect(page).toHaveURL(/\/builder\/local\//)
  await reopenTestLevel(page, saved)
  await expect(page.getByRole('textbox', { name: 'Level name' })).toHaveValue('Slope workshop')
  expect(saved.level.platforms).toHaveLength(1)
  expect(errors).toEqual([])
})

test('terrain nodes and all four resize handles edit independently, with undo and folder saves', async ({ page }, info) => {
  const level = { ...blankTrial(), width: 1000, height: 600, floor: 600, spawn: { x: 100, y: 600 }, goal: { x: 800, y: 600 } }
  await open(page, level)
  await expect(page.getByRole('button', { name: /^(Polygon|Rectangle)$/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Terrain', exact: true }).click()
  await dragWorld(page, { x: 300, y: 200 }, { x: 500, y: 320 })
  await page.getByRole('button', { name: 'Add node', exact: true }).click()
  await dragWorld(page, { x: 400, y: 200 }, { x: 400, y: 160 })
  await page.getByRole('button', { name: 'Pointer', exact: true }).click()
  let bounds = { x: 300, y: 160, w: 200, h: 160 }
  for (const [corner, dx, dy] of [['top-left', -40, -20], ['top-right', 40, -20], ['bottom-left', -20, 40], ['bottom-right', 20, 20]]) {
    const left = corner.endsWith('left'), top = corner.startsWith('top')
    if (corner === 'bottom-left') await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
    const zoom = await page.getByRole('application', { name: 'Level canvas' }).evaluate(c => c.jumpCamera.a / devicePixelRatio)
    const start = { x: bounds.x + (left ? -16 / zoom : bounds.w + 16 / zoom), y: bounds.y + (top ? -16 / zoom : bounds.h + 16 / zoom) }
    await dragWorld(page, start, { x: start.x + dx, y: start.y + dy })
    bounds = { x: bounds.x + (left ? dx : 0), y: bounds.y + (top ? dy : 0), w: bounds.w + (left ? -dx : dx), h: bounds.h + (top ? -dy : dy) }
    for (const axis of ['x', 'y', 'w', 'h']) await expect(page.getByRole('spinbutton', { name: `Object ${axis}`, exact: true })).toHaveValue(String(axis === 'y' ? 600 - bounds.y : bounds[axis]))
  }
  const resized = (await saveTestLevel(page)).level.platforms[0]
  expect(resized).toMatchObject({ x: 240, y: 120, w: 320, h: 260 })
  expect(resized.polygon.map(([x, y]) => [x / resized.w, y / resized.h])).toEqual([[0, .25], [.5, 0], [1, .25], [1, 1], [0, 1]])
  await page.screenshot({ path: info.outputPath('terrain-four-corner-handles.png') })
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await selectBuilderObject(page, 'platform:0')
  await expect(page.getByRole('spinbutton', { name: 'Object w', exact: true })).toHaveValue('300')
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await selectBuilderObject(page, 'platform:0')
  await dragWorld(page, { x: 240, y: 185 }, { x: 260, y: 200 })
  const saved = await saveTestLevel(page), shaped = saved.level.platforms[0]
  expect(shaped).toMatchObject({ x: 240, y: 120, w: 320, h: 260 })
  expect(shaped.polygon[0]).toEqual([20, 80])
  expect(shaped.polygon.slice(1)).toEqual(resized.polygon.slice(1))
  await reopenTestLevel(page, saved)
  expect((await saveTestLevel(page)).level.platforms[0]).toEqual(shaped)
  await selectBuilderObject(page, 'platform:0')
  await page.getByRole('button', { name: 'Delete object' }).click()
  await page.getByRole('combobox', { name: 'Selected object' }).click()
  await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(3)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await page.getByRole('combobox', { name: 'Selected object' }).click()
  await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(4)
  await page.keyboard.press('Escape')
})

test('selected nodes delete with the button or keyboard, preserve the terrain, and support undo', async ({ page }) => {
  const level = { ...blankTrial(), width: 1000, height: 600, floor: 600, spawn: { x: 100, y: 600 }, goal: { x: 800, y: 600 },
    platforms: [{ x: 300, y: 200, w: 200, h: 120, polygon: [[0,0],[100,0],[200,0],[200,120],[0,120]] }] }
  await open(page, level)
  const selected = page.getByRole('combobox', { name: 'Selected object' }), remove = page.getByRole('button', { name: 'Delete node', exact: true })
  await selectBuilderObject(page, 'platform:0'); await expect(remove).toBeDisabled()
  await dragWorld(page, { x: 400, y: 200 }, { x: 400, y: 200 })
  await expect(remove).toBeEnabled(); await remove.click()
  expect((await saveTestLevel(page)).level.platforms[0].polygon).toEqual([[0,0],[200,0],[200,120],[0,120]])
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  expect((await saveTestLevel(page)).level.platforms).toEqual(level.platforms)
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await selectBuilderObject(page, 'platform:0')
  await dragWorld(page, { x: 500, y: 200 }, { x: 500, y: 200 })
  await page.keyboard.press('Delete')
  await expect(remove).toBeDisabled()
  await page.keyboard.press('Backspace')
  await expect(page.getByRole('status', { name: 'Builder status' })).toContainText('at least three nodes')
  const saved = await saveTestLevel(page)
  expect(saved.level.platforms).toHaveLength(1); expect(saved.level.platforms[0].polygon).toHaveLength(3)
})

test('zoom buttons and wheel zoom center the selected object including an elevator travel span', async ({ page }) => {
  const level = { ...blankTrial(), platforms: [{ x: 1100, y: 300, w: 200, h: 100 }],
    mechanisms: [{ id: 'lift', kind: 'lift', x: 500, y: 900, w: 180, h: 20, travel: 400 }] }
  await open(page, level)
  const canvas = page.getByRole('application', { name: 'Level canvas' }), selected = page.getByRole('combobox', { name: 'Selected object' })
  const centered = async (x, y) => {
    const offset = await canvas.evaluate((c, point) => {
      const t = c.jumpCamera
      return [(point.x * t.a + t.e) / devicePixelRatio - c.clientWidth / 2, (point.y * t.d + t.f) / devicePixelRatio - c.clientHeight / 2]
    }, { x, y })
    expect(Math.abs(offset[0])).toBeLessThan(1); expect(Math.abs(offset[1])).toBeLessThan(1)
  }
  await selectBuilderObject(page, 'platform:0')
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click(); await centered(1200, 350)
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click(); await centered(1200, 350)
  const box = await canvas.boundingBox()
  await page.mouse.move(box.x + 40, box.y + 40)
  const scale = () => canvas.evaluate(c => c.jumpCamera.a)
  const beforeWheel = await scale()
  await page.mouse.wheel(0, -100); await page.clock.runFor(32)
  expect(await scale()).toBeGreaterThan(beforeWheel)
  await centered(1200, 350)
  await selectBuilderObject(page, '')
  const pointAtCursor = () => canvas.evaluate(c => {
    const t = c.jumpCamera
    return { x: (40 * devicePixelRatio - t.e) / t.a, y: (40 * devicePixelRatio - t.f) / t.d }
  })
  const anchor = await pointAtCursor()
  await page.mouse.move(box.x + 40, box.y + 40)
  await page.mouse.wheel(0, 100); await page.clock.runFor(32)
  expect(await scale()).toBeCloseTo(beforeWheel)
  const after = await pointAtCursor()
  expect(after.x).toBeCloseTo(anchor.x); expect(after.y).toBeCloseTo(anchor.y)
  expect(await canvas.evaluate(c => !c.dispatchEvent(new WheelEvent('wheel', { deltaY: 0, cancelable: true })))).toBe(true)
  await selectBuilderObject(page, 'mechanism:0')
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click(); await centered(590, 710)
})

test('dragging empty space pans by default without moving or creating objects', async ({ page }) => {
  const level = { ...blankTrial(), width: 1000, height: 600, floor: 600, spawn: { x: 100, y: 600 }, goal: { x: 800, y: 600 },
    platforms: [{ x: 300, y: 300, w: 200, h: 120 }] }
  await open(page, level)
  const selected = page.getByRole('combobox', { name: 'Selected object' }), canvas = page.getByRole('application', { name: 'Level canvas' })
  await selectBuilderObject(page, 'platform:0')
  const beforeLevel = (await saveTestLevel(page)).level
  const camera = () => canvas.evaluate(c => ({ a: c.jumpCamera.a, e: c.jumpCamera.e, f: c.jumpCamera.f }))
  const before = await camera()
  await dragWorld(page, { x: 120, y: 140 }, { x: 200, y: 200 })
  const after = await camera()
  expect(after.a).toBe(before.a)
  expect(after.e - before.e).toBeCloseTo(80 * before.a, 1)
  expect(after.f - before.f).toBeCloseTo(60 * before.a, 1)
  await expect(selected).toHaveAttribute('data-value', '')
  await expect(page.getByRole('button', { name: 'Select', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Pan', exact: true })).toHaveCount(0)
  const terrainTool = page.getByRole('button', { name: 'Terrain', exact: true })
  await terrainTool.click(); await terrainTool.click()
  await expect(terrainTool).toHaveAttribute('aria-pressed', 'false')
  await dragWorld(page, { x: 400, y: 350 }, { x: 400, y: 350 })
  await expect(selected).toHaveAttribute('data-value', 'platform:0')
  expect((await saveTestLevel(page)).level).toEqual(beforeLevel)
})

test('folder saves reopen successfully and invalid files leave the current draft intact', async ({ page }) => {
  await open(page)
  await page.getByRole('textbox', { name: 'Level name' }).fill('Saved route')
  const saved = await saveTestLevel(page)
  expect(saved.fileName).toBe('Saved route.jump-level.json')
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: 'New level', exact: true }).click()
  await reopenTestLevel(page, saved)
  await expect(page.getByRole('textbox', { name: 'Level name' })).toHaveValue('Saved route')
  await page.evaluate(async () => {
    const writer = await (await (await window.testLevelDirectory()).getFileHandle('broken.json', { create: true })).createWritable()
    await writer.write('{"version":1,"platforms":[]}'); await writer.close()
  })
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: 'Refresh folder', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('broken.json')
  await expect(page.getByRole('button', { name: 'Open broken.json', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Close library', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Level name' })).toHaveValue('Saved route')
})

test('the Node tool grabs existing nodes across shapes without inserting points or leaving the tool', async ({ page }, info) => {
  const level = { ...blankTrial(), width: 1000, height: 600, floor: 600, spawn: { x: 100, y: 600 }, goal: { x: 900, y: 600 },
    platforms: [{ x: 300, y: 200, w: 200, h: 120 }, { x: 650, y: 140, w: 200, h: 180, polygon: [[0, 80], [200, 0], [200, 180], [0, 180]] }] }
  await open(page, level)
  const canvas = page.getByRole('application', { name: 'Level canvas' }), nodeTool = page.getByRole('button', { name: 'Node', exact: true })
  const vertices = shape => shape.polygon.map(([x, y]) => [shape.x + x, shape.y + y])
  const screenPoint = async p => {
    const box = await canvas.boundingBox()
    const camera = await canvas.evaluate(c => ({ a: c.jumpCamera.a, e: c.jumpCamera.e, f: c.jumpCamera.f, ratio: devicePixelRatio }))
    return { x: box.x + (p.x * camera.a + camera.e) / camera.ratio, y: box.y + (p.y * camera.a + camera.f) / camera.ratio }
  }
  await nodeTool.click()
  await page.getByRole('tab', { name: 'Object', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Selected object' })).toHaveAttribute('data-value', '')
  const corner = await screenPoint({ x: 300, y: 200 })
  // A nearby existing corner wins over inserting another point on its edge.
  await page.mouse.move(corner.x + 5, corner.y)
  await expect(canvas).toHaveCSS('cursor', 'grab')
  await page.screenshot({ path: info.outputPath('existing-node-hover.png') })
  await page.mouse.down(); await expect(canvas).toHaveCSS('cursor', 'grabbing')
  const end = await screenPoint({ x: 360, y: 160 })
  await page.mouse.move(end.x + 5, end.y, { steps: 8 }); await page.mouse.up()
  await expect(nodeTool).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('combobox', { name: 'Selected object' })).toHaveAttribute('data-value', 'platform:0')
  const moved = (await saveTestLevel(page)).level
  expect(vertices(moved.platforms[0])).toEqual([[360, 160], [500, 200], [500, 320], [300, 320]])
  expect(moved.platforms[1]).toEqual(level.platforms[1])
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  expect((await saveTestLevel(page)).level.platforms).toEqual(level.platforms)
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  expect((await saveTestLevel(page)).level.platforms).toEqual(moved.platforms)
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click()
  const other = await screenPoint({ x: 850, y: 140 })
  await page.mouse.move(other.x, other.y)
  await expect(canvas).toHaveCSS('cursor', 'grab')
  await page.keyboard.down('Alt')
  await dragWorld(page, { x: 850, y: 140 }, { x: 883, y: 123 })
  await page.keyboard.up('Alt')
  await expect(nodeTool).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('combobox', { name: 'Selected object' })).toHaveAttribute('data-value', 'platform:1')
  const saved = await saveTestLevel(page)
  expect(saved.level.platforms[0]).toEqual(moved.platforms[0])
  const points = vertices(saved.level.platforms[1])
  expect(points).toHaveLength(4)
  expect(points[1][0]).toBeCloseTo(883); expect(points[1][1]).toBeCloseTo(123)
  expect([points[0], ...points.slice(2)]).toEqual([[650, 220], [850, 320], [650, 320]])
  await reopenTestLevel(page, saved)
  expect((await saveTestLevel(page)).level.platforms).toEqual(saved.level.platforms)
})

test('the Node tool stays active for insertion and shaping with Keep placing off', async ({ page }, info) => {
  const level = { ...blankTrial(), width: 1000, height: 600, floor: 600, spawn: { x: 100, y: 600 }, goal: { x: 900, y: 600 },
    platforms: [{ x: 300, y: 200, w: 300, h: 200 }, { x: 650, y: 140, w: 200, h: 180, polygon: [[0, 80], [200, 0], [200, 180], [0, 180]] }] }
  await open(page, level)
  const canvas = page.getByRole('application', { name: 'Level canvas' }), nodeTool = page.getByRole('button', { name: 'Node', exact: true })
  await nodeTool.click()
  await expect(page.getByRole('button', { name: 'Add at view center', exact: true })).toHaveCount(0)
  await dragWorld(page, { x: 100, y: 200 }, { x: 100, y: 200 })
  await expect(page.getByRole('status', { name: 'Builder status' })).toContainText('Click a terrain edge')
  await expect(nodeTool).toHaveAttribute('aria-pressed', 'true')
  await dragWorld(page, { x: 421, y: 403 }, { x: 421, y: 403 })
  const inserted = (await saveTestLevel(page)).level
  expect(inserted.platforms[0].polygon).toEqual([[0, 0], [300, 0], [300, 200], [120, 200], [0, 200]])
  await expect(nodeTool).toHaveAttribute('aria-pressed', 'true')
  await nodeTool.click()
  await expect(nodeTool).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  expect((await saveTestLevel(page)).level.platforms[0].polygon).toBeUndefined()
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await selectBuilderObject(page, 'platform:0')
  await page.getByRole('button', { name: 'Add node', exact: true }).click()
  await dragWorld(page, { x: 300, y: 300 }, { x: 260, y: 300 })
  const shaped = (await saveTestLevel(page)).level.platforms[0]
  expect(shaped.x).toBe(260); expect(shaped.polygon.at(-1)).toEqual([0, 100])
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  expect((await saveTestLevel(page)).level.platforms[0]).toEqual(inserted.platforms[0])
  await expect(page.getByRole('checkbox', { name: 'Keep placing' })).not.toBeChecked()
  await expect(nodeTool).toHaveAttribute('aria-pressed', 'true')
  const box = await canvas.boundingBox(), camera = await canvas.evaluate(c => ({ a: c.jumpCamera.a, e: c.jumpCamera.e, f: c.jumpCamera.f, ratio: devicePixelRatio }))
  await page.mouse.move(box.x + (733 * camera.a + camera.e) / camera.ratio, box.y + (186.8 * camera.a + camera.f) / camera.ratio)
  await page.screenshot({ path: info.outputPath('node-edge-preview.png') })
  await dragWorld(page, { x: 733, y: 186.8 }, { x: 733, y: 186.8 })
  expect((await saveTestLevel(page)).level.platforms[1].polygon).toEqual([[0, 80], [90, 44], [200, 0], [200, 180], [0, 180]])
  await expect(nodeTool).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('checkbox', { name: 'Snap' }).uncheck()
  await selectBuilderObject(page, 'platform:0')
  await expect(nodeTool).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await dragWorld(page, { x: 347, y: 200 }, { x: 347, y: 200 })
  const saved = await saveTestLevel(page)
  expect(saved.level.platforms[0].polygon[1][0]).toBeCloseTo(47, 1)
  expect(saved.level.platforms[0].polygon[1][1]).toBe(0)
  await canvas.focus(); await page.keyboard.press('Escape')
  await expect(nodeTool).toHaveAttribute('aria-pressed', 'false')
  await reopenTestLevel(page, saved)
  expect((await saveTestLevel(page)).level.platforms).toEqual(saved.level.platforms)
})

test('Keep placing repeats object placement while Pointer and Node remain independent editing tools', async ({ page }) => {
  await open(page)
  const toolbar = page.getByRole('group', { name: 'Canvas controls', exact: true })
  const pointer = toolbar.getByRole('button', { name: 'Pointer', exact: true })
  const node = toolbar.getByRole('button', { name: 'Node', exact: true })
  const keepPlacing = toolbar.getByRole('checkbox', { name: 'Keep placing', exact: true })
  const box = page.getByRole('button', { name: 'Box', exact: true })
  await expect(pointer).toHaveAttribute('aria-pressed', 'true')
  await expect(keepPlacing).not.toBeChecked()
  await box.click()
  await dragWorld(page, { x: 300, y: 880 }, { x: 300, y: 880 })
  await expect(pointer).toHaveAttribute('aria-pressed', 'true')
  await keepPlacing.check()
  await box.click()
  for (const x of [440, 600]) {
    await dragWorld(page, { x, y: 880 }, { x, y: 880 })
    await expect(box).toHaveAttribute('aria-pressed', 'true')
  }
  await keepPlacing.uncheck()
  await dragWorld(page, { x: 760, y: 880 }, { x: 760, y: 880 })
  await expect(pointer).toHaveAttribute('aria-pressed', 'true')
  const saved = await saveTestLevel(page)
  expect(saved.level.props.map(prop => prop.x)).toEqual([300, 440, 600, 760])
  // Native keyboard activation switches editing tools without starting a canvas pan.
  await node.focus(); await page.keyboard.press('Space')
  await expect(node).toHaveAttribute('aria-pressed', 'true')
  await pointer.focus(); await page.keyboard.press('Space')
  await expect(pointer).toHaveAttribute('aria-pressed', 'true')
  await expect(node).toHaveAttribute('aria-pressed', 'false')
  await expect(keepPlacing).not.toBeChecked()
})

test('saving a level to a file works when browser storage is unavailable', async ({ page }) => {
  await page.addInitScript(() => { Storage.prototype.setItem = Storage.prototype.getItem = () => { throw new Error('Storage unavailable') } })
  await open(page)
  const saved = await saveTestLevel(page, 'Save level')
  expect(saved.level.name).toBe('Untitled level')
  await expect(page.getByRole('status', { name: 'Builder status' })).toContainText('Saved')
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Saved levels' })).toHaveCount(0)
})

test('inspector level settings expose independent level and file names, and save the chosen filename', async ({ page }) => {
  await open(page)
  const settings = page.locator('.builder-inspector .builder-level-settings')
  const title = settings.getByRole('textbox', { name: 'Level name', exact: true })
  const fileName = settings.getByRole('textbox', { name: 'Level file name', exact: true })
  await title.fill('First route')
  await expect(fileName).toHaveValue('First route.jump-level.json')
  // Explicitly choosing even the suggested filename makes it independent.
  await fileName.fill('')
  await fileName.fill('First route.jump-level.json')
  await title.fill('Tower climb')
  await expect(fileName).toHaveValue('First route.jump-level.json')
  await fileName.fill('00-tower.json')
  await selectBuilderObject(page, 'spawn:0')
  await expect(title).toBeHidden()
  await page.getByRole('tab', { name: 'Level', exact: true }).click()
  for (const field of [title, fileName]) { await field.scrollIntoViewIfNeeded(); await expect(field).toBeInViewport() }
  const saved = await saveTestLevel(page)
  expect(saved.fileName).toBe('00-tower.json')
  expect(saved.level.name).toBe('Tower climb')
})

test('builder controls and drawing area remain usable on a narrow screen', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 }); await open(page)
  await expect(page.getByRole('button', { name: 'Save and Test' })).toBeInViewport()
  for (const name of ['Level name', 'Level file name']) {
    const field = page.getByRole('textbox', { name, exact: true })
    await field.scrollIntoViewIfNeeded(); await expect(field).toBeInViewport()
  }
  const box = await page.getByRole('application', { name: 'Level canvas' }).boundingBox()
  expect(box.width).toBeGreaterThan(200); expect(box.height).toBeGreaterThan(130)
  expect(await page.locator('.jumping-builder').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath('level-builder-mobile.png') })
  for (const viewport of [{ width: 844, height: 390 }, { width: 1101, height: 800 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport)
    await expect(page.getByRole('button', { name: 'Save and Test' })).toBeInViewport()
    const fileName = page.getByRole('textbox', { name: 'Level file name', exact: true })
    await fileName.scrollIntoViewIfNeeded(); await expect(fileName).toBeInViewport()
    expect(await page.locator('.jumping-builder').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  }
  await page.screenshot({ path: info.outputPath('level-builder-names.png') })
})

test('author terrain, a free ladder and an anchored rope with portable JSON files', async ({ page }, info) => {
  await open(page)
  await page.getByRole('textbox', { name: 'Level name' }).fill('My rope course')
  await page.getByRole('button', {name:'Terrain', exact:true}).click()
  await dragWorld(page,{x:800,y:400},{x:1100,y:460})
  await page.getByRole('button', {name:'Rope', exact:true}).click()
  await dragWorld(page,{x:1100,y:460},{x:1100,y:800})
  await expect(page.getByRole('button', {name:'Detach anchor', exact:true})).toBeVisible()
  await page.getByRole('button', {name:'Ladder', exact:true}).click()
  await dragWorld(page,{x:600,y:400},{x:600,y:800})
  await expect(page.getByRole('spinbutton', {name:'Object x', exact:true})).toHaveValue('600')
  await page.getByRole('spinbutton', {name:'Object x', exact:true}).fill('640'); await page.getByRole('spinbutton', {name:'Object x', exact:true}).press('Enter')
  await page.getByRole('button', {name:'Save level', exact:true}).click()
  const file = await saveTestLevel(page), exported = file.level
  expect(exported.platforms).toHaveLength(1); expect(exported.platforms[0].h).toBe(60)
  expect(exported.climbables.ropes[0].anchor.platform).toBe(0)
  expect(exported.climbables.ladders[0].platform).toBe(-1); expect(exported.climbables.ladders[0].x).toBe(640)
  await page.screenshot({ path: info.outputPath('simple-level-elements.png') })
  await saveTestLevel(page, 'Save and Test'); await page.clock.runFor(100)
  await expect(page.getByRole('img', { name: 'My rope course: reach the exit' })).toBeFocused()
  await page.getByRole('button', {name:'Return to builder'}).click()
  await reopenTestLevel(page, file)
  const saved = (await saveTestLevel(page, 'Save level')).level
  expect(saved.platforms).toEqual(exported.platforms); expect(saved.climbables).toEqual(exported.climbables)
})

test('rope layout is resolved in the editor, saved, and reused unchanged on playtest and reload', async ({ page }, info) => {
  const level = { version: 1, id: 'rope-layout', name: 'Rope layout', width: 1200, height: 1000, floor: 1000,
    spawn: { x: 120, y: 1000 }, goal: { x: 1000, y: 1000 }, checkpoints: [],
    platforms: [{ x: 300, y: 300, w: 200, h: 300 }], climbables: { ladders: [], ropes: [{ x: 400, y: 200, length: 500, segments: 24 }] },
    props: [], robots: [], mechanisms: [], triggers: [], times: { gold: 10, silver: 20, bronze: 40 } }
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype, begin = proto.beginPath, move = proto.moveTo, line = proto.lineTo, stroke = proto.stroke
    proto.beginPath = function () { this.recordedPath = []; return begin.call(this) }
    proto.moveTo = function (x, y) { this.recordedPath?.push([x, y]); return move.call(this, x, y) }
    proto.lineTo = function (x, y) { this.recordedPath?.push([x, y]); return line.call(this, x, y) }
    proto.stroke = function (...args) {
      if (this.strokeStyle === '#998263' && Math.abs(this.lineWidth - 2.8) < .001) this.canvas.ropePath = this.recordedPath.slice(1)
      return stroke.apply(this, args)
    }
  })
  await open(page, level)
  const editor = page.getByRole('application', { name: 'Level canvas' })
  const preview = await editor.evaluate(canvas => canvas.ropePath)
  expect(preview.length).toBeGreaterThanOrEqual(Math.ceil(500 / 8) + 1)
  expect(Math.abs(preview.at(-1)[0] - 400)).toBeGreaterThan(50)
  const file = await saveTestLevel(page, 'Save level'), saved = file.level
  const { points, bends } = saved.climbables.ropes[0].rest
  expect(points.flatMap((p, i) => i && bends[i - 1] ? [bends[i - 1], p] : [p])).toEqual(preview)
  await page.screenshot({ path: info.outputPath('rope-resolved-in-editor.png') })
  await saveTestLevel(page, 'Save and Test'); await page.clock.runFor(100)
  const game = page.getByRole('img', { name: 'Rope layout: reach the exit' })
  expect(await game.evaluate(canvas => canvas.ropePath)).toEqual(preview)
  await page.keyboard.down('ArrowLeft'); await page.clock.runFor(32); await page.keyboard.up('ArrowLeft'); await page.clock.runFor(2000)
  const running = await game.evaluate(canvas => canvas.ropePath)
  expect(Math.max(...running.map((p, i) => Math.hypot(p[0] - preview[i][0], p[1] - preview[i][1])))).toBeLessThan(1)
  await restartFromPause(page); await page.clock.runFor(32)
  expect(await game.evaluate(canvas => canvas.ropePath)).toEqual(preview)
  await page.getByRole('button', { name: 'Return to builder' }).click()
  await selectBuilderObject(page, 'platform:0')
  await page.getByRole('spinbutton', { name: 'Object x', exact: true }).fill('600'); await page.getByRole('spinbutton', { name: 'Object x', exact: true }).press('Enter')
  await page.clock.runFor(600)
  const edited = await editor.evaluate(canvas => canvas.ropePath)
  expect(edited).not.toEqual(preview)
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await page.clock.runFor(600)
  await expect(editor).toHaveAttribute('aria-busy', 'false', { timeout: 15000 })
  expect(await editor.evaluate(canvas => canvas.ropePath)).toEqual(preview)
  await page.clock.resume(); await page.reload()
  await expect(page).toHaveURL(/\/builder\/local\//)
  await reopenTestLevel(page, file)
  await expect(page.getByRole('textbox', { name: 'Level name' })).toHaveValue('Rope layout')
  expect(await editor.evaluate(canvas => canvas.ropePath)).toEqual(preview)
})

for (const controller of [false, true]) test(`${controller ? 'controller' : 'keyboard'} Up pulls up from a ledge and Jump jumps away with neutral direction`, async ({ page }) => {
  const level = { ...blankTrial(), id: 'ledge-jump-input', name: 'Ledge jump input', width: 1000, height: 600, floor: 600,
    spawn: { x: 410, y: 200 }, goal: { x: 620, y: 200 }, platforms: [{ x: 400, y: 200, w: 400, h: 400 }] }
  if (controller) await page.addInitScript(() => {
    window.testPad = { index: 0, id: 'Ledge pad', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }
    Object.defineProperty(navigator, 'getGamepads', { value: () => [window.testPad] })
  })
  await open(page, level); await saveTestLevel(page, 'Save and Test'); await page.clock.runFor(100)
  const hold = async (key, value) => {
    if (controller) await page.evaluate(({ key, value }) => {
      const button = { s: 13, w: 12, Space: 0 }[key]
      window.testPad.buttons[button] = { pressed: value, value: Number(value) }
    }, { key, value })
    else await page.keyboard[value ? 'down' : 'up'](key)
  }
  const lower = async () => {
    await hold('s', true); await page.clock.runFor(1600); await hold('s', false); await page.clock.runFor(64)
    await expect(page.locator('.jumping-state')).toHaveText('Hanging')
  }
  await lower()
  await hold('w', true); await page.clock.runFor(350)
  await expect(page.locator('.jumping-state')).toHaveText('Climbing')
  await hold('w', false); await page.clock.runFor(1300)
  await expect(page.locator('.jumping-state')).toHaveText('Ready')
  await lower()
  const hanging = await page.evaluate(() => window.jumpPlayer)
  await hold('Space', true); await page.clock.runFor(600)
  await expect(page.locator('.jumping-state')).toHaveText('Hanging')
  expect(await page.evaluate(() => window.jumpPlayer)).toEqual(hanging)
  await hold('Space', false); await page.clock.runFor(150)
  await expect(page.locator('.jumping-state')).toHaveText('Rising')
  const airborne = await page.evaluate(() => window.jumpPlayer)
  expect(airborne.x).toBeLessThan(hanging.x - 20)
  expect(airborne.y).toBeLessThan(hanging.y - 20)
})

for (const controller of [false,true]) test(`${controller ? 'controller' : 'keyboard'} Down transfers onto its rope, descends, swings away and drops`, async ({page},info) => {
  const level={version:1,id:'rappel-test',name:'Rappel test',width:1000,height:920,floor:920,spawn:{x:410,y:200},goal:{x:620,y:200},checkpoints:[],platforms:[{x:400,y:200,w:400,h:720}],climbables:{ladders:[],ropes:[{x:398,y:100,length:600,segments:28}]},props:[],robots:[],triggers:[],mechanisms:[],times:{gold:10,silver:20,bronze:40}}
  await page.addInitScript(({controller})=>{
    if(controller){window.testPad={index:0,id:'Rappel pad',connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))};Object.defineProperty(navigator,'getGamepads',{value:()=>[window.testPad]})}
  },{controller})
  await open(page, level);await saveTestLevel(page, 'Save and Test');await page.clock.runFor(100)
  if(controller)await page.evaluate(()=>{window.testPad.axes[1]=1})
  else await page.keyboard.down('s')
  await page.clock.runFor(350);await expect(page.locator('.jumping-state')).toHaveText('Lowering')
  await page.clock.runFor(2200);await expect(page.locator('.jumping-state')).toContainText('descending')
  const a=await page.evaluate(()=>window.jumpPlayer)
  await page.clock.runFor(600);const b=await page.evaluate(()=>window.jumpPlayer)
  expect(b.y).toBeGreaterThan(a.y+40);expect(b.x).toBeLessThan(388)
  await page.screenshot({path:info.outputPath('rappelling-from-ledge.png')})
  if(controller)await page.evaluate(()=>{window.testPad.axes[1]=0})
  else await page.keyboard.up('s')
  await page.clock.runFor(350)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Controls', exact: true }).click()
  await expect(page.getByRole('region', { name: 'How to play' })).toContainText('Hold Jump to charge; release to jump')
  await expect(page.getByRole('region', { name: 'How to play' })).toContainText(controller ? 'B / ○' : 'X')
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await page.getByRole('button', { name: 'Resume', exact: true }).click(); await page.clock.runFor(64)
  const braced = await page.evaluate(() => window.jumpPlayer)
  if(controller)await page.evaluate(()=>{window.testPad.axes[0]=-1})
  else await page.keyboard.down('a')
  await page.clock.runFor(450)
  await expect(page.locator('.jumping-state')).toHaveText('Rope · holding')
  const swung = await page.evaluate(() => window.jumpPlayer)
  expect(swung.x).toBeLessThan(braced.x - 25)
  await page.screenshot({path:info.outputPath('rappel-push-off.png')})
  if(controller)await page.evaluate(()=>{window.testPad.axes[0]=0})
  else await page.keyboard.up('a')
  await page.clock.runFor(2200)
  await expect(page.locator('.jumping-state')).toHaveText('Rope · holding')
  // Wait for the feet to settle against the wall before dropping the rope.
  for (let i = 0; i < 30 && Math.abs((await page.evaluate(() => window.jumpPlayer)).x - 377) > .1; i++) await page.clock.runFor(100)
  const returned = await page.evaluate(() => window.jumpPlayer)
  expect(returned.x).toBeCloseTo(377, 1)
  if(controller)await page.evaluate(()=>{window.testPad.buttons[1]={pressed:true,value:1}})
  else await page.keyboard.down('x')
  await page.clock.runFor(250)
  await expect(page.locator('.jumping-state')).toHaveText('Falling')
  const dropped = await page.evaluate(() => window.jumpPlayer)
  expect(dropped.y).toBeGreaterThan(returned.y + 25)
  expect(dropped.x).toBeCloseTo(returned.x, 0)
  await page.screenshot({path:info.outputPath('rappel-drop.png')})
  await page.clock.runFor(1200)
  await expect(page.locator('.jumping-state')).toHaveText('Ready')
  expect((await page.evaluate(() => window.jumpPlayer)).y).toBeCloseTo(920, 1)
  if(controller)await page.evaluate(()=>{window.testPad.buttons[1]={pressed:false,value:0}})
  else await page.keyboard.up('x')
})

for (const controller of [false, true]) test(`${controller ? 'controller' : 'keyboard'} climbs a grid-snapped free ladder onto its neighboring cliff`, async ({ page }, info) => {
  const level = { version: 1, id: 'ladder-exit-test', name: 'Ladder exit test', width: 1000, height: 600, floor: 600,
    spawn: { x: 420, y: 600 }, goal: { x: 100, y: 200 }, checkpoints: [], platforms: [{ x: 0, y: 200, w: 400, h: 400 }],
    climbables: { ladders: [{ x: 420, top: 200, bottom: 600, platform: -1, side: 1 }], ropes: [] },
    props: [], robots: [], triggers: [], mechanisms: [], times: { gold: 10, silver: 20, bronze: 40 } }
  await page.addInitScript(({ controller }) => {
    if (controller) {
      window.testPad = { index: 0, id: 'Ladder pad', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }
      Object.defineProperty(navigator, 'getGamepads', { value: () => [window.testPad] })
    }
  }, { controller })
  await open(page, level); await saveTestLevel(page, 'Save and Test'); await page.clock.runFor(100)
  if (controller) await page.evaluate(() => { window.testPad.axes[1] = -1 })
  else await page.keyboard.down('w')
  await page.clock.runFor(4300)
  await expect(page.locator('.jumping-state')).toHaveText('Climbing')
  await page.screenshot({ path: info.outputPath('ladder-top-transfer.png') })
  await page.clock.runFor(1000)
  await expect(page.locator('.jumping-state')).toHaveText('Ready')
  const top = await page.evaluate(() => window.jumpPlayer)
  expect(top.x).toBeCloseTo(380, 1); expect(top.y).toBeCloseTo(200, 1)
  if (controller) await page.evaluate(() => { window.testPad.axes[1] = 1 })
  else { await page.keyboard.up('w'); await page.keyboard.down('s') }
  await page.clock.runFor(350)
  await expect(page.locator('.jumping-state')).toHaveText('Lowering')
  await page.clock.runFor(1600)
  await expect(page.locator('.jumping-state')).toHaveText('Ladder · descending')
  const descending = await page.evaluate(() => window.jumpPlayer)
  expect(descending.x).toBeCloseTo(420, 1); expect(descending.y).toBeGreaterThan(300)
})

for (const anchorY of [200, 220]) for (const controller of [false, true]) test(`${controller ? 'controller' : 'keyboard'} climbs onto a thin platform from a rope anchored at ${anchorY}`, async ({ page }, info) => {
  const level = { version: 1, id: 'rope-exit-test', name: 'Rope exit test', width: 1000, height: 600, floor: 600,
    spawn: { x: 400, y: 600 }, goal: { x: 620, y: 200 }, checkpoints: [], platforms: [{ x: 400, y: 200, w: 400, h: 20 }],
    climbables: { ladders: [], ropes: [{ x: 400, y: anchorY, length: 330, segments: 24, anchor: { platform: 0, x: 0, y: anchorY - 200 } }] },
    props: [], robots: [], triggers: [], mechanisms: [], times: { gold: 10, silver: 20, bronze: 40 } }
  await page.addInitScript(({ controller }) => {
    if (controller) {
      window.testPad = { index: 0, id: 'Rope pad', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }
      Object.defineProperty(navigator, 'getGamepads', { value: () => [window.testPad] })
    }
  }, { controller })
  await open(page, level); await saveTestLevel(page, 'Save and Test'); await page.clock.runFor(100)
  if (controller) await page.evaluate(() => { window.testPad.axes[1] = -1 })
  else await page.keyboard.down('w')
  await page.clock.runFor(1000)
  await expect(page.locator('.jumping-state')).toHaveText('Rope · ascending')
  await page.clock.runFor(4500)
  await expect(page.locator('.jumping-state')).toHaveText('Ready')
  const top = await page.evaluate(() => window.jumpPlayer)
  expect(top.x).toBeCloseTo(420, 1); expect(top.y).toBeCloseTo(200, 1)
  await page.screenshot({ path: info.outputPath('rope-platform-exit.png') })
})

for (const pinned of [false, true]) test(`a ${pinned ? 'pinned' : 'loose'} ball at the rope exit permits climbing or retreating`, async ({ page }, info) => {
  const level = { version: 1, id: 'rope-ball-exit', name: 'Rope ball exit', width: 1000, height: 600, floor: 600,
    spawn: { x: 383, y: 600 }, goal: { x: 850, y: 600 }, checkpoints: [], platforms: [{ x: 400, y: 200, w: 400, h: 400 }],
    climbables: { ladders: [], ropes: [{ x: 400, y: 200, length: 330, segments: 42 }] },
    props: [{ kind: 'ball', x: 406, y: 200, size: 30 }], robots: [], triggers: [], mechanisms: [], times: { gold: 10, silver: 20, bronze: 40 } }
  if (pinned) level.platforms.push({ x: 440, y: 0, w: 60, h: 200 })
  await open(page, level); await saveTestLevel(page, 'Save and Test'); await page.clock.runFor(100)
  await page.keyboard.down('w'); await page.clock.runFor(6500); await page.keyboard.up('w')
  if (pinned) {
    await expect(page.locator('.jumping-state')).toHaveText('Climbing')
    await page.screenshot({ path: info.outputPath('climb-pauses-at-pinned-ball.png') })
    await page.keyboard.down('s'); await page.clock.runFor(1600); await page.keyboard.up('s')
    await expect(page.locator('.jumping-state')).toHaveText('Hanging')
    const held = await page.evaluate(() => window.jumpPlayer)
    expect(held.x).toBeCloseTo(386, 1); expect(held.y).toBeCloseTo(274, 1)
  } else {
    await expect(page.locator('.jumping-state')).toHaveText('Ready')
    const top = await page.evaluate(() => window.jumpPlayer)
    expect(top.x).toBeCloseTo(420, 1); expect(top.y).toBeCloseTo(200, 1)
    await page.screenshot({ path: info.outputPath('climbed-past-loose-ball.png') })
  }
})

test('snap aligns final terrain positions and resize edges, including previously offset terrain', async ({ page }, info) => {
  const level = { version: 1, id: 'grid-test', name: 'Grid test', width: 1000, height: 600, floor: 600,
    spawn: { x: 100, y: 600 }, goal: { x: 800, y: 600 }, checkpoints: [], platforms: [{ x: 403, y: 203, w: 203, h: 117 }],
    climbables: { ladders: [], ropes: [] }, props: [], robots: [], triggers: [], mechanisms: [], times: { gold: 10, silver: 20, bronze: 40 } }
  await open(page, level)
  await dragWorld(page, { x: 500, y: 250 }, { x: 523, y: 271 })
  await expect(page.getByRole('spinbutton', { name: 'Object x', exact: true })).toHaveValue('420')
  await expect(page.getByRole('spinbutton', { name: 'Object y', exact: true })).toHaveValue('380')
  const zoom = await page.getByRole('application', { name: 'Level canvas' }).evaluate(canvas => canvas.jumpCamera.a / devicePixelRatio)
  await dragWorld(page, { x: 623 + 16 / zoom, y: 337 + 16 / zoom }, { x: 660 + 16 / zoom, y: 360 + 16 / zoom })
  await expect(page.getByRole('spinbutton', { name: 'Object w', exact: true })).toHaveValue('240')
  await expect(page.getByRole('spinbutton', { name: 'Object h', exact: true })).toHaveValue('140')
  await page.keyboard.press('Shift+ArrowRight')
  await expect(page.getByRole('spinbutton', { name: 'Object x', exact: true })).toHaveValue('421')
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('spinbutton', { name: 'Object x', exact: true })).toHaveValue('440')
  await page.getByRole('spinbutton', { name: 'Object x', exact: true }).fill('447'); await page.getByRole('spinbutton', { name: 'Object x', exact: true }).press('Enter')
  await page.getByRole('spinbutton', { name: 'Object x', exact: true }).blur()
  await expect(page.getByRole('spinbutton', { name: 'Object x', exact: true })).toHaveValue('447')
  await page.getByRole('checkbox', { name: 'Snap' }).uncheck()
  await page.getByRole('spinbutton', { name: 'Object x', exact: true }).fill('447'); await page.getByRole('spinbutton', { name: 'Object x', exact: true }).press('Enter')
  await page.getByRole('spinbutton', { name: 'Object x', exact: true }).blur()
  await expect(page.getByRole('spinbutton', { name: 'Object x', exact: true })).toHaveValue('447')
  await page.getByRole('checkbox', { name: 'Snap' }).check()
  await dragWorld(page, { x: 447, y: 220 }, { x: 466, y: 239 })
  await page.clock.runFor(600)
  const draft = (await saveTestLevel(page)).level
  expect(draft.platforms[0].polygon[0].map((v, i) => v + (i ? draft.platforms[0].y : draft.platforms[0].x))).toEqual([460, 240])
  await page.screenshot({ path: info.outputPath('aligned-grid.png') })
})

test('start and goal move off the floor by dragging, nudging and height entry before adding support', async ({ page }) => {
  const level = { ...blankTrial(), name: 'Raised markers', width: 1000, height: 600, floor: 600,
    spawn: { x: 100, y: 600 }, goal: { x: 800, y: 600 } }
  await open(page, level)
  await page.getByRole('button', { name: 'Fit level', exact: true }).click(); await page.clock.runFor(64)
  const canvas = page.getByRole('application', { name: 'Level canvas' })
  const height = page.getByRole('spinbutton', { name: 'Object y', exact: true })
  await dragWorld(page, { x: 100, y: 570 }, { x: 100, y: 470 })
  await expect(page.getByRole('combobox', { name: 'Selected object' })).toHaveAttribute('data-value', 'spawn:0')
  await expect(height).toHaveValue('100')
  await canvas.focus(); await page.keyboard.press('ArrowUp')
  await expect(height).toHaveValue('120')
  await page.keyboard.press('Shift+ArrowUp')
  await expect(height).toHaveValue('121')
  await height.fill('200'); await height.blur()
  await expect(height).toHaveValue('200')

  await dragWorld(page, { x: 844, y: 570 }, { x: 844, y: 470 })
  await expect(page.getByRole('combobox', { name: 'Selected object' })).toHaveAttribute('data-value', 'goal:0')
  await expect(height).toHaveValue('100')
  await canvas.focus(); await page.keyboard.press('ArrowUp')
  await expect(height).toHaveValue('120')
  await height.fill('200'); await height.blur()
  await expect(height).toHaveValue('200')
  await expect(page.getByRole('button', { name: 'Save and Test', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await selectBuilderObject(page, 'goal:0')
  await expect(height).toHaveValue('120')
  await page.getByRole('button', { name: 'Redo', exact: true }).click()

  await page.getByRole('button', { name: 'Terrain', exact: true }).click()
  await dragWorld(page, { x: 40, y: 400 }, { x: 960, y: 420 })
  await expect(page.getByRole('button', { name: 'Save and Test', exact: true })).toBeEnabled()
  const saved = await saveTestLevel(page, 'Save and Test')
  expect(saved.level.spawn).toEqual({ x: 100, y: 400 })
  expect(saved.level.goal).toEqual({ x: 800, y: 400 })
  await page.clock.runFor(100)
  await expect(page.getByRole('img', { name: 'Raised markers: reach the exit' })).toBeFocused()
  expect((await page.evaluate(() => window.jumpPlayer)).y).toBeCloseTo(400, 1)
  await page.getByRole('button', { name: 'Return to builder', exact: true }).click()
  await reopenTestLevel(page, saved)
  for (const selection of ['spawn:0', 'goal:0']) {
    await selectBuilderObject(page, selection)
    await expect(height).toHaveValue('200')
  }
})

test('height grows above the layout with a bottom-left origin, stable view, undo, save and playtest', async ({ page }, info) => {
  const level = { version: 1, id: 'height-test', name: 'Height test', width: 1000, height: 600, floor: 600,
    spawn: { x: 100, y: 600 }, goal: { x: 800, y: 600 }, checkpoints: [], platforms: [{ x: 300, y: 200, w: 200, h: 100 }],
    climbables: { ladders: [{ x: 284, top: 200, bottom: 600, platform: 0, side: 1 }], ropes: [{ x: 500, y: 200, length: 300, segments: 24, anchor: { platform: 0, x: 200, y: 0 } }] },
    props: [], robots: [], triggers: [], mechanisms: [], times: { gold: 10, silver: 20, bronze: 40 } }
  await open(page, level)
  const canvas = page.getByRole('application', { name: 'Level canvas' })
  const camera = () => canvas.evaluate(c => ({ a: c.jumpCamera.a, f: c.jumpCamera.f }))
  const originalView = await camera()
  const levelHeight = page.getByRole('spinbutton', { name: 'Level height', exact: true })
  await levelHeight.fill('900'); await expect(levelHeight).toBeFocused()
  const previewView = await camera()
  expect(900 * previewView.a + previewView.f).toBeCloseTo(600 * originalView.a + originalView.f, 5)
  await levelHeight.press('Escape'); expect(await camera()).toEqual(originalView)
  await levelHeight.fill(''); await levelHeight.pressSequentially('1037'); await levelHeight.press('Enter')
  const tallerView = await camera()
  expect(tallerView.a).toBe(originalView.a)
  expect(1037 * tallerView.a + tallerView.f).toBeCloseTo(600 * originalView.a + originalView.f, 5)
  await selectBuilderObject(page, 'platform:0')
  await expect(page.getByRole('spinbutton', { name: 'Object y', exact: true })).toHaveValue('400')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await page.getByRole('tab', { name: 'Level', exact: true }).click()
  await expect(page.getByRole('spinbutton', { name: 'Level height', exact: true })).toHaveValue('600')
  expect(await camera()).toEqual(originalView)
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  expect(await camera()).toEqual(tallerView)
  await selectBuilderObject(page, 'spawn:0')
  await expect(page.getByRole('spinbutton', { name: 'Object y', exact: true })).toHaveValue('0')
  await selectBuilderObject(page, 'rope:0')
  await expect(page.getByRole('spinbutton', { name: 'Object y', exact: true })).toHaveValue('400')
  await expect(page.getByRole('button', { name: 'Detach anchor', exact: true })).toBeVisible()
  await selectBuilderObject(page, 'platform:0')
  await page.getByRole('spinbutton', { name: 'Object y', exact: true }).fill('440'); await page.getByRole('spinbutton', { name: 'Object y', exact: true }).press('Enter')
  await page.getByRole('spinbutton', { name: 'Object y', exact: true }).blur()
  await canvas.focus(); await page.keyboard.press('ArrowUp')
  await expect(page.getByRole('spinbutton', { name: 'Object y', exact: true })).toHaveValue('460')
  await dragWorld(page, { x: 400, y: 637 }, { x: 400, y: 637 })
  await expect(page.getByRole('status', { name: 'Cursor coordinates' })).toHaveText('400, 400')
  await page.getByRole('button', { name: 'Terrain', exact: true }).click()
  await dragWorld(page, { x: 600, y: 737 }, { x: 700, y: 837 })
  await expect(page.getByRole('spinbutton', { name: 'Object y', exact: true })).toHaveValue('300')
  await page.getByRole('button', { name: 'Save level', exact: true }).click()
  const file = await saveTestLevel(page), exported = file.level
  expect(exported.floor).toBe(1037)
  expect(exported.platforms.map(p => p.y)).toEqual([577, 737])
  expect(exported.climbables.ladders[0]).toMatchObject({ top: 577, bottom: 977, platform: 0 })
  expect(exported.climbables.ropes[0]).toMatchObject({ y: 577, anchor: { platform: 0, x: 200, y: 0 } })
  expect(exported.spawn.y).toBe(1037); expect(exported.goal.y).toBe(1037)
  await page.getByRole('button', { name: 'Fit level', exact: true }).click()
  await page.screenshot({ path: info.outputPath('height-added-at-top.png') })
  await saveTestLevel(page, 'Save and Test'); await page.clock.runFor(100)
  expect((await page.evaluate(() => window.jumpPlayer)).y).toBeCloseTo(1037, 1)
  await page.getByRole('button', { name: 'Return to builder' }).click()
  await reopenTestLevel(page, file)
  await page.clock.runFor(600)
  await page.clock.resume(); await page.reload()
  await expect(page).toHaveURL(/\/builder\/local\//)
  await reopenTestLevel(page, file)
  await expect(page.getByRole('spinbutton', { name: 'Level height', exact: true })).toHaveValue('1037')
  await selectBuilderObject(page, 'platform:0')
  await expect(page.getByRole('spinbutton', { name: 'Object y', exact: true })).toHaveValue('460')
})

test('shovebot patrol endpoints drag and preview live with snap, cancellation, undo and saved limits', async ({ page }, info) => {
  const level = blankTrial(); level.robots = [{ x: 700, y: 920, left: 400, right: 1000 }]
  await open(page, level); await selectBuilderObject(page, 'robot:0')
  const canvas = page.getByRole('application', { name: 'Level canvas' })
  const left = page.getByRole('spinbutton', { name: 'Shovebot left limit' }), right = page.getByRole('spinbutton', { name: 'Shovebot right limit' })
  const a = await worldPoint(page, { x: 400, y: 855 }), b = await worldPoint(page, { x: 433, y: 830 })
  await page.mouse.move(a.x, a.y); await expect(canvas).toHaveCSS('cursor', 'ew-resize'); await page.mouse.down()
  await page.mouse.move(b.x, b.y, { steps: 8 })
  await expect(left).toHaveValue('440'); await expect(right).toHaveValue('1000')
  await expectHandle(page, { x: 440, y: 855 }); await page.mouse.up()
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await selectBuilderObject(page, 'robot:0')
  await expect(left).toHaveValue('400')
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); await selectBuilderObject(page, 'robot:0')
  await expect(left).toHaveValue('440')
  await dragWorld(page, { x: 1000, y: 855 }, { x: 1127, y: 855 }); await expect(right).toHaveValue('1120')
  await page.keyboard.down('Alt'); await dragWorld(page, { x: 1120, y: 855 }, { x: 1143, y: 855 }); await page.keyboard.up('Alt')
  await expect(right).toHaveValue('1143')
  await page.getByRole('checkbox', { name: 'Snap' }).uncheck()
  await dragWorld(page, { x: 440, y: 855 }, { x: 457, y: 855 }); await expect(left).toHaveValue('457')
  const from = await worldPoint(page, { x: 457, y: 855 }), to = await worldPoint(page, { x: 520, y: 855 })
  await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(to.x, to.y)
  await expect(left).toHaveValue('520')
  await page.keyboard.press('Escape'); await page.mouse.up(); await selectBuilderObject(page, 'robot:0')
  await expect(left).toHaveValue('457'); await expectHandle(page, { x: 457, y: 855 })
  await dragWorld(page, { x: 457, y: 855 }, { x: 760, y: 855 }); await expect(left).toHaveValue('700')
  await dragWorld(page, { x: 1143, y: 855 }, { x: 660, y: 855 }); await expect(right).toHaveValue('750')
  await left.fill('0'); await expectHandle(page, { x: 50, y: 855 })
  await expect(left).toBeFocused(); await left.press('Escape'); await expectHandle(page, { x: 700, y: 855 })
  await left.fill(''); await left.pressSequentially('300'); await expectHandle(page, { x: 300, y: 855 })
  await left.press('Enter')
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await selectBuilderObject(page, 'robot:0')
  await expect(left).toHaveValue('700')
  await left.fill('300'); await left.press('Tab')
  await right.fill('9999'); await expectHandle(page, { x: 1750, y: 855 })
  await right.press('Enter')
  await page.getByRole('tab', { name: 'Level', exact: true }).click()
  const width = page.getByRole('spinbutton', { name: 'Level width', exact: true })
  await width.fill('800'); await width.press('Enter'); await expect(width).toHaveValue('1800')
  const saved = await saveTestLevel(page)
  expect(saved.level.robots[0]).toEqual({ ...level.robots[0], left: 300, right: 1750 })
  await reopenTestLevel(page, saved); await selectBuilderObject(page, 'robot:0')
  await expect(left).toHaveValue('300'); await expect(right).toHaveValue('1750')
  await page.screenshot({ path: info.outputPath('shovebot-patrol-handles.png') })
})

test('mechanism travel, climbable dimensions, spotlight angles and text settings preview before leaving the inspector', async ({ page }) => {
  const level = blankTrial()
  level.mechanisms = [
    { id: 'lift', kind: 'lift', x: 500, y: 900, w: 180, h: 20, travel: 240 },
    { id: 'slider', kind: 'lift', orientation: 'horizontal', x: 900, y: 700, w: 160, h: 20, travel: 200 },
  ]
  level.climbables.ladders = [{ x: 300, top: 300, bottom: 700, platform: -1, side: 1 }]
  level.climbables.ropes = [{ x: 1100, y: 100, length: 200, segments: 16 }]
  level.texts = [{ x: 400, y: 200, w: 300, h: 180, text: 'LIVE', fontSize: 28, align: 'left' }]
  level.version = 2; level.lighting = { nightMode: false, ambient: 0, lights: [{ id: 'lamp', x: 700, y: 300, direction: 90, spread: 60, intensity: 100, power: 'always' }] }
  await open(page, level)
  const canvas = page.getByRole('application', { name: 'Level canvas' })
  await selectBuilderObject(page, 'mechanism:0')
  const travel = page.getByRole('spinbutton', { name: 'Travel height', exact: true })
  await travel.fill('360'); await expect(travel).toBeFocused(); await expectHandle(page, { x: 590, y: 540 })
  await travel.press('Escape'); await expectHandle(page, { x: 590, y: 660 })
  await travel.fill('360'); await travel.press('Enter')
  await selectBuilderObject(page, 'mechanism:1')
  const distance = page.getByRole('spinbutton', { name: 'Travel distance', exact: true })
  await distance.fill('300'); await expectHandle(page, { x: 680, y: 700 }); await distance.press('Tab')
  await selectBuilderObject(page, 'ladder:0')
  const height = page.getByRole('spinbutton', { name: 'Object h', exact: true })
  const padding = await canvas.evaluate(c => 8 * devicePixelRatio / c.jumpCamera.a)
  await height.fill('500'); await expectHandle(page, { x: 300, y: 800 + padding }); await height.press('Tab')
  await selectBuilderObject(page, 'rope:0')
  await height.fill('300'); await expect(height).toBeFocused()
  await expect.poll(() => canvas.evaluate(c => c.builderHandles.some(h => Math.abs(h.x - 1100) < 1 && h.y > 395))).toBe(true)
  await height.press('Enter')
  await selectBuilderObject(page, 'light:0')
  const direction = page.getByRole('spinbutton', { name: 'Light direction', exact: true }), spread = page.getByRole('spinbutton', { name: 'Light spread', exact: true })
  const radius = await canvas.evaluate(c => 60 * devicePixelRatio / c.jumpCamera.a)
  await direction.fill('0'); await expectHandle(page, { x: 700 + radius, y: 300 }); await direction.press('Escape')
  await expectHandle(page, { x: 700, y: 300 + radius })
  await spread.fill('120'); await expectHandle(page, { x: 700 + radius * Math.cos(Math.PI / 6), y: 300 + radius / 2 }); await spread.press('Enter')
  await selectBuilderObject(page, 'text:0')
  const font = page.getByRole('spinbutton', { name: 'Text font size', exact: true }), rotation = page.getByRole('spinbutton', { name: 'Text rotation', exact: true })
  await font.fill('48'); await expect.poll(() => canvas.evaluate(c => c.wallTexts[0]?.font)).toContain('48px')
  await font.press('Tab')
  await rotation.fill('45'); await expect.poll(() => canvas.evaluate(c => Math.round(c.wallTexts[0]?.rotation))).toBe(45)
  await rotation.press('Escape'); await expect.poll(() => canvas.evaluate(c => Math.round(c.wallTexts[0]?.rotation))).toBe(0)
  const saved = (await saveTestLevel(page)).level
  expect(saved.mechanisms.map(m => m.travel)).toEqual([360, 300])
  expect(saved.climbables.ladders[0].bottom).toBe(800)
  expect(saved.climbables.ropes[0].length).toBe(300)
  expect(saved.lighting.lights[0]).toMatchObject({ direction: 90, spread: 120 })
  expect(saved.texts[0].fontSize).toBe(48); expect(saved.texts[0].rotation ?? 0).toBe(0)
})

test('seconds accept only whole numbers, preview live, and respect pickup and medal bounds', async ({ page }) => {
  const level = blankTrial(); level.pickups = [
    { kind: 'time-bonus', x: 400, y: 700, seconds: 5 },
    { kind: 'time-penalty', x: 600, y: 700, seconds: 3 },
  ]
  await open(page, level); await selectBuilderObject(page, 'pickup:0')
  const canvas = page.getByRole('application', { name: 'Level canvas' }), seconds = page.getByRole('spinbutton', { name: 'Seconds off', exact: true })
  await seconds.fill('7'); await expect(seconds).toBeFocused()
  await expect.poll(() => canvas.evaluate(c => c.builderLabels.includes('7'))).toBe(true)
  await seconds.press('Escape'); await expect(seconds).toHaveValue('5')
  await seconds.fill('2.5'); await expect(seconds).toHaveValue('5')
  await seconds.fill('0'); await expect.poll(() => canvas.evaluate(c => c.builderLabels.includes('1'))).toBe(true)
  await seconds.press('Tab'); await expect(seconds).toHaveValue('1')
  await selectBuilderObject(page, 'pickup:1')
  const added = page.getByRole('spinbutton', { name: 'Seconds added', exact: true })
  await added.fill('100'); await expect.poll(() => canvas.evaluate(c => c.builderLabels.includes('9'))).toBe(true)
  await added.press('Enter'); await expect(added).toHaveValue('9')
  await page.getByRole('tab', { name: 'Level', exact: true }).click()
  const gold = page.getByRole('spinbutton', { name: 'gold time', exact: true }), silver = page.getByRole('spinbutton', { name: 'silver time', exact: true }), bronze = page.getByRole('spinbutton', { name: 'bronze time', exact: true })
  await gold.fill('10.5'); await expect(gold).toHaveValue('10')
  await gold.fill('1e2'); await expect(gold).toHaveValue('10')
  await gold.fill('9999'); await gold.press('Enter'); await expect(gold).toHaveValue('19')
  await silver.fill('0'); await silver.press('Enter'); await expect(silver).toHaveValue('20')
  await bronze.fill('9999'); await bronze.press('Enter'); await expect(bronze).toHaveValue('3600')
  const saved = (await saveTestLevel(page)).level
  expect(saved.pickups.map(p => p.seconds)).toEqual([1, 9]); expect(saved.times).toEqual({ gold: 19, silver: 20, bronze: 3600 })
})

test('numeric inspector edits commit once, accept complete values, cancel cleanly, and keep boxes on the floor', async ({ page }) => {
  const level = blankTrial(); level.props = [{ kind: 'box', x: 500, y: 920, size: 80 }]
  await open(page, level)
  const selected = page.getByRole('combobox', { name: 'Selected object' }), size = page.getByRole('spinbutton', { name: 'Object w', exact: true })
  await selectBuilderObject(page, 'prop:0')
  await expect(page.getByRole('spinbutton', { name: 'Object h', exact: true })).toHaveCount(0)
  await size.fill(''); await size.pressSequentially('1')
  await expect(page.getByRole('spinbutton', { name: 'Object y', exact: true })).toHaveValue('30')
  await size.pressSequentially('60')
  await expect(page.getByRole('spinbutton', { name: 'Object y', exact: true })).toHaveValue('160')
  const padding = await page.getByRole('application', { name: 'Level canvas' }).evaluate(c => 8 * devicePixelRatio / c.jumpCamera.a)
  await expectHandle(page, { x: 420 - padding, y: 760 - padding })
  await size.press('Enter')
  await expect(page.getByRole('spinbutton', { name: 'Object y', exact: true })).toHaveValue('160')
  expect((await saveTestLevel(page)).level.props[0]).toEqual({ kind: 'box', x: 500, y: 920, size: 160 })
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await selectBuilderObject(page, 'prop:0')
  await expect(size).toHaveValue('80')
  await size.fill('130')
  await expect(page.getByRole('spinbutton', { name: 'Object y', exact: true })).toHaveValue('130')
  await size.press('Escape'); await expect(size).toHaveValue('80')
  await expect(page.getByRole('spinbutton', { name: 'Object y', exact: true })).toHaveValue('80')
  for (const invalid of ['130.5', '1e2', '9007199254740992']) {
    await size.fill(invalid); await expect(size).toHaveValue('80')
    await expect(page.getByRole('spinbutton', { name: 'Object y', exact: true })).toHaveValue('80')
  }
  await size.fill(''); await size.press('Tab'); await expect(size).toHaveValue('80')
  await size.fill('130'); await size.press('Enter'); await expect(size).toHaveValue('130')
  await size.press('Enter') // Enter editing again; arrows otherwise navigate.
  await size.press('ArrowUp'); await expect(size).toHaveValue('150')
  await size.press('Alt+ArrowDown'); await expect(size).toHaveValue('149')
  expect((await saveTestLevel(page)).level.props[0]).toEqual({ kind: 'box', x: 500, y: 920, size: 149 })
})

test('boxes and gates resize from accessible handles while their bases stay planted', async ({ page }, info) => {
  const level = blankTrial(); level.props = [{ kind: 'box', x: 500, y: 920, size: 80 }]
  level.mechanisms = [{ id: 'gate', kind: 'gate', x: 900, y: 740, w: 20, h: 180, travel: 180 }]
  await open(page, level)
  const selected = page.getByRole('combobox', { name: 'Selected object' })
  const padding = await page.getByRole('application', { name: 'Level canvas' }).evaluate(c => 8 * devicePixelRatio / c.jumpCamera.a)
  await selectBuilderObject(page, 'prop:0')
  await dragWorld(page, { x: 540 + padding, y: 840 - padding }, { x: 580 + padding, y: 800 - padding })
  await expect(page.getByRole('spinbutton', { name: 'Object w', exact: true })).toHaveValue('120')
  await expect(page.getByText('On surface', { exact: true })).toBeVisible()
  await selectBuilderObject(page, 'mechanism:0')
  await dragWorld(page, { x: 910, y: 740 - padding }, { x: 910, y: 640 - padding })
  await expect(page.getByRole('spinbutton', { name: 'Object h', exact: true })).toHaveValue('280')
  const saved = (await saveTestLevel(page)).level
  expect(saved.props[0]).toEqual({ kind: 'box', x: 520, y: 920, size: 120 })
  expect(saved.mechanisms[0]).toEqual({ ...level.mechanisms[0], y: 640, h: 280, travel: 280 })
  await page.screenshot({ path: info.outputPath('gate-sizing.png') })
})

test('surface placement and Alt dragging are predictable off the grid', async ({ page }, info) => {
  const level = blankTrial(); level.platforms = [{ x: 380, y: 713, w: 420, h: 20 }]
  level.props = [{ kind: 'box', x: 500, y: 650, size: 100 }]
  await open(page, level)
  await selectBuilderObject(page, 'prop:0')
  await page.getByRole('button', { name: 'Place on surface', exact: true }).click()
  await expect(page.getByRole('spinbutton', { name: 'Object y', exact: true })).toHaveValue('307')
  await dragWorld(page, { x: 500, y: 663 }, { x: 520, y: 645 })
  await expect(page.getByText('On surface', { exact: true })).toBeVisible()
  await page.keyboard.down('Alt'); await dragWorld(page, { x: 520, y: 663 }, { x: 520, y: 658 }); await page.keyboard.up('Alt')
  await expect(page.getByRole('spinbutton', { name: 'Object y', exact: true })).toHaveValue('312')
  await page.getByRole('button', { name: 'Place on surface', exact: true }).click()
  expect((await saveTestLevel(page)).level.props[0].y).toBe(713)
  await page.screenshot({ path: info.outputPath('surface-placement.png') })
})


for (const side of [-1, 1]) test(`rope exits onto a thin cap with a separate flush wall, side ${side}`, async ({ page }, info) => {
  const level = { ...blankTrial(), width: 1040, height: 800, floor: 800,
    spawn: { x: 520 - side * 22, y: 600 }, goal: { x: 100, y: 800 },
    platforms: [{ x: side === -1 ? 0 : 520, y: 460, w: 520, h: 20 },
      { x: side === -1 ? 500 : 520, y: 480, w: 20, h: 220 },
      { x: side === -1 ? 520 : 480, y: 600, w: 40, h: 20 }],
    climbables: { ladders: [], ropes: [{ x: 520, y: 460, length: 180, segments: 23 }] } }
  await open(page, level); await saveTestLevel(page, 'Save and Test')
  await page.keyboard.down('w'); await page.clock.runFor(4500); await page.keyboard.up('w')
  await expect(page.locator('.jumping-state')).toHaveText('Ready')
  const player = await page.evaluate(() => window.jumpPlayer)
  expect(player.x).toBeCloseTo(520 + side * 20, 1)
  expect(player.y).toBeCloseTo(460, 1)
  await page.screenshot({ path: info.outputPath('joined-rope-exit.png') })
})


test('legacy coin bars convert to numeric faces with undo and folder round trips', async ({ page }, info) => {
  const level = blankTrial()
  level.pickups = [{ kind: 'coin', x: 160, y: 888 }]
  level.triggers = [{ mode: 'coins', x: 400, y: 640, w: 20, h: 120, orientation: 'vertical', threshold: 1, targets: [], name: 'Toll' }]
  level.timers = [{ x: 600, y: 680 }]
  await open(page, level)
  await selectBuilderObject(page, 'trigger:0')
  await expect(page.getByRole('combobox', { name: 'Coin switch display', exact: true })).toHaveAttribute('data-value', 'bar')
  await selectBuilderOption(page, 'Coin switch display', 'digital')
  await expect(page.getByRole('combobox', { name: 'Coin switch orientation', exact: true })).toHaveCount(0)
  await expect(page.getByRole('spinbutton', { name: 'Object w', exact: true })).toHaveCount(0)
  const saved = await saveTestLevel(page)
  expect(saved.level.triggers).toEqual([{ mode: 'coins', x: 350, y: 680, w: 120, display: 'digital', threshold: 1, targets: [], name: 'Toll' }])
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await selectBuilderObject(page, 'trigger:0')
  await expect(page.getByRole('combobox', { name: 'Coin switch orientation', exact: true })).toHaveAttribute('data-value', 'vertical')
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await reopenTestLevel(page, saved)
  await selectBuilderObject(page, 'trigger:0')
  await expect(page.getByRole('combobox', { name: 'Coin switch display', exact: true })).toHaveAttribute('data-value', 'digital')
  await page.screenshot({ path: info.outputPath('numeric-coin-counter-builder.png') })
  await saveTestLevel(page, 'Save and Test'); await page.clock.runFor(64)
  await page.keyboard.down('d'); await page.clock.runFor(1100); await page.keyboard.up('d')
  await page.screenshot({ path: info.outputPath('numeric-coin-counter-play.png') })
})
