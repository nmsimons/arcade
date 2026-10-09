import { test, expect } from './helpers/folderTest.mjs'
import { blankTrial } from '../../src/games/jumping/level.ts'
import { installTestFolder, saveTestLevel, reopenTestLevel, selectBuilderObject, useLevelFixtures } from './helpers/jumpingLevels.mjs'

test('plates, balls, lifts and coin displays nudge to both boundaries and survive save/reopen', async ({ page }, info) => {
  const level = blankTrial(); level.spawn.x = 500
  level.props = [{ kind: 'ball', x: 20, y: 920, size: 30 }, { kind: 'ball', x: 1780, y: 920, size: 30 }]
  level.mechanisms = [{ id: 'left-lift', kind: 'lift', x: 5, y: 500, w: 140, h: 20, travel: 180 },
    { id: 'right-lift', kind: 'lift', x: 1655, y: 500, w: 140, h: 20, travel: 180 }]
  level.triggers = [{ mode: 'weight', x: 5, y: 920, w: 100, targets: [] }, { mode: 'weight', x: 1695, y: 920, w: 100, targets: [] },
    { mode: 'coins', display: 'digital', x: 5, y: 200, w: 120, threshold: 3, targets: [] },
    { mode: 'coins', display: 'digital', x: 1675, y: 200, w: 120, threshold: 3, targets: [] }]
  level.pickups = [300, 400, 500].map(x => ({ kind: 'coin', x, y: 300 }))
  await useLevelFixtures(page, [level]); await installTestFolder(page, { 'edge-placement.json': level })
  await page.goto('/untitled-jumping-game')
  await page.getByRole('button', { name: 'Level studio', exact: true }).click()
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  const local = page.getByRole('dialog').getByRole('button', { name: 'Local folder', exact: true })
  if (await local.count()) await local.click()
  await page.getByRole('button', { name: 'Choose folder', exact: true }).click()
  await page.getByRole('button', { name: 'Open edge-placement.json', exact: true }).click()
  const canvas = page.getByRole('application', { name: 'Level canvas' })
  await expect(canvas).toHaveAttribute('aria-busy', 'false')
  for (const [selection, right] of [['trigger:0', false], ['trigger:1', true], ['prop:0', false], ['prop:1', true],
    ['mechanism:0', false], ['mechanism:1', true], ['trigger:2', false], ['trigger:3', true]]) {
    await selectBuilderObject(page, selection); await canvas.focus()
    await page.keyboard.press(right ? 'ArrowRight' : 'ArrowLeft')
    await page.keyboard.press(right ? 'ArrowRight' : 'ArrowLeft')
  }
  const verify = value => {
    expect(value.props.map(p => p.x)).toEqual([15, 1785])
    expect(value.mechanisms.map(m => m.x)).toEqual([0, 1660])
    expect(value.triggers.map(t => t.x)).toEqual([0, 1700, 0, 1680])
  }
  await page.getByRole('tab', { name: 'Level', exact: true }).click()
  const width = page.getByRole('spinbutton', { name: 'Level width', exact: true })
  await width.fill('1801'); await width.press('Enter'); await expect(width).toHaveValue('1801')
  await width.fill('1800'); await width.press('Enter'); await expect(width).toHaveValue('1800')
  const saved = await saveTestLevel(page); verify(saved.level)
  await page.screenshot({ path: info.outputPath('saved-boundary-placement.png') })
  await page.reload(); await reopenTestLevel(page, saved)
  verify((await saveTestLevel(page)).level)
  await page.screenshot({ path: info.outputPath('reopened-boundary-placement.png') })
})
