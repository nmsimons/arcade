import { test, expect } from './helpers/test.mjs'
import { blankTrial, levelProblems, parseLevel } from '../../src/games/jumping/level.ts'
import { restartFromPause, useLevelFixtures } from './helpers/jumpingLevels.mjs'
import { readFileSync } from 'node:fs'

test.setTimeout(60000)
const motion = page => page.evaluate(() => window.jumpingMotion.read().recent.at(-1))
function fixture() {
  return { ...blankTrial(), id: 'repulsorbot-browser', name: 'Repulsorbot controls', width: 1400, height: 700, floor: 700,
    entrance: { x: 260, y: 700 }, goal: { x: 1300, y: 700, flipX: true }, timing: 'untimed',
    robots: [{ kind: 'repulsor', x: 800, y: 700, left: 26, right: 1374 }] }
}
async function open(page, file, finishEntrance = true) {
  expect(() => parseLevel(file)).not.toThrow()
  expect(levelProblems(file)).toEqual([])
  await useLevelFixtures(page, [file])
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype, fillRect = proto.fillRect, fill = proto.fill
    proto.fillRect = function (...args) {
      if (args[0] === 0 && args[1] === 0 && this.fillStyle === '#f1f1ed') {
        this.canvas.botCamera = this.getTransform(); this.canvas.repulsorBots = []
      }
      return fillRect.apply(this, args)
    }
    proto.fill = function (...args) {
      if (args[0] instanceof Path2D && this.fillStyle === '#b66d65' && this.canvas.botCamera && !this.canvas.repulsorBots.length) {
        const t = this.getTransform(), camera = this.canvas.botCamera
        this.canvas.repulsorBots.push({ x: (t.e - camera.e) / camera.a, y: (t.f - camera.f) / camera.d })
      }
      return fill.apply(this, args)
    }
  })
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/lab/library?motionDebug=1')
  const card = page.locator('.jumping-level-card[aria-pressed=true]').filter({ hasText: file.name })
  await expect(card).toBeVisible({ timeout: 15000 })
  await card.click()
  await expect(page.locator('.jumping-game > canvas[role="img"]')).toBeFocused({ timeout: 30000 })
  await expect(page.locator('.jumping-game[aria-busy="true"]')).toHaveCount(0)
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await restartFromPause(page, finishEntrance)
}

test('Rbot climbs past a hostile shovebot crowding a ladder exit', async ({ page }, info) => {
  test.setTimeout(90000)
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  const file = fixture()
  file.entrance = { x: 700, y: 380 }
  file.platforms = [{ x: 200, y: 380, w: 600, h: 30 }, { x: 500, y: 0, w: 30, h: 380 }]
  file.climbables.ladders = [{ x: 300, top: 180, bottom: 700, platform: -1, side: 1 }]
  file.robots = [{ x: 338, y: 380, left: 300, right: 440 }, { kind: 'repulsor', x: 300, y: 700, left: 26, right: 1374 }]
  await open(page, file)
  let exited = false
  const positions = []
  for (let frame = 0; frame < 20 && !exited; frame++) {
    await page.clock.runFor(400)
    const bot = await page.locator('canvas:not(.jumping-webgl-canvas)').evaluate(canvas => canvas.repulsorBots[0])
    positions.push(bot)
    if ([5, 11].includes(frame)) await page.screenshot({ path: info.outputPath(`hostile-ladder-${frame}.png`) })
    exited = !!bot && bot.y <= 381 && bot.y >= 370
  }
  expect(exited, JSON.stringify(positions)).toBe(true)
  await page.screenshot({ path: info.outputPath('hostile-ladder-exit-clear.png') })
  expect(errors).toEqual([])
})

test('the broader player rig charges and fires from its palm, pushing the player through normal motion', async ({ page }, info) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await open(page, fixture())
  const start = (await motion(page)).x
  await page.clock.runFor(400)
  expect((await motion(page)).x).toBeCloseTo(start, 1)
  await page.screenshot({ path: info.outputPath('rbot-palm-charge.png') })
  let fired = false
  for (let i = 0; i < 60 && !fired; i++) {
    const before = (await motion(page)).x
    await page.clock.runFor(16)
    const after = (await motion(page)).x
    expect(Math.abs(after - before)).toBeLessThan(20)
    if (after < start - 1) { fired = true; await page.screenshot({ path: info.outputPath('rbot-palm-shot.png') }) }
  }
  expect(fired).toBe(true)
  expect((await motion(page)).signals.ragdoll).toBe('repulsor')
  await page.clock.runFor(300)
  expect((await motion(page)).x).toBeLessThan(start - 80)
  expect(await page.locator('canvas:not(.jumping-webgl-canvas)').evaluate(canvas => canvas.repulsorBots.length)).toBe(1)
  expect(errors).toEqual([])
})

