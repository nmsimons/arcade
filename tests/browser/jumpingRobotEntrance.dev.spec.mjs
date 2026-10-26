import { test, expect } from './helpers/test.mjs'

for (const nightMode of [false, true]) test(`${nightMode ? 'night' : 'day'} portal frames retain complete doors and current silhouettes through lighting caches`, async ({ page }) => {
  await page.goto('/tests/fixtures/jumping/lighting-prototype.json')
  const result = await page.evaluate(async nightMode => {
    const [{ createRun, stepRun }, { blankTrial }, { NEUTRAL_INPUT, STEP }, { LightingRenderer }] = await Promise.all([
      import('/src/games/jumping/challenge.ts'), import('/src/games/jumping/level.ts'),
      import('/src/games/jumping/model.ts'), import('/src/games/jumping/lightingRender.ts'),
    ])
    const level = { ...blankTrial(), width: 1200, height: 600, floor: 600,
      entrance: { x: 300, y: 600 }, goal: { x: 100, y: 600 },
      robots: [{ kind: 'repulsor', x: 1000, y: 600, left: 26, right: 1174 }] }
    const run = createRun(level), canvas = document.createElement('canvas')
    canvas.width = 640; canvas.height = 360
    const ctx = canvas.getContext('2d', { willReadFrequently: true }), renderer = new LightingRenderer({ backend: 'canvas' })
    const view = { x: 0, y: 0, zoom: .5, width: 640, height: 360 }
    const definition = { nightMode, ambient: 0, lights: nightMode ? [
      { id: 'lamp', x: 100, y: 420, direction: 10, spread: 100, intensity: 100, power: 'always' },
    ] : [] }
    const differences = [], cached = []
    let elapsed = 0
    for (const time of [0, .1, .2, .4, .7, 1.1, 1.25, 1.35, 1.4, 1.6]) {
      while (elapsed < time - 1e-9) {
        const dt = Math.min(STEP, time - elapsed)
        stepRun(run, NEUTRAL_INPUT, dt); elapsed += dt
      }
      const before = JSON.stringify(run)
      const stats = renderer.render(ctx, run, definition, view, .016, undefined, false, 'full')
      const pixels = ctx.getImageData(0, 0, 640, 360).data
      const fresh = new LightingRenderer({ backend: 'canvas', cacheDayBackground: false })
      fresh.render(ctx, run, definition, view, .016, undefined, false, 'full')
      const expected = ctx.getImageData(0, 0, 640, 360).data
      let worst = 0, at = 0
      for (let i = 0; i < pixels.length; i++) if (Math.abs(pixels[i] - expected[i]) > worst) {
        worst = Math.abs(pixels[i] - expected[i]); at = i
      }
      differences.push({ time, worst, x: Math.floor(at / 4) % 640, y: Math.floor(at / 2560), actual: pixels[at], expected: expected[at] }); cached.push(!!stats.dayBackgroundCached)
      if (JSON.stringify(run) !== before) throw new Error('Rendering changed the simulation')
      fresh.dispose()
    }
    renderer.dispose()
    return { differences, cached }
  }, nightMode)
  expect(result.differences.filter(frame => frame.worst > 1)).toEqual([])
  if (!nightMode) expect(result.cached).toContain(true)
})
