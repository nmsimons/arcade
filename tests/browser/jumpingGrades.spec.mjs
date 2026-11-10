import { test, expect } from './helpers/test.mjs'
import { useLevelFixtures, finishJumpingEntrance, followLevelLink, openLevelLink } from './helpers/jumpingLevels.mjs'
import { installDigitalClockSpy } from './helpers/digitalClock.mjs'
import { advanceJumpingPassiveWait } from './helpers/simulation.mjs'
import { blankTrial } from '../../src/games/jumping/level.ts'
import { BEST_TIME_KEY } from '../../src/games/jumping/challenge.ts'

const room = (id, name) => ({ ...blankTrial(), id, name, width: 900, entrance: { x: 60, y: 920 },
  goal: { x: 700, y: 920, flipX: true }, times: { a: .2, b: .4, c: .8, d: 4 }, timers: [{ x: 200, y: 780 }] })
const maps = () => [room('graded-one', 'First course'), room('graded-two', 'Secret machinery'), room('graded-three', 'Secret ending')]
const area = (id, name, courseDoors, bulkheads) => ({ version: 1, id, name, kind: 'hub', timing: 'untimed', width: 1800, height: 920, floor: 920,
  entrance: { x: 200, y: 920 }, platforms: [], checkpoints: [], climbables: { ladders: [], ropes: [] }, props: [], mechanisms: [], triggers: [], robots: [],
  courseDoors, bulkheads, evaluationBoards: [] })
// A hall, where a new game wakes, opens onto one wing of three courses, each behind a door that opens once the one before it is passed.
const wing = area('graded-wing', 'Graded wing', [{ id: 'door-one', x: 500, y: 920, course: 'graded-one', targets: ['door-two'] },
  { id: 'door-two', x: 900, y: 920, course: 'graded-two', power: 'switched', targets: ['door-three'] },
  { id: 'door-three', x: 1300, y: 920, course: 'graded-three', power: 'switched' }], [{ id: 'wing-to-hall', x: 1600, y: 920, to: 'graded-hall' }])
const hall = area('graded-hall', 'Graded hall', [], [{ id: 'hall-to-wing', x: 900, y: 920, to: wing.id }])
const campaign = { version: 3, start: hall.id }
// The fixtures load in order: 00 is the first course, 01 the second, 02 the third.
const link = index => `0${index}-fixture.json`

/** Opens the first course by its link in a facility of one wing. */
async function open(page, levels = maps()) {
  await useLevelFixtures(page, [...levels, wing, hall])
  await page.route('**/levels/jumping-campaign.json', route => route.fulfill({ json: campaign }))
  await installDigitalClockSpy(page)
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await openLevelLink(page, { file: link(0), query: '?renderControl=1', pauseAt: new Date('2026-01-01T01:00:00Z') })
}
async function start(page) {
  await finishJumpingEntrance(page)
  await expect(page.getByRole('img', { name: 'First course: reach the exit', exact: true })).toBeFocused()
}
/** Runs to the exit; the course returns the robot to its door, and the status announces the result. */
async function finish(page) {
  await page.keyboard.down('d'); await page.keyboard.down('w'); await page.clock.runFor(2800); await page.keyboard.up('d'); await page.keyboard.up('w')
  const notice = page.getByTestId('facility-notice')
  await expect(notice).toHaveText(/^First course (passed|not passed)\. /)
  await expect(page.getByRole('img', { name: 'Graded wing', exact: true })).toBeVisible()
  // Returning to the door goes straight back to play, without the start screen.
  await expect(page.getByRole('dialog')).toHaveCount(0)
  return notice
}
/** An open link plays the course. The paused clock advances while it opens. */
async function expectPlaying(page, name) {
  const course = page.getByRole('img', { name: `${name}: reach the exit`, exact: true })
  await expect.poll(async () => { await page.clock.runFor(32); return course.count() }, { timeout: 30000 }).toBe(1)
}
/** A refused link opens the facility, whose start screen gives the reason. The paused clock advances while it travels. */
async function expectRefused(page, name) {
  const start = page.getByRole('dialog', { name: 'Game start', exact: true })
  await expect.poll(async () => { await page.clock.runFor(32); return start.count() }, { timeout: 30000 }).toBe(1)
  await expect(start.getByRole('status')).toHaveText(`${name} is locked. Pass the courses before it in its wing to open its door.`)
  await expect(page.getByRole('img', { name: `${name}: reach the exit`, exact: true })).toHaveCount(0)
}

test('a fresh save opens only the first course; direct links cannot skip a course', async ({ page }, info) => {
  await open(page); await start(page)
  await page.screenshot({ path: info.outputPath('first-course.png') })
  await followLevelLink(page, link(1), '?renderControl=1')
  await expectRefused(page, 'Secret machinery')
  await followLevelLink(page, link(2), '?renderControl=1')
  await expectRefused(page, 'Secret ending')
})

for (const storageAvailable of [true, false]) test(`a D run opens the next course with ${storageAvailable ? 'saved' : 'session'} progress`, async ({ page }) => {
  if (!storageAvailable) await page.addInitScript(() => {
    const set = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('arcade.jumping.')) throw new DOMException('Storage unavailable', 'QuotaExceededError')
      return set.call(this, key, value)
    }
  })
  await open(page); await start(page)
  await expect(await finish(page)).toHaveText(/^First course passed\. Grade D, /)
  await followLevelLink(page, link(1), '?renderControl=1')
  await expectPlaying(page, 'Secret machinery')
  await followLevelLink(page, link(2), '?renderControl=1')
  await expectRefused(page, 'Secret ending')
  if (storageAvailable) {
    await page.clock.resume(); await page.goto(`/lab/levels/built-in/${link(1)}?renderControl=1`)
    await expect(page.getByRole('img', { name: 'Secret machinery: reach the exit', exact: true })).toBeVisible()
  }
})

test('F dims the zero timer and greys time pickups; exploring and finishing never opens the next course', async ({ page }, info) => {
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
  await expect(await finish(page)).toHaveText(/^First course not passed\. /)
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '{}')['graded-one'], BEST_TIME_KEY)).toBeGreaterThan(4)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('arcade.jumping.completed.v1') ?? '{}')['graded-one'])).toBeUndefined()
  await followLevelLink(page, link(1), '?renderControl=1')
  await expectRefused(page, 'Secret machinery')
})
