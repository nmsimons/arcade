import { test, expect } from './helpers/test.mjs'
import { readFileSync } from 'node:fs'
import { useLevelFixtures } from './helpers/jumpingLevels.mjs'

for (const backend of ['canvas', 'gpu']) test(`${backend}: day lamps fill sunlight shadows, obey blockers and EMP, and leave terrain ambient-only`, async ({ page }, info) => {
  await page.goto('/tests/fixtures/jumping/lighting-prototype.json')
  const result = await page.evaluate(async backend => {
    const { lightingHarness } = await import('/tests/browser/helpers/lightingHarness.mjs')
    const h = await lightingHarness({ backend })
    const lamp = { id: 'day-lamp', x: 400, y: 510, direction: 180, spread: 100, intensity: 100, power: 'always' }
    const points = [[100, 510], [300, 510], [100, 450], [1160, 650]]
    const sample = frame => points.map(point => h.pixel(frame, ...point))
    const original = sample(h.fullBright())
    const sun = h.render(100), lit = h.render(100, [lamp])
    const duplicate = h.render(100, [lamp, { ...lamp, id: 'second' }])
    h.run.empRemaining = 5
    const outage = h.render(100, [lamp])
    h.run.empRemaining = 0
    const restored = h.render(100, [lamp])
    h.run.level = { ...h.run.level, platforms: [...h.run.level.platforms, { x: 280, y: 480, w: 20, h: 60, material: 'steel' }] }
    const blocked = h.render(100, [lamp])
    document.body.replaceChildren(h.canvas); document.body.style.margin = '0'
    const result = { backend: lit.stats.backend, original, sun: sample(sun), lit: sample(lit), duplicate: sample(duplicate),
      outage: sample(outage), restored: sample(restored), blocked: sample(blocked), bytes: lit.stats.bufferBytes }
    h.renderer.dispose(); return result
  }, backend)
  expect(result.backend).toBe(backend)
  expect(result.sun[0]).not.toEqual(result.original[0])
  expect(result.lit[0]).toEqual(result.original[0])
  expect(result.lit[1]).toEqual(result.original[1])
  expect(result.duplicate).toEqual(result.lit)
  expect(result.outage).toEqual(result.sun)
  expect(result.restored).toEqual(result.lit)
  expect(result.blocked[0]).toEqual(result.sun[0])
  for (const i of [2, 3]) expect(result.lit[i]).toEqual(result.sun[i])
  expect(result.bytes).toBeLessThan(64 * 1024 * 1024)
  await page.locator('canvas').screenshot({ path: info.outputPath(`mixed-daylight-${backend}.png`) })
})

