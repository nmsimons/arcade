import { unlockJumpingLevels } from './helpers/jumpingLevels.mjs'
import { finishJumpingEntrance, openLevelLink } from './helpers/jumpingLevels.mjs'
import { test, expect } from './helpers/test.mjs'
import { advanceJumpingSimulation } from './helpers/simulation.mjs'
import { readFileSync } from 'node:fs'

// Level Five returns the robot to its door, in whichever facility area holds it, under whatever name.
const levels = new URL('../../public/levels/jumping/', import.meta.url)
const read = file => JSON.parse(readFileSync(new URL(encodeURIComponent(file), levels), 'utf8'))
const levelFive = read('05.json').id
const levelFiveArea = JSON.parse(readFileSync(new URL('index.json', levels), 'utf8')).levels.map(read)
  .find(level => level.kind === 'hub' && level.courseDoors.some(door => door.course === levelFive)).name

// These route regressions start from an already unlocked campaign.
test.beforeEach(async ({ page }) => { await unlockJumpingLevels(page) })

for (const frameOffset of [0, 24]) test(`Level Five accepts the ball-downhill shortcut with held-jump keyboard controls (frame offset ${frameOffset} ms)`, async ({ page }, info) => {
  // Run the full prop reaction and doorway entry with software-rendered frames.
  test.setTimeout(60000)
  await page.clock.install({ time: new Date('2026-10-05T12:00:00Z') })
  // Pause before the course starts so loading speed cannot advance the ball before the replay.
  await openLevelLink(page, { file: '05.json', query: '?renderControl=1', pauseAt: new Date('2026-10-05T13:00:00Z') })
  await finishJumpingEntrance(page)
  // Exercise different input phases within the 48 ms rendered-frame batches.
  if (frameOffset) await page.clock.runFor(frameOffset)
  await page.keyboard.down('d')
  await advanceJumpingSimulation(page, 2758)
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
  await page.keyboard.down('d'); await page.keyboard.down('w')
  await advanceJumpingSimulation(page, 6500)
  await page.keyboard.up('d'); await page.keyboard.up('w')
  // A campaign course returns the robot to its door, where the status announces the result.
  const notice = page.getByTestId('facility-notice')
  await expect(notice).toHaveText(/^Level Five passed\. Grade A, \d+:\d+\.\d+/)
  // Rendered input phases vary. Check the authored A deadline here; the
  // fixed-step simulation recording separately checks the exact recorded time.
  const [, minutes, seconds] = (await notice.innerText()).match(/Grade A, (\d+):(\d+\.\d+)/).map(Number)
  const elapsed = minutes * 60 + seconds
  expect(elapsed).toBeGreaterThan(0)
  expect(elapsed).toBeLessThanOrEqual(10)
  await expect(page.getByRole('img', { name: levelFiveArea, exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath('level-five-returned.png') })
})
