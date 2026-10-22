import { test, expect } from './helpers/test.mjs'

const seams = [
  ...['stone', 'earth', 'chalk', 'steel'].map(material => ({ edge: 'floor', material, axis: 'y', boundary: 600,
    shape: { x: 100, y: 400, w: 800, h: 200, polygon: [[0, 200], [200, 60], [600, 0], [800, 100], [800, 200]], material },
    cover: { x: 450, y: 580, w: 100, h: 40, material } })),
  { edge: 'ceiling', material: 'stone', axis: 'y', boundary: 0, shape: { x: 100, y: 0, w: 800, h: 200 }, cover: { x: 450, y: -20, w: 100, h: 40 } },
  { edge: 'left', material: 'stone', axis: 'x', boundary: 0, shape: { x: 0, y: 100, w: 200, h: 400 }, cover: { x: -20, y: 250, w: 40, h: 100 } },
  { edge: 'right', material: 'stone', axis: 'x', boundary: 1000, shape: { x: 800, y: 100, w: 200, h: 400 }, cover: { x: 980, y: 250, w: 40, h: 100 } },
]

for (const seam of [...seams, ...seams.map(seam => ({ ...seam, separated: true }))]) test(`${seam.material} ${seam.edge}${seam.separated ? ' with another material in between' : ''} forms a seamless silhouette at fractional zoom`, async ({ page }, info) => {
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
      h.run.level = { ...h.run.level, platforms: [c.shape, ...(c.separated ? [{ x: 920, y: 520, w: 20, h: 20, material: c.material === 'chalk' ? 'earth' : 'chalk' }] : [])], floorMaterial: c.material }
      h.view.zoom = zoom; h.view.x = c.axis === 'x' ? c.boundary - (640 + phase) / zoom : 0
      h.view.y = c.axis === 'y' ? c.boundary - (450 + phase) / zoom : -40
      h.run.terrain = levelTerrain(h.run.level)
      const joined = h.render(ambient), joinedPlain = c.separated && h.fullBright()
      // A continuous solid is the reference for two surfaces with no air gap.
      h.run.terrain = [...h.run.terrain, c.cover]
      const continuous = h.render(ambient), continuousPlain = c.separated && h.fullBright()
      for (let offset = -2; offset <= 2; offset++) {
        const x = c.axis === 'x' ? 640 + offset : Math.round(500 * zoom)
        const y = c.axis === 'y' ? 450 + offset : Math.round(340 * zoom)
        const i = (y * h.canvas.width + x) * 4
        samples.push({ edge: c.edge, material: c.material, ambient, zoom, phase, offset, joined: [...joined.pixels.slice(i, i + 3)], continuous: [...continuous.pixels.slice(i, i + 3)],
          ...(c.separated ? { plainJoined: [...joinedPlain.pixels.slice(i, i + 3)], plainContinuous: [...continuousPlain.pixels.slice(i, i + 3)] } : {}) })
      }
    }
    h.run.terrain = levelTerrain(h.run.level); h.render(0)
    const screenshot = h.canvas.toDataURL()
    h.renderer.dispose(); return { samples, screenshot }
  }, seam)
  await info.attach('floor-seam', { body: Buffer.from(result.screenshot.split(',')[1], 'base64'), contentType: 'image/png' })
  for (const sample of result.samples) {
    if (seam.separated) {
      // Blending the same color again at an antialiased edge can round a
      // channel by one step compared with an opaque overlapping reference.
      for (const [actual, expected] of [[sample.plainJoined, sample.plainContinuous], [sample.joined, sample.continuous]]) {
        actual.forEach((channel, i) => expect(Math.abs(channel - expected[i]), JSON.stringify(sample)).toBeLessThanOrEqual(1))
      }
    } else expect(sample.joined, JSON.stringify(sample)).toEqual(sample.continuous)
  }
})


