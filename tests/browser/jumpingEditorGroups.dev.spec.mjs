import { test, expect } from './helpers/test.mjs'
import { blankTrial } from '../../src/games/jumping/level.ts'
import { installBuiltInFixtures, useLevelFixtures, selectBuilderObject, saveTestLevel, reopenTestLevel } from './helpers/jumpingLevels.mjs'
import { dayAmbientChannel, expectDayAmbientPixel } from './helpers/jumpingLighting.mjs'
const board = page => page.getByRole('application', { name: 'Level canvas' })
function fixture() {
  return { ...blankTrial(), id: 'editor-groups', name: 'Editor groups', width: 1200, height: 800, floor: 800,
    entrance: { x: 180, y: 800 }, goal: { x: 960, y: 800 },
    platforms: [{ x: 300, y: 300, w: 240, h: 180, material: 'earth', name: 'A' },
      { x: 400, y: 360, w: 220, h: 140, material: 'chalk', name: 'B' },
      { x: 700, y: 400, w: 120, h: 80, material: 'steel', name: 'C' }],
    props: [{ kind: 'box', x: 760, y: 570, size: 60 }] }
}
async function open(page, level = fixture()) {
  await useLevelFixtures(page, [level]); await installBuiltInFixtures(page, { 'groups.json': level })
  await page.addInitScript(() => {
    const fill = CanvasRenderingContext2D.prototype.fillRect
    CanvasRenderingContext2D.prototype.fillRect = function (...args) {
      if (args[0] === 0 && args[1] === 0 && this.fillStyle === '#f1f1ed') this.canvas.editorCamera = this.getTransform()
      return fill.apply(this, args)
    }
  })
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/lab')
  await page.getByRole('button', { name: 'Level studio', exact: true }).click()
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: 'Open groups.json', exact: true }).click()
  await expect(board(page)).toHaveAttribute('aria-busy', 'false')
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z')); await page.clock.runFor(64)
  await page.getByRole('button', { name: 'Fit level', exact: true }).click()
}
async function point(page, x, y) {
  return board(page).evaluate((canvas, [x, y]) => {
    const rect = canvas.getBoundingClientRect(), t = canvas.editorCamera, ratio = canvas.width / rect.width
    return { x: rect.x + (x * t.a + t.e) / ratio, y: rect.y + (y * t.d + t.f) / ratio }
  }, [x,y])
}
async function click(page, x, y, shift = false) {
  const p = await point(page,x,y)
  if (shift) await page.keyboard.down('Shift')
  await page.mouse.click(p.x,p.y)
  if (shift) await page.keyboard.up('Shift')
}
async function drag(page, start, end, shift = false) {
  const a = await point(page,...start), b = await point(page,...end)
  if (shift) await page.keyboard.down('Shift')
  await page.mouse.move(a.x,a.y); await page.mouse.down(); await page.mouse.move(b.x,b.y,{steps:5}); await page.mouse.up()
  if (shift) await page.keyboard.up('Shift')
}
async function pixel(page, x, y) {
  return board(page).evaluate((canvas, [x,y]) => {
    const t=canvas.editorCamera
    return [...canvas.getContext('2d').getImageData(Math.round(x*t.a+t.e),Math.round(y*t.d+t.f),1,1).data].slice(0,3)
  }, [x,y])
}
const group = (page,n) => page.getByRole('heading', { name: `${n} objects selected`, exact: true })

function submergedWallItems() {
  return { ...fixture(), platforms: [], props: [],
    gravityPlates: [{ id: 'water', name: 'Pool', effect: 'water', x: 200, y: 100, w: 700, h: 500, gravity: -1 }],
    timers: [{ name: 'Clock', x: 350, y: 200 }],
    texts: [{ name: 'Sign', x: 300, y: 180, w: 250, h: 160, text: 'Under water', fontSize: 24, align: 'left' }] }
}

test('repeated clicks cycle through water and overlapping wall items without editing them', async ({ page }) => {
  const level = submergedWallItems()
  await open(page, level)
  const p = await point(page, 400, 220)
  await page.mouse.move(p.x, p.y); await page.mouse.down()
  await page.mouse.move(p.x + 1, p.y + 1); await page.mouse.up()
  await expect(page.getByRole('heading', { name: 'Pool · Water 1', exact: true })).toBeVisible()
  for (const name of ['Clock · Wall timer 1', 'Sign · Wall text 1', 'Pool · Water 1']) {
    await click(page, 400, 220)
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
  }
  await click(page, 400, 220)
  await expect(page.getByRole('heading', { name: 'Clock · Wall timer 1', exact: true })).toBeVisible()
  await click(page, 460, 220)
  await expect(page.getByRole('heading', { name: 'Pool · Water 1', exact: true })).toBeVisible()
  const saved = (await saveTestLevel(page)).level
  for (const key of ['gravityPlates', 'timers', 'texts']) expect(saved[key]).toEqual(level[key])
})

