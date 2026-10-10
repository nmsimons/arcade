import { readFileSync } from 'node:fs'
import { test, expect } from './helpers/test.mjs'
import { useLevelFixtures } from './helpers/jumpingLevels.mjs'

const level = JSON.parse(readFileSync(new URL('../fixtures/jumping/water-tunnel.json', import.meta.url), 'utf8'))
test.setTimeout(90000)

test('upright floats fold and uncurl into a head-first dive at the surface and below', async ({ page }, info) => {
  await page.goto('/')
  const samples = await page.evaluate(async () => {
    const { createPlayer, stepPlayer, NEUTRAL_INPUT, STEP } = await import('/src/games/jumping/model.ts')
    const { createGravityField, updateGravityField, playerWaterCenterOffset } = await import('/src/games/jumping/gravity.ts')
    const { drawAthlete, athletePose } = await import('/src/games/jumping/athlete.ts')
    const canvas = document.createElement('canvas'); canvas.id = 'float-to-dive'; canvas.width = 1500; canvas.height = 1280
    document.body.replaceChildren(canvas); document.body.style.margin = '0'
    const ctx = canvas.getContext('2d'), samples = [], field = createGravityField()
    updateGravityField(field, [{ id: 'water', x: 0, y: 400, w: 5000, h: 1600, effect: 'water' }], new Map(), true)
    for (const [row, [start, side]] of [['surface', 1], ['submerged', 1], ['surface', -1], ['submerged', -1]].entries()) {
      const p = createPlayer({ x: 1000, y: start === 'surface' ? 450.34 : 1100 }); p.grounded = false; p.coyote = 0; p.facing = side
      if (start === 'submerged') p.waterMotion = { amount: 0, dive: 0, phase: 0, underwater: true }
      const advance = (seconds, input) => {
        for (let i = 0; i < Math.round(seconds / STEP); i++) stepPlayer(p, { ...NEUTRAL_INPUT, ...input }, STEP, [], undefined, undefined, undefined, field)
      }
      advance(3, {})
      let age = 0
      for (const [col, target] of [0, .16, .32, .55, 1.4].entries()) {
        advance(target - age, { descend: true }); age = target
        const pose = athletePose(p), x = col * 300, y = row * 320, center = p.y + playerWaterCenterOffset(p)
        const label = ['Upright float', 'Gather knees and arms', 'Turn while folded', 'Uncurl / extend down', 'Head-first dive'][col]
        ctx.save(); ctx.beginPath(); ctx.rect(x, y, 300, 320); ctx.clip()
        ctx.fillStyle = '#f1f1ed'; ctx.fillRect(x, y, 300, 320)
        ctx.save(); ctx.translate(x + 150 - p.x * 3.5, y + 175 - center * 3.5); ctx.scale(3.5, 3.5); drawAthlete(ctx, p); ctx.restore()
        const surface = Math.max(y + 30, y + 175 + (400 - center) * 3.5)
        ctx.fillStyle = '#58a9df'; ctx.globalAlpha = .35; ctx.fillRect(x, surface, 300, y + 320 - surface); ctx.globalAlpha = 1
        ctx.fillStyle = '#f1f1ed'; ctx.fillRect(x, y, 300, 30); ctx.fillStyle = '#43494b'; ctx.font = '13px sans-serif'
        ctx.fillText(`${start} / ${label}`, x + 10, y + 20); ctx.strokeStyle = '#ddd'; ctx.strokeRect(x, y, 300, 320); ctx.restore()
        const leg = pose.frontLeg, arm = pose.frontArm
        samples.push({ start, side, col, head: pose.head, hip: pose.hip, gather: p.waterMotion.gather,
          leg: Math.hypot(...leg.end.map((v, j) => v - leg.root[j]), leg.endDepth ?? 0),
          arm: Math.hypot(...arm.end.map((v, j) => v - arm.root[j]), arm.endDepth ?? 0) })
      }
    }
    return samples
  })
  expect(samples).toHaveLength(20)
  for (const sample of samples.filter(s => s.col === 2)) {
    expect(sample.gather).toBeGreaterThan(.9)
    expect(sample.leg).toBeLessThan(16)
    expect(sample.arm).toBeLessThan(12)
  }
  for (const sample of samples.filter(s => s.col === 4)) {
    expect(sample.gather).toBeLessThan(.001)
    expect(sample.head[1]).toBeGreaterThan(sample.hip[1] + 20)
  }
  await page.locator('#float-to-dive').screenshot({ path: info.outputPath('float-to-dive-poses.png') })
})

