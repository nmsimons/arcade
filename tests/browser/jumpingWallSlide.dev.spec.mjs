import { test, expect } from './helpers/test.mjs'
import { finishJumpingEntrance, useLevelFixtures } from './helpers/jumpingLevels.mjs'
import { columnSlideLevel } from '../helpers/jumpingWallSlide.mjs'

for (const side of [-1, 1]) test(`Exit column slide clears the rendered body, side ${side}`, async ({ page }, info) => {
  const level = columnSlideLevel(side), errors = []
  page.on('pageerror', error => errors.push(error.message))
  await useLevelFixtures(page, [level])
  await page.clock.install({ time: new Date('2026-10-28T12:00:00Z') })
  await page.goto('/lab?motionDebug=1')
  const play = page.getByRole('button', { name: `Play ${level.name}`, exact: true })
  await expect(play).toBeEnabled(); await page.clock.pauseAt(new Date('2026-10-28T13:00:00Z'))
  await play.click(); await finishJumpingEntrance(page)
  const toward = side > 0 ? 'd' : 'a', away = side > 0 ? 'a' : 'd'
  await page.keyboard.down(away); await page.keyboard.down('Space'); await page.clock.runFor(100)
  await page.keyboard.up(away); await page.keyboard.down(toward); await page.clock.runFor(50)
  await page.keyboard.up('Space'); await page.clock.runFor(1150)
  const samples = await page.evaluate(() => window.jumpingMotion.read().recent)
  const slides = samples.filter(s => s.signals.sliding && s.signals.bracing)
  expect(slides.length).toBeGreaterThan(8)
  expect(Math.max(...slides.map(s => s.vy))).toBeGreaterThan(500)
  const gaps = await page.evaluate(async ({ slides, terrain }) => {
    const { nearestBoundary, pointInside } = await import('/src/games/jumping/geometry.ts')
    return slides.flatMap(s => terrain.map(b => {
      const x = s.x + s.points[2][0] * s.signals.facing, y = s.y + s.points[2][1]
      const edge = nearestBoundary(b, x, y)
      return (pointInside(b, x, y) ? -edge.distance : edge.distance) - 6.2
    }))
  }, { slides, terrain: level.platforms })
  expect(Math.min(...gaps)).toBeGreaterThan(-.1)
  await page.screenshot({ path: info.outputPath('column-slide.png') })
  await page.keyboard.up(toward)
  expect(errors).toEqual([])

  // Render the same normal-input trajectory at inspection size. This uses the
  // game's real rig and materials; it does not alter the running player.
  await page.evaluate(async ({ level, side }) => {
    const [{ createPlayer, stepPlayer, NEUTRAL_INPUT, STEP }, { drawAthlete }, { androidDaylightMaterials }] = await Promise.all([
      import('/src/games/jumping/model.ts'), import('/src/games/jumping/athlete.ts'), import('/src/games/jumping/androidArtwork.ts')])
    const p = createPlayer(level.entrance); p.facing = -side
    for (let tick = 0; tick < 152; tick++) stepPlayer(p, { ...NEUTRAL_INPUT, move: tick < 12 ? -side : side, jump: tick < 18 }, STEP, level.platforms)
    const canvas = document.createElement('canvas'); canvas.id = 'slide-preview'; canvas.width = 720; canvas.height = 720
    Object.assign(canvas.style, { position: 'fixed', top: '0', left: '0', zIndex: '99999' }); document.body.append(canvas)
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#c0deea'; ctx.fillRect(0, 0, 720, 720)
    ctx.translate(360, 570); ctx.scale(8, 8); ctx.translate(-p.x, -p.y)
    ctx.fillStyle = '#909695'
    for (const shape of level.platforms) {
      const points = shape.polygon ?? [[0, 0], [shape.w, 0], [shape.w, shape.h], [0, shape.h]]
      ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(shape.x + x, shape.y + y) : ctx.moveTo(shape.x + x, shape.y + y)); ctx.closePath(); ctx.fill()
    }
    drawAthlete(ctx, p, androidDaylightMaterials(1))
  }, { level, side })
  await page.locator('#slide-preview').screenshot({ path: info.outputPath('slide-closeup.png') })
})