test('F shoves an adjacent disabled Rbot through normal gameplay without equipping a tool', async ({ page }, info) => {
  const file = fixture(); file.entrance.x = 418; file.robots[0].x = 450
  file.pickups = [{ kind: 'emp', x: 418, y: 668 }]
  await open(page, file)
  const start = await motion(page)
  const botX = () => page.locator('canvas:not(.jumping-webgl-canvas)').evaluate(canvas => canvas.repulsorBots[0]?.x)
  const before = await botX()
  await page.keyboard.down('KeyF')
  await page.clock.runFor(64)
  await page.screenshot({ path: info.outputPath('player-shove-gather.png') })
  expect(await botX()).toBeCloseTo(before, 1)
  await page.clock.runFor(144)
  await page.screenshot({ path: info.outputPath('player-shove-impact.png') })
  for (let frame = 0; frame < 4; frame++) {
    const previous = await botX(); await page.clock.runFor(16)
    expect(Math.abs(await botX() - previous)).toBeLessThan(20)
  }
  expect(await botX()).toBeGreaterThan(before + 12)
  expect((await motion(page)).x).toBeCloseTo(start.x, 1)
  await page.keyboard.up('KeyF')
  await page.screenshot({ path: info.outputPath('player-shove-knockback.png') })
})

test('an adjacent Rbot shows a palm-shove tell, then knocks the player away', async ({ page }, info) => {
  const file = fixture(); file.entrance.x = 418; file.robots[0].x = 450
  await open(page, file, false)
  // Follow the entrance status in small steps: the usual helper can advance
  // far enough for this nearby bot to start its short melee windup already.
  await page.clock.runFor(128)
  await expect(page.locator('.jumping-state')).toHaveText('Entering the level')
  await expect.poll(async () => {
    await page.clock.runFor(16)
    return page.locator('.jumping-state').innerText()
  }, { intervals: [0], timeout: 15000 }).not.toBe('Entering the level')
  const start = (await motion(page)).x
  await page.clock.runFor(64)
  expect((await motion(page)).x).toBeCloseTo(start, 1)
  await page.screenshot({ path: info.outputPath('rbot-shove-gather.png') })
  await page.clock.runFor(288)
  expect((await motion(page)).x).toBeLessThan(start - 100)
  await page.screenshot({ path: info.outputPath('rbot-shove-knockback.png') })
})

test('shove poses adapt to empty space and a wall-pinned Rbot', async ({ page }, info) => {
  await page.goto('/tests/fixtures/jumping/lighting-prototype.json')
  const pure = await page.evaluate(async () => {
    const { blankTrial } = await import('/src/games/jumping/level.ts')
    const { createRun, stepRun } = await import('/src/games/jumping/challenge.ts')
    const { NEUTRAL_INPUT } = await import('/src/games/jumping/model.ts')
    const { drawAthlete } = await import('/src/games/jumping/athlete.ts')
    const { repulsorBotPose, REPULSOR_BOT_WIDTH_SCALE } = await import('/src/games/jumping/repulsorBotRig.ts')
    const sheet = document.createElement('canvas'); sheet.width = 1200; sheet.height = 660
    const ctx = sheet.getContext('2d'), frames = [4, 12, 20, 28, 40, 56]
    let pure = true
    for (const [row, label] of ['Empty stroke', 'Pinned target', 'Rbot counter'].entries()) {
      const file = blankTrial(); file.goal.x = 1700; file.entrance.x = 418
      if (row) { file.platforms = [{ x: 462, y: 700, w: 40, h: 220 }]; file.robots = [{ kind: 'repulsor', x: 450, y: 920, left: 26, right: 1774 }] }
      const run = createRun(file); run.started = true; run.entrance = null
      if (row === 1) run.gadgets.disabled.set(run.robots[0], 10)
      let col = 0
      for (let frame = 0; frame <= frames.at(-1); frame++) {
        stepRun(run, { ...NEUTRAL_INPUT, use: row < 2 && frame === 0, move: row ? 1 : 0 })
        if (frame !== frames[col]) continue
        const p = run.player, before = JSON.stringify(p)
        ctx.fillStyle = '#f1f1ed'; ctx.fillRect(col * 200, row * 220, 200, 220)
        ctx.save(); ctx.beginPath(); ctx.rect(col * 200, row * 220, 200, 220); ctx.clip()
        ctx.translate(col * 200 + 55, row * 220 + 195); ctx.scale(2.2, 2.2); ctx.translate(-418, -920)
        ctx.fillStyle = '#a3aaa4'; ctx.fillRect(390, 920, 170, 8)
        if (row) {
          ctx.fillStyle = '#a3aaa4'; ctx.fillRect(462, 700, 40, 220)
          const bot = run.robots[0], actor = bot.actor
          ctx.save(); ctx.translate(actor.x, actor.y); ctx.scale(REPULSOR_BOT_WIDTH_SCALE, 1)
          drawAthlete(ctx, { ...actor, x: 0, y: 0 }, '#b66d65', repulsorBotPose(actor)); ctx.restore()
        }
        drawAthlete(ctx, p); ctx.restore()
        ctx.fillStyle = '#303c36'; ctx.font = '12px monospace'; ctx.fillText(`${label} ${frame}f`, col * 200 + 8, row * 220 + 18)
        pure &&= JSON.stringify(p) === before
        col++
      }
    }
    document.body.replaceChildren(sheet)
    return pure
  })
  expect(pure).toBe(true)
  await page.locator('canvas:not(.jumping-webgl-canvas)').screenshot({ path: info.outputPath('shove-poses.png') })
})

