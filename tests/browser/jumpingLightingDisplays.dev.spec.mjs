import { test, expect } from './helpers/test.mjs'

for (const backend of ['canvas', 'gpu']) test(`${backend}: only timer digits and filled coin segments glow while panels receive light`, async ({ page }, info) => {
  await page.goto('/tests/fixtures/jumping/lighting-prototype.json')
  const result = await page.evaluate(async backend => {
    const { lightingHarness } = await import('/tests/browser/helpers/lightingHarness.mjs')
    const h = await lightingHarness({ backend })
    h.run.level = { ...h.run.level, platforms: [], texts: [], timers: [{ x: 400, y: 180 }], climbables: { ropes: [], ladders: [] },
      triggers: [{ mode: 'coins', x: 700, y: 200, w: 200, threshold: 4 },
        { mode: 'coins', x: 950, y: 140, w: 20, h: 200, orientation: 'vertical', threshold: 4 }] }
    h.run.terrain = []; h.run.props = []; h.run.robots = []; h.run.mechanisms = []; h.run.pickups = []
    h.run.triggers = [{ active: false }, { active: false }]; h.run.elapsed = 12.34
    const lamp = { id: 'lamp', x: 100, y: 240, direction: 0, spread: 120, intensity: 100, power: 'always' }
    const samples = [], sheet = document.createElement('canvas'), panel = sheet.getContext('2d')
    sheet.width = 1260; sheet.height = 980
    for (const [index, state] of ['normal', 'stopped', 'fast', 'finished'].entries()) {
      h.run.timeStopRemaining = state === 'stopped' ? 5 : 0
      h.run.timeFastRemaining = state === 'fast' ? 5 : 0
      h.run.exit = state === 'finished' ? { elapsed: 0 } : null
      h.run.coinsCollected = [0, 2, 4, 4][index]
      h.run.triggers.forEach(t => { t.active = state === 'finished' })
      h.run.empRemaining = 0; h.run.props = []
      h.render(100)
      const day = h.render(100), original = h.normal('#303c36'), full = h.normal('#e5e7e6')
      const dark = h.render(0), lit = h.render(0, [lamp])
      h.run.props = [{ kind: 'box', x: 280, y: 330, size: 180, angle: 0 }]
      const blocked = h.render(0, [lamp])
      h.run.props = []; h.run.empRemaining = 5
      const fading = h.render(0, [lamp], .1), emp = h.render(0, [lamp], .1)
      const points = [[401, 181, 0], [405, 185, 0], [701, 201, 0], [710, 208, index > 0 ? .65 : 0], [880, 208, index > 1 ? .65 : 0],
        [951, 141, 0], [958, 150, index > 1 ? .65 : 0], [958, 325, index > 0 ? .65 : 0]]
      // Include opaque digit interiors in every normal, stopped, fast, finished palette.
      const ink = { normal: [229, 231, 230], stopped: [230, 185, 111], fast: [233, 134, 120], finished: [169, 213, 107] }[state]
      let digits = 0
      for (let y = 190; y < 230; y++) for (let x = 430; x < 570; x++) {
        if (h.pixel(full, x, y).every((c, i) => c === ink[i])) { points.push([x, y, .65]); digits++ }
      }
      let maxError = 0, dayMaterialDifference = 0
      for (const [x, y, floor] of points) for (const [frame, light] of [[dark, .35], [lit, 1], [blocked, .35], [fading, .675], [emp, .35]]) {
        const base = h.pixel(full, x, y), actual = h.pixel(frame, x, y)
        h.pixel(day, x, y).forEach((c, i) => { dayMaterialDifference = Math.max(dayMaterialDifference, Math.abs(c - base[i])) })
        actual.forEach((c, i) => { maxError = Math.max(maxError, Math.abs(c - base[i] * Math.max(floor, light))) })
      }
      samples.push({ state, digits, maxError, dayMaterialDifference, dayDifference: h.difference(day, original), backend: lit.stats.backend })
      // A review sheet shows the glowing digits and spotlight versions at the same scale.
      for (const [column, frame] of [dark, lit].entries()) {
        h.canvas.getContext('2d').putImageData(new ImageData(frame.pixels, 1280, 720), 0, 0)
        panel.drawImage(h.canvas, 380, 170, 630, 220, column * 630, index * 245 + 25, 630, 220)
      }
      panel.fillStyle = '#e5e7e6'; panel.font = '16px sans-serif'
      panel.fillText(`${state}: dark`, 10, index * 245 + 19); panel.fillText(`${state}: spotlight`, 640, index * 245 + 19)
    }
    h.renderer.dispose(); document.body.replaceChildren(sheet); return samples
  }, backend)
  await page.locator('canvas').screenshot({ path: info.outputPath(`${backend}-display-lighting.png`) })
  for (const sample of result) {
    expect(sample.backend).toBe(backend)
    expect(sample.digits).toBeGreaterThan(20)
    expect(sample.dayDifference).toBe(0)
    expect(sample.dayMaterialDifference).toBe(0)
    expect(sample.maxError, JSON.stringify(sample)).toBeLessThanOrEqual(2)
  }
})
