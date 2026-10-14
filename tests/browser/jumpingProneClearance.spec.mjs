import { test, expect } from './helpers/test.mjs'
import { finishJumpingEntrance, useLevelFixtures } from './helpers/jumpingLevels.mjs'
import { proneColumnDropLevel, proneDropLevel } from '../helpers/jumpingProneScenarios.mjs'

for (const direction of [-1, 1]) for (const kind of ['wall', 'thin wall', 'undercut', 'moving gate']) {
  test(`normal long fall clears ${kind}, catches or recovers and departs: direction=${direction}`, async ({ page }, info) => {
    const level = { ...proneDropLevel(kind, direction), name: `Prone ${kind}` }
    if (kind === 'moving gate') Object.assign(level.mechanisms[0], { y: 950, h: 800, travel: 800 })
    const errors = []; page.on('pageerror', error => errors.push(error.message))
    await useLevelFixtures(page, [level])
    await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
    await page.goto('/lab?motionDebug=1')
    const play = page.getByRole('button', { name: `Play Prone ${kind}`, exact: true })
    await expect(play).toBeEnabled()
    await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
    await play.click(); await finishJumpingEntrance(page); await page.clock.runFor(64)
    const sample = () => page.evaluate(() => window.jumpingMotion.read().recent.at(-1))
    await expect(page.locator('canvas[tabindex="0"]')).toBeFocused()
    const key = direction > 0 ? 'd' : 'a'
    await page.keyboard.down('Shift'); await page.keyboard.down(key)
    await page.clock.runFor(1400)
    await page.keyboard.up(key); await page.keyboard.up('Shift')
    await page.clock.runFor(900)
    if (kind === 'moving gate') expect((await sample()).signals.mode).toBe('hang')
    else {
      expect((await sample()).blends.fall).toBe(1)
      expect((await sample()).signals.mode).toBe('fall')
    }
    await page.screenshot({ path: info.outputPath('prone-approach.png') })
    await page.clock.runFor(1700)
    if (kind !== 'wall' && kind !== 'thin wall') {
      expect((await sample()).signals.mode).toBe('hang')
      await page.screenshot({ path: info.outputPath('prone-caught.png') })
      await page.keyboard.down('x'); await page.clock.runFor(100); await page.keyboard.up('x')
      expect((await sample()).signals.mode).not.toBe('hang')
      await page.clock.runFor(kind === 'moving gate' ? 3000 : 1500)
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

for (const direction of [-1, 1]) {
  test(`released long fall away from a thin column retains its flat landing: direction=${direction}`, async ({ page }, info) => {
    const level = { ...proneColumnDropLevel(direction), name: 'Released prone fall' }
    const errors = []; page.on('pageerror', error => errors.push(error.message))
    await useLevelFixtures(page, [level])
    await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
    await page.goto('/lab?motionDebug=1')
    const play = page.getByRole('button', { name: 'Play Released prone fall', exact: true })
    await expect(play).toBeEnabled()
    await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
    await play.click(); await finishJumpingEntrance(page); await page.clock.runFor(64)
    const sample = () => page.evaluate(() => window.jumpingMotion.read().recent.at(-1))
    const key = direction > 0 ? 'd' : 'a'
    await page.keyboard.down('Shift'); await page.keyboard.down(key)
    let approach
    for (let frame = 0; frame < 250; frame++) {
      await page.clock.runFor(16); approach = await sample()
      if (approach.y >= 1800) break
    }
    expect(approach.signals.grounded).toBe(false)
    expect(approach.blends.fall).toBe(1)
    await page.keyboard.up(key); await page.keyboard.up('Shift')
    let impact
    for (let frame = 0; frame < 30; frame++) {
      await page.clock.runFor(16); impact = await sample()
      if (impact.signals.grounded) break
    }
    expect(impact.input.move).toBe(0)
    expect(Math.abs(impact.vx)).toBeGreaterThan(20)
    expect(impact.signals.mode).toBe('get-up')
    await page.clock.runFor(120)
    const flat = await sample()
    expect(flat.signals.mode).toBe('get-up')
    expect(Math.abs(flat.points[1][1] - flat.points[0][1])).toBeLessThan(2)
    expect(flat.contacts.feet.every(foot => !foot.planted)).toBe(true)
    await page.screenshot({ path: info.outputPath('released-flat-impact.png') })
    await page.clock.runFor(1000)
    expect((await sample()).signals.mode).toBe('free')
    expect((await sample()).signals.grounded).toBe(true)
    expect(errors).toEqual([])
  })
}
