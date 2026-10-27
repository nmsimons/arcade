import { test, expect } from './helpers/test.mjs'

for (const backend of ['canvas', 'gpu']) test(`${backend}: terrain uses whole-piece region shades and the mixed-light frame stays dark`, async ({ page }, info) => {
  await page.goto('/lab')
  const samples = await page.evaluate(async backend => {
    const { blankTrial } = await import('/src/games/jumping/level.ts')
    const { createPreviewRun } = await import('/src/games/jumping/challenge.ts')
    const { LightingRenderer } = await import('/src/games/jumping/lightingRender.ts')
    const { EnvironmentLighting } = await import('/src/games/jumping/environmentLighting.ts')
    const level = { ...blankTrial(), version: 2, width: 1200, height: 900, floor: 900,
      entrance: { x: 500, y: 900 }, goal: { x: 700, y: 900 },
      platforms: [{ x: 0, y: 300, w: 300, h: 600 }, { x: 900, y: 0, w: 300, h: 900 }, { x: 400, y: 250, w: 400, h: 40 }],
      environment: { kind: 'landscape', horizon: 400, lighting: 'regions', baseLighting: 'day',
        walls: [{ kind: 'cave', x: 0, y: 500, w: 1200, h: 400 }] },
      lighting: { nightMode: true, ambient: 0, lights: [] } }
    const canvas = document.createElement('canvas'); canvas.width = 1240; canvas.height = 940
    const ctx = canvas.getContext('2d', { willReadFrequently: true }), renderer = new LightingRenderer({ backend })
    const view = { x: -20.15, y: -20.23, zoom: 1, width: 1240, height: 940 }
    const pixel = (x, y) => Array.from(ctx.getImageData(Math.round(x - view.x), Math.round(y - view.y), 1, 1).data).slice(0, 3)
    const render = current => {
      const stats = renderer.render(ctx, createPreviewRun(current), current.lighting, view, 0)
      return { sky: pixel(600, 200), mouth: pixel(600, 550), deep: pixel(600, 850),
        roof: pixel(150, 360), caveRock: pixel(150, 800), dayTerrain: pixel(600, 270),
        frame: [[-10,-10],[1210,-10],[-10,910],[1210,910],[-10,100],[-10,800]].map(([x,y]) => pixel(x,y)),
        join: [-2,-1,0,1,2].map(x => pixel(x, 350)),
        backend: stats.backend, bytes: stats.bufferBytes }
    }
    const night = render(level)
    const indoor = render({ ...level, environment: { ...level.environment, kind: 'interior' } })
    const day = render({ ...level, lighting: { ...level.lighting, nightMode: false } })
    const allDay = render({ ...level, environment: { ...level.environment, walls: [] } })
    const lamp = render({ ...level, lighting: { ...level.lighting,
      lights: [{ id: 'lamp', x: 450, y: 600, direction: 180, spread: 90, intensity: 100, power: 'always' }] } })
    const field = new EnvironmentLighting(), run = createPreviewRun(level), joins = []
    for (const zoom of [.35, .8, 1, 1.7]) for (const [x,y,axis] of [[0,350,'x'],[1200,350,'x'],[150,900,'y'],[1050,0,'y']]) {
      const view = { x: x - 50 / zoom + .15, y: y - 50 / zoom + .23, zoom, width: 100, height: 100 }
      const ambient = field.render(run, view).ambient.ctx
      const values = [-2,-1,0,1,2].map(offset => ambient.getImageData(
        Math.round((x-view.x)*zoom) + (axis === 'x' ? offset : 0),
        Math.round((y-view.y)*zoom) + (axis === 'y' ? offset : 0), 1, 1).data[0])
      joins.push({ zoom, x, y, range: Math.max(...values) - Math.min(...values) })
    }
    field.release()
    render(level)
    document.body.replaceChildren(canvas); document.body.style.margin = '0'
    renderer.dispose(); return { night, indoor, day, allDay, lamp, joins }
  }, backend)
  expect(samples.night.backend).toBe(backend)
  expect(samples.night.sky[2]).toBeGreaterThan(samples.night.sky[0] + 20)
  expect(samples.night.mouth[0]).toBeGreaterThan(samples.night.deep[0] + 20)
  expect(Math.max(...samples.night.roof)).toBeLessThan(75)
  expect(Math.max(...samples.night.caveRock)).toBeLessThan(75)
  expect(samples.night.dayTerrain[0]).toBeGreaterThan(samples.night.roof[0] + 60)
  expect(samples.indoor.dayTerrain[0]).toBeGreaterThan(samples.indoor.roof[0] + 60)
  expect(samples.indoor.sky[0]).toBeGreaterThan(200)
  expect(Math.max(...samples.indoor.sky) - Math.min(...samples.indoor.sky)).toBeLessThan(12)
  expect(samples.indoor.mouth[0]).toBeGreaterThan(samples.indoor.deep[0] + 20)
  expect(Math.max(...samples.indoor.roof)).toBeLessThan(75)
  expect(Math.abs(samples.indoor.roof[0] - samples.night.roof[0])).toBeLessThanOrEqual(1)
  expect(samples.day.roof[0]).toBeGreaterThan(samples.night.roof[0] + 60)
  for (const render of [samples.night, samples.indoor, samples.lamp]) {
    for (const pixel of render.frame) expect(Math.max(...pixel)).toBeLessThan(75)
    expect(Math.max(...render.frame.map(p => p[0])) - Math.min(...render.frame.map(p => p[0]))).toBeLessThanOrEqual(1)
    expect(Math.max(...render.join.map(p => p[0])) - Math.min(...render.join.map(p => p[0]))).toBeLessThanOrEqual(2)
  }
  expect(samples.allDay.roof[0]).toBeGreaterThan(samples.night.roof[0] + 60)
  expect(samples.allDay.frame[0][0]).toBeGreaterThan(samples.night.frame[0][0] + 60)
  // Subtracting the lamp correction can round by one 8-bit gray value.
  expect(Math.abs(samples.lamp.roof[0] - samples.night.roof[0])).toBeLessThanOrEqual(1)
  expect(samples.night.bytes).toBeLessThan(64 * 1024 * 1024)
  for (const join of samples.joins) expect(join.range, JSON.stringify(join)).toBeLessThanOrEqual(1)
  await page.locator('canvas').screenshot({ path: info.outputPath(`outdoor-night-silhouettes-${backend}.png`) })
})
