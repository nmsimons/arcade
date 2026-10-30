import { readFile } from 'node:fs/promises'
import { test, expect } from './helpers/test.mjs'
import { finishJumpingEntrance, useLevelFixtures } from './helpers/jumpingLevels.mjs'

for (const side of [-1, 1]) {
  test(`keyboard catches a downhill lip and pulls into a slide, side ${side}`, async ({ page }, info) => {
    const level = JSON.parse(await readFile(new URL('../fixtures/jumping/downhill-lip.json', import.meta.url), 'utf8'))
    if (side < 0) {
      for (const shape of level.platforms) {
        shape.x = level.width - shape.x - shape.w
        if (shape.polygon) shape.polygon = shape.polygon.map(([x, y]) => [shape.w - x, y])
      }
      level.entrance.x = level.width - level.entrance.x
      level.goal.x = level.width - level.goal.x; level.goal.flipX = true
    }
    const errors = []; page.on('pageerror', error => errors.push(error.message))
    await useLevelFixtures(page, [level])
    await page.clock.install({ time: new Date('2026-10-28T12:00:00Z') })
    await page.goto('/lab?motionDebug=1')
    const play = page.getByRole('button', { name: `Play ${level.name}`, exact: true })
    await expect(play).toBeEnabled(); await page.clock.pauseAt(new Date('2026-10-28T13:00:00Z'))
    await play.click(); await finishJumpingEntrance(page); await page.clock.runFor(64)
    await expect(page.locator('canvas[tabindex="0"]')).toBeFocused()
    const state = () => page.evaluate(() => window.jumpingMotion.read().recent.at(-1))
    const toward = side > 0 ? 'd' : 'a'
    await page.keyboard.down(toward); await page.keyboard.down('Space')
    await page.clock.runFor(64); await page.keyboard.up('Space')
    let caught
    for (let frame = 0; frame < 50; frame++) {
      await page.clock.runFor(32); caught = await state()
      if (caught.signals.mode === 'hang') break
    }
    await page.keyboard.up(toward)
    expect(caught.signals.mode).toBe('hang')
    await page.clock.runFor(640)
    const quiet = await state(), edgeX = side > 0 ? 600 : 680
    expect(quiet.signals.mode).toBe('hang'); expect(quiet.vx).toBe(0); expect(quiet.vy).toBe(0)
    expect(quiet.x).toBeCloseTo(edgeX - 14 * side, 5); expect(quiet.y).toBeCloseTo(354, 5)
    await page.screenshot({ path: info.outputPath('downhill-grip.png') })
    await page.keyboard.down('ArrowUp'); await page.clock.runFor(960); await page.keyboard.up('ArrowUp')
    const samples = await page.evaluate(() => window.jumpingMotion.read().recent)
    expect(samples.some(s => s.signals.mode === 'mantle')).toBe(true)
    expect(samples.some(s => s.signals.sliding)).toBe(true)
    expect((await state()).signals.mode).not.toBe('hang')
    expect(errors).toEqual([])
    await page.screenshot({ path: info.outputPath('downhill-pull-up.png') })
  })
}
