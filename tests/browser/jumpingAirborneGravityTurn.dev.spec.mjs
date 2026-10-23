import { test, expect } from './helpers/test.mjs'
import { finishJumpingEntrance, useLevelFixtures } from './helpers/jumpingLevels.mjs'
import { blankTrial, prepareLevelRopes } from '../../src/games/jumping/level.ts'

test('fresh controls turn in the air on entering and leaving reversed gravity', async ({ page }, info) => {
  test.setTimeout(60_000)
  const level = { ...blankTrial(), id: 'airborne-gravity-turn', name: 'Airborne gravity turn', height: 1500, floor: 1500,
    entrance: { x: 400, y: 1500 }, goal: { x: 1600, y: 1500 },
    gravityPlates: [{ id: 'g', x: 0, y: 0, w: 1000, h: 1500, gravity: -1, power: 'always' }] }
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await useLevelFixtures(page, [level])
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/lab?motionDebug=1')
  await expect(page.locator('.jumping-level-card[aria-pressed=true]')).toBeVisible({ timeout: 20000 })
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.locator('.jumping-level-card[aria-pressed=true]').click()
  await expect.poll(async () => {
    await page.clock.runFor(16)
    return page.locator('.jumping-game > canvas').evaluate(canvas => document.activeElement === canvas)
  }, { timeout: 20000 }).toBe(true)
  await finishJumpingEntrance(page)
  await page.keyboard.down('d'); await page.clock.runFor(20); await page.keyboard.up('d')
  await page.clock.runFor(700)
  let recent = await page.evaluate(() => window.jumpingMotion.read().recent)
  expect(recent.some(s => Math.abs(s.blends.gravityTurn) > .3 && !s.signals.grounded)).toBe(true)
  expect(recent.some(s => s.signals.inverted && !s.signals.grounded)).toBe(true)
  await page.clock.runFor(2000)
  const sample = () => page.evaluate(() => window.jumpingMotion.read().recent.at(-1))
  expect((await sample()).signals.grounded).toBe(true)
  expect((await sample()).signals.inverted).toBe(true)
  await page.evaluate(() => {
    window.testPad = { index: 0, id: 'Screen directions', mapping: 'standard', connected: true,
      axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [window.testPad] })
  })
  await page.clock.runFor(64)
  await page.evaluate(() => { window.testPad.axes[1] = -1 }); await page.clock.runFor(300)
  await expect(page.locator('.jumping-state')).toHaveText('Crouching')
  await page.evaluate(() => { window.testPad.axes[1] = 1 }); await page.clock.runFor(300)
  await expect(page.locator('.jumping-state')).not.toHaveText('Crouching')
  await page.evaluate(() => { window.testPad.axes[1] = 0 }); await page.clock.runFor(64)
  await page.keyboard.down('d')
  for (let i = 0; i < 150 && (await sample()).x < 1030; i++) await page.clock.runFor(16)
  await page.keyboard.up('d')
  await page.clock.runFor(700)
  recent = await page.evaluate(() => window.jumpingMotion.read().recent)
  expect(recent.some(s => s.x > 1000 && Math.abs(s.blends.gravityTurn) > .3 && !s.signals.grounded)).toBe(true)
  expect((await sample()).signals.inverted).toBe(false)
  expect((await sample()).signals.grounded).toBe(false)
  await page.screenshot({ path: info.outputPath('upright-before-landing.png') })
  await page.clock.runFor(2000)
  expect((await sample()).signals.grounded).toBe(true)
  expect(errors).toEqual([])
})

test('fresh controls catch a rope while the airborne flip is still in progress', async ({ page }, info) => {
  test.setTimeout(60_000)
  const level = prepareLevelRopes({ ...blankTrial(), id: 'airborne-rope-catch', name: 'Airborne rope catch', height: 1500, floor: 1500,
    entrance: { x: 400, y: 1500 }, goal: { x: 1600, y: 1500 },
    climbables: { ladders: [], ropes: [{ x: 440, y: 700, length: 800, segments: 100 }] },
    gravityPlates: [{ id: 'g', x: 0, y: 0, w: 1800, h: 1500, gravity: -1, power: 'always' }] })
  await useLevelFixtures(page, [level])
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/lab?motionDebug=1')
  await expect(page.locator('.jumping-level-card[aria-pressed=true]')).toBeVisible({ timeout: 20000 })
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.locator('.jumping-level-card[aria-pressed=true]').click()
  await expect.poll(async () => {
    await page.clock.runFor(16)
    return page.locator('.jumping-game > canvas').evaluate(canvas => document.activeElement === canvas)
  }, { timeout: 20000 }).toBe(true)
  await finishJumpingEntrance(page)
  await page.keyboard.down('d'); await page.clock.runFor(20); await page.keyboard.up('d')
  await page.clock.runFor(350)
  const recent = await page.evaluate(() => window.jumpingMotion.read().recent)
  const caught = recent.findIndex((sample, index) => index > 0 && sample.signals.mode === 'rope' && recent[index - 1].signals.mode !== 'rope')
  expect(caught).toBeGreaterThan(0)
  expect(Math.abs(recent[caught - 1].blends.gravityTurn)).toBeGreaterThan(.05)
  expect(Math.abs(recent[caught].blends.gravityTurn - recent[caught - 1].blends.gravityTurn)).toBeLessThan(.1)
  expect(recent.at(-1).signals.mode).toBe('rope')
  await page.screenshot({ path: info.outputPath('rope-catch-during-flip.png') })
})