test('underwater pose review shows braking, ascent, upright rests and gathered reversals', async ({ page }, info) => {
  await page.goto('/')
  const samples = await page.evaluate(async () => {
    const { createPlayer, stepPlayer, NEUTRAL_INPUT, STEP } = await import('/src/games/jumping/model.ts')
    const { createGravityField, updateGravityField, playerWaterCenterOffset } = await import('/src/games/jumping/gravity.ts')
    const { drawAthlete, athletePose } = await import('/src/games/jumping/athlete.ts')
    const canvas = document.createElement('canvas'); canvas.id = 'underwater-review'; canvas.width = 1500; canvas.height = 1500
    document.body.replaceChildren(canvas); document.body.style.margin = '0'
    const ctx = canvas.getContext('2d'), samples = [], field = createGravityField()
    updateGravityField(field, [{ id: 'water', x: 0, y: 400, w: 5000, h: 1600, effect: 'water', power: 'always' }], new Map(), true)
    const fresh = () => { const p = createPlayer({ x: 1000, y: 1100 }); p.grounded = false; p.coyote = 0; return p }
    const advance = (p, seconds, intent) => {
      for (let i = 0; i < Math.round(seconds / STEP); i++) stepPlayer(p, { ...NEUTRAL_INPUT, ...intent }, STEP, [], undefined, undefined, undefined, field)
    }
    const capture = (p, row, col, label) => {
      const pose = athletePose(p), ox = col * 300, oy = row * 300
      ctx.save(); ctx.beginPath(); ctx.rect(ox, oy, 300, 300); ctx.clip()
      ctx.fillStyle = '#f1f1ed'; ctx.fillRect(ox, oy, 300, 300)
      ctx.save(); ctx.translate(ox + 150 - p.x * 3, oy + 165 - (p.y + playerWaterCenterOffset(p)) * 3); ctx.scale(3, 3)
      drawAthlete(ctx, p); ctx.restore()
      ctx.fillStyle = '#58a9df'; ctx.globalAlpha = .35; ctx.fillRect(ox, oy + 30, 300, 270); ctx.globalAlpha = 1
      ctx.fillStyle = '#f1f1ed'; ctx.fillRect(ox, oy, 300, 30)
      ctx.fillStyle = '#43494b'; ctx.font = '14px sans-serif'; ctx.fillText(label, ox + 12, oy + 21)
      ctx.strokeStyle = '#ddd'; ctx.strokeRect(ox, oy, 300, 300); ctx.restore()
      samples.push({ label, head: pose.head, hip: pose.hip, waist: pose.waist, shoulder: pose.shoulder,
        velocity: [p.vx, p.vy], pitch: p.waterMotion.dive, flex: p.waterMotion.bend, backView: pose.backView ?? 0 })
    }
    const vertical = fresh()
    advance(vertical, 1, { descend: true }); capture(vertical, 0, 0, 'Dive / streamlined')
    advance(vertical, .2, { climb: true }); capture(vertical, 0, 1, 'Up / brake the dive')
    advance(vertical, .5, { climb: true }); capture(vertical, 0, 2, 'Up / turn into ascent')
    advance(vertical, .8, { climb: true }); capture(vertical, 0, 3, 'Ascend / head leads')
    advance(vertical, 1.5, {}); capture(vertical, 0, 4, 'Release / float upright')
    const horizontal = fresh()
    advance(horizontal, 1, { move: 1 }); capture(horizontal, 1, 0, 'Swim / extension')
    advance(horizontal, .12, {}); capture(horizontal, 1, 1, 'Release / short glide')
    advance(horizontal, .68, {}); capture(horizontal, 1, 2, 'Slowing / curl toward upright')
    advance(horizontal, 1.4, {}); capture(horizontal, 1, 3, 'Rest / upright float')
    advance(horizontal, 1.4, {}); capture(horizontal, 1, 4, 'Rest / depth retained')
    const turning = fresh()
    advance(turning, 1, { move: 1 }); capture(turning, 2, 0, 'Before the reversal')
    advance(turning, .2, { move: -1 }); capture(turning, 2, 1, 'Reverse / brake')
    advance(turning, .3, { move: -1 }); capture(turning, 2, 2, 'Reverse / gather')
    advance(turning, .35, { move: -1 }); capture(turning, 2, 3, 'Reverse / extend left')
    advance(turning, .55, { move: -1 }); capture(turning, 2, 4, 'Swim left')
    const stoppingDive = fresh()
    advance(stoppingDive, 1.2, { descend: true }); capture(stoppingDive, 3, 0, 'Dive / before stopping')
    advance(stoppingDive, .12, {}); capture(stoppingDive, 3, 1, 'Release / carry the dive')
    advance(stoppingDive, .65, {}); capture(stoppingDive, 3, 2, 'Slow / gather into the turn')
    advance(stoppingDive, .18, {}); capture(stoppingDive, 3, 3, 'Uncurl / extend upright')
    advance(stoppingDive, .6, {}); capture(stoppingDive, 3, 4, 'Rest / upright after diving')
    const diagonal = fresh()
    advance(diagonal, 1, { move: 1 }); capture(diagonal, 4, 0, 'Diagonal / before steering')
    advance(diagonal, .12, { move: 1, climb: true }); capture(diagonal, 4, 1, 'Up-right / chest curves first')
    advance(diagonal, .3, { move: 1, climb: true }); capture(diagonal, 4, 2, 'Up-right / hips follow')
    advance(diagonal, .15, { move: -1, descend: true }); capture(diagonal, 4, 3, 'Down-left / change again')
    advance(diagonal, .8, { move: -1, descend: true }); capture(diagonal, 4, 4, 'Down-left / extend')
    return samples
  })
  for (const sample of samples) expect(sample.backView, sample.label).toBe(0)
  for (const sample of samples.filter(s => s.label.startsWith('Rest /'))) expect(sample.head[1]).toBeLessThan(sample.hip[1] - 20)
  await page.locator('#underwater-review').screenshot({ path: info.outputPath('underwater-poses.png') })
  await info.attach('underwater-pose-samples', { body: JSON.stringify(samples, null, 2), contentType: 'application/json' })
})

