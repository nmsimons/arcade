import { test, expect } from './helpers/test.mjs'
import { useLevelFixtures, finishJumpingEntrance } from './helpers/jumpingLevels.mjs'
import { installDigitalClockSpy } from './helpers/digitalClock.mjs'
import { advanceJumpingPassiveWait } from './helpers/simulation.mjs'
import { blankTrial } from '../../src/games/jumping/level.ts'
import { BEST_TIME_KEY } from '../../src/games/jumping/challenge.ts'

const room = (id, name) => ({ ...blankTrial(), id, name, width: 900, entrance: { x: 60, y: 920 },
  goal: { x: 700, y: 920, flipX: true }, times: { a: .2, b: .4, c: .8, d: 4 }, timers: [{ x: 200, y: 780 }] })
const maps = () => [room('graded-one', 'First course'), room('graded-two', 'Secret machinery'), room('graded-three', 'Secret ending')]
async function open(page, levels = maps()) {
  await useLevelFixtures(page, levels)
  await installDigitalClockSpy(page)
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/lab')
  await expect(page.getByRole('button', { name: 'Play First course', exact: true })).toBeEnabled()
  await expect.poll(() => page.locator('.jumping-level-browser .level-thumbnail').first().evaluate(canvas => canvas.width)).toBeGreaterThan(1)
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
}
async function start(page) {
  await page.getByRole('button', { name: 'Play First course', exact: true }).click()
  await finishJumpingEntrance(page)
}
async function finish(page) {
  await page.keyboard.down('d'); await page.clock.runFor(2800); await page.keyboard.up('d')
  await expect(page.getByRole('dialog', { name: 'Level complete', exact: true })).toBeVisible()
}

test('a fresh picker shows only unlocked names and previews; direct links cannot skip a course', async ({ page }, info) => {
  await open(page)
  await expect(page.locator('.jumping-level-tile')).toHaveCount(3)
  await expect(page.locator('.jumping-locked-tile')).toHaveCount(2)
  await expect(page.getByText('Secret machinery', { exact: false })).toHaveCount(0)
  await expect(page.getByText('Secret ending', { exact: false })).toHaveCount(0)
  await expect(page.locator('.jumping-locked-tile canvas')).toHaveCount(0)
  await expect(page.getByRole('img', { name: 'Level 2: Locked', exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath('locked-courses.png') })
  await page.clock.resume(); await page.goto('/lab/levels/built-in/01-fixture.json')
  await expect(page.locator('.jumping-route-notice')).toContainText('That level is locked')
  await expect(page.getByRole('img', { name: 'Secret machinery: reach the exit', exact: true })).toHaveCount(0)
})

for (const storageAvailable of [true, false]) test(`a D run unlocks the next course with ${storageAvailable ? 'saved' : 'session'} progress`, async ({ page }) => {
  if (!storageAvailable) await page.addInitScript(() => {
    const set = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('arcade.jumping.')) throw new DOMException('Storage unavailable', 'QuotaExceededError')
      return set.call(this, key, value)
    }
  })
  await open(page); await start(page); await finish(page)
  const result = page.getByRole('dialog', { name: 'Level complete', exact: true })
  await expect(result.getByText('Grade D', { exact: true })).toBeVisible()
  await expect(result.getByRole('definition')).toHaveCount(4)
  await expect(result.getByRole('button', { name: 'Next level', exact: true })).toBeVisible()
  await result.getByRole('button', { name: 'Level menu', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Play Secret machinery', exact: true })).toBeEnabled()
  await expect(page.getByText('Secret ending', { exact: true })).toHaveCount(0)
  if (storageAvailable) {
    await page.clock.resume(); await page.reload()
    await expect(page.getByRole('button', { name: 'Play Secret machinery', exact: true })).toBeEnabled()
  }
})

test('F dims the zero timer and greys time pickups; exploring and finishing never unlocks the next course', async ({ page }, info) => {
  const levels = maps()
  levels[0].pickups = [
    { kind: 'time-bonus', seconds: 9, x: 250, y: 885 }, { kind: 'time-penalty', seconds: 9, x: 330, y: 885 },
    { kind: 'stopwatch', x: 410, y: 885 }, { kind: 'fast-stopwatch', x: 490, y: 885 }, { kind: 'coin', x: 570, y: 885 },
  ]
  await open(page, levels); await start(page)
  await advanceJumpingPassiveWait(page, 4500)
  await expect(page.locator('.jumping-grade-status')).toContainText('Grade F')
  const canvas = page.getByRole('img', { name: 'First course: reach the exit', exact: true })
  await expect.poll(() => canvas.evaluate(c => c.digitalClocks?.some(clock => clock.value === '00:00' && clock.color === '#56645a'))).toBe(true)
  await page.screenshot({ path: info.outputPath('failed-exploration.png') })
  await finish(page)
  const result = page.getByRole('dialog', { name: 'Level complete', exact: true })
  await expect(result.getByText('Grade F', { exact: true })).toBeVisible()
  await expect(result.getByRole('button', { name: 'Next level', exact: true })).toHaveCount(0)
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '{}')['graded-one'], BEST_TIME_KEY)).toBeGreaterThan(4)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('arcade.jumping.completed.v1') ?? '{}')['graded-one'])).toBeUndefined()
  await result.getByRole('button', { name: 'Level menu', exact: true }).click()
  await expect(page.getByRole('img', { name: 'Level 2: Locked', exact: true })).toBeVisible()
})