test('player and R-bot roll through a gathered pose in both gravity directions', async ({ page }, info) => {
  await page.goto('/lab')
  const results = await page.evaluate(async () => {
    const { createPlayer, stepPlayer, NEUTRAL_INPUT, STEP } = await import('/src/games/jumping/model.ts')
    const { createGravityField, updateGravityField } = await import('/src/games/jumping/gravity.ts')
    const { drawAthlete } = await import('/src/games/jumping/athlete.ts')
    const { repulsorBotPose } = await import('/src/games/jumping/repulsorBotRig.ts')
    const { playerTurnAngle } = await import('/src/games/jumping/ropeGravity.ts')
    const canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = 1000
    document.body.replaceChildren(canvas); document.body.style.margin = '0'
    const ctx = canvas.getContext('2d'), results = []
    ctx.fillStyle = '#f1f2ef'; ctx.fillRect(0, 0, canvas.width, canvas.height)
    for (let row = 0; row < 4; row++) {
      const inverted = row % 2 === 1, robot = row >= 2
      const p = createPlayer({ x: 500, y: 1000 }); Object.assign(p, { inverted, grounded: false, vy: inverted ? 200 : -200 })
      const field = createGravityField()
      updateGravityField(field, [{ id: 'g', x: -10000, y: -10000, w: 20000, h: 20000, gravity: inverted ? 1 : -1, power: 'always' }], new Map(), true)
      let ticks = 0
      for (const [column, time] of [0, .09, .175, .26, .4].entries()) {
        while (ticks * STEP < time) { stepPlayer(p, NEUTRAL_INPUT, STEP, [], undefined, undefined, undefined, field); ticks++ }
        const x = column * 320, y = row * 250, angle = playerTurnAngle(p), flip = p.inverted ? -1 : 1
        ctx.fillStyle = '#30423a'; ctx.font = '16px sans-serif'
        ctx.fillText(`${robot ? 'R-bot' : 'Player'} · ${inverted ? 'down' : 'up'} · ${time.toFixed(2)} s`, x + 12, y + 24)
        ctx.save(); ctx.beginPath(); ctx.rect(x, y + 35, 320, 215); ctx.clip()
        ctx.translate(x + 160, y + 140); ctx.scale(robot ? 2.6 : 3, 3)
        ctx.translate(-p.x - Math.sin(angle) * 31 * flip, -p.y + Math.cos(angle) * 31 * flip)
        drawAthlete(ctx, p, robot ? '#a26b48' : '#686b6e', robot ? repulsorBotPose(p) : undefined)
        ctx.restore()
      }
      results.push({ inverted: p.inverted, expected: !inverted, turning: !!p.releaseTurn })
    }
    return results
  })
  for (const result of results) { expect(result.inverted).toBe(result.expected); expect(result.turning).toBe(false) }
  await page.locator('canvas').screenshot({ path: info.outputPath('airborne-gravity-rolls.png') })
})

test('a roll in a low chamber settles into a supported crouch instead of staying folded', async ({ page }, info) => {
  await page.goto('/lab')
  const result = await page.evaluate(async () => {
    const { createPlayer, stepPlayer, NEUTRAL_INPUT, STEP } = await import('/src/games/jumping/model.ts')
    const { drawAthlete } = await import('/src/games/jumping/athlete.ts')
    const { mirrorPlatform, mirrorPlayerState } = await import('/src/games/jumping/gravityFrame.ts')
    const p = createPlayer({ x: 109, y: 570 })
    Object.assign(p, { grounded: false, coyote: 0,
      releaseTurn: { angle: Math.PI / 2, target: Math.PI, progress: .5, time: .18 } })
    mirrorPlayerState(p); p.inverted = true
    const terrain = [{ x: -100, y: 500, w: 500, h: 40 }, { x: -100, y: 600, w: 500, h: 100 }].map(mirrorPlatform)
    for (let i = 0; i < 180; i++) stepPlayer(p, NEUTRAL_INPUT, STEP, terrain)
    const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 300
    document.body.replaceChildren(canvas)
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#f1f2ef'; ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.translate(400 - p.x * 3, 150 - (p.y - 20) * 3); ctx.scale(3, 3)
    ctx.fillStyle = '#8c9491'
    for (const b of terrain) ctx.fillRect(b.x, b.y, b.w, b.h)
    drawAthlete(ctx, p, '#686b6e')
    return { inverted: p.inverted, grounded: p.grounded, crouching: p.crouching, turning: !!p.releaseTurn }
  })
  expect(result).toEqual({ inverted: false, grounded: true, crouching: true, turning: false })
  await page.locator('canvas').screenshot({ path: info.outputPath('settled-crouch-in-low-chamber.png') })
})