// A real RAF/keyboard run supplements the deterministic route and pose checks.
// Wait durations here are held gameplay inputs at normal speed, with no test clock.
test('swimming visual review at normal speed crosses the flooded passage and returns to the surface', async ({ page }, info) => {
  await useLevelFixtures(page, [level])
  await page.goto('/untitled-jumping-game?motionDebug=1')
  await page.getByRole('button', { name: 'Play Flooded passage', exact: true }).click()
  await expect(page.locator('canvas')).toBeFocused()
  const state = () => page.evaluate(() => window.jumpingMotion.read().recent.at(-1))
  async function hold(keys, milliseconds) {
    for (const key of keys) await page.keyboard.down(key)
    await page.waitForTimeout(milliseconds)
    for (const key of keys) await page.keyboard.up(key)
  }
  await hold(['ArrowUp'], 8000)
  await hold(['ArrowDown'], 2400)
  await page.screenshot({ path: info.outputPath('real-time-dive.png') })
  await hold([], 1000)
  const start = await state()
  await hold(['d'], 4000)
  const crossing = await state()
  expect(crossing.x).toBeGreaterThan(start.x + 370)
  expect(Math.abs(crossing.waterCenter - start.waterCenter)).toBeLessThan(2)
  await page.screenshot({ path: info.outputPath('real-time-passage.png') })
  await hold([], 1500)
  await page.screenshot({ path: info.outputPath('real-time-upright-float.png') })
  await hold(['a'], 1200); await hold(['d'], 6600)
  await page.keyboard.down('ArrowUp'); await page.waitForTimeout(1000)
  await page.screenshot({ path: info.outputPath('real-time-ascent.png') })
  await page.waitForTimeout(3000); await page.keyboard.up('ArrowUp')
  await hold(['d', 'ArrowUp'], 6000)
  await expect(page.getByRole('heading', { name: 'Level complete.', exact: true })).toBeVisible()
  await info.attach('real-time-swimming', { body: JSON.stringify({ start, crossing,
    motion: await page.evaluate(() => window.jumpingMotion.read().reports) }, null, 2), contentType: 'application/json' })
})
