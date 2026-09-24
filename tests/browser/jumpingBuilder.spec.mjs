import { test, expect } from './helpers/test.mjs'
import { readFile } from 'node:fs/promises'
import { restartFromPause, useLevelFixtures } from './helpers/jumpingLevels.mjs'
import { blankTrial } from '../../src/games/jumping/level.ts'

async function open(page, level) {
  if (level) await useLevelFixtures(page, [level])
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype, rect = proto.fillRect, ellipse = proto.ellipse, text = proto.fillText
    proto.fillRect = function (...args) {
      if (args[0] === 0 && args[1] === 0 && this.fillStyle === '#f1f1ed') { this.canvas.jumpCamera = this.getTransform(); this.canvas.wallTimers = []; this.canvas.wallTexts = [] }
      return rect.apply(this, args)
    }
    proto.ellipse = function (...args) {
      if (args[2] === 6.2 && args[3] === 6.2 && this.canvas.jumpCamera) {
        const body = this.getTransform(), camera = this.canvas.jumpCamera
        window.jumpPlayer = { x: (body.e - camera.e) / camera.a, y: (body.f - camera.f) / camera.d }
      }
      return ellipse.apply(this, args)
    }
    proto.fillText = function (value, x, y, ...rest) {
      if (this.fillStyle === '#718074') {
        const t = this.getTransform()
        this.canvas.wallTexts?.push({ text: value, x, y, screenX: x * t.a + t.e, screenY: y * t.d + t.f })
      }
      if (/^\d+:\d{2}\.\d{2}$/.test(value)) {
        const t = this.getTransform()
        this.canvas.wallTimers?.push({ text: value, x, y, screenX: x * t.a + t.e, screenY: y * t.d + t.f })
      }
      return text.call(this, value, x, y, ...rest)
    }
  })
  await page.goto('/untitled-jumping-game')
  await page.getByRole('button', { name: level ? 'Edit selected level' : 'Level builder', exact: true }).click()
  await expect(page.getByRole('application', { name: 'Level canvas' })).toBeVisible()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.clock.runFor(64)
}
async function downloadLevel(page, button = 'Export') {
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: button, exact: true }).click()])
  const path = await download.path()
  return { path, level: JSON.parse(await readFile(path, 'utf8')) }
}
async function dragWorld(page, start, end) {
  const canvas = await page.getByRole('application', { name: 'Level canvas' }).boundingBox()
  const camera = await page.getByRole('application', { name: 'Level canvas' }).evaluate(canvas => { const c = canvas.jumpCamera; return { a: c.a, d: c.d, e: c.e, f: c.f, ratio: devicePixelRatio } })
  const x = v => canvas.x + (v * camera.a + camera.e) / camera.ratio, y = v => canvas.y + (v * camera.d + camera.f) / camera.ratio
  await page.mouse.move(x(start.x), y(start.y)); await page.mouse.down()
  await page.mouse.move(x(end.x), y(end.y), { steps: 8 }); await page.mouse.up()
}

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
  await expect(selected).toHaveValue('prop:0')
  await page.getByRole('spinbutton', { name: 'Object w', exact: true }).fill('60')
  await place('Box', { x: 380, y: 880 })
  await expect(selected).toHaveValue('prop:1')
  await page.getByRole('spinbutton', { name: 'Object w', exact: true }).fill('100')
  await place('Elevator', { x: 500, y: 900 }, { x: 500, y: 660 })
  await expect(selected).toHaveValue('mechanism:0')
  await page.getByRole('spinbutton', { name: 'Object w', exact: true }).fill('180')
  await expect(page.getByRole('spinbutton', { name: 'Object h', exact: true })).toHaveValue('20')
  await expect(page.getByRole('spinbutton', { name: 'Distance to anchor' })).toHaveValue('240')
  await place('Gate', { x: 820, y: 900 })
  await expect(selected).toHaveValue('mechanism:1')
  await page.getByRole('spinbutton', { name: 'Object h', exact: true }).fill('200')
  await expect(page.getByRole('spinbutton', { name: 'Object w', exact: true })).toHaveValue('20')
  await place('Shovebot', { x: 740, y: 900 })
  await expect(selected).toHaveValue('robot:0')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(selected.locator('option[value="robot:0"]')).toHaveCount(0)
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await selected.selectOption('robot:0')
  await page.getByRole('spinbutton', { name: 'Shovebot left limit' }).fill('660')
  await page.getByRole('spinbutton', { name: 'Shovebot right limit' }).fill('780')
  for (const [x, target] of [[100, 'Elevator 1'], [660, 'Gate 2']]) {
    await place('Pressure plate', { x, y: 900 })
    await page.getByRole('combobox', { name: 'Connected mechanism' }).selectOption({ label: target })
  }
  await expect(page.getByRole('button', { name: 'Playtest', exact: true })).toBeEnabled()
  const saved = await downloadLevel(page, 'Save level')
  expect(saved.level.props).toEqual([{ kind: 'ball', x: 260, y: 920, size: 60 }, { kind: 'box', x: 380, y: 920, size: 100 }])
  expect(saved.level.mechanisms.map(({ kind, x, y, w, h, travel }) => ({ kind, x, y, w, h, travel }))).toEqual([
    { kind: 'lift', x: 500, y: 900, w: 180, h: 20, travel: 240 },
    { kind: 'gate', x: 820, y: 720, w: 20, h: 200, travel: 220 },
  ])
  expect(saved.level.robots).toEqual([{ x: 740, y: 920, left: 660, right: 780 }])
  expect(saved.level.triggers.map(p => p.target)).toEqual(saved.level.mechanisms.map(m => m.id))
  await page.getByLabel('Import level file').setInputFiles(saved.path); await page.clock.runFor(32)
  expect((await downloadLevel(page)).level).toEqual(saved.level)
  await selected.selectOption('mechanism:0')
  await page.getByRole('button', { name: 'Elevator', exact: true }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: info.outputPath('object-tools-builder.png') })
  await page.getByRole('button', { name: 'Playtest', exact: true }).click(); await page.clock.runFor(64)
  await expect(page.getByRole('img', { name: 'Object workshop: activate the goal' })).toBeVisible()
  await page.keyboard.down('d'); await page.clock.runFor(64); await page.keyboard.up('d')
  await page.getByRole('button', { name: 'Return to builder' }).click()
  expect((await downloadLevel(page)).level).toEqual(saved.level)
  expect(errors).toEqual([])
})

