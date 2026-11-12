import { writeFile } from 'node:fs/promises'
import { test, expect } from './helpers/test.mjs'

// Phase 1 of the WebGL renderer (docs/jumping-webgl-renderer.md): Full Tilt's backdrop and terrain drawn by
// WebGL from retained meshes look like Canvas's, within anti-aliasing, and the Canvas frame places them.
// Headless Chromium runs WebGL in software, which the layers accept only when asked ('software').
test('WebGL layers draw the backdrop and terrain as Canvas does, and report the camera', async ({ page }, info) => {
  await page.addInitScript(() => { try { localStorage.setItem('jumping:debug-frames', '1') } catch { /* Reports stay off. */ } })
  await page.goto('/lab/lighting-lab')
  await expect(page.locator('.lighting-lab-study')).toBeVisible()
  const result = await page.evaluate(async () => {
    const [{ LightingRenderer }, { createPreviewRun }, { parseLevel }] = await Promise.all([
      import('/src/games/jumping/lightingRender.ts'), import('/src/games/jumping/challenge.ts'), import('/src/games/jumping/level.ts'),
    ])
    const level = parseLevel(await (await fetch('/levels/jumping/fulltilt.jump-level.json')).json())
    const run = createPreviewRun(level), definition = { nightMode: false, ambient: 0, lights: [] }
    // The opening hills: moss on earth, a chalk overhang, the steel wall and the panelled backdrop.
    const view = { x: 40.25, y: level.height - 820.5, zoom: .7, width: 900, height: 560 }
    const draw = renderer => {
      const canvas = document.createElement('canvas'); canvas.width = view.width; canvas.height = view.height
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      const walls = []
      const listener = ({ detail }) => { if (detail.canvas === canvas) walls.push(detail.transform) }
      window.addEventListener('jumping-wall', listener)
      try { renderer.render(ctx, run, definition, view, 0); renderer.render(ctx, run, definition, view, 0) }
      finally { window.removeEventListener('jumping-wall', listener) }
      return { pixels: ctx.getImageData(0, 0, view.width, view.height).data, wall: walls.at(-1), url: canvas.toDataURL() }
    }
    const canvas = new LightingRenderer({ backend: 'canvas' }), webgl = new LightingRenderer({ backend: 'canvas', webglLayers: 'software' })
    try {
      const a = draw(canvas), b = draw(webgl)
      let total = 0, over16 = 0, worst = 0
      for (let i = 0; i < a.pixels.length; i++) { const d = Math.abs(a.pixels[i] - b.pixels[i]); total += d; if (d > 16) over16++; worst = Math.max(worst, d) }
      // A missing or misplaced object differs over a whole region, not along edges: compare 20-pixel blocks' averages.
      let block = 0
      for (let by = 0; by + 20 <= view.height; by += 20) for (let bx = 0; bx + 20 <= view.width; bx += 20) {
        let sum = 0
        for (let y = by; y < by + 20; y++) for (let x = bx; x < bx + 20; x++) for (let k = 0; k < 3; k++) {
          const i = (y * view.width + x) * 4 + k; sum += a.pixels[i] - b.pixels[i]
        }
        block = Math.max(block, Math.abs(sum) / (20 * 20 * 3))
      }
      const camera = t => t && [t.a, t.d, t.e, t.f].map(v => +v.toFixed(4))
      // The difference, eight times as strong, for review.
      const diff = document.createElement('canvas'); diff.width = view.width; diff.height = view.height
      const image = diff.getContext('2d').createImageData(view.width, view.height)
      for (let i = 0; i < a.pixels.length; i += 4) { for (let k = 0; k < 3; k++) image.data[i + k] = Math.min(255, 8 * Math.abs(a.pixels[i + k] - b.pixels[i + k])); image.data[i + 3] = 255 }
      diff.getContext('2d').putImageData(image, 0, 0)
      return { stats: webgl.worldLayerStats, mean: total / a.pixels.length, over16: over16 / a.pixels.length, worst, block,
        walls: [camera(a.wall), camera(b.wall)], images: [a.url, b.url, diff.toDataURL()] }
    } finally { canvas.dispose(); webgl.dispose() }
  })
  for (const [k, name] of ['canvas', 'webgl', 'diff8x'].entries()) await writeFile(info.outputPath(`${name}.png`), Buffer.from(result.images[k].split(',')[1], 'base64'))
  delete result.images
  await info.attach('comparison', { body: JSON.stringify(result, null, 1), contentType: 'application/json' })
  expect(result.stats).toMatchObject({ backdrop: 'webgl', terrain: 'webgl' })
  expect(result.mean).toBeLessThan(.5)
  expect(result.over16).toBeLessThan(.003)
  expect(result.block).toBeLessThan(2)
  // The WebGL backdrop reports the same camera Canvas's wall does.
  expect(result.walls[1]).toEqual(result.walls[0])
  expect(result.walls[0]).toEqual([.7, .7, -28.175, expect.any(Number)])
})