test('repeated Shift-clicks toggle each overlapping item while retaining selections elsewhere', async ({ page }) => {
  const level = { ...submergedWallItems(), props: [{ kind: 'box', x: 1050, y: 650, size: 60 }] }
  await open(page, level)
  await click(page, 1050, 620)
  for (const count of [2, 3, 4, 3, 2]) {
    await click(page, 400, 220, true)
    await expect(group(page, count)).toBeVisible()
  }
  await click(page, 400, 220, true)
  await expect(page.getByRole('combobox', { name: 'Selected object', exact: true })).toHaveAttribute('data-value', 'prop:0')
  const saved = (await saveTestLevel(page)).level
  for (const key of ['gravityPlates', 'timers', 'texts', 'props']) expect(saved[key]).toEqual(level[key])
})

test('Shift continues an ordinary overlap click and ordinary clicks restart after Shift selection', async ({ page }) => {
  const level = submergedWallItems()
  await open(page, level)
  await click(page, 400, 220, true)
  await click(page, 400, 220)
  await expect(page.getByRole('heading', { name: 'Pool · Water 1', exact: true })).toBeVisible()
  await click(page, 400, 220, true)
  await expect(group(page, 2)).toBeVisible()
  await click(page, 400, 220, true)
  await expect(group(page, 3)).toBeVisible()
  await click(page, 400, 220, true)
  await expect(group(page, 2)).toBeVisible()
  await board(page).focus(); await page.keyboard.press('ArrowRight')
  const saved = (await saveTestLevel(page)).level
  expect(saved.gravityPlates).toEqual(level.gravityPlates)
  expect(saved.timers).toEqual([{ ...level.timers[0], x: 355 }])
  expect(saved.texts).toEqual([{ ...level.texts[0], x: 305 }])
})

test('cycling behind water selects a saved group before drilling into its members, and drags it together', async ({ page }) => {
  const members = [{ kind: 'timer', index: 0 }, { kind: 'text', index: 0 }]
  const level = { ...submergedWallItems(), editorGroups: [{ id: 'wall-displays', members }] }
  await open(page, level)
  await click(page, 400, 220)
  await expect(page.getByRole('heading', { name: 'Pool · Water 1', exact: true })).toBeVisible()
  await click(page, 400, 220)
  await expect(group(page, 2)).toBeVisible()
  for (const name of ['Clock · Wall timer 1', 'Sign · Wall text 1', 'Pool · Water 1']) {
    await click(page, 400, 220)
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
  }
  await click(page, 400, 220)
  await expect(group(page, 2)).toBeVisible()
  await page.keyboard.down('Alt')
  await drag(page, [400, 220], [440, 240])
  await page.keyboard.up('Alt')
  await expect(group(page, 2)).toBeVisible()
  const saved = (await saveTestLevel(page)).level
  expect(saved.gravityPlates).toEqual(level.gravityPlates)
  expect(saved.timers[0]).toMatchObject({ x: expect.closeTo(390, 3), y: expect.closeTo(220, 3) })
  expect(saved.texts[0]).toMatchObject({ x: expect.closeTo(340, 3), y: expect.closeTo(200, 3) })
  expect(saved.editorGroups).toEqual(level.editorGroups)
})

