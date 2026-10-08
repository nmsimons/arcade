import { test, expect } from './helpers/test.mjs'

test('cropping daylight emissions preserves every pixel across views, occlusion, power and fallback artwork', async ({ page }) => {
  await page.goto('/untitled-jumping-game/lighting-lab')
  const result = await page.evaluate(async () => {
    const [{ LightingRenderer }, { createPreviewRun }, { blankTrial }] = await Promise.all([
      import('/src/games/jumping/lightingRender.ts'), import('/src/games/jumping/challenge.ts'), import('/src/games/jumping/level.ts'),
    ])
    const level = blankTrial()
    Object.assign(level, { width: 1200, height: 600, floor: 500, spawn: { x: 720, y: 500 }, goal: { x: 100, y: 500 },
      platforms: [{ x: 742, y: 450, w: 24, h: 50 }], robots: [{ x: 710, y: 500, left: 300, right: 1000 }] })
    const run = createPreviewRun(level), robot = run.robots[0]
    const renderers = [new LightingRenderer(), new LightingRenderer({ boundedEmissions: false, skipEmptyNightPasses: false })]
    const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true })
    let worst = 0, frames = 0
    for (const nightMode of [false,true]) for (const facing of [-1,1]) for (const emp of [0,1]) {
      for (const view of [{x:400,y:200,zoom:.7,width:512,height:384}, {x:720,y:400,zoom:1.3,width:384,height:256},
        {x:1000,y:150,zoom:1,width:300,height:300}]) {
        // Resizing and fractional camera transforms must not lose edge pixels.
        canvas.width = view.width; canvas.height = view.height
        robot.facing = facing; robot.angle = facing * .12; run.empRemaining = emp
        for (const fallback of [false,true]) {
          run.goalLit = fallback; robot.definition.headlight = fallback
          run.player.grounded = !fallback; run.player.airBoost.x = fallback ? .5 : 0
          const pixels = renderers.map(renderer => {
            renderer.render(ctx, run, {nightMode,ambient:0,lights:[]}, view, 0)
            return ctx.getImageData(0,0,canvas.width,canvas.height).data
          })
          for (let i = 0; i < pixels[0].length; i++) worst = Math.max(worst,Math.abs(pixels[0][i]-pixels[1][i]))
          frames++
        }
      }
    }
    renderers.forEach(renderer => renderer.dispose())
    return {worst,frames}
  })
  expect(result.frames).toBe(48)
  expect(result.worst).toBe(0)
})
