import { readFileSync } from 'node:fs'
import { test, expect } from './helpers/test.mjs'
import { finishJumpingEntrance, openLevelLink, unlockJumpingLevels } from './helpers/jumpingLevels.mjs'
import { advanceJumpingPassiveWait } from './helpers/simulation.mjs'

// A Bigger Swing: a short recorded medal route, and a 50 s D deadline.
const COURSE = 'd810f5f5-1a01-431f-804b-575b1b731a3d', FILE = '03.json'
const assets = new URL('../../public/levels/jumping/', import.meta.url)
const index = JSON.parse(readFileSync(new URL('index.json', assets), 'utf8'))
const recording = JSON.parse(readFileSync(new URL('../fixtures/jumping-builtin-medal-runs.json', import.meta.url))).runs.find(run => run.level === COURSE)

// Every other course is unlocked and passed, so this one opens with no record of its own.
test.beforeEach(async ({ page }) => {
  await unlockJumpingLevels(page, index.levels.map(name => JSON.parse(readFileSync(new URL(name, assets), 'utf8'))).filter(level => level.id !== COURSE))
})
const trials = page => page.evaluate(id => JSON.parse(localStorage.getItem('arcade.jumping.trials.v1') ?? '{}')[id] ?? null, COURSE)
async function pauseAnd(page, name) {
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name, exact: true }).click()
}

test('a linked course announces a first pass as a personal best, with its trial, once', async ({ page }) => {
  test.setTimeout(90000)
  await page.setViewportSize({ width: 852, height: 393 })
  await page.clock.install({ time: new Date('2026-10-09T12:00:00Z') })
  await openLevelLink(page, { file: FILE, query: '?renderControl=1', pauseAt: new Date('2026-10-09T13:00:00Z') })
  await finishJumpingEntrance(page)
  await page.clock.runFor(64)
  const finished = page.getByTestId('facility-notice').filter({ hasText: / passed\. / })
  let held = new Set()
  for (const { input, frames } of recording.trace) {
    const wanted = new Set([input.move > 0 ? 'd' : input.move < 0 ? 'a' : '', input.jump ? 'Space' : '',
      input.climb ? 'w' : '', input.crouch || input.descend ? 's' : '', input.detach ? 'x' : ''].filter(Boolean))
    for (const key of held) if (!wanted.has(key)) await page.keyboard.up(key)
    for (const key of wanted) if (!held.has(key)) await page.keyboard.down(key)
    held = wanted
    const milliseconds = Math.round(frames / 120 * 1000)
    if (!wanted.size && milliseconds > 500) await advanceJumpingPassiveWait(page, milliseconds)
    else await page.clock.runFor(milliseconds)
    if (await finished.count()) break
  }
  for (const key of held) await page.keyboard.up(key)
  for (let fade = 0; fade < 16 && !await finished.count(); fade++) await page.clock.runFor(64)
  // Returning to the facility by address keeps frames coming while it loads. The finish is handled
  // once, so the record just saved is not read back as the previous best.
  await page.clock.runFor(1000)
  await expect(finished).toHaveText(/^A Bigger Swing passed\. Grade A, [\d:.]+, personal best, trial 1\.$/)
  expect(await trials(page)).toEqual({ passes: 1, fails: 0, restarts: 0, first: 'pass', bestTry: 1 })
})

test('restarts, fails and leaving are logged as the try ended', async ({ page }) => {
  test.setTimeout(90000)
  await page.clock.install({ time: new Date('2026-10-09T12:00:00Z') })
  await openLevelLink(page, { file: FILE, pauseAt: new Date('2026-10-09T13:00:00Z') })
  await expect(page.locator('.jumping-game > canvas[role="img"]')).toBeFocused()
  await expect(page.locator('.jumping-game[aria-busy="true"]')).toHaveCount(0)
  // Restarting before the clock starts logs nothing.
  await page.clock.runFor(300)
  await expect(page.locator('.jumping-state')).toHaveText('Entering the level')
  await pauseAnd(page, 'Restart course')
  expect(await trials(page)).toBeNull()
  // Once it runs, Restart abandons the try.
  await finishJumpingEntrance(page); await page.clock.runFor(2000)
  await pauseAnd(page, 'Restart course')
  expect(await trials(page)).toEqual({ passes: 0, fails: 0, restarts: 1, first: 'restart', bestTry: null })
  // A try past D is a fail, however it then ends.
  await finishJumpingEntrance(page)
  await advanceJumpingPassiveWait(page, 52000)
  await expect(page.locator('.jumping-grade-status')).toContainText('Grade F')
  await pauseAnd(page, 'Restart course')
  expect(await trials(page)).toMatchObject({ fails: 1, restarts: 1 })
  // Leaving mid-try abandons it too.
  await finishJumpingEntrance(page); await page.clock.runFor(2000)
  await pauseAnd(page, 'Leave course')
  await expect.poll(() => trials(page)).toMatchObject({ passes: 0, fails: 1, restarts: 2 })
})
