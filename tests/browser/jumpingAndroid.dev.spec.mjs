import { test, expect } from './helpers/test.mjs'

test('LAB android shell follows the existing poses while remaining separate from the contact rig', async ({ page }, info) => {
  await page.goto('/tests/fixtures/jumping/lighting-prototype.json')
  const result = await page.evaluate(async () => {
    const { createPlayer, stepPlayer, NEUTRAL_INPUT, STEP } = await import('/src/games/jumping/model.ts')
    const { drawAthlete, traceAthlete, NIGHT_PLAYER_COLOR } = await import('/src/games/jumping/athlete.ts')
    const floor = { x: 0, y: 400, w: 1000, h: 100 }, poses = []
    const p = createPlayer({ x: 200, y: 400 })
    const advance = (ticks, input = {}) => {
      for (let i = 0; i < ticks; i++) stepPlayer(p, { ...NEUTRAL_INPUT, ...input }, STEP, [floor])
    }
    advance(120); poses.push(['Standing', structuredClone(p)])
    advance(28, { move: .3 }); poses.push(['Walking', structuredClone(p)])
    advance(30, { move: 1 }); poses.push(['Running', structuredClone(p)])
    advance(20, { move: 1, jump: true }); poses.push(['Jumping', structuredClone(p)])
    const lip = { x: 500, y: 200, w: 200, h: 300 }, grip = createPlayer({ x: 486, y: 274 })
    Object.assign(grip, { grounded: false, coyote: 0, vy: 60 })
    for (let i = 0; i < 60; i++) stepPlayer(grip, NEUTRAL_INPUT, STEP, [lip])
    poses.push(['Hanging', structuredClone(grip)])
    for (let i = 0; i < 42; i++) stepPlayer(grip, { ...NEUTRAL_INPUT, climb: true }, STEP, [lip])
    poses.push(['Pull-up', structuredClone(grip)])
    const crouched = createPlayer({ x: 200, y: 400 })
    for (let i = 0; i < 60; i++) stepPlayer(crouched, { ...NEUTRAL_INPUT, crouch: true }, STEP, [floor])
    poses.push(['Crouching', crouched])
    const ladder = createPlayer({ x: 300, y: 400 })
    for (let i = 0; i < 60; i++) stepPlayer(ladder, { ...NEUTRAL_INPUT, climb: true }, STEP, [floor],
      { ladders: [{ x: 300, top: 100, bottom: 400, platform: -1, side: 1 }], ropes: [] })
    poses.push(['Ladder', ladder])
    const sheet = document.createElement('canvas'); sheet.width = 1120; sheet.height = 500
    const ctx = sheet.getContext('2d'), stats = []
    for (const [row, ink] of ['#686b6e', NIGHT_PLAYER_COLOR].entries()) {
      ctx.fillStyle = row ? '#535853' : '#f1f1ed'; ctx.fillRect(0, row * 250, 1120, 250)
      for (const [col, [name, player]] of poses.entries()) {
        const before = JSON.stringify(player)
        const render = (color, contact = false) => {
          const canvas = document.createElement('canvas'); canvas.width = 140; canvas.height = 200
          const c = canvas.getContext('2d', { willReadFrequently: true })
          c.translate(70, 176); c.scale(2, 2); c.translate(-player.x, -player.y)
          if (contact) {
            c.fillStyle = '#fff'
            traceAthlete({
              moveTo(...args) { c.beginPath(); c.moveTo(...args) },
              lineTo(...args) { c.lineTo(...args) },
              quadraticCurveTo(...args) { c.quadraticCurveTo(...args) },
              bezierCurveTo(...args) { c.bezierCurveTo(...args) },
              ellipse(...args) { c.beginPath(); c.ellipse(...args) },
              closePath() { c.closePath(); c.fill() },
            }, player)
          } else drawAthlete(c, player, color)
          return { canvas, pixels: c.getImageData(0, 0, 140, 200).data }
        }
        const art = render(ink), mask = render('#fff', true)
        let outside = 0, changedInterior = 0
        for (let i = 0; i < art.pixels.length; i += 4) {
          if (art.pixels[i + 3] > 10 && mask.pixels[i + 3] === 0) outside++
          if (art.pixels[i + 3] === 255 && art.pixels[i] !== art.pixels[i + 1]) changedInterior++
        }
        ctx.drawImage(art.canvas, col * 140, row * 250 + 30)
        ctx.fillStyle = row ? '#e5e7e6' : '#526659'; ctx.font = '12px monospace'
        ctx.fillText(name, col * 140 + 10, row * 250 + 24)
        stats.push({ name, outside, changedInterior, unchanged: JSON.stringify(player) === before })
      }
    }
    document.body.replaceChildren(sheet)
    return { stats, hanging: !!poses.find(([name]) => name === 'Hanging')[1].hang,
      climbing: !!poses.find(([name]) => name === 'Pull-up')[1].mantle,
      ladder: !!ladder.climbing }
  })
  await page.locator('canvas').screenshot({ path: info.outputPath('lab-android-poses.png') })
  expect(result.hanging).toBe(true); expect(result.climbing).toBe(true); expect(result.ladder).toBe(true)
  for (const pose of result.stats) {
    expect(pose.unchanged, pose.name).toBe(true)
    expect(pose.outside, `${pose.name}: cosmetic shell can extend beyond the physical skin`).toBeGreaterThan(40)
    expect(pose.changedInterior, pose.name).toBeGreaterThan(40)
  }
})
