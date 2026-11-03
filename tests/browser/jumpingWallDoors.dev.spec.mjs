import { test, expect } from './helpers/test.mjs'
import { blankTrial, levelProblems } from '../../src/games/jumping/level.ts'
import { installBuiltInFixtures, useLevelFixtures, waitForBuilderPreview, selectBuilderOption, saveTestLevel } from './helpers/jumpingLevels.mjs'

test('blocked doors are placed as wall art and restyled in the studio', async ({ page }, info) => {
  test.setTimeout(90000)
  // Every condition in both frames, so the screenshot reviews the whole set.
  const wallDoors = ['sealed', 'jammed', 'boarded', 'caved-in'].flatMap((condition, i) => [
    { x: 240 + i * 180, y: 920, condition }, { x: 1000 + i * 180, y: 920, condition, frame: 'bulkhead', ...(i % 2 ? { flipX: true } : {}) }])
  const level = { ...blankTrial(), name: 'Blocked doors', width: 1800, wallDoors, entrance: { x: 120, y: 920 }, goal: { x: 1720, y: 920, flipX: true } }
  await useLevelFixtures(page, [level]); await installBuiltInFixtures(page, { 'blocked.json': level })
  await page.goto('/lab')
  await page.getByRole('button', { name: 'Level studio', exact: true }).click()
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: 'Open blocked.json', exact: true }).click()
  await waitForBuilderPreview(page)
  await page.getByRole('application', { name: 'Level canvas' }).screenshot({ path: info.outputPath('blocked-doors.png') })

  await page.getByRole('button', { name: 'Blocked door', exact: true }).click()
  const canvas = page.getByRole('application', { name: 'Level canvas' }), bounds = await canvas.boundingBox()
  await page.mouse.click(bounds.x + bounds.width * .5, bounds.y + bounds.height * .4)
  await page.getByRole('button', { name: 'Place on surface', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Blocked door condition', exact: true })).toHaveText('Jammed')
  await selectBuilderOption(page, 'Blocked door condition', 'caved-in')
  await selectBuilderOption(page, 'Blocked door frame', 'bulkhead')
  await expect(page.getByRole('combobox', { name: 'Selected object', exact: true })).toHaveText('Caved in bulkhead 9')
  const saved = await saveTestLevel(page)
  expect(saved.level.wallDoors).toHaveLength(9)
  expect(saved.level.wallDoors[8]).toMatchObject({ y: 920, condition: 'caved-in', frame: 'bulkhead' })
  expect(levelProblems(saved.level)).toEqual([])
})
