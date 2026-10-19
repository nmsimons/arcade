import { readFileSync } from 'node:fs'
import { test, expect } from './helpers/test.mjs'
import { useLevelFixtures, finishJumpingEntrance } from './helpers/jumpingLevels.mjs'

const lab2 = JSON.parse(readFileSync(new URL('../../public/levels/jumping/LAB2.jump-level.json', import.meta.url), 'utf8'))

test('LAB2 crate powers the plate, releases it when pushed, and presses again after restart', async ({ page }, info) => {
  // The full night-mode route and restart render in software on CI.
  test.setTimeout(180000)
  await page.setViewportSize({ width: 960, height: 600 })
  await useLevelFixtures(page, [lab2])
  await page.addInitScript(() => {
    const fillRect = CanvasRenderingContext2D.prototype.fillRect
    CanvasRenderingContext2D.prototype.fillRect = function (...args) {
      if (args[0] === 2040 && args[2] === 80 && args[3] === 3 && ['#9bb878', '#c4a66b'].includes(this.fillStyle))
        window.lab2Plate = { color: this.fillStyle, top: args[1] }
      return fillRect.apply(this, args)
    }
  })
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/lab')
  const play = page.getByRole('button', { name: `Play ${lab2.name}`, exact: true })
  await expect(play).toBeEnabled()
  // Keep slow browser calls from adding held-key frames between route steps.
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await play.click()
  await finishJumpingEntrance(page)
  await page.clock.runFor(500)
  await expect.poll(() => page.evaluate(() => window.lab2Plate?.color)).toBe('#9bb878')
  await page.keyboard.down('ArrowRight'); await page.clock.runFor(80 * 1000 / 120)
  await page.keyboard.down('Space'); await page.clock.runFor(200); await page.keyboard.up('Space')
  await page.clock.runFor(230 * 1000 / 120)
  await page.keyboard.down('Space'); await page.clock.runFor(200); await page.keyboard.up('Space')
  await page.clock.runFor(1500); await page.keyboard.up('ArrowRight')
  await page.keyboard.down('ArrowUp'); await page.clock.runFor(750); await page.keyboard.up('ArrowUp')
  await page.keyboard.down('ArrowRight'); await page.clock.runFor(166 * 1000 / 120)
  await page.clock.runFor(1000); await page.keyboard.up('ArrowRight')
  await expect.poll(() => page.evaluate(() => window.lab2Plate)).toEqual({ color: '#c4a66b', top: 453 })
  await page.screenshot({ path: info.outputPath('lab2-crate-releases-plate.png') })
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Restart level', exact: true }).click()
  await finishJumpingEntrance(page); await page.clock.runFor(500)
  await expect.poll(() => page.evaluate(() => window.lab2Plate?.color)).toBe('#9bb878')
})
