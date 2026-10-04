import { test, expect } from '@playwright/test'

test('default structural shadows preserve gates and full shadow experiments remain reversible', async ({ page }) => {
  await page.goto('/tests/fixtures/jumping/lighting-prototype.json')
  const result = await page.evaluate(async () => {
    const { lightingHarness } = await import('/tests/browser/helpers/lightingHarness.mjs')
    const h = await lightingHarness()
    h.run.level = { ...h.run.level, platforms: [], texts: [], timers: [], triggers: [], climbables: { ropes: [], ladders: [] } }
    h.run.terrain = []; h.run.robots = []; h.run.pickups = []; h.run.triggers = []
    h.run.props = [{ kind: 'box', x: 450, y: 340, size: 80, angle: 0 }]
    h.run.player.x = 1100
    h.run.mechanisms = [{ x: 450, y: 130, definition: { id: 'gate', kind: 'gate', x: 450, y: 130, w: 30, h: 60, travel: 80 } }]
    const lights = [{ id: 'light', x: 100, y: 100, direction: 20, spread: 100, intensity: 100, power: 'always' }]
    const draw = shadows => h.render(0, lights, .2, undefined, true, shadows)
    for (let i = 0; i < 4; i++) draw('full')
    const full = draw('full')
    const reduced = draw('structural')
    h.renderer.render(h.canvas.getContext('2d'), h.run, { ambient: 0, nightMode: true, lights }, h.view, .2)
    const defaults = { pixels: h.canvas.getContext('2d').getImageData(0, 0, 1280, 720).data }
    for (let i = 0; i < 4; i++) draw('structural')
    const restored = draw('full')
    const result = { difference: h.difference(full, restored), defaultDifference: h.difference(reduced, defaults),
      gate: [h.pixel(full, 700, 220), h.pixel(reduced, 700, 220)],
      box: [h.pixel(full, 700, 460), h.pixel(reduced, 700, 460)] }
    h.renderer.dispose(); return result
  })
  expect(result.difference).toBeLessThanOrEqual(1)
  expect(result.defaultDifference).toBeLessThanOrEqual(1)
  expect(result.gate[0]).toEqual(result.gate[1])
  expect(result.box[1][0]).toBeGreaterThan(result.box[0][0])
})

for (const nightMode of [false, true]) test(`${nightMode ? 'night' : 'day'}: six stationary lights reuse shadows within the memory budget, including after resize`, async ({ page }) => {
  await page.goto('/tests/fixtures/jumping/lighting-prototype.json')
  const result = await page.evaluate(async nightMode => {
    const { lightingHarness } = await import('/tests/browser/helpers/lightingHarness.mjs')
    const h = await lightingHarness()
    const lights = Array.from({ length: 6 }, (_, i) => ({ ...h.fixture.lighting.lights[0], id: `light-${i}`, x: 100 + i * 170, y: 50 }))
    const draw = () => h.render(0, lights, .2, undefined, nightMode)
    const cold = draw()
    const initial = draw()
    let settled
    for (let i = 0; i < 4; i++) settled = draw()
    const difference = h.difference(initial, settled)
    h.view.width = 1600; h.view.height = 1250; h.canvas.width = 1600; h.canvas.height = 1250
    const resized = h.renderer.render(h.canvas.getContext('2d'), h.run, { ambient: 0, nightMode, lights }, h.view, .2)
    h.renderer.dispose()
    return { first: cold.stats.edges, settled: settled.stats.edges, difference, bytes: [initial.stats.bufferBytes, resized.bufferBytes] }
  }, nightMode)
  expect(result.settled).toBeLessThan(result.first)
  expect(result.difference).toBeLessThanOrEqual(1)
  for (const bytes of result.bytes) expect(bytes).toBeLessThanOrEqual(64 * 1024 * 1024)
})