test('Shift cycling adds and removes a whole submerged saved group and preserves other selected objects', async ({ page }) => {
  const source = submergedWallItems(), members = [{ kind: 'timer', index: 0 }, { kind: 'text', index: 0 }]
  const level = { ...source, texts: [{ ...source.texts[0], x: 600 }],
    props: [{ kind: 'box', x: 1050, y: 650, size: 60 }], editorGroups: [{ id: 'wall-displays', members }] }
  await open(page, level)
  await click(page, 1050, 620)
  for (const count of [2, 4, 3]) {
    await click(page, 400, 220, true)
    await expect(group(page, count)).toBeVisible()
  }
  await board(page).focus(); await page.keyboard.press('ArrowRight')
  let saved = (await saveTestLevel(page)).level
  expect(saved.gravityPlates).toEqual(level.gravityPlates)
  expect(saved.timers).toEqual([{ ...level.timers[0], x: 355 }])
  expect(saved.texts).toEqual([{ ...level.texts[0], x: 605 }])
  expect(saved.props).toEqual([{ ...level.props[0], x: 1055 }])
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await click(page, 1050, 620)
  for (const count of [2, 4, 3]) {
    await click(page, 400, 220, true)
    await expect(group(page, count)).toBeVisible()
  }
  await click(page, 400, 220, true)
  await expect(page.getByRole('combobox', { name: 'Selected object', exact: true })).toHaveAttribute('data-value', 'prop:0')
  saved = (await saveTestLevel(page)).level
  for (const key of ['gravityPlates', 'timers', 'texts', 'props', 'editorGroups']) expect(saved[key]).toEqual(level[key])
})

test('dragging at an overlap keeps the current selection, including a wall item selected behind water', async ({ page }) => {
  const level = submergedWallItems()
  await open(page, level)
  await click(page, 400, 220)
  await page.keyboard.down('Alt')
  await drag(page, [400, 220], [440, 240])
  await page.keyboard.up('Alt')
  await expect(page.getByRole('heading', { name: 'Pool · Water 1', exact: true })).toBeVisible()
  let saved = (await saveTestLevel(page)).level
  expect(saved.gravityPlates[0]).toMatchObject({ ...level.gravityPlates[0], x: expect.closeTo(240, 3), y: expect.closeTo(120, 3) })
  expect(saved.timers).toEqual(level.timers)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await click(page, 400, 220); await click(page, 400, 220)
  await expect(page.getByRole('heading', { name: 'Clock · Wall timer 1', exact: true })).toBeVisible()
  await page.keyboard.down('Alt')
  await drag(page, [400, 220], [450, 250])
  await page.keyboard.up('Alt')
  saved = (await saveTestLevel(page)).level
  expect(saved.gravityPlates).toEqual(level.gravityPlates)
  expect(saved.timers[0]).toMatchObject({ ...level.timers[0], x: expect.closeTo(400, 3), y: expect.closeTo(230, 3) })
  expect(saved.texts).toEqual(level.texts)
})

test('overlap cycling follows group drill-down and does not regroup individual members', async ({ page }) => {
  const members = [{ kind: 'platform', index: 0 }, { kind: 'platform', index: 1 }]
  await open(page, { ...fixture(), editorGroups: [{ id: 'overlapping-terrain', members }] })
  await click(page, 445, 395)
  await expect(group(page, 2)).toBeVisible()
  for (const name of ['B · Terrain 2', 'A · Terrain 1', 'B · Terrain 2']) {
    await click(page, 445, 395)
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
  }
  expect((await saveTestLevel(page)).level.editorGroups).toEqual([{ id: 'overlapping-terrain', members }])
})

test('terrain draw order changes visible overlap and pointer picking, with undo and saved persistence', async ({ page }) => {
  await open(page)
  expectDayAmbientPixel(await pixel(page,445,395), [189,196,181])
  await selectBuilderObject(page,'platform:0')
  await page.getByRole('button',{name:'Bring to front',exact:true}).click()
  const color = await pixel(page,445,395)
  expect(color[0]).toBeGreaterThan(dayAmbientChannel(170)); expect(color[0]).toBeLessThan(dayAmbientChannel(181))
  await click(page,445,395)
  await expect(page.getByRole('heading',{name:'A · Terrain 1',exact:true})).toBeVisible()
  await page.getByRole('button',{name:'Undo',exact:true}).click()
  expectDayAmbientPixel(await pixel(page,445,395), [189,196,181])
  await page.getByRole('button',{name:'Redo',exact:true}).click()
  const saved = await saveTestLevel(page)
  expect(saved.level.platforms[0].zIndex).toBeGreaterThan(saved.level.platforms[1].zIndex ?? 0)
  await reopenTestLevel(page,saved)
  await click(page,445,395)
  await expect(page.getByRole('heading',{name:'A · Terrain 1',exact:true})).toBeVisible()
})

