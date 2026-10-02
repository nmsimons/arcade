import { test, expect } from './helpers/folderTest.mjs'
import { installTestFolder, useLevelFixtures } from './helpers/jumpingLevels.mjs'
import { tap } from './helpers/controller.mjs'
import { blankTrial } from '../../src/games/jumping/level.ts'

const button = (page, name) => page.getByRole('button', { name, exact: true })
const field = (page, name) => page.getByRole('spinbutton', { name, exact: true })
async function open(page) {
  const level = blankTrial()
  await useLevelFixtures(page, [level]); await installTestFolder(page, { 'navigation.json': level })
  await page.addInitScript(() => {
    window.testPad = { index: 0, id: 'Navigation controller', connected: true, mapping: 'standard', axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [window.testPad] })
  })
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/untitled-jumping-game'); await button(page, 'Level studio').click()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z')); await page.clock.runFor(64)
  await button(page, 'Library').click(); await button(page, 'Choose folder').click()
  await button(page, 'Open navigation.json').click(); await page.clock.runFor(200)
  await expect(page.getByRole('application', { name: 'Level canvas' })).toHaveAttribute('aria-busy', 'false')
}
async function stick(page, x, y) {
  await page.evaluate(({ x, y }) => { window.testPad.axes = [x, y, 0, 0] }, { x, y }); await page.clock.runFor(64)
  await page.evaluate(() => { window.testPad.axes = [0, 0, 0, 0] }); await page.clock.runFor(64)
}

test('keyboard, D-pad and left stick follow palette rows and columns without edge wrapping', async ({ page }) => {
  await open(page)
  const terrain = button(page, 'Terrain'), rope = button(page, 'Rope'), ladder = button(page, 'Ladder')
  for (const move of [key => page.keyboard.press(key), key => tap(page, { ArrowUp: 12, ArrowDown: 13, ArrowLeft: 14, ArrowRight: 15 }[key]),
    key => stick(page, key === 'ArrowLeft' ? -1 : key === 'ArrowRight' ? 1 : 0, key === 'ArrowUp' ? -1 : key === 'ArrowDown' ? 1 : 0)]) {
    await terrain.focus(); await page.clock.runFor(64)
    await move('ArrowLeft'); await expect(terrain).toBeFocused()
    await move('ArrowRight'); await expect(button(page, 'Steps narrow')).toBeFocused()
    await move('ArrowLeft'); await expect(terrain).toBeFocused()
    await move('ArrowDown'); await expect(rope).toBeFocused()
    await move('ArrowRight'); await expect(ladder).toBeFocused()
    await move('ArrowDown'); await expect(button(page, 'Box')).toBeFocused()
    await move('ArrowUp'); await expect(ladder).toBeFocused()
    await move('ArrowLeft'); await expect(rope).toBeFocused()
    await move('ArrowUp'); await expect(terrain).toBeFocused()
    const last = button(page, 'Wall text'); await last.focus(); await page.clock.runFor(64)
    await move('ArrowDown'); await expect(last).toBeFocused()
  }
  await expect(button(page, 'Undo')).toBeDisabled()
})

