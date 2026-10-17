import { writeFile } from 'node:fs/promises'
import { test, expect } from './helpers/test.mjs'
import { finishJumpingEntrance, useLevelFixtures } from './helpers/jumpingLevels.mjs'
import { blankTrial } from '../../src/games/jumping/level.ts'

for (const direction of [-1, 1]) for (const pace of ['walk', 'run', 'crouch']) test(`a keyboard ${pace} gathers the hands before pushing (${direction})`, async ({ page }, info) => {
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
  if (pace === 'walk') await page.keyboard.down('Shift')
  if (pace === 'crouch') await page.keyboard.down('s')
  await page.keyboard.down(key)
  for (const gap of [100, 65, 45]) {
    let frame
    for (let i = 0; i < 120; i++) {
      await page.clock.runFor(8)
      frame = await page.evaluate(() => window.jumpingMotion.read().recent.at(-1))
      if ((face - frame.x) * direction <= gap) break
    }
    expect((face - frame.x) * direction).toBeLessThanOrEqual(gap)
    expect(frame.signals.push).toBeNull()
    expect(frame.signals.grounded).toBe(true)
    expect(frame.points[0][0]).toBeLessThan(20)
    stages.push({ gap, frame })
    await page.screenshot({ path: info.outputPath(`approach-${gap}.png`) })
  }
  await page.clock.runFor(300)
  const recent = await page.evaluate(() => window.jumpingMotion.read().recent)
  const loaded = recent.filter(frame => frame.signals.push)
  expect(loaded.length).toBeGreaterThan(5)
  const first = recent.findIndex(frame => frame.signals.push)
  expect(first).toBeGreaterThan(0)
  const before = recent[first - 1], contact = recent[first]
  for (const index of [4, 6]) expect(Math.hypot(
    contact.x + contact.points[index][0] * direction - before.x - before.points[index][0] * direction,
    contact.y + contact.points[index][1] - before.y - before.points[index][1],
  )).toBeLessThan(10)
  for (const frame of loaded) frame.contacts.hands.forEach((hand, i) => {
    const palm = frame.contacts.palms[i]
    expect(Math.hypot(hand.x - palm.x - palm.nx * 1.6, hand.y - palm.y - palm.ny * 1.6)).toBeLessThan(.5)
  })
  await page.keyboard.up(key)
  if (pace === 'walk') await page.keyboard.up('Shift')
  if (pace === 'crouch') await page.keyboard.up('s')
  await writeFile(info.outputPath('approach.json'), JSON.stringify({ direction, pace, stages, before, contact, loaded }, null, 2))
})
