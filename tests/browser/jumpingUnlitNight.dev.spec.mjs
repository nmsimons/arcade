import { test, expect } from './helpers/test.mjs'

test('omitting empty night correction and haze passes preserves every pixel through resizing, occlusion and power transitions', async ({ page }) => {
  await page.goto('/untitled-jumping-game/lighting-lab')
  await expect(page.locator('.lighting-lab-study')).toBeVisible()
  const result = await page.evaluate(async () => {
    const [{ LightingRenderer }, { createPreviewRun }, { blankTrial }] = await Promise.all([
      import('/src/games/jumping/lightingRender.ts'), import('/src/games/jumping/challenge.ts'), import('/src/games/jumping/level.ts'),
    ])
    const level = { ...blankTrial(), width: 2000, floor: 1000, height: 1000, spawn: { x: 600, y: 600 }, goal: { x: 1750, y: 1000 },
      platforms: [{ x: 0, y: 600, w: 700, h: 400 }, { x: 760, y: 580, w: 500, h: 420, polygon: [[0,20],[100,0],[500,160],[500,420],[0,420]] }],
      props: [{ kind: 'ball', x: 650, y: 600, size: 30 }], robots: [{ x: 540, y: 600, left: 300, right: 670 }],
      texts: [{ x: 520, y: 470, w: 180, h: 60, text: 'See the landing', fontSize: 24, align: 'left' }] }
    const run = createPreviewRun(level), canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true })
    let worst = 0, frames = 0, emptyFrames = 0
    for (const backend of ['canvas', 'gpu']) {
      const renderers = [new LightingRenderer({ backend }), new LightingRenderer({ backend, skipEmptyNightPasses: false })]
      for (const view of [{x:380.125,y:-200.2,zoom:.6,width:390,height:844}, {x:500.23,y:500.16,zoom:1.13,width:512,height:384}, {x:2100,y:1100,zoom:.6,width:320,height:200}]) {
        canvas.width = view.width; canvas.height = view.height
        for (const facing of [-1,1]) for (const state of ['empty','lit','emp','empty-again']) {
          run.player.facing = facing; run.player.grounded = state === 'empty'; run.player.airBoost.x = state === 'emp' ? .5 : 0
          run.goalLit = state !== 'empty'; run.empRemaining = state === 'emp' ? 1 : 0
          run.exit = state === 'empty-again' ? { elapsed: .5, fromX: run.player.x, toX: run.player.x + 20 } : null
          run.robots[0].facing = facing; run.robots[0].angle = facing * .12
          const definition = { nightMode: true, ambient: 35, lights: state === 'empty' || state === 'empty-again' ? [] : [{ id:'lamp',x:600,y:500,direction:45,spread:120,intensity:1,power:'always' }] }
          const sources = [], pixels = renderers.map(renderer => {
            sources.push(renderer.render(ctx,run,definition,view,1).sources)
            return ctx.getImageData(0,0,canvas.width,canvas.height).data
          })
          if (sources[0].every(s => s.fade === 0)) emptyFrames++
          for (let i = 0; i < pixels[0].length; i++) worst = Math.max(worst, Math.abs(pixels[0][i] - pixels[1][i]))
          frames++
        }
      }
      renderers.forEach(r => r.dispose())
    }
    return { worst, frames, emptyFrames }
  })
  expect(result.frames).toBe(48)
  expect(result.emptyFrames).toBeGreaterThanOrEqual(24)
  expect(result.worst).toBe(0)
})
