import { readFileSync } from 'node:fs'
import { test, expect } from './helpers/test.mjs'
import { parseLevel } from '../../src/games/jumping/level.ts'

test('Quarantine II: a live plate closes the field during a jump without restarting the wall pose', async ({ page }, info) => {
  test.setTimeout(60000)
  const level = parseLevel(JSON.parse(readFileSync(new URL('../fixtures/jumping/quarantine-ii-rbot-water.json', import.meta.url), 'utf8')))
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width: 1320, height: 900 })
  await page.goto('/tests/fixtures/jumping/lighting-prototype.json')
  const result = await page.evaluate(async level => {
    const { createRbotFieldApproach, rbotFieldRigPoints, stepRbotFieldApproach } = await import('/tests/helpers/jumping-rbot-field.mjs')
    const { drawChallenge } = await import('/src/games/jumping/challengeRender.ts')
    const { STEP } = await import('/src/games/jumping/model.ts')
    const scene = createRbotFieldApproach(level), { run, bot } = scene
    for (let frame = 0; frame < 600 && !scene.pressing; frame++) stepRbotFieldApproach(scene)
    if (!scene.pressing) throw new Error('Rbot did not begin the real approach jump')
    const live = document.createElement('canvas'); live.width = 1100; live.height = 900; live.id = 'rbot-field-live'
    const sheet = document.createElement('canvas'); sheet.width = 1320; sheet.height = 660; sheet.id = 'rbot-field-contact'
    document.body.replaceChildren(live, sheet); document.body.style.margin = '0'
    const ctx = live.getContext('2d'), panels = sheet.getContext('2d'), samples = [1, 8, 16, 24, 32, 40]
    let elapsed = 0, accumulator = 0, previousTime, previousPoints = rbotFieldRigPoints(bot.actor)
    let activatedInAir = false, braced = 0, restarted = 0, sawBehind = false, landed = false, pure = true, maxPoseStep = 0, column = 0
    const draw = (ctx, width, height, camera) => {
      const before = JSON.stringify(bot)
      drawChallenge(ctx, width, height, run, camera)
      pure &&= before === JSON.stringify(bot)
    }
    // Real-time playback retains the ordinary 120 Hz motor and player controls.
    await new Promise(resolve => {
      const frame = now => {
        accumulator += previousTime === undefined ? 0 : Math.min(.1, (now - previousTime) / 1000)
        previousTime = now
        while (accumulator >= STEP && elapsed < 1.5) {
          const active = run.forceFields[1].active
          stepRbotFieldApproach(scene); elapsed += STEP; accumulator -= STEP
          const actor = bot.actor, points = rbotFieldRigPoints(actor)
          if (!active && run.forceFields[1].active) activatedInAir ||= !actor.grounded
          if (activatedInAir && !actor.grounded) {
            for (let i = 0; i < points.length; i++) maxPoseStep = Math.max(maxPoseStep,
              Math.hypot(points[i][0] - previousPoints[i][0], points[i][1] - previousPoints[i][1]))
            if (actor.wallBrace?.active) {
              braced++; restarted += Number(!!actor.dryTurn)
              sawBehind ||= bot.seesPlayer && (run.player.x - bot.x) * actor.facing < 0
              if (samples.includes(braced)) {
                const x = column % 3 * 440, y = Math.floor(column / 3) * 330
                panels.save(); panels.beginPath(); panels.rect(x, y, 440, 330); panels.clip(); panels.translate(x, y)
                draw(panels, 440, 330, { zoom: 3, x: bot.x - 440 / 6, y: bot.y - 65 })
                panels.fillStyle = '#2e3a34'; panels.font = '18px sans-serif'; panels.fillText(`${elapsed.toFixed(3)} s`, 14, 25)
                panels.restore(); column++
              }
            }
          }
          landed ||= activatedInAir && actor.grounded && Math.abs(bot.y - 610) < .1
          previousPoints = points
        }
        draw(ctx, live.width, live.height, { zoom: 1.4, x: 250, y: 80 })
        if (elapsed >= 1.5) resolve()
        else requestAnimationFrame(frame)
      }
      requestAnimationFrame(frame)
    })
    return { activatedInAir, braced, restarted, sawBehind, landed, pure, maxPoseStep, column }
  }, level)
  expect(result.activatedInAir && result.sawBehind && result.landed && result.pure).toBe(true)
  expect(result.braced).toBeGreaterThan(30)
  expect(result.restarted).toBe(0)
  expect(result.maxPoseStep).toBeLessThan(11)
  expect(result.column).toBe(6)
  await page.locator('#rbot-field-contact').screenshot({ path: info.outputPath('quarantine-rbot-field-contact.png') })
  await page.locator('#rbot-field-live').screenshot({ path: info.outputPath('quarantine-rbot-field-recovery.png') })
  expect(errors).toEqual([])
})

test('Quarantine II: the updated emitter layout also closes cleanly during the ledge approach', async ({ page }, info) => {
  const level = parseLevel(JSON.parse(readFileSync(new URL('../fixtures/jumping/quarantine-ii-rbot-force-field.json', import.meta.url), 'utf8')))
  await page.goto('/tests/fixtures/jumping/lighting-prototype.json')
  const result = await page.evaluate(async level => {
    const { createRbotFieldApproach, rbotFieldRigPoints, stepRbotFieldApproach } = await import('/tests/helpers/jumping-rbot-field.mjs')
    const { drawChallenge } = await import('/src/games/jumping/challengeRender.ts')
    const scene = createRbotFieldApproach(level), { run, bot } = scene
    let activatedInAir = false, gripped = false, landed = false, previous, previousFree = false, maxPoseStep = 0
    for (let frame = 0; frame < 840 && !landed; frame++) {
      const active = run.forceFields[1].active
      stepRbotFieldApproach(scene)
      const actor = bot.actor, points = rbotFieldRigPoints(actor), free = !actor.grounded && !actor.hang && !actor.mantle && !actor.climbing
      if (scene.pressing && !active && run.forceFields[1].active) activatedInAir ||= !actor.grounded
      if (activatedInAir) {
        gripped ||= !!actor.hang || !!actor.mantle
        landed = actor.grounded && Math.abs(bot.y - 375) < .1
        if (free && previousFree) for (let i = 0; i < points.length; i++) maxPoseStep = Math.max(maxPoseStep,
          Math.hypot(points[i][0] - previous[i][0], points[i][1] - previous[i][1]))
      }
      previous = points; previousFree = free
    }
    const canvas = document.createElement('canvas'); canvas.width = 1100; canvas.height = 900; canvas.id = 'rbot-current-trap'
    document.body.replaceChildren(canvas)
    drawChallenge(canvas.getContext('2d'), canvas.width, canvas.height, run, { zoom: 1.4, x: 250, y: 80 })
    return { activatedInAir, gripped, landed, maxPoseStep }
  }, level)
  expect(result.activatedInAir && result.gripped && result.landed).toBe(true)
  expect(result.maxPoseStep).toBeLessThan(11)
  await page.locator('#rbot-current-trap').screenshot({ path: info.outputPath('quarantine-rbot-updated-trap.png') })
})
