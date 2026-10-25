import { test, expect } from './helpers/test.mjs'

test('Rbot keeps his standing body thickness when swimming horizontally or diving', async ({ page }) => {
  await page.goto('/tests/fixtures/jumping/lighting-prototype.json')
  const result = await page.evaluate(async () => {
    const { createPlayer, stepPlayer, NEUTRAL_INPUT, STEP } = await import('/src/games/jumping/model.ts')
    const { createGravityField, updateGravityField } = await import('/src/games/jumping/gravity.ts')
    const { repulsorBotPose, repulsorBotWidthScale } = await import('/src/games/jumping/repulsorBotRig.ts')
    const { androidMaterials, drawAndroidTorso, drawAndroidHead } = await import('/src/games/jumping/androidArtwork.ts')
    const dry = createPlayer(), wet = createPlayer({ x: 1500, y: 1000 }), field = createGravityField()
    wet.grounded = false
    updateGravityField(field, [{ id: 'pool', x: 0, y: 400, w: 3000, h: 1200, effect: 'water' }], new Map(), true)
    for (let i = 0; i < 120; i++) stepPlayer(wet, { ...NEUTRAL_INPUT, move: 1 }, STEP, [], undefined, undefined, undefined, field)
    const materials = androidMaterials('#fff'), zoom = 8
    // Read the painted cross section in the body's own frame. A transform-only
    // check misses a thin chest or a round head replacing Rbot's broader shell.
    const measure = (pose, width, head) => {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      const center = head ? pose.head : pose.shoulder.map((v, i) => v + (pose.waist[i] - v) * .25)
      const angle = head ? -(pose.headTilt ?? 0) : Math.PI / 2 - Math.atan2(pose.waist[1] - pose.shoulder[1], (pose.waist[0] - pose.shoulder[0]) * width)
      ctx.translate(256, 256); ctx.scale(zoom, zoom); ctx.rotate(angle); ctx.scale(width, 1); ctx.translate(-center[0], -center[1])
      if (head) drawAndroidHead(ctx, pose.head, pose.headTilt ?? 0, materials, pose.shellWidth)
      else drawAndroidTorso(ctx, pose, false, materials)
      const pixels = ctx.getImageData(0, 0, 512, 512).data
      let cross = 0, area = 0
      for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) if (pixels[(y * 512 + x) * 4 + 3] >= 128) {
        area++; if (y === 256) cross++
      }
      return { cross: cross / zoom, area: area / zoom ** 2 }
    }
    const standing = repulsorBotPose(dry), swimming = repulsorBotPose(wet)
    const baseline = [false, true].map(head => measure(standing, repulsorBotWidthScale(dry), head))
    const pitches = [-Math.PI / 2, -Math.PI / 4, 0, Math.PI / 4, Math.PI / 2].map(angle => {
      const rotate = ([x, y]) => [x * Math.cos(angle) - y * Math.sin(angle), x * Math.sin(angle) + y * Math.cos(angle)]
      const pose = { ...swimming, headTilt: (swimming.headTilt ?? 0) + angle }
      for (const name of ['hip', 'waist', 'shoulder', 'head']) pose[name] = rotate(swimming[name])
      return [false, true].map(head => measure(pose, repulsorBotWidthScale(wet), head))
    })
    return { baseline, pitches, amount: wet.waterMotion.amount }
  })
  expect(result.amount).toBe(1)
  for (const pitch of result.pitches) {
    expect(pitch[0].cross).toBeGreaterThan(result.baseline[0].cross * .9)
    expect(pitch[1].cross).toBeGreaterThan(result.baseline[1].cross * .95)
    expect(pitch[1].area / result.baseline[1].area).toBeCloseTo(1, 1)
    for (const [index, part] of pitch.entries()) {
      expect(Math.abs(part.cross - result.pitches[2][index].cross)).toBeLessThan(.25)
      expect(part.area / result.pitches[2][index].area).toBeCloseTo(1, 1)
    }
  }
})

