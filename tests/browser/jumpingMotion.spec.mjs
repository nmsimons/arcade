import { test, expect } from './helpers/test.mjs'
import { useLevelFixtures } from './helpers/jumpingLevels.mjs'
import { blankTrial } from '../../src/games/jumping/level.ts'

test('motion diagnostics observe real controls and pushing resumes smoothly after a brief release', async ({ page }, info) => {
  const level = blankTrial(); level.spawn = { x: 474.5, y: 920 }
  level.props = [{ kind: 'box', x: 540, y: 920, size: 80 }]
  level.platforms = [{ x: 580, y: 700, w: 100, h: 220 }]
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await useLevelFixtures(page, [level])
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/untitled-jumping-game?motionDebug=1')
  await expect(page.locator('.jumping-level-card[aria-pressed=true]')).toBeVisible()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.locator('.jumping-level-card[aria-pressed=true]').click()
  await expect(page.locator('canvas')).toBeFocused()
  await page.clock.runFor(64)
  await page.keyboard.down('d'); await page.clock.runFor(800)
  const read = () => page.evaluate(() => window.jumpingMotion.read())
  expect((await read()).recent.at(-1).blends.push).toBe(1)
  for (let i = 0; i < 6; i++) {
    await page.keyboard.up('d'); await page.clock.runFor(16)
    expect((await read()).recent.at(-1).signals.push).toBeNull()
    await page.keyboard.down('d'); await page.clock.runFor(32)
    expect((await read()).recent.at(-1).blends.push).toBeGreaterThan(.85)
  }
  await page.screenshot({ path: info.outputPath('resumed-push.png') })
  await page.keyboard.down('Space'); await page.clock.runFor(400)
  await page.keyboard.up('Space'); await page.clock.runFor(64)
  const jumping = (await read()).recent.at(-1)
  expect(jumping.signals.grounded).toBe(false)
  expect(jumping.signals.push).toBeNull()
  expect(jumping.blends.push).toBe(0)
  expect((await read()).reports).toEqual([])
  await page.keyboard.up('d'); await page.keyboard.press('Escape'); await page.clock.runFor(32)
  expect((await read()).recent).toEqual([])
  expect(errors).toEqual([])
})

test('production play does not enable diagnostics without the flag', async ({ page }) => {
  await useLevelFixtures(page, [blankTrial()])
  await page.goto('/untitled-jumping-game')
  await expect(page.locator('.jumping-level-card[aria-pressed=true]')).toBeVisible()
  expect(await page.evaluate(() => window.jumpingMotion)).toBeUndefined()
})

test('a keyboard shove begins with palms on the surface', async ({ page }, info) => {
  const level = blankTrial(); level.spawn = { x: 474.5, y: 920 }
  level.props = [{ kind: 'box', x: 540, y: 920, size: 80 }]
  await useLevelFixtures(page, [level])
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/untitled-jumping-game?motionDebug=1')
  await expect(page.locator('.jumping-level-card[aria-pressed=true]')).toBeVisible()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.locator('.jumping-level-card[aria-pressed=true]').click()
  await expect(page.locator('canvas')).toBeFocused()
  await page.keyboard.down('d'); await page.clock.runFor(200)
  const frames = await page.evaluate(() => window.jumpingMotion.read().recent)
  expect(frames.length).toBeGreaterThan(5)
  for (const frame of frames.filter(frame => frame.contacts.palms.length)) {
    frame.contacts.hands.forEach((hand, i) => {
      const palm = frame.contacts.palms[i]
      expect(Math.hypot(hand.x - palm.x - palm.nx * 1.6, hand.y - palm.y - palm.ny * 1.6)).toBeLessThan(.5)
    })
  }
  await page.screenshot({ path: info.outputPath('first-palm-contact.png') })
})

