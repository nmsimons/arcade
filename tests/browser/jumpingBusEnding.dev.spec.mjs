import { test, expect } from './helpers/test.mjs'
import { readFileSync } from 'node:fs'
import { finishJumpingEntrance, useLevelFixtures } from './helpers/jumpingLevels.mjs'

const exit = JSON.parse(readFileSync(new URL('../../public/levels/jumping/exit.jump-level.json', import.meta.url), 'utf8'))

test('Exit plays its bus payoff, pauses, resumes the scene, and completes after departure', async ({ page }, info) => {
  test.setTimeout(120000)
  const level = { ...structuredClone(exit), entrance: { x: 19720, y: 2320 } }
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await useLevelFixtures(page, [level])
  await page.clock.install({ time: new Date('2026-10-29T12:00:00Z') })
  await page.goto('/lab')
  const play = page.getByRole('button', { name: 'Play Exit', exact: true })
  await expect(play).toBeEnabled(); await page.clock.pauseAt(new Date('2026-10-29T13:00:00Z'))
  await play.click(); await finishJumpingEntrance(page)
  await page.keyboard.down('ArrowRight')
  const status = page.getByRole('status', { name: 'Bus departure', exact: true })
  // Bound simulation travel rather than a five-second wall-clock poll: full
  // lighting is slower in CI's software renderer, while the route is identical.
  for (let elapsed = 0; elapsed < 8000 && !await status.count(); elapsed += 100) await page.clock.runFor(100)
  await expect(status).toHaveCount(1)
  await page.keyboard.up('ArrowRight')
  expect(await page.evaluate(id => JSON.parse(localStorage.getItem('arcade.jumping.completed.v1'))[id], level.id)).toBe(true)
  await expect(status).toHaveText('Settling into the back seat')
  await page.keyboard.press('Escape')
  const paused = page.getByRole('dialog', { name: 'Game paused', exact: true })
  await expect(paused).toBeVisible(); await page.clock.runFor(6000)
  await paused.getByRole('button', { name: /^Resume/ }).click()
  await page.clock.runFor(100)
  await expect(status).toHaveText('Settling into the back seat')
  await page.screenshot({ path: info.outputPath('bus-rear-window.png') })
  await page.clock.runFor(2700)
  await expect(status).toHaveText('Riding away')
  await page.screenshot({ path: info.outputPath('bus-departure.png') })
  await page.clock.runFor(8000)
  await expect(page.getByRole('dialog', { name: 'Level complete', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  test(`shared bus preview frames at ${viewport.width}px`, async ({ page }, info) => {
    await page.setViewportSize(viewport)
    await page.goto('/lab/ending-review')
    await expect(page.getByRole('status', { name: 'Bus goal review' })).toHaveText('Walk right to board')
    await page.getByRole('button', { name: 'Departure preview', exact: true }).click()
    const slider = page.getByRole('slider', { name: 'Scene time', exact: true })
    await expect(slider).toBeVisible()
    await expect.poll(() => slider.inputValue()).not.toBe('0')
    for (const [name, time] of [['rear-window', .9], ['leaving', 4.2], ['wheel-alignment', 4.55], ['lowering', 5.3], ['dropping', 5.7], ['gone', 8.1]]) {
      await slider.fill(String(time))
      await page.waitForTimeout(100)
      await page.screenshot({ path: info.outputPath(`ending-${name}.png`) })
    }
  })
}

test('the review page lets the player walk aboard using normal controls', async ({ page }, info) => {
  await page.clock.install({ time: new Date('2026-10-29T12:00:00Z') })
  await page.goto('/lab/ending-review')
  const status = page.getByRole('status', { name: 'Bus goal review' })
  await expect(status).toHaveText('Walk right to board')
  await page.clock.pauseAt(new Date('2026-10-29T13:00:00Z'))
  await page.screenshot({ path: info.outputPath('playable-bus-approach.png') })
  await page.keyboard.down('ArrowRight'); await page.clock.runFor(3500); await page.keyboard.up('ArrowRight')
  await expect(status).toHaveText('Settling into the back seat')
  await page.screenshot({ path: info.outputPath('playable-bus-boarded.png') })
  await page.clock.runFor(3000); await expect(status).toHaveText('Riding away')
  expect(await page.evaluate(() => localStorage.getItem('arcade.jumping.completed.v1'))).toBeNull()
})
