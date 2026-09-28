import { writeFile } from 'node:fs/promises'
import { test, expect } from './helpers/test.mjs'

for (const horizontal of [true, false]) test(`${horizontal ? 'horizontal' : 'vertical'} gates shadow terrain and objects and stop the faint airborne beam`, async ({ page }) => {
  await page.goto('/untitled-jumping-game/lighting-lab')
  const result = await page.evaluate(async horizontal => {
    const { lightingHarness } = await import('/tests/browser/helpers/lightingHarness.mjs')
    const h = await lightingHarness()
    h.run.level.platforms = []; h.run.terrain = []; h.run.robots = []; h.run.props = []
    h.run.level.climbables = { ropes: [], ladders: [] }; h.run.level.timers = []; h.run.level.triggers = []
    h.run.level.texts = []; h.run.pickups = []; h.run.triggers = []
    const gate = horizontal ? { id: 'gate', kind: 'gate', x: 400, y: 250, w: 200, h: 20, travel: 200, orientation: 'horizontal' }
      : { id: 'gate', kind: 'gate', x: 350, y: 120, w: 20, h: 320, travel: 320 }
    h.run.mechanisms = [{ ...h.run.mechanisms[0], x: gate.x, y: gate.y, definition: gate }]
    const light = { id: 'test', x: horizontal ? 500 : 150, y: horizontal ? 50 : 200,
      intensity: 100, power: 'always', direction: horizontal ? 90 : 0, spread: 120 }
    const receiver = horizontal ? { x: 460, y: 500, w: 80, h: 40 } : { x: 600, y: 160, w: 80, h: 80 }
    h.run.level.platforms = [receiver]; h.run.terrain = [receiver]
    const wallPoint = horizontal ? [500, 410] : [500, 200]
    const terrainPoint = horizontal ? [500, 520] : [640, 200]
    const bright = h.render(100), ambient = h.render(0), closed = h.render(0, [light])
    const m = h.run.mechanisms[0]
    if (horizontal) m.x -= gate.travel; else m.y -= gate.travel
    const open = h.render(0, [light])
    if (horizontal) m.x += gate.travel; else m.y += gate.travel
    const reclosed = h.render(0, [light])
    const sample = point => ({ bright: h.pixel(bright, ...point), ambient: h.pixel(ambient, ...point),
      closed: h.pixel(closed, ...point), open: h.pixel(open, ...point), reclosed: h.pixel(reclosed, ...point) })
    const terrain = sample(terrainPoint), wall = sample(wallPoint)
    // Replace the terrain receiver with a loose box at the same spot.
    h.run.level = { ...h.run.level, platforms: [] }; h.run.terrain = []
    h.run.props = [{ kind: 'box', x: terrainPoint[0], y: terrainPoint[1] + 25, size: 50, angle: 0 }]
    const boxBright = h.render(100), boxClosed = h.render(0, [light])
    if (horizontal) m.x -= gate.travel; else m.y -= gate.travel
    const boxOpen = h.render(0, [light])
    const box = { bright: h.pixel(boxBright, ...terrainPoint), closed: h.pixel(boxClosed, ...terrainPoint), open: h.pixel(boxOpen, ...terrainPoint) }
    h.renderer.dispose(); return { wall, terrain, box }
  }, horizontal)
  expect(result.wall.closed).toEqual(result.wall.ambient)
  result.wall.open.forEach((value, i) => {
    expect(value).toBeGreaterThan(result.wall.ambient[i])
    expect(value - result.wall.ambient[i]).toBeLessThanOrEqual(8)
  })
  expect(result.wall.reclosed).toEqual(result.wall.ambient)
  expect(result.terrain.closed).toEqual(result.terrain.ambient)
  expect(result.terrain.reclosed).toEqual(result.terrain.ambient)
  expect(result.terrain.open).toEqual(result.terrain.bright)
  expect(result.box.open).toEqual(result.box.bright)
  result.box.closed.forEach((value, i) => expect(Math.abs(value - result.box.bright[i] * .35)).toBeLessThanOrEqual(2))
})