test('held keyboard movement springs a long-fall landing into supported running', async ({ page }, info) => {
  const level = blankTrial(); level.height = 1480; level.floor = 1400; level.width = 4000
  level.spawn = { x: 540, y: 100 }; level.goal.y = 1400
  level.platforms = [{ x: 500, y: 100, w: 120, h: 20 }]
  await useLevelFixtures(page, [level])
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/untitled-jumping-game?motionDebug=1')
  await expect(page.locator('.jumping-level-card[aria-pressed=true]')).toBeVisible()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.locator('.jumping-level-card[aria-pressed=true]').click()
  await expect(page.locator('canvas')).toBeFocused()
  await page.keyboard.down('d'); await page.clock.runFor(2500)
  const frames = await page.evaluate(() => window.jumpingMotion.read().recent)
  const impact = frames.find(frame => frame.signals.grounded && frame.signals.mode === 'get-up')
  expect(impact).toBeTruthy()
  const settled = frames.filter(frame => frame.time >= impact.time + .2)
  expect(settled.length).toBeGreaterThan(10)
  expect(settled.every(frame => frame.signals.mode === 'free' && frame.points[2][1] < -35)).toBe(true)
  expect(settled.some(frame => frame.contacts.feet.some(foot => foot.planted))).toBe(true)
  expect(settled.every(frame => Math.abs(frame.vx - 410) < .01)).toBe(true)
  await page.screenshot({ path: info.outputPath('supported-moving-recovery.png') })
})

for (const direction of [-1, 1]) test(`crouched pushing keeps the final head clear and establishes a brace: direction=${direction}`, async ({ page }, info) => {
  const level = blankTrial(); level.spawn = { x: 540 - direction * 65.5, y: 920 }
  level.props = [{ kind: 'box', x: 540, y: 920, size: 80 }]
  level.platforms = [{ x: direction === 1 ? 580 : 380, y: 650, w: 120, h: 270 }]
  await useLevelFixtures(page, [level])
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/untitled-jumping-game?motionDebug=1')
  await expect(page.locator('.jumping-level-card[aria-pressed=true]')).toBeVisible()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.locator('.jumping-level-card[aria-pressed=true]').click()
  await expect(page.locator('canvas')).toBeFocused()
  await page.clock.runFor(64)
  const key = direction === 1 ? 'd' : 'a'
  await page.keyboard.down(key); await page.keyboard.down('ArrowDown')
  await page.clock.runFor(800)
  const samples = await page.evaluate(() => window.jumpingMotion.read().recent.slice(-40))
  expect(samples.length).toBe(40)
  const face = direction === 1 ? 500 : 580
  for (const s of samples) {
    expect(s.signals.grounded).toBe(true)
    expect(s.signals.facing).toBe(direction)
    expect(s.signals.push).not.toBeNull()
    expect((face - s.x) * direction - s.points[2][0] - 6.2).toBeGreaterThanOrEqual(-.02)
    expect(Math.abs(s.points[8][0] - s.points[10][0])).toBeGreaterThan(8)
  }
  await page.screenshot({ path: info.outputPath('crouched-brace.png') })
  await page.keyboard.up('ArrowDown'); await page.keyboard.up(key)
})

test('the rendered torso transfers weight during a real moving push', async ({ page }, info) => {
  const level = blankTrial(); level.spawn = { x: 474.5, y: 920 }
  level.props = [{ kind: 'box', x: 540, y: 920, size: 80 }]
  await useLevelFixtures(page, [level])
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/untitled-jumping-game?motionDebug=1')
  await expect(page.locator('.jumping-level-card[aria-pressed=true]')).toBeVisible()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.locator('.jumping-level-card[aria-pressed=true]').click()
  await expect(page.locator('canvas')).toBeFocused()
  await page.clock.runFor(64)
  await page.keyboard.down('d'); await page.clock.runFor(1500)
  const data = await page.evaluate(() => window.jumpingMotion.read())
  const samples = data.recent.filter(s => s.blends.push === 1).slice(-100)
  expect(samples.length).toBe(100)
  const range = (point, axis) => Math.max(...samples.map(s => s.points[point][axis])) - Math.min(...samples.map(s => s.points[point][axis]))
  expect(samples.at(-1).x - samples[0].x).toBeGreaterThan(20)
  expect(range(0, 1)).toBeGreaterThan(.5)
  expect(range(1, 0)).toBeGreaterThan(.2)
  expect(data.reports).toEqual([])
  await page.screenshot({ path: info.outputPath('moving-push.png') })
  await page.keyboard.up('d')
})
