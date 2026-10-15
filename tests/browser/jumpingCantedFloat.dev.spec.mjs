import { test, expect } from './helpers/test.mjs'

test('canted wall palms stay settled throughout gravity-field bobbing', async ({ page }, info) => {
  await page.goto('/lab')
  const outcomes = await page.evaluate(async () => {
    const { floatingWall } = await import('/tests/helpers/jumping-canted-float.mjs')
    const { stepPlayer, STEP, NEUTRAL_INPUT } = await import('/src/games/jumping/model.ts')
    const { drawAthlete, athletePose } = await import('/src/games/jumping/athlete.ts')
    const frames = [], outcomes = []
    for (const inverted of [false, true]) {
      const { p, terrain, field } = floatingWall(-1, inverted)
      let peak = 0, previous
      for (let i = 0; i < 300; i++) {
        stepPlayer(p, { ...NEUTRAL_INPUT, move: -1 }, STEP, terrain, undefined, undefined, undefined, field)
        const pose = athletePose(p), points = [pose.frontArm, pose.backArm].flatMap(arm => [
          [...arm.joint, arm.jointDepth ?? 0], [...arm.end, arm.endDepth ?? 0],
        ])
        if (previous) peak = Math.max(peak, ...points.map((point, j) => Math.hypot(...point.map((n, axis) => n - previous[j][axis]))))
        previous = points
        if ([7, 8, 30, 60, 90].includes(i)) frames.push({ p: structuredClone(p), terrain, i, inverted })
      }
      outcomes.push({ peak, braced: p.wallBrace?.active })
    }
    const canvas = document.createElement('canvas'); canvas.width = 1250; canvas.height = 620
    document.body.replaceChildren(canvas); document.body.style.margin = '0'
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#f1f2ef'; ctx.fillRect(0, 0, canvas.width, canvas.height)
    for (const [index, { p, terrain, i, inverted }] of frames.entries()) {
      const x = index % 5 * 250, y = Math.floor(index / 5) * 310
      ctx.fillStyle = '#30423a'; ctx.font = '15px sans-serif'
      ctx.fillText(`${inverted ? 'Reverse' : 'Normal'} gravity · ${i + 1}`, x + 12, y + 24)
      ctx.save(); ctx.beginPath(); ctx.rect(x, y + 35, 250, 275); ctx.clip()
      ctx.translate(x + 140, y + 175); ctx.scale(3.4, 3.4)
      ctx.translate(-p.x, -p.y + (inverted ? -31 : 31))
      ctx.fillStyle = '#8f9392'
      for (const wall of terrain) {
        ctx.beginPath(); wall.polygon.forEach(([px, py], j) => ctx[j ? 'lineTo' : 'moveTo'](wall.x + px, wall.y + py))
        ctx.closePath(); ctx.fill()
      }
      drawAthlete(ctx, p, '#30423a'); ctx.restore()
    }
    return outcomes
  })
  for (const result of outcomes) { expect(result.peak).toBeLessThan(5); expect(result.braced).toBe(true) }
  await page.locator('canvas').screenshot({ path: info.outputPath('canted-wall-bobbing.png') })
})
