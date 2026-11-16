import { test, expect } from './helpers/test.mjs'
import { blankTrial, levelProblems } from '../../src/games/jumping/level.ts'
import { installBuiltInFixtures, useLevelFixtures, waitForBuilderPreview, selectBuilderObject, selectBuilderOption, saveTestLevel } from './helpers/jumpingLevels.mjs'

test('pipes, hazard stripes and edge marking are laid, reshaped and restyled in the studio', async ({ page }, info) => {
  test.setTimeout(90000)
  await page.setViewportSize({ width: 1440, height: 900 })
  const level = { ...blankTrial(), name: 'Plumbing', width: 1400, height: 800, floor: 800,
    entrance: { x: 140, y: 800 }, goal: { x: 1240, y: 800, flipX: true },
    platforms: [{ x: 500, y: 640, w: 600, h: 160 }] }
  await useLevelFixtures(page, [level]); await installBuiltInFixtures(page, { 'plumbing.json': level })
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
  await page.getByRole('button', { name: 'Open plumbing.json', exact: true }).click()
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

  // Terrain: a dock edge, marked.
  await selectBuilderObject(page, 'platform:0')
  await selectBuilderOption(page, 'Edge marking', 'hazard')

  // A pipe drawn on the slant turns a corner; its size and route are then changed by hand.
  await page.getByRole('button', { name: 'Pipe', exact: true }).click()
  await drag({ x: 100, y: 200 }, { x: 700, y: 400 })
  await expect(page.getByRole('combobox', { name: 'Selected object', exact: true })).toHaveText('Pipe 1')
  await selectBuilderOption(page, 'Pipe size', 'large')
  await drag({ x: 700, y: 200 }, { x: 760, y: 140 })
  await page.getByRole('button', { name: 'Add node', exact: true }).click()
  await click({ x: 400, y: 200 })

  // A painted band on the wall, leaning the other way.
  await page.getByRole('button', { name: 'Hazard stripes', exact: true }).click()
  await click({ x: 1100, y: 300 })
  await selectBuilderOption(page, 'Hazard stripe lean', 'left')
  await canvas.screenshot({ path: info.outputPath('pipes-and-stripes.png') })

  const saved = await saveTestLevel(page)
  expect(saved.level.platforms[0].trim).toBe('hazard')
  expect(saved.level.pipes).toHaveLength(1)
  expect(saved.level.pipes[0].size).toBe('large')
  // The bend added at x 400 lands on the first length, which runs on the slant once its corner was dragged up.
  expect(saved.level.pipes[0].points).toEqual([[100, 200], [400, 175], [760, 140], [700, 400]])
  expect(saved.level.stripes).toEqual([{ x: 1020, y: 288, w: 160, h: 24, lean: 'left' }])
  expect(levelProblems(saved.level)).toEqual([])
})
