import { chromium } from '@playwright/test'
import { cpus, platform, release } from 'node:os'

const baseURL = process.env.LIGHTING_URL ?? 'http://127.0.0.1:5173'
const pixelRatio = Number(process.env.LIGHTING_DPR ?? 1), cpuRate = Number(process.env.LIGHTING_CPU_RATE ?? 1)
const stress = process.env.LIGHTING_STRESS === '1'
const scrolling = process.env.LIGHTING_SCROLL === '1'
const movingMechanisms = process.env.LIGHTING_MECHANISMS === '1'
const quick = process.env.LIGHTING_QUICK === '1'
const benchmarkAmbient = Number(process.env.LIGHTING_AMBIENT ?? 85)
const browser = await chromium.launch({ ...(process.env.LIGHTING_CHANNEL ? { channel: process.env.LIGHTING_CHANNEL } : {}) })
try {
  const page = await browser.newPage()
  if (cpuRate > 1) await (await page.context().newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: cpuRate })
  const system = await browser.newBrowserCDPSession()
  const { gpu } = await system.send('SystemInfo.getInfo')
  const results = []
  // An inert same-origin document avoids running another game's animation loop.
  await page.goto(`${baseURL}/tests/fixtures/jumping/lighting-prototype.json`)
  for (const [width, height] of ((quick || stress) ? [[1280, 800]] : [[1280, 800], [1920, 1080]])) {
    await page.setViewportSize({ width, height })
    results.push(...await page.evaluate(async ({ width, height, quick, pixelRatio, scrolling, stress, movingMechanisms, benchmarkAmbient }) => {
      const [{ LightingRenderer, lightingPixelRatio }, { createPreviewRun }, { parseLevel }] = await Promise.all([
        import('/src/games/jumping/lightingRender.ts'), import('/src/games/jumping/challenge.ts'), import('/src/games/jumping/level.ts'),
      ])
      const fixture = await (await fetch('/tests/fixtures/jumping/lighting-prototype.json')).json()
      const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d')
      document.body.style.margin = '0'; canvas.style.display = 'block'
      document.body.replaceChildren(canvas)
      const percentile = (samples, fraction) => [...samples].sort((a, b) => a - b)[Math.floor(samples.length * fraction)]
      const results = []
      const ratio = lightingPixelRatio(width, height, pixelRatio)
      canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio)
      canvas.style.width = `${width}px`; canvas.style.height = `${height}px`
      const cases = stress ? [1, 2, 16].map(lightCount => ({ ambient: benchmarkAmbient, lightCount })) : quick ? [1, 2].map(lightCount => ({ ambient: benchmarkAmbient, lightCount }))
        : [{ ambient: 100, lightCount: 0 }, ...[85, 0].flatMap(ambient => [1, 2, 3].map(lightCount => ({ ambient, lightCount })))]
      for (const { ambient, lightCount } of cases) {
        const level = parseLevel(fixture.level)
        if (stress) {
          level.climbables = { ropes: [], ladders: [] }
          level.platforms = Array.from({ length: 160 }, (_, i) => ({ x: 50 + i % 20 * 60, y: 160 + Math.floor(i / 20) * 20, w: 20, h: 20 }))
          level.props = Array.from({ length: 80 }, (_, i) => ({ kind: i % 2 ? 'ball' : 'box', x: 60 + i % 20 * 60, y: 460 + Math.floor(i / 20) * 40, size: 30 }))
          level.mechanisms = Array.from({ length: 40 }, (_, i) => ({ id: `m${i}`, kind: 'gate', x: 50 + i % 20 * 60, y: 350 + Math.floor(i / 20) * 40, w: 20, h: 20, travel: 20 }))
          level.robots = Array.from({ length: 30 }, (_, i) => ({ x: 70 + i * 38, y: 640, left: 50, right: 1230 }))
          level.triggers = []
        }
        const run = createPreviewRun(level), renderer = new LightingRenderer()
        const lights = stress ? Array.from({ length: lightCount }, (_, i) => ({ id: `spot${i}`, x: 90 + i * 70, y: 40, intensity: 100, power: 'always', direction: 90, spread: 90 }))
          : fixture.lighting.lights.slice(0, lightCount)
        const zoom = Math.min(width / 1360, height / 720)
        const view = { width: canvas.width, height: canvas.height, zoom: zoom * ratio, x: 640 - width / zoom / 2, y: 320 - height / zoom / 2 }
        const cpu = [], frames = []
        let previous = 0, metrics
        for (let i = 0; i < 100; i++) {
          const now = await new Promise(requestAnimationFrame)
          run.props[0].x = 700 + Math.sin(i / 30) * 85; run.props[0].angle = Math.sin(i / 40) * .14
          run.pickupTime = i / 60
          if (movingMechanisms) for (const [j, mechanism] of run.mechanisms.entries()) {
            // Hold briefly at the closed end, then travel and return. This
            // exercises actual contact/gap changes rather than only prop motion.
            const phase = (i + j * 15) % 60 / 60
            const travel = phase < .15 ? 0 : 1 - Math.abs((phase - .15) / .85 * 2 - 1)
            mechanism.y = mechanism.definition.y - mechanism.definition.travel * travel
          }
          if (scrolling) view.x = 640 - width / zoom / 2 + Math.sin(i / 30) * 80
          const start = performance.now()
          metrics = renderer.render(ctx, run, { ambient, lights }, view, 1 / 60)
          if (i >= 20) { cpu.push(performance.now() - start); frames.push(now - previous) }
          previous = now
        }
        results.push({ width, height, pixelRatio, movingMechanisms, backingWidth: canvas.width, backingHeight: canvas.height, scrolling, stress, ambient, lights: metrics.lights, edges: metrics.edges, bufferBytes: metrics.bufferBytes,
          cpuP50: percentile(cpu, .5), cpuP95: percentile(cpu, .95), frameP95: percentile(frames, .95) })
        renderer.dispose()
      }
      return results
    }, { width, height, quick, pixelRatio, scrolling, stress, movingMechanisms, benchmarkAmbient }))
  }
  console.log(JSON.stringify({ date: new Date().toISOString(), machine: cpus()[0].model, system: `${platform()} ${release()}`,
    browser: await browser.version(), gpu: { devices: gpu.devices, featureStatus: gpu.featureStatus },
    cpuRate, channel: process.env.LIGHTING_CHANNEL ?? 'headless-shell',
    mode: 'Headless Chromium; CPU submission and rAF intervals, not GPU timing. One moving crate; optional moving mechanisms. 20 warmup and 80 measured frames per case.', results }, null, 2))
} finally { await browser.close() }
