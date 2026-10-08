import { test, expect } from './helpers/test.mjs'

for (const backend of ['canvas', 'gpu']) test(`${backend}: reusing exposure corrections preserves every pixel through light, view and mode changes`, async ({ page }, info) => {
  await page.goto('/untitled-jumping-game/lighting-lab')
  const result = await page.evaluate(async backend => {
    const [{ LightingRenderer }, { createPreviewRun }, { blankTrial }] = await Promise.all([
      import('/src/games/jumping/lightingRender.ts'), import('/src/games/jumping/challenge.ts'), import('/src/games/jumping/level.ts'),
    ])
    const level = { ...blankTrial(), width: 1200, height: 600, floor: 500, spawn: { x: 720, y: 500 }, goal: { x: 100, y: 500 },
      platforms: [{ x: 742, y: 450, w: 24, h: 50 }], robots: [{ x: 710, y: 500, left: 300, right: 1000 }] }
    const run = createPreviewRun(level), robot = run.robots[0]
    const renderers = [new LightingRenderer({ backend, reuseExposureCorrection: true, cacheDayAmbient: true }), new LightingRenderer({ backend, reuseExposureCorrection: false, cacheDayAmbient: false })]
    const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true })
    let worst = 0, frames = 0, cachedFrames = 0
    const backends = new Set()
    for (const nightMode of [false, true, false]) for (const powered of [false, true]) for (const faded of [false, true]) {
      for (const view of [{ x: 400.125, y: 200.25, zoom: .7, width: 512, height: 384 },
        { x: 720, y: 400, zoom: 1.3, width: 384, height: 256 }, { x: 1000, y: 150, zoom: 1, width: 300, height: 300 }]) {
        canvas.width = view.width; canvas.height = view.height
        robot.facing = powered ? -1 : 1; robot.angle = powered ? -.12 : .12; robot.definition.headlight = powered
        run.goalLit = powered; run.goalElapsed = powered ? 1 : 0; run.empRemaining = faded ? 1 : 0
        run.player.grounded = !faded; run.player.airBoost.x = faded ? .5 : 0
        const definition = { nightMode, ambient: 0, lights: powered ? [
          { id: 'lamp', x: 750, y: 360, direction: 110, spread: 100, intensity: 100, power: 'always' },
        ] : [] }
        const pixels = renderers.map((renderer, index) => {
          const stats = renderer.render(ctx, run, definition, view, .016)
          if (index === 0 && stats.dayAmbientCached) cachedFrames++
          backends.add(stats.backend)
          return ctx.getImageData(0, 0, canvas.width, canvas.height).data
        })
        for (let i = 0; i < pixels[0].length; i++) worst = Math.max(worst, Math.abs(pixels[0][i] - pixels[1][i]))
        frames++
      }
    }
    renderers.forEach(renderer => renderer.dispose())
    return { worst, frames, cachedFrames, backends: [...backends] }
  }, backend)
  await info.attach('exposure-comparison', { body: JSON.stringify(result), contentType: 'application/json' })
  expect(result.frames).toBe(36)
  expect(result.worst).toBe(0)
  expect(result.backends).toContain(backend)
  if (backend === 'canvas') expect(result.cachedFrames).toBeGreaterThan(0)
})

