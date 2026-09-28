import { test, expect } from './helpers/test.mjs'

for (const caster of ['box', 'ball', 'player']) test(`${caster} casts unfaded shadows on objects and airborne light at long distances`, async ({ page }) => {
  await page.goto('/untitled-jumping-game/lighting-lab')
  const results = await page.evaluate(async caster => {
    const { lightingHarness } = await import('/tests/browser/helpers/lightingHarness.mjs')
    const { athletePose } = await import('/src/games/jumping/athlete.ts')
    const h = await lightingHarness(), samples = []
    h.run.level = { ...h.run.level, width: 5000, platforms: [], texts: [], timers: [], triggers: [], climbables: { ladders: [], ropes: [] } }
    h.run.terrain = []; h.run.mechanisms = []; h.run.robots = []; h.run.triggers = []; h.run.pickups = []
    Object.assign(h.run.player, { x: 350, y: 258, grounded: true })
    const y = h.run.player.y + athletePose(h.run.player).head[1]
    const light = { id: 'lamp', x: 100, y, intensity: 100, power: 'always', direction: 0, spread: 90 }
    for (const zoom of [1, .75]) for (const x of [600, 1000, 3500]) {
      Object.assign(h.view, { x: x - 500, zoom })
      const receiver = { kind: 'box', x, y: y + 30, size: 60, angle: 0 }
      h.run.player.x = 20; h.run.props = [receiver]
      const dark = h.render(0), bright = h.render(100), lit = h.render(0, [light])
      if (caster === 'player') h.run.player.x = 350
      else h.run.props.push({ kind: caster, x: 350, y: y + 22, size: 44, angle: 0 })
      const blocked = h.render(0, [light])
      samples.push({ lit: h.pixel(lit, x + 3, y), bright: h.pixel(bright, x + 3, y),
        blocked: h.pixel(blocked, x + 3, y), dark: h.pixel(dark, x + 3, y),
        beam: h.pixel(lit, x - 60, y), shadow: h.pixel(blocked, x - 60, y), wall: h.pixel(dark, x - 60, y) })
    }
    h.renderer.dispose(); return samples
  }, caster)
  for (const sample of results) {
    expect(sample.lit).toEqual(sample.bright)
    expect(sample.blocked).toEqual(sample.dark)
    expect(sample.shadow).toEqual(sample.wall)
    expect(sample.beam[0]).toBeGreaterThan(sample.wall[0])
  }
})
