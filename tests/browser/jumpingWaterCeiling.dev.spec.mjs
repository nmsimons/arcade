import { test, expect } from './helpers/test.mjs'

test('upward swimming meets undersides and releases smoothly around their edges', async ({ page }, info) => {
  await page.goto('/')
  const samples = await page.evaluate(async () => {
    const { blankTrial } = await import('/src/games/jumping/level.ts')
    const { createRun, stepRun } = await import('/src/games/jumping/challenge.ts')
    const { NEUTRAL_INPUT, STEP } = await import('/src/games/jumping/model.ts')
    const { drawAthlete, athletePose, handOutline } = await import('/src/games/jumping/athlete.ts')
    const { platformOutline, nearestBoundary } = await import('/src/games/jumping/geometry.ts')
    const canvas = document.createElement('canvas'); canvas.id = 'water-ceilings'; canvas.width = 1760; canvas.height = 1240
    document.body.replaceChildren(canvas); document.body.style.margin = '0'
    const ctx = canvas.getContext('2d'), samples = []
    for (const [row, kind] of ['Shelf', 'One terrain block', 'Box', 'Ball'].entries()) {
      const platform = { x: 600, y: 500, w: 180, h: kind === 'One terrain block' ? 400 : 50 }
      if (kind === 'One terrain block') platform.polygon = [[0, 0], [180, 0], [180, 50], [20, 50], [20, 400], [0, 400]]
      const prop = kind === 'Box' || kind === 'Ball'
      const run = createRun({ ...blankTrial(), spawn: { x: 700, y: 750 },
        platforms: prop ? [] : [platform], props: prop ? [{ kind: kind.toLowerCase(), x: 700, y: 340, size: 80 }] : [],
        goal: { id: 'closed', x: 1500, y: 920, power: 'switched' },
        gravityPlates: [{ id: 'w', x: 0, y: 300, w: 1800, h: 700, effect: 'water', power: 'always' }] })
      run.started = true; run.player.grounded = false; run.player.coyote = 0
      const surfaceY = () => prop ? run.props[0].y : 550
      const capture = (col, label) => {
        const p = run.player, pose = athletePose(p), x = col * 220, y = row * 310, roof = surfaceY()
        ctx.save(); ctx.beginPath(); ctx.rect(x, y, 220, 310); ctx.clip()
        ctx.fillStyle = '#d2e8ef'; ctx.fillRect(x, y, 220, 310)
        ctx.save(); ctx.translate(x + 110 - p.x * 3, y + 90 - roof * 3); ctx.scale(3, 3)
        ctx.fillStyle = '#858a8d'
        for (const b of p.terrain) {
          const points = platformOutline(b); ctx.beginPath(); ctx.moveTo(...points[0])
          for (const point of points.slice(1)) ctx.lineTo(...point)
          ctx.closePath(); ctx.fill()
        }
        drawAthlete(ctx, p); ctx.restore()
        ctx.fillStyle = '#f1f1ed'; ctx.fillRect(x, y, 220, 32); ctx.fillStyle = '#43494b'; ctx.font = '13px sans-serif'
        ctx.fillText(`${kind} / ${label}`, x + 8, y + 21); ctx.strokeStyle = '#ccc'; ctx.strokeRect(x, y, 220, 310); ctx.restore()
        samples.push({ kind, label, x: p.x, y: p.y, roof, head: pose.head, shoulder: pose.shoulder,
          hands: [pose.frontArm, pose.backArm].map(a => ({ palm: a.hand ?? a.end, root: a.root, elbow: a.joint })),
          headGap: Math.min(...p.terrain.map(b => nearestBoundary(b, p.x + pose.head[0] * p.facing, p.y + pose.head[1]).distance)) - 6.2,
          palmGap: Math.min(...[pose.frontArm, pose.backArm].flatMap(a => handOutline(a).flatMap(([hx, hy]) =>
            p.terrain.map(b => nearestBoundary(b, p.x + hx * p.facing, p.y + hy).distance)))),
          ceiling: p.waterMotion?.ceiling ?? null })
      }
      const advance = (seconds, intent) => {
        for (let i = 0; i < Math.round(seconds / STEP); i++) stepRun(run, { ...NEUTRAL_INPUT, ...intent }, STEP)
      }
      let col = 0
      for (let i = 0; i < 1500 && col < 3; i++) {
        stepRun(run, { ...NEUTRAL_INPUT, climb: true }, STEP)
        const gap = run.player.y - 62 - surfaceY()
        if (gap > [28, 8, .5][col]) continue
        capture(col, ['Approach', 'Near contact', 'Meet underside'][col]); col++
      }
      advance(.3, { climb: true }); capture(3, 'Hold Up')
      advance(.25, { climb: true, move: 1 }); capture(4, 'Steer along')
      advance(.6, { climb: true, move: 1 }); capture(5, 'Round the edge')
      advance(.3, { move: 1 }); capture(6, 'Release Up')
      advance(.4, { climb: true, move: 1 }); capture(7, 'Resume ascent')
    }
    return samples
  })
  expect(samples).toHaveLength(32)
  for (const sample of samples.filter(s => s.label === 'Hold Up' && !['Box', 'Ball'].includes(s.kind))) {
    expect(sample.ceiling.amount).toBeGreaterThan(.95)
    expect(sample.palmGap).toBeLessThan(.4)
    expect(sample.headGap).toBeGreaterThan(2)
  }
  for (const sample of samples.filter(s => ['Box', 'Ball'].includes(s.kind))) {
    expect(sample.ceiling).toBeNull()
    expect(sample.headGap).toBeGreaterThan(-.01)
  }
  for (const sample of samples.filter(s => s.label === 'Release Up')) expect(sample.ceiling).toBeNull()
  await page.locator('#water-ceilings').screenshot({ path: info.outputPath('water-ceilings.png') })
  await info.attach('upward-contacts', { body: JSON.stringify(samples, null, 2), contentType: 'application/json' })
})