test('terrain blocks light on other solids while wall art stays ambient-only', async ({ page }) => {
  await page.goto('/untitled-jumping-game/lighting-lab')
  const result = await page.evaluate(async () => {
    const { lightingHarness } = await import('/tests/browser/helpers/lightingHarness.mjs')
    const h = await lightingHarness()
    h.run.mechanisms = []; h.run.robots = []; h.run.props = []; h.run.pickups = []
    h.run.level.climbables = { ropes: [], ladders: [] }; h.run.level.triggers = []; h.run.triggers = []
    h.run.level.timers = [{ x: 610, y: 80 }]
    h.run.level.texts = [{ x: 600, y: 160, w: 120, h: 40, text: 'Keep going', size: 20, align: 'left', style: 'graffiti' }]
    const receiver = { x: 600, y: 240, w: 140, h: 150 }, blocker = { x: 340, y: 80, w: 20, h: 420 }
    h.run.level.platforms = [blocker, receiver]; h.run.terrain = h.run.level.platforms
    const source = { id: 'lamp', x: 180, y: 160, intensity: 100, power: 'always', direction: 0, spread: 120 }
    const ambient = h.render(0), closed = h.render(0, [source]), bright = h.render(100)
    h.run.level = { ...h.run.level, platforms: [receiver] }; h.run.terrain = h.run.level.platforms
    const open = h.render(0, [source])
    const points = [[630, 110], [620, 130], [620, 170], [660, 180], [660, 210]]
    const wall = points.map((point, i) => ({ clock: i < 2, ambient: h.pixel(ambient, ...point), open: h.pixel(open, ...point), closed: h.pixel(closed, ...point) }))
    const result = { wall, receiver: { ambient: h.pixel(ambient, 650, 300), closed: h.pixel(closed, 650, 300), open: h.pixel(open, 650, 300), bright: h.pixel(bright, 650, 300) } }
    h.renderer.dispose(); return result
  })
  for (const point of result.wall) {
    if (point.clock) point.open.forEach((value, i) => expect(Math.abs(value - point.ambient[i])).toBeLessThanOrEqual(1))
    else point.open.forEach((value, i) => expect(Math.abs(value - point.ambient[i])).toBeLessThanOrEqual(8))
    expect(point.closed).toEqual(point.ambient)
  }
  expect(result.receiver.closed).toEqual(result.receiver.ambient)
  expect(result.receiver.open).toEqual(result.receiver.bright)
})

test('gates seal the photographed stepped-floor layout with two spotlights', async ({ page }) => {
  await page.goto('/untitled-jumping-game/lighting-lab')
  const result = await page.evaluate(async () => {
    const { lightingHarness } = await import('/tests/browser/helpers/lightingHarness.mjs')
    const { createPreviewRun } = await import('/src/games/jumping/challenge.ts')
    const { parseLevel } = await import('/src/games/jumping/level.ts')
    const h = await lightingHarness(), level = parseLevel(await (await fetch('/tests/fixtures/jumping/lighting-gates.json')).json())
    Object.assign(h.run, createPreviewRun(level)); h.run.props = []
    h.view.zoom = .65
    const points = [[340, 880], [1420, 900]]
    const ambient = h.render(0), bright = h.render(100), closed = h.render(0, level.lighting.lights)
    h.run.mechanisms = []
    const open = h.render(0, level.lighting.lights)
    const samples = points.map(point => ({ point, ambient: h.pixel(ambient, ...point), bright: h.pixel(bright, ...point), closed: h.pixel(closed, ...point), open: h.pixel(open, ...point) }))
    h.renderer.dispose(); return samples
  })
  for (const sample of result) {
    expect(sample.closed, JSON.stringify(sample)).toEqual(sample.ambient)
    expect(sample.open, JSON.stringify(sample)).toEqual(sample.bright)
  }
})

test('a wall joined to the room boundary shadows the floor beyond it', async ({ page }, testInfo) => {
  await page.goto('/untitled-jumping-game/lighting-lab')
  const result = await page.evaluate(async () => {
    const { lightingHarness } = await import('/tests/browser/helpers/lightingHarness.mjs')
    const { createPreviewRun } = await import('/src/games/jumping/challenge.ts')
    const { parseLevel } = await import('/src/games/jumping/level.ts')
    const h = await lightingHarness(), level = parseLevel(await (await fetch('/tests/fixtures/jumping/lighting-gates.json')).json())
    Object.assign(h.run, createPreviewRun(level)); h.view.zoom = .65
    const bright = h.render(100), ambient = h.render(0), lit = h.render(0, level.lighting.lights)
    const seam = { bright: h.pixel(bright, 1356, 690), lit: h.pixel(lit, 1356, 690) }
    const screenshot = h.canvas.toDataURL('image/png')
    // These rays cross the wall above the gate. The floor connects to that wall
    // through the outer boundary, but must still receive its shadow.
    const points = [[1505, 905], [1520, 908], [1540, 912]]
    const samples = points.map(point => ({ point, ambient: h.pixel(ambient, ...point), lit: h.pixel(lit, ...point) }))
    h.renderer.dispose(); return { samples, seam, screenshot }
  })
  const screenshot = testInfo.outputPath('connected-wall-shadow.png')
  await writeFile(screenshot, Buffer.from(result.screenshot.split(',')[1], 'base64'))
  await testInfo.attach('connected-wall-shadow', { path: screenshot, contentType: 'image/png' })
  for (const sample of result.samples) expect(sample.lit, JSON.stringify(sample)).toEqual(sample.ambient)
  expect(result.seam.lit).toEqual(result.seam.bright)
})