test('daylight shades walls and receivers while terrain, mechanisms and borders stay ambient-only', async ({ page }, info) => {
  await page.goto('/tests/fixtures/jumping/lighting-prototype.json')
  const result = await page.evaluate(async () => {
    const { lightingHarness } = await import('/tests/browser/helpers/lightingHarness.mjs')
    const { DAY_AMBIENT_EXPOSURE } = await import('/src/games/jumping/daylight.ts')
    const h = await lightingHarness(); h.view.x = -40
    const original = h.fullBright()
    const day = h.render(100)
    const points = [[100, 100], [100, 510], [700, 300], [850, 350], [850, 205], [1035, 490], [-20, 300], [500, -20], [1160, 639], [1160, 641], [100, 450], [435, 430], [1090, 580]]
    const samples = points.map(point => ({ point, original: h.pixel(original, ...point), day: h.pixel(day, ...point) }))
    h.run.empRemaining = 5
    const emp = h.render(100)
    const empSamples = points.map(point => h.pixel(emp, ...point))
    const empty = h.render(100)
    const noLampSamples = points.map(point => h.pixel(empty, ...point))
    h.run.empRemaining = 0
    const sheet = document.createElement('canvas'); sheet.width = 1280; sheet.height = 768
    const ctx = sheet.getContext('2d')
    for (const [index, frame] of [original, day].entries()) {
      h.canvas.getContext('2d').putImageData(new ImageData(frame.pixels, 1280, 720), 0, 0)
      ctx.fillStyle = '#eeeee6'; ctx.fillRect(0, index * 384, 1280, 384)
      ctx.fillStyle = '#303c36'; ctx.font = '18px sans-serif'
      ctx.fillText(index ? 'Day · sun from upper left + 95% ambient fill' : 'Original · full brightness', 20, index * 384 + 25)
      ctx.drawImage(h.canvas, 0, index * 384 + 30, 640, 360)
      ctx.drawImage(h.canvas, 740, 210, 240, 350, 660, index * 384 + 30, 240, 350)
      ctx.drawImage(h.canvas, 390, 270, 260, 350, 920, index * 384 + 30, 260, 350)
    }
    document.body.replaceChildren(sheet)
    h.renderer.dispose()
    return { samples, empSamples, noLampSamples, ambient: DAY_AMBIENT_EXPOSURE, bytes: day.stats.bufferBytes }
  })
  // Unobstructed wall pixels retain the artwork. Every structural front and
  // enclosing border receives the same ambient exposure, regardless of sunlight.
  for (const i of [0, 2, 4]) expect(result.samples[i].day).toEqual(result.samples[i].original)
  for (const i of [1, 3, 5, 6, 7, 8, 9, 10, 11, 12]) result.samples[i].day.forEach((value, channel) =>
    expect(Math.abs(value - result.samples[i].original[channel] * result.ambient), JSON.stringify(result.samples[i])).toBeLessThanOrEqual(1))
  expect(result.empSamples).toEqual(result.samples.map(sample => sample.day))
  expect(result.noLampSamples).toEqual(result.samples.map(sample => sample.day))
  expect(result.bytes).toBeLessThan(64 * 1024 * 1024)
  await page.locator('canvas').screenshot({ path: info.outputPath('daylight-comparison.png') })
})

test('GPU and Canvas mixed daylight agree through camera changes, moving gates and EMP', async ({ page }) => {
  await page.goto('/tests/fixtures/jumping/lighting-prototype.json')
  const result = await page.evaluate(async () => {
    const [{ lightingHarness }, { LightingRenderer }] = await Promise.all([
      import('/tests/browser/helpers/lightingHarness.mjs'), import('/src/games/jumping/lightingRender.ts'),
    ])
    const h = await lightingHarness(), gpu = new LightingRenderer({ backend: 'gpu' }), results = []
    h.canvas.width = 640; h.canvas.height = 360
    Object.assign(h.view, { width: 640, height: 360 })
    const ctx = h.canvas.getContext('2d'), definition = { ...h.fixture.lighting, nightMode: false }
    for (const zoom of [.6, 1, 1.7]) for (const x of [-40, 400]) {
      Object.assign(h.view, { zoom, x, y: zoom === 1.7 ? 300 : -40 })
      h.run.mechanisms[1].x -= .37
      for (const empRemaining of [0, 5]) {
        h.run.empRemaining = empRemaining
        h.renderer.render(ctx, h.run, definition, h.view, .2)
        const canvas = ctx.getImageData(0, 0, 640, 360).data
        const stats = gpu.render(ctx, h.run, definition, h.view, .2)
        const pixels = ctx.getImageData(0, 0, 640, 360).data
        let total = 0, worst = 0
        for (let i = 0; i < pixels.length; i++) {
          const difference = Math.abs(canvas[i] - pixels[i]); total += difference; worst = Math.max(worst, difference)
        }
        results.push({ backend: stats.backend, mean: total / pixels.length, worst, bytes: stats.bufferBytes })
      }
    }
    h.renderer.dispose(); gpu.dispose(); return results
  })
  for (const frame of result) {
    expect(frame.backend).toBe('gpu')
    expect(frame.mean).toBeLessThan(.1)
    expect(frame.worst).toBeLessThanOrEqual(13)
    expect(frame.bytes).toBeLessThan(64 * 1024 * 1024)
  }
})

