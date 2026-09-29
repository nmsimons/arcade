import { test, expect } from './helpers/test.mjs'

test('full beams stay faint and consistent regardless of legacy ambient and disappear when night mode is off', async ({ page }) => {
  await page.goto('/untitled-jumping-game/lighting-lab')
  const result = await page.evaluate(async () => {
    const { lightingHarness } = await import('/tests/browser/helpers/lightingHarness.mjs')
    const h = await lightingHarness()
    h.run.props = []; h.run.robots = []; h.run.mechanisms = []; h.run.triggers = []; h.run.pickups = []
    h.run.level = { ...h.run.level, width: 12000, platforms: [], texts: [], timers: [], triggers: [], climbables: { ropes: [], ladders: [] } }; h.run.terrain = []
    const source = { id: 'beam', x: 100, y: 200, intensity: 100, direction: 0, spread: 70, power: 'always' }
    h.render(0, [source]) // Settle the first-readback raster path before comparing fields.
    const delta = (lit, base, x, y) => h.pixel(lit, x, y).map((c, i) => c - h.pixel(base, x, y)[i])
    const samples = []
    for (const [ambient, nightMode] of [[0, true], [33, true], [66, true], [99, true], [100, true], [100, false]]) {
      const base = h.render(ambient, [], .2, undefined, nightMode), lit = h.render(ambient, [source], .2, undefined, nightMode)
      samples.push({ ambient, nightMode, near: delta(lit, base, 300, 200), far: delta(lit, base, 900, 200), source: delta(lit, base, 115, 200), outside: delta(lit, base, 200, 450) })
    }
    h.view.x = 10000
    const base = h.render(0), on = h.render(0, [source])
    const distant = delta(on, base, 11000, 200)
    h.run.empRemaining = 5
    const fading = delta(h.render(0, [source], .1), base, 11000, 200)
    const off = delta(h.render(0, [source], .1), base, 11000, 200)
    h.renderer.dispose(); return { samples, distant, fading, off }
  })
  let previous = 18
  for (const sample of result.samples) {
    expect(sample.outside).toEqual([0, 0, 0])
    expect(sample.near).toEqual(sample.far)
    const strength = Math.max(...sample.far)
    expect(strength).toBeLessThanOrEqual(previous)
    if (sample.nightMode) {
      expect(strength).toBeGreaterThan(0); expect(strength).toBeLessThanOrEqual(18)
      expect(sample.far).toEqual(result.samples[0].far)
      expect(sample.source).toEqual(result.samples[0].source)
    }
    else expect(sample.far).toEqual([0, 0, 0])
    if (sample.nightMode) expect(Math.max(...sample.source)).toBeGreaterThan(strength)
    else expect(sample.source).toEqual([0, 0, 0])
    previous = strength
  }
  expect(result.distant).toEqual(result.samples[0].far)
  expect(Math.max(...result.fading)).toBeGreaterThan(0)
  expect(Math.max(...result.fading)).toBeLessThan(Math.max(...result.distant))
  expect(result.off).toEqual([0, 0, 0])
})

test('airborne beams stay behind clocks, collectibles, wall text and the player', async ({ page }) => {
  await page.goto('/untitled-jumping-game/lighting-lab')
  const result = await page.evaluate(async () => {
    const { lightingHarness } = await import('/tests/browser/helpers/lightingHarness.mjs')
    const h = await lightingHarness()
    h.run.props = []; h.run.robots = []; h.run.mechanisms = []; h.run.triggers = []
    h.run.level = { ...h.run.level, platforms: [], timers: [{ x: 650, y: 180 }], triggers: [], climbables: { ropes: [], ladders: [] },
      // Larger glyphs provide opaque interiors with Windows and Linux fonts.
      texts: [{ x: 800, y: 180, w: 130, h: 50, fontSize: 32, align: 'left', style: 'official', text: 'BEAM' }] }
    h.run.terrain = []; h.run.player.x = 980; h.run.player.y = 240
    h.run.pickups = [{ definition: { kind: 'coin', x: 450, y: 200 }, collectedAge: null }]
    const source = { id: 'beam', x: 100, y: 200, intensity: 100, direction: 0, spread: 100, power: 'always' }
    const base = h.render(0), lit = h.render(0, [source]), full = h.normal('#e5e7e6')
    const clock = { base: h.pixel(base, 655, 185), lit: h.pixel(lit, 655, 185), full: h.pixel(full, 655, 185) }
    const coin = { base: h.pixel(base, 455, 200), lit: h.pixel(lit, 455, 200), full: h.pixel(full, 455, 200) }
    const player = { base: h.pixel(base, 980, 182), lit: h.pixel(lit, 980, 182), full: h.pixel(full, 980, 182) }
    const text = []
    // Compare opaque glyph interiors; antialiased edges correctly reveal the
    // faint beam behind the text rather than changing the ink itself.
    for (let y = 180; y < 230; y++) for (let x = 800; x < 930; x++) {
      const original = h.pixel(full, x, y)
      if (original.every((c, i) => c === [113, 128, 116][i])) text.push({ base: h.pixel(base, x, y), lit: h.pixel(lit, x, y), full: original })
    }
    const wall = { base: h.pixel(base, 1000, 300), lit: h.pixel(lit, 1000, 300) }
    h.renderer.dispose(); return { clock, coin, text, wall, player }
  })
  expect(result.wall.lit[0]).toBeGreaterThan(result.wall.base[0])
  // Allow one channel step from the existing 8-bit exposure compositor.
  // Displays, collectibles and the figure receive light without a haze overlay.
  for (const sample of [result.clock, result.coin, result.player]) {
    sample.lit.forEach((c, i) => expect(Math.abs(c - sample.full[i])).toBeLessThanOrEqual(1))
    expect(sample.lit[0]).toBeGreaterThan(sample.base[0])
  }
  expect(result.text.length).toBeGreaterThan(20)
  for (const sample of result.text) sample.lit.forEach((c, i) => expect(Math.abs(c - sample.full[i])).toBeLessThanOrEqual(2))
})
