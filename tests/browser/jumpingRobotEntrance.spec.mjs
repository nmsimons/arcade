import { test, expect } from './helpers/test.mjs'
import { useLevelFixtures, restartFromPause } from './helpers/jumpingLevels.mjs'
import { installAthleteHeadObserver } from './helpers/athleteHead.mjs'
import { blankTrial } from '../../src/games/jumping/level.ts'
import { ROBOT_PALETTE } from '../../src/games/jumping/equipmentPalette.ts'
import { androidMaterials } from '../../src/games/jumping/androidArtwork.ts'

test('Rbot emerges alongside the player, pauses and replays on restart before hunting', async ({ page }, info) => {
  const level = { ...blankTrial(), width: 1000, height: 600, floor: 500,
    entrance: { x: 200, y: 500 }, goal: { x: 850, y: 500, id: 'exit', power: 'switched' },
    robots: [{ kind: 'repulsor', x: 650, y: 500, left: 26, right: 974 }] }
  await useLevelFixtures(page, [level])
  await installAthleteHeadObserver(page, ['#686b6e', '#e5e7e6', ROBOT_PALETTE.body])
  await page.addInitScript(botInk => {
    window.rbotEntrance = { heads: [], playerHeads: [], doors: [] }
    window.addEventListener('jumping-athlete-head', ({ detail: { body, alpha, ink } }) => {
      const heads = ink === botInk ? window.rbotEntrance.heads : window.rbotEntrance.playerHeads
      heads.push({ x: body.e, alpha })
    })
    const rect = CanvasRenderingContext2D.prototype.fillRect
    CanvasRenderingContext2D.prototype.fillRect = function (...args) {
      if (this.canvas.matches?.('canvas[tabindex]') && this.fillStyle === '#000000' && args[3] === 80)
        window.rbotEntrance.doors.push({ center: args[0] + args[2] / 2, width: args[2] })
      return rect.apply(this, args)
    }
  }, androidMaterials(ROBOT_PALETTE.body).face)
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/lab')
  const card = page.locator('.jumping-level-card[aria-pressed=true]')
  await expect(card).toBeVisible()
  await expect.poll(() => card.locator('canvas').evaluate(c => c.width)).toBeGreaterThan(1)
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await card.click(); await expect(page.locator('canvas[tabindex="0"]')).toBeFocused()
  await page.clock.runFor(200)
  const first = await page.evaluate(() => window.rbotEntrance.heads.at(-1))
  expect(first.alpha).toBeGreaterThan(0); expect(first.alpha).toBeLessThan(1)
  await expect(page.getByTestId('level-time')).toHaveText('0:00.00')
  expect(await page.evaluate(() => [...new Set(window.rbotEntrance.doors.map(d => d.center))])).toEqual([200, 650])
  await page.screenshot({ path: info.outputPath('rbot-portal-reveal.png') })
  await page.keyboard.press('Escape'); await page.clock.runFor(500)
  expect(await page.evaluate(() => window.rbotEntrance.heads.at(-1))).toEqual(first)
  await page.getByRole('button', { name: 'Resume', exact: true }).click()
  await page.clock.runFor(500)
  const planted = await page.evaluate(() => window.rbotEntrance.heads.at(-1))
  expect(planted.alpha).toBe(1); expect(planted.x).toBeLessThan(first.x - 2)
  await page.screenshot({ path: info.outputPath('rbot-portal-step.png') })
  await page.clock.runFor(500)
  expect(await page.evaluate(() => window.rbotEntrance.doors.filter(d => d.center === 650).at(-1).width)).toBeLessThan(40)
  await page.clock.runFor(300)
  await expect(page.getByTestId('level-time')).not.toHaveText('0:00.00')
  const playerX = await page.evaluate(() => window.rbotEntrance.playerHeads.at(-1).x)
  await page.clock.runFor(1200)
  expect(await page.evaluate(() => window.rbotEntrance.playerHeads.at(-1).x)).toBeLessThan(playerX - 10)
  await restartFromPause(page, false)
  await page.clock.runFor(200)
  await expect(page.getByTestId('level-time')).toHaveText('0:00.00')
  expect(await page.evaluate(() => window.rbotEntrance.heads.at(-1).alpha)).toBeLessThan(1)
})
