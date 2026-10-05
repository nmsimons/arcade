import { test, expect } from './helpers/test.mjs'
import { advanceJumpingSimulation } from './helpers/simulation.mjs'

test('Level Five accepts the ball-downhill shortcut with held-jump keyboard controls', async ({ page }, info) => {
  // Run the full prop reaction and doorway entry with software-rendered frames.
  test.setTimeout(60000)
  await page.clock.install({ time: new Date('2026-10-05T12:00:00Z') })
  await page.goto('/untitled-jumping-game/levels/built-in/05.json')
  const canvas = page.getByRole('img', { name: 'Level Five: reach the exit', exact: true })
  await expect(canvas).toBeFocused()
  await page.clock.pauseAt(new Date('2026-10-05T13:00:00Z'))
  await page.keyboard.down('d')
  await advanceJumpingSimulation(page, 2292)
  await page.keyboard.down('Space')
  await advanceJumpingSimulation(page, 100)
  await page.keyboard.up('Space')
  await advanceJumpingSimulation(page, 858)
  await page.screenshot({ path: info.outputPath('level-five-bracing.png') })
  // Send the ball beyond the crest, then return to the gate while it rolls.
  await page.keyboard.up('d')
  await page.keyboard.down('a')
  await advanceJumpingSimulation(page, 750)
  await page.keyboard.up('a')
  await page.keyboard.down('d')
  await advanceJumpingSimulation(page, 6500)
  await page.keyboard.up('d')
  const complete = page.getByRole('dialog', { name: 'Level complete', exact: true })
  await expect(complete).toBeVisible()
  await expect(complete.getByText('Gold medal', { exact: true })).toBeVisible()
  // Input is sampled on rendered frames (48 ms here), whose initial phase can
  // differ across browsers. The simulation recording checks exactly 9.00 s.
  const [minutes, seconds] = (await complete.locator('.jumping-result-time').innerText()).split(':').map(Number)
  expect(Math.abs(minutes * 60 + seconds - 9)).toBeLessThanOrEqual(.05)
  await expect(complete.locator('.jumping-result-targets')).toHaveText('Gold0:10Silver0:15Bronze0:30')
  await page.screenshot({ path: info.outputPath('level-five-complete.png') })
})
