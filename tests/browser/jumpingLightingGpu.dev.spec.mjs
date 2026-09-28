import { test, expect } from '@playwright/test'

async function requireGpu(page) {
  const available = await page.evaluate(async () => {
    const { GpuLightingField } = await import('/src/games/jumping/lightingGpuField.ts')
    const gpu = GpuLightingField.create(true)
    if (!gpu) return false
    try { gpu.render([], [], { width: 16, height: 16, x: 0, y: 0, zoom: 1 }, 0, 16, 16); return true }
    catch { return false }
    finally { gpu.dispose() }
  })
  test.skip(!available, 'This browser lacks the GPU lighting capabilities; the Canvas fallback test still runs.')
}

test('GPU lighting retains Tower artwork through movement, rotation, camera changes and EMP', async ({ page }) => {
  await page.goto('/tests/fixtures/jumping/lighting-prototype.json')
  await requireGpu(page)
  const result = await page.evaluate(async () => {
    const [{ LightingRenderer }, { parseLevel }, { createPreviewRun }, { gameCamera }] = await Promise.all([
      import('/src/games/jumping/lightingRender.ts'), import('/src/games/jumping/level.ts'),
      import('/src/games/jumping/challenge.ts'), import('/src/games/jumping/camera.ts'),
    ])
    const level = parseLevel(await (await fetch('/levels/jumping/Tower.jump-level.json')).json()), run = createPreviewRun(level)
    const canvases = [document.createElement('canvas'), document.createElement('canvas')]
    for (const canvas of canvases) { canvas.width = 800; canvas.height = 500 }
    const contexts = canvases.map(canvas => canvas.getContext('2d', { willReadFrequently: true }))
    const renderers = [new LightingRenderer(), new LightingRenderer({ backend: 'gpu' })], results = []
    const view = { ...gameCamera(800, 500, run.player, level, true), width: 800, height: 500 }
    for (let i = 0; i < 14; i++) {
      if (i === 4) run.props[0].x += .01
      if (i === 5) { run.props[0].angle += .3; run.player.stride += .7 }
      if (i === 6) view.y -= .37
      if (i === 7) run.mechanisms[0].y -= 12
      if (i === 8) run.empRemaining = 5
      if (i === 9) run.empRemaining = 0
      if (i === 10) view.zoom *= 1.3
      if (i === 11) { run.player.facing = -1; run.player.crouch = .8 }
      if (i === 12) run.exit = { elapsed: .5 }
      const stats = renderers.map((renderer, j) => renderer.render(contexts[j], run, level.lighting, view, .05))
      const pixels = contexts.map(ctx => ctx.getImageData(0, 0, 800, 500).data)
      let total = 0, worst = 0, overEight = 0
      for (let j = 0; j < pixels[0].length; j++) {
        const delta = Math.abs(pixels[0][j] - pixels[1][j]); total += delta; worst = Math.max(worst, delta); if (delta > 8) overEight++
      }
      results.push({ backend: stats[1].backend, mean: total / pixels[0].length, worst, largeDifferenceFraction: overEight / pixels[0].length })
    }
    renderers.forEach(renderer => renderer.dispose())
    return results
  })
  for (const frame of result) {
    expect(frame.backend).toBe('gpu')
    // Different antialiasing coverage is confined to a small set of edge pixels.
    expect(frame.mean).toBeLessThan(.3)
    expect(frame.largeDifferenceFraction).toBeLessThan(.001)
    expect(frame.worst).toBeLessThanOrEqual(40)
  }
})

test('GPU light field preserves max blending, occlusion, fades and stamp rollover', async ({ page }) => {
  await page.goto('/tests/fixtures/jumping/lighting-prototype.json')
  await requireGpu(page)
  const result = await page.evaluate(async () => {
    const { GpuLightingField } = await import('/src/games/jumping/lightingGpuField.ts')
    const gpu = GpuLightingField.create(true)
    if (!gpu) throw new Error('GPU unavailable in this test environment')
    const view = { width: 320, height: 240, x: 0, y: 0, zoom: 1 }
    const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 240
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    const light = { id: 'light', x: 20, y: 100, direction: 0, spread: 100, fade: 1, intensity: 100, power: 'always' }
    // This initially matches the HTML canvas's default 300×150 output atlas.
    // The framebuffer must still allocate on the first render.
    gpu.render([], [light], { ...view, width: 150, height: 150 }, 0, 320, 240)
    ctx.drawImage(gpu.canvas, 0, 0, 150, 150, 0, 0, 150, 150)
    const initialSmall = ctx.getImageData(120, 100, 1, 1).data[0]
    const draw = (groups, sources) => {
      gpu.render(groups, sources, view, 0, 320, 240)
      ctx.drawImage(gpu.canvas, 0, 0, 320, 240, 0, 0, 320, 240)
      return new Uint8ClampedArray(ctx.getImageData(0, 0, 320, 240).data)
    }
    const pixel = (image, x, y) => image[(y * 320 + x) * 4]
    const difference = (a, b) => a.reduce((max, n, i) => Math.max(max, Math.abs(n - b[i])), 0)
    const one = draw([], [light]), duplicate = draw([], [light, { ...light, id: 'duplicate' }])
    const other = { ...light, id: 'other', x: 300, direction: 180, fade: .7 }
    const forward = draw([], [light, other]), reverse = draw([], [other, light])
    const block = [{ x: 80, y: 70, w: 20, h: 60 }]
    const blocked = draw([block], [light]), faded = draw([Object.assign([...block], { opacity: .5 })], [light])
    const covered = draw([[{ x: 10, y: 90, w: 30, h: 30 }]], [light])
    const rolled = draw([block, ...Array.from({ length: 260 }, (_, i) => [{ x: 150 + i / 1000, y: 180, w: 10, h: 10 }])], [light])
    gpu.dispose()
    return { initialSmall, duplicate: difference(one, duplicate), order: difference(forward, reverse), lit: pixel(one, 250, 100),
      blocked: pixel(blocked, 250, 100), faded: pixel(faded, 250, 100), covered: pixel(covered, 250, 100), rolled: pixel(rolled, 250, 100) }
  })
  expect(result.duplicate).toBe(0)
  expect(result.initialSmall).toBe(255)
  expect(result.order).toBe(0)
  expect(result.lit).toBe(255)
  expect(result.blocked).toBe(89)
  expect(result.covered).toBe(89)
  expect(result.rolled).toBe(89)
  expect(result.faded).toBeGreaterThan(165)
  expect(result.faded).toBeLessThan(180)
})

