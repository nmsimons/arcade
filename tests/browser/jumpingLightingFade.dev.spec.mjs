import { writeFile } from 'node:fs/promises'
import { test, expect } from '@playwright/test'

test('object shadows fade along the beam in world space without softening contact or structural shadows', async ({ page }, testInfo) => {
  await page.goto('/tests/fixtures/jumping/lighting-prototype.json')
  const result = await page.evaluate(async () => {
    const { lightingHarness } = await import('/tests/browser/helpers/lightingHarness.mjs')
    const { dynamicCasters, shadowFadeRange } = await import('/src/games/jumping/lightingModel.ts')
    const h = await lightingHarness()
    h.run.level = { ...h.run.level, height: 1000, floor: 1000, platforms: [{ x: 0, y: 280, w: 1280, h: 720 }],
      texts: [], timers: [], triggers: [], climbables: { ladders: [], ropes: [] } }
    h.run.terrain = h.run.level.platforms; h.run.mechanisms = []; h.run.robots = []; h.run.triggers = []; h.run.pickups = []
    h.run.props = [{ ...h.run.props[1], x: 460, y: 280, size: 44, angle: 0 }]
    Object.assign(h.run.player, { x: 860, y: 280, grounded: true })
    const light = { id: 'lamp', x: 1040, y: 30, intensity: 100, power: 'always', direction: 130, spread: 100 }
    const group = dynamicCasters(h.run)[0], range = shadowFadeRange(light, group)
    const dx = 460 - light.x, dy = 258 - light.y, d = Math.hypot(dx, dy)
    const point = distance => [light.x + dx / d * distance, light.y + dy / d * distance]
    const points = [range.start + 4, (range.start + range.end) / 2, range.end + 10].map(point)
    const samples = []
    for (const zoom of [1, .75]) {
      h.view.zoom = zoom
      const bright = h.render(100), dark = h.render(0), lit = h.render(0, [light])
      samples.push(points.map(p => ({ bright: h.pixel(bright, ...p), dark: h.pixel(dark, ...p), lit: h.pixel(lit, ...p) })))
    }
    h.view.zoom = 1; h.render(0, [light]); const screenshot = h.canvas.toDataURL('image/png')
    // The same long path is blocked fully when a real wall occupies the ball's position.
    h.run.props = []; h.run.level = { ...h.run.level, platforms: [...h.run.level.platforms, { x: 438, y: 236, w: 44, h: 44 }] }
    h.run.terrain = h.run.level.platforms
    const wall = h.render(0, [light]), dark = h.render(0)
    const structural = { lit: h.pixel(wall, ...points[2]), dark: h.pixel(dark, ...points[2]) }
    h.renderer.dispose(); return { samples, structural, screenshot }
  })
  for (const [near, middle, far] of result.samples) {
    near.lit.forEach((value, i) => expect(Math.abs(value - near.dark[i])).toBeLessThanOrEqual(1))
    middle.lit.forEach((value, i) => {
      expect(value).toBeGreaterThan(middle.dark[i] + 20)
      expect(value).toBeLessThan(middle.bright[i] - 20)
    })
    expect(far.lit).toEqual(far.bright)
  }
  expect(result.structural.lit).toEqual(result.structural.dark)
  const path = testInfo.outputPath('fading-object-shadows.png')
  await writeFile(path, Buffer.from(result.screenshot.split(',')[1], 'base64'))
  await testInfo.attach('fading-object-shadows', { path, contentType: 'image/png' })
})
