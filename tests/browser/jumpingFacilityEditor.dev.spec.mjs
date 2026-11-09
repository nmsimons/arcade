import { test, expect } from './helpers/test.mjs'
import { blankTrial, levelProblems } from '../../src/games/jumping/level.ts'
import { finishJumpingEntrance, installBuiltInFixtures, useLevelFixtures, waitForBuilderPreview, selectBuilderObject, selectBuilderOption, saveTestLevel, reopenTestLevel, openBuilderSection } from './helpers/jumpingLevels.mjs'

// A facility area for bulkheads to lead to; they name it by its level ID.
const hall = { version: 1, id: 'test-concourse', name: 'Concourse', kind: 'hub', timing: 'untimed', width: 1800, height: 920, floor: 920,
  entrance: { x: 300, y: 920 }, platforms: [], checkpoints: [], climbables: { ladders: [], ropes: [] }, props: [], mechanisms: [], triggers: [], robots: [],
  courseDoors: [], bulkheads: [{ id: 'back', x: 600, y: 920, to: 'playtest-area' }], evaluationBoards: [] }

test('a facility area playtest ends at the door the robot takes and returns to the builder', async ({ page }) => {
  test.setTimeout(90000)
  // The robot starts in the bulkhead's doorway, so a fresh Up leads straight through.
  const area = { version: 1, id: 'playtest-area', name: 'Annex area', kind: 'hub', timing: 'untimed', width: 1800, height: 920, floor: 920,
    entrance: { x: 600, y: 920 }, platforms: [], checkpoints: [], climbables: { ladders: [], ropes: [] }, props: [], mechanisms: [], triggers: [], robots: [],
    courseDoors: [], bulkheads: [{ id: 'way-out', x: 600, y: 920, to: hall.id }], evaluationBoards: [] }
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
  // Named as the facility shows it: by where it leads, not by its saved name.
  await expect(dialog.getByRole('status')).toHaveText('Left through the bulkhead to Concourse.')
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
  expect(saved.level).toMatchObject({ kind: 'hub', timing: 'untimed', bulkheads: [{ to: hall.id }], courseDoors: [{ course: target.id, y: 920 }] })
  // A bulkhead goes by where it leads, so the exit's name stayed behind.
  expect(saved.level.bulkheads[0].name).toBeUndefined()
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
  await expect(page.getByRole('textbox', { name: 'Object name', exact: true })).toHaveValue('')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await page.getByRole('tab', { name: 'Level', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Level type', exact: true })).toHaveText('Facility area · doors and bulkheads')
})

test('level doors are switches: a passed door and a grade average wire the next door and a bulkhead', async ({ page }, info) => {
  test.setTimeout(90000)
  const first = { ...blankTrial(), name: 'First course' }, second = { ...blankTrial(), name: 'Second course' }
  const wing = { ...hall, id: 'wired-wing', name: 'Wired wing', bulkheads: [{ id: 'wing-out', x: 1400, y: 920, to: hall.id }],
    courseDoors: [{ id: 'door-first', x: 500, y: 920, course: first.id }, { id: 'door-second', x: 900, y: 920, course: second.id }] }
  await useLevelFixtures(page, [wing, first, second, hall]); await installBuiltInFixtures(page, { 'wing.json': wing, 'first.json': first, 'second.json': second, 'hall.json': hall })
  await page.goto('/lab/library')
  await page.getByRole('button', { name: 'Level studio', exact: true }).click()
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: 'Open wing.json', exact: true }).click()
  await waitForBuilderPreview(page)

  // Doors and bulkheads go by what the facility shows on them: where they lead.
  const selected = page.getByRole('combobox', { name: 'Selected object', exact: true })
  await selectBuilderObject(page, 'course-door:1')
  await expect(selected).toHaveText('Second course · Level door 2')
  await expect(page.getByRole('textbox', { name: 'Object name', exact: true }), 'no name of its own').toHaveCount(0)
  await expect(page.getByText('Named in the facility by where it leads.', { exact: true })).toBeVisible()
  await selectBuilderObject(page, 'bulkhead:0')
  await expect(selected).toHaveText('Concourse · Bulkhead 1')
  // Doors and bulkheads open always, or like a switched exit.
  await selectBuilderObject(page, 'course-door:1')
  await expect(page.getByRole('combobox', { name: 'Level door power', exact: true })).toHaveText('Always open')
  await selectBuilderOption(page, 'Level door power', 'switched')
  await selectBuilderObject(page, 'bulkhead:0')
  await selectBuilderOption(page, 'Bulkhead power', 'switched')
  // A bulkhead is a switch too, on once the area beyond is complete.
  await openBuilderSection(page, 'Connections')
  await page.getByRole('group', { name: 'Activates', exact: true }).getByRole('checkbox', { name: 'Second course · Level door 2', exact: true }).check()

  // Passing the first door's level opens the second.
  await selectBuilderObject(page, 'course-door:0')
  await openBuilderSection(page, 'Connections')
  await page.getByRole('group', { name: 'Activates', exact: true }).getByRole('checkbox', { name: 'Second course · Level door 2', exact: true }).check()
  await expect(page.locator('.builder-inspector summary[aria-label="Wall wiring"]'), 'a door has no wall wiring').toHaveCount(0)

  // A grade average of both doors opens the bulkhead at a B.
  await page.getByRole('button', { name: 'Grade average', exact: true }).click()
  const canvas = page.getByRole('application', { name: 'Level canvas' }), bounds = await canvas.boundingBox()
  await page.mouse.click(bounds.x + bounds.width * .5, bounds.y + bounds.height * .25)
  await selectBuilderOption(page, 'Grade average reaches', 'b')
  const averages = page.getByRole('group', { name: 'Averages', exact: true })
  for (const door of ['First course · Level door 1', 'Second course · Level door 2']) await averages.getByRole('checkbox', { name: door, exact: true }).check()
  await openBuilderSection(page, 'Connections')
  await page.getByRole('group', { name: 'Activates', exact: true }).getByRole('checkbox', { name: 'Concourse · Bulkhead 1', exact: true }).check()
  await page.screenshot({ path: info.outputPath('grade-average.png') })
  await expect(page.locator('.builder-inspector summary[aria-label="Wall wiring"]'), 'invisible during play, so no wall wiring').toHaveCount(0)

  // Both wiring directions show the same connections.
  await selectBuilderObject(page, 'course-door:1')
  await openBuilderSection(page, 'Connections')
  const switchedBy = page.getByRole('group', { name: 'Switched by', exact: true })
  await expect(switchedBy.getByRole('checkbox', { name: 'First course · Level door 1 · Passed', exact: true })).toBeChecked()
  await expect(switchedBy.getByRole('checkbox', { name: 'Second course · Level door 2 · Passed', exact: true }), 'never by itself').toHaveCount(0)
  await expect(switchedBy.getByRole('checkbox', { name: 'Concourse · Bulkhead 1 · Complete', exact: true })).toBeChecked()
  await expect(page.getByRole('group', { name: 'Grade averages', exact: true }).getByRole('checkbox', { name: 'Grade average 1', exact: true })).toBeChecked()
  await expect(page.getByRole('alert')).toHaveCount(0)

  const saved = await saveTestLevel(page)
  expect(saved.level.courseDoors).toMatchObject([{ id: 'door-first', targets: ['door-second'] }, { id: 'door-second', power: 'switched' }])
  expect(saved.level.bulkheads).toMatchObject([{ id: 'wing-out', power: 'switched', targets: ['door-second'] }])
  expect(saved.level.gradeGates).toMatchObject([{ grade: 'b', doors: ['door-first', 'door-second'], targets: ['wing-out'] }])
  expect(levelProblems(saved.level)).toEqual([])
})
