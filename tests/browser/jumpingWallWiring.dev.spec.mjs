import { test, expect } from './helpers/test.mjs'

test('exit terminals remain visible outside the pole and open doorway for high and low incoming wires', async ({ page }, info) => {
  await page.goto('/tests/fixtures/jumping/lighting-prototype.json')
  const samples = await page.evaluate(async () => {
    const { lightingHarness } = await import('/tests/browser/helpers/lightingHarness.mjs')
    const { wallWires } = await import('/src/games/jumping/wallWiring.ts')
    const { GOAL_OPEN_SECONDS } = await import('/src/games/jumping/goal.ts')
    const h = await lightingHarness({ backend: 'canvas' })
    const base = { ...h.run.level, platforms: [], texts: [], timers: [], wallLights: [], climbables: { ropes: [], ladders: [] } }
    h.run.terrain = []; h.run.props = []; h.run.robots = []; h.run.mechanisms = []; h.run.pickups = []
    h.run.triggers = [{ active: true, depression: 1, pressed: true, held: 1 }]
    h.run.switchStates = new Map([['exit', true]]); h.run.goalLit = true; h.run.goalElapsed = GOAL_OPEN_SECONDS
    const sheet = document.createElement('canvas'); sheet.width = 1280; sheet.height = 520
    const panel = sheet.getContext('2d'), samples = []
    panel.fillStyle = '#303332'; panel.fillRect(0, 0, sheet.width, sheet.height)
    for (const [row, wireHeight] of [200, 40].entries()) for (const [column, [flipX, fromRight]] of [[false, false], [false, true], [true, false], [true, true]].entries()) {
      h.run.level = { ...base, goal: { x: 640, y: 640, flipX, id: 'exit', power: 'switched' },
        triggers: [{ x: fromRight ? 1000 : 220, y: 640, w: 100, mode: 'weight', behavior: 'switch', startsOn: true, targets: ['exit'], showWires: true, wireHeight }] }
      const frame = h.render(0), [wire] = wallWires(h.run.level), end = wire.points.at(-1)
      samples.push({ flipX, fromRight, wireHeight, pin: h.pixel(frame, ...end) })
      panel.drawImage(h.canvas, 480, 470, 320, 240, column * 320, row * 260 + 20, 320, 240)
      panel.fillStyle = '#e5e7e6'; panel.font = '12px monospace'
      panel.fillText(`${row ? 'Below' : 'Above'} · ${flipX ? 'mirrored' : 'normal'} · from ${fromRight ? 'right' : 'left'}`, column * 320 + 8, row * 260 + 15)
    }
    h.renderer.dispose(); document.body.replaceChildren(sheet)
    return samples
  })
  for (const sample of samples) expect(sample.pin[1], JSON.stringify(sample)).toBeGreaterThan(100)
  await page.locator('canvas').screenshot({ path: info.outputPath('exit-wire-terminals.png') })
})

for (const backend of ['canvas', 'gpu']) test(`${backend}: thin wires have a tight Night glow, follow EMP and remain occluded by wall art`, async ({ page }, info) => {
  await page.goto('/tests/fixtures/jumping/lighting-prototype.json')
  const result = await page.evaluate(async backend => {
    const { lightingHarness } = await import('/tests/browser/helpers/lightingHarness.mjs')
    const h = await lightingHarness({ backend })
    const screen = { x: 300, y: 440, w: 100, h: 80, text: 'NO SIGNAL', fontSize: 12, align: 'left', style: 'terminal' }
    const block = { x: 500, y: 460, w: 60, h: 60 }
    const triggers = [120, 900].map((x, index) => ({ x, y: 640, w: 100, mode: 'weight', behavior: 'switch', targets: ['lamp'], showWires: index === 0 }))
    h.run.level = { ...h.run.level, texts: [screen], timers: [], platforms: [block], triggers,
      wallLights: [{ id: 'lamp', x: 700, y: 400, switchLogic: 'and' }], climbables: { ropes: [], ladders: [] } }
    h.run.terrain = [block]; h.run.props = []; h.run.robots = []; h.run.mechanisms = []; h.run.pickups = []
    h.run.triggers = [{ active: false }, { active: false }]; h.run.switchStates = new Map([['lamp', false]])
    const sheet = document.createElement('canvas'); sheet.width = 1280; sheet.height = 560
    const panel = sheet.getContext('2d'), samples = []
    for (const [row, mode] of ['Night', 'Day'].entries()) {
      const render = () => h.render(mode === 'Night' ? 0 : 100, [], .2, undefined, mode === 'Night')
      h.run.triggers[0].active = false; h.run.empRemaining = 0
      // Settle first-use graphics/readback rounding before comparing signals.
      render()
      const off = render()
      h.run.triggers[0].active = true
      const on = render()
      h.run.empRemaining = 3
      const emp = render()
      h.run.empRemaining = 0
      const restored = render()
      let wallDifference = 0, coveredDifference = 0
      for (let y = 420; y < 530; y++) for (let x = 200; x < 600; x++) {
        const a = h.pixel(off, x, y), b = h.pixel(on, x, y)
        const difference = Math.max(...a.map((c, i) => Math.abs(c - b[i])))
        if (x >= 305 && x < 395 && y >= 445 && y < 515 || x >= 505 && x < 555 && y >= 465 && y < 515)
          coveredDifference = Math.max(coveredDifference, difference)
        // The cable's only exposed run in this region is horizontal at y=480.
        if (Math.abs(y - 480) > 6) wallDifference = Math.max(wallDifference, difference)
      }
      samples.push({ mode, off: h.pixel(off, 240, 480), on: h.pixel(on, 240, 480), emp: h.pixel(emp, 240, 480),
        restored: h.pixel(restored, 240, 480), haloOff: h.pixel(off, 240, 478), haloOn: h.pixel(on, 240, 478),
        haloEmp: h.pixel(emp, 240, 478), wallDifference, coveredDifference, backend: on.stats.backend })
      for (const [column, frame] of [off, on].entries()) {
        h.canvas.getContext('2d').putImageData(new ImageData(frame.pixels, 1280, 720), 0, 0)
        panel.drawImage(h.canvas, 110, 430, 640, 240, column * 640, row * 280 + 30, 640, 240)
        panel.fillStyle = '#e5e7e6'; panel.font = '16px monospace'
        panel.fillText(`${mode}: ${column ? 'energized' : 'inactive'}`, column * 640 + 12, row * 280 + 20)
      }
    }
    h.renderer.dispose(); document.body.replaceChildren(sheet)
    return samples
  }, backend)
  for (const sample of result) {
    expect(sample.backend).toBe(backend)
    expect(sample.on[1] - sample.off[1], JSON.stringify(sample)).toBeGreaterThan(8)
    expect(sample.on[1] - sample.on[0]).toBeGreaterThan(8)
    expect(sample.emp).toEqual(sample.off)
    expect(sample.restored).toEqual(sample.on)
    expect(sample.haloEmp).toEqual(sample.haloOff)
    const glow = sample.haloOn[1] - sample.haloOff[1]
    if (sample.mode === 'Night') { expect(glow, JSON.stringify(sample)).toBeGreaterThan(0); expect(glow).toBeLessThan(12) }
    else expect(glow).toBe(0)
    expect(sample.wallDifference, JSON.stringify(sample)).toBe(0)
    expect(sample.coveredDifference, JSON.stringify(sample)).toBe(0)
  }
  await page.locator('canvas').screenshot({ path: info.outputPath(`${backend}-wire-power.png`) })
})