test('source glow remains stronger than the full beam, fades with EMP, and stops at a nearby gate', async ({ page }) => {
  await page.goto('/untitled-jumping-game/lighting-lab')
  const result = await page.evaluate(async () => {
    const { lightingHarness } = await import('/tests/browser/helpers/lightingHarness.mjs')
    const h = await lightingHarness()
    h.run.level.platforms = []; h.run.terrain = []; h.run.props = []; h.run.robots = []
    h.run.level.climbables = { ropes: [], ladders: [] }
    const gate = { id: 'gate', kind: 'gate', x: 490, y: 240, w: 20, h: 100, travel: 100 }
    h.run.mechanisms = []
    const light = { id: 'test', x: 470, y: 280, intensity: 100, power: 'always', direction: 0, spread: 70 }
    const ambient = h.render(0), on = h.render(0, [light])
    h.run.mechanisms = [{ x: gate.x, y: gate.y, definition: gate }]
    const blocked = h.render(0, [light])
    h.run.mechanisms = []; h.run.empRemaining = 5
    const off = h.render(0, [light])
    const sample = x => ({ ambient: h.pixel(ambient, x, 280), on: h.pixel(on, x, 280), blocked: h.pixel(blocked, x, 280), off: h.pixel(off, x, 280) })
    const result = { near: sample(485), behindGate: sample(518), far: sample(560) }
    h.renderer.dispose(); return result
  })
  expect(result.near.on[0]).toBeGreaterThan(result.near.ambient[0])
  expect(result.near.off).toEqual(result.near.ambient)
  expect(result.behindGate.blocked).toEqual(result.behindGate.ambient)
  expect(result.far.on[0]).toBeGreaterThan(result.far.ambient[0])
  expect(result.near.on[0] - result.near.ambient[0]).toBeGreaterThan(result.far.on[0] - result.far.ambient[0])
})

for (const kind of ['gate', 'lift']) for (const horizontal of [true, false]) {
  test(`${horizontal ? 'horizontal' : 'vertical'} ${kind} joins terrain only while its surface is continuous`, async ({ page }) => {
    await page.goto('/untitled-jumping-game/lighting-lab')
    const result = await page.evaluate(async ({ kind, horizontal }) => {
      const { lightingHarness } = await import('/tests/browser/helpers/lightingHarness.mjs')
      const { LightingRenderer } = await import('/src/games/jumping/lightingRender.ts')
      const h = await lightingHarness()
      h.run.props = []; h.run.robots = []; h.run.pickups = []; h.run.triggers = []
      h.run.level.climbables = { ropes: [], ladders: [] }; h.run.level.timers = []; h.run.level.triggers = []; h.run.level.texts = []
      const terrain = horizontal ? { x: 300, y: 300, w: 200, h: 40 } : { x: 300, y: 120, w: 40, h: 200 }
      const receiver = horizontal ? { x: 740, y: 300, w: 80, h: 40 } : { x: 300, y: 520, w: 40, h: 40 }
      h.run.level = { ...h.run.level, platforms: [terrain, receiver] }; h.run.terrain = h.run.level.platforms
      const definition = { id: 'moving', kind, x: horizontal ? 500 : 300, y: horizontal ? 300 : 320,
        w: horizontal ? 120 : 40, h: horizontal ? 40 : 120, travel: 120, ...(horizontal ? { orientation: 'horizontal' } : {}) }
      const m = { ...h.run.mechanisms[0], x: definition.x, y: definition.y, definition }
      h.run.mechanisms = [m]
      const forward = { id: 'lamp', x: horizontal ? 200 : 320, y: horizontal ? 320 : 60,
        intensity: 100, power: 'always', direction: horizontal ? 0 : 90, spread: 100 }
      const reverse = { ...forward, x: horizontal ? 700 : 320, y: horizontal ? 320 : 490, direction: horizontal ? 180 : -90 }
      const samples = []
      for (const gap of [0, 20, -10, 0, 1, 0]) {
        m.x = definition.x + (horizontal ? gap : 0); m.y = definition.y + (horizontal ? 0 : gap)
        const full = h.normal(), lit = h.render(0, [forward])
        const point = horizontal ? [m.x + 60, m.y + 20] : [m.x + 20, m.y + 60]
        const behind = horizontal ? [780, 320] : [320, 540]
        const fresh = new LightingRenderer()
        fresh.render(h.canvas.getContext('2d'), h.run, { ambient: 0, lights: [forward] }, h.view, .2)
        const cacheDifference = h.difference(lit, { pixels: h.canvas.getContext('2d').getImageData(0, 0, 1280, 720).data })
        fresh.dispose()
        const reverseLit = h.render(0, [reverse]), terrainPoint = horizontal ? [400, 320] : [320, 200]
        samples.push({ gap, full: h.pixel(full, ...point), lit: h.pixel(lit, ...point), cacheDifference,
          behind: h.pixel(lit, ...behind), behindFull: h.pixel(full, ...behind),
          reverse: h.pixel(reverseLit, ...terrainPoint), reverseFull: h.pixel(full, ...terrainPoint) })
      }
      h.renderer.dispose(); return samples
    }, { kind, horizontal })
    for (const sample of result) {
      expect(sample.cacheDifference).toBe(0)
      const exposure = sample.gap > 0 ? .35 : 1
      for (let channel = 0; channel < 3; channel++) {
        expect(Math.abs(sample.lit[channel] - sample.full[channel] * exposure), JSON.stringify(sample)).toBeLessThanOrEqual(2)
        expect(Math.abs(sample.reverse[channel] - sample.reverseFull[channel] * exposure), JSON.stringify(sample)).toBeLessThanOrEqual(2)
        expect(Math.abs(sample.behind[channel] - sample.behindFull[channel] * .35), JSON.stringify(sample)).toBeLessThanOrEqual(2)
      }
    }
  })
}

