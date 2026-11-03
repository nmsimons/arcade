import { test, expect } from './helpers/test.mjs'
import { blankTrial, levelProblems } from '../../src/games/jumping/level.ts'
import { installBuiltInFixtures, useLevelFixtures, waitForBuilderPreview, selectBuilderObject, selectBuilderOption, saveTestLevel, reopenTestLevel } from './helpers/jumpingLevels.mjs'

test('a course becomes a facility area with level doors, bulkheads and a board, then a course again', async ({ page }, info) => {
  test.setTimeout(90000)
  const annex = { ...blankTrial(), name: 'Annex', goal: { name: 'Way out', x: 1500, y: 920 } }
  const target = { ...blankTrial(), name: 'Target course' }
  await useLevelFixtures(page, [annex, target]); await installBuiltInFixtures(page, { 'annex.json': annex, 'target.json': target })
  await page.goto('/lab')
  await page.getByRole('button', { name: 'Level studio', exact: true }).click()
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: 'Open annex.json', exact: true }).click()
  await waitForBuilderPreview(page)
  const doorTool = page.getByRole('button', { name: 'Level door', exact: true })
  await expect(doorTool, 'doors belong in facility areas').toHaveCount(0)

  // The exit becomes a bulkhead to the concourse.
  await page.getByRole('tab', { name: 'Level', exact: true }).click()
  await selectBuilderOption(page, 'Level type', 'hub')
  await expect(page.getByRole('combobox', { name: 'Level type', exact: true })).toHaveText('Facility area · doors and bulkheads')
  await expect(page.getByRole('button', { name: 'Coin', exact: true }), 'timing equipment stays in courses').toHaveCount(0)
  await selectBuilderObject(page, 'bulkhead:0')
  await expect(page.getByRole('combobox', { name: 'Bulkhead destination', exact: true })).toHaveText('Concourse')

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
  expect(saved.level).toMatchObject({ kind: 'hub', timing: 'untimed', bulkheads: [{ name: 'Way out', to: 'concourse' }], courseDoors: [{ course: target.id, y: 920 }] })
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
