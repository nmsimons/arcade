import { test, expect } from './helpers/test.mjs'
import { useLevelFixtures } from './helpers/jumpingLevels.mjs'
import { proneDropLevel } from '../helpers/jumpingProneScenarios.mjs'

for (const direction of [-1, 1]) for (const kind of ['wall', 'undercut']) {
  test(`normal long fall clears ${kind}, catches or recovers and departs: direction=${direction}`, async ({ page }, info) => {
    const level = { ...proneDropLevel(kind, direction), name: `Prone ${kind}` }
    const errors = []; page.on('pageerror', error => errors.push(error.message))
    await useLevelFixtures(page, [level])
    await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
    await page.goto('/untitled-jumping-game?motionDebug=1')
    const play = page.getByRole('button', { name: `Play Prone ${kind}`, exact: true })
    await expect(play).toBeEnabled()
    await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
    await play.click(); await page.clock.runFor(64)
    const sample = () => page.evaluate(() => window.jumpingMotion.read().recent.at(-1))
    await expect(page.locator('canvas[tabindex="0"]')).toBeFocused()
    const key = direction > 0 ? 'd' : 'a'
    await page.keyboard.down('Shift'); await page.keyboard.down(key)
    await page.clock.runFor(1400)
    await page.keyboard.up(key); await page.keyboard.up('Shift')
    await page.clock.runFor(900)
    expect((await sample()).blends.fall).toBe(1)
    expect((await sample()).signals.mode).toBe('fall')
    await page.screenshot({ path: info.outputPath('prone-approach.png') })
    await page.clock.runFor(1700)
    if (kind === 'undercut') {
      expect((await sample()).signals.mode).toBe('hang')
      await page.screenshot({ path: info.outputPath('prone-caught.png') })
      await page.keyboard.down('x'); await page.clock.runFor(100); await page.keyboard.up('x')
      expect((await sample()).signals.mode).not.toBe('hang')
      await page.clock.runFor(1500)
    } else {
      expect((await sample()).signals.grounded).toBe(true)
      await page.screenshot({ path: info.outputPath('prone-recovery.png') })
      await page.clock.runFor(1500)
    }
    expect((await sample()).signals.grounded).toBe(true)
    await page.keyboard.down('Space'); await page.clock.runFor(64); await page.keyboard.up('Space')
    expect((await sample()).vy).toBeLessThan(0)
    expect((await sample()).signals.grounded).toBe(false)
    expect(errors).toEqual([])
  })
}