test('Rbot and player swimming reversals retain a readable articulated body', async ({ page }, info) => {
  await page.goto('/tests/fixtures/jumping/lighting-prototype.json')
  const results = await page.evaluate(async () => {
    const { createPlayer, stepPlayer, NEUTRAL_INPUT, STEP } = await import('/src/games/jumping/model.ts')
    const { createGravityField, updateGravityField, playerWaterCenterOffset } = await import('/src/games/jumping/gravity.ts')
    const { drawAthlete, presentedAthletePose } = await import('/src/games/jumping/athlete.ts')
    const { drawRepulsorBot } = await import('/src/games/jumping/repulsorBotRender.ts')
    const field = createGravityField()
    updateGravityField(field, [{ id: 'pool', x: 0, y: 400, w: 3000, h: 1200, effect: 'water' }], new Map(), true)
    const canvas = document.createElement('canvas'); canvas.width = 1500; canvas.height = 1000; canvas.id = 'water-turn-review'
    document.body.replaceChildren(canvas); document.body.style.margin = '0'
    const ctx = canvas.getContext('2d'), samples = [], times = [0, .05, .12, .2, .35, .6]
    let pure = true, headStretch = 1, swimmingHeads = 0
    for (const [row, depth] of [450, 1000].entries()) {
      const p = createPlayer({ x: 1500, y: depth }); p.grounded = false
      const step = move => stepPlayer(p, { ...NEUTRAL_INPUT, move }, STEP, [], undefined, undefined, undefined, field)
      for (let i = 0; i < 120; i++) step(1)
      let frame = 0
      for (const [column, time] of times.entries()) {
        while (frame * STEP + 1e-9 < time) { step(-1); frame++ }
        const before = JSON.stringify(p), pose = presentedAthletePose(p)
        samples.push({ row, time, amount: p.waterMotion?.amount, hip: pose.hip, waist: pose.waist, shoulder: pose.shoulder, head: pose.head })
        for (const robot of [false, true]) {
          const x = column * 250, y = (row * 2 + Number(robot)) * 250
          ctx.save(); ctx.beginPath(); ctx.rect(x, y, 250, 250); ctx.clip()
          ctx.fillStyle = '#f1f1ed'; ctx.fillRect(x, y, 250, 250)
          ctx.fillStyle = '#a8cddd'; ctx.fillRect(x, y + 30, 250, 220)
          ctx.translate(x + 125 - p.x * 3, y + 140 - (p.y + playerWaterCenterOffset(p)) * 3); ctx.scale(3, 3)
          if (robot) {
            const fill = ctx.fill
            ctx.fill = function (...args) {
              if (this.fillStyle === '#9b625b' && p.waterMotion?.amount === 1) {
                const { a, b, c, d } = this.getTransform()
                headStretch = Math.max(headStretch, (a * a + b * b + c * c + d * d) / (2 * Math.abs(a * d - b * c)))
                swimmingHeads++
              }
              return fill.apply(this, args)
            }
            drawRepulsorBot(ctx, { actor: p, phase: 'chase' }, true, (ctx, _exposure, draw) => draw())
            ctx.fill = fill
          }
          else drawAthlete(ctx, p)
          ctx.restore()
          ctx.fillStyle = '#343e39'; ctx.font = '14px sans-serif'
          ctx.fillText(`${robot ? 'Rbot' : 'Player'} ${row ? 'submerged' : 'surface'} ${time.toFixed(2)} s`, x + 10, y + 21)
        }
        pure &&= before === JSON.stringify(p)
      }
    }
    return { pure, samples, headStretch, swimmingHeads }
  })
  expect(results.pure).toBe(true)
  expect(results.swimmingHeads).toBeGreaterThanOrEqual(6)
  expect(results.headStretch).toBeCloseTo(1, 8)
  await page.locator('#water-turn-review').screenshot({ path: info.outputPath('water-turn-poses.png') })
  await info.attach('water-turn-joints', { body: JSON.stringify(results.samples, null, 2), contentType: 'application/json' })
})
