import { readFileSync } from 'node:fs'
import { test, expect } from './helpers/test.mjs'
import { useLevelFixtures } from './helpers/jumpingLevels.mjs'

const fixture = JSON.parse(readFileSync(new URL('../fixtures/jumping/ball-beside-box.json', import.meta.url), 'utf8'))

for (const size of [80, 120, 160]) for (const direction of [-1, 1]) {
  test(`standing on a ball beside a ${size}-unit box keeps a coherent reach, direction ${direction}`, async ({ page }, info) => {
    const level = structuredClone(fixture)
    level.props[1].size = size; level.props[1].x = 520 + size / 2
    if (direction < 0) {
      level.spawn.x = level.width - level.spawn.x; level.goal.x = level.width - level.goal.x
      level.goal.flipX = true
      for (const prop of level.props) prop.x = level.width - prop.x
    }
    await useLevelFixtures(page, [level])
    const errors = []; page.on('pageerror', error => errors.push(error.message))
    await page.clock.install({ time: new Date('2026-10-10T00:00:00Z') })
    await page.goto('/untitled-jumping-game?motionDebug=1')
    const play = page.getByRole('button', { name: 'Play Ball beside box', exact: true })
    await expect(play).toBeEnabled()
    await page.clock.pauseAt(new Date('2026-10-10T01:00:00Z'))
    await play.click(); await page.clock.runFor(128)
    await expect(page.locator('canvas[tabindex="0"]')).toBeFocused()
    const key = direction > 0 ? 'd' : 'a'
    // Mount the ball from the floor with ordinary run/jump controls, release
    // both inputs, and establish a quiet curved support before approaching.
    await page.keyboard.down(key); await page.keyboard.down('Space')
    await page.clock.runFor(160); await page.keyboard.up('Space')
    await page.clock.runFor(640); await page.keyboard.up(key)
    await page.clock.runFor(1000)
    const state = () => page.evaluate(() => window.jumpingMotion.read().recent.at(-1))
    await info.attach('mount-motion', { body: JSON.stringify(await page.evaluate(() => window.jumpingMotion.read().recent)), contentType: 'application/json' })
    expect((await state()).signals.support).toBe('prop:0')
    await page.screenshot({ path: info.outputPath('standing-on-ball.png') })
    await page.keyboard.down(key)
    const samples = []
    for (const ms of [32, 32, 64, 128, 256]) {
      await page.clock.runFor(ms)
      const sample = await state(); samples.push(sample)
      await page.screenshot({ path: info.outputPath(`approach-${samples.length}.png`) })
    }
    const supported = samples.filter(sample => sample.signals.support === 'prop:0')
    expect(supported.length).toBeGreaterThanOrEqual(2)
    for (const sample of supported) {
      const [hip, shoulder] = sample.points
      expect(Math.atan2(shoulder[0] - hip[0], hip[1] - shoulder[1])).toBeLessThan(1)
      for (const palm of sample.contacts.palms) expect(sample.y - palm.y).toBeGreaterThanOrEqual(12)
    }
    if (size === 80) expect(supported.every(sample => !sample.signals.push)).toBe(true)
    if (size === 160) expect(supported.some(sample => sample.signals.push === 'prop:1')).toBe(true)
    await page.keyboard.up(key)
    await page.clock.runFor(1000)
    expect((await state()).blends.push).toBe(0)
    expect(errors).toEqual([])
    await info.attach('ball-box-motion', { body: JSON.stringify(samples, null, 2), contentType: 'application/json' })
  })
}
