import { test, expect } from './helpers/test.mjs'
import { blankTrial } from '../../src/games/jumping/level.ts'
import { installBuiltInFixtures, useLevelFixtures, selectBuilderObject, saveTestLevel, waitForBuilderPreview } from './helpers/jumpingLevels.mjs'

const board = page => page.getByRole('application', { name: 'Level canvas' })
const status = page => page.getByRole('status', { name: 'Builder status' })
function fixtures() {
  const source = { ...blankTrial(), id: 'clipboard-source', name: 'Clipboard source', height: 1000, floor: 1000,
    platforms: [{ x: 300, y: 300, w: 240, h: 180, material: 'earth', polygon: [[0,0],[240,60],[240,180],[0,180]] },
      { x: 620, y: 500, w: 200, h: 120, material: 'steel' }],
    climbables: { ropes: [{ x: 300, y: 300, length: 180, segments: 23, anchor: { platform: 0, x: 0, y: 0 } }],
      ladders: [{ x: 604, top: 500, bottom: 900, side: 1, platform: 1 }] },
    mechanisms: [{ id: 'lift', kind: 'lift', x: 1000, y: 600, w: 120, h: 20, travel: 100 }],
    triggers: [{ x: 1010, y: 600, w: 80, mode: 'touch', targets: ['lift'], mount: { mechanism: 'lift', x: 10 } }] }
  const target = { ...blankTrial(), id: 'clipboard-target', name: 'Clipboard target', height: 1000, floor: 1000 }
  return { source, target }
}
async function setup(page, file = 'source.json') {
  const { source, target } = fixtures()
  await useLevelFixtures(page, [source, target])
  await installBuiltInFixtures(page, { 'source.json': source, 'target.json': target })
  await page.goto(`/lab/builder/built-in/${file}`)
  await expect(board(page)).toBeVisible(); await waitForBuilderPreview(page)
  return { source, target }
}
async function copyGroup(page) {
  await board(page).focus(); await page.keyboard.press('Control+a'); await page.keyboard.press('Control+c')
  await expect(status(page)).toContainText('Copied 6 objects.')
}
async function openTargetFromMenu(page) {
  await page.getByRole('button', { name: 'Back to game', exact: true }).click()
  await page.getByRole('button', { name: 'Edit Clipboard target', exact: true }).click()
  await expect(board(page)).toBeVisible(); await waitForBuilderPreview(page)
}

test('native copy and paste transfer a complete group through the level menu with one undo step', async ({ page, context }) => {
  test.setTimeout(90_000)
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const { source, target } = await setup(page)
  await copyGroup(page)
  const text = await page.evaluate(() => navigator.clipboard.readText())
  expect(JSON.parse(text).format).toBe('lab-editor-objects')
  await openTargetFromMenu(page)
  await board(page).focus(); await page.keyboard.press('Control+v')
  await expect(status(page)).toContainText('Pasted 6 objects.')
  let saved = await saveTestLevel(page)
  expect(saved.level.platforms).toHaveLength(2)
  expect(saved.level.platforms[0].polygon).toEqual(source.platforms[0].polygon)
  expect(saved.level.platforms[1].x - saved.level.platforms[0].x).toBe(320)
  expect(saved.level.platforms[1].y - saved.level.platforms[0].y).toBe(200)
  expect(saved.level.entrance).toEqual(target.entrance); expect(saved.level.goal).toEqual(target.goal)
  expect(saved.level.climbables.ropes[0].anchor.platform).toBe(0)
  expect(saved.level.climbables.ladders[0].platform).toBe(1)
  expect(saved.level.triggers[0].targets).toEqual([saved.level.mechanisms[0].id])
  expect(saved.level.triggers[0].mount.mechanism).toBe(saved.level.mechanisms[0].id)
  expect(saved.level.mechanisms[0].id).not.toBe('lift')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  saved = await saveTestLevel(page); expect(saved.level.platforms).toHaveLength(0)
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  saved = await saveTestLevel(page); expect(saved.level.platforms).toHaveLength(2)
})

