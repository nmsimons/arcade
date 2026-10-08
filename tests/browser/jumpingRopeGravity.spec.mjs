import { test, expect } from './helpers/test.mjs'
import { useLevelFixtures } from './helpers/jumpingLevels.mjs'
import { reverseRopeWorkshop as fixture } from './helpers/jumpingRopeGravity.mjs'
import { advanceJumpingPassiveWait } from './helpers/simulation.mjs'

async function open(page, level) {
  await useLevelFixtures(page, [level])
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/untitled-jumping-game?motionDebug=1')
  await expect(page.locator('.jumping-level-card[aria-pressed=true]')).toBeVisible()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.locator('.jumping-level-card[aria-pressed=true]').click()
  await expect(page.locator('canvas')).toBeFocused()
  await page.clock.runFor(64)
}
const sample = page => page.evaluate(() => window.jumpingMotion.read().recent.at(-1))

for (const release of ['jump', 'let go']) test(`normal controls catch a floating rope from the ceiling, climb both ways and ${release}`, async ({ page }, info) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message))
  await open(page, fixture())
  await page.keyboard.down('d'); await page.clock.runFor(20); await page.keyboard.up('d')
  await advanceJumpingPassiveWait(page, 3500)
  expect((await sample(page)).signals.inverted).toBe(true); expect((await sample(page)).signals.grounded).toBe(true)
  await page.keyboard.down('ArrowDown'); await page.clock.runFor(900); await page.keyboard.up('ArrowDown')
  const lower = await sample(page)
  expect(lower.signals.mode).toBe('rope'); expect(lower.signals.inverted).toBe(true); expect(lower.y).toBeGreaterThan(40)
  await page.keyboard.down('ArrowUp'); await page.clock.runFor(250); await page.keyboard.up('ArrowUp')
  expect((await sample(page)).signals.mode).toBe('rope'); expect((await sample(page)).y).toBeLessThan(lower.y - 10)
  await page.clock.runFor(200)
  await page.screenshot({ path: info.outputPath(`reverse-rope-${release.replaceAll(' ', '-')}.png`) })
  const before = await sample(page)
  await page.keyboard.down(release === 'jump' ? 'Space' : 'x'); await page.clock.runFor(32)
  const after = await sample(page)
  expect(after.signals.mode).toBe('free')
  if (release === 'jump') expect(after.vy).toBeGreaterThan(400)
  else expect(Math.abs(after.vy - before.vy)).toBeLessThan(80)
  await page.clock.runFor(100); expect((await sample(page)).signals.mode).toBe('free')
  await page.keyboard.up(release === 'jump' ? 'Space' : 'x')
  expect(errors).toEqual([])
})

test('an upright airborne catch turns smoothly around the rope hands under reverse gravity', async ({ page }, info) => {
  await open(page, fixture('ceiling'))
  await page.keyboard.down('d'); await page.clock.runFor(20); await page.keyboard.up('d')
  await page.clock.runFor(350)
  let s = await sample(page); expect(s.signals.mode).toBe('rope'); expect(s.blends.gravityTurn).toBeGreaterThan(.1)
  await page.screenshot({ path: info.outputPath('reverse-rope-turn.png') })
  await page.clock.runFor(450)
  s = await sample(page); expect(s.signals.mode).toBe('rope'); expect(s.signals.inverted).toBe(true)
  const recent = await page.evaluate(() => window.jumpingMotion.read().recent)
  for (let i = 1; i < recent.length; i++) expect(Math.hypot(recent[i].x - recent[i - 1].x, recent[i].y - recent[i - 1].y)).toBeLessThan(12)
  await page.screenshot({ path: info.outputPath('reverse-rope-holding.png') })
})
