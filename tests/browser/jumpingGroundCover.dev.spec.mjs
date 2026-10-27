import { test, expect } from './helpers/test.mjs'

for (const backend of ['canvas', 'gpu']) test(`${backend}: colored ground surfaces follow terrain and darken with ambient lighting`, async ({ page }, info) => {
  await page.goto('/lab')
  const result = await page.evaluate(async backend => {
    const { blankTrial } = await import('/src/games/jumping/level.ts')
    const { createPreviewRun } = await import('/src/games/jumping/challenge.ts')
    const { LightingRenderer } = await import('/src/games/jumping/lightingRender.ts')
    const { drawTerrain } = await import('/src/games/jumping/render.ts')
    const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 700
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    const types = ['grass', 'scrub', 'moss'], gallery = document.createElement('canvas')
    gallery.width = 1000; gallery.height = 700; const galleryCtx = gallery.getContext('2d')
    const level = { ...blankTrial(), version: 2, width: 1000, height: 700, floor: 700,
      entrance: { x: 40, y: 700 }, goal: { x: 950, y: 700 },
      platforms: types.flatMap((groundCover, i) => [
        { x: 90 + i * 300, y: 230, w: 220, h: 80, material: 'chalk', groundCover },
        { x: 90 + i * 300, y: 480, w: 220, h: 180, material: 'chalk', groundCover }]),
      environment: { kind: 'interior', lighting: 'regions', baseLighting: 'day',
        walls: [{ kind: 'cave', x: 0, y: 400, w: 1000, h: 300 }] },
      lighting: { nightMode: true, ambient: 0, lights: [] } }
    const view = { x: 0, y: 0, zoom: 1, width: 1000, height: 700 }
    const renderer = new LightingRenderer({ backend }), run = createPreviewRun(level)
    const stats = renderer.render(ctx, run, level.lighting, view, 0)
    galleryCtx.drawImage(canvas, 0, 0)
    const samples = types.map((type, i) => {
      const strip = y => ctx.getImageData(100 + i * 300, y, 200, 2).data
      const day = strip(231), night = strip(481), tones = new Set()
      let count = 0, dayLight = 0, nightLight = 0
      for (let p = 0; p < day.length; p += 4) if (day[p + 1] > day[p] && day[p + 1] > day[p + 2] + 8) {
        count++; dayLight += day[p + 1]; nightLight += night[p + 1]
        tones.add(`${day[p]},${day[p + 1]},${day[p + 2]}`)
      }
      // The rock beneath the shallow planted edge retains its material color.
      const rock = Array.from(ctx.getImageData(200 + i * 300, 250, 1, 1).data)
      return { type, count, tones: tones.size, dayLight: dayLight / count, nightLight: nightLight / count, rock }
    })
    // Exact world-space replay under an integer pan: no frame-random growth.
    const before = ctx.getImageData(120, 205, 160, 40).data
    renderer.render(ctx, run, level.lighting, { ...view, x: 12 }, 0)
    const after = ctx.getImageData(108, 205, 160, 40).data
    let panError = 0
    for (let i = 0; i < before.length; i++) panError = Math.max(panError, Math.abs(before[i] - after[i]))
    renderer.dispose()
    // A bare piece at a higher artwork depth hides both the ribbon and blades.
    const covered = { ...level, platforms: [level.platforms[0], { ...level.platforms[0], groundCover: 'none', zIndex: 1 }] }
    ctx.clearRect(0, 0, 1000, 700); drawTerrain(ctx, covered.platforms, covered.platforms, covered)
    const hidden = Array.from(ctx.getImageData(100, 210, 200, 30).data)
    covered.platforms[0] = { ...covered.platforms[0], groundCover: 'none' }
    ctx.clearRect(0, 0, 1000, 700); drawTerrain(ctx, covered.platforms, covered.platforms, covered)
    const bare = ctx.getImageData(100, 210, 200, 30).data
    const occluded = hidden.every((v, i) => v === bare[i])
    // A slope/curved example in the same gallery shows the surface treatment.
    ctx.clearRect(0, 0, 1000, 700)
    const sloped = { ...level, platforms: types.map((groundCover, i) => ({
      x: 90 + i * 300, y: 80, w: 220, h: 100, profile: [[0, 70], [110, 15], [220, 55]], groundCover })) }
    drawTerrain(ctx, sloped.platforms, sloped.platforms, sloped); galleryCtx.drawImage(canvas, 0, 0)
    document.body.replaceChildren(gallery); document.body.style.margin = '0'
    return { samples, panError, occluded, backend: stats.backend }
  }, backend)
  expect(result.backend).toBe(backend)
  expect(result.panError).toBeLessThanOrEqual(1)
  expect(result.occluded).toBe(true)
  for (const sample of result.samples) {
    expect(sample.count, sample.type).toBeGreaterThan(150)
    expect(sample.tones, sample.type).toBeGreaterThanOrEqual(3)
    expect(sample.dayLight).toBeGreaterThan(sample.nightLight * 2)
    expect(Math.max(...sample.rock.slice(0, 3)) - Math.min(...sample.rock.slice(0, 3))).toBeLessThan(20)
  }
  await page.locator('canvas').screenshot({ path: info.outputPath(`ground-cover-surface-${backend}.png`) })
})
