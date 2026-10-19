import { test, expect } from './helpers/test.mjs'
import { readFileSync } from 'node:fs'

const lab2 = JSON.parse(readFileSync(new URL('../../public/levels/jumping/LAB2.jump-level.json', import.meta.url), 'utf8'))

for (const backend of ['canvas', 'gpu']) test(`${backend}: night terrain artwork reuses scratch storage without changing lit pixels or losing camera updates`, async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/lab/lighting-lab')
  const result = await page.evaluate(async ({ data, backend }) => {
    const { parseLevel } = await import('/src/games/jumping/level.ts')
    const { createPreviewRun } = await import('/src/games/jumping/challenge.ts')
    const { LightingRenderer, lightingPixelRatio } = await import('/src/games/jumping/lightingRender.ts')
    const { lightingForLevel } = await import('/src/games/jumping/lightingDefinition.ts')
    const run = createPreviewRun(parseLevel(data)), definition = lightingForLevel(run.level)
    const reference = new LightingRenderer({ backend, reuseTerrainArtwork: false })
    const optimized = new LightingRenderer({ backend })
    const canvases = [document.createElement('canvas'), document.createElement('canvas')], results = []
    const fill = CanvasRenderingContext2D.prototype.fill
    let terrainFills = 0
    CanvasRenderingContext2D.prototype.fill = function (...args) {
      if (args[0] instanceof Path2D && /^rgba\(38,\s*56,\s*45,/.test(String(this.fillStyle))) terrainFills++
      return fill.apply(this, args)
    }
    try {
      for (const [x, y, cssWidth, cssHeight, zoom, outage] of [
        [-40, -40, 1280, 800, .72, false], [-40, -40, 1280, 800, .72, false],
        [1100, 100, 1280, 800, .72, false],
        [1900, -40, 390, 844, .6, false], [2200, -40, 1920, 1080, 1, false],
        [0, -40, 960, 600, .7, true], [0, -40, 960, 600, .7, false],
        [0, -40, 960, 600, .7, false],
      ]) {
        if (results.length === 7) run.terrain[0].material = 'earth'
        const ratio = lightingPixelRatio(cssWidth, cssHeight, 2)
        const view = { x, y, width: Math.round(cssWidth * ratio), height: Math.round(cssHeight * ratio), zoom: zoom * ratio }
        run.empRemaining = outage ? 5 : 0; run.activeTime += .2
        const pixels = [], stats = [], fills = []
        for (const [i, renderer] of [reference, optimized].entries()) {
          const canvas = canvases[i]; canvas.width = view.width; canvas.height = view.height
          const ctx = canvas.getContext('2d', { willReadFrequently: true })
          terrainFills = 0
          stats.push(renderer.render(ctx, run, definition, view, .2)); fills.push(terrainFills)
          pixels.push(ctx.getImageData(0, 0, canvas.width, canvas.height).data)
        }
        let difference = 0, changed = 0, error = 0
        for (let i = 0; i < pixels[0].length; i++) {
          const delta = Math.abs(pixels[0][i] - pixels[1][i])
          difference = Math.max(difference, delta); error += delta; if (delta > 2) changed++
        }
        results.push({ x, difference, changed, meanError: error / pixels[0].length, channels: pixels[0].length,
          fills, bytes: stats.map(s => s.bufferBytes), backends: stats.map(s => s.backend) })
      }
      return results
    } finally { CanvasRenderingContext2D.prototype.fill = fill; reference.dispose(); optimized.dispose() }
  }, { data: lab2, backend })
  expect(result[0].fills[1]).toBe(1)
  expect(result[1].fills[1]).toBe(0)
  expect(result[1].fills[0]).toBeGreaterThan(1)
  expect(result[2].fills[1]).toBe(1)
  expect(result[7].fills[1]).toBe(1)
  for (const frame of result) {
    expect(frame.backends).toEqual([backend, backend])
    expect(frame.bytes[1]).toBe(frame.bytes[0])
    expect(frame.bytes[1]).toBeLessThan(64 * 1024 * 1024)
    // Hardware and software Skia can rasterize grouped translucent relief
    // differently at antialiased edges. Bound both the worst edge and total
    // error, retaining strict coverage of the image's lighting and occlusion.
    expect(frame.difference, JSON.stringify(result)).toBeLessThanOrEqual(8)
    expect(frame.meanError, JSON.stringify(result)).toBeLessThan(.02)
    expect(frame.changed / frame.channels, JSON.stringify(result)).toBeLessThan(.002)
  }
})
