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
