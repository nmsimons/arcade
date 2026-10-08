import { test, expect } from './helpers/test.mjs'
import { writeFile } from 'node:fs/promises'

test('lit and original renderers use identical supplied framing across running lead, water anchoring, gravity and resizing', async ({ page }, info) => {
  await page.goto('/untitled-jumping-game')
  const results = await page.evaluate(async () => {
    const [{ GameCamera }, { blankTrial }, { createRun, stepRun }, { NEUTRAL_INPUT, STEP }, { drawChallenge }, { LightingRenderer, lightingPixelRatio }] = await Promise.all([
      import('/src/games/jumping/camera.ts'), import('/src/games/jumping/level.ts'), import('/src/games/jumping/challenge.ts'),
      import('/src/games/jumping/model.ts'), import('/src/games/jumping/challengeRender.ts'), import('/src/games/jumping/lightingRender.ts'),
    ])
    const level = { ...blankTrial(), width: 4000, floor: 1800, height: 1800, spawn: { x: 1500, y: 1800 } }
    const run = createRun(level), camera = new GameCamera(), renderer = new LightingRenderer(), canvas = document.createElement('canvas'), ctx = canvas.getContext('2d'), seen = []
    const original = ctx.fillRect.bind(ctx)
    ctx.fillRect = (...args) => {
      if (ctx.fillStyle === '#f1f1ed' && args[0] === 0 && args[1] === 0) {
        const t = ctx.getTransform(); seen.push([t.a, t.b, t.c, t.d, t.e, t.f])
      }
      original(...args)
    }
    const results = []
    for (let i = 0; i < 96; i++) {
      stepRun(run, { ...NEUTRAL_INPUT, move: i < 48 ? 1 : -1 })
      camera.view(320, 740, run.player, level, true, STEP)
    }
    for (const size of [[320,740],[390,844],[844,390],[1280,800]]) for (const dpr of [1,1.5]) for (const night of [false,true]) for (const mode of ['run','water','ceiling']) {
      run.player.y = mode === 'ceiling' ? 0 : mode === 'water' ? 900 : 1800
      run.player.inverted = mode === 'ceiling'
      run.player.waterCamera = mode === 'water' ? { y: 898, amount: 1 } : undefined
      const [width,height] = size, ratio = lightingPixelRatio(width,height,dpr), view = camera.view(width,height,run.player,level,true)
      canvas.width = Math.round(width*ratio); canvas.height = Math.round(height*ratio)
      seen.length = 0; ctx.setTransform(ratio,0,0,ratio,0,0)
      drawChallenge(ctx,width,height,run,view)
      const normal = seen.at(-1)
      seen.length = 0; ctx.setTransform(ratio,0,0,ratio,0,0)
      renderer.render(ctx,run,{nightMode:night,ambient:35,lights:[]},{...view,width:canvas.width,height:canvas.height,zoom:view.zoom*ratio},0)
      results.push({size,ratio,night,mode,normal,lit:seen.at(-1)})
    }
    return results
  })
  expect(results).toHaveLength(48)
  let worst = 0
  for (const result of results) {
    expect(result.normal, JSON.stringify(result)).toBeTruthy()
    expect(result.lit, JSON.stringify(result)).toBeTruthy()
    for (let i = 0; i < 6; i++) {
      const difference = Math.abs(result.lit[i] - result.normal[i]); worst = Math.max(worst, difference)
      // Canvas rounds scale/translate and setTransform at different stages.
      // Bound that numerical difference to a thousandth of a backing pixel.
      expect(difference, JSON.stringify(result)).toBeLessThan(.001)
    }
  }
  const comparisons = info.outputPath('framing-comparisons.json')
  await writeFile(comparisons, JSON.stringify({ worst, results }, null, 2))
  await info.attach('framing-comparisons', { path: comparisons, contentType: 'application/json' })
})
