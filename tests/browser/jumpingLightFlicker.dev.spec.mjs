import { test, expect } from '@playwright/test'

for (const backend of ['canvas', 'gpu']) test(`${backend} flicker keeps exposure, shadows and lens output coherent through caching and EMP`, async ({ page }) => {
  await page.goto('/tests/fixtures/jumping/lighting-prototype.json')
  const result = await page.evaluate(async backend => {
    const [{ lightingHarness }, { LightingRenderer }, { GpuLightingField }] = await Promise.all([
      import('/tests/browser/helpers/lightingHarness.mjs'), import('/src/games/jumping/lightingRender.ts'), import('/src/games/jumping/lightingGpuField.ts'),
    ])
    if (backend === 'gpu') {
      const gpu = GpuLightingField.create(true)
      if (!gpu) return null
      gpu.dispose()
    }
    const h = await lightingHarness({ backend })
    const reference = new LightingRenderer({ backend }), ctx = h.canvas.getContext('2d', { willReadFrequently: true })
    h.canvas.width = h.view.width = 640; h.canvas.height = h.view.height = 360
    const lights = [{ ...h.fixture.lighting.lights[0], id: 'faulty-lamp', flicker: true }]
    const box = { ...h.run.props[0] }, lift = { ...h.run.mechanisms[0] }
    const definition = { nightMode: true, ambient: 0, lights }
    let expected = []
    reference.state.sources = () => expected.map(source => ({ ...source, flicker: false }))
    const samples = [], differences = []
    const render = dt => {
      const stats = h.renderer.render(ctx, h.run, definition, h.view, dt)
      const actual = ctx.getImageData(0, 0, 640, 360).data
      expected = stats.sources
      reference.render(ctx, h.run, definition, h.view, 0)
      const control = ctx.getImageData(0, 0, 640, 360).data
      differences.push(actual.reduce((max, channel, i) => Math.max(max, Math.abs(channel - control[i])), 0))
      samples.push({ fade: stats.sources[0].fade, edges: stats.edges, backend: stats.backend })
      return { actual, stats }
    }
    const initial = render(0)
    for (let i = 0; i < 100; i++) render(.05)
    const paused = render(0)
    const frozen = render(0)
    const pauseDifference = paused.actual.reduce((max, channel, i) => Math.max(max, Math.abs(channel - frozen.actual[i])), 0)
    h.run.empRemaining = 5
    for (let i = 0; i < 8; i++) render(.05)
    const outage = samples.at(-1).fade
    h.run.empRemaining = 0
    for (let i = 0; i < 100; i++) {
      if (i === 10) Object.assign(h.run.props[0], { x: 350, y: 300 })
      if (i === 12) h.run.props[0].angle += .3
      if (i === 14) h.run.mechanisms[0].y = 330
      render(.05)
    }
    Object.assign(h.run.props[0], box); Object.assign(h.run.mechanisms[0], lift)
    h.renderer.state.reset(); const reset = render(0)
    const resetDifference = initial.actual.reduce((max, channel, i) => Math.max(max, Math.abs(channel - reset.actual[i])), 0)
    h.renderer.dispose(); reference.dispose()
    return { samples, differences, pauseDifference, outage, resetDifference }
  }, backend)
  test.skip(!result, 'GPU lighting is unavailable; the Canvas case still runs.')
  expect(result.samples.every(s => s.backend === backend)).toBe(true)
  expect(result.samples.some(s => s.fade === 0)).toBe(true)
  expect(result.samples.some(s => s.fade > 0 && s.fade < .5)).toBe(true)
  // Scaling the cached 8-bit light field can round a channel differently from
  // constructing that same dim field directly, but cannot change its geometry.
  expect(Math.max(...result.differences)).toBeLessThanOrEqual(2)
  expect(result.pauseDifference).toBeLessThanOrEqual(1)
  expect(result.resetDifference).toBeLessThanOrEqual(1)
  expect(result.outage).toBe(0)
  if (backend === 'canvas') {
    const first = result.samples[0].edges
    expect(result.samples.some(s => s.fade > 0 && s.fade < .5 && s.edges < first)).toBe(true)
    for (const [i, sample] of result.samples.entries()) {
      if (i > 5 && i < 100 && sample.fade > 0 && result.samples[i - 1].fade === 0) expect(sample.edges).toBeLessThan(first)
    }
  }
})
