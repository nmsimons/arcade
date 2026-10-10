import { chromium } from '@playwright/test'
import { cpus } from 'node:os'
import { writeFile } from 'node:fs/promises'

// Start Vite, then WATER_URL=http://localhost:5173 node scripts/benchmark-jumping-water.mjs.
// CPU time for simulation + Canvas submission; GPU completion is excluded.
// WATER_CONTACTS=1 includes swimming contacts; WATER_CONTACT_LIGHTING=0 isolates simulation/drawing.
// WATER_CONTACT_PROFILE=/tmp/water saves profiles.
// WATER_RESERVOIRS=1 compares 16 static/filling reservoirs, 48 solids and 48 floats.
const browser = await chromium.launch()
try {
  const page = await browser.newPage(), session = await page.context().newCDPSession(page)
  await page.goto(`${process.env.WATER_URL ?? 'http://localhost:5173'}/tests/fixtures/jumping/single-block-pool.json`)
  if (process.env.WATER_CONTACT_PROFILE) await session.send('Profiler.enable')
  const results = []
  for (const throttle of [1, 4]) {
    await session.send('Emulation.setCPUThrottlingRate', { rate: throttle })
    if (process.env.WATER_CONTACT_PROFILE) await session.send('Profiler.start')
    if (process.env.WATER_RESERVOIRS === '1') {
      results.push(...await page.evaluate(async throttle => {
        const { blankTrial } = await import('/src/games/jumping/level.ts')
        const { createRun, stepRun, setWaterEffectsEnabled } = await import('/src/games/jumping/challenge.ts')
        const { drawPuzzleWorld } = await import('/src/games/jumping/challengeRender.ts')
        const { NEUTRAL_INPUT, STEP } = await import('/src/games/jumping/model.ts')
        const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 800
        document.body.replaceChildren(canvas); const ctx = canvas.getContext('2d'), output = []
        const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.floor(values.length * p)]
        for (const dynamic of [false, true]) for (const effects of [true, false]) {
          const level = blankTrial(); level.width = 10400; level.spawn = { x: 120, y: 920 }
          level.goal = { id: 'closed', power: 'switched', x: 10200, y: 920 }
          level.gravityPlates = Array.from({ length: 16 }, (_, i) => ({ id: `pool-${i}`, effect: 'water', gravity: -1,
            x: 320 + i * 600, y: 320, w: 560, h: 600, waterLevel: 35, waterRate: 4, fill: { switchReversed: dynamic } }))
          level.platforms = Array.from({ length: 16 }, (_, i) => [
            { x: 500 + i * 600, y: 550, w: 100, h: 370 },
            { x: 650 + i * 600, y: 550, w: 100, h: 50 },
            { x: 770 + i * 600, y: 700, w: 70, h: 220, polygon: [[0, 220], [70, 0], [70, 220]] },
          ]).flat()
          level.props = Array.from({ length: 16 }, (_, i) => [
            { kind: 'ball', size: 40, x: 420 + i * 600, y: 750 },
            { kind: 'box', size: 40, x: 680 + i * 600, y: 750 },
            { kind: 'ball', size: 40, x: 770 + i * 600, y: 750 },
          ]).flat()
          const start = performance.now(), run = createRun(level), startupMs = performance.now() - start
          setWaterEffectsEnabled(run, effects); run.started = true
          const frame = () => {
            const start = performance.now()
            stepRun(run, NEUTRAL_INPUT, STEP); stepRun(run, NEUTRAL_INPUT, STEP)
            const simulation = performance.now() - start
            ctx.setTransform(1, 0, 0, 1, 0, -200); ctx.clearRect(0, 200, 1280, 800); drawPuzzleWorld(ctx, run)
            return [performance.now() - start, simulation]
          }
          for (let i = 0; i < 120; i++) frame()
          const total = [], simulation = [], rendering = [], revision = run.water.revision
          for (let batch = 0; batch < 8; batch++) {
            await new Promise(requestAnimationFrame)
            for (let i = 0; i < 30; i++) {
              const [elapsed, step] = frame(); total.push(elapsed); simulation.push(step); rendering.push(elapsed - step)
            }
          }
          output.push({ scenario: dynamic ? '16 filling reservoirs' : '16 static reservoirs', effects, throttle, frames: total.length, startupMs,
            medianMs: percentile(total, .5), p95Ms: percentile(total, .95), simulationP95Ms: percentile(simulation, .95),
            renderP95Ms: percentile(rendering, .95), geometryUpdates: run.water.revision - revision,
            cachedTerrainPieces: [...run.waterSpaces.values()].reduce((sum, pieces) => sum + pieces.length, 0) })
        }
        return output
      }, throttle))
      if (process.env.WATER_CONTACT_PROFILE) { const { profile } = await session.send('Profiler.stop'); await writeFile(`${process.env.WATER_CONTACT_PROFILE}-${throttle}.cpuprofile`, JSON.stringify(profile)) }
      continue
    } else if (process.env.WATER_CONTACTS === '1') {
      results.push(...await page.evaluate(async ({ throttle, lit }) => {
        const { createWaterCluster, clusterStages, clusterInput } = await import('/tests/helpers/jumpingWaterCluster.mjs')
        const { stepRun, setWaterEffectsEnabled } = await import('/src/games/jumping/challenge.ts')
        const { LightingRenderer } = await import('/src/games/jumping/lightingRender.ts')
        const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 800
        document.body.replaceChildren(canvas); const ctx = canvas.getContext('2d')
        const percentile = (s, p) => [...s].sort((a, b) => a - b)[Math.floor(s.length * p)]
        const output = []
        for (const mode of lit ? ['full bright', 'lit', 'performance'] : ['full bright', 'full bright reduced']) {
          const fullBright = mode.startsWith('full bright'), reduced = mode === 'performance' || mode.endsWith('reduced')
          const run = createWaterCluster(1, 48), renderer = new LightingRenderer({ backend: 'auto' })
          if (reduced) setWaterEffectsEnabled(run, false)
          const samples = [], steps = [], renders = [], byStage = {}; let backend
          for (const [label, seconds, intent] of clusterStages) {
            const stage = []
            for (let i = 0; i < Math.round(seconds * 60); i++) {
              if (i % 60 === 0) await new Promise(requestAnimationFrame)
              const start = performance.now()
              for (let tick = 0; tick < 2; tick++) stepRun(run, clusterInput(intent, 1), 1 / 120)
              const afterStep = performance.now()
              const view = { x: run.player.x - 640, y: 0, width: 1280, height: 800, zoom: 1 }
              const lighting = renderer.render(ctx, run, { ambient: fullBright ? 100 : 85, lights: fullBright ? [] : [{ id: 'light', x: 850, y: 150, intensity: 100, power: 'always' }] }, view, 1 / 60, undefined, false, reduced ? 'structural' : 'full', fullBright)
              backend = lighting.backend
              const end = performance.now()
              samples.push(end - start); steps.push(afterStep - start); renders.push(end - afterStep); stage.push(end - start)
            }
            byStage[label] = +percentile(stage, .95).toFixed(3)
          }
          output.push({ scenario: 'six floats and swimming', throttle, mode, backend, frames: samples.length, median: +percentile(samples, .5).toFixed(3), p95: +percentile(samples, .95).toFixed(3), stepP95: +percentile(steps, .95).toFixed(3), renderP95: +percentile(renders, .95).toFixed(3), byStage })
          renderer.dispose()
        }
        return output
      }, { throttle, lit: process.env.WATER_CONTACT_LIGHTING !== '0' }))
      if (process.env.WATER_CONTACT_PROFILE) { const { profile } = await session.send('Profiler.stop'); await writeFile(`${process.env.WATER_CONTACT_PROFILE}-${throttle}.cpuprofile`, JSON.stringify(profile)) }
      continue
    }
    results.push(...await page.evaluate(async throttle => {
      const { blankTrial } = await import('/src/games/jumping/level.ts')
      const { createRun, stepRun } = await import('/src/games/jumping/challenge.ts')
      const { drawPuzzleWorld } = await import('/src/games/jumping/challengeRender.ts')
      const { NEUTRAL_INPUT } = await import('/src/games/jumping/model.ts')
      const { disturbWaterSurface, advanceWaterSurface } = await import('/src/games/jumping/waterSurface.ts')
      const { drawWaterRegion, drawWaterSurfaceDetails } = await import('/src/games/jumping/gravityRender.ts')
      const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d')
      canvas.width = 1280; canvas.height = 800; document.body.replaceChildren(canvas)
      ctx.setTransform(.27, 0, 0, .8, 0, 0)
      const plates = Array.from({ length: 16 }, (_, i) => ({ id: `w${i}`, x: i * 290, y: 400, w: 280, h: 520, gravity: -1, effect: 'water' }))
      const props = Array.from({ length: 40 }, (_, i) => ({ kind: i % 2 ? 'box' : 'ball', x: Math.floor(i / 3) * 290 + 45 + i % 3 * 85, y: 420, size: 40 }))
      const level = { ...blankTrial(), width: 4640, gravityPlates: plates, props, spawn: { x: 4550, y: 920 }, goal: { id: 'closed', x: 20, y: 920, power: 'switched' } }
      const percentile = (samples, p) => [...samples].sort((a, b) => a - b)[Math.floor(samples.length * p)]
      const output = []
      for (const scenario of ['effect only', 'busy game']) for (const mode of ['baseline', 'idle', 'entry storm']) {
        const run = createRun(level); run.started = true
        const state = run.waterSurface
        const points = state.surfaces.reduce((sum, s) => sum + s.height.length, 0)
        if (mode === 'baseline') run.waterSurface = undefined
        const frame = i => {
          if (mode === 'entry storm' && i % 12 === 0) for (const s of state.surfaces)
            disturbWaterSurface(state, (s.left + s.right) / 2, s.y, 750, 90)
          if (scenario === 'busy game') {
            stepRun(run, NEUTRAL_INPUT, 1 / 120); stepRun(run, NEUTRAL_INPUT, 1 / 120)
            ctx.clearRect(0, 0, 4640, 1000); drawPuzzleWorld(ctx, run)
          } else {
            if (run.waterSurface) advanceWaterSurface(state, run.player, run.props, 0, 1 / 60)
            ctx.clearRect(0, 0, 4640, 1000)
            for (const plate of plates) drawWaterRegion(ctx, plate, undefined, run.waterSurface)
            if (run.waterSurface) drawWaterSurfaceDetails(ctx, state)
          }
        }
        for (let i = 0; i < 150; i++) frame(i)
        const samples = []
        for (let trial = 0; trial < 9; trial++) {
          await new Promise(requestAnimationFrame)
          const start = performance.now()
          for (let i = 0; i < 120; i++) frame(i)
          samples.push((performance.now() - start) / 120)
        }
        output.push({ scenario, throttle, mode, regions: 16, props: 40, points,
          median: +percentile(samples, .5).toFixed(4), p95: +percentile(samples, .95).toFixed(4) })
      }
      return output
    }, throttle))
    if (process.env.WATER_CONTACT_PROFILE) { const { profile } = await session.send('Profiler.stop'); await writeFile(`${process.env.WATER_CONTACT_PROFILE}-${throttle}.cpuprofile`, JSON.stringify(profile)) }
  }
  console.log(`Water prototype CPU simulation + Canvas submission on ${cpus()[0].model}; Chromium ${await browser.version()}.`)
  console.log(`4x is simulated CPU throttling, not a real low-end device. GPU completion is excluded; lighting is ${process.env.WATER_CONTACTS === '1' && process.env.WATER_CONTACT_LIGHTING !== '0' ? 'included' : 'excluded'}.`)
  console.table(results)
  console.log(JSON.stringify(results))
} finally { await browser.close() }
