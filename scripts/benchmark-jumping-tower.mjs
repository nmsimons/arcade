import { chromium } from '@playwright/test'
import { cpus, arch } from 'node:os'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

const channel = process.env.LIGHTING_CHANNEL
const parameter = (name, fallback, integer = false) => {
  const value = Number(process.env[name] ?? fallback)
  if (!Number.isFinite(value) || value <= 0 || integer && !Number.isInteger(value)) {
    throw new Error(`${name} must be a positive ${integer ? 'integer' : 'number'}`)
  }
  return value
}
const width = parameter('LIGHTING_WIDTH', 1280, true), height = parameter('LIGHTING_HEIGHT', 800, true)
const dpr = parameter('LIGHTING_DPR', 1)
const frames = parameter('LIGHTING_FRAMES', 60, true), warmup = parameter('LIGHTING_WARMUP', 12, true)
const levelPath = process.env.LIGHTING_LEVEL ?? '/levels/jumping/Tower.jump-level.json'
const tracePath = process.env.LIGHTING_TRACE
const browser = await chromium.launch(channel ? { channel } : {})
try {
  const session = await browser.newBrowserCDPSession()
  const { gpu } = await session.send('SystemInfo.getInfo')
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: dpr })
  const base = process.env.LIGHTING_URL ?? 'http://127.0.0.1:5173'
  await page.goto(`${base}/tests/fixtures/jumping/lighting-prototype.json`)
  const traceEvents = []
  if (tracePath) {
    session.on('Tracing.dataCollected', ({ value }) => traceEvents.push(...value))
    await session.send('Tracing.start', {
      categories: 'gpu,cc,viz,disabled-by-default-skia,disabled-by-default-gpu.service,devtools.timeline,blink.user_timing',
      options: 'record-as-much-as-possible',
    })
  }
  const results = await page.evaluate(async ({ modulePath, backend, shadows, width, height, dpr, frames, warmup, levelPath }) => {
    const [{ LightingRenderer, lightingPixelRatio }, { createPreviewRun }, { parseLevel }, { gameCamera }] = await Promise.all([
      import(modulePath), import('/src/games/jumping/challenge.ts'), import('/src/games/jumping/level.ts'), import('/src/games/jumping/camera.ts'),
    ])
    const response = await fetch(levelPath)
    if (!response.ok) throw new Error(`Level fetch failed: ${response.status} ${levelPath}`)
    const level = parseLevel(await response.json())
    if (!level.lighting) throw new Error('This lighting benchmark requires a level with lighting settings.')
    const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d')
    document.body.replaceChildren(canvas)
    const results = [], ratio = lightingPixelRatio(width, height, dpr, shadows === 'structural')
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio)
    const percentile = (a, p) => [...a].sort((a, b) => a - b)[Math.ceil(a.length * p) - 1]
    for (const scrolling of [false, true]) {
      const run = createPreviewRun(level), renderer = new LightingRenderer({ backend })
      const view = { ...gameCamera(width, height, run.player, level, true), width: canvas.width, height: canvas.height }
      view.zoom *= ratio
      const originY = view.y, cpu = [], intervals = []
      let previous, metrics
      const phase = scrolling ? 'scrolling' : 'stationary'
      performance.mark(`${phase}:start`)
      for (let i = 0; i < warmup + frames; i++) {
        const now = await new Promise(requestAnimationFrame)
        if (scrolling) view.y = originY - i * 2
        run.pickupTime = i / 60
        const start = performance.now()
        metrics = renderer.render(ctx, run, level.lighting, view, 1 / 60, undefined, false, shadows)
        if (i >= warmup) { cpu.push(performance.now() - start); intervals.push(now - previous) }
        previous = now
      }
      performance.mark(`${phase}:end`)
      performance.measure(phase, `${phase}:start`, `${phase}:end`)
      results.push({ scrolling, shadows, backend: metrics.backend, lights: metrics.lights, edges: metrics.edges, bufferMiB: metrics.bufferBytes / 1048576,
        renderWidth: canvas.width, renderHeight: canvas.height,
        cpuP50: percentile(cpu, .5), cpuP95: percentile(cpu, .95), frameP95: percentile(intervals, .95),
        frameP99: percentile(intervals, .99), worstFrame: Math.max(...intervals), framesOver33ms: intervals.filter(ms => ms > 1000 / 30 + .5).length,
        fps: intervals.length * 1000 / intervals.reduce((a, b) => a + b, 0) })
      renderer.dispose()
    }
    return results
  }, { modulePath: process.env.LIGHTING_RENDERER ?? '/src/games/jumping/lightingRender.ts', backend: process.env.LIGHTING_BACKEND ?? 'auto', shadows: process.env.LIGHTING_SHADOWS ?? 'full',
    width, height, dpr, frames, warmup, levelPath })
  if (tracePath) {
    const complete = new Promise(resolve => session.once('Tracing.tracingComplete', resolve))
    await session.send('Tracing.end'); await complete
    await mkdir(dirname(tracePath), { recursive: true })
    await writeFile(tracePath, JSON.stringify({ traceEvents }))
  }
  console.log(JSON.stringify({ machine: cpus()[0].model, arch: arch(), browser: await browser.version(), channel: channel ?? 'headless-shell',
    gpu: { devices: gpu.devices, featureStatus: gpu.featureStatus },
    levelPath, viewport: { width, height, dpr }, frames, warmup, tracePath,
    note: 'Headless browser. CPU submission and rAF cadence, not GPU timings. Rendering benchmark with a stationary preview world; not a gameplay/input-latency test.', results }, null, 2))
} finally { await browser.close() }
