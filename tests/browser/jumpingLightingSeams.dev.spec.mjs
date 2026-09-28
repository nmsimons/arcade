import { test, expect } from './helpers/test.mjs'

const seams = [
  ...['stone', 'earth', 'chalk', 'steel'].map(material => ({ edge: 'floor', material, axis: 'y', boundary: 600,
    shape: { x: 100, y: 400, w: 800, h: 200, polygon: [[0, 200], [200, 60], [600, 0], [800, 100], [800, 200]], material },
    cover: { x: 450, y: 580, w: 100, h: 40, material } })),
  { edge: 'ceiling', material: 'stone', axis: 'y', boundary: 0, shape: { x: 100, y: 0, w: 800, h: 200 }, cover: { x: 450, y: -20, w: 100, h: 40 } },
  { edge: 'left', material: 'stone', axis: 'x', boundary: 0, shape: { x: 0, y: 100, w: 200, h: 400 }, cover: { x: -20, y: 250, w: 40, h: 100 } },
  { edge: 'right', material: 'stone', axis: 'x', boundary: 1000, shape: { x: 800, y: 100, w: 200, h: 400 }, cover: { x: 980, y: 250, w: 40, h: 100 } },
]

for (const seam of seams) test(`${seam.material} ${seam.edge} forms a seamless silhouette at fractional zoom`, async ({ page }, info) => {
  // Separate materials/boundaries keep each software-rendered sweep bounded.
  // The inert fixture also avoids running the lab's animation loop in parallel.
  await page.goto('/tests/fixtures/jumping/lighting-prototype.json')
  const result = await page.evaluate(async c => {
    const { lightingHarness } = await import('/tests/browser/helpers/lightingHarness.mjs')
    const { levelTerrain } = await import('/src/games/jumping/level.ts')
    const h = await lightingHarness(), samples = []
    h.run.props = []; h.run.robots = []; h.run.mechanisms = []; h.run.triggers = []; h.run.pickups = []
    h.run.level = { ...h.run.level, width: 1000, floor: 600, height: 600, texts: [], timers: [], triggers: [], climbables: { ropes: [], ladders: [] },
      platforms: [{ x: 100, y: 400, w: 800, h: 200, material: 'chalk' }], floorMaterial: 'chalk' }
    for (const ambient of [0, 100]) for (const zoom of [.63, .81, 1, 1.37, 2]) for (const phase of [.15, .5, .85]) {
      h.run.level = { ...h.run.level, platforms: [c.shape], floorMaterial: c.material }
      h.view.zoom = zoom; h.view.x = c.axis === 'x' ? c.boundary - (640 + phase) / zoom : 0
      h.view.y = c.axis === 'y' ? c.boundary - (450 + phase) / zoom : -40
      h.run.terrain = levelTerrain(h.run.level)
      const joined = h.render(ambient)
      // A continuous solid is the reference for two surfaces with no air gap.
      h.run.terrain = [...h.run.terrain, c.cover]
      const continuous = h.render(ambient)
      for (let offset = -2; offset <= 2; offset++) {
        const x = c.axis === 'x' ? 640 + offset : Math.round(500 * zoom)
        const y = c.axis === 'y' ? 450 + offset : Math.round(340 * zoom)
        const i = (y * h.canvas.width + x) * 4
        samples.push({ edge: c.edge, material: c.material, ambient, zoom, phase, offset, joined: [...joined.pixels.slice(i, i + 3)], continuous: [...continuous.pixels.slice(i, i + 3)] })
      }
    }
    h.run.terrain = levelTerrain(h.run.level); h.render(0)
    const screenshot = h.canvas.toDataURL()
    h.renderer.dispose(); return { samples, screenshot }
  }, seam)
  await info.attach('floor-seam', { body: Buffer.from(result.screenshot.split(',')[1], 'base64'), contentType: 'image/png' })
  for (const sample of result.samples) expect(sample.joined, JSON.stringify(sample)).toEqual(sample.continuous)
})


test('terrain batching preserves real gaps and overlapping material order', async ({ page }) => {
  await page.goto('/untitled-jumping-game/lighting-lab')
  const result = await page.evaluate(async () => {
    const { drawTerrain } = await import('/src/games/jumping/render.ts')
    const { terrainFill } = await import('/src/games/jumping/terrainMaterials.ts')
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 100
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 100, 100)
    drawTerrain(ctx, [{ x: 0, y: 0, w: 100, h: 49, material: 'chalk' }, { x: 0, y: 51, w: 100, h: 49, material: 'chalk' }])
    const gap = [...ctx.getImageData(40, 50, 1, 1).data]
    drawTerrain(ctx, [{ x: 0, y: 0, w: 100, h: 100, material: 'stone' }, { x: 0, y: 0, w: 100, h: 100, material: 'earth' },
      { x: 0, y: 0, w: 100, h: 100 }, { x: 0, y: 0, w: 100, h: 100, material: 'steel' }])
    const top = [...ctx.getImageData(40, 50, 1, 1).data]
    ctx.fillStyle = terrainFill(ctx, 'steel'); ctx.fillRect(0, 0, 100, 100)
    const expected = [...ctx.getImageData(40, 50, 1, 1).data]
    return { gap, top, expected }
  })
  expect(result.gap).toEqual([255, 255, 255, 255])
  expect(result.top).toEqual(result.expected)
})
