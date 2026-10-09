import { ambientExposure } from '../../src/games/jumping/ambientLight.ts'

// Canvas multiply/add emission correction can round one 8-bit channel differently
// across Skia backends. Keep geometry and same-renderer cache checks exact.
function expectColor(actual, expected) {
  actual.forEach((value, i) => expect(Math.abs(value - expected[i])).toBeLessThanOrEqual(1))
}
import { test, expect } from './helpers/test.mjs'

test('player shadow outlines match the actual artwork in standing, running, crouching and airborne poses', async ({ page }) => {
  await page.goto('/untitled-jumping-game/lighting-lab')
  const result = await page.evaluate(async () => {
    const { drawAthlete } = await import('/src/games/jumping/athlete.ts')
    const { athleteCasters } = await import('/src/games/jumping/athleteShadow.ts')
    const { createPlayer, gaitPose } = await import('/src/games/jumping/model.ts')
    const { polygonPoints } = await import('/src/games/jumping/geometry.ts')
    const canvas = document.createElement('canvas'); canvas.width = 400; canvas.height = 320
    const ctx = canvas.getContext('2d', { willReadFrequently: true }), p = createPlayer({ x: 50, y: 75 })
    let wrongInterior = 0, worstAreaError = 0
    for (const facing of [-1, 1]) for (const crouch of [0, 1]) for (const grounded of [true, false]) for (const stride of [0, 1, 2]) {
      Object.assign(p, { facing, crouch, grounded, stride, vx: 180, vy: -120, gait: gaitPose(180, !grounded) })
      ctx.resetTransform(); ctx.clearRect(0, 0, 400, 320); ctx.scale(4, 4); drawAthlete(ctx, p, '#fff')
      const art = ctx.getImageData(0, 0, 400, 320).data
      ctx.resetTransform(); ctx.clearRect(0, 0, 400, 320); ctx.scale(4, 4); ctx.fillStyle = '#fff'
      for (const shape of athleteCasters(p)) {
        const points = polygonPoints(shape)
        ctx.beginPath(); ctx.moveTo(...points[0]); points.slice(1).forEach(point => ctx.lineTo(...point)); ctx.closePath(); ctx.fill()
      }
      const shadow = ctx.getImageData(0, 0, 400, 320).data
      let artArea = 0, shadowArea = 0
      for (let y = 2; y < 318; y++) for (let x = 2; x < 398; x++) {
        const i = (y * 400 + x) * 4 + 3
        artArea += art[i]; shadowArea += shadow[i]
        if (Math.abs(art[i] - shadow[i]) < 200) continue
        // Polygon flattening may differ at the antialiased boundary, never inside a limb.
        let boundary = false
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          if (Math.abs(art[((y + dy) * 400 + x + dx) * 4 + 3] - art[i]) > 100) boundary = true
        }
        if (!boundary) wrongInterior++
      }
      worstAreaError = Math.max(worstAreaError, Math.abs(artArea - shadowArea) / artArea)
    }
    return { wrongInterior, worstAreaError }
  })
  expect(result.wrongInterior).toBe(0)
  expect(result.worstAreaError).toBeLessThan(.035)
})

test('the player receives light, casts a moving shadow, and releases light while exiting', async ({ page }) => {
  await page.goto('/untitled-jumping-game/lighting-lab')
  const result = await page.evaluate(async () => {
    const { lightingHarness } = await import('/tests/browser/helpers/lightingHarness.mjs')
    const { athletePose } = await import('/src/games/jumping/athlete.ts')
    const h = await lightingHarness()
    h.run.level.platforms = []; h.run.terrain = []; h.run.props = []; h.run.mechanisms = []; h.run.robots = []
    Object.assign(h.run.player, { x: 500, y: 400, grounded: true })
    const head = athletePose(h.run.player).head, x = 500 + head[0], y = 400 + head[1]
    const light = { id: 'side', x: x - 100, y, intensity: 100, power: 'always', direction: 0, spread: 120 }
    h.run.props = [{ kind: 'box', x: x + 55, y: y + 30, size: 60, angle: 0 }]
    const pixel = frame => h.pixel(frame, x + 30, y)
    const full = h.fullBright(), ambient = h.render(0), standing = h.render(0, [light])
    h.run.player.crouch = 1
    const crouched = h.render(0, [light])
    h.run.player.crouch = 0
    h.run.exit = { elapsed: .5 }; const fading = h.render(0, [light])
    h.run.exit.elapsed = .75; const gone = h.render(0, [light])
    h.run.exit = null; h.run.empRemaining = 5; const outage = h.render(0, [light])
    const result = { full: pixel(full), ambient: pixel(ambient), standing: pixel(standing), crouched: pixel(crouched),
      fading: pixel(fading), gone: pixel(gone), outage: pixel(outage), ink: h.pixel(standing, x, y), ambientInk: h.pixel(ambient, x, y) }
    h.renderer.dispose(); return result
  })
  expect(result.standing).toEqual(result.ambient)
  expect(result.crouched).toEqual(result.full)
  expect(result.gone).toEqual(result.full)
  expect(result.outage).toEqual(result.ambient)
  expectColor(result.ink, [229, 231, 230])
  expectColor(result.ambientInk, [229, 231, 230].map(channel => Math.round(channel * .65)))
  expect(result.fading[0]).toBeGreaterThan(result.standing[0])
  expect(result.fading[0]).toBeLessThan(result.gone[0])
})