test('daylight follows actual gate positions and refreshes caches across camera, geometry, size and mode changes', async ({ page }) => {
  await page.goto('/tests/fixtures/jumping/lighting-prototype.json')
  const result = await page.evaluate(async () => {
    const { lightingHarness } = await import('/tests/browser/helpers/lightingHarness.mjs')
    const { LightingRenderer } = await import('/src/games/jumping/lightingRender.ts')
    const h = await lightingHarness(), comparisons = []
    h.run.level = { ...h.run.level, platforms: [] }; h.run.terrain = []
    h.run.mechanisms = [h.run.mechanisms[1]]
    Object.assign(h.run.mechanisms[0], { x: 580, y: 200 })
    const definition = { nightMode: false, ambient: 0, lights: [] }
    const render = () => h.render(0, [], .2, undefined, false)
    const fresh = () => {
      const renderer = new LightingRenderer()
      renderer.render(h.canvas.getContext('2d'), h.run, definition, h.view, .2)
      const frame = { pixels: new Uint8ClampedArray(h.canvas.getContext('2d').getImageData(0, 0, 1280, 720).data) }
      renderer.dispose(); return frame
    }
    const closed = render()
    h.run.mechanisms[0].x += 100
    const opened = render()
    const gate = { closed: h.pixel(closed, 710, 500), open: h.pixel(opened, 710, 500), original: h.pixel(h.fullBright(), 710, 500) }
    for (const zoom of [.6, 1, 1.7]) for (const y of [-40, 400]) {
      Object.assign(h.view, { zoom, y, x: 400 })
      comparisons.push(h.difference(render(), fresh()))
    }
    h.run.level = { ...h.run.level, platforms: [] }
    comparisons.push(h.difference(render(), fresh()))
    h.render(0, h.fixture.lighting.lights)
    comparisons.push(h.difference(render(), fresh()))
    Object.assign(h.view, { width: 640, height: 360 })
    const resized = render(); comparisons.push(h.difference(resized, fresh()))
    const buffers = resized.stats.bufferBytes
    h.view.width = 0
    const hidden = render().stats.bufferBytes
    h.renderer.dispose(); return { gate, comparisons, buffers, hidden }
  })
  expect(result.gate.closed).not.toEqual(result.gate.open)
  expect(result.gate.open).toEqual(result.gate.original)
  expect(result.comparisons.every(difference => difference === 0)).toBe(true)
  expect(result.buffers).toBe(640 * 360 * 28)
  expect(result.hidden).toBe(0)
})

test('existing version-1 levels receive daylight in the live game without upgrading their files', async ({ page }, info) => {
  const legacy = JSON.parse(readFileSync(new URL('../fixtures/jumping/lighting-prototype.json', import.meta.url))).level
  await useLevelFixtures(page, [legacy])
  await page.addInitScript(() => {
    const fill = CanvasRenderingContext2D.prototype.fillRect
    CanvasRenderingContext2D.prototype.fillRect = function (...args) {
      if (this.canvas.matches('.jumping-game > canvas') && this.fillStyle === '#f1f1ed') {
        const { a, d, e, f } = this.getTransform(); window.daylightCamera = { a, d, e, f }
      }
      return fill.apply(this, args)
    }
  })
  await page.goto('/untitled-jumping-game')
  await page.getByRole('button', { name: `Play ${legacy.name}`, exact: true }).click()
  await expect(page.getByRole('img', { name: `${legacy.name}: reach the exit` })).toBeFocused()
  await expect.poll(() => page.evaluate(() => !!window.daylightCamera)).toBe(true)
  const pixels = await page.evaluate(() => {
    const canvas = document.querySelector('.jumping-game > canvas'), ctx = canvas.getContext('2d')
    const { a, d, e, f } = window.daylightCamera
    return [[710, 310], [110, 510], [1160, 650]].map(([x, y]) =>
      [...ctx.getImageData(Math.round(x * a + e), Math.round(y * d + f), 1, 1).data].slice(0, 3))
  })
  expect(pixels[0]).toEqual([241, 241, 237])
  pixels[1].forEach((channel, i) => expect(Math.abs(channel - pixels[0][i] * .95)).toBeLessThanOrEqual(1))
  expect(pixels[2].some(channel => channel > 0)).toBe(true)
  expect(legacy.version).toBe(1); expect(legacy.lighting).toBeUndefined()
  await page.locator('.jumping-game > canvas').screenshot({ path: info.outputPath('daylight-live-game.png') })
})
