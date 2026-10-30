import { test, expect } from './helpers/test.mjs'
import { finishJumpingEntrance, useLevelFixtures } from './helpers/jumpingLevels.mjs'
import { leaningLedgeLevel } from '../helpers/jumpingLeaningLedge.mjs'

for (const face of ['leaning', 'vertical']) for (const side of [-1, 1]) {
  test(`keyboard catches the ${face} rock with flexed toe bracing, side ${side}`, async ({ page }, info) => {
    const level = leaningLedgeLevel(side), edgeX = side > 0 ? 600 : 1600
    if (face === 'vertical') {
      const points = level.platforms[0].polygon
      points.at(-1)[0] = points[0][0]; points[1][1] = points[0][1]
    }
    const errors = []; page.on('pageerror', error => errors.push(error.message))
    await useLevelFixtures(page, [level])
    await page.clock.install({ time: new Date('2026-10-28T12:00:00Z') })
    await page.goto('/lab?motionDebug=1')
    const play = page.getByRole('button', { name: `Play ${level.name}`, exact: true })
    await expect(play).toBeEnabled(); await page.clock.pauseAt(new Date('2026-10-28T13:00:00Z'))
    await play.click(); await finishJumpingEntrance(page); await page.clock.runFor(64)
    await expect(page.locator('canvas[tabindex="0"]')).toBeFocused()
    const state = () => page.evaluate(() => window.jumpingMotion.read().recent.at(-1))
    const toward = side > 0 ? 'd' : 'a'
    await page.keyboard.down(toward); await page.keyboard.down('Space')
    await page.clock.runFor(150); await page.keyboard.up('Space')
    let caught
    for (let frame = 0; frame < 70; frame++) {
      await page.clock.runFor(32); caught = await state()
      if (caught.signals.mode === 'hang') break
    }
    await page.keyboard.up(toward)
    expect(caught.signals.mode).toBe('hang')
    await page.clock.runFor(640)
    const quiet = await state()
    expect(quiet.signals.mode).toBe('hang'); expect(quiet.vx).toBe(0); expect(quiet.vy).toBe(0)
    expect(quiet.x).toBeCloseTo(edgeX - side * (14 + (face === 'leaning' ? 74 * 20 / 230 : 0)), 5)
    await page.screenshot({ path: info.outputPath('leaning-grip.png') })
    await page.keyboard.down('ArrowUp'); await page.clock.runFor(1200); await page.keyboard.up('ArrowUp')
    expect((await state()).signals.grounded).toBe(true)
    expect((await state()).x).toBeCloseTo(edgeX + 20 * side, 5)
    expect(errors).toEqual([])

    // Inspect the same runtime pose at a useful size without changing the game's camera.
    await page.evaluate(async ({ level, side, edgeX }) => {
      const [{ createPlayer, stepPlayer, NEUTRAL_INPUT, STEP }, { drawAthlete }, { androidDaylightMaterials }] = await Promise.all([
        import('/src/games/jumping/model.ts'), import('/src/games/jumping/athlete.ts'), import('/src/games/jumping/androidArtwork.ts')])
      const p = createPlayer(level.entrance); p.facing = side
      for (let i = 0; i < 240 && !p.hang; i++) stepPlayer(p, { ...NEUTRAL_INPUT, move: side, jump: i < 18 }, STEP, level.platforms)
      for (let i = 0; i < 90; i++) stepPlayer(p, NEUTRAL_INPUT, STEP, level.platforms)
      const canvas = document.createElement('canvas'); canvas.id = 'leaning-pose-preview'; canvas.width = 720; canvas.height = 720
      Object.assign(canvas.style, { position: 'fixed', top: '0', left: '0', zIndex: '99999' }); document.body.append(canvas)
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#c0deea'; ctx.fillRect(0, 0, 720, 720)
      ctx.translate(side > 0 ? 500 : 220, 40); ctx.scale(8, 8); ctx.translate(-edgeX, -280)
      ctx.fillStyle = '#909695'
      for (const shape of level.platforms) {
        const points = shape.polygon ?? [[0, 0], [shape.w, 0], [shape.w, shape.h], [0, shape.h]]
        ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(shape.x + x, shape.y + y) : ctx.moveTo(shape.x + x, shape.y + y)); ctx.closePath(); ctx.fill()
      }
      drawAthlete(ctx, p, androidDaylightMaterials(1))
    }, { level, side, edgeX })
    await page.locator('#leaning-pose-preview').screenshot({ path: info.outputPath('toe-brace-closeup.png') })
  })
}