test('the shove impact texture renders a short, bounded thump', async ({ page }) => {
  await page.goto('/lab/library')
  const result = await page.evaluate(async () => {
    const { JumpingSound } = await import('/src/games/jumping/sound.ts')
    const ctx = new OfflineAudioContext(2, 12000, 24000), sound = new JumpingSound(ctx)
    sound.cue({ kind: 'shove', volume: 1, pan: 0, strength: 1 })
    const buffer = await ctx.startRendering(), data = buffer.getChannelData(0)
    const energy = data.slice(0, 4800).reduce((sum, value) => sum + value * value, 0)
    const tail = data.slice(6000).reduce((max, value) => Math.max(max, Math.abs(value)), 0)
    sound.dispose()
    return { rms: Math.sqrt(energy / 4800), peak: data.reduce((max, value) => Math.max(max, Math.abs(value)), 0), tail }
  })
  expect(result.rms).toBeGreaterThan(.01)
  expect(result.peak).toBeLessThan(.2)
  expect(result.tail).toBe(0)
})

test('the humanoid completes an ordinary ledge climb and keeps traversing instead of hanging up', async ({ page }, info) => {
  const file = fixture(); file.entrance.x = 1200; file.goal.x = 200; file.goal.flipX = false
  file.robots[0].x = 300
  file.platforms = [{ x: 450, y: 560, w: 160, h: 140 }, { x: 1000, y: 0, w: 30, h: 700 }]
  await open(page, file)
  const positions = []
  for (let i = 0; i < 20; i++) {
    await page.clock.runFor(300)
    positions.push(await page.locator('canvas:not(.jumping-webgl-canvas)').evaluate(canvas => canvas.repulsorBots[0]))
    if ([3, 7, 12].includes(i)) await page.screenshot({ path: info.outputPath(`rbot-climb-${i}.png`) })
  }
  expect(Math.min(...positions.map(p => p.y))).toBeLessThan(600)
  expect(Math.max(...positions.map(p => p.x))).toBeGreaterThan(800)
})

test('Rbot approaches an overlapping upper deck from a safe takeoff', async ({ page }, info) => {
  const file = fixture()
  file.entrance = { x: 950, y: 425 }; file.robots[0].x = 1250; file.robots[0].y = 625
  file.goal = { ...file.goal, x: 260, flipX: false }
  file.platforms = [{ x: 750, y: 625, w: 575, h: 25 }, { x: 600, y: 425, w: 400, h: 25 }]
  await open(page, file)
  let reached = false, captured = false
  for (let frame = 0; frame < 70 && !reached; frame++) {
    await page.clock.runFor(128)
    const bot = await page.locator('canvas:not(.jumping-webgl-canvas)').evaluate(canvas => canvas.repulsorBots[0])
    if (!captured && bot.y < 600 && bot.y > 500) {
      await page.screenshot({ path: info.outputPath('rbot-safe-ascent.png') }); captured = true
    }
    reached = Math.abs(bot.y - 425) < .5
  }
  expect(reached).toBe(true)
  await page.screenshot({ path: info.outputPath('rbot-upper-deck.png') })
})

test('Uninvited Company patrol while the player waits at the entrance', async ({ page }, info) => {
  test.setTimeout(180000)
  const file = JSON.parse(readFileSync(new URL('../fixtures/jumping/uninvited-rbot-routes.json', import.meta.url), 'utf8').replace(/^\uFEFF/, ''))
  await open(page, file)
  const positions = []
  for (let i = 0; i < 8; i++) {
    await page.clock.runFor(1000)
    positions.push(await page.locator('canvas:not(.jumping-webgl-canvas)').evaluate(canvas => canvas.repulsorBots[0]))
    if ([0, 9, 19].includes(i)) await page.screenshot({ path: info.outputPath(`uninvited-entrance-${i + 1}s.png`) })
    if (positions.at(-1)?.x < 350 && positions.at(-1)?.y > 1130) break
  }
  // It hunts down to the entrance and never climbs onto the upper deck (y 520). At its size a leap off the
  // rope can arc above the deck's height on the way down.
  expect(positions.every(position => position?.y > 525)).toBe(true)
  expect(positions.at(-1)?.x).toBeLessThan(350)
  expect(positions.at(-1)?.y).toBeGreaterThan(1130)
  await page.screenshot({ path: info.outputPath('uninvited-entrance-hunt.png') })
  await info.attach('patrol-positions.json', { body: JSON.stringify(positions), contentType: 'application/json' })
})

