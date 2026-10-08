import { test, expect } from './helpers/test.mjs'

for (const backend of ['canvas', 'gpu']) test(`${backend}: daylight ambient correction reuses an existing full-size surface without resizing emissions or changing any pixels`, async ({ page }, info) => {
  await page.goto('/untitled-jumping-game/lighting-lab')
  await expect(page.locator('.lighting-lab-study')).toBeVisible()
  const result = await page.evaluate(async backend => {
    const [{ LightingRenderer }, { createPreviewRun }, { blankTrial }] = await Promise.all([
      import('/src/games/jumping/lightingRender.ts'), import('/src/games/jumping/challenge.ts'), import('/src/games/jumping/level.ts'),
    ])
    const level = { ...blankTrial(), width: 1200, height: 600, floor: 500, spawn: { x: 650, y: 500 }, goal: { x: 100, y: 500 },
      platforms: [{ x: 400, y: 200, w: 200, h: 300 }],
      props: [{ kind: 'box', x: 615, y: 500, size: 30 }, { kind: 'ball', x: 668, y: 500, size: 30 }],
      robots: [{ x: 710, y: 500, left: 300, right: 1000 }] }
    const run = createPreviewRun(level), canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true })
    const optimized = new LightingRenderer({ backend }), reference = new LightingRenderer({ backend, reuseAmbientBuffer: false })
    canvas.width = 640; canvas.height = 400
    const view = { x: -40.125, y: -175.25, zoom: .47, width: 640, height: 400 }, definition = { nightMode: false, ambient: 0, lights: [] }
    let setters = 0
    const descriptors = ['width','height'].map(key => [key, Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype,key)])
    for (const [key, descriptor] of descriptors) Object.defineProperty(HTMLCanvasElement.prototype,key,{ ...descriptor,
      set(value) { setters++; descriptor.set.call(this,value) } })
    try {
      // Warm each renderer once, then measure steady frames with unchanged art.
      const warmed = optimized.render(ctx,run,definition,view,0); reference.render(ctx,run,definition,view,0)
      let worst = 0, optimizedResizes = 0, referenceResizes = 0, frames = 0
      for (let frame = 0; frame < 10; frame++) {
        view.y = -175.25 - frame * .05
        setters = 0; const a = optimized.render(ctx,run,definition,view,0); optimizedResizes += setters
        const pixels = ctx.getImageData(0,0,640,400).data
        setters = 0; const b = reference.render(ctx,run,definition,view,0); referenceResizes += setters
        const original = ctx.getImageData(0,0,640,400).data
        if (a.bufferBytes !== b.bufferBytes) throw new Error('Reusing scratch storage must not enlarge the buffer budget')
        for (let i = 0; i < pixels.length; i++) worst = Math.max(worst,Math.abs(pixels[i]-original[i]))
        frames++
      }
      // Repeated day/night changes must not expose yesterday's ambient mask as haze.
      for (const nightMode of [true,false,true,false]) {
        const lights = [{ id:'lamp',x:700,y:360,direction:110,spread:100,intensity:1,power:'always' }]
        optimized.render(ctx,run,{nightMode,ambient:35,lights},view,1)
        const pixels = ctx.getImageData(0,0,640,400).data
        reference.render(ctx,run,{nightMode,ambient:35,lights},view,1)
        const original = ctx.getImageData(0,0,640,400).data
        for (let i = 0; i < pixels.length; i++) worst = Math.max(worst,Math.abs(pixels[i]-original[i]))
        frames++
      }
      return { worst, optimizedResizes, referenceResizes, frames, backend: warmed.backend }
    } finally {
      for (const [key, descriptor] of descriptors) Object.defineProperty(HTMLCanvasElement.prototype,key,descriptor)
      optimized.dispose(); reference.dispose()
    }
  }, backend)
  await info.attach('render-comparison', { body: JSON.stringify(result), contentType: 'application/json' })
  expect(result.frames).toBe(14)
  expect(result.worst).toBe(0)
  expect(result.optimizedResizes).toBe(0)
  expect(result.referenceResizes).toBe(40)
})