test('marquee selection moves a group, copies a frozen snapshot and pastes with one undo step', async ({ page, context }, info) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await open(page)
  await drag(page,[270,270],[650,540])
  await expect(group(page,2)).toBeVisible()
  await expect(page.getByRole('button',{name:'Rotate right',exact:true})).toBeEnabled()
  await board(page).focus(); await page.keyboard.press('ControlOrMeta+c')
  await expect(page.getByRole('status', { name: 'Builder status' })).toContainText('Copied 2 objects.')
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ControlOrMeta+v')
  await expect(page.getByRole('status', { name: 'Builder status' })).toContainText('Pasted 2 objects.')
  await expect(group(page,2)).toBeVisible()
  await page.screenshot({path:info.outputPath('terrain-group-paste.png')})
  let saved = await saveTestLevel(page)
  expect(saved.level.platforms.map(b => [b.x,b.y])).toEqual([[305,300],[405,360],[700,400],[340,340],[440,400]])
  await page.getByRole('button',{name:'Undo',exact:true}).click()
  saved = await saveTestLevel(page); expect(saved.level.platforms).toHaveLength(3)
  await page.getByRole('button',{name:'Redo',exact:true}).click()
  saved = await saveTestLevel(page); expect(saved.level.platforms).toHaveLength(5)
  await reopenTestLevel(page,saved)
  expect((await saveTestLevel(page)).level.platforms).toHaveLength(5)
})

test('shift selection toggles objects, transforms whole terrain groups and disables transforms for a mixed group', async ({ page }) => {
  await open(page)
  await click(page,330,330); await click(page,590,460,true)
  await expect(group(page,2)).toBeVisible()
  await page.getByRole('button',{name:'Flip horizontal',exact:true}).click()
  let saved=await saveTestLevel(page)
  expect(saved.level.platforms.slice(0,2).map(b=>b.x)).toEqual([380,300])
  await page.getByRole('button',{name:'Rotate right',exact:true}).click()
  saved=await saveTestLevel(page)
  expect(saved.level.platforms.slice(0,2).map(b=>[b.w,b.h])).toEqual([[180,240],[140,220]])
  await selectBuilderObject(page,'platform:2'); await click(page,760,540,true)
  await expect(group(page,2)).toBeVisible()
  await expect(page.getByRole('button',{name:'Rotate right',exact:true})).toBeDisabled()
  await expect(page.getByRole('button',{name:'Flip horizontal',exact:true})).toBeDisabled()
  await click(page,760,540,true)
  await expect(group(page,2)).toHaveCount(0)
  await expect(page.getByRole('heading',{name:'C · Terrain 3',exact:true})).toBeVisible()
})

test('dragging a selected member retains the group and Shift-marquee extends it', async ({ page }) => {
  await open(page)
  await drag(page,[270,270],[650,540])
  await drag(page,[330,330],[370,350])
  await expect(group(page,2)).toBeVisible()
  let saved=await saveTestLevel(page)
  expect(saved.level.platforms.slice(0,2).map(b=>[b.x,b.y])).toEqual([[340,320],[440,380]])
  await drag(page,[680,380],[840,500],true)
  await expect(group(page,3)).toBeVisible()
  await board(page).focus(); await page.keyboard.press('Delete')
  saved=await saveTestLevel(page); expect(saved.level.platforms).toHaveLength(0)
  await page.getByRole('button',{name:'Undo',exact:true}).click()
  saved=await saveTestLevel(page); expect(saved.level.platforms).toHaveLength(3)
})

test('saved groups select together, let a second click select a member, and survive clipboard, undo and reopen', async ({ page }, info) => {
  await open(page)
  await drag(page, [270,270], [650,540])
  await page.getByRole('button', { name: 'Group', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Group', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Ungroup', exact: true })).toBeEnabled()
  let saved = await saveTestLevel(page)
  expect(saved.level.editorGroups[0].members).toEqual([{ kind: 'platform', index: 0 }, { kind: 'platform', index: 1 }])
  await click(page, 100, 200); await click(page, 330, 330)
  await expect(group(page, 2)).toBeVisible()
  await click(page, 330, 330)
  await expect(page.getByRole('heading', { name: 'A · Terrain 1', exact: true })).toBeVisible()
  await page.keyboard.down('Alt'); await drag(page, [330,330], [350,350]); await page.keyboard.up('Alt')
  saved = await saveTestLevel(page)
  expect(saved.level.platforms[0].x).toBeCloseTo(320); expect(saved.level.platforms[0].y).toBeCloseTo(320)
  expect(saved.level.platforms[1]).toMatchObject({ x: 400, y: 360 })
  expect(saved.level.editorGroups).toHaveLength(1)
  await reopenTestLevel(page, saved)
  await page.getByRole('button', { name: 'Fit level', exact: true }).click()
  await click(page, 350, 350)
  await expect(group(page, 2)).toBeVisible()
  await page.screenshot({ path: info.outputPath('saved-group-center-guides.png') })
  await board(page).focus(); await page.keyboard.press('Control+d')
  saved = await saveTestLevel(page)
  expect(saved.level.editorGroups).toHaveLength(2)
  expect(saved.level.editorGroups[1].id).not.toBe(saved.level.editorGroups[0].id)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  saved = await saveTestLevel(page); expect(saved.level.editorGroups).toHaveLength(1)
  await click(page, 350, 350)
  await board(page).focus(); await page.keyboard.press('Control+Shift+g')
  saved = await saveTestLevel(page); expect(saved.level.editorGroups).toBeUndefined()
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await click(page, 350, 350); await expect(group(page, 2)).toBeVisible()
})

