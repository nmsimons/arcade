import { test, expect } from './helpers/test.mjs'
import { finishJumpingEntrance, installBuiltInFixtures, useLevelFixtures } from './helpers/jumpingLevels.mjs'
import { advanceJumpingSimulation } from './helpers/simulation.mjs'
import { blankTrial, newLevel } from '../../src/games/jumping/level.ts'
import { BEST_TIME_KEY, formatTime } from '../../src/games/jumping/challenge.ts'

const level = (id, name) => ({ ...blankTrial(), id, name, times: { gold: 10, silver: 20, bronze: 30 } })
const card = (page, name) => page.getByRole('button', { name: new RegExp(`^Level \\d+: ${name}$`) })

test('picker shows saved medals and best times on every timed level, including zero and negative times', async ({ page }, info) => {
  const maps = ['Gold', 'Silver', 'Bronze', 'Completed', 'Zero', 'Bonus', 'Unplayed'].map(name => level(name, name))
  maps.push({ ...newLevel(), id: 'playground', name: 'Playground' })
  await useLevelFixtures(page, maps)
  await page.addInitScript(({ key, records }) => localStorage.setItem(key, JSON.stringify(records)), {
    key: BEST_TIME_KEY, records: { Gold: 10, Silver: 20, Bronze: 30, Completed: 35.67, Zero: 0, Bonus: -2.5, Invalid: '5' },
  })
  await page.goto('/lab')
  await expect(page.locator('.jumping-level-detail')).toHaveCount(0)
  await expect(page.locator('.jumping-medal-times')).toHaveCount(0)
  for (const [name, description] of [
    ['Gold', 'Best 0:10.00 Grade A'], ['Silver', 'Best 0:20.00 Grade B'], ['Bronze', 'Best 0:30.00 Grade C'],
    ['Completed', 'Best 0:35.67 Grade D'], ['Unplayed', 'Best — Not graded'], ['Zero', 'Best 0:00.00 Grade A'],
    ['Bonus', 'Best -0:02.50 Grade A'],
  ]) await expect(card(page, name)).toHaveAccessibleDescription(description)
  await expect(card(page, 'Playground').locator('.jumping-level-progress')).toHaveCount(0)
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport)
    await card(page, 'Silver').scrollIntoViewIfNeeded()
    const layout = await card(page, 'Silver').evaluate(el => {
      const progress = el.querySelector('.jumping-level-progress').getBoundingClientRect()
      const actions = el.closest('.jumping-level-tile').querySelector('.jumping-level-tile-actions').getBoundingClientRect()
      return { overflow: el.scrollWidth > el.clientWidth, overlap: progress.bottom > actions.top }
    })
    expect(layout).toEqual({ overflow: false, overlap: false })
    await page.screenshot({ path: info.outputPath(`picker-progress-${viewport.width}.png`) })
  }
})

for (const storageAvailable of [true, false]) test(`a completed run updates the picker when storage is ${storageAvailable ? 'available' : 'unavailable'}`, async ({ page }) => {
  const map = { ...level('finish-record', 'Finish room'), width: 800, entrance: { x: 40, y: 920 }, goal: { x: 600, y: 920, flipX: true } }
  await useLevelFixtures(page, [map])
  if (!storageAvailable) await page.addInitScript(key => {
    const write = Storage.prototype.setItem
    Storage.prototype.setItem = function (name, value) {
      if (name === key) throw new DOMException('Storage unavailable', 'QuotaExceededError')
      return write.call(this, name, value)
    }
  }, BEST_TIME_KEY)
  await page.clock.install({ time: new Date('2026-10-12T12:00:00Z') })
  await page.goto('/lab')
  await expect(card(page, 'Finish room')).toHaveAccessibleDescription('Best — Not graded')
  await card(page, 'Finish room').click()
  await expect(page.getByRole('img', { name: 'Finish room: reach the exit', exact: true })).toBeFocused()
  await page.clock.pauseAt(new Date('2026-10-12T13:00:00Z'))
  await finishJumpingEntrance(page)
  await page.keyboard.down('d')
  await advanceJumpingSimulation(page, 4500)
  await page.keyboard.up('d')
  const complete = page.getByRole('dialog', { name: 'Level complete', exact: true })
  await expect(complete).toBeVisible()
  await expect(complete.getByText('Grade A', { exact: true })).toBeVisible()
  await expect(complete.getByRole('definition')).toHaveCount(4)
  const finishTime = await complete.locator('.jumping-result-time').innerText()
  if (!storageAvailable) await expect(complete.getByRole('status')).toContainText('Your time is kept for this visit')
  await complete.getByRole('button', { name: 'Level menu', exact: true }).click()
  await expect(card(page, 'Finish room')).toHaveAccessibleDescription(`Best ${finishTime} Grade A`)
  if (storageAvailable) {
    const records = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), BEST_TIME_KEY)
    expect(formatTime(records[map.id])).toBe(finishTime)
    await page.clock.resume()
    await page.reload()
    await expect(card(page, 'Finish room')).toHaveAccessibleDescription(`Best ${finishTime} Grade A`)
  }
})