test('a reused daylight terrain mask restores moving artwork, recovery indicators and material edges exactly', async ({ page }, info) => {
  await page.goto('/untitled-jumping-game/lighting-lab')
  const result = await page.evaluate(async () => {
    const [{ LightingRenderer }, { createPreviewRun }, { blankTrial }] = await Promise.all([
      import('/src/games/jumping/lightingRender.ts'), import('/src/games/jumping/challenge.ts'), import('/src/games/jumping/level.ts'),
    ])
    const level = { ...blankTrial(), width: 1200, height: 600, floor: 500, spawn: { x: 780, y: 500 }, goal: { x: 100, y: 500 },
      platforms: [{ x: 400, y: 200, w: 200, h: 300, material: 'steel',
        polygon: [[0, 0], [120, 0], [120, 50], [200, 50], [200, 300], [0, 300]] },
      { x: 650, y: 420, w: 80, h: 30 }],
      props: [{ kind: 'box', x: 640, y: 500, size: 30 }, { kind: 'ball', x: 790, y: 500, size: 30 }],
      robots: [{ x: 690, y: 500, left: 300, right: 1000 }] }
    const run = createPreviewRun(level)
    const renderers = [new LightingRenderer(), new LightingRenderer({ reuseExposureCorrection: false, cacheDayAmbient: false })]
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 384
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    const view = { x: 350.125, y: 120.25, zoom: .8, width: 512, height: 384 }
    let worst = 0, cachedFrames = 0, bytes = 0
    for (let frame = 0; frame < 15; frame++) {
      // Render-only coverage moves artwork through a fixed view and probes
      // low-ceiling indicator overlap; this does not certify a physical route.
      run.player.x = 600 + frame * 25; run.player.facing = frame % 2 ? -1 : 1
      run.props[0].x = 630 + frame * 4; run.props[0].angle = frame * .08
      run.props[1].x = 790 - frame * 9; run.props[1].angle = frame * .2
      run.robots[0].phase = frame % 3 ? 'recover' : 'windup'; run.robots[0].angle = Math.sin(frame) * .15
      run.activeTime = frame / 30
      const before = JSON.stringify(run.player)
      const pixels = renderers.map((renderer, index) => {
        const stats = renderer.render(ctx, run, { nightMode: false, ambient: 0, lights: [] }, view, 1 / 30)
        if (index === 0 && stats.dayAmbientCached) cachedFrames++
        bytes = Math.max(bytes, stats.bufferBytes)
        return ctx.getImageData(0, 0, 512, 384).data
      })
      if (JSON.stringify(run.player) !== before) throw new Error('Rendering must remain read-only')
      for (let i = 0; i < pixels[0].length; i++) worst = Math.max(worst, Math.abs(pixels[0][i] - pixels[1][i]))
    }
    renderers.forEach(renderer => renderer.dispose())
    return { worst, cachedFrames, bytes }
  })
  await info.attach('moving-mask-comparison', { body: JSON.stringify(result), contentType: 'application/json' })
  expect(result.worst).toBe(0)
  expect(result.cachedFrames).toBe(15)
  expect(result.bytes).toBeLessThanOrEqual(64 * 1024 * 1024)
})

test('immutable daylight corrections preserve the complete changing artwork in a rope and pickup scene', async ({ page }, info) => {
  await page.goto('/untitled-jumping-game/lighting-lab')
  const result = await page.evaluate(async () => {
    const [{ LightingRenderer }, { createPreviewRun }, fixture] = await Promise.all([
      import('/src/games/jumping/lightingRender.ts'), import('/src/games/jumping/challenge.ts'),
      fetch('/tests/fixtures/jumping/lighting-prototype.json').then(response => response.json()),
    ])
    const level = { ...fixture.level, mechanisms: [], triggers: [] }, run = createPreviewRun(level)
    const renderers = [new LightingRenderer(), new LightingRenderer({ reuseExposureCorrection: false, cacheDayAmbient: false })]
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 400
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    const view = { x: -30.125, y: 100.25, zoom: .6, width: 640, height: 400 }
    let worst = 0, cachedCorrections = 0, cachedTerrain = 0
    for (let frame = 0; frame < 12; frame++) {
      run.elapsed = frame / 30; run.pickupTime = frame / 30
      run.goalElapsed = frame / 30; run.goalLit = frame > 5
      for (const [i, node] of run.player.ropes[0].nodes.entries()) node.x += Math.sin(frame + i) * .2
      run.props[0].angle = frame * .05; run.player.x += 3
      const before = JSON.stringify(run.player)
      const pixels = renderers.map((renderer, index) => {
        const stats = renderer.render(ctx, run, { nightMode: false, ambient: 0, lights: [] }, view, 1 / 30)
        if (index === 0) {
          cachedCorrections += Number(stats.dayCorrectionsCached)
          cachedTerrain += Number(stats.dayAmbientCached)
        }
        if (stats.bufferBytes > 64 * 1024 * 1024) throw new Error('The existing buffer budget must remain unchanged')
        return ctx.getImageData(0, 0, 640, 400).data
      })
      if (JSON.stringify(run.player) !== before) throw new Error('Rendering must remain read-only')
      for (let i = 0; i < pixels[0].length; i++) worst = Math.max(worst, Math.abs(pixels[0][i] - pixels[1][i]))
    }
    renderers.forEach(renderer => renderer.dispose())
    return { worst, cachedCorrections, cachedTerrain }
  })
  await info.attach('immutable-field-comparison', { body: JSON.stringify(result), contentType: 'application/json' })
  expect(result.worst).toBe(0)
  expect(result.cachedCorrections).toBe(12)
  expect(result.cachedTerrain).toBe(0)
})

