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
      if (this.fillStyle === '#b66d65' && this.canvas.botCamera && !this.canvas.repulsorBots.length) {
        const t = this.getTransform(), camera = this.canvas.botCamera
        this.canvas.repulsorBots.push({ x: (t.e - camera.e) / camera.a, y: (t.f - camera.f) / camera.d })
      }
      return fill.apply(this, args)
    }
  })
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/lab?motionDebug=1')
  const card = page.locator('.jumping-level-card[aria-pressed=true]').filter({ hasText: file.name })
  await expect(card).toBeVisible({ timeout: 15000 })
  await card.click()
  await expect(page.locator('.jumping-game > canvas')).toBeFocused({ timeout: 30000 })
  await expect(page.getByRole('dialog', { name: 'Preparing level', exact: true })).toHaveCount(0)
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await restartFromPause(page, finishEntrance)
}

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
  await page.clock.runFor(300)
  expect((await motion(page)).x).toBeLessThan(start - 80)
  expect(await page.locator('canvas').evaluate(canvas => canvas.repulsorBots.length)).toBe(1)
  expect(errors).toEqual([])
})

test('F shoves an adjacent disabled Rbot through normal gameplay without equipping a tool', async ({ page }, info) => {
  const file = fixture(); file.entrance.x = 418; file.robots[0].x = 450
  file.pickups = [{ kind: 'emp', x: 418, y: 668 }]
  await open(page, file)
  const start = await motion(page)
  const botX = () => page.locator('canvas').evaluate(canvas => canvas.repulsorBots[0]?.x)
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
  await page.locator('canvas').screenshot({ path: info.outputPath('shove-poses.png') })
})

test('the shove impact texture renders a short, bounded thump', async ({ page }) => {
  await page.goto('/lab')
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
    positions.push(await page.locator('canvas').evaluate(canvas => canvas.repulsorBots[0]))
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
    const bot = await page.locator('canvas').evaluate(canvas => canvas.repulsorBots[0])
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
    positions.push(await page.locator('canvas').evaluate(canvas => canvas.repulsorBots[0]))
    if ([0, 9, 19].includes(i)) await page.screenshot({ path: info.outputPath(`uninvited-entrance-${i + 1}s.png`) })
    if (positions.at(-1)?.x < 350 && positions.at(-1)?.y > 1130) break
  }
  expect(positions.every(position => position?.y > 600)).toBe(true)
  expect(positions.at(-1)?.x).toBeLessThan(350)
  expect(positions.at(-1)?.y).toBeGreaterThan(1130)
  await page.screenshot({ path: info.outputPath('uninvited-entrance-hunt.png') })
  await info.attach('patrol-positions.json', { body: JSON.stringify(positions), contentType: 'application/json' })
})

test('Aloft Rbot catches and climbs the final rope when lured into the upper structure', async ({ page }, info) => {
  test.setTimeout(180000)
  const file = JSON.parse(readFileSync(new URL('../fixtures/jumping/aloft-rbot-routes.json', import.meta.url), 'utf8'))
  // Isolate the upper encounter. Geometry, red fields, plates and wiring retain
  // their authored definitions; all play after entry uses normal controller input.
  file.name = 'Aloft upper structure lure'; file.entrance = { x: 1020, y: 1115 }
  // Begin at the end of the previous mantle: little speed and little runway.
  const robot = file.robots.find(robot => robot.kind === 'repulsor'); robot.x = 510; robot.y = 1690
  await page.addInitScript(() => {
    window.testPad = { index: 0, id: 'Lure controller', connected: true, mapping: 'standard', axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [window.testPad] })
  })
  await open(page, file)
  let wait = 0, entered = false, reachedRope = false, climbed = false, crossing = false
  const positions = []
  for (let frame = 0; frame < 150 && !entered; frame++) {
    const p = await motion(page), bot = await page.locator('canvas').evaluate(canvas => canvas.repulsorBots[0])
    const moving = ++wait >= 3, move = moving && p.x < 2050 ? 1 : 0
    if (moving && p.signals.grounded && p.x > 1615 && p.x < 1650) crossing = true
    if (p.x > 1780) crossing = false
    const jump = crossing
    if (bot.x > 850 && bot.y > 1400) reachedRope = true
    if (reachedRope && bot.y < 1250 && bot.x > 850 && bot.x < 1070) climbed = true
    entered = bot.x > 1120 && bot.y > 1100 && bot.y < 1130
    positions.push({ player: { x: p.x, y: p.y }, bot })
    await page.evaluate(({ move, jump, climb }) => {
      window.testPad.axes[0] = move ? Math.sign(move) * (.18 + .82 * Math.abs(move)) : 0
      window.testPad.buttons[0] = { pressed: jump, value: Number(jump) }
      window.testPad.buttons[12] = { pressed: climb, value: Number(climb) }
    }, { move, jump, climb: moving })
    await page.clock.runFor(96)
  }
  await info.attach('aloft-lure-positions.json', { body: JSON.stringify(positions), contentType: 'application/json' })
  await page.screenshot({ path: info.outputPath('aloft-rbot-lured-inside.png') })
  expect(reachedRope).toBe(true); expect(climbed).toBe(true); expect(entered).toBe(true)
})

test('Aloft Rbot follows the player out through the open upper structure exit', async ({ page }, info) => {
  test.setTimeout(180000)
  const file = JSON.parse(readFileSync(new URL('../fixtures/jumping/aloft-rbot-routes.json', import.meta.url), 'utf8'))
  file.name = 'Aloft open exit hunt'; file.entrance = { x: 1020, y: 1115 }
  const robot = file.robots.find(robot => robot.kind === 'repulsor')
  Object.assign(robot, { x: 1200, y: 1115, left: 26, right: file.width - 26 })
  await open(page, file)
  await page.clock.runFor(250) // Stand on the ordinary entrance toggle to open it.
  const positions = []; let followed = false, rope = false
  for (let frame = 0; frame < 150 && !followed; frame++) {
    const p = await motion(page), bot = await page.locator('canvas').evaluate(canvas => canvas.repulsorBots[0])
    rope ||= p.signals.mode === 'rope'
    const move = !rope && p.x > 935, down = p.y < 1450
    if (move) await page.keyboard.down('ArrowLeft'); else await page.keyboard.up('ArrowLeft')
    if (down) await page.keyboard.down('ArrowDown'); else await page.keyboard.up('ArrowDown')
    positions.push({ player: { x: p.x, y: p.y, mode: p.signals.mode }, bot })
    followed = !!bot && bot.x < 960 && bot.y > 1250
    await page.clock.runFor(96)
  }
  await page.keyboard.up('ArrowLeft'); await page.keyboard.up('ArrowDown')
  await info.attach('aloft-open-exit-positions.json', { body: JSON.stringify(positions), contentType: 'application/json' })
  await page.screenshot({ path: info.outputPath('aloft-rbot-followed-out.png') })
  expect((await motion(page)).x).toBeLessThan(965)
  expect(followed).toBe(true)
})
