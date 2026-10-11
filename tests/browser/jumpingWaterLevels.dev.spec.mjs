import { readFileSync } from 'node:fs'
import { test, expect } from './helpers/folderTest.mjs'
import { useLevelFixtures, installTestFolder, selectBuilderObject, selectBuilderOption, saveTestLevel, reopenTestLevel, waitForBuilderPreview } from './helpers/jumpingLevels.mjs'

const fixture = () => JSON.parse(readFileSync(new URL('../fixtures/jumping/water-reservoir.json', import.meta.url), 'utf8'))

test('reservoir controls wire both directions, undo, duplicate, save and reopen', async ({ page }, info) => {
  const level = fixture()
  await useLevelFixtures(page, [level]); await installTestFolder(page, { 'reservoir.json': level })
  await page.goto('/untitled-jumping-game')
  await page.getByRole('button', { name: 'Level studio', exact: true }).click()
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  const local = page.getByRole('dialog').getByRole('button', { name: 'Local folder', exact: true })
  if (await local.count()) await local.click()
  await page.getByRole('button', { name: 'Choose folder', exact: true }).click()
  await page.getByRole('button', { name: 'Open reservoir.json', exact: true }).click()
  await waitForBuilderPreview(page); await selectBuilderObject(page, 'gravity-plate:0')
  const fill = page.getByRole('group', { name: 'Fill water', exact: true }), drain = page.getByRole('group', { name: 'Drain water', exact: true })
  await expect(fill.getByRole('checkbox', { name: 'Pressure plate 1', exact: true })).toBeChecked()
  await expect(drain.getByRole('checkbox', { name: 'Pressure plate 1', exact: true })).toBeChecked()
  await expect(drain.getByRole('checkbox', { name: 'Reversed', exact: true })).toBeChecked()
  const initial = page.getByRole('spinbutton', { name: 'Initial water level', exact: true })
  await initial.fill('40'); await initial.press('Enter')
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await selectBuilderObject(page, 'gravity-plate:0'); await expect(initial).toHaveValue('25')
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); await selectBuilderObject(page, 'gravity-plate:0'); await expect(initial).toHaveValue('40')
  const minimum = page.getByRole('spinbutton', { name: 'Low water mark', exact: true })
  await expect(minimum).toHaveValue('0')
  await minimum.fill('50'); await minimum.press('Enter')
  await expect(initial).toHaveValue('50')
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await selectBuilderObject(page, 'gravity-plate:0')
  await expect(minimum).toHaveValue('0'); await expect(initial).toHaveValue('40')
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); await selectBuilderObject(page, 'gravity-plate:0')
  await expect(minimum).toHaveValue('50'); await expect(initial).toHaveValue('50')
  await initial.fill('20'); await initial.press('Enter'); await expect(initial).toHaveValue('50')
  await minimum.fill('15'); await minimum.press('Enter')
  await initial.fill('40'); await initial.press('Enter')
  await selectBuilderOption(page, 'Fill switch logic', 'xor')
  await drain.getByRole('checkbox', { name: 'Pressure plate 1', exact: true }).uncheck()
  await selectBuilderObject(page, 'trigger:0')
  const outgoing = page.getByRole('group', { name: 'Activates', exact: true })
  await expect(outgoing.getByRole('checkbox', { name: 'Water 1 · Fill', exact: true })).toBeChecked()
  await expect(outgoing.getByRole('checkbox', { name: 'Water 1 · Drain', exact: true })).not.toBeChecked()
  await outgoing.getByRole('checkbox', { name: 'Water 1 · Drain', exact: true }).check()
  await selectBuilderObject(page, 'gravity-plate:0')
  await expect(drain.getByRole('checkbox', { name: 'Pressure plate 1', exact: true })).toBeChecked()
  await page.getByRole('button', { name: 'Duplicate', exact: true }).click()
  const saved = await saveTestLevel(page)
  expect(saved.level.gravityPlates).toHaveLength(2)
  expect(saved.level.gravityPlates.every(p => p.waterLevel === 40 && p.waterMinLevel === 15 && p.fill.switchLogic === 'xor' && p.drain.switchReversed)).toBe(true)
  expect(saved.level.triggers[0].targets).toEqual(['pool:fill', 'pool:drain'])
  await reopenTestLevel(page, saved); await selectBuilderObject(page, 'gravity-plate:0')
  await expect(initial).toHaveValue('40')
  await expect(minimum).toHaveValue('15')
  await expect(page.getByRole('combobox', { name: 'Fill switch logic', exact: true })).toHaveText('XOR')
  await minimum.scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath('reservoir-low-water-mark.png') })
  await fill.scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath('reservoir-inspector.png') })
})