test('suspended gates and elevators keep fixed thickness, editable anchors, and working switches', async ({ page }, info) => {
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
  level.triggers = [{ x: 300, y: 920, w: 80, target: 'gate', mode: 'weight' },
    { x: 300, y: 920, w: 80, target: 'lift', mode: 'weight' }]
  await open(page, level)
  const selected = page.getByRole('combobox', { name: 'Selected object' }), editor = page.getByRole('application', { name: 'Level canvas' })
  await selected.selectOption('trigger:0')
  await expect(page.getByRole('combobox', { name: 'Pressure mode' })).toHaveCount(0)
  await expect(page.getByText('The player, a crate, or a ball can hold this plate. Releasing pauses elevators and closes gates.')).toBeVisible()
  await selected.selectOption('mechanism:0')
  await expect(page.getByRole('spinbutton', { name: 'Object w', exact: true })).toHaveValue('20')
  await expect(page.getByRole('spinbutton', { name: 'Object w', exact: true })).toBeDisabled()
  await page.getByRole('spinbutton', { name: 'Object h', exact: true }).fill('160')
  await page.getByRole('spinbutton', { name: 'Distance to anchor' }).fill('240')
  await selected.selectOption('mechanism:1')
  await expect(page.getByRole('spinbutton', { name: 'Object h', exact: true })).toHaveValue('20')
  await expect(page.getByRole('spinbutton', { name: 'Object h', exact: true })).toBeDisabled()
  await page.getByRole('spinbutton', { name: 'Object w', exact: true }).fill('200')
  await page.getByRole('spinbutton', { name: 'Distance to anchor' }).fill('240')
  await page.clock.runFor(32)
  expect(await editor.evaluate(canvas => canvas.mechanismBodies)).toEqual({
    gate: { x: 612, y: 740, w: 20, h: 160 }, lift: { x: 900, y: 890, w: 200, h: 20 },
  })
  const exported = await downloadLevel(page)
  expect(exported.level.mechanisms.map(m => [m.w, m.h, m.travel])).toEqual([[20, 160, 240], [200, 20, 240]])
  await page.getByLabel('Import level file').setInputFiles(exported.path); await page.clock.runFor(32)
  expect(await editor.evaluate(canvas => canvas.mechanismAnchors[622])).toBe(500)
  expect(await editor.evaluate(canvas => canvas.mechanismAnchors[1000])).toBe(650)
  await page.screenshot({ path: info.outputPath('suspended-mechanisms-builder.png') })
  await page.getByRole('button', { name: 'Playtest', exact: true }).click(); await page.clock.runFor(64)
  const game = page.getByRole('img', { name: 'Untitled level: activate the goal' })
  await page.keyboard.down('d'); await page.clock.runFor(32); await page.keyboard.up('d')
  await page.clock.runFor(2600)
  expect(await game.evaluate(canvas => canvas.mechanismBodies.gate.y)).toBe(500)
  expect(await game.evaluate(canvas => canvas.mechanismBodies.lift.y)).toBe(650)
  expect(await game.evaluate(canvas => canvas.mechanismAnchors[622])).toBe(500)
  expect(await game.evaluate(canvas => canvas.mechanismAnchors[1000])).toBe(650)
  await page.screenshot({ path: info.outputPath('suspended-mechanisms-raised.png') })
  await page.clock.runFor(4000)
  expect(await game.evaluate(canvas => canvas.mechanismBodies.gate.y)).toBe(500)
  expect(await game.evaluate(canvas => canvas.mechanismBodies.lift.y)).toBeGreaterThan(650)
  await page.keyboard.down('d'); await page.clock.runFor(320); await page.keyboard.up('d'); await page.clock.runFor(32)
  const stoppedY = await game.evaluate(canvas => canvas.mechanismBodies.lift.y)
  await page.clock.runFor(2400)
  expect(await game.evaluate(canvas => canvas.mechanismBodies.gate.y)).toBe(740)
  expect(await game.evaluate(canvas => canvas.mechanismBodies.lift.y)).toBe(stoppedY)
  await page.screenshot({ path: info.outputPath('suspended-mechanisms-released.png') })
})

