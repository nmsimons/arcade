import { test, expect } from './helpers/test.mjs'

test('beam dust moves only in illuminated air and freezes with simulation time or an outage', async ({ page }) => {
  await page.goto('/tests/fixtures/jumping/lighting-prototype.json')
  const result = await page.evaluate(async () => {
    const { lightingHarness } = await import('/tests/browser/helpers/lightingHarness.mjs')
    const { exposureAt, staticCasters, dynamicCasters } = await import('/src/games/jumping/lightingModel.ts')
    const h = await lightingHarness()
    h.run.robots = []; h.run.pickups = []
    h.run.level.gravityPlates = []
    const lamp = { id: 'dust-lamp', x: 360, y: 30, direction: 90, spread: 100, intensity: 100, power: 'always' }
    const groups = [...staticCasters(h.run), ...dynamicCasters(h.run)]
    const lightBounds = { width: h.run.level.width, height: h.run.level.floor }
    const snapshot = JSON.stringify(h.run)
    const first = h.render(0, [lamp], 1)
    const paused = h.render(0, [lamp], 0)
    const unchanged = JSON.stringify(h.run) === snapshot
    h.run.activeTime = 30
    const drifted = h.render(0, [lamp], 0)
    h.run.empRemaining = 5
    const outage = h.render(0, [lamp], 1)
    h.run.activeTime = 60
    const laterOutage = h.render(0, [lamp], 0)
    let changed = 0, leaked = 0
    for (let i = 0; i < first.pixels.length; i += 4) {
      if (first.pixels.slice(i, i + 3).some((v, j) => v !== drifted.pixels[i + j])) {
        changed++
        const x = i / 4 % h.canvas.width + h.view.x, y = Math.floor(i / 4 / h.canvas.width) + h.view.y
        // Antialiased pixels may straddle a cone or shadow edge. At least
        // one corner must receive light in the independent geometric model.
        if (![0, 1].some(dx => [0, 1].some(dy =>
          exposureAt(0, [{ ...lamp, fade: 1 }], groups, x + dx, y + dy, lightBounds) > .35))) leaked++
      }
    }
    const result = { changed, leaked, unchanged, paused: h.difference(first, paused), outage: h.difference(outage, laterOutage) }
    h.renderer.dispose(); return result
  })
  expect(result.changed).toBeGreaterThan(10)
  expect(result.changed).toBeLessThan(3000)
  expect(result.leaked).toBe(0)
  expect(result.unchanged).toBe(true)
  expect(result.paused).toBe(0)
  expect(result.outage).toBe(0)
})