test('the Paste button reads a group copied in another browser tab', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await setup(page); await copyGroup(page)
  const other = await context.newPage()
  await setup(other, 'target.json')
  await other.getByRole('button', { name: 'Paste', exact: true }).click()
  await expect(status(other)).toContainText('Pasted 6 objects.')
  expect((await saveTestLevel(other)).level.platforms).toHaveLength(2)
  await other.close()
})

test('toolbar copies survive switching levels and reloading when clipboard access is blocked', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
    readText: async () => { throw new DOMException('Clipboard blocked', 'NotAllowedError') },
    writeText: async () => { throw new DOMException('Clipboard blocked', 'NotAllowedError') },
  } }))
  await setup(page)
  await selectBuilderObject(page, 'platform:0')
  await page.getByRole('button', { name: 'Copy', exact: true }).click()
  await expect(status(page)).toContainText('Copied within Level studio.')
  await openTargetFromMenu(page); await page.reload(); await waitForBuilderPreview(page)
  await page.getByRole('button', { name: 'Paste', exact: true }).click()
  await expect(status(page)).toContainText('Pasted 1 object.')
  const saved = await saveTestLevel(page)
  expect(saved.level.platforms).toHaveLength(1)
  expect(saved.level.platforms[0].material).toBe('earth')
  await page.getByRole('button', { name: 'Cut', exact: true }).click()
  await expect(status(page)).toContainText('Cut objects are available within Level studio.')
  expect((await saveTestLevel(page)).level.platforms).toHaveLength(0)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  expect((await saveTestLevel(page)).level.platforms).toHaveLength(1)
})

test('cut is undoable and text fields retain native clipboard behavior', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await setup(page); await selectBuilderObject(page, 'platform:1')
  await board(page).focus(); await page.keyboard.press('Control+x')
  await expect(status(page)).toContainText('Cut selected objects.')
  expect((await saveTestLevel(page)).level.platforms).toHaveLength(1)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  expect((await saveTestLevel(page)).level.platforms).toHaveLength(2)
  await selectBuilderObject(page, 'platform:1')
  const field = page.getByRole('textbox', { name: 'Object name', exact: true })
  await field.fill('Ordinary clipboard text'); await field.press('Control+a'); await field.press('Control+c')
  await field.fill(''); await field.press('Control+v')
  await expect(field).toHaveValue('Ordinary clipboard text')
  await field.press('Tab')
  const saved = await saveTestLevel(page)
  expect(saved.level.platforms).toHaveLength(2)
  expect(saved.level.platforms[1].name).toBe('Ordinary clipboard text')
})

test('unrelated or invalid system clipboard data does not paste an older geometry snapshot', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await setup(page); await copyGroup(page)
  await page.evaluate(() => navigator.clipboard.writeText('an unrelated note'))
  await board(page).focus(); await page.keyboard.press('Control+v')
  await expect(status(page)).toContainText('does not contain Level studio objects')
  await page.evaluate(() => navigator.clipboard.writeText('{"format":"lab-editor-objects","version":1,"level":{},"selections":[]}'))
  await page.getByRole('button', { name: 'Paste', exact: true }).click()
  await expect(status(page)).toContainText('invalid level objects')
  expect((await saveTestLevel(page)).level.platforms).toHaveLength(2)
})

test('a delayed clipboard read cannot overwrite a level opened while paste was pending', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
    readText: () => new Promise(resolve => { window.resolveClipboardRead = resolve }),
  } }))
  await setup(page)
  const text = await page.evaluate(async () => {
    const { encodeEditorClipboard } = await import('/src/games/jumping/editorClipboard.ts')
    const { copySelections } = await import('/src/games/jumping/editorSelection.ts')
    const source = await (await fetch('/levels/jumping/00-fixture.json')).json()
    return encodeEditorClipboard(copySelections(source, [{ kind:'platform', index:0 }]))
  })
  await page.getByRole('button', { name: 'Paste', exact: true }).click()
  await page.waitForFunction(() => !!window.resolveClipboardRead)
  await openTargetFromMenu(page)
  await page.evaluate(text => window.resolveClipboardRead(text), text)
  expect((await saveTestLevel(page)).level.platforms).toHaveLength(0)
})
