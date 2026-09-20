import { test, expect } from '@playwright/test'

test('bot models match the ship’s faceted rendering at native and inspection scales', async ({ page }, testInfo) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  const stats = await page.evaluate(async () => {
    const [{ drawStationBotModel }, { freshBots, BOT_MAX_HEALTH }, { freshExpedition }, { drawPlayerShip, freshShipAppearance }] = await Promise.all([
      import('/src/games/hardVacuum/stationBotModels.ts'), import('/src/games/hardVacuum/stationBots.ts'),
      import('/src/games/hardVacuum/expedition.ts'), import('/src/games/hardVacuum/shipRender.ts'),
    ])
    const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 1325
    canvas.setAttribute('aria-label', 'Ship and bot model comparison')
    canvas.style.cssText = 'display:block;max-width:100%;height:auto;margin:0 auto'
    document.body.replaceChildren(canvas)
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#081211'; ctx.fillRect(0, 0, canvas.width, canvas.height)
    const bots = freshBots(freshExpedition()).units
    const label = (text, x, y, color = '#a7c3b8', size = 12) => {
      ctx.fillStyle = color; ctx.font = `${size}px monospace`; ctx.textAlign = 'left'; ctx.fillText(text, x, y)
    }
    label('ORISON / CRAFT MODEL STUDY', 32, 34, '#d8e9e0', 18)
    label('SHARED BEVELED HULLS / NATIVE SCALE BELOW EACH MODEL', 32, 59)
    const rows = ['OFFLINE / AT REST', 'POWERED / AT REST', 'UNDER WAY', 'TOOLS ACTIVE', 'DAMAGED']
    const counts = []
    for (let row = 0; row < rows.length; row++) for (let column = 0; column < 3; column++) {
      const x = column * 400, y = 85 + row * 245
      ctx.strokeStyle = '#243b33'; ctx.lineWidth = 1; ctx.strokeRect(x + 16, y, 368, 228)
      label(['PILOT SHIP', 'MAINTENANCE TUG', 'SECURITY WATCH'][column], x + 30, y + 24, '#d4ddd4')
      label(rows[row], x + 30, y + 43, '#78998b', 10)
      const draw = scale => {
        ctx.save(); ctx.translate(x + 200, y + (scale === 1 ? 197 : 119)); ctx.scale(scale, scale)
        if (column === 0) {
          const appearance = { ...freshShipAppearance(), thrust: row === 2 ? .8 : 0, bank: row === 2 ? .4 : 0 }
          drawPlayerShip(ctx, { pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, radius: 15, angle: -.3 }, appearance,
            { time: 1.2, shields: 0, maxShields: 0, hitAge: Infinity, rechargeAge: Infinity, recharging: false, rechargeProgress: 0, laser: row === 3 })
        } else {
          const bot = { ...bots.find(bot => bot.botKind === (column === 1 ? 'tug' : 'security')),
            pos: { x: 0, y: 0 }, angle: -.3, anchored: false, phase: row === 0 ? 'offline' : row === 3 && column === 2 ? 'charge' : 'watch',
            vel: row === 2 ? { x: 135, y: 0 } : { x: 0, y: 0 }, health: row === 4 ? BOT_MAX_HEALTH*.2 : BOT_MAX_HEALTH,
            maintenance: row === 3 && column === 1 ? { windup: .3 } : undefined }
          drawStationBotModel(ctx, bot, 1.2)
        }
        ctx.restore()
      }
      draw(3); draw(1)
      const pixels = ctx.getImageData(x + 100, y + 65, 200, 105).data
      let lit = 0
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i] > 50 || pixels[i + 1] > 60 || pixels[i + 2] > 50) lit++
      counts.push(lit)
    }
    return counts
  })
  expect(stats).toHaveLength(15)
  expect(stats.every(count => count > 200)).toBe(true)
  expect(errors).toEqual([])
  await page.screenshot({ path: testInfo.outputPath('bot-models.png'), fullPage: true })
  const bounds = await page.locator('canvas').boundingBox(), scale = bounds.width / 1200
  await page.screenshot({ path: testInfo.outputPath('bot-models-preview.png'),
    clip: { x: bounds.x, y: bounds.y + 330 * scale, width: bounds.width, height: 245 * scale } })
})

test('both bot chassis accumulate hull damage and progressively heavier spark showers', async ({ page }, testInfo) => {
  await page.goto('/')
  const stages = await page.evaluate(async () => {
    const [{ drawStationBotModel, stationBotAppearance }, { freshBots, stepBotSparks }, { freshExpedition }, { drawDebris }, { seededRandom }] = await Promise.all([
      import('/src/games/hardVacuum/stationBotModels.ts'), import('/src/games/hardVacuum/stationBots.ts'),
      import('/src/games/hardVacuum/expedition.ts'), import('/src/games/hardVacuum/debrisRender.ts'),
      import('/src/games/hardVacuum/random.ts'),
    ])
    const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 620
    canvas.style.cssText = 'display:block;max-width:100%;height:auto;margin:0 auto'
    document.body.replaceChildren(canvas)
    const ctx = canvas.getContext('2d'), bots = freshBots(freshExpedition()).units, result = []
    ctx.fillStyle = '#081211'; ctx.fillRect(0, 0, 1200, 620)
    ctx.fillStyle = '#d8e9e0'; ctx.font = '18px monospace'; ctx.fillText('ORISON / PROGRESSIVE BOT DAMAGE', 24, 32)
    for (const [row, kind] of ['tug', 'security'].entries()) {
      const counts = []
      for (const [column, health] of [20, 15, 10, 5, 2].entries()) {
        const x = column * 240 + 120, y = row * 275 + 180
        const bot = { ...bots.find(bot => bot.botKind === kind), pos: { x: 0, y: 0 }, angle: -.3,
          phase: 'watch', anchored: false, health }
        const sparks = stepBotSparks(bot, 1 / 60, seededRandom(123))
        counts.push(sparks.length)
        // Sample a tenth of a second into the real burst: fragments leave each
        // breach and drift outward, using the production particle renderer.
        for (const spark of sparks) {
          spark.pos.x += spark.vel.x * .1; spark.pos.y += spark.vel.y * .1; spark.life -= 100
        }
        ctx.fillStyle = '#a7c3b8'; ctx.font = '12px monospace'; ctx.textAlign = 'center'
        ctx.fillText(`${kind.toUpperCase()} / ${health / 20 * 100}% HULL`, x, y - 95)
        for (const scale of [2.4, 1]) {
          ctx.save(); ctx.translate(x, y + (scale === 1 ? 93 : 0)); ctx.scale(scale, scale)
          drawStationBotModel(ctx, bot, 0); drawDebris(ctx, sparks); ctx.restore()
        }
        if (stationBotAppearance(bot, 0).damage.stage !== column) throw new Error('Damage tier not rendered')
      }
      result.push(counts)
    }
    return result
  })
  for (const counts of stages) {
    expect(counts[0]).toBe(0)
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThan(counts[i - 1])
  }
  await page.screenshot({ path: testInfo.outputPath('progressive-bot-damage.png'), fullPage: true })
})
