import { test, expect } from './helpers/test.mjs'
import { blankTrial, levelProblems } from '../../src/games/jumping/level.ts'
import { wallTerminals } from '../../src/games/jumping/wallWiring.ts'
import { installBuiltInFixtures, useLevelFixtures, waitForBuilderPreview, selectBuilderObject, saveTestLevel, reopenTestLevel, openBuilderSection } from './helpers/jumpingLevels.mjs'

test('wall jacks support dragging, exact coordinates, nudging, undo, automatic reset and save/reopen', async ({ page }, info) => {
  test.setTimeout(60000)
  await page.setViewportSize({ width: 1440, height: 900 })
  const level = { ...blankTrial(), version: 2, name: 'Wall terminal review', width: 1400, height: 800, floor: 800,
    entrance: { x: 140, y: 800 },
    goal: { x: 1100, y: 800, flipX: true, id: 'exit', power: 'switched' },
    lighting: { nightMode: true, ambient: 0, lights: [] },
    wallLights: [{ id: 'lamp', x: 750, y: 580 }],
    triggers: [{ x: 300, y: 800, w: 100, mode: 'weight', behavior: 'switch', targets: ['exit', 'lamp'], showWires: true, wireHeight: 140 }] }
  await useLevelFixtures(page, [level]); await installBuiltInFixtures(page, { 'wires.json': level })
  await page.addInitScript(() => {
    const translate = CanvasRenderingContext2D.prototype.translate
    CanvasRenderingContext2D.prototype.translate = function (...args) {
      const result = translate.apply(this, args)
      if (this.canvas.getAttribute('aria-label') === 'Level canvas') this.canvas.testCamera = this.getTransform()
      return result
    }
  })
  await page.goto('/lab')
  await page.getByRole('button', { name: 'Level studio', exact: true }).click()
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: 'Open wires.json', exact: true }).click()
  await waitForBuilderPreview(page)
  const canvas = page.getByRole('application', { name: 'Level canvas' })
  const toScreen = async ({ x, y }) => {
    const bounds = await canvas.boundingBox()
    const camera = await canvas.evaluate(c => ({ a: c.testCamera.a, e: c.testCamera.e, d: c.testCamera.d, f: c.testCamera.f, ratio: c.width / c.clientWidth }))
    return { x: bounds.x + (x * camera.a + camera.e) / camera.ratio, y: bounds.y + (y * camera.d + camera.f) / camera.ratio }
  }
  const drag = async (from, to, alt = false) => {
    const start = await toScreen(from), end = await toScreen(to)
    if (alt) await page.keyboard.down('Alt')
    await page.mouse.move(start.x, start.y); await page.mouse.down()
    await page.mouse.move(end.x, end.y, { steps: 12 }); await page.mouse.up()
    if (alt) await page.keyboard.up('Alt')
    await waitForBuilderPreview(page)
  }
  const terminal = wallTerminals(level).find(point => point.owner.kind === 'goal')
  await drag(terminal, { x: 902, y: 502 })
  const x = page.getByRole('spinbutton', { name: 'Wire terminal X', exact: true })
  const y = page.getByRole('spinbutton', { name: 'Wire terminal Y', exact: true })
  const reset = page.getByRole('button', { name: 'Reset terminal position', exact: true })
  await expect(x).toHaveValue('900'); await expect(y).toHaveValue('300')
  await page.keyboard.press('Shift+ArrowRight')
  await expect(x).toHaveValue('901')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await selectBuilderObject(page, 'goal:0'); await openBuilderSection(page, 'Wall wiring'); await expect(x).toHaveValue('900')
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await selectBuilderObject(page, 'goal:0'); await openBuilderSection(page, 'Wall wiring'); await expect(x).toHaveValue('901')
  await x.fill('912'); await x.press('Tab')
  await y.fill('260'); await y.press('Tab')
  await reset.click(); await expect(reset).toBeDisabled()
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await selectBuilderObject(page, 'goal:0')
  await openBuilderSection(page, 'Wall wiring')
  await expect(x).toHaveValue('912'); await expect(y).toHaveValue('260')
  const source = wallTerminals(level).find(point => point.owner.kind === 'trigger')
  await drag(source, { x: 412, y: 682 }, true)
  const saved = await saveTestLevel(page)
  expect(saved.level.goal).toMatchObject({ x: 1100, y: 800, wireTerminal: { x: 912, y: 540 } })
  expect(saved.level.triggers[0].x).toBe(300)
  expect(saved.level.triggers[0].wireTerminal.x).toBeCloseTo(412, 0)
  expect(saved.level.triggers[0].wireTerminal.y).toBeCloseTo(682, 0)
  expect(levelProblems(saved.level)).toEqual([])
  await page.reload(); await reopenTestLevel(page, saved)
  await selectBuilderObject(page, 'goal:0')
  await openBuilderSection(page, 'Wall wiring')
  await expect(x).toHaveValue('912'); await expect(y).toHaveValue('260')
  // Deleting a focused jack resets its position without deleting its owner.
  const point = await toScreen({ x: 912, y: 540 })
  await page.mouse.click(point.x, point.y); await page.keyboard.press('Delete')
  await expect(reset).toBeDisabled()
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await selectBuilderObject(page, 'goal:0'); await openBuilderSection(page, 'Wall wiring'); await expect(x).toHaveValue('912')
  await reset.scrollIntoViewIfNeeded()
  await page.screenshot({ path: info.outputPath('wire-terminal-editor.png') })
})
