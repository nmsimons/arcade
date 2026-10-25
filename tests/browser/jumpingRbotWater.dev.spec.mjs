import { readFileSync } from 'node:fs'
import { test, expect } from './helpers/test.mjs'
import { parseLevel, levelProblems } from '../../src/games/jumping/level.ts'
import { restartFromPause, useLevelFixtures } from './helpers/jumpingLevels.mjs'

// Snapshot of the actual Quarantine II draft; portable without publishing it.
const quarantine = () => parseLevel(JSON.parse(readFileSync(new URL('../fixtures/jumping/quarantine-ii-rbot-water.json', import.meta.url), 'utf8')))

test('Quarantine II: Rbot climbs out while normal player controls keep diving', async ({ page }, info) => {
  test.setTimeout(90000)
  const level = quarantine(), errors = []
  expect(levelProblems(level)).toEqual([])
  await useLevelFixtures(page, [level])
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype, fillRect = proto.fillRect, fill = proto.fill
    proto.fillRect = function (...args) {
      if (args[0] === 0 && args[1] === 0 && this.fillStyle === '#f1f1ed') {
        this.canvas.botCamera = this.getTransform(); this.canvas.waterBots = []
      }
      return fillRect.apply(this, args)
    }
    proto.fill = function (...args) {
      if (args[0] instanceof Path2D && this.fillStyle === '#b66d65' && this.canvas.botCamera && !this.canvas.waterBots.length) {
        const t = this.getTransform(), camera = this.canvas.botCamera
        this.canvas.waterBots.push({ x: (t.e - camera.e) / camera.a, y: (t.f - camera.f) / camera.d })
      }
      return fill.apply(this, args)
    }
  })
  page.on('pageerror', error => errors.push(error.message))
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/lab?motionDebug=1')
  await page.locator('.jumping-level-card').filter({ hasText: level.name }).click()
  const canvas = page.locator('.jumping-game > canvas')
  await expect(canvas).toBeFocused()
  await expect(page.getByRole('dialog', { name: 'Preparing level', exact: true })).toHaveCount(0)
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await restartFromPause(page)
  const bot = () => canvas.evaluate(c => c.waterBots[0])
  const positions = []
  await page.keyboard.down('a')
  for (let i = 0; i < 32; i++) {
    await page.clock.runFor(250)
    positions.push(await bot())
    if ([11, 19, 27].includes(i)) await page.screenshot({ path: info.outputPath(`quarantine-water-entry-${i}.png`) })
  }
  await page.keyboard.up('a')
  expect(positions.some(p => p?.y > 1040), JSON.stringify(positions)).toBe(true)
  await page.keyboard.down('d'); await page.keyboard.down('s')
  for (let i = 0; i < 24; i++) {
    await page.clock.runFor(250)
    if ([7, 15, 23].includes(i)) await page.screenshot({ path: info.outputPath(`quarantine-swimming-${i}.png`) })
  }
  await page.keyboard.up('d'); await page.keyboard.up('s')
  const after = await bot()
  expect(after.y).toBeLessThan(1050)
  expect(errors).toEqual([])
})