test('automatic lighting chooses a software drawing context for a CPU driver and preserves complete frames', async ({ page }, info) => {
  await page.goto('/untitled-jumping-game/lighting-lab')
  const result = await page.evaluate(async () => {
    const [{ LightingRenderer }, { createPreviewRun }, { blankTrial }] = await Promise.all([
      import('/src/games/jumping/lightingRender.ts'), import('/src/games/jumping/challenge.ts'), import('/src/games/jumping/level.ts'),
    ])
    const probe = document.createElement('canvas').getContext('webgl2', { alpha: true, antialias: false,
      depth: false, stencil: false, premultipliedAlpha: true, failIfMajorPerformanceCaveat: true })
    const extension = probe?.getExtension('WEBGL_debug_renderer_info')
    const driver = extension ? probe.getParameter(extension.UNMASKED_RENDERER_WEBGL) : ''
    probe?.getExtension('WEBGL_lose_context')?.loseContext()
    const softwareDriver = /SwiftShader|llvmpipe|softpipe|Software Rasterizer|Microsoft Basic Render Driver/i.test(driver)
    const level = { ...blankTrial(), width: 1200, height: 600, floor: 500, spawn: { x: 650, y: 500 }, goal: { x: 100, y: 500 },
      platforms: [{ x: 400, y: 200, w: 200, h: 300 }], props: [{ kind: 'box', x: 615, y: 500, size: 30 }] }
    const run = createPreviewRun(level)
    const renderers = [new LightingRenderer({ backend: 'auto' }), new LightingRenderer({ backend: 'auto', reuseExposureCorrection: false, cacheDayAmbient: false })]
    const canvases = renderers.map(() => { const c = document.createElement('canvas'); c.width = 512; c.height = 384; return c })
    const contexts = renderers.map((renderer, i) => renderer.drawingContext(canvases[i]))
    const softwareContexts = contexts.map(ctx => ctx.getContextAttributes().willReadFrequently)
    let worst = 0, frames = 0
    for (const nightMode of [false, true, false]) for (const powered of [false, true]) {
      const definition = { nightMode, ambient: 0, lights: powered ? [
        { id: 'lamp', x: 700, y: 360, direction: 110, spread: 100, intensity: 100, power: 'always' },
      ] : [] }
      const pixels = renderers.map((renderer, i) => {
        renderer.render(contexts[i], run, definition, { x: 380.125, y: 100.25, zoom: .8, width: 512, height: 384 }, .2)
        return contexts[i].getImageData(0, 0, 512, 384).data
      })
      for (let i = 0; i < pixels[0].length; i++) worst = Math.max(worst, Math.abs(pixels[0][i] - pixels[1][i]))
      frames++
    }
    renderers.forEach(renderer => renderer.dispose())
    return { worst, frames, softwareContexts, softwareDriver, driver }
  })
  await info.attach('automatic-context-comparison', { body: JSON.stringify(result), contentType: 'application/json' })
  expect(result.softwareContexts).toEqual([result.softwareDriver, result.softwareDriver])
  expect(result.frames).toBe(6)
  expect(result.worst).toBe(0)
})
