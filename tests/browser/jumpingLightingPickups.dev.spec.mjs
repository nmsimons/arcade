import { test, expect } from './helpers/test.mjs'

for (const backend of ['canvas', 'gpu']) test(`${backend}: collectibles and wall text receive light and shadows without casting shadows`, async ({ page }) => {
  await page.goto('/tests/fixtures/jumping/lighting-prototype.json')
  const result = await page.evaluate(async backend => {
    const { lightingHarness } = await import('/tests/browser/helpers/lightingHarness.mjs')
    const { drawPickup } = await import('/src/games/jumping/pickups.ts')
    const { drawWallTexts } = await import('/src/games/jumping/wallText.ts')
    const h = await lightingHarness({ backend })
    h.run.level = { ...h.run.level, platforms: [], texts: [], timers: [], triggers: [], climbables: { ropes: [], ladders: [] } }
    h.run.terrain = []; h.run.props = []; h.run.robots = []; h.run.mechanisms = []; h.run.triggers = []
    h.run.pickupTime = 0
    const pickups = ['coin', 'stopwatch', 'fast-stopwatch', 'time-bonus', 'time-penalty', 'emp'].map((kind, i) => ({
      definition: { kind, x: 400 + i * 100, y: 240, seconds: 5 }, collectedAge: null,
    }))
    const texts = ['official', 'graffiti'].map((style, i) => ({
      x: 500 + i * 300, y: 340, w: 180, h: 60, text: 'LIGHT', fontSize: 32, align: 'left', style,
    }))
    const regions = [...pickups.map(({ definition: d }) => ({ kind: d.kind, x: d.x - 30, y: 200, w: 60, h: 70 })),
      ...texts.map(text => ({ ...text, kind: text.style }))]
    const lamp = { id: 'lamp', x: 100, y: 240, direction: 0, spread: 90, intensity: 100, power: 'always' }
    const maskCanvas = document.createElement('canvas'); maskCanvas.width = 1280; maskCanvas.height = 720
    const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true }); maskCtx.translate(0, 40)
    for (const pickup of pickups) drawPickup(maskCtx, pickup, 0)
    drawWallTexts(maskCtx, texts)
    const mask = maskCtx.getImageData(0, 0, 1280, 720).data
    h.run.pickups = pickups
    h.run.level.texts = texts
    // Settle the browser's first-readback raster path before pixel comparisons.
    h.render(100)
    const full = h.render(100), dark = h.render(0), lit = h.render(0, [lamp])
    h.run.pickups = []
    h.run.level.texts = []
    const without = h.render(0, [lamp])
    let outsideChanges = 0
    for (let i = 0; i < mask.length; i += 4) {
      const x = i / 4 % 1280, y = Math.floor(i / 4 / 1280) - 40
      if (regions.some(r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h)) continue
      if (lit.pixels.slice(i, i + 3).some((c, j) => c !== without.pixels[i + j])) outsideChanges++
    }
    h.run.pickups = pickups
    h.run.level.texts = texts
    h.run.props = [{ kind: 'box', x: 250, y: 320, size: 160, angle: 0 }]
    const shadow = h.render(0, [lamp])
    const reduced = h.render(0, [lamp], .2, undefined, true, 'structural')
    h.run.props = []; h.run.empRemaining = 5
    const fading = h.render(0, [lamp], .1), emp = h.render(0, [lamp], .1)
    const day = h.render(85, [lamp], .2, undefined, false)
    const samples = regions.map(region => {
      let count = 0, maxError = 0, worst
      for (let y = region.y; y < region.y + region.h; y++) for (let x = region.x; x < region.x + region.w; x++) {
        const i = ((y + 40) * 1280 + x) * 4
        if (mask[i + 3] !== 255) continue
        // Compare flat interiors; Canvas backends rasterize curved edges differently.
        if (!['official', 'graffiti'].includes(region.kind) && [-1, 0, 1].some(dy => [-1, 0, 1].some(dx => {
          const neighbor = i + (dy * 1280 + dx) * 4
          return [0, 1, 2, 3].some(c => mask[neighbor + c] !== mask[i + c])
        }))) continue
        count++
        for (const [frame, exposure] of [[dark, .35], [lit, 1], [shadow, .35], [reduced, 1], [fading, .675], [emp, .35], [day, 1]]) {
          for (let c = 0; c < 3; c++) {
            const error = Math.abs(frame.pixels[i + c] - full.pixels[i + c] * exposure)
            if (error > maxError) { maxError = error; worst = { x, y, c, exposure, original: full.pixels[i + c], actual: frame.pixels[i + c] } }
          }
        }
      }
      return { kind: region.kind, count, maxError, worst }
    })
    h.renderer.dispose()
    return { samples, outsideChanges, backend: lit.stats.backend,
      withPickups: [lit.stats.lights, lit.stats.edges, lit.stats.bufferBytes],
      withoutPickups: [without.stats.lights, without.stats.edges, without.stats.bufferBytes] }
  }, backend)
  expect(result.backend).toBe(backend)
  expect(result.outsideChanges).toBe(0)
  expect(result.withPickups).toEqual(result.withoutPickups)
  for (const sample of result.samples) {
    expect(sample.count, sample.kind).toBeGreaterThan(20)
    expect(sample.maxError, JSON.stringify(result.samples)).toBeLessThanOrEqual(2)
  }
})