test('lighting lab loads independently, exposes keyboard controls, and uses fixed night brightness during EMP', async ({ page }) => {
  await page.goto('/untitled-jumping-game/lighting-lab')
  await expect(page.locator('canvas')).toHaveAttribute('data-ready', 'true')
  await expect(page.getByRole('slider', { name: 'Ambient light' })).toHaveCount(0)
  await page.getByRole('button', { name: 'EMP blackout' }).click()
  await expect(page.getByRole('slider', { name: 'Ambient light' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'EMP blackout' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('combobox', { name: 'View', exact: true }).selectOption('player')
  await expect(page.getByRole('combobox', { name: 'View', exact: true })).toHaveValue('player')
  await page.getByRole('button', { name: 'Play room' }).click()
  await expect(page.locator('canvas')).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await page.getByRole('button', { name: 'Inspect room' }).click()
  await expect(page.locator('[role="alert"]')).toHaveCount(0)
})

for (const backend of ['canvas', 'gpu']) test(`${backend}: the readable night player retains spotlights, shadows and EMP`, async ({ page }) => {
  await page.goto('/tests/fixtures/jumping/lighting-prototype.json')
  const results = await page.evaluate(async backend => {
    const { lightingHarness } = await import('/tests/browser/helpers/lightingHarness.mjs')
    const { athletePose } = await import('/src/games/jumping/athlete.ts')
    const { createPlayer } = await import('/src/games/jumping/model.ts')
    const h = await lightingHarness({ backend }), results = [], box = { ...h.run.props[0], x: 500, y: 250, size: 120, angle: 0 }
    h.run.level.platforms = []; h.run.terrain = []; h.run.props = []; h.run.mechanisms = []; h.run.robots = []
    const lamp = { id: 'overhead', x: 500, y: 80, intensity: 100, power: 'always', direction: 90, spread: 40 }
    for (const [ambient, nightMode] of [[0, true], [50, true], [100, true], [100, false]]) for (const x of [350, 500]) {
      // This isolated lighting fixture has no footing. Replacing the player
      // avoids retaining the preview world's planted shoes at its old spawn.
      h.run.player = createPlayer({ x, y: 400 })
      const { head, hip } = athletePose(h.run.player)
      for (const condition of ['unlit', 'spotlight', 'blocked', 'emp']) {
        h.run.props = condition === 'blocked' ? [box] : []
        h.run.empRemaining = condition === 'emp' ? 5 : 0
        const frame = h.render(ambient, condition === 'unlit' ? [] : [lamp], .2, undefined, nightMode)
        results.push({ ambient, nightMode, x, condition, backend: frame.stats.backend,
          head: h.pixel(frame, x + head[0], 400 + head[1]), torso: h.pixel(frame, x + hip[0], 400 + hip[1]) })
      }
    }
    h.renderer.dispose(); return results
  }, backend)
  for (const result of results) {
    const lit = result.x === 500 && result.condition === 'spotlight'
    const expected = !result.nightMode ? [48, 60, 54] : [229, 231, 230].map(channel => Math.round(channel * (lit ? 1 : .65)))
    for (const part of ['head', 'torso']) result[part].forEach((channel, i) =>
      expect(Math.abs(channel - expected[i]), JSON.stringify(result)).toBeLessThanOrEqual(1))
    expect(result.backend).toBe(backend)
  }
})

test('full-bright editing preserves the original dark player ink with no lighting surfaces', async ({ page }) => {
  await page.goto('/untitled-jumping-game/lighting-lab')
  const result = await page.evaluate(async () => {
    const { lightingHarness } = await import('/tests/browser/helpers/lightingHarness.mjs')
    const { athletePose } = await import('/src/games/jumping/athlete.ts')
    const h = await lightingHarness()
    const comparisons = []
    for (const time of [0, .17, .3]) {
      h.run.pickupTime = time; h.run.goalLit = time > 0
      h.run.goalElapsed = time; h.run.pickups[2].collectedAge = time || null
      const normal = h.normal('#303c36', h.fixture.lighting.lights), lit = h.fullBright(h.fixture.lighting.lights)
      comparisons.push({ difference: h.difference(normal, lit), bytes: lit.stats.bufferBytes })
    }
    const legacy = h.normal(), { head } = athletePose(h.run.player)
    const legacyInk = h.pixel(legacy, h.run.player.x + head[0], h.run.player.y + head[1])
    h.renderer.dispose(); return { comparisons, legacyInk }
  })
  expect(result.comparisons).toEqual(Array.from({ length: 3 }, () => ({ difference: 0, bytes: 0 })))
  expectColor(result.legacyInk, [104, 107, 110])
})

test('playground players receive lighting with full or reduced object shadows', async ({ page }) => {
  await page.goto('/tests/fixtures/jumping/lighting-prototype.json')
  const samples = await page.evaluate(async () => {
    const { lightingHarness } = await import('/tests/browser/helpers/lightingHarness.mjs')
    const { playgroundLightingWorld } = await import('/src/games/jumping/lightingModel.ts')
    const { athletePose } = await import('/src/games/jumping/athlete.ts')
    const h = await lightingHarness(), samples = []
    h.run.level = { ...h.run.level, platforms: [], texts: [], climbables: { ladders: [], ropes: [] } }
    Object.assign(h.run.player, { x: 500, y: 400, grounded: true })
    const head = athletePose(h.run.player).head, x = 500 + head[0], y = 400 + head[1]
    const world = playgroundLightingWorld(h.run.level, h.run.player), ctx = h.canvas.getContext('2d')
    const lamp = { id: 'side', x: x - 100, y, intensity: 100, power: 'always', direction: 0, spread: 120 }
    for (const shadows of ['full', 'structural']) for (const lit of [false, true]) {
      h.renderer.render(ctx, world, { nightMode: true, ambient: 50, lights: lit ? [lamp] : [] }, h.view, .2, undefined, false, shadows)
      samples.push({ lit, pixel: [...ctx.getImageData(Math.floor(x), Math.floor(y - h.view.y), 1, 1).data].slice(0, 3) })
    }
    h.renderer.dispose(); return samples
  })
  // Compare with quantized pixel channels, matching the other ambient checks.
  for (const sample of samples) expectColor(sample.pixel, [229, 231, 230].map(channel => Math.round(channel * (sample.lit ? 1 : .65))))
})

for (const backend of ['canvas', 'gpu']) test(`${backend}: the player stays readable in darkness and receives partial shadows`, async ({ page }, info) => {
  await page.goto('/tests/fixtures/jumping/lighting-prototype.json')
  const result = await page.evaluate(async backend => {
    const { lightingHarness } = await import('/tests/browser/helpers/lightingHarness.mjs')
    const { athletePose } = await import('/src/games/jumping/athlete.ts')
    const h = await lightingHarness({ backend })
    h.run.level = { ...h.run.level, platforms: [], texts: [], timers: [], triggers: [], climbables: { ladders: [], ropes: [] } }
    h.run.terrain = []; h.run.mechanisms = []; h.run.robots = []; h.run.triggers = []; h.run.pickups = []
    Object.assign(h.run.player, { x: 500, y: 400, grounded: true })
    const { head, hip } = athletePose(h.run.player), x = 500 + head[0], y = 400 + head[1]
    const ball = { kind: 'ball', x: 600, y: 400, size: 60, angle: 0 }
    h.run.props = [ball]
    const lamp = { id: 'side', x: x - 100, y, intensity: 100, power: 'always', direction: 0, spread: 120 }
    const comparison = document.createElement('canvas'); comparison.width = 720; comparison.height = 210
    const ctx = comparison.getContext('2d')
    const capture = (label, index) => {
      ctx.fillStyle = '#f4f2e9'; ctx.fillRect(index * 240, 0, 240, 210)
      ctx.fillStyle = '#303c36'; ctx.font = '16px sans-serif'; ctx.fillText(label, index * 240 + 16, 26)
      ctx.drawImage(h.canvas, 470, 345, 180, 110, index * 240, 50, 240, 147)
    }
    const dark = h.render(0); capture('Ambient only', 0)
    const lit = h.render(0, [lamp]); capture('In the beam', 1)
    h.run.props = [ball, { kind: 'box', x: x - 50, y: y + 7, size: 14, angle: 0 }]
    const partial = h.render(0, [lamp]); capture('Partial shadow', 2)
    h.run.props = [ball]; h.run.exit = { elapsed: .5 }
    const fading = h.render(0)
    h.run.exit.elapsed = .75; const gone = h.render(0)
    const result = { dark: h.pixel(dark, x, y), ball: h.pixel(dark, 600, 370), wall: h.pixel(dark, 550, y),
      lit: h.pixel(lit, x, y), partialHead: h.pixel(partial, x, y), partialTorso: h.pixel(partial, 500 + hip[0], 400 + hip[1]),
      fading: h.pixel(fading, x, y), gone: h.pixel(gone, x, y) }
    document.body.replaceChildren(comparison)
    h.renderer.dispose(); return result
  }, backend)
  expectColor(result.dark, [229, 231, 230].map(channel => Math.round(channel * .65)))
  expectColor(result.ball, [143, 158, 152].map(channel => Math.round(channel * .35)))
  expect(result.dark[0] - result.wall[0]).toBeGreaterThan(50)
  expectColor(result.lit, [229, 231, 230])
  expectColor(result.partialHead, result.dark)
  expectColor(result.partialTorso, result.lit)
  expectColor(result.fading, result.dark.map((channel, i) => (channel + result.gone[i]) / 2))
  await page.locator('canvas').screenshot({ path: info.outputPath(`${backend}-player-and-ball.png`) })
})

test('darkness shades pickups and preserves display exposure without painting through foreground objects', async ({ page }) => {
  await page.goto('/untitled-jumping-game/lighting-lab')
  const result = await page.evaluate(async () => {
    const { lightingHarness } = await import('/tests/browser/helpers/lightingHarness.mjs')
    const h = await lightingHarness(), bright = h.fullBright(), dark = h.render(0)
    const results = {
      coin: h.pixel(dark, 100, 240), originalCoin: h.pixel(bright, 100, 240),
      wall: h.pixel(dark, 400, 100), originalWall: h.pixel(bright, 400, 100),
      clock: h.pixel(dark, 1035, 65),
      hiddenPickup: h.pixel(dark, 705, 592), originalCover: h.pixel(bright, 705, 592),
    }
    h.run.props[0].x = 780
    const uncovered = h.render(0)
    h.run.pickups = []
    const without = h.render(0)
    results.revealedPixels = 0
    for (let y = 580; y < 604; y++) for (let x = 697; x < 713; x++) {
      if (h.pixel(uncovered, x, y).some((c, i) => Math.abs(c - h.pixel(without, x, y)[i]) > 5)) results.revealedPixels++
    }
    h.renderer.dispose(); return results
  })
  expectColor(result.coin, result.originalCoin.map(c => Math.round(c * .35)))
  result.wall.forEach((channel, i) => expect(Math.abs(channel - result.originalWall[i] * .35)).toBeLessThanOrEqual(2))
  result.hiddenPickup.forEach((channel, i) => expect(Math.abs(channel - result.originalCover[i] * .35)).toBeLessThanOrEqual(2))
  expectColor(result.clock, [9, 15, 12].map(c => Math.round(c * .35)))
  expect(result.revealedPixels).toBeGreaterThan(20)
})

test('lamp overlap, order, ambient-only terrain and source occlusion agree at the pixel level', async ({ page }) => {
  await page.goto('/untitled-jumping-game/lighting-lab')
  const result = await page.evaluate(async () => {
    const { lightingHarness } = await import('/tests/browser/helpers/lightingHarness.mjs')
    const h = await lightingHarness()
    const a = { ...h.fixture.lighting.lights[0], intensity: 70 }, b = h.fixture.lighting.lights[1]
    const single = h.render(20, [a]), duplicate = h.render(20, [a, { ...a, id: 'duplicate' }])
    const forward = h.render(20, [a, b]), reverse = h.render(20, [b, a])
    const inside = h.render(20, [{ ...a, x: 700, y: 595 }]), ambient = h.render(20)
    // Coincident physical fixtures and their short haze overlap as artwork.
    // Compare the light field beyond those source cues, where overlap stays max-only.
    for (let y = a.y - 58; y <= a.y + 58; y++) for (let x = a.x - 58; x <= a.x + 58; x++) {
      const offset = ((y - h.view.y) * h.canvas.width + x) * 4
      duplicate.pixels.set(single.pixels.slice(offset, offset + 4), offset)
    }
    const bright = h.fullBright()
    const result = { duplicate: h.difference(single, duplicate), order: h.difference(forward, reverse),
      covered: h.difference(inside, ambient), front: h.pixel(single, 430, 330), wall: h.pixel(single, 490, 330),
      brightFront: h.pixel(bright, 430, 330), brightWall: h.pixel(bright, 490, 330) }
    h.renderer.dispose(); return result
  })
  expect(result.duplicate).toBe(0)
  expect(result.order).toBe(0)
  expect(result.covered).toBe(0)
  result.front.forEach((value, i) => expect(Math.abs(value - result.brightFront[i] * ambientExposure(20))).toBeLessThanOrEqual(3))
  result.wall.forEach((value, i) => expect(Math.abs(value - result.brightWall[i] * ambientExposure(20))).toBeLessThanOrEqual(3))
})

test('EMP leaves ambient and the green exit indicator visible without casting any exit light', async ({ page }) => {
  await page.goto('/untitled-jumping-game/lighting-lab')
  const result = await page.evaluate(async () => {
    const { lightingHarness } = await import('/tests/browser/helpers/lightingHarness.mjs')
    const h = await lightingHarness()
    const results = []
    for (const flipX of [false, true]) {
      h.run.level.goal.flipX = flipX
      const pole = h.run.level.goal.x + (flipX ? -44 : 44), lampY = h.run.level.goal.y - 96
      for (const emp of [0, 5]) {
        h.run.empRemaining = emp; h.run.goalLit = false
        const before = h.render(0, h.fixture.lighting.lights)
        h.run.goalLit = true; const after = h.render(0, h.fixture.lighting.lights)
        let outsideChanges = 0
        // All changes must stay within the exit indicator's lens.
        for (let y = 0; y < 630; y++) for (let x = 0; x < 1280; x++) {
          if (Math.hypot(x + .5 - pole, y + .5 - lampY) < 13) continue
          const a = h.pixel(before, x, y), b = h.pixel(after, x, y)
          if (a.some((channel, i) => channel !== b[i])) outsideChanges++
        }
        const ambient = h.render(0, h.fixture.lighting.lights)
        results.push({ lens: h.pixel(after, pole, lampY), outsideChanges,
          lights: after.stats.lights, sources: after.stats.sources.map(source => source.id),
          outageDifference: emp ? h.difference(after, ambient) : 0,
          clock: h.pixel(after, 1035, 65) })
      }
    }
    h.renderer.dispose(); return results
  })
  for (const entry of result) {
    expectColor(entry.lens, [169, 213, 107])
    expect(entry.outsideChanges).toBe(0)
    expect(entry.outageDifference).toBe(0)
    expect(entry.sources).toEqual(['spot-left', 'spot-middle', 'spot-right'])
    expectColor(entry.clock, [9, 15, 12].map(c => Math.round(c * .35)))
  }
})

test('spotlights reach distant viewports; offscreen objects and structures block without distance fade', async ({ page }) => {
  await page.goto('/untitled-jumping-game/lighting-lab')
  const results = await page.evaluate(async () => {
    const { lightingHarness } = await import('/tests/browser/helpers/lightingHarness.mjs')
    const h = await lightingHarness(), results = []
    const box = { ...h.run.props[0], x: 6000, y: 140, size: 80, angle: 0 }
    h.run.level.width = 12000; h.run.level.platforms = []; h.run.terrain = []; h.run.mechanisms = []; h.run.robots = []
    const receivers = [{ kind: 'box', x: 11100, y: 140, size: 80, angle: 0 }]
    h.view.x = 10000
    for (const spread of [40, 120]) {
      h.run.props = receivers
      h.run.level = { ...h.run.level, platforms: [] }; h.run.terrain = []
      const source = { id: 'distant', x: 300, y: 100, intensity: 100, power: 'always', direction: 0, spread }
      const bright = h.fullBright(), lit = h.render(20, [source])
      h.run.props = [...receivers, box]
      const objectShadow = h.render(20, [source])
      h.run.props = receivers; h.run.level = { ...h.run.level, platforms: [...h.run.level.platforms, { x: 5960, y: 60, w: 80, h: 80 }] }; h.run.terrain = h.run.level.platforms
      const shadow = h.render(20, [source]), ambient = h.render(20)
      results.push({ objectShadow: h.pixel(objectShadow, 11101, 101), far: h.pixel(lit, 11101, 101),
        original: h.pixel(bright, 11101, 101), shadow: h.pixel(shadow, 11101, 101), ambient: h.pixel(ambient, 11101, 101) })
    }
    h.renderer.dispose(); return results
  })
  for (const result of results) {
    expect(result.far).toEqual(result.original)
    expect(result.objectShadow).toEqual(result.ambient)
    expect(result.shadow).toEqual(result.ambient)
    expect(result.shadow[0]).toBeLessThan(result.far[0])
  }
})

test('spotlights stop at all four room edges', async ({ page }) => {
  await page.goto('/untitled-jumping-game/lighting-lab')
  const results = await page.evaluate(async () => {
    const { lightingHarness } = await import('/tests/browser/helpers/lightingHarness.mjs')
    const h = await lightingHarness()
    h.run.level.platforms = []; h.run.terrain = []; h.run.props = []; h.run.mechanisms = []; h.run.robots = []
    h.run.props = [{ kind: 'box', x: 1200, y: 560, size: 100, angle: 0 }]
    Object.assign(h.view, { x: -160, y: -130, zoom: .8 })
    const bright = h.fullBright()
    const ambient = h.render(20), source = { id: 'lamp', x: 600, y: 300, intensity: 100, power: 'always' }
    const frames = [0, 90, 180, -90].map(direction => h.render(20, [{ ...source, spread: 160, direction }]))
    const results = frames.map(frame => ({
      outside: [[-10, 300], [1290, 300], [600, -10], [600, 650]].map(([x, y]) => ({ actual: h.pixel(frame, x, y), expected: h.pixel(ambient, x, y) })),
      inside: h.pixel(frame, 1194, 500), brightInside: h.pixel(bright, 1194, 500),
    }))
    h.renderer.dispose(); return results
  })
  for (const frame of results) for (const sample of frame.outside) expect(sample.actual).toEqual(sample.expected)
  expect(results[0].inside).toEqual(results[0].brightInside)
})

test('study source isolation and elevator controls can freeze a shadow for inspection', async ({ page }) => {
  await page.goto('/untitled-jumping-game/lighting-lab')
  await expect(page.locator('canvas')).toHaveAttribute('data-ready', 'true')
  const markers = page.getByRole('button', { name: 'Show sources' })
  await expect(markers).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('combobox', { name: 'View', exact: true }).selectOption('bot')
  await expect(page.getByRole('combobox', { name: 'View', exact: true })).toHaveValue('bot')
  await page.getByRole('combobox', { name: 'Light', exact: true }).selectOption('spot-middle')
  await expect(page.locator('footer output')).toContainText('1 light ·')
  const elevator = page.getByRole('slider', { name: 'Elevator position' })
  await elevator.fill('72')
  await expect(elevator).toHaveValue('72')
  await page.getByRole('button', { name: 'Cycle elevator' }).click()
  await expect.poll(() => elevator.inputValue()).not.toBe('72')
  await elevator.fill('50')
  await expect(page.getByRole('button', { name: 'Cycle elevator' })).toHaveAttribute('aria-pressed', 'false')
  await expect(elevator).toHaveValue('50')
  await markers.click()
  await expect(markers).toHaveAttribute('aria-pressed', 'false')
  await page.getByRole('button', { name: 'Play room' }).click()
  await expect(elevator).toBeDisabled()
})

test('bot body and wheels share lighting while its eye stays readable until EMP, across facings and tilted/windup poses', async ({ page }) => {
  await page.goto('/untitled-jumping-game/lighting-lab')
  const cases = await page.evaluate(async () => {
    const { lightingHarness } = await import('/tests/browser/helpers/lightingHarness.mjs')
    const { robotTop } = await import('/src/games/jumping/robotPhysics.ts')
    const { dynamicCasters, exposureAt } = await import('/src/games/jumping/lightingModel.ts')
    const h = await lightingHarness(), box = { ...h.run.props[0], x: 600, y: 330, size: 150, angle: 0 }
    h.run.level.platforms = []; h.run.terrain = []; h.run.props = []; h.run.mechanisms = []
    const robot = h.run.robots[0], results = []
    const lamps = [60, 140].map(spread => ({ id: 'above', x: 600, y: 80, intensity: 100, power: 'always', direction: 90, spread }))
    for (const angle of [0, -.3, .4]) for (const facing of [-1, 1]) for (const phase of ['patrol', 'windup']) {
      Object.assign(robot, { x: 600, y: 400, angle, facing, phase, seesPlayer: true })
      const top = robotTop(robot), c = Math.cos(angle), s = Math.sin(angle)
      const at = ([x, y]) => [robot.x + x * facing * c - (y + 9) * s, robot.y - 9 + x * facing * s + (y + 9) * c]
      const ordinary = [[0, top + 25], [-17, -5], [17, -5]].map(at), eye = at([13.5, top + 12.5])
      h.run.empRemaining = 0; h.run.props = []
      const bright = h.fullBright(), dark = h.render(0)
      const lit = lamps.map(lamp => h.render(20, [lamp]))
      h.run.props = [box]; const shadow = h.render(20, [lamps[0]]), shadowGroups = dynamicCasters(h.run)
      h.run.props = []; h.run.empRemaining = 5
      const outage = h.render(20, [lamps[0]]), unpoweredBright = h.fullBright()
      results.push({
        body: ordinary.map(point => ({ bright: h.pixel(bright, ...point), dark: h.pixel(dark, ...point),
          lit: lit.map(image => h.pixel(image, ...point)), shadow: h.pixel(shadow, ...point), outage: h.pixel(outage, ...point),
          shadowExposure: exposureAt(20, [{ ...lamps[0], fade: 1 }], shadowGroups, Math.floor(point[0]) + .5, Math.floor(point[1]) + .5) })),
        eye: { bright: h.pixel(bright, ...eye), dark: h.pixel(dark, ...eye), shadow: h.pixel(shadow, ...eye),
          outage: h.pixel(outage, ...eye), unpowered: h.pixel(unpoweredBright, ...eye) },
      })
    }
    h.renderer.dispose(); return results
  })
  for (const pose of cases) {
    for (const part of pose.body) {
      part.dark.forEach((value, i) => expect(Math.abs(value - part.bright[i] * .35)).toBeLessThanOrEqual(2))
      for (const lit of part.lit) expect(lit).toEqual(part.bright)
      part.shadow.forEach((value, i) => expect(Math.abs(value - part.bright[i] * part.shadowExposure)).toBeLessThanOrEqual(2))
      part.outage.forEach((value, i) => expect(Math.abs(value - part.bright[i] * ambientExposure(20))).toBeLessThanOrEqual(2))
    }
    expectColor(pose.eye.dark, pose.eye.bright)
    expectColor(pose.eye.shadow, pose.eye.bright)
    expect(pose.eye.outage).not.toEqual(pose.eye.bright)
    pose.eye.outage.forEach((value, i) => expect(Math.abs(value - pose.eye.unpowered[i] * ambientExposure(20))).toBeLessThanOrEqual(2))
  }
})

test('spotlight edges remain narrow at long distances and agree with exposure sampling', async ({ page }) => {
  await page.goto('/untitled-jumping-game/lighting-lab')
  const samples = await page.evaluate(async () => {
    const { lightingHarness } = await import('/tests/browser/helpers/lightingHarness.mjs')
    const { lightContribution, combineExposure } = await import('/src/games/jumping/lightingModel.ts')
    const h = await lightingHarness(), results = []
    h.run.level.width = 12000; h.run.level.height = 12000; h.run.level.floor = 12000
    h.run.level.platforms = []; h.run.terrain = []; h.run.props = []; h.run.mechanisms = []; h.run.robots = []
    const lamp = { id: 'spot', x: 40, y: 40, intensity: 80, power: 'always', direction: 0, spread: 90 }
    for (const distance of [400, 4000, 10000]) {
      // The lower edge is y=x; move the viewport along it without changing the light.
      h.view.x = distance - 200; h.view.y = distance - 200
      h.run.props = [{ kind: 'box', x: distance + 20, y: distance + 30, size: 60, angle: 0 }]
      const bright = h.fullBright(), lit = h.render(20, [lamp])
      for (const inward of [-3, 1, 6, 20]) {
        const x = distance + 3, y = distance + 3 - inward
        const expected = combineExposure(20, [lightContribution({ ...lamp, fade: 1 }, x + .5, y + .5)])
        results.push({ actual: h.pixel(lit, x, y), bright: h.pixel(bright, x, y), expected, inward })
      }
    }
    h.renderer.dispose(); return results
  })
  for (const sample of samples) {
    sample.actual.forEach((value, i) => expect(Math.abs(value - sample.bright[i] * sample.expected)).toBeLessThanOrEqual(3))
    if (sample.inward >= 6) expect(sample.expected).toBeCloseTo(1)
    if (sample.inward < 0) expect(sample.expected).toBe(ambientExposure(20))
  }
})

test('source markers use resolved positions and isolation does not mutate the scene or power states', async ({ page }) => {
  await page.goto('/untitled-jumping-game/lighting-lab')
  const result = await page.evaluate(async () => {
    const { lightingHarness } = await import('/tests/browser/helpers/lightingHarness.mjs')
    const { drawLightSources } = await import('/src/games/jumping/lightingStudy.ts')
    const h = await lightingHarness(), lights = structuredClone(h.fixture.lighting.lights)
    h.run.mechanisms[0].y -= 80
    const before = JSON.stringify({ level: h.run.level, mechanisms: h.run.mechanisms, lights })
    const isolated = h.render(20, lights, .2, 'spot-middle')
    const after = JSON.stringify({ level: h.run.level, mechanisms: h.run.mechanisms, lights })
    const single = h.render(20, [lights[1]])
    // Isolation keeps the other physical fixtures visible. Compare the field
    // while excluding only their small silhouettes from this single-lamp view.
    for (const source of isolated.stats.sources.filter(l => l.id !== lights[1].id)) {
      for (let y = source.y - 15; y <= source.y + 15; y++) for (let x = source.x - 15; x <= source.x + 15; x++) {
        const offset = ((y - h.view.y) * h.canvas.width + x) * 4
        single.pixels.set(isolated.pixels.slice(offset, offset + 4), offset)
      }
    }
    const difference = h.difference(isolated, single)
    const ctx = h.canvas.getContext('2d')
    ctx.clearRect(0, 0, h.canvas.width, h.canvas.height)
    drawLightSources(ctx, isolated.stats.sources, h.view, 'spot-middle')
    const marked = { pixels: ctx.getImageData(0, 0, h.canvas.width, h.canvas.height).data }
    const result = { before, after, difference,
      wallPosition: h.pixel(marked, 280, 180), active: h.pixel(marked, 750, 490),
      displaced: h.pixel(marked, 280, 100), sources: isolated.stats.sources.map(s => ({ id: s.id, fade: s.fade })) }
    h.renderer.dispose(); return result
  })
  expect(result.before).toBe(result.after)
  expect(result.difference).toBe(0)
  expect(result.wallPosition).toEqual([211, 220, 216])
  expect(result.active).toEqual([223, 180, 79])
  expect(result.displaced).toEqual([0, 0, 0])
  expect(result.sources.slice(0, 3).every(s => s.fade === 1)).toBe(true)
})

test('elevator shadows match visibility rays throughout travel, including crossing a lamp height', async ({ page }) => {
  await page.goto('/untitled-jumping-game/lighting-lab')
  const result = await page.evaluate(async () => {
    const { lightingHarness } = await import('/tests/browser/helpers/lightingHarness.mjs')
    const { ambientExposure, staticCasters, dynamicCasters, exposureAt } = await import('/src/games/jumping/lightingModel.ts')
    const h = await lightingHarness()
    h.run.level.platforms = []; h.run.terrain = []; h.run.props = []; h.run.robots = []
    h.run.mechanisms = [h.run.mechanisms[0]]
    h.run.props = [{ kind: 'box', x: -20, y: 640, size: 640, angle: 0 }]
    h.run.player.x = 1200; h.run.level.climbables = { ropes: [], ladders: [] }
    const source = h.fixture.lighting.lights[1], mismatches = [], shadowCounts = []
    let checked = 0
    for (const y of [620, 580, 540, 500, 490, 480, 470, 460, 440, 490, 620]) {
      h.run.mechanisms[0].y = y
      const bright = h.fullBright(), frame = h.render(20, [source])
      const groups = [...staticCasters(h.run), ...dynamicCasters(h.run)]
      let shadowed = 0
      for (let py = 45; py < 640; py += 40) for (let px = 45; px < 300; px += 20) {
        const original = h.pixel(bright, px, py)
        const sample = (dx, dy) => exposureAt(20, [{ ...source, fade: 1 }], groups, px + .5 + dx, py + .5 + dy, h.run.level)
        const exposure = sample(0, 0)
        // Avoid antialias coverage at an edge; independently trace the interior pixels.
        if ([[-1, -1], [-1, 1], [1, -1], [1, 1]].some(([dx, dy]) => Math.abs(sample(dx, dy) - exposure) > .01)) continue
        checked++; if (exposure === ambientExposure(20)) shadowed++
        const expected = original[0] * exposure, actual = h.pixel(frame, px, py)[0]
        if (Math.abs(expected - actual) > 3) mismatches.push({ elevator: y, x: px, y: py, expected, actual })
      }
      shadowCounts.push(shadowed)
    }
    h.renderer.dispose(); return { checked, mismatches, shadowCounts }
  })
  expect(result.checked).toBeGreaterThan(1500)
  expect(result.mismatches).toEqual([])
  expect(new Set(result.shadowCounts).size).toBeGreaterThan(3)
  expect(result.shadowCounts[0]).toBe(result.shadowCounts.at(-1))
})

test('stationary caches invalidate on light edits, camera changes and terrain revisions, and remain bounded at high DPR', async ({ page }) => {
  await page.goto('/untitled-jumping-game/lighting-lab')
  const result = await page.evaluate(async () => {
    const { lightingHarness } = await import('/tests/browser/helpers/lightingHarness.mjs')
    const { LightingRenderer, lightingPixelRatio } = await import('/src/games/jumping/lightingRender.ts')
    const { staticCasters } = await import('/src/games/jumping/lightingModel.ts')
    const h = await lightingHarness(), lights = structuredClone(h.fixture.lighting.lights), differences = []
    const check = () => {
      const frame = h.render(25, lights), fresh = new LightingRenderer()
      fresh.render(h.canvas.getContext('2d'), h.run, { ambient: 25, lights }, h.view, .2, undefined, false, 'full')
      differences.push(h.difference(frame, { pixels: h.canvas.getContext('2d').getImageData(0, 0, 1280, 720).data }))
      fresh.dispose()
    }
    for (let i = 0; i < 4; i++) h.render(25, lights)
    check()
    lights[0].direction += 20; check()
    lights[1].spread = 45; check()
    h.view.x += 80; h.view.zoom = .9; check()
    h.run.level = { ...h.run.level, platforms: h.run.level.platforms.slice(1) }
    h.renderer.prepare(h.run.level, staticCasters(h.run)); check()
    const ratio = lightingPixelRatio(1920, 1080, 2)
    const canvas = document.createElement('canvas'); canvas.width = Math.round(1920 * ratio); canvas.height = Math.round(1080 * ratio)
    const stats = h.renderer.render(canvas.getContext('2d'), h.run, { ambient: 25, lights }, { ...h.view, width: canvas.width, height: canvas.height, zoom: ratio }, .2, undefined, false, 'full')
    h.renderer.release()
    const restored = h.render(25, lights); check()
    const result = { differences, bytes: stats.bufferBytes, restored: restored.stats.lights, width: canvas.width, height: canvas.height }
    h.renderer.dispose(); return result
  })
  expect(result.differences).toEqual([0, 0, 0, 0, 0, 0])
  expect(result.bytes).toBeLessThan(64 * 1024 * 1024)
  expect(result.width * result.height).toBeLessThan(2_100_000)
  expect(result.restored).toBeGreaterThan(0)
})


test('empty lighting viewports release buffers and resume with an unchanged image', async ({ page }) => {
  await page.goto('/untitled-jumping-game/lighting-lab')
  const result = await page.evaluate(async () => {
    const { lightingHarness } = await import('/tests/browser/helpers/lightingHarness.mjs')
    const h = await lightingHarness(), lights = h.fixture.lighting.lights
    const expected = h.render(0, lights), hidden = [], differences = [], restoredBytes = []
    for (const [width, height] of [[0, 720], [1280, 0], [0, 0]]) {
      const stats = h.renderer.render(h.canvas.getContext('2d'), h.run, { ambient: 0, lights }, { ...h.view, width, height }, .2, undefined, false, 'full')
      hidden.push({ lights: stats.lights, edges: stats.edges, bytes: stats.bufferBytes })
      const restored = h.render(0, lights)
      differences.push(h.difference(expected, restored)); restoredBytes.push(restored.stats.bufferBytes)
    }
    h.renderer.dispose(); return { hidden, differences, restoredBytes }
  })
  expect(result.hidden).toEqual(Array(3).fill({ lights: 0, edges: 0, bytes: 0 }))
  expect(result.differences).toEqual([0, 0, 0])
  expect(result.restoredBytes.every(bytes => bytes > 0)).toBe(true)
})


test('night and day modes ignore legacy ambient values', async ({ page }) => {
  await page.goto('/untitled-jumping-game/lighting-lab')
  const results = await page.evaluate(async () => {
    const { lightingHarness } = await import('/tests/browser/helpers/lightingHarness.mjs')
    const h = await lightingHarness()
    h.run.level = { ...h.run.level, platforms: [], texts: [], timers: [], triggers: [], climbables: { ropes: [], ladders: [] } }
    h.run.terrain = h.run.level.platforms; h.run.props = []; h.run.robots = []; h.run.mechanisms = []; h.run.triggers = []; h.run.pickups = []
    h.run.props = [{ kind: 'box', x: 670, y: 390, size: 150, angle: 0 }]
    const source = { id: 'lamp', x: 180, y: 160, direction: 0, spread: 120, intensity: 100, power: 'always' }
    const bright = h.fullBright(), original = h.pixel(bright, 650, 300), samples = []
    for (const [ambient, nightMode] of [[0, true], [50, true], [99, true], [100, true], [100, false], [0, false], [100, true]]) {
      const base = h.render(ambient, [], .2, undefined, nightMode), lit = h.render(ambient, [source], .2, undefined, nightMode)
      samples.push({ ambient, nightMode, original, base: h.pixel(base, 650, 300), lit: h.pixel(lit, 650, 300), buffers: lit.stats.bufferBytes })
    }
    h.renderer.dispose(); return samples
  })
  for (const sample of results) {
    const exposure = sample.nightMode ? .35 : 1
    sample.base.forEach((value, i) => expect(Math.abs(value - sample.original[i] * exposure)).toBeLessThanOrEqual(2))
    sample.lit.forEach((value, i) => expect(Math.abs(value - sample.original[i])).toBeLessThanOrEqual(1))
    expect(sample.buffers).toBeGreaterThan(0)
  }
})


test('legacy light intensity cannot dim spotlights or their haze', async ({ page }) => {
  await page.goto('/untitled-jumping-game/lighting-lab')
  const result = await page.evaluate(async () => {
    const { lightingHarness } = await import('/tests/browser/helpers/lightingHarness.mjs')
    const h = await lightingHarness(), lights = h.fixture.lighting.lights
    const full = h.render(0, lights.map(l => ({ ...l, intensity: 100 })))
    const old = h.render(0, lights.map(l => ({ ...l, intensity: 1 })))
    const result = { difference: h.difference(full, old), intensities: old.stats.sources.map(l => l.intensity) }
    h.renderer.dispose(); return result
  })
  expect(result.difference).toBe(0)
  expect(result.intensities.every(value => value === 100)).toBe(true)
})
