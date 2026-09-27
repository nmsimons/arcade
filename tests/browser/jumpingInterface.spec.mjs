import { test, expect } from './helpers/test.mjs'
import { installTestFolder, useLevelFixtures } from './helpers/jumpingLevels.mjs'
import { expectAccessibleSelection } from './helpers/jumpingAccessibility.mjs'
import { FIRST_LEVEL } from '../helpers/jumping-fixtures.mjs'

async function open(page) {
  await useLevelFixtures(page, [FIRST_LEVEL])
  await installTestFolder(page, { 'first.json': FIRST_LEVEL })
  await page.goto('/untitled-jumping-game')
  await page.getByRole('button', { name: 'Local folder', exact: true }).click()
  await page.getByRole('button', { name: 'Choose folder', exact: true }).click()
  await expect(page.locator('.jumping-level-card')).toHaveCount(1)
  await page.mouse.move(0, 0)
}

test('preview hover matches the library and stays independent of card actions after keyboard navigation', async ({ page }, info) => {
  await open(page)
  const preview = page.locator('button.jumping-level-card')
  const background = locator => locator.evaluate(el => getComputedStyle(el).backgroundColor)
  const resting = await background(preview)
  const restingText = await preview.evaluate(el => getComputedStyle(el).color)
  await preview.focus(); await page.keyboard.press('Shift')
  await expectAccessibleSelection(preview)
  await preview.hover()
  const hovered = await background(preview)
  expect(hovered).not.toBe(resting)
  // Pointer hover must not inherit the browser's keyboard focus appearance.
  await expect(preview).toHaveCSS('color', restingText)
  await page.mouse.move(0, 0)
  await expect(preview).toHaveCSS('background-color', resting)
  const actions = page.locator('.jumping-level-tile-actions button')
  for (let i = 0; i < await actions.count(); i++) {
    await preview.focus(); await page.keyboard.press('Shift')
    await expectAccessibleSelection(preview)
    await actions.nth(i).hover()
    await expect(preview).toHaveCSS('background-color', resting)
  }
  await page.screenshot({ path: info.outputPath('picker-action-hover.png') })
  // Returning to the keyboard still exposes its distinct, accessible selection.
  await page.keyboard.press('Shift')
  await expectAccessibleSelection(preview)

  await page.getByRole('button', { name: `Edit ${FIRST_LEVEL.name}`, exact: true }).click()
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  const libraryPreview = page.getByRole('button', { name: 'Open first.json', exact: true })
  // The currently edited file must not look permanently hovered.
  await expect(libraryPreview).toHaveCSS('background-color', resting)
  await libraryPreview.hover()
  await expect(libraryPreview).toHaveCSS('background-color', hovered)
  const template = page.getByRole('button', { name: 'Use first.json as template', exact: true })
  for (const action of [template, page.getByRole('button', { name: 'Delete first.json', exact: true })]) {
    await action.hover()
    await expect(libraryPreview).toHaveCSS('background-color', resting)
  }
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport)
    await template.hover()
    const row = await page.locator('.builder-file-actions').boundingBox(), button = await template.boundingBox()
    const inset = button.x - row.x
    expect(button.y - row.y).toBeCloseTo(inset, 1)
    expect(row.y + row.height - button.y - button.height).toBeCloseTo(inset, 1)
    await page.screenshot({ path: info.outputPath(`library-action-hover-${viewport.width}.png`) })
  }
})

test('level picker keeps its bands stable and gives each keyboard action a contrasting selection', async ({ page }, info) => {
  await open(page)
  const header = page.locator('.jumping-menu-header'), detail = page.locator('.jumping-level-detail')
  const bounds = [await header.boundingBox(), await detail.boundingBox()]
  for (const name of ['Built-in levels', 'Local folder']) {
    await page.getByRole('button', { name, exact: true }).click()
    expect([await header.boundingBox(), await detail.boundingBox()]).toEqual(bounds)
  }
  for (const forcedColors of ['none', 'active']) {
    await page.emulateMedia({ forcedColors })
    await page.keyboard.press('Home')
    const buttons = page.getByRole('dialog').locator('button:not(:disabled)')
    for (let i = 0; i < await buttons.count(); i++) {
      await expectAccessibleSelection(buttons.nth(i))
      await page.keyboard.press('Tab')
    }
  }
  await page.emulateMedia({ forcedColors: 'none' })
  await page.addStyleTag({ content: 'html { font-size: 200%; }' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.keyboard.press('Home')
  const buttons = page.getByRole('dialog').locator('button:not(:disabled)')
  for (let i = 0; i < await buttons.count(); i++) {
    await expect(buttons.nth(i)).toBeFocused()
    await expect(buttons.nth(i)).toBeInViewport()
    await page.keyboard.press('Tab')
  }
  expect(await page.locator('.jumping-level-menu').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath('picker-enlarged-text.png') })
})

test('library and file confirmations keep keyboard focus visible and reflow at enlarged text sizes', async ({ page }, info) => {
  await open(page)
  await page.getByRole('button', { name: `Edit ${FIRST_LEVEL.name}`, exact: true }).click()
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  const library = page.getByRole('dialog', { name: 'Level library', exact: true })
  for (const forcedColors of ['none', 'active']) {
    await page.emulateMedia({ forcedColors })
    const buttons = library.locator('button:not(:disabled)'), count = await buttons.count()
    await buttons.first().focus(); await page.keyboard.press('Shift')
    for (let i = 0; i < count; i++) {
      await expectAccessibleSelection(buttons.nth(i))
      // Native dialogs permit Tab into browser chrome after the last control.
      if (i < count - 1) await page.keyboard.press('Tab')
    }
  }
  await page.emulateMedia({ forcedColors: 'none' })
  await page.getByRole('button', { name: 'Delete first.json', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Open first.json', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Recycle bin', exact: true }).click()
  await page.getByRole('button', { name: 'Empty recycle bin', exact: true }).click()
  const confirm = page.getByRole('alertdialog', { name: 'Empty recycle bin?', exact: true })
  await page.mouse.move(0, 0)
  for (const forcedColors of ['none', 'active']) {
    await page.emulateMedia({ forcedColors })
    await confirm.getByRole('button', { name: 'Cancel', exact: true }).focus(); await page.keyboard.press('Shift')
    for (let i = 0; i < 2; i++) {
      await expectAccessibleSelection(confirm.locator('button:focus'))
      if (i === 0) await page.keyboard.press('Tab')
    }
  }
  await page.emulateMedia({ forcedColors: 'none' })
  await page.addStyleTag({ content: 'html { font-size: 200%; }' })
  await page.setViewportSize({ width: 390, height: 844 })
  await confirm.getByRole('button', { name: 'Cancel', exact: true }).focus()
  for (let i = 0; i < 2; i++) {
    await expect(confirm.locator('button:focus')).toBeInViewport({ ratio: 1 })
    if (i === 0) await page.keyboard.press('Tab')
  }
  expect(await confirm.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath('confirmation-enlarged-text.png') })
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Back to levels', exact: true }).click()
  const buttons = library.locator('button:not(:disabled)'), count = await buttons.count()
  await buttons.first().focus()
  for (let i = 0; i < count; i++) {
    const button = buttons.nth(i)
    await expect(button).toBeFocused()
    // Native scroll positions round to pixels; allow a subpixel edge at 200% type.
    await expect(button).toBeInViewport({ ratio: await button.locator('canvas').count() ? 0 : .99 })
    if (i < count - 1) await page.keyboard.press('Tab')
  }
  expect(await library.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
})