test('keyboard toggle fills and drains the real game, and pause stops the waterline', async ({ page }, info) => {
  const level = fixture(); level.gravityPlates[0].waterMinLevel = 12.5
  await useLevelFixtures(page, [level])
  await page.addInitScript(() => {
    const draw = CanvasRenderingContext2D.prototype.fillRect, move = CanvasRenderingContext2D.prototype.moveTo
    CanvasRenderingContext2D.prototype.fillRect = function (...args) {
      if (this.fillStyle === '#58a9df' && args[0] === 400) window.reservoirWaterline = args[1]
      return draw.apply(this, args)
    }
    CanvasRenderingContext2D.prototype.moveTo = function (...args) {
      if (this.fillStyle === '#58a9df' && args[0] === 400) window.reservoirWaterline = args[1]
      return move.apply(this, args)
    }
  })
  await page.clock.install()
  await page.goto('/untitled-jumping-game?motionDebug=1')
  await page.getByRole('button', { name: 'Play Water reservoir test', exact: true }).click()
  await expect(page.getByRole('img', { name: 'Water reservoir test: reach the exit', exact: true })).toBeFocused()
  await page.clock.runFor(150)
  await page.keyboard.down('d'); await page.clock.runFor(400); await page.keyboard.up('d')
  await page.clock.runFor(2500)
  const filled = await page.evaluate(() => window.reservoirWaterline)
  expect(filled, JSON.stringify(await page.evaluate(() => ({ motion: window.jumpingMotion?.read().recent.at(-1), focused: document.activeElement?.tagName })))).toBeLessThan(650)
  await page.keyboard.press('Escape')
  const paused = await page.evaluate(() => window.reservoirWaterline)
  await page.clock.runFor(2000)
  expect(await page.evaluate(() => window.reservoirWaterline)).toBe(paused)
  await page.getByRole('button', { name: /^Resume/ }).click()
  await page.keyboard.down('a'); await page.clock.runFor(500); await page.keyboard.up('a'); await page.clock.runFor(300)
  await page.keyboard.down('d'); await page.clock.runFor(450); await page.keyboard.up('d')
  await page.clock.runFor(2500)
  expect(await page.evaluate(() => window.reservoirWaterline)).toBeGreaterThan(filled)
  await page.clock.runFor(4000)
  const lowMark = await page.evaluate(() => window.reservoirWaterline)
  expect(lowMark).toBeCloseTo(845, 1)
  await page.clock.runFor(1500)
  expect(await page.evaluate(() => window.reservoirWaterline)).toBeCloseTo(lowMark, 1)
  await page.locator('.jumping-game > canvas').screenshot({ path: info.outputPath('reservoir-keyboard-draining.png') })
})

test('terrain stays opaque inside water and floats meet a submerged roof as the level rises', async ({ page }, info) => {
  await page.goto('/tests/fixtures/jumping/water-reservoir.json')
  const result = await page.evaluate(async () => {
    const { parseLevel } = await import('/src/games/jumping/level.ts')
    const { createRun, stepRun } = await import('/src/games/jumping/challenge.ts')
    const { drawPuzzleWorld } = await import('/src/games/jumping/challengeRender.ts')
    const { STEP, NEUTRAL_INPUT } = await import('/src/games/jumping/model.ts')
    const source = await (await fetch('/tests/fixtures/jumping/water-reservoir.json')).json()
    source.gravityPlates[0].drain = {}; source.triggers[0].targets = ['pool:fill']; source.spawn = { x: 1000, y: 920 }
    const run = createRun(parseLevel(source)); run.started = true; run.triggers[0].active = true
    const canvas = document.createElement('canvas'); canvas.id = 'reservoir-review'; canvas.width = 1200; canvas.height = 1500
    document.body.replaceChildren(canvas); const ctx = canvas.getContext('2d'), frames = []
    for (let stage = 0; stage < 3; stage++) {
      if (stage) for (let i = 0; i < 240; i++) stepRun(run, NEUTRAL_INPUT, STEP)
      ctx.save(); ctx.beginPath(); ctx.rect(0, stage * 500, 1200, 500); ctx.clip()
      ctx.fillStyle = '#f0efe8'; ctx.fillRect(0, stage * 500, 1200, 500)
      ctx.translate(-200, stage * 500 - 180); ctx.scale(.7, .7); drawPuzzleWorld(ctx, run); ctx.restore()
      ctx.fillStyle = '#43494b'; ctx.font = '16px sans-serif'; ctx.fillText(`Water level ${Math.round(run.water.pools[0].level)}%`, 15, stage * 500 + 25)
      frames.push({ level: run.water.pools[0].level, y: run.props[1].y, playerY: run.player.y })
    }
    const pixel = (x, y) => [...ctx.getImageData(Math.round(x * .7 - 200), Math.round(2 * 500 + y * .7 - 180), 1, 1).data]
    return { frames, solid: pixel(870, 800), water: pixel(1000, 800), boxY: run.props[1].y }
  })
  expect(result.frames.at(-1).level).toBeGreaterThan(99)
  expect(result.solid[2]).toBeLessThan(result.water[2])
  expect(result.boxY).toBeGreaterThanOrEqual(649)
  await page.locator('#reservoir-review').screenshot({ path: info.outputPath('water-terrain-fill.png') })
  await info.attach('reservoir-frames', { body: JSON.stringify(result, null, 2), contentType: 'application/json' })
})
