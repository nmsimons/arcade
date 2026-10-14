import { writeFile } from 'node:fs/promises'
import { test, expect } from './helpers/test.mjs'
import { finishJumpingEntrance, useLevelFixtures } from './helpers/jumpingLevels.mjs'
import { blankTrial } from '../../src/games/jumping/level.ts'

for (const direction of [-1, 1]) test(`a keyboard approach prepares nearby arms without pulling the body toward the crate (${direction})`, async ({ page }, info) => {
  const face = direction === 1 ? 500 : 580
  const level = { ...blankTrial(), entrance: { x: face - direction * 160, y: 920 },
    props: [{ kind: 'box', x: 540, y: 920, size: 80 }] }
  await useLevelFixtures(page, [level])
  await page.clock.install({ time: new Date('2026-10-14T12:00:00Z') })
  await page.goto('/lab?motionDebug=1')
  await expect(page.locator('.jumping-level-card[aria-pressed=true]')).toBeVisible()
  await page.clock.pauseAt(new Date('2026-10-14T13:00:00Z'))
  await page.locator('.jumping-level-card[aria-pressed=true]').click()
  await finishJumpingEntrance(page); await page.clock.runFor(64)
  const key = direction === 1 ? 'd' : 'a', stages = []
  await page.keyboard.down('Shift'); await page.keyboard.down(key)
  for (const gap of [65, 45, 41]) {
    let frame
    for (let i = 0; i < 120; i++) {
      await page.clock.runFor(8)
      frame = await page.evaluate(() => window.jumpingMotion.read().recent.at(-1))
      if ((face - frame.x) * direction <= gap) break
    }
    expect((face - frame.x) * direction).toBeLessThanOrEqual(gap)
    expect(frame.signals.push).toBeNull()
    expect(frame.signals.grounded).toBe(true)
    expect(frame.points[2][0]).toBeLessThan(15)
    expect(frame.points[0][0]).toBeLessThan(4)
    stages.push({ gap, frame })
    await page.screenshot({ path: info.outputPath(`approach-${gap}.png`) })
  }
  await page.clock.runFor(300)
  const loaded = await page.evaluate(() => window.jumpingMotion.read().recent.filter(frame => frame.signals.push))
  expect(loaded.length).toBeGreaterThan(5)
  for (const frame of loaded) frame.contacts.hands.forEach((hand, i) => {
    const palm = frame.contacts.palms[i]
    expect(Math.hypot(hand.x - palm.x - palm.nx * 1.6, hand.y - palm.y - palm.ny * 1.6)).toBeLessThan(.5)
  })
  await page.keyboard.up(key); await page.keyboard.up('Shift')
  await writeFile(info.outputPath('approach.json'), JSON.stringify({ direction, stages, loaded }, null, 2))
})
