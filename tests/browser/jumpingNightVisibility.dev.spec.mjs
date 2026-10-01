import { test, expect } from './helpers/test.mjs'

for (const backend of ['canvas', 'gpu']) test(`${backend}: fixed night ambient renders consistently and yellow graffiti receives light and shadows`, async ({ page }, info) => {
  await page.goto('/tests/fixtures/jumping/lighting-prototype.json')
  const result = await page.evaluate(async backend => {
    const { lightingHarness } = await import('/tests/browser/helpers/lightingHarness.mjs')
    const { drawWallTexts, GRAFFITI_FONT } = await import('/src/games/jumping/wallText.ts')
    const font = new FontFace(GRAFFITI_FONT, 'url(/src/games/jumping/fonts/PermanentMarker-Regular.ttf)')
    document.fonts.add(font); await font.load()
    const h = await lightingHarness({ backend }), ctx = h.canvas.getContext('2d')
    const texts = ['official', 'graffiti'].map((style, i) => ({ x: 600, y: 180 + 100 * i, w: 620, h: 90, fontSize: 56, align: 'left', style, text: 'LIGHT THE WAY' }))
    h.run.level = { ...h.run.level, platforms: [], texts, timers: [], triggers: [], climbables: { ropes: [], ladders: [] } }
    h.run.terrain = []; h.run.props = []; h.run.robots = []; h.run.mechanisms = []; h.run.triggers = []; h.run.pickups = []
    h.run.player.x = 1000; h.run.player.y = 650
    // Locate opaque glyph interiors independently of the lighting compositor.
    ctx.clearRect(0, 0, 1280, 720); ctx.save(); ctx.translate(0, 40); drawWallTexts(ctx, texts, true); ctx.restore()
    const ink = { pixels: ctx.getImageData(0, 0, 1280, 720).data }
    const colors = [[113, 128, 116], [244, 211, 94]], points = [[], []]
    for (const [index, text] of texts.entries()) for (let y = text.y; y < text.y + 90; y++) for (let x = text.x; x < text.x + 620; x++) {
      const alpha = ink.pixels[((y - h.view.y) * h.canvas.width + x) * 4 + 3]
      if (points[index].length < 50 && alpha === 255 && h.pixel(ink, x, y).every((c, i) => c === colors[index][i])) points[index].push([x, y])
    }
    const lamp = { id: 'lamp', x: 100, y: 240, direction: 0, spread: 140, intensity: 100, power: 'always' }
    const receiver = { kind: 'box', x: 950, y: 520, size: 120, angle: 0 }
    const frames = [], samples = [], before = JSON.stringify(h.run.level)
    const render = (ambient, lights = [], night = true) => h.render(ambient, lights, .2, undefined, night, 'full')
    h.run.props = [receiver]; render(0, [lamp], false)
    const day = render(0, [lamp], false), dayLegacy = render(100, [lamp], false)
    for (const ambient of [0, 50, 100]) {
      h.run.props = [receiver]; h.run.empRemaining = 0
      const dark = render(ambient), lit = render(ambient, [lamp])
      // Warm the stationary lamp cache before changing the legacy ambient value.
      render(ambient, [lamp])
      h.run.props = [receiver, { kind: 'box', x: 280, y: 400, size: 240, angle: 0 }]
      const shadow = render(ambient, [lamp])
      h.run.props = [receiver]; h.run.empRemaining = 5
      const emp = render(ambient, [lamp])
      samples.push({ brightness: 35, backend: lit.stats.backend,
        text: points.map((glyphs, index) => ({ color: colors[index],
          pixels: glyphs.map(([x, y]) => ({ dark: h.pixel(dark, x, y), lit: h.pixel(lit, x, y), shadow: h.pixel(shadow, x, y), emp: h.pixel(emp, x, y) })) })),
        // Ordinary receivers and ambient-only architecture use the fixed baseline.
        receiver: { original: h.pixel(day, 950, 460), dark: h.pixel(dark, 950, 460), lit: h.pixel(lit, 950, 460), shadow: h.pixel(shadow, 950, 460), emp: h.pixel(emp, 950, 460) },
        wall: h.pixel(dark, 550, 450), buffers: lit.stats.bufferBytes })
      frames.push(dark, lit)
    }
    const dayGraffiti = points[1].map(([x, y]) => h.pixel(day, x, y))
    const sheet = document.createElement('canvas'); sheet.width = 1240; sheet.height = 660
    const panel = sheet.getContext('2d'); panel.fillStyle = '#202720'; panel.fillRect(0, 0, sheet.width, sheet.height)
    for (const [index, frame] of frames.entries()) {
      ctx.putImageData(new ImageData(frame.pixels, 1280, 720), 0, 0)
      panel.drawImage(h.canvas, 590, 210, 620, 200, index % 2 * 620, Math.floor(index / 2) * 220 + 20, 620, 200)
      panel.fillStyle = '#e5e7e6'; panel.font = '14px sans-serif'
      panel.fillText(`35% · ${index % 2 ? 'spotlight' : 'ambient'}`, index % 2 * 620 + 10, Math.floor(index / 2) * 220 + 16)
    }
    h.renderer.dispose(); document.body.replaceChildren(sheet)
    return { samples, dayGraffiti, dayDifference: h.difference(day, dayLegacy), unchanged: JSON.stringify(h.run.level) === before }
  }, backend)
  await page.locator('canvas').screenshot({ path: info.outputPath(`${backend}-night-visibility.png`) })
  expect(result.unchanged).toBe(true); expect(result.dayDifference).toBe(0)
  for (const color of result.dayGraffiti) expect(color).toEqual([148, 67, 63])
  for (const sample of result.samples) {
    expect(sample.backend).toBe(backend); expect(sample.buffers).toBeLessThan(64 * 1024 * 1024)
    for (const text of sample.text) {
      expect(text.pixels.length).toBeGreaterThan(20)
      for (const pixel of text.pixels) for (const [frame, exposure] of [[pixel.dark, sample.brightness / 100], [pixel.lit, 1], [pixel.shadow, sample.brightness / 100], [pixel.emp, sample.brightness / 100]]) {
        frame.forEach((c, i) => expect(Math.abs(c - text.color[i] * exposure)).toBeLessThanOrEqual(2))
      }
    }
    sample.wall.forEach((c, i) => expect(Math.abs(c - [241, 241, 237][i] * sample.brightness / 100)).toBeLessThanOrEqual(2))
    for (const [frame, exposure] of [[sample.receiver.dark, sample.brightness / 100], [sample.receiver.lit, 1], [sample.receiver.shadow, sample.brightness / 100], [sample.receiver.emp, sample.brightness / 100]]) {
      frame.forEach((c, i) => expect(Math.abs(c - sample.receiver.original[i] * exposure)).toBeLessThanOrEqual(2))
    }
  }
})