test('Quarantine II: enlarged flight, swim-out and bank-catch review preserves the live pose', async ({ page }, info) => {
  test.setTimeout(90000)
  await page.goto('/tests/fixtures/jumping/lighting-prototype.json')
  const results = await page.evaluate(async level => {
    const { createRun, stepRun } = await import('/src/games/jumping/challenge.ts')
    const { NEUTRAL_INPUT, STEP } = await import('/src/games/jumping/model.ts')
    const { entranceDuration } = await import('/src/games/jumping/goal.ts')
    const { botWaterPosition } = await import('/src/games/jumping/botWaterNavigation.ts')
    const { drawChallenge } = await import('/src/games/jumping/challengeRender.ts')
    const run = createRun(level)
    stepRun(run, NEUTRAL_INPUT, entranceDuration(run.entrance))
    const sheet = document.createElement('canvas'); sheet.width = 1500; sheet.height = 660
    sheet.style.width = '1500px'; sheet.style.height = '660px'; sheet.id = 'rbot-water-review'
    const flight = sheet.cloneNode(); flight.id = 'rbot-flight-review'
    const flightCtx = flight.getContext('2d'), flightFrames = [113, 129, 196, 206, 224, 242]
    const ctx = sheet.getContext('2d'), frames = [270, 300, 330, 360, 365, 720]
    let column = 0, wet = false, exited = false, pure = true, flightTurns = 0, previousTurn = false
    const drawPanel = (ctx, index, frame, bot) => {
      const before = JSON.stringify(bot), xPanel = index % 3 * 500, yPanel = Math.floor(index / 3) * 330
      ctx.save(); ctx.beginPath(); ctx.rect(xPanel, yPanel, 500, 330); ctx.clip(); ctx.translate(xPanel, yPanel)
      drawChallenge(ctx, 500, 330, run, { zoom: 3, x: bot.x - 500 / 6, y: bot.y - 65 })
      ctx.fillStyle = '#2e3a34'; ctx.font = '18px sans-serif'; ctx.fillText(`${(frame / 120).toFixed(3)} s`, 14, 25)
      ctx.restore(); pure &&= before === JSON.stringify(bot)
    }
    for (let frame = 0; frame <= frames.at(-1); frame++) {
      const p = run.player, t = frame * STEP, x = t < 11 ? 650 : 1000
      const vertical = t < 7 ? (1210 - botWaterPosition(p).y) / 60 : -1
      stepRun(run, { ...NEUTRAL_INPUT, move: Math.max(-1, Math.min(1, (x - p.x) / 45)),
        swimVertical: p.waterMotion ? Math.max(-1, Math.min(1, vertical)) : 0,
        jump: frame === 1320, jumpStrength: 1, climb: t >= 11 })
      const bot = run.robots[0]
      if (frame <= flightFrames.at(-1)) {
        const actor = bot.actor, turn = !actor.grounded && !actor.hang && !actor.climbing && !actor.mantle && !!actor.dryTurn
        if (turn && !previousTurn) flightTurns++
        previousTurn = turn
      }
      const flightIndex = flightFrames.indexOf(frame)
      if (flightIndex >= 0) drawPanel(flightCtx, flightIndex, frame, bot)
      wet ||= !!bot.actor.waterMotion
      exited ||= wet && bot.actor.grounded && Math.abs(bot.y - 1015) < .1
      if (frame !== frames[column]) continue
      drawPanel(ctx, column++, frame, bot)
    }
    document.body.replaceChildren(flight, sheet)
    return { pure, wet, exited, flightTurns }
  }, quarantine())
  expect(results).toEqual({ pure: true, wet: true, exited: true, flightTurns: 1 })
  await page.setViewportSize({ width: 1500, height: 660 })
  await page.locator('#rbot-water-review').screenshot({ path: info.outputPath('quarantine-rbot-water-closeups.png') })
  await page.locator('#rbot-flight-review').screenshot({ path: info.outputPath('quarantine-rbot-flight-closeups.png') })
})

