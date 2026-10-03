import { chromium } from '@playwright/test'
import { cpus } from 'node:os'

// Run a local Vite server, then node scripts/benchmark-jumping-gravity-render.mjs.
// GRAVITY_URL overrides http://127.0.0.1:4176. Measures Canvas draw submission,
// excluding physics, lighting passes and GPU completion; no pixel readbacks.
const browser = await chromium.launch()
try {
  const page = await browser.newPage()
  await page.goto(`${process.env.GRAVITY_URL ?? 'http://127.0.0.1:4176'}/tests/fixtures/jumping/lighting-prototype.json`)
  const results = await page.evaluate(async () => {
    const { drawGravityDust } = await import('/src/games/jumping/gravityRender.ts')
    const { createGravityField, updateGravityField } = await import('/src/games/jumping/gravity.ts')
    const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d')
    document.body.replaceChildren(canvas)
    const percentile = (samples, fraction) => [...samples].sort((a, b) => a - b)[Math.floor(samples.length * fraction)]
    const results = []
    for (const [width, height, dpr] of [[1280, 800, 1], [1920, 1080, 2]]) {
      canvas.width = width * dpr; canvas.height = height * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      for (const count of [1, 16]) {
        const plates = Array.from({ length: count }, (_, i) => ({ id: `g${i}`, x: i * 5, y: i * 7, w: 20000 - i * 5, h: 6000 - i * 7, gravity: -1, power: 'always' }))
        const field = createGravityField(); updateGravityField(field, plates, new Map(), true)
        let rectangles = 0
        const fill = ctx.fillRect.bind(ctx)
        ctx.fillRect = (...args) => { rectangles++; fill(...args) }
        drawGravityDust(ctx, plates, field, 5)
        const particles = rectangles
        ctx.fillRect = fill
        const frame = i => { ctx.clearRect(0, 0, width, height); drawGravityDust(ctx, plates, field, i / 60) }
        for (let i = 0; i < 150; i++) frame(i)
        const samples = []
        for (let trial = 0; trial < 8; trial++) {
          await new Promise(requestAnimationFrame)
          const start = performance.now()
          for (let i = 0; i < 300; i++) frame(i)
          samples.push((performance.now() - start) / 300)
        }
        results.push({ width, height, dpr, plates: count, particles,
          'draw ms/frame median': +percentile(samples, .5).toFixed(4), 'draw ms/frame p95': +percentile(samples, .95).toFixed(4) })
      }
    }
    return results
  })
  console.log(`Gravity dust Canvas submission on ${cpus()[0].model}; Chromium ${await browser.version()}.`)
  console.table(results)
} finally { await browser.close() }