test('an offscreen mechanism cannot remove the visible shadow of a long terrain edge', async ({ page }) => {
  await page.goto('/untitled-jumping-game/lighting-lab')
  const result = await page.evaluate(async () => {
    const { lightingHarness } = await import('/tests/browser/helpers/lightingHarness.mjs')
    const h = await lightingHarness()
    h.run.props = []; h.run.robots = []
    const wall = { x: 300, y: 0, w: 20, h: 1200 }, receiver = { x: 600, y: 60, w: 80, h: 80 }
    h.run.level = { ...h.run.level, height: 1500, floor: 1500, platforms: [wall, receiver] }; h.run.terrain = [wall, receiver]
    const definition = { id: 'offscreen', kind: 'lift', x: 320, y: 950, w: 100, h: 20, travel: 100 }
    h.run.mechanisms = [{ x: 320, y: 950, definition }]
    const source = { id: 'lamp', x: 100, y: 100, direction: 0, spread: 100, intensity: 100, power: 'always' }
    const ambient = h.render(0), lit = h.render(0, [source])
    const sample = { ambient: h.pixel(ambient, 650, 100), lit: h.pixel(lit, 650, 100) }
    h.renderer.dispose(); return sample
  })
  expect(result.lit).toEqual(result.ambient)
})

test('a flush gate corner leaves no diagonal pinhole shadow through its face', async ({ page }, testInfo) => {
  await page.goto('/untitled-jumping-game/lighting-lab')
  const result = await page.evaluate(async () => {
    const { lightingHarness } = await import('/tests/browser/helpers/lightingHarness.mjs')
    const { createPreviewRun } = await import('/src/games/jumping/challenge.ts')
    const { parseLevel } = await import('/src/games/jumping/level.ts')
    const h = await lightingHarness(), level = parseLevel(await (await fetch('/tests/fixtures/jumping/lighting-gates.json')).json())
    Object.assign(h.run, createPreviewRun(level))
    Object.assign(h.view, { x: 1250, y: 625, zoom: 3 })
    const bright = h.render(100), lit = h.render(0, level.lighting.lights), failures = []
    for (let x = 1343; x < 1358; x++) for (let y = 684; y < 718; y++) {
      const expected = h.pixel(bright, x, y), actual = h.pixel(lit, x, y)
      if (actual.some((value, i) => Math.abs(value - expected[i]) > 2)) failures.push({ x, y, actual, expected })
    }
    const screenshot = h.canvas.toDataURL('image/png')
    h.renderer.dispose(); return { failures, screenshot }
  })
  const screenshot = testInfo.outputPath('gate-contact-closeup.png')
  await writeFile(screenshot, Buffer.from(result.screenshot.split(',')[1], 'base64'))
  await testInfo.attach('gate-contact-closeup', { path: screenshot, contentType: 'image/png' })
  expect(result.failures).toEqual([])
})
