import { readFileSync } from 'node:fs'
import { test, expect } from './helpers/folderTest.mjs'
import { useLevelFixtures, installTestFolder, selectBuilderObject, selectBuilderOption, saveTestLevel, reopenTestLevel, waitForBuilderPreview } from './helpers/jumpingLevels.mjs'

const fixture = () => JSON.parse(readFileSync(new URL('../fixtures/jumping/water-reservoir.json', import.meta.url), 'utf8'))

test('ball and box weights update their appearance, undo, duplicate, save and reopen', async ({ page }, info) => {
  const level = fixture()
  await useLevelFixtures(page, [level]); await installTestFolder(page, { 'weights.json': level })
  await page.goto('/untitled-jumping-game')
  await page.getByRole('button', { name: 'Level studio', exact: true }).click()
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  const local = page.getByRole('dialog').getByRole('button', { name: 'Local folder', exact: true })
  if (await local.count()) await local.click()
  await page.getByRole('button', { name: 'Choose folder', exact: true }).click()
  await page.getByRole('button', { name: 'Open weights.json', exact: true }).click()
  await waitForBuilderPreview(page); await selectBuilderObject(page, 'prop:0')
  const weight = page.getByRole('combobox', { name: 'Object weight', exact: true })
  await expect(weight).toHaveText('Normal')
  await weight.click()
  await expect(page.getByRole('option')).toHaveText(['Normal', 'Heavy'])
  await page.getByRole('option', { name: 'Heavy', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Heavy Ball 1', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await selectBuilderObject(page, 'prop:0')
  await expect(weight).toHaveText('Normal')
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); await selectBuilderObject(page, 'prop:0')
  await expect(weight).toHaveText('Heavy')
  await selectBuilderOption(page, 'Object weight', 'normal')
  const normal = await saveTestLevel(page)
  expect(normal.level.props[0].weight).toBeUndefined()
  await selectBuilderObject(page, 'prop:1'); await selectBuilderOption(page, 'Object weight', 'heavy')
  await expect(page.getByRole('heading', { name: 'Heavy Box 2', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Duplicate', exact: true }).click()
  const saved = await saveTestLevel(page)
  expect(saved.level.props.map(p => p.weight)).toEqual([undefined, 'heavy', 'heavy'])
  await reopenTestLevel(page, saved); await selectBuilderObject(page, 'prop:0'); await expect(weight).toHaveText('Normal')
  await selectBuilderObject(page, 'prop:2'); await expect(weight).toHaveText('Heavy')
  await weight.scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath('prop-weight-inspector.png') })
})

test('weight variants are visually distinct on land and settle at their own water depths', async ({ page }, info) => {
  await page.goto('/tests/fixtures/jumping/single-block-pool.json')
  const result = await page.evaluate(async () => {
    const { parseLevel } = await import('/src/games/jumping/level.ts')
    const { createRun, stepRun } = await import('/src/games/jumping/challenge.ts')
    const { drawPuzzleWorld, drawProp } = await import('/src/games/jumping/challengeRender.ts')
    const { NEUTRAL_INPUT, STEP } = await import('/src/games/jumping/model.ts')
    const { propWaterStrength } = await import('/src/games/jumping/gravity.ts')
    const weights = ['normal', 'heavy']
    const level = parseLevel(await (await fetch('/tests/fixtures/jumping/single-block-pool.json')).json())
    level.props = ['box', 'ball'].flatMap((kind, row) => weights.map((weight, i) => ({ kind, weight, size: 60, x: 650 + (row * 2 + i) * 200, y: 650 })))
    const run = createRun(level); run.started = true
    for (let i = 0; i < 1200; i++) stepRun(run, NEUTRAL_INPUT, STEP)
    const canvas = document.createElement('canvas'); canvas.id = 'weight-review'; canvas.width = 1200; canvas.height = 1000
    document.body.replaceChildren(canvas); document.body.style.margin = '0'
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#f0efe8'; ctx.fillRect(0, 0, 1200, 1000)
    ctx.fillStyle = '#43494b'; ctx.font = '20px sans-serif'
    for (let i = 0; i < 2; i++) ctx.fillText(['Normal · half submerged', 'Heavy · sinks'][i], i * 600 + 170, 40)
    for (let row = 0; row < 2; row++) for (let i = 0; i < 2; i++) drawProp(ctx, { kind: row ? 'ball' : 'box', weight: weights[i], x: i * 600 + 300,
      y: 150 + row * 135, size: 80, angle: row ? .5 : .12, vx: 0, vy: 0, angularVelocity: 0, grounded: true })
    ctx.save(); ctx.beginPath(); ctx.rect(0, 360, 1200, 640); ctx.clip()
    ctx.translate(0, 360); ctx.scale(.64, .64); drawPuzzleWorld(ctx, run); ctx.restore()
    const pixels = Array.from({ length: 2 }, (_, i) => [...ctx.getImageData(i * 600 + 300, 110, 1, 1).data])
    ctx.fillStyle = '#43494b'; ctx.font = '18px sans-serif'; ctx.fillText('Same shapes and size; different weight and buoyancy', 28, 345)
    return { pixels, props: run.props.map(p => ({ kind: p.kind, weight: p.weight, y: p.y, grounded: p.grounded, immersion: propWaterStrength(run.gravityField, p) })) }
  })
  expect(new Set(result.pixels.map(p => p.join(','))).size).toBe(2)
  for (const prop of result.props) {
    if (prop.weight === 'heavy') { expect(prop.grounded).toBe(true); expect(prop.y).toBeCloseTo(765, 0) }
    else { expect(prop.grounded).toBe(false); expect(Math.abs(prop.immersion - .5)).toBeLessThan(.04) }
  }
  await page.locator('#weight-review').screenshot({ path: info.outputPath('prop-weight-variants.png') })
  await info.attach('weight-equilibria', { body: JSON.stringify(result.props, null, 2), contentType: 'application/json' })
})
