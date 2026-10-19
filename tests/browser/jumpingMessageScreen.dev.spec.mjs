import { test, expect } from './helpers/test.mjs'
import { blankTrial, levelProblems } from '../../src/games/jumping/level.ts'
import { installBuiltInFixtures, useLevelFixtures, waitForBuilderPreview, selectBuilderObject, selectBuilderOption, saveTestLevel, reopenTestLevel } from './helpers/jumpingLevels.mjs'

for (const backend of ['canvas', 'gpu']) test(`${backend}: message lettering stays readable in darkness without lighting the wall or leaking through terrain`, async ({ page }, info) => {
  await page.goto('/tests/fixtures/jumping/lighting-prototype.json')
  const result = await page.evaluate(async backend => {
    const { lightingHarness } = await import('/tests/browser/helpers/lightingHarness.mjs')
    const h = await lightingHarness({ backend })
    const screen = { x: 400, y: 180, w: 320, h: 100, text: 'OPERATOR CONNECTION\nNO RESPONSE', fontSize: 18, align: 'left', style: 'terminal' }
    h.run.level = { ...h.run.level, platforms: [], texts: [screen], timers: [], triggers: [], climbables: { ropes: [], ladders: [] } }
    h.run.terrain = []; h.run.props = []; h.run.robots = []; h.run.mechanisms = []; h.run.pickups = []; h.run.triggers = []
    const baseline = await lightingHarness({ backend })
    Object.assign(baseline.run, h.run, { level: { ...h.run.level, texts: [] } })
    const empty = baseline.render(0)
    baseline.renderer.dispose()
    const dark = h.render(0), full = h.fullBright()
    const lamp = { id: 'lamp', x: 100, y: 230, direction: 0, spread: 120, intensity: 100, power: 'always' }
    const lit = h.render(0, [lamp])
    let glyphs = 0, maxDarkError = 0, maxLitError = 0
    for (let y = 190; y < 260; y++) for (let x = 410; x < 710; x++) {
      const rgb = h.pixel(full, x, y)
      if (!rgb.every((c, i) => c === [169, 239, 130][i])) continue
      glyphs++
      h.pixel(dark, x, y).forEach((c, i) => { maxDarkError = Math.max(maxDarkError, Math.abs(c - rgb[i] * .65)) })
      h.pixel(lit, x, y).forEach((c, i) => { maxLitError = Math.max(maxLitError, Math.abs(c - rgb[i])) })
    }
    // A screen cannot brighten the room or acquire a full-bright housing.
    const frame = h.pixel(dark, 401, 181), brightFrame = h.pixel(full, 401, 181)
    let wallDifference = 0
    const wallSamples = []
    for (let y = 160; y < 300; y++) for (let x = 380; x < 740; x++) {
      if (x >= 400 && x < 720 && y >= 180 && y < 280) continue
      const a = h.pixel(dark, x, y), b = h.pixel(empty, x, y)
      const difference = Math.max(...a.map((c, i) => Math.abs(c - b[i])))
      if (difference > wallDifference) { wallDifference = difference; wallSamples.push({ x, y, a, b }) }
    }
    const block = { x: 400, y: 180, w: 320, h: 100 }
    h.run.level = { ...h.run.level, platforms: [block], texts: [screen] }; h.run.terrain = [block]
    const covered = h.render(0)
    h.run.level = { ...h.run.level, texts: [] }
    const plainBlock = h.render(0)
    const occlusionDifference = h.difference(covered, plainBlock)
    h.canvas.getContext('2d').putImageData(new ImageData(dark.pixels, 1280, 720), 0, 0)
    document.body.replaceChildren(h.canvas); h.renderer.dispose()
    return { glyphs, maxDarkError, maxLitError, frame, brightFrame, wallDifference, wallSamples, occlusionDifference, backend: lit.stats.backend }
  }, backend)
  expect(result.backend).toBe(backend)
  expect(result.glyphs).toBeGreaterThan(50)
  expect(result.maxDarkError).toBeLessThanOrEqual(2)
  expect(result.maxLitError).toBeLessThanOrEqual(2)
  result.frame.forEach((c, i) => expect(Math.abs(c - result.brightFrame[i] * .35)).toBeLessThanOrEqual(2))
  expect(result.wallDifference, JSON.stringify(result)).toBe(0)
  expect(result.occlusionDifference, JSON.stringify(result)).toBe(0)
  await page.locator('canvas').screenshot({ path: info.outputPath(`${backend}-message-screen.png`) })
})

test('message screens can be placed, edited, duplicated, undone, saved and reopened', async ({ page }, info) => {
  test.setTimeout(60000)
  const level = { ...blankTrial(), version: 2, name: 'Terminal review', lighting: { nightMode: true, ambient: 0, lights: [] } }
  await useLevelFixtures(page, [level]); await installBuiltInFixtures(page, { 'terminal.json': level })
  await page.goto('/lab')
  await page.getByRole('button', { name: 'Level studio', exact: true }).click()
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: 'Open terminal.json', exact: true }).click()
  await waitForBuilderPreview(page)
  await page.getByRole('button', { name: 'Message screen', exact: true }).click()
  const canvas = page.getByRole('application', { name: 'Level canvas' }), bounds = await canvas.boundingBox()
  await page.mouse.click(bounds.x + bounds.width * .4, bounds.y + bounds.height * .4)
  const content = page.getByRole('textbox', { name: 'Wall text content', exact: true })
  await expect(content).toHaveValue('NO SIGNAL')
  await content.fill('LOCAL POWER\nRESTORED')
  const font = page.getByRole('spinbutton', { name: 'Text font size', exact: true })
  await font.fill('24'); await font.press('Tab')
  await selectBuilderOption(page, 'Text alignment', 'center')
  const rotation = page.getByRole('spinbutton', { name: 'Text rotation', exact: true })
  await rotation.fill('-5'); await rotation.press('Tab')
  await page.getByRole('button', { name: 'Duplicate', exact: true }).last().click()
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await selectBuilderObject(page, 'text:0')
  await expect(content).toHaveValue('LOCAL POWER\nRESTORED')
  await expect(page.getByRole('combobox', { name: 'Text style', exact: true })).toHaveText('Message screen')
  const saved = await saveTestLevel(page)
  expect(saved.level.texts).toHaveLength(1)
  expect(saved.level.texts[0]).toMatchObject({ style: 'terminal', text: 'LOCAL POWER\nRESTORED', fontSize: 24, align: 'center', rotation: -5 })
  expect(levelProblems(saved.level)).toEqual([])
  await page.reload(); await reopenTestLevel(page, saved)
  await selectBuilderObject(page, 'text:0')
  await expect(content).toHaveValue('LOCAL POWER\nRESTORED')
  await expect(rotation).toHaveValue('-5')
  await page.screenshot({ path: info.outputPath('message-screen-editor.png') })
})