test('center guides snap selection centers and all bounds edges, with Alt and Snap-off bypasses', async ({ page }, info) => {
  await open(page, { ...fixture(), platforms: [{ x: 200, y: 200, w: 120, h: 80, name: 'A' }], props: [] })
  await drag(page, [230,230], [567,387])
  let saved = await saveTestLevel(page)
  expect(saved.level.platforms[0]).toMatchObject({ x: 540, y: 360 })
  const guides = page.locator('.builder-placement-preview')
  const guidePixel = async (x, y) => guides.evaluate((canvas, [x, y]) => {
    const t = document.querySelector('canvas[aria-label="Level canvas"]').editorCamera
    return [...canvas.getContext('2d').getImageData(Math.round(x*t.a+t.e), Math.round(y*t.d+t.f), 1, 1).data]
  }, [x, y])
  const xColor = await guidePixel(600, 100), yColor = await guidePixel(100, 400)
  expect(xColor.slice(0,3)).toEqual([40,124,155]); expect(xColor[3]).toBeGreaterThan(200)
  expect(yColor.slice(0,3)).toEqual([40,124,155]); expect(yColor[3]).toBeGreaterThan(200)
  await page.screenshot({ path: info.outputPath('aligned-level-center.png') })
  await drag(page, [570,390], [627,390])
  saved = await saveTestLevel(page); expect(saved.level.platforms[0]).toMatchObject({ x: 600, y: 360 })
  await drag(page, [630,390], [513,390])
  saved = await saveTestLevel(page); expect(saved.level.platforms[0]).toMatchObject({ x: 480, y: 360 })
  await drag(page, [510,390], [510,427])
  saved = await saveTestLevel(page); expect(saved.level.platforms[0]).toMatchObject({ x: 480, y: 400 })
  await drag(page, [510,430], [510,353])
  saved = await saveTestLevel(page); expect(saved.level.platforms[0]).toMatchObject({ x: 480, y: 320 })
  await page.keyboard.down('Alt'); await drag(page, [510,350], [527,367]); await page.keyboard.up('Alt')
  saved = await saveTestLevel(page)
  expect(saved.level.platforms[0].x).toBeCloseTo(497); expect(saved.level.platforms[0].y).toBeCloseTo(337)
  await page.getByRole('checkbox', { name: 'Snap', exact: true }).uncheck()
  await drag(page, [527,367], [547,387])
  saved = await saveTestLevel(page)
  expect(saved.level.platforms[0]).toMatchObject({ x: 517, y: 357 })
  expect((await guidePixel(600, 100))[3]).toBe(0)
})

test('group dragging snaps the combined selection bounds and preserves spacing', async ({ page }) => {
  await open(page, { ...fixture(), platforms: [
    { x: 200, y: 200, w: 100, h: 80 }, { x: 400, y: 300, w: 100, h: 80 }], props: [] })
  await drag(page, [180,180], [520,390])
  await board(page).focus(); await page.keyboard.press('Control+g')
  await expect(group(page, 2)).toBeVisible()
  await drag(page, [230,230], [477,337])
  const saved = await saveTestLevel(page)
  expect(saved.level.platforms.map(b => [b.x,b.y])).toEqual([[450,310],[650,410]])
  expect(saved.level.editorGroups).toHaveLength(1)
  await expect(group(page, 2)).toBeVisible()
})