test('GPU resize stays within 64 MiB and a lost context restores Canvas shadows', async ({ page }) => {
  await page.goto('/tests/fixtures/jumping/lighting-prototype.json')
  await requireGpu(page)
  const result = await page.evaluate(async () => {
    const { lightingHarness } = await import('/tests/browser/helpers/lightingHarness.mjs')
    let gl
    const getContext = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (kind, ...options) {
      const result = getContext.call(this, kind, ...options)
      if (kind === 'webgl2') gl = result
      return result
    }
    const h = await lightingHarness({ backend: 'gpu' }), reference = await lightingHarness()
    const before = h.render(0, h.fixture.lighting.lights)
    const bytes = [before.stats.bufferBytes]
    h.view.width = 1600; h.view.height = 1250; h.canvas.width = 1600; h.canvas.height = 1250
    const definition = { ...h.fixture.lighting, ambient: 0, nightMode: true }
    const resized = h.renderer.render(h.canvas.getContext('2d'), h.run, definition, h.view, .2)
    bytes.push(resized.bufferBytes)
    await new Promise(resolve => {
      gl.canvas.addEventListener('webglcontextlost', resolve, { once: true })
      gl.getExtension('WEBGL_lose_context').loseContext()
    })
    h.view.width = 1280; h.view.height = 720; h.canvas.width = 1280; h.canvas.height = 720
    let restored, expected
    for (let i = 0; i < 4; i++) { restored = h.render(0, h.fixture.lighting.lights); expected = reference.render(0, reference.fixture.lighting.lights) }
    HTMLCanvasElement.prototype.getContext = getContext
    const result = { initial: before.stats.backend, resized: resized.backend, restored: restored.stats.backend, bytes,
      difference: h.difference(restored, expected) }
    h.renderer.dispose(); reference.renderer.dispose(); return result
  })
  expect(result.initial).toBe('gpu')
  expect(result.resized).toBe('gpu')
  expect(result.restored).toBe('canvas')
  expect(result.difference).toBeLessThanOrEqual(1)
  for (const bytes of result.bytes) expect(bytes).toBeLessThanOrEqual(64 * 1024 * 1024)
})

for (const reason of ['unavailable', 'software']) test(`${reason} WebGL preserves the Canvas renderer without changing shadow quality`, async ({ page }) => {
  await page.goto('/tests/fixtures/jumping/lighting-prototype.json')
  const result = await page.evaluate(async reason => {
    const getContext = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (kind, ...options) {
      if (kind !== 'webgl2') return getContext.call(this, kind, ...options)
      if (reason === 'unavailable') return null
      // Emulate a CPU driver even on hardware-accelerated developer machines.
      const gl = getContext.call(this, kind, { ...options[0], failIfMajorPerformanceCaveat: false })
      if (gl) {
        const parameter = gl.getParameter.bind(gl), extension = gl.getExtension.bind(gl)
        gl.getExtension = name => name === 'WEBGL_debug_renderer_info' ? { UNMASKED_RENDERER_WEBGL: 0x9246 } : extension(name)
        gl.getParameter = key => key === 0x9246 ? 'ANGLE (SwiftShader Device (Subzero))' : parameter(key)
      }
      return gl
    }
    const { lightingHarness } = await import('/tests/browser/helpers/lightingHarness.mjs')
    const h = await lightingHarness({ backend: 'auto' }), reference = await lightingHarness()
    let image, expected
    for (let i = 0; i < 4; i++) { image = h.render(0, h.fixture.lighting.lights); expected = reference.render(0, reference.fixture.lighting.lights) }
    const result = { backend: image.stats.backend, edges: image.stats.edges, difference: h.difference(image, expected) }
    h.renderer.dispose(); reference.renderer.dispose(); HTMLCanvasElement.prototype.getContext = getContext; return result
  }, reason)
  expect(result.backend).toBe('canvas')
  expect(result.edges).toBeGreaterThan(0)
  expect(result.difference).toBeLessThanOrEqual(1)
})