test('terrain batching preserves real gaps and overlapping material order', async ({ page }) => {
  await page.goto('/lab/lighting-lab')
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

const boundaryJoins = [
  { edge: 'left', axis: 'x', boundary: 0, shape: { x: 0, y: 100, w: 200, h: 400 }, extended: { x: -4, y: 100, w: 204, h: 400 },
    gap: { x: 2, y: 100, w: 198, h: 400 }, sample: [1, 300] },
  { edge: 'right', axis: 'x', boundary: 1000, shape: { x: 800, y: 100, w: 200, h: 400 }, extended: { x: 800, y: 100, w: 204, h: 400 },
    gap: { x: 800, y: 100, w: 198, h: 400 }, sample: [999, 300] },
  { edge: 'ceiling', axis: 'y', boundary: 0, shape: { x: 100, y: 0, w: 800, h: 200 }, extended: { x: 100, y: -4, w: 800, h: 204 },
    gap: { x: 100, y: 2, w: 800, h: 198 }, sample: [500, 1] },
  { edge: 'floor', axis: 'y', boundary: 600, shape: { x: 100, y: 400, w: 800, h: 200 }, extended: { x: 100, y: 400, w: 800, h: 204 },
    gap: { x: 100, y: 400, w: 800, h: 198 }, sample: [500, 599] },
]

const internalJoins = [
  { name: 'vertical steel', material: 'steel', sample: [520, 400],
    shapes: [{ x: 400, y: 200, w: 120, h: 300 }, { x: 520, y: 300, w: 160, h: 200 }],
    whole: { x: 400, y: 200, w: 280, h: 300, polygon: [[0,0],[120,0],[120,100],[280,100],[280,300],[0,300]] } },
  { name: 'horizontal stone', material: 'stone', sample: [600, 320],
    shapes: [{ x: 400, y: 200, w: 280, h: 120 }, { x: 500, y: 320, w: 180, h: 180 }],
    whole: { x: 400, y: 200, w: 280, h: 300, polygon: [[0,0],[280,0],[280,300],[100,300],[100,120],[0,120]] } },
  { name: 'diagonal earth', material: 'earth', sample: [540, 350],
    shapes: [{ x: 400, y: 200, w: 280, h: 300, polygon: [[0,0],[280,300],[0,300]] },
      { x: 400, y: 200, w: 280, h: 300, polygon: [[0,0],[280,0],[280,300]] }],
    whole: { x: 400, y: 200, w: 280, h: 300 } },
]

for (const join of internalJoins) test(`${join.name}: internal joins stay seamless across separate material batches`, async ({ page }, info) => {
  test.setTimeout(60_000)
  await page.goto('/tests/fixtures/jumping/lighting-prototype.json')
  const result = await page.evaluate(async c => {
    const { lightingHarness } = await import('/tests/browser/helpers/lightingHarness.mjs')
    const { levelTerrain } = await import('/src/games/jumping/level.ts')
    const h = await lightingHarness(), samples = []
    h.run.props = []; h.run.robots = []; h.run.mechanisms = []; h.run.triggers = []; h.run.pickups = []
    h.run.level = { ...h.run.level, width: 1000, height: 600, floor: 600, texts: [], timers: [], wallLights: [], triggers: [],
      climbables: { ropes: [], ladders: [] } }
    const unrelated = { x: 900, y: 100, w: 30, h: 30, material: 'chalk' }
    const scene = platforms => {
      h.run.level = { ...h.run.level, platforms }
      h.run.terrain = levelTerrain(h.run.level)
    }
    for (const zoom of [.63, 1, 1.37, 2]) for (const phase of [.15, .5, .85]) for (const mode of ['plain', 'day', 'night']) {
      h.view.zoom = zoom; h.view.x = c.sample[0] - (640 + phase) / zoom; h.view.y = c.sample[1] - (450 + phase) / zoom
      const render = () => mode === 'plain' ? h.fullBright() : h.render(mode === 'day' ? 100 : 0)
      scene([{ ...c.shapes[0], material: c.material }, unrelated, { ...c.shapes[1], material: c.material }])
      const joined = render()
      scene([{ ...c.whole, material: c.material }, unrelated])
      const continuous = render()
      for (let y = 447; y <= 453; y++) for (let x = 637; x <= 643; x++) {
        const i = (y * h.canvas.width + x) * 4
        samples.push({ zoom, phase, mode, x, y, joined: [...joined.pixels.slice(i, i + 3)], continuous: [...continuous.pixels.slice(i, i + 3)] })
      }
    }
    scene([{ ...c.shapes[0], material: c.material }, unrelated, { ...c.shapes[1], material: c.material }])
    h.view.zoom = 2; h.view.x = 340; h.view.y = 140; h.fullBright()
    const screenshot = h.canvas.toDataURL(); h.renderer.dispose()
    return { samples, screenshot }
  }, join)
  await info.attach('internal-terrain-join', { body: Buffer.from(result.screenshot.split(',')[1], 'base64'), contentType: 'image/png' })
  // A sloped edge can blend a texture channel twice and round it by one step.
  // The separate transparent-canvas check below requires fully opaque joins.
  for (const s of result.samples) s.joined.forEach((channel, i) =>
    expect(Math.abs(channel - s.continuous[i]), JSON.stringify(s)).toBeLessThanOrEqual(1))
})

test('internal joins between different materials remain opaque without painting across gaps', async ({ page }) => {
  await page.goto('/tests/fixtures/jumping/lighting-prototype.json')
  const result = await page.evaluate(async scenes => {
    const { drawTerrain } = await import('/src/games/jumping/render.ts')
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 100
    const ctx = canvas.getContext('2d', { willReadFrequently: true }), samples = []
    for (const scene of scenes) for (const zoom of [.63, 1, 1.37, 2]) for (const phase of [.15, .5, .85]) for (const gap of scene.name === 'vertical steel' ? [0, 2] : [0]) {
      ctx.resetTransform(); ctx.clearRect(0, 0, 100, 100)
      ctx.setTransform(zoom, 0, 0, zoom, 50 + phase - scene.sample[0] * zoom, 50 + phase - scene.sample[1] * zoom)
      drawTerrain(ctx, [{ ...scene.shapes[0], material: 'steel' },
        { ...scene.shapes[1], x: scene.shapes[1].x + gap, material: 'earth' }])
      samples.push({ name: scene.name, zoom, phase, gap, alpha: ctx.getImageData(50, 50, 1, 1).data[3] })
    }
    return samples
  }, internalJoins)
  for (const s of result) {
    if (s.gap) expect(s.alpha, JSON.stringify(s)).toBeLessThan(255)
    else expect(s.alpha, JSON.stringify(s)).toBe(255)
  }
})

for (const join of boundaryJoins) test(`${join.edge}: different materials meet cleanly and real gaps remain visible`, async ({ page }, info) => {
  await page.goto('/tests/fixtures/jumping/lighting-prototype.json')
  const result = await page.evaluate(async c => {
    const { lightingHarness } = await import('/tests/browser/helpers/lightingHarness.mjs')
    const { levelTerrain } = await import('/src/games/jumping/level.ts')
    const h = await lightingHarness(), samples = []
    h.run.props = []; h.run.robots = []; h.run.mechanisms = []; h.run.triggers = []; h.run.pickups = []
    h.run.level = { ...h.run.level, width: 1000, floor: 600, height: 600, floorMaterial: 'stone', texts: [], timers: [], triggers: [],
      climbables: { ropes: [], ladders: [] } }
    const scene = shape => {
      h.run.level = { ...h.run.level, platforms: shape ? [{ ...shape, material: 'earth' }] : [] }
      h.run.terrain = levelTerrain(h.run.level)
    }
    for (const zoom of [.63, .81, 1, 1.37, 2]) for (const phase of [.15, .5, .85]) {
      h.view.zoom = zoom
      h.view.x = (c.axis === 'x' ? c.boundary : 500) - (640 + phase) / zoom
      h.view.y = (c.axis === 'y' ? c.boundary : 300) - (450 + phase) / zoom
      scene(c.shape); const joined = h.fullBright()
      // An overlapping reference has no separately antialiased edge at the join.
      scene(c.extended); const continuous = h.fullBright()
      for (let offset = -2; offset <= 2; offset++) {
        const x = 640 + (c.axis === 'x' ? offset : 0), y = 450 + (c.axis === 'y' ? offset : 0)
        const i = (y * h.canvas.width + x) * 4
        samples.push({ zoom, phase, offset, joined: [...joined.pixels.slice(i, i + 3)], continuous: [...continuous.pixels.slice(i, i + 3)] })
      }
    }
    h.view.zoom = 2; h.view.x = c.sample[0] - 320; h.view.y = c.sample[1] - 225
    scene(c.gap); const gap = h.pixel(h.fullBright(), ...c.sample)
    scene(null); const air = h.pixel(h.fullBright(), ...c.sample)
    scene(c.shape); h.fullBright(); const screenshot = h.canvas.toDataURL()
    h.renderer.dispose(); return { samples, gap, air, screenshot }
  }, join)
  await info.attach(`${join.edge}-material-join`, { body: Buffer.from(result.screenshot.split(',')[1], 'base64'), contentType: 'image/png' })
  for (const sample of result.samples) expect(sample.joined, JSON.stringify(sample)).toEqual(sample.continuous)
  expect(result.gap).toEqual(result.air)
})
