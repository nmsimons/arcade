import { test, expect } from './helpers/test.mjs'

test('dives touch, curl and settle onto the underwater floor', async ({ page }, info) => {
  await page.goto('/')
  const samples = await page.evaluate(async () => {
    const { createPlayer, stepPlayer, STEP, NEUTRAL_INPUT } = await import('/src/games/jumping/model.ts')
    const { createGravityField, updateGravityField } = await import('/src/games/jumping/gravity.ts')
    const { drawAthlete, athletePose } = await import('/src/games/jumping/athlete.ts')
    const canvas = document.createElement('canvas'); canvas.id = 'water-landings'; canvas.width = 1760; canvas.height = 930
    document.body.replaceChildren(canvas); document.body.style.margin = '0'
    const ctx = canvas.getContext('2d'), results = []
    for (const [row, { label, diagonal, crouch }] of [
      { label: 'Dive', diagonal: false, crouch: false },
      { label: 'Diagonal', diagonal: true, crouch: false },
      { label: 'Down held', diagonal: false, crouch: true },
    ].entries()) {
      const field = createGravityField(), p = createPlayer({ x: 700, y: 650 })
      updateGravityField(field, [{ id: 'w', x: 0, y: 300, w: 3000, h: 700, effect: 'water', power: 'always' }], new Map(), true)
      p.grounded = false; p.coyote = 0
      const floor = [{ x: 0, y: 920, w: 3000, h: 80 }], times = [-1, 0, .1, .25, .4, .55, .7, .85]
      let col = 0, touch = null
      for (let i = 0; i < 850 && col < times.length; i++) {
        stepPlayer(p, { ...NEUTRAL_INPUT, drop: true, crouch, move: diagonal ? 1 : 0 }, STEP, floor, undefined, undefined, undefined, field)
        if (touch === null && p.waterMotion.landing) touch = i * STEP
        const elapsed = touch === null ? -1 : i * STEP - touch
        if (col === 0 ? p.y < 908 : touch === null || elapsed < times[col]) continue
        const x = col * 220, y = row * 310
        ctx.save(); ctx.beginPath(); ctx.rect(x, y, 220, 310); ctx.clip()
        ctx.fillStyle = '#d2e8ef'; ctx.fillRect(x, y, 220, 310)
        ctx.fillStyle = '#858a8d'; ctx.fillRect(x, y + 280, 220, 30)
        ctx.save(); ctx.translate(x + 110 - p.x * 3, y + 280 - 920 * 3); ctx.scale(3, 3); drawAthlete(ctx, p); ctx.restore()
        ctx.fillStyle = '#f1f1ed'; ctx.fillRect(x, y, 220, 32); ctx.fillStyle = '#43494b'; ctx.font = '13px sans-serif'
        ctx.fillText(`${label} / ${col ? `${times[col]}s after touch` : 'last approach'}`, x + 8, y + 21)
        ctx.strokeStyle = '#ccc'; ctx.strokeRect(x, y, 220, 310); ctx.restore()
        const pose = athletePose(p)
        const lower = pose.waist.map((v, i) => v - pose.hip[i]), upper = pose.shoulder.map((v, i) => v - pose.waist[i])
        const bend = Math.atan2(lower[0] * upper[1] - lower[1] * upper[0], lower[0] * upper[0] + lower[1] * upper[1])
        results.push({ label, bend, col, y: p.y, head: pose.head, hip: pose.hip, landing: !!p.waterMotion.landing,
          planted: pose.frontLeg.planted || pose.backLeg.planted })
        col++
      }
    }
    return results
  })
  expect(samples).toHaveLength(24)
  for (const label of ['Dive', 'Diagonal', 'Down held']) {
    const row = samples.filter(sample => sample.label === label)
    expect(row[0].head[1]).toBeGreaterThan(row[0].hip[1])
    expect(row[1].planted).toBe(false); expect(row[1].landing).toBe(true)
    expect(row.at(-1).planted).toBe(true); expect(row.at(-1).landing).toBe(false)
    for (const sample of row) { expect(sample.bend).toBeGreaterThan(-.1); expect(sample.bend).toBeLessThan(.85) }
  }
  await page.locator('#water-landings').screenshot({ path: info.outputPath('water-landings.png') })
})
