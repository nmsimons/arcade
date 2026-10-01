import { test, expect } from '@playwright/test'

for (const backend of ['canvas', 'gpu']) test(`${backend} shovebot headlights move, turn, cast shadows and fade during EMP`, async ({ page }, info) => {
  await page.goto('/tests/fixtures/jumping/lighting-prototype.json')
  const result = await page.evaluate(async backend => {
    const [{ lightingHarness }, { createPreviewRun }, { parseLevel }, { LightingRenderer }] = await Promise.all([
      import('/tests/browser/helpers/lightingHarness.mjs'), import('/src/games/jumping/challenge.ts'),
      import('/src/games/jumping/level.ts'), import('/src/games/jumping/lightingRender.ts'),
    ])
    const h = await lightingHarness({ backend })
    Object.assign(h.run, createPreviewRun(parseLevel({ ...h.fixture.level,
      platforms: [], climbables: { ladders: [], ropes: [] }, mechanisms: [], triggers: [], pickups: [], timers: [], texts: [],
      spawn: { x: 1100, y: 640 },
      props: [350, 650].map(x => ({ kind: 'box', x, y: 530, size: 60 })),
      robots: [{ x: 500, y: 500, left: 100, right: 1000 }],
    })))
    const robot = h.run.robots[0], brightness = (frame, x) => h.pixel(frame, x, 508).reduce((sum, n) => sum + n, 0)
    robot.facing = 1
    const off = h.render(0)
    robot.definition.headlight = true
    const right = h.render(0)
    robot.x = 700
    const moved = h.render(0)
    const reference = new LightingRenderer({ backend }), ctx = h.canvas.getContext('2d', { willReadFrequently: true })
    reference.render(ctx, h.run, { nightMode: true, ambient: 0, lights: [] }, h.view, .2)
    const fresh = { pixels: ctx.getImageData(0, 0, 1280, 720).data }
    reference.dispose()
    robot.x = 500; robot.facing = -1
    const left = h.render(0)
    h.run.empRemaining = 5
    const fading = h.render(0, [], .1), outage = h.render(0, [], .1)
    h.run.empRemaining = 0
    const restored = h.render(0)
    h.run.level = { ...h.run.level, platforms: [{ x: 410, y: 450, w: 20, h: 100, material: 'steel' }] }
    const blocked = h.render(0), day = h.render(100)
    h.run.level = { ...h.run.level, platforms: [] }
    h.render(0)
    document.body.replaceChildren(h.canvas); document.body.style.margin = '0'
    const result = { backend: right.stats.backend, off: [brightness(off, 350), brightness(off, 650)],
      right: [brightness(right, 350), brightness(right, 650)], left: [brightness(left, 350), brightness(left, 650)],
      moved: brightness(moved, 650), movedSource: moved.stats.sources[0].x, cacheDifference: h.difference(moved, fresh),
      fades: [fading, outage, restored].map(frame => frame.stats.sources[0].fade),
      outage: brightness(outage, 350), restored: brightness(restored, 350), blocked: brightness(blocked, 350),
      daySources: day.stats.sources.length, bytes: right.stats.bufferBytes }
    h.renderer.dispose()
    return result
  }, backend)
  test.skip(backend === 'gpu' && result.backend !== 'gpu', 'GPU unavailable; Canvas coverage still runs.')
  expect(result.right[1]).toBeGreaterThan(result.off[1] + 100)
  expect(result.right[0]).toBe(result.off[0])
  expect(result.left[0]).toBeGreaterThan(result.off[0] + 100)
  expect(result.left[1]).toBe(result.off[1])
  expect(result.moved).toBe(result.off[1]); expect(result.movedSource).toBe(727)
  expect(result.cacheDifference).toBeLessThanOrEqual(1)
  expect(result.fades).toEqual([.5, 0, 1])
  expect(result.outage).toBe(result.off[0]); expect(result.restored).toBe(result.left[0])
  expect(result.blocked).toBe(result.off[0]); expect(result.daySources).toBe(0)
  expect(result.bytes).toBeLessThanOrEqual(64 * 1024 * 1024)
  await page.screenshot({ path: info.outputPath(`shovebot-headlight-${backend}.png`) })
})
