import { unlockJumpingLevels } from './helpers/jumpingLevels.mjs'
import { test, expect } from './helpers/test.mjs'
import { finishJumpingEntrance, installBuiltInFixtures, useLevelFixtures } from './helpers/jumpingLevels.mjs'
import { advanceJumpingSimulation } from './helpers/simulation.mjs'
import { blankTrial, newLevel } from '../../src/games/jumping/level.ts'
import { BEST_TIME_KEY, formatTime } from '../../src/games/jumping/challenge.ts'

const level = (id, name) => ({ ...blankTrial(), id, name, times: { gold: 10, silver: 20, bronze: 30 } })
const card = (page, name) => page.getByRole('button', { name: new RegExp(`^Level \\d+: ${name}$`) })

test('repair warnings keep tile actions stable while selecting and editing an unfinished level', async ({ page }) => {
  const unfinished = { ...level('repair-warning-room', 'Repair room'), goal: { x: 500, y: 150 } }
  const ready = level('ready-warning-room', 'Ready room')
  await useLevelFixtures(page, [ready, unfinished])
  await unlockJumpingLevels(page, [ready])
  await installBuiltInFixtures(page, {
    '00-fixture.json': ready, '01-fixture.json': unfinished,
    'index.json': { version: 1, order: 'listed', levels: ['00-fixture.json', '01-fixture.json'] },
  })
  await page.goto('/lab')
  const readyCard = card(page, 'Ready room')
  const edit = page.getByRole('button', { name: 'Edit Repair room', exact: true })
  await expect(readyCard).toHaveAttribute('aria-pressed', 'true')
  const before = await edit.boundingBox()
  await edit.focus()
  await expect(page.getByRole('region', { name: 'Level issues for Repair room' })).toBeVisible()
  expect(await edit.boundingBox()).toEqual(before)
  await readyCard.focus()
  await edit.click()
  await expect(page.getByRole('textbox', { name: 'Level name', exact: true })).toHaveValue('Repair room')
})