test('goal lights flip horizontally, survive moving and export, and still activate in play', async ({ page }, info) => {
  await page.addInitScript(() => {
    const arc = CanvasRenderingContext2D.prototype.arc
    CanvasRenderingContext2D.prototype.arc = function (...args) {
      if (args[2] === 11 && ['#9aa38e', '#a9d56b'].includes(this.fillStyle))
        this.canvas.goalLight = { x: args[0], y: args[1], lit: this.fillStyle === '#a9d56b' }
      return arc.apply(this, args)
    }
  })
  const level = blankTrial(); level.goal.x = 500
  await open(page, level)
  const selected = page.getByRole('combobox', { name: 'Selected object' }), editor = page.getByRole('application', { name: 'Level canvas' })
  await selected.selectOption('goal:0')
  const flip = page.getByRole('button', { name: 'Flip horizontally', exact: true })
  await expect(flip).toHaveAttribute('aria-pressed', 'false')
  expect(await editor.evaluate(canvas => canvas.goalLight.x)).toBe(544)
  await flip.click(); await page.clock.runFor(32)
  await expect(flip).toHaveAttribute('aria-pressed', 'true')
  expect(await editor.evaluate(canvas => canvas.goalLight.x)).toBe(456)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await selected.selectOption('goal:0')
  await expect(flip).toHaveAttribute('aria-pressed', 'false')
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await selected.selectOption('goal:0')
  await expect(flip).toHaveAttribute('aria-pressed', 'true')
  await flip.click(); await expect(flip).toHaveAttribute('aria-pressed', 'false')
  await flip.click()
  await page.getByRole('spinbutton', { name: 'Object x', exact: true }).fill('600')
  await selected.selectOption('spawn:0'); await page.clock.runFor(32)
  await dragWorld(page, { x: 556, y: 824 }, { x: 556, y: 824 })
  await expect(selected).toHaveValue('goal:0')
  const exported = await downloadLevel(page)
  expect(exported.level.goal).toEqual({ x: 600, y: 920, flipX: true })
  await page.getByLabel('Import level file').setInputFiles(exported.path); await page.clock.runFor(32)
  expect(await editor.evaluate(canvas => canvas.goalLight)).toEqual({ x: 556, y: 824, lit: false })
  await selected.selectOption('goal:0')
  await expect(flip).toHaveAttribute('aria-pressed', 'true')
  await page.screenshot({ path: info.outputPath('flipped-goal-builder.png') })
  await page.getByRole('button', { name: 'Playtest', exact: true }).click(); await page.clock.runFor(64)
  const game = page.getByRole('img', { name: 'Untitled level: activate the goal' })
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

test('stopwatches can be placed, edited, duplicated, undone, exported, imported and playtested', async ({ page }, info) => {
  await open(page)
  await page.getByRole('button', { name: 'Stopwatch', exact: true }).click()
  await dragWorld(page, { x: 320, y: 840 }, { x: 320, y: 840 })
  await expect(page.getByRole('combobox', { name: 'Selected object' })).toHaveValue('pickup:0')
  await page.getByRole('button', { name: 'Duplicate', exact: true }).click()
  await page.getByRole('spinbutton', { name: 'Object x', exact: true }).fill('600')
  await page.getByRole('spinbutton', { name: 'Object y', exact: true }).fill('240')
  await page.getByRole('button', { name: 'Delete object' }).click()
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  const exported = await downloadLevel(page)
  expect(exported.level.pickups).toEqual([{ kind: 'stopwatch', x: 344, y: 872 }, { kind: 'stopwatch', x: 624, y: 712 }])
  await page.getByLabel('Import level file').setInputFiles(exported.path)
  expect((await downloadLevel(page)).level.pickups).toEqual(exported.level.pickups)
  await page.getByRole('combobox', { name: 'Selected object' }).selectOption('pickup:0')
  await page.screenshot({ path: info.outputPath('stopwatch-builder.png') })
  await page.getByRole('button', { name: 'Playtest', exact: true }).click(); await page.clock.runFor(64)
  await page.keyboard.down('d'); await page.clock.runFor(800); await page.keyboard.up('d')
  const frozenTime = await page.getByTestId('level-time').innerText()
  expect(frozenTime).toMatch(/^0:00\./)
  await page.clock.runFor(2000)
  await expect(page.getByTestId('level-time')).toHaveText(frozenTime)
  await page.getByRole('button', { name: 'Return to builder' }).click()
  expect((await downloadLevel(page)).level.pickups).toEqual(exported.level.pickups)
})

test('wall text edits, wraps, duplicates, resizes, and survives export, import and playtest', async ({ page }, info) => {
  await open(page)
  await page.getByRole('button', { name: 'Wall text', exact: true }).click()
  await dragWorld(page, { x: 320, y: 700 }, { x: 720, y: 820 })
  await expect(page.getByRole('combobox', { name: 'Selected object' })).toHaveValue('text:0')
  const content = page.getByRole('textbox', { name: 'Wall text content' })
  await content.fill('Hold to charge.')
  await content.press('End'); await content.press('Enter'); await content.pressSequentially('Release to jump.')
  await page.getByRole('spinbutton', { name: 'Text font size' }).fill('32')
  await page.getByRole('combobox', { name: 'Text alignment' }).selectOption('center')
  await page.getByRole('button', { name: 'Duplicate', exact: true }).click()
  await page.getByRole('spinbutton', { name: 'Object x', exact: true }).fill('800')
  await page.getByRole('spinbutton', { name: 'Object w', exact: true }).fill('200')
  await page.getByRole('spinbutton', { name: 'Object h', exact: true }).fill('200')
  await page.getByRole('button', { name: 'Delete object' }).click()
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  const exported = await downloadLevel(page)
  expect(exported.level.texts).toEqual([
    { x: 320, y: 700, w: 400, h: 120, text: 'Hold to charge.\nRelease to jump.', fontSize: 32, align: 'center' },
    { x: 800, y: 700, w: 200, h: 200, text: 'Hold to charge.\nRelease to jump.', fontSize: 32, align: 'center' },
  ])
  await page.getByLabel('Import level file').setInputFiles(exported.path)
  const editor = page.getByRole('application', { name: 'Level canvas' })
  const readings = await editor.evaluate(canvas => canvas.wallTexts.map(t => t.text))
  expect(readings.slice(0, 2)).toEqual(['Hold to charge.', 'Release to jump.'])
  expect(readings.slice(2)).toEqual(['Hold to', 'charge.', 'Release to', 'jump.'])
  expect((await downloadLevel(page)).level.texts).toEqual(exported.level.texts)
  await page.screenshot({ path: info.outputPath('wall-text-builder.png') })
  await page.getByRole('button', { name: 'Playtest', exact: true }).click(); await page.clock.runFor(64)
  const game = page.getByRole('img', { name: 'Untitled level: activate the goal' })
  expect(await game.evaluate(canvas => canvas.wallTexts.map(t => t.text))).toEqual(readings)
  await page.screenshot({ path: info.outputPath('wall-text-play.png') })
})

test('wall timers can be placed, duplicated, edited, deleted, undone, exported and reimported', async ({ page }, info) => {
  await open(page)
  await page.getByRole('button', { name: 'Wall timer', exact: true }).click()
  await dragWorld(page, { x: 320, y: 780 }, { x: 320, y: 780 })
  await expect(page.getByRole('combobox', { name: 'Selected object' })).toHaveValue('timer:0')
  await page.getByRole('button', { name: 'Duplicate', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Selected object' })).toHaveValue('timer:1')
  await page.getByRole('spinbutton', { name: 'Object x', exact: true }).fill('640')
  await page.getByRole('spinbutton', { name: 'Object y', exact: true }).fill('240')
  await page.getByRole('button', { name: 'Delete object' }).click()
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  const exported = await downloadLevel(page)
  expect(exported.level.timers).toEqual([{ x: 320, y: 780 }, { x: 640, y: 680 }])
  await page.getByLabel('Import level file').setInputFiles(exported.path)
  const roundtrip = await downloadLevel(page)
  expect(roundtrip.level.timers).toEqual(exported.level.timers)
  await page.screenshot({ path: info.outputPath('wall-timers-in-builder.png') })
})

test('wall timers share the run clock, travel with the map, and allow the player to pass through', async ({ page }, info) => {
  const level = blankTrial(); level.width = 3200; level.spawn.x = 800; level.goal.x = 2800
  level.timers = [{ x: 920, y: 860 }, { x: 1180, y: 740 }]
  await open(page, level)
  await page.getByRole('button', { name: 'Playtest', exact: true }).click(); await page.clock.runFor(64)
  const canvas = page.getByRole('img', { name: 'Untitled level: activate the goal' })
  const readings = () => canvas.evaluate(el => el.wallTimers)
  const initial = await readings()
  expect(initial.map(timer => timer.text)).toEqual(['0:00.00', '0:00.00'])
  await expect(page.locator('.jumping-race')).toHaveCount(0)
  await page.keyboard.down('d'); await page.clock.runFor(1100); await page.keyboard.up('d')
  const moving = await readings()
  expect(moving).toHaveLength(2); expect(moving[0].text).toBe(moving[1].text); expect(moving[0].text).not.toBe('0:00.00')
  expect(moving[0].x).toBe(initial[0].x); expect(moving[0].screenX).toBeLessThan(initial[0].screenX - 80)
  expect((await page.evaluate(() => window.jumpPlayer)).x).toBeGreaterThan(1120)
  await page.screenshot({ path: info.outputPath('wall-timers-during-play.png') })
  await page.keyboard.press('Escape'); await page.clock.runFor(2000)
  expect((await readings()).map(timer => timer.text)).toEqual(moving.map(timer => timer.text))
  await page.getByRole('button', { name: 'Restart level', exact: true }).click(); await page.clock.runFor(160)
  expect((await readings()).map(timer => timer.text)).toEqual(['0:00.00', '0:00.00'])
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
  await page.getByRole('spinbutton', { name: 'Object w', exact: true }).fill('400')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await page.getByRole('combobox', { name: 'Selected object' }).selectOption('platform:0')
  await expect(page.getByRole('spinbutton', { name: 'Object w', exact: true })).toHaveValue('300')
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await page.getByRole('combobox', { name: 'Selected object' }).selectOption('platform:0')
  await expect(page.getByRole('spinbutton', { name: 'Object w', exact: true })).toHaveValue('400')
  const saved = await downloadLevel(page, 'Save level')
  await expect(page.getByRole('status', { name: 'Builder status' })).toContainText('Downloaded “Slope workshop.jump-level.json”')
  await page.clock.runFor(600)
  await page.screenshot({ path: info.outputPath('level-builder.png') })
  await page.getByRole('button', { name: 'Playtest', exact: false }).click()
  await page.clock.runFor(100)
  await expect(page.locator('canvas[aria-label="Slope workshop: activate the goal"]')).toBeFocused()
  await page.keyboard.down('d'); await page.clock.runFor(1100); await page.keyboard.up('d'); await page.clock.runFor(100)
  const p = await page.evaluate(() => window.jumpPlayer)
  expect(p.x).toBeGreaterThan(450); expect(p.y).toBeLessThan(900)
  await page.screenshot({ path: info.outputPath('custom-level-playtest.png') })
  await page.getByRole('button', { name: 'Return to builder' }).click()
  await expect(page.getByRole('textbox', { name: 'Level name' })).toHaveValue('Slope workshop')
  await expect(page.getByRole('spinbutton', { name: 'Object w', exact: true })).toHaveValue('400')
  // Let React's lazy-route scheduling run normally across the reload.
  await page.clock.resume(); await page.reload()
  await page.getByRole('button', { name: 'Level builder', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Level name' })).toHaveValue('Untitled level')
  await page.getByLabel('Import level file').setInputFiles(saved.path)
  await expect(page.getByRole('textbox', { name: 'Level name' })).toHaveValue('Slope workshop')
  expect(saved.level.platforms).toHaveLength(1)
  expect(errors).toEqual([])
})

test('terrain nodes and all four resize handles edit independently, with undo and export', async ({ page }, info) => {
  const level = { ...blankTrial(), width: 1000, height: 600, floor: 600, spawn: { x: 100, y: 600 }, goal: { x: 800, y: 600 } }
  await open(page, level)
  await expect(page.getByRole('button', { name: /^(Polygon|Rectangle)$/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Terrain', exact: true }).click()
  await dragWorld(page, { x: 300, y: 200 }, { x: 500, y: 320 })
  await page.getByRole('button', { name: 'Add node', exact: true }).click()
  await dragWorld(page, { x: 400, y: 200 }, { x: 400, y: 160 })
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
  const resized = (await downloadLevel(page)).level.platforms[0]
  expect(resized).toMatchObject({ x: 240, y: 120, w: 320, h: 260 })
  expect(resized.polygon.map(([x, y]) => [x / resized.w, y / resized.h])).toEqual([[0, .25], [.5, 0], [1, .25], [1, 1], [0, 1]])
  await page.screenshot({ path: info.outputPath('terrain-four-corner-handles.png') })
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await page.getByRole('combobox', { name: 'Selected object' }).selectOption('platform:0')
  await expect(page.getByRole('spinbutton', { name: 'Object w', exact: true })).toHaveValue('300')
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await page.getByRole('combobox', { name: 'Selected object' }).selectOption('platform:0')
  await dragWorld(page, { x: 240, y: 185 }, { x: 260, y: 200 })
  const saved = await downloadLevel(page), shaped = saved.level.platforms[0]
  expect(shaped).toMatchObject({ x: 240, y: 120, w: 320, h: 260 })
  expect(shaped.polygon[0]).toEqual([20, 80])
  expect(shaped.polygon.slice(1)).toEqual(resized.polygon.slice(1))
  await page.getByLabel('Import level file').setInputFiles(saved.path)
  expect((await downloadLevel(page)).level.platforms[0]).toEqual(shaped)
  await page.getByRole('combobox', { name: 'Selected object' }).selectOption('platform:0')
  await page.getByRole('button', { name: 'Delete object' }).click()
  await expect(page.getByRole('combobox', { name: 'Selected object' }).locator('option')).toHaveCount(3)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Selected object' }).locator('option')).toHaveCount(4)
})

test('exported levels import successfully and bad imports leave the current draft intact', async ({ page }) => {
  await open(page)
  await page.getByRole('textbox', { name: 'Level name' }).fill('Export me')
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export', exact: true }).click()])
  expect(download.suggestedFilename()).toBe('Export me.jump-level.json')
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: 'New level', exact: true }).click()
  await page.getByLabel('Import level file').setInputFiles(await download.path())
  await expect(page.getByRole('textbox', { name: 'Level name' })).toHaveValue('Export me')
  await expect(page.getByRole('status', { name: 'Builder status' })).toContainText('Opened')
  await page.getByLabel('Import level file').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{"version":1,"platforms":[]}') })
  await expect(page.getByRole('status', { name: 'Builder status' })).toContainText('Could not import')
  await expect(page.getByRole('textbox', { name: 'Level name' })).toHaveValue('Export me')
})

test('the Node tool previews and inserts at chosen edges, supports immediate dragging and repeated placement', async ({ page }, info) => {
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
  const inserted = (await downloadLevel(page)).level
  expect(inserted.platforms[0].polygon).toEqual([[0, 0], [300, 0], [300, 200], [120, 200], [0, 200]])
  await expect(page.getByRole('button', { name: 'Select', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  expect((await downloadLevel(page)).level.platforms[0].polygon).toBeUndefined()
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await page.getByRole('combobox', { name: 'Selected object' }).selectOption('platform:0')
  await page.getByRole('button', { name: 'Add node', exact: true }).click()
  await dragWorld(page, { x: 300, y: 300 }, { x: 260, y: 300 })
  const shaped = (await downloadLevel(page)).level.platforms[0]
  expect(shaped.x).toBe(260); expect(shaped.polygon.at(-1)).toEqual([0, 100])
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  expect((await downloadLevel(page)).level.platforms[0]).toEqual(inserted.platforms[0])
  await page.getByRole('checkbox', { name: 'Keep placing' }).check()
  await canvas.focus(); await page.keyboard.press('n')
  const box = await canvas.boundingBox(), camera = await canvas.evaluate(c => ({ a: c.jumpCamera.a, e: c.jumpCamera.e, f: c.jumpCamera.f, ratio: devicePixelRatio }))
  await page.mouse.move(box.x + (733 * camera.a + camera.e) / camera.ratio, box.y + (186.8 * camera.a + camera.f) / camera.ratio)
  await page.screenshot({ path: info.outputPath('node-edge-preview.png') })
  await dragWorld(page, { x: 733, y: 186.8 }, { x: 733, y: 186.8 })
  expect((await downloadLevel(page)).level.platforms[1].polygon).toEqual([[0, 80], [90, 44], [200, 0], [200, 180], [0, 180]])
  await expect(nodeTool).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('checkbox', { name: 'Snap 20' }).uncheck()
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await dragWorld(page, { x: 347, y: 200 }, { x: 347, y: 200 })
  const saved = await downloadLevel(page)
  expect(saved.level.platforms[0].polygon[1][0]).toBeCloseTo(47, 1)
  expect(saved.level.platforms[0].polygon[1][1]).toBe(0)
  await canvas.focus(); await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Select', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByLabel('Import level file').setInputFiles(saved.path)
  expect((await downloadLevel(page)).level.platforms).toEqual(saved.level.platforms)
})

test('saving a level to a file works when browser storage is unavailable', async ({ page }) => {
  await page.addInitScript(() => { Storage.prototype.setItem = Storage.prototype.getItem = () => { throw new Error('Storage unavailable') } })
  await open(page)
  const saved = await downloadLevel(page, 'Save level')
  expect(saved.level.name).toBe('Untitled level')
  await expect(page.getByRole('status', { name: 'Builder status' })).toContainText('Downloaded')
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Saved levels' })).toHaveCount(0)
})

test('builder controls and drawing area remain usable on a narrow screen', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 }); await open(page)
  await expect(page.getByRole('button', { name: 'Playtest' })).toBeInViewport()
  const box = await page.getByRole('application', { name: 'Level canvas' }).boundingBox()
  expect(box.width).toBeGreaterThan(200); expect(box.height).toBeGreaterThan(130)
  expect(await page.locator('.jumping-builder').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath('level-builder-mobile.png') })
})

test('author terrain, a free ladder and an anchored rope with portable export', async ({ page }, info) => {
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
  await page.getByRole('spinbutton', {name:'Object x', exact:true}).fill('640')
  await page.getByRole('button', {name:'Save level', exact:true}).click()
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export', exact: true }).click()])
  const { readFile } = await import('node:fs/promises')
  const exported = JSON.parse(await readFile(await download.path(), 'utf8'))
  expect(exported.platforms).toHaveLength(1); expect(exported.platforms[0].h).toBe(60)
  expect(exported.climbables.ropes[0].anchor.platform).toBe(0)
  expect(exported.climbables.ladders[0].platform).toBe(-1); expect(exported.climbables.ladders[0].x).toBe(640)
  await page.screenshot({ path: info.outputPath('simple-level-elements.png') })
  await page.getByRole('button', {name:'Playtest'}).click(); await page.clock.runFor(100)
  await expect(page.getByRole('img', { name: 'My rope course: activate the goal' })).toBeFocused()
  await page.getByRole('button', {name:'Return to builder'}).click()
  await page.getByLabel('Import level file').setInputFiles(await download.path())
  const saved = (await downloadLevel(page, 'Save level')).level
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
  const file = await downloadLevel(page, 'Save level'), saved = file.level
  const { points, bends } = saved.climbables.ropes[0].rest
  expect(points.flatMap((p, i) => i && bends[i - 1] ? [bends[i - 1], p] : [p])).toEqual(preview)
  await page.screenshot({ path: info.outputPath('rope-resolved-in-editor.png') })
  await page.getByRole('button', { name: 'Playtest' }).click(); await page.clock.runFor(100)
  const game = page.getByRole('img', { name: 'Rope layout: activate the goal' })
  expect(await game.evaluate(canvas => canvas.ropePath)).toEqual(preview)
  await page.keyboard.down('ArrowLeft'); await page.clock.runFor(32); await page.keyboard.up('ArrowLeft'); await page.clock.runFor(2000)
  const running = await game.evaluate(canvas => canvas.ropePath)
  expect(Math.max(...running.map((p, i) => Math.hypot(p[0] - preview[i][0], p[1] - preview[i][1])))).toBeLessThan(1)
  await restartFromPause(page); await page.clock.runFor(32)
  expect(await game.evaluate(canvas => canvas.ropePath)).toEqual(preview)
  await page.getByRole('button', { name: 'Return to builder' }).click()
  await page.getByRole('combobox', { name: 'Selected object' }).selectOption('platform:0')
  await page.getByRole('spinbutton', { name: 'Object x', exact: true }).fill('600')
  await page.clock.runFor(600)
  const edited = await editor.evaluate(canvas => canvas.ropePath)
  expect(edited).not.toEqual(preview)
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await page.clock.runFor(600)
  expect(await editor.evaluate(canvas => canvas.ropePath)).toEqual(preview)
  await page.clock.resume(); await page.reload()
  await page.getByRole('button', { name: 'Level builder', exact: true }).click()
  await page.getByLabel('Import level file').setInputFiles(file.path)
  await expect(page.getByRole('textbox', { name: 'Level name' })).toHaveValue('Rope layout')
  expect(await editor.evaluate(canvas => canvas.ropePath)).toEqual(preview)
})

for (const controller of [false,true]) test(`${controller ? 'controller' : 'keyboard'} Down transfers onto its rope, descends, swings away and drops`, async ({page},info) => {
  const level={version:1,id:'rappel-test',name:'Rappel test',width:1000,height:920,floor:920,spawn:{x:410,y:200},goal:{x:700,y:200},checkpoints:[],platforms:[{x:400,y:200,w:400,h:720}],climbables:{ladders:[],ropes:[{x:398,y:100,length:600,segments:28}]},props:[],robots:[],triggers:[],mechanisms:[],times:{gold:10,silver:20,bronze:40}}
  await page.addInitScript(({controller})=>{
    if(controller){window.testPad={index:0,id:'Rappel pad',connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))};Object.defineProperty(navigator,'getGamepads',{value:()=>[window.testPad]})}
  },{controller})
  await open(page, level);await page.getByRole('button',{name:'Playtest'}).click();await page.clock.runFor(100)
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
  await expect(page.getByRole('region', { name: 'How to play' })).toContainText('Press jump to leave a rope')
  await expect(page.getByRole('region', { name: 'How to play' })).toContainText(controller ? 'B / ○' : 'X')
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
  await open(page, level); await page.getByRole('button', { name: 'Playtest' }).click(); await page.clock.runFor(100)
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
    spawn: { x: 400, y: 600 }, goal: { x: 700, y: 200 }, checkpoints: [], platforms: [{ x: 400, y: 200, w: 400, h: 20 }],
    climbables: { ladders: [], ropes: [{ x: 400, y: anchorY, length: 330, segments: 24, anchor: { platform: 0, x: 0, y: anchorY - 200 } }] },
    props: [], robots: [], triggers: [], mechanisms: [], times: { gold: 10, silver: 20, bronze: 40 } }
  await page.addInitScript(({ controller }) => {
    if (controller) {
      window.testPad = { index: 0, id: 'Rope pad', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }
      Object.defineProperty(navigator, 'getGamepads', { value: () => [window.testPad] })
    }
  }, { controller })
  await open(page, level); await page.getByRole('button', { name: 'Playtest' }).click(); await page.clock.runFor(100)
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
  await page.getByRole('spinbutton', { name: 'Object x', exact: true }).fill('447')
  await page.getByRole('spinbutton', { name: 'Object x', exact: true }).blur()
  await expect(page.getByRole('spinbutton', { name: 'Object x', exact: true })).toHaveValue('440')
  await page.getByRole('checkbox', { name: 'Snap 20' }).uncheck()
  await page.getByRole('spinbutton', { name: 'Object x', exact: true }).fill('447')
  await page.getByRole('spinbutton', { name: 'Object x', exact: true }).blur()
  await expect(page.getByRole('spinbutton', { name: 'Object x', exact: true })).toHaveValue('447')
  await page.getByRole('checkbox', { name: 'Snap 20' }).check()
  await dragWorld(page, { x: 447, y: 220 }, { x: 466, y: 239 })
  await page.clock.runFor(600)
  const draft = (await downloadLevel(page)).level
  expect(draft.platforms[0].polygon[0].map((v, i) => v + (i ? draft.platforms[0].y : draft.platforms[0].x))).toEqual([460, 240])
  await page.screenshot({ path: info.outputPath('aligned-grid.png') })
})

test('height grows above the layout with a bottom-left origin, stable view, undo, export and playtest', async ({ page }, info) => {
  const level = { version: 1, id: 'height-test', name: 'Height test', width: 1000, height: 600, floor: 600,
    spawn: { x: 100, y: 600 }, goal: { x: 800, y: 600 }, checkpoints: [], platforms: [{ x: 300, y: 200, w: 200, h: 100 }],
    climbables: { ladders: [{ x: 284, top: 200, bottom: 600, platform: 0, side: 1 }], ropes: [{ x: 500, y: 200, length: 300, segments: 24, anchor: { platform: 0, x: 200, y: 0 } }] },
    props: [], robots: [], triggers: [], mechanisms: [], times: { gold: 10, silver: 20, bronze: 40 } }
  await open(page, level)
  const canvas = page.getByRole('application', { name: 'Level canvas' })
  const camera = () => canvas.evaluate(c => ({ a: c.jumpCamera.a, f: c.jumpCamera.f }))
  const originalView = await camera()
  await page.getByRole('spinbutton', { name: 'Level height', exact: true }).fill('1037')
  const tallerView = await camera()
  expect(tallerView.a).toBe(originalView.a)
  expect(1037 * tallerView.a + tallerView.f).toBeCloseTo(600 * originalView.a + originalView.f, 5)
  await page.getByRole('combobox', { name: 'Selected object' }).selectOption('platform:0')
  await expect(page.getByRole('spinbutton', { name: 'Object y', exact: true })).toHaveValue('400')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.getByRole('spinbutton', { name: 'Level height', exact: true })).toHaveValue('600')
  expect(await camera()).toEqual(originalView)
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  expect(await camera()).toEqual(tallerView)
  await page.getByRole('combobox', { name: 'Selected object' }).selectOption('spawn:0')
  await expect(page.getByRole('spinbutton', { name: 'Object y', exact: true })).toHaveValue('0')
  await page.getByRole('combobox', { name: 'Selected object' }).selectOption('rope:0')
  await expect(page.getByRole('spinbutton', { name: 'Object y', exact: true })).toHaveValue('400')
  await expect(page.getByRole('button', { name: 'Detach anchor', exact: true })).toBeVisible()
  await page.getByRole('combobox', { name: 'Selected object' }).selectOption('platform:0')
  await page.getByRole('spinbutton', { name: 'Object y', exact: true }).fill('440')
  await page.getByRole('spinbutton', { name: 'Object y', exact: true }).blur()
  await canvas.focus(); await page.keyboard.press('ArrowUp')
  await expect(page.getByRole('spinbutton', { name: 'Object y', exact: true })).toHaveValue('460')
  await dragWorld(page, { x: 400, y: 637 }, { x: 400, y: 637 })
  await expect(page.getByRole('status', { name: 'Cursor coordinates' })).toHaveText('400, 400')
  await page.getByRole('button', { name: 'Terrain', exact: true }).click()
  await dragWorld(page, { x: 600, y: 737 }, { x: 700, y: 837 })
  await expect(page.getByRole('spinbutton', { name: 'Object y', exact: true })).toHaveValue('300')
  await page.getByRole('button', { name: 'Save level', exact: true }).click()
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export', exact: true }).click()])
  const { readFile } = await import('node:fs/promises')
  const exported = JSON.parse(await readFile(await download.path(), 'utf8'))
  expect(exported.floor).toBe(1037)
  expect(exported.platforms.map(p => p.y)).toEqual([577, 737])
  expect(exported.climbables.ladders[0]).toMatchObject({ top: 577, bottom: 977, platform: 0 })
  expect(exported.climbables.ropes[0]).toMatchObject({ y: 577, anchor: { platform: 0, x: 200, y: 0 } })
  expect(exported.spawn.y).toBe(1037); expect(exported.goal.y).toBe(1037)
  await page.getByRole('button', { name: 'Fit level', exact: true }).click()
  await page.screenshot({ path: info.outputPath('height-added-at-top.png') })
  await page.getByRole('button', { name: 'Playtest' }).click(); await page.clock.runFor(100)
  expect((await page.evaluate(() => window.jumpPlayer)).y).toBeCloseTo(1037, 1)
  await page.getByRole('button', { name: 'Return to builder' }).click()
  await page.getByLabel('Import level file').setInputFiles(await download.path())
  await page.clock.runFor(600)
  await page.clock.resume(); await page.reload()
  await page.getByRole('button', { name: 'Level builder', exact: true }).click()
  await page.getByLabel('Import level file').setInputFiles(await download.path())
  await expect(page.getByRole('spinbutton', { name: 'Level height', exact: true })).toHaveValue('1037')
  await page.getByRole('combobox', { name: 'Selected object' }).selectOption('platform:0')
  await expect(page.getByRole('spinbutton', { name: 'Object y', exact: true })).toHaveValue('460')
})
