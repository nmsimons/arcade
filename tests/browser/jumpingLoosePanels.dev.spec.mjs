import { test, expect } from './helpers/test.mjs'
import { blankTrial, levelProblems } from '../../src/games/jumping/level.ts'
import { installBuiltInFixtures, useLevelFixtures, waitForBuilderPreview, selectBuilderOption, saveTestLevel } from './helpers/jumpingLevels.mjs'

// Loose panels in the studio (docs/jumping-wall-wear.md): loosen one, choose its bolt, what is behind it and a
// leak, move it across a joint and by a panel with the keyboard, change the finish under it, set the room's
// stains, and save.
test('a loose panel is placed, restyled, moved panel by panel and saved with the room\'s stains', async ({ page }, info) => {
  test.setTimeout(90000)
  await page.setViewportSize({ width: 1440, height: 900 })
  const level = { ...blankTrial(), name: 'Service void', width: 1400, height: 800, floor: 800,
    entrance: { x: 140, y: 800 }, goal: { x: 1240, y: 800, flipX: true } }
  await useLevelFixtures(page, [level]); await installBuiltInFixtures(page, { 'void.json': level })
  await page.addInitScript(() => {
    const translate = CanvasRenderingContext2D.prototype.translate
    CanvasRenderingContext2D.prototype.translate = function (...args) {
      const result = translate.apply(this, args)
      if (this.canvas.getAttribute('aria-label') === 'Level canvas') this.canvas.testCamera = this.getTransform()
      return result
    }
  })
  await page.goto('/lab/library')
  await page.getByRole('button', { name: 'Level studio', exact: true }).click()
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: 'Open void.json', exact: true }).click()
  await waitForBuilderPreview(page)
  const canvas = page.getByRole('application', { name: 'Level canvas' })
  const toScreen = async ({ x, y }) => {
    const bounds = await canvas.boundingBox()
    const camera = await canvas.evaluate(c => ({ a: c.testCamera.a, e: c.testCamera.e, d: c.testCamera.d, f: c.testCamera.f, ratio: c.width / c.clientWidth }))
    return { x: bounds.x + (x * camera.a + camera.e) / camera.ratio, y: bounds.y + (y * camera.d + camera.f) / camera.ratio }
  }
  const drag = async (from, to) => {
    const start = await toScreen(from), end = await toScreen(to)
    await page.mouse.move(start.x, start.y); await page.mouse.down()
    await page.mouse.move(end.x, end.y, { steps: 12 }); await page.mouse.up()
    await waitForBuilderPreview(page)
  }
  const click = async point => { const p = await toScreen(point); await page.mouse.click(p.x, p.y); await waitForBuilderPreview(page) }
  const selected = page.getByRole('combobox', { name: 'Selected object', exact: true })

  // The course wall's second row is shifted half a panel: its panels run 540 to 900 and 900 to 1260, 240 to 480.
  await page.getByRole('button', { name: 'Loose panel', exact: true }).click()
  await click({ x: 700, y: 350 })
  await expect(selected).toHaveText('Loose panel 1')
  await selectBuilderOption(page, 'Loose panel bolt', 'right')
  await selectBuilderOption(page, 'Loose panel contents', 'electrical')
  await page.getByRole('checkbox', { name: 'Leak', exact: true }).check()
  await canvas.screenshot({ path: info.outputPath('loose-panel.png') })

  // Dragged across the joint, it moves to the next panel; the left arrow moves it back by a whole panel.
  await drag({ x: 700, y: 350 }, { x: 1060, y: 350 })
  let saved = await saveTestLevel(page)
  expect(saved.level.loosePanels).toEqual([{ x: 1080, y: 360, hang: 'right', contents: 'electrical', leak: true }])
  await canvas.press('ArrowLeft'); await waitForBuilderPreview(page)

  // A change of finish keeps it on the panel under its point; the room's stains sit around it.
  await page.getByRole('tab', { name: 'Level', exact: true }).click()
  await selectBuilderOption(page, 'Wall finish', 'tile')
  await selectBuilderOption(page, 'Stains', 'light')
  await canvas.screenshot({ path: info.outputPath('loose-panel-tiled.png') })
  saved = await saveTestLevel(page)
  expect(saved.level.loosePanels).toEqual([{ x: 720, y: 360, hang: 'right', contents: 'electrical', leak: true }])
  expect(saved.level.wallFinish).toBe('tile')
  expect(saved.level.stains).toBe('light')
  expect(levelProblems(saved.level)).toEqual([])
})
