import { test, expect } from './helpers/test.mjs'
import { writeFile } from 'node:fs/promises'

for (const backend of ['canvas', 'gpu']) for (const kind of ['ladder', 'water']) {
  test(`${backend}: actual ${kind} pose remains readable in shadow at phone scale`, async ({ page }, info) => {
    await page.goto('/tests/fixtures/jumping/lighting-prototype.json')
    const result = await page.evaluate(async ({ backend, kind }) => {
      const [{ createRun, stepRun }, { parseLevel }, { NEUTRAL_INPUT, STEP }, { drawAthlete }, { LightingRenderer }, { waterBindingLevel }] = await Promise.all([
        import('/src/games/jumping/challenge.ts'), import('/src/games/jumping/level.ts'), import('/src/games/jumping/model.ts'),
        import('/src/games/jumping/athlete.ts'), import('/src/games/jumping/lightingRender.ts'), import('/tests/helpers/jumpingWaterBindings.mjs'),
      ])
      const data = kind === 'water' ? waterBindingLevel('bank') : await (await fetch('/levels/jumping/00.json')).json()
      const run = createRun(parseLevel(data)), advance = (ticks, input = {}) => {
        for (let i = 0; i < ticks; i++) stepRun(run, { ...NEUTRAL_INPUT, ...input })
      }
      if (kind === 'water') { advance(120, { crouch: true, descend: true, drop: true }); advance(1080) }
      else {
        advance(152, { move: 1 })
        for (let i = 0; i < 400 && !(run.player.grounded && run.player.y === 1600); i++) advance(1, { move: -1 })
        for (let i = 0; i < 400 && run.player.x > 573; i++) advance(1, { move: -1 })
        advance(200, { climb: true })
      }
      const before = JSON.stringify(run.player), zoom = .6, width = 852, height = 393
      const view = { x: run.player.x - width / zoom / 2, y: run.player.y - 200 / zoom, width, height, zoom }
      const definition = { nightMode: true, ambient: 0, lights: [{ id: 'off-to-side', x: data.spawn.x + 300, y: Math.max(40, data.spawn.y - 320), direction: 90, spread: 100, power: 'always' }] }
      const renderer = new LightingRenderer({ backend }), canvas = document.createElement('canvas')
      canvas.width = width; canvas.height = height
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      const stats = renderer.render(ctx, run, definition, view, .2), image = ctx.getImageData(0, 0, width, height)
      // Find opaque limb interiors from the actual rig, independently of lighting.
      const mask = document.createElement('canvas'); mask.width = width; mask.height = height
      const m = mask.getContext('2d'); m.setTransform(zoom, 0, 0, zoom, -view.x * zoom, -view.y * zoom)
      drawAthlete(m, run.player, '#fff'); const alpha = m.getImageData(0, 0, width, height).data
      // Remove only rendered opacity for the background reference; restore it.
      const exit = run.exit; run.exit = { elapsed: 1 }
      renderer.render(ctx, run, definition, view, 0); const background = ctx.getImageData(0, 0, width, height).data
      run.exit = exit
      const differences = [], luma = (pixels, i) => .2126 * pixels[i] + .7152 * pixels[i + 1] + .0722 * pixels[i + 2]
      for (let i = 0; i < alpha.length; i += 4) if (alpha[i + 3] === 255) differences.push(Math.abs(luma(image.data, i) - luma(background, i)))
      differences.sort((a, b) => a - b)
      ctx.putImageData(image, 0, 0); document.body.replaceChildren(canvas)
      renderer.dispose()
      return { backend: stats.backend, kind, mode: run.player.climbing?.kind ?? (run.player.waterMotion ? 'water' : 'free'),
        unchanged: JSON.stringify(run.player) === before, opaquePixels: differences.length,
        medianContrast: differences[Math.floor(differences.length / 2)],
        readableFraction: differences.filter(value => value >= 20).length / differences.length }
    }, { backend, kind })
    await writeFile(info.outputPath('player-contrast.json'), JSON.stringify(result, null, 2))
    await page.locator('canvas').screenshot({ path: info.outputPath(`${kind}-phone-shadow.png`) })
    expect(result.backend).toBe(backend)
    expect(result.mode).toBe(kind)
    expect(result.unchanged).toBe(true)
    expect(result.opaquePixels).toBeGreaterThan(40)
    expect(result.medianContrast).toBeGreaterThan(40)
    expect(result.readableFraction).toBeGreaterThan(.85)
  })
}