// Phase 2: the whole daylight frame drawn by WebGL on its own canvas, exposure included, on levels with
// coins, ropes, ladders, wall text, displays and water. Edges anti-alias differently; whole objects may not.
for (const name of ['fulltilt', 'Quarantine II', 'scaffold4', 'buoyancy']) test(`the WebGL frame draws ${name} as Canvas does`, async ({ page }, info) => {
  await page.goto('/lab/lighting-lab')
  await expect(page.locator('.lighting-lab-study')).toBeVisible()
  const result = await page.evaluate(async name => {
    const [{ LightingRenderer }, { WebGLWorldFrame }, { createPreviewRun }, { parseLevel }, { lightingForLevel }] = await Promise.all([
      import('/src/games/jumping/lightingRender.ts'), import('/src/games/jumping/worldFrame.ts'), import('/src/games/jumping/challenge.ts'),
      import('/src/games/jumping/level.ts'), import('/src/games/jumping/lightingDefinition.ts')])
    await document.fonts.ready
    const level = parseLevel(await (await fetch(`/levels/jumping/${name}.jump-level.json`)).json()), run = createPreviewRun(level)
    const width = 960, height = 600, view = { x: run.player.x - 299.63, y: run.player.y - 259.39, width, height, zoom: 1.5789 }
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    const reference = new LightingRenderer({ backend: 'canvas' }), lighting = new LightingRenderer({ backend: 'canvas' })
    const glCanvas = document.createElement('canvas'), frame = new WebGLWorldFrame(glCanvas, true)
    try {
      reference.render(ctx, run, lightingForLevel(level), view, 0); reference.render(ctx, run, lightingForLevel(level), view, 0)
      const a = ctx.getImageData(0, 0, width, height).data
      const advanced = lighting.advance(lightingForLevel(level), run, 0)
      const covered = WebGLWorldFrame.covers(run, advanced.lighting, advanced.sources, false)
      const stats = frame.render(run, view, lighting.daylightCasters(run), advanced.sources)
      if (!stats) return { covered, declined: frame.declined }
      // Read the frame before it is presented.
      ctx.clearRect(0, 0, width, height); ctx.drawImage(glCanvas, 0, 0)
      const b = ctx.getImageData(0, 0, width, height).data
      let total = 0, block = 0
      for (let i = 0; i < a.length; i += 4) for (let k = 0; k < 3; k++) total += Math.abs(a[i + k] - b[i + k])
      for (let by = 0; by + 20 <= height; by += 20) for (let bx = 0; bx + 20 <= width; bx += 20) {
        let sum = 0
        for (let y = by; y < by + 20; y++) for (let x = bx; x < bx + 20; x++) for (let k = 0; k < 3; k++) { const i = (y * width + x) * 4 + k; sum += a[i] - b[i] }
        block = Math.max(block, Math.abs(sum) / 1200)
      }
      return { covered, mean: total / (a.length * .75), block, ops: stats.ops, image: glCanvas.toDataURL() }
    } finally { reference.dispose(); lighting.dispose(); frame.dispose() }
  }, name)
  if (result.image) await writeFile(info.outputPath('webgl.png'), Buffer.from(result.image.split(',')[1], 'base64'))
  delete result.image
  await info.attach('comparison', { body: JSON.stringify(result, null, 1), contentType: 'application/json' })
  expect(result.covered).toBe(true)
  expect(result.declined).toBeUndefined()
  expect(result.mean).toBeLessThan(2)
  expect(result.block).toBeLessThan(4)
})

test('the world renderer gives WebGL the frames it covers and Canvas the rest, advancing lighting once a frame', async ({ page }) => {
  await page.goto('/lab/lighting-lab')
  await expect(page.locator('.lighting-lab-study')).toBeVisible()
  const result = await page.evaluate(async () => {
    const [{ LightingRenderer }, { WorldRenderer }, { createPreviewRun }, { parseLevel }, { lightingForLevel }] = await Promise.all([
      import('/src/games/jumping/lightingRender.ts'), import('/src/games/jumping/worldRenderer.ts'), import('/src/games/jumping/challenge.ts'),
      import('/src/games/jumping/level.ts'), import('/src/games/jumping/lightingDefinition.ts')])
    const load = async name => parseLevel(await (await fetch(`/levels/jumping/${name}.jump-level.json`)).json())
    const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 200
    const glCanvas = document.createElement('canvas'), lighting = new LightingRenderer({ backend: 'canvas' })
    const renderer = new WorldRenderer(lighting, glCanvas, 'software'), ctx = canvas.getContext('2d')
    const frame = level => {
      const run = createPreviewRun(level)
      const stats = renderer.render(ctx, run, lightingForLevel(level), { x: run.player.x - 100, y: run.player.y - 100, zoom: .8, width: 320, height: 200 }, 1 / 60)
      return { backend: stats.backend, shown: glCanvas.style.visibility }
    }
    let advanced = 0
    const advance = lighting.advance.bind(lighting)
    lighting.advance = (...args) => { advanced++; return advance(...args) }
    try {
      const day = frame(await load('fulltilt')), night = frame(await load('escapade'))
      return { day, night, advanced }
    } finally { renderer.dispose(); lighting.dispose() }
  })
  expect(result.day).toEqual({ backend: 'webgl', shown: 'visible' })
  expect(result.night).toEqual({ backend: expect.stringMatching(/canvas|gpu/), shown: 'hidden' })
  expect(result.advanced).toBe(2)
})

test('levels the layers do not cover yet stay entirely on Canvas', async ({ page }) => {
  await page.goto('/lab/lighting-lab')
  await expect(page.locator('.lighting-lab-study')).toBeVisible()
  const result = await page.evaluate(async () => {
    const [{ LightingRenderer }, { createPreviewRun }, { parseLevel }] = await Promise.all([
      import('/src/games/jumping/lightingRender.ts'), import('/src/games/jumping/challenge.ts'), import('/src/games/jumping/level.ts'),
    ])
    // Spelunk's cave environment is for a later phase.
    const level = parseLevel(await (await fetch('/levels/jumping/spelunk.jump-level.json')).json())
    const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 200
    const renderer = new LightingRenderer({ backend: 'canvas', webglLayers: 'software' })
    try {
      renderer.render(canvas.getContext('2d'), createPreviewRun(level), { nightMode: false, ambient: 0, lights: [] }, { x: 0, y: 0, zoom: .5, width: 320, height: 200 }, 0)
      return renderer.worldLayerStats ?? null
    } finally { renderer.dispose() }
  })
  expect(result).toBeNull()
})
