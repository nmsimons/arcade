import { test, expect } from '@playwright/test'

test('resting shadows reuse raster fields without stale pixels when objects move, rotate or disappear', async ({ page }) => {
  await page.goto('/tests/fixtures/jumping/lighting-prototype.json')
  const result = await page.evaluate(async () => {
    const { lightingHarness } = await import('/tests/browser/helpers/lightingHarness.mjs')
    const { LightingRenderer } = await import('/src/games/jumping/lightingRender.ts')
    const h = await lightingHarness(), lights = structuredClone(h.fixture.lighting.lights.slice(0, 2))
    const differences = [], edges = []
    const check = () => {
      const frame = h.render(0, lights), fresh = new LightingRenderer()
      fresh.render(h.canvas.getContext('2d'), h.run, { nightMode: true, ambient: 0, lights }, h.view, .2)
      differences.push(h.difference(frame, { pixels: h.canvas.getContext('2d').getImageData(0, 0, 1280, 720).data }))
      fresh.dispose(); edges.push(frame.stats.edges)
      return frame
    }
    const original = check()
    for (let i = 0; i < 5; i++) check()
    const restedEdges = edges.at(-1)
    // Player animation must never freeze when the room's other shadows are cached.
    h.run.player.x += 90; h.run.player.stride += .7; check()
    h.run.props[0].x += 50; h.run.props[0].angle += .25; check()
    for (let i = 0; i < 4; i++) { h.run.props[0].x += 10; check() }
    for (let i = 0; i < 4; i++) check()
    h.run.robots[0].x += 70; h.run.robots[0].angle = .2; check()
    h.run.mechanisms[0].y -= 80; check()
    for (let i = 0; i < 4; i++) check()
    h.run.props.splice(0, 1); h.run.robots = []; check()
    lights[0].direction += 15; check()
    h.run.empRemaining = 5; check()
    h.run.empRemaining = 0; check()
    h.renderer.release(); const restored = check()
    h.renderer.dispose()
    return { differences, firstEdges: edges[0], restedEdges, bytes: original.stats.bufferBytes, restoredBytes: restored.stats.bufferBytes }
  })
  // Regrouping fractional shadow masks into cached layers can round an 8-bit
  // channel once differently; geometry and stale shadow errors are far larger.
  for (const difference of result.differences) expect(difference).toBeLessThanOrEqual(1)
  expect(result.restedEdges).toBeLessThan(result.firstEdges)
  expect(result.restoredBytes).toBe(result.bytes)
})
