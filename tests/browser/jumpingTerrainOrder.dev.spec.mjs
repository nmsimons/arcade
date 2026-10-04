import { test, expect } from './helpers/test.mjs'

test('terrain depth matches the top material in gameplay, daytime and night lighting masks', async ({ page }) => {
  await page.goto('/untitled-jumping-game/lighting-lab')
  const samples = await page.evaluate(async () => {
    const { lightingHarness } = await import('/tests/browser/helpers/lightingHarness.mjs')
    const { levelTerrain } = await import('/src/games/jumping/level.ts')
    const h = await lightingHarness(), samples = []
    h.run.props = []; h.run.robots = []; h.run.mechanisms = []; h.run.triggers = []; h.run.pickups = []
    const base = { ...h.run.level, texts: [], timers: [], wallLights: [], gravityPlates: [], triggers: [], climbables: { ropes: [], ladders: [] } }
    const shape = { x: 400, y: 300, w: 200, h: 180 }
    const earth = { ...shape, material: 'earth', zIndex: 2 }, chalk = { ...shape, material: 'chalk' }
    for (const depth of [2, -2]) for (const ambient of [0, 60, 100]) {
      earth.zIndex = depth
      h.run.level = { ...base, platforms: [earth, chalk] }; h.run.terrain = levelTerrain(h.run.level)
      const actual = h.pixel(h.render(ambient), 445, 395), plain = h.pixel(h.normal(), 445, 395)
      h.run.level = { ...base, platforms: [depth > 0 ? earth : chalk] }; h.run.terrain = levelTerrain(h.run.level)
      samples.push({ depth, ambient, actual, expected: h.pixel(h.render(ambient), 445, 395), plain, expectedPlain: h.pixel(h.normal(), 445, 395) })
    }
    h.renderer.dispose(); return samples
  })
  for (const s of samples) {
    expect(s.actual, JSON.stringify(s)).toEqual(s.expected)
    expect(s.plain, JSON.stringify(s)).toEqual(s.expectedPlain)
  }
})
