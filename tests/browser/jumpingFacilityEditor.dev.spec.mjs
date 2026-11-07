import { test, expect } from './helpers/test.mjs'
import { blankTrial, levelProblems } from '../../src/games/jumping/level.ts'
import { finishJumpingEntrance, installBuiltInFixtures, useLevelFixtures, waitForBuilderPreview, selectBuilderObject, selectBuilderOption, saveTestLevel, reopenTestLevel } from './helpers/jumpingLevels.mjs'

// A facility area for bulkheads to lead to; they name it by its level ID.
const hall = { version: 1, id: 'test-concourse', name: 'Concourse', kind: 'hub', timing: 'untimed', width: 1800, height: 920, floor: 920,
  entrance: { x: 300, y: 920 }, platforms: [], checkpoints: [], climbables: { ladders: [], ropes: [] }, props: [], mechanisms: [], triggers: [], robots: [],
  courseDoors: [], bulkheads: [{ id: 'back', x: 600, y: 920, to: 'playtest-area' }], evaluationBoards: [] }

test('a facility area playtest ends at the door the robot takes and returns to the builder', async ({ page }) => {
  test.setTimeout(90000)
  // The robot starts in the bulkhead's doorway, so a fresh Up leads straight through.
  const area = { version: 1, id: 'playtest-area', name: 'Annex area', kind: 'hub', timing: 'untimed', width: 1800, height: 920, floor: 920,
    entrance: { x: 600, y: 920 }, platforms: [], checkpoints: [], climbables: { ladders: [], ropes: [] }, props: [], mechanisms: [], triggers: [], robots: [],
    courseDoors: [], bulkheads: [{ id: 'way-out', name: 'Way out', x: 600, y: 920, to: hall.id }], evaluationBoards: [] }
  await useLevelFixtures(page, [area, hall]); await installBuiltInFixtures(page, { 'area.json': area, 'hall.json': hall })
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/lab/library')
  await page.getByRole('button', { name: 'Level studio', exact: true }).click()
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: 'Open area.json', exact: true }).click()
  await waitForBuilderPreview(page)
  await page.getByRole('button', { name: 'Save and Test', exact: true }).click()
  await expect(page.getByRole('img', { name: 'Annex area', exact: true })).toBeFocused()
  await finishJumpingEntrance(page)
  await page.keyboard.down('ArrowUp'); await page.clock.runFor(150); await page.keyboard.up('ArrowUp'); await page.clock.runFor(1500)
  const dialog = page.getByRole('dialog', { name: 'Door taken', exact: true })
  await expect(dialog).toContainText('Test complete.')
  await expect(dialog.getByRole('status')).toHaveText('Left through Way out, which leads to Concourse.')
  await dialog.getByRole('button', { name: 'Return to builder', exact: true }).click()
  await expect(page.getByRole('application', { name: 'Level canvas' })).toBeVisible()
})

test('a course becomes a facility area with level doors, bulkheads and a board, then a course again', async ({ page }, info) => {
  test.setTimeout(90000)
  const annex = { ...blankTrial(), name: 'Annex', goal: { name: 'Way out', x: 1500, y: 920 } }
  const target = { ...blankTrial(), name: 'Target course' }
  await useLevelFixtures(page, [annex, target, hall]); await installBuiltInFixtures(page, { 'annex.json': annex, 'target.json': target, 'hall.json': hall })
  await page.goto('/lab/library')
  await page.getByRole('button', { name: 'Level studio', exact: true }).click()
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: 'Open annex.json', exact: true }).click()
  await waitForBuilderPreview(page)
  const doorTool = page.getByRole('button', { name: 'Level door', exact: true })
  await expect(doorTool, 'doors belong in facility areas').toHaveCount(0)

  // The exit becomes a bulkhead, leading to any facility area in the collection.
  await page.getByRole('tab', { name: 'Level', exact: true }).click()
  await selectBuilderOption(page, 'Level type', 'hub')
  await expect(page.getByRole('combobox', { name: 'Level type', exact: true })).toHaveText('Facility area · doors and bulkheads')
  await expect(page.getByRole('button', { name: 'Coin', exact: true }), 'timing equipment stays in courses').toHaveCount(0)
  await selectBuilderObject(page, 'bulkhead:0')
  const bulkheadDestination = page.getByRole('combobox', { name: 'Bulkhead destination', exact: true })
  await expect(bulkheadDestination).toHaveText('Choose a facility area')
  // Only facility areas are listed: not the courses, and not this level.
  await bulkheadDestination.click()
  const areas = page.getByRole('listbox', { name: 'Bulkhead destination', exact: true })
  await expect(areas.getByRole('option')).toHaveText(['Choose a facility area', 'Concourse'])
  await areas.locator(`[role=option][data-value=${JSON.stringify(hall.id)}]`).click()
  await expect(bulkheadDestination).toHaveText('Concourse')

  // A new level door snaps onto the floor and leads to a chosen level.
  await doorTool.click()
  const canvas = page.getByRole('application', { name: 'Level canvas' }), bounds = await canvas.boundingBox()
  await page.mouse.click(bounds.x + bounds.width * .35, bounds.y + bounds.height * .5)
  await page.getByRole('button', { name: 'Place on surface', exact: true }).click()
  const destination = page.getByRole('combobox', { name: 'Level door destination', exact: true })
  await expect(destination).toHaveText('Choose a level')
  await selectBuilderOption(page, 'Level door destination', target.id)
  await expect(destination).toHaveText('Target course')
  await page.getByRole('button', { name: 'Evaluation board', exact: true }).click()
  await page.mouse.click(bounds.x + bounds.width * .55, bounds.y + bounds.height * .2)
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('facility-area-editor.png') })

  const saved = await saveTestLevel(page)
  expect(saved.level).toMatchObject({ kind: 'hub', timing: 'untimed', bulkheads: [{ name: 'Way out', to: hall.id }], courseDoors: [{ course: target.id, y: 920 }] })
  expect(saved.level.goal).toBeUndefined()
  expect(saved.level.evaluationBoards).toHaveLength(1)
  expect(levelProblems(saved.level)).toEqual([])
  await page.reload(); await reopenTestLevel(page, saved)
  await selectBuilderObject(page, 'course-door:0')
  await expect(destination).toHaveText('Target course')

  // Back to a course: the first bulkhead becomes the exit; Undo restores the facility area.
  await page.getByRole('tab', { name: 'Level', exact: true }).click()
  await selectBuilderOption(page, 'Level type', 'course')
  await selectBuilderObject(page, 'goal:0')
  await expect(page.getByRole('textbox', { name: 'Object name', exact: true })).toHaveValue('Way out')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await page.getByRole('tab', { name: 'Level', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Level type', exact: true })).toHaveText('Facility area · doors and bulkheads')
})
