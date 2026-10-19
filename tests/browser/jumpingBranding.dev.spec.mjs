import { test, expect } from './helpers/test.mjs'
import { blankTrial, levelProblems } from '../../src/games/jumping/level.ts'
import { LAB_WORDMARK_PATH, LAB_SUBTITLE_PATH } from '../../src/branding/lab.ts'
import { installBuiltInFixtures, useLevelFixtures, waitForBuilderPreview, selectBuilderObject, saveTestLevel, reopenTestLevel } from './helpers/jumpingLevels.mjs'

for (const viewport of [{ width: 1280, height: 800 }, { width: 360, height: 640 }, { width: 620, height: 360 }]) {
  test(`L.A.B. menu branding fits and aligns at ${viewport.width}×${viewport.height}`, async ({ page }, info) => {
    await page.setViewportSize(viewport)
    await page.goto('/')
    const card = page.getByRole('button', { name: 'L.A.B. Experiments', exact: true })
    await expect(card.locator('.lab-logo')).toBeVisible()
    await card.click()
    await expect(page.getByRole('dialog', { name: 'L.A.B. Experiments', exact: true })).toBeVisible()
    await expect(page).toHaveTitle('L.A.B. Experiments | Dream Large Arcade')
    const logo = page.locator('.jumping-menu-heading .lab-logo')
    await expect(logo).toBeVisible()
    const bounds = await logo.evaluate(svg => {
      const main = svg.querySelector('.lab-wordmark').getBBox(), sub = svg.querySelector('.lab-subtitle').getBBox()
      return { mainX: main.x, mainW: main.width, subX: sub.x, subW: sub.width, subH: sub.height, mainH: main.height }
    })
    expect(bounds.subX).toBeCloseTo(bounds.mainX, 4)
    expect(bounds.subW).toBeCloseTo(bounds.mainW, 4)
    expect(bounds.subH).toBeLessThan(bounds.mainH / 4)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath('lab-menu.png') })
  })
}

test('plain and branded crates plus wall stamps edit, undo, save, reopen and render in play', async ({ page }, info) => {
  const level = { ...blankTrial(), name: 'Branding review', width: 1200, height: 800, floor: 800,
    entrance: { x: 120, y: 800 }, goal: { x: 1000, y: 800 } }
  await useLevelFixtures(page, [level])
  await installBuiltInFixtures(page, { 'branding.json': level })
  await page.addInitScript(({ main, sub }) => {
    const NativePath = window.Path2D, paths = new WeakMap()
    window.Path2D = new Proxy(NativePath, { construct(target, args) {
      const path = Reflect.construct(target, args)
      if (args[0] === main || args[0] === sub) paths.set(path, args[0] === main ? 'main' : 'subtitle')
      return path
    } })
    window.labMarks = []
    const proto = CanvasRenderingContext2D.prototype, rect = proto.fillRect, fill = proto.fill
    proto.fillRect = function (...args) {
      if (args[0] === 0 && args[1] === 0 && this.fillStyle === '#f1f1ed') this.canvas.labCamera = this.getTransform()
      return rect.apply(this, args)
    }
    proto.fill = function (...args) {
      const part = paths.get(args[0])
      if (part) {
        window.labMarks.push({ part, ink: this.fillStyle })
        if (window.labMarks.length > 1000) window.labMarks.splice(0, 500)
      }
      return fill.apply(this, args)
    }
  }, { main: LAB_WORDMARK_PATH, sub: LAB_SUBTITLE_PATH })
  await page.goto('/lab')
  await page.getByRole('button', { name: 'Level studio', exact: true }).click()
  await waitForBuilderPreview(page)
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: 'Open branding.json', exact: true }).click()
  await waitForBuilderPreview(page)
  const place = async (tool, x, y) => {
    await page.getByRole('button', { name: tool, exact: true }).click()
    const canvas = page.getByRole('application', { name: 'Level canvas' })
    const bounds = await canvas.boundingBox()
    const camera = await canvas.evaluate(c => ({ a: c.labCamera.a, e: c.labCamera.e, d: c.labCamera.d, f: c.labCamera.f, ratio: devicePixelRatio }))
    await page.mouse.click(bounds.x + (x * camera.a + camera.e) / camera.ratio, bounds.y + (y * camera.d + camera.f) / camera.ratio)
  }
  await place('L.A.B. crate', 480, 760)
  const branding = page.getByRole('checkbox', { name: 'L.A.B. branding', exact: true })
  await expect(branding).toBeChecked()
  await branding.uncheck()
  await expect(branding).not.toBeChecked()
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await selectBuilderObject(page, 'prop:0')
  await expect(branding).toBeChecked()
  await place('Box', 800, 760)
  await expect(branding).not.toBeChecked()
  await place('L.A.B. wall stamp', 140, 450)
  await expect(page.getByRole('textbox', { name: 'Wall text content' })).toHaveCount(0)
  const rotation = page.getByRole('spinbutton', { name: 'Text rotation', exact: true })
  await rotation.fill('-10'); await rotation.press('Tab')
  const width = page.getByRole('spinbutton', { name: 'Object w', exact: true })
  await width.fill('300'); await width.press('Tab')
  const saved = await saveTestLevel(page)
  expect(saved.level.props.map(p => !!p.branded)).toEqual([true, false])
  expect(saved.level.texts[0]).toMatchObject({ style: 'lab-stamp', rotation: -10, w: 300 })
  expect(levelProblems(saved.level)).toEqual([])
  await reopenTestLevel(page, saved)
  await selectBuilderObject(page, 'prop:0'); await expect(branding).toBeChecked()
  await selectBuilderObject(page, 'prop:1'); await expect(branding).not.toBeChecked()
  await selectBuilderObject(page, 'text:0'); await expect(rotation).toHaveValue('-10')
  await page.screenshot({ path: info.outputPath('lab-editor.png') })
  await page.evaluate(() => { window.labMarks = [] })
  await page.getByRole('button', { name: 'Save and Test', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Return to builder', exact: true })).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.labMarks.some(mark => mark.part === 'main' && mark.ink === '#625746'))).toBe(true)
  await expect.poll(() => page.evaluate(() => window.labMarks.some(mark => mark.part === 'subtitle' && mark.ink === '#94433f'))).toBe(true)
  await page.screenshot({ path: info.outputPath('lab-gameplay.png') })
})
