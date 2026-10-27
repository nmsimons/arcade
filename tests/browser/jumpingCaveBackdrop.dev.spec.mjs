import { test, expect } from './helpers/test.mjs'

for (const backend of ['canvas', 'gpu']) test(`${backend}: sky caves use quiet gray stone without a grid and retain world-anchored texture`, async ({ page }, info) => {
  await page.goto('/lab')
  const result = await page.evaluate(async backend => {
    const { blankTrial } = await import('/src/games/jumping/level.ts')
    const { drawLevelBackdrop } = await import('/src/games/jumping/render.ts')
    const { createPreviewRun } = await import('/src/games/jumping/challenge.ts')
    const { LightingRenderer } = await import('/src/games/jumping/lightingRender.ts')
    const level = { ...blankTrial(), version: 2, width: 1200, height: 900, floor: 900,
      entrance: { x: 100, y: 900 }, goal: { x: 1100, y: 900 },
      platforms: [{ x: 0, y: 350, w: 300, h: 550 }],
      environment: { kind: 'landscape', horizon: 400, lighting: 'regions', baseLighting: 'day',
        walls: [{ kind: 'cave', x: 0, y: 300, w: 1200, h: 600 }] },
      lighting: { nightMode: true, ambient: 0, lights: [] } }
    const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 900
    const ctx = canvas.getContext('2d', { willReadFrequently: true }), view = { x: 0, y: 0, w: 1200, h: 900 }
    const art = (current, pan = 0) => {
      ctx.setTransform(1,0,0,1,-pan,0)
      drawLevelBackdrop(ctx, current, { ...view, x: pan }, 1, false)
      const pixels = ctx.getImageData(400-pan,400,256,128).data
      const values = [], rows = []
      for (let y=0; y<128; y++) {
        let sum=0
        for (let x=0; x<256; x++) { const red=pixels[(y*256+x)*4];values.push(red);sum+=red }
        rows.push(sum/256)
      }
      return { pixels, mean: values.reduce((a,b)=>a+b,0)/values.length, range: Math.max(...values)-Math.min(...values),
        stripe: Math.max(...rows.slice(1).map((value,i)=>Math.abs(value-rows[i]))) }
    }
    const cave = art(level), moved = art(level,8)
    let panError=0
    for(let i=0;i<cave.pixels.length;i++)panError=Math.max(panError,Math.abs(cave.pixels[i]-moved.pixels[i]))
    const facility = art({ ...level, environment: { ...level.environment, walls: [{ ...level.environment.walls[0], kind: 'facility' }] } })
    const indoor = art({ ...level, environment: { ...level.environment, kind: 'interior' } })
    const renderer=new LightingRenderer({backend});ctx.resetTransform()
    const stats=renderer.render(ctx,createPreviewRun(level),level.lighting,{x:0,y:0,zoom:1,width:1200,height:900},0)
    const pixel=(x,y)=>Array.from(ctx.getImageData(x,y,1,1).data).slice(0,3)
    const lit={sky:pixel(600,200),mouth:pixel(600,350),deep:pixel(600,850),terrain:pixel(150,800),backend:stats.backend}
    document.body.replaceChildren(canvas);document.body.style.margin='0';renderer.dispose()
    const compact=({mean,range,stripe})=>({mean,range,stripe})
    return {cave:compact(cave),facility:compact(facility),indoor:compact(indoor),panError,lit}
  }, backend)
  expect(result.lit.backend).toBe(backend)
  expect(result.cave.mean).toBeGreaterThan(185)
  expect(result.cave.mean).toBeLessThan(210)
  expect(result.cave.range).toBeGreaterThan(0)
  expect(result.cave.range).toBeLessThan(16)
  expect(result.cave.stripe).toBeLessThan(1)
  expect(result.facility.stripe).toBeGreaterThan(3)
  expect(result.facility.mean).toBeGreaterThan(result.cave.mean+25)
  expect(result.indoor.mean).toBeCloseTo(result.facility.mean,5)
  expect(result.panError).toBe(0)
  expect(result.lit.sky[2]).toBeGreaterThan(result.lit.sky[0]+20)
  expect(result.lit.mouth[0]).toBeGreaterThan(result.lit.deep[0]+35)
  expect(result.lit.deep[0]).toBeGreaterThan(result.lit.terrain[0]+10)
  await page.locator('canvas').screenshot({path:info.outputPath(`sky-cave-stone-${backend}.png`)})
})
