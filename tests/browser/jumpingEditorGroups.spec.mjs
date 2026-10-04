import { test, expect } from './helpers/folderTest.mjs'
import { blankTrial } from '../../src/games/jumping/level.ts'
import { installTestFolder, useLevelFixtures, selectBuilderObject, saveTestLevel, reopenTestLevel } from './helpers/jumpingLevels.mjs'
import { dayAmbientChannel, expectDayAmbientPixel } from './helpers/jumpingLighting.mjs'
const board = page => page.getByRole('application', { name: 'Level canvas' })
function fixture() {
  return { ...blankTrial(), id: 'editor-groups', name: 'Editor groups', width: 1200, height: 800, floor: 800,
    spawn: { x: 180, y: 800 }, goal: { x: 960, y: 800 },
    platforms: [{ x: 300, y: 300, w: 240, h: 180, material: 'earth', name: 'A' },
      { x: 400, y: 360, w: 220, h: 140, material: 'chalk', name: 'B' },
      { x: 700, y: 400, w: 120, h: 80, material: 'steel', name: 'C' }],
    props: [{ kind: 'box', x: 760, y: 570, size: 60 }] }
}
async function open(page, level = fixture()) {
  await useLevelFixtures(page, [level]); await installTestFolder(page, { 'groups.json': level })
  await page.addInitScript(() => {
    const fill = CanvasRenderingContext2D.prototype.fillRect
    CanvasRenderingContext2D.prototype.fillRect = function (...args) {
      if (args[0] === 0 && args[1] === 0 && this.fillStyle === '#f1f1ed') this.canvas.editorCamera = this.getTransform()
      return fill.apply(this, args)
    }
  })
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/untitled-jumping-game')
  await page.getByRole('button', { name: 'Level studio', exact: true }).click()
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: 'Choose folder', exact: true }).click()
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

test('marquee selection moves a group, copies a frozen snapshot and pastes with one undo step', async ({ page }, info) => {
  await open(page)
  await drag(page,[270,270],[650,540])
  await expect(group(page,2)).toBeVisible()
  await expect(page.getByRole('button',{name:'Rotate right',exact:true})).toBeEnabled()
  await board(page).focus(); await page.keyboard.press('Control+c'); await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Control+v')
  await expect(group(page,2)).toBeVisible()
  await page.screenshot({path:info.outputPath('terrain-group-paste.png')})
  let saved = await saveTestLevel(page)
  expect(saved.level.platforms.map(b => [b.x,b.y])).toEqual([[320,300],[420,360],[700,400],[340,340],[440,400]])
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