for (const shallow of [false, true]) test(`Quarantine ${shallow ? 'III: real-time low-water recovery jumps to a rope and climbs out' : 'II: real-time recovery clears the underside of a bank before climbing out'}`, async ({ page }, info) => {
  test.setTimeout(30000)
  const level = parseLevel(JSON.parse(readFileSync(new URL(shallow ? '../fixtures/jumping/quarantine-iii-rbot-water.json' : '../fixtures/jumping/quarantine-ii-rbot-force-field.json', import.meta.url), 'utf8')))
  await page.goto('/tests/fixtures/jumping/lighting-prototype.json')
  const result = await page.evaluate(async ({ level, shallow }) => {
    const { createRun, stepRun } = await import('/tests/helpers/jumping-active-run.mjs')
    const { createPlayer, NEUTRAL_INPUT, STEP } = await import('/src/games/jumping/model.ts')
    const { createRepulsorActor } = await import('/src/games/jumping/repulsorBot.ts')
    const { botWaterPosition } = await import('/src/games/jumping/botWaterNavigation.ts')
    const { playerSwimStrength } = await import('/src/games/jumping/gravity.ts')
    const { drawChallenge } = await import('/src/games/jumping/challengeRender.ts')
    const run = createRun(level), bot = run.robots[0]
    bot.x = shallow ? 650 : 300; bot.y = shallow ? 1380 : 1160
    bot.actor = createRepulsorActor(bot.x, bot.y); bot.actor.grounded = false
    if (!shallow) { run.player = createPlayer({ x: 650, y: 1250 }); run.player.grounded = false }
    const live = document.createElement('canvas'); live.width = 1000; live.height = 650; live.id = 'rbot-escape-live'
    const sheet = document.createElement('canvas'); sheet.width = 1500; sheet.height = 660; sheet.id = 'rbot-escape-sequence'
    document.body.replaceChildren(live, sheet); document.body.style.margin = '0'
    const ctx = live.getContext('2d'), panels = sheet.getContext('2d'), samples = [120, 300, 480, 660, 780, 900]
    let elapsed = 0, frameCount = 0, accumulator = 0, previousTime, exited = false, jumped = false, climbed = false, pure = true, column = 0
    const draw = (ctx, width, height, camera) => {
      const before = JSON.stringify(bot)
      drawChallenge(ctx, width, height, run, camera); pure &&= before === JSON.stringify(bot)
    }
    await new Promise(resolve => {
      const frame = now => {
        accumulator += previousTime === undefined ? 0 : Math.min(.1, (now - previousTime) / 1000); previousTime = now
        while (accumulator >= STEP && frameCount < samples.at(-1)) {
          const p = run.player
          stepRun(run, shallow ? NEUTRAL_INPUT : { ...NEUTRAL_INPUT, move: Math.max(-1, Math.min(1, (650 - p.x) / 45)),
            swimVertical: Math.max(-1, Math.min(1, (1250 - botWaterPosition(p).y) / 60)) })
          accumulator -= STEP; elapsed += STEP; frameCount++
          jumped ||= !!bot.actor.waterJump
          climbed ||= bot.actor.climbing?.kind === 'rope'
          exited ||= bot.actor.grounded && playerSwimStrength(run.gravityField, bot.actor) < .05
          if (frameCount === samples[column]) {
            const x = column % 3 * 500, y = Math.floor(column / 3) * 330
            panels.save(); panels.beginPath(); panels.rect(x, y, 500, 330); panels.clip(); panels.translate(x, y)
            draw(panels, 500, 330, { zoom: 2.5, x: bot.x - 100, y: bot.y - 95 })
            panels.fillStyle = '#2e3a34'; panels.font = '18px sans-serif'; panels.fillText(`${elapsed.toFixed(1)} s`, 14, 25)
            panels.restore(); column++
          }
        }
        draw(ctx, live.width, live.height, { zoom: 1.6, x: shallow ? 450 : 100, y: 950 })
        if (frameCount >= samples.at(-1)) resolve()
        else requestAnimationFrame(frame)
      }
      requestAnimationFrame(frame)
    })
    return { exited, pure, column, jumped, climbed }
  }, { level, shallow })
  expect(result).toMatchObject({ exited: true, pure: true, column: 6 })
  if (shallow) expect(result).toMatchObject({ jumped: true, climbed: true })
  await page.locator('#rbot-escape-sequence').screenshot({ path: info.outputPath('quarantine-under-bank-escape.png') })
  await page.locator('#rbot-escape-live').screenshot({ path: info.outputPath('quarantine-recovered-on-shore.png') })
})