test('arrows navigate fields until Enter starts editing, then apply or cancel returns to navigation', async ({ page }, info) => {
  await open(page)
  const width = field(page, 'Level width'), height = field(page, 'Level height'), initial = Number(await width.inputValue())
  const name = page.getByRole('textbox', { name: 'Level name', exact: true }), fileName = page.getByRole('textbox', { name: 'Level file name', exact: true })
  await name.focus(); await page.keyboard.press('ArrowDown'); await expect(fileName).toBeFocused()
  await page.keyboard.press('ArrowUp'); await expect(name).toBeFocused()
  await page.keyboard.press('Enter'); await page.keyboard.press('ArrowLeft'); await expect(name).toBeFocused()
  await expect(name).toHaveAttribute('data-builder-editing', 'true')
  await page.keyboard.press('Enter'); await page.keyboard.press('ArrowDown'); await expect(fileName).toBeFocused()
  await width.focus(); await page.keyboard.press('ArrowRight'); await expect(height).toBeFocused()
  await page.keyboard.press('ArrowLeft'); await expect(width).toBeFocused()
  await page.keyboard.press('ArrowUp'); await expect(page.getByRole('button', { name: /^Save location/ })).toBeFocused()
  await expect(width).toHaveValue(String(initial)); await expect(button(page, 'Undo')).toBeDisabled()
  await width.focus(); await page.keyboard.press('Enter'); await expect(width).toHaveAttribute('data-builder-editing', 'true')
  await page.screenshot({ path: info.outputPath('number-editing.png') })
  await page.keyboard.press('ArrowUp'); await expect(width).toBeFocused(); await expect(width).toHaveValue(String(initial + 100))
  await page.keyboard.press('Enter'); await expect(width).toBeFocused(); await expect(width).not.toHaveAttribute('data-builder-editing', 'true')
  await page.keyboard.press('ArrowRight'); await expect(height).toBeFocused()
  await width.focus(); await page.keyboard.press('Enter'); await width.fill(String(initial + 400))
  await page.keyboard.press('Escape'); await expect(width).toBeFocused(); await expect(width).toHaveValue(String(initial + 100))
  await page.keyboard.press('ArrowRight'); await expect(height).toBeFocused()
  await width.click(); await page.keyboard.press('ArrowUp'); await expect(width).toHaveValue(String(initial + 200))
  await page.keyboard.press('Tab'); await expect(height).toBeFocused()
})

test('controller A enters number editing and A or B resumes directional browsing', async ({ page }) => {
  await open(page)
  const width = field(page, 'Level width'), height = field(page, 'Level height'), initial = Number(await width.inputValue())
  await width.focus(); await page.clock.runFor(64); await tap(page, 15)
  await expect(height).toBeFocused(); await expect(width).toHaveValue(String(initial))
  await tap(page, 14); await expect(width).toBeFocused()
  await tap(page, 0); await expect(width).toHaveAttribute('data-builder-editing', 'true')
  await tap(page, 15); await expect(width).toBeFocused(); await expect(width).toHaveValue(String(initial + 100))
  await tap(page, 0); await expect(width).toBeFocused(); await expect(width).not.toHaveAttribute('data-builder-editing', 'true')
  await tap(page, 15); await expect(height).toBeFocused()
  await tap(page, 14); await tap(page, 0); await width.fill(String(initial + 400)); await tap(page, 1)
  await expect(width).toBeFocused(); await expect(width).toHaveValue(String(initial + 100))
  await tap(page, 15); await expect(height).toBeFocused()
})

test('closed lists navigate spatially and Help keeps arrows inside its visible layout', async ({ page }) => {
  await open(page)
  await page.getByRole('tab', { name: 'Object', exact: true }).click()
  const selected = page.getByRole('combobox', { name: 'Selected object', exact: true })
  await selected.focus(); await page.keyboard.press('ArrowUp')
  await expect(page.getByRole('tab', { name: 'Object', exact: true })).toBeFocused()
  await expect(selected).toHaveAttribute('aria-expanded', 'false')
  await selected.focus(); await page.keyboard.press('Enter'); await page.keyboard.press('ArrowDown')
  await expect(selected).toBeFocused(); await expect(selected).toHaveAttribute('aria-expanded', 'true')
  await page.keyboard.press('Escape'); await expect(selected).toHaveAttribute('aria-expanded', 'false')
  await button(page, 'Help').click()
  const help = page.getByRole('dialog', { name: 'Level builder help', exact: true })
  const first = help.getByRole('tab', { name: 'Canvas', exact: true }), next = help.getByRole('tab', { name: 'Inspector', exact: true })
  await first.focus(); await page.keyboard.press('ArrowLeft'); await expect(first).toBeFocused()
  await page.keyboard.press('ArrowRight'); await expect(next).toBeFocused(); await expect(next).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('ArrowDown'); await expect(help.getByRole('tabpanel', { name: 'Inspector', exact: true })).toBeFocused()
  await page.keyboard.press('Escape'); await expect(help).toHaveCount(0); await expect(button(page, 'Help')).toBeFocused()
})
