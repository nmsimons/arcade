import { test, expect } from './helpers/folderTest.mjs'
import { blankTrial } from '../../src/games/jumping/level.ts'
import { useLevelFixtures, installTestFolder, selectBuilderObject, selectBuilderOption, saveTestLevel, reopenTestLevel, restartFromPause } from './helpers/jumpingLevels.mjs'
const board = page => page.getByRole('application', { name: 'Level canvas' })
const player = page => page.evaluate(() => window.jumpingMotion.read().recent.at(-1))
function fixture(horizontal = false, night = false) {
  return { ...blankTrial(), id: 'force-field-browser', name: 'Force field workshop', width: 1200, height: 600, floor: 600,
    spawn: { x: horizontal ? 220 : 300, y: horizontal ? 180 : 600 }, goal: { x: 1000, y: 600 },
    platforms: horizontal ? [{ x: 180, y: 180, w: 80, h: 20 }] : [],
    props: [{ kind: 'box', x: horizontal ? 700 : 395, y: horizontal ? 160 : 600, size: 40 }],
    forceFields: [{ id: 'barrier', x: horizontal ? 120 : 500, y: horizontal ? 330 : 100,
      w: horizontal ? 760 : 12, h: horizontal ? 12 : 500, orientation: horizontal ? 'horizontal' : 'vertical', power: 'always' }],
    ...(night ? { version: 2, lighting: { nightMode: true, ambient: 0, lights: [] } } : {}) }
}
async function instrument(page) {
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype, fill = proto.fillRect, rounded = proto.roundRect
    proto.fillRect = function (...args) {
      if (args[0] === 0 && args[1] === 0 && this.fillStyle === '#f1f1ed') {
        this.canvas.fieldCamera = this.getTransform(); this.canvas.fieldBeams = []; this.canvas.fieldHandles = []; this.canvas.fieldBoxes = []; this.canvas.fieldSparks = []
      }
      const t = this.getTransform()
      if (this.fillStyle === '#267da7') {
        this.canvas.fieldBeams ??= []
        this.canvas.fieldBeams.push({ x: t.a * (args[0] + args[2] / 2) + t.c * (args[1] + args[3] / 2) + t.e,
          y: t.b * (args[0] + args[2] / 2) + t.d * (args[1] + args[3] / 2) + t.f })
      }
      if (this.fillStyle === '#d3f4ff') { this.canvas.fieldSparks ??= []; this.canvas.fieldSparks.push({x:t.a*args[0]+t.c*args[1]+t.e,y:t.b*args[0]+t.d*args[1]+t.f,alpha:this.globalAlpha}) }
      if (this.fillStyle === '#c65231' && args[2] === args[3]) {
        this.canvas.fieldHandles ??= []
        this.canvas.fieldHandles.push({ x: t.a * (args[0] + args[2]/2) + t.e, y: t.d * (args[1] + args[3]/2) + t.f })
      }
      return fill.apply(this,args)
    }
    proto.roundRect = function (...args) {
      const camera = this.canvas.fieldCamera
      if (camera && this.fillStyle === '#b3a28d' && args[2] === 40 && args[3] === 40) {
        const t = this.getTransform()
        this.canvas.fieldBoxes.push({ x: (t.a * (args[0] + 20) + t.c * (args[1] + 20) + t.e - camera.e) / camera.a, y: (t.b * (args[0] + 20) + t.d * (args[1] + 20) + t.f - camera.f) / camera.d + 20 })
      }
      return rounded.apply(this,args)
    }
  })
}
async function openGame(page, level) {
  await useLevelFixtures(page,[level]); await instrument(page)
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/untitled-jumping-game?motionDebug=1')
  await expect(page.locator('.jumping-level-card[aria-pressed=true]')).toBeVisible()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.locator('.jumping-level-card[aria-pressed=true]').click()
  await expect(page.locator('canvas')).toBeFocused(); await page.clock.runFor(64)
}
async function point(page, x, y) {
  return board(page).evaluate((canvas,[x,y]) => {
    const rect=canvas.getBoundingClientRect(), t=canvas.fieldCamera, ratio=canvas.width/rect.width
    return { x:rect.x+(x*t.a+t.e)/ratio, y:rect.y+(y*t.d+t.f)/ratio }
  }, [x,y])
}

test('a player pushes a box through a vertical field, stops at the beam, and can jump beside it', async ({ page }, info) => {
  const errors=[]; page.on('pageerror',e=>errors.push(e.message))
  await openGame(page,fixture())
  await page.keyboard.down('d'); await page.clock.runFor(3200); await page.keyboard.up('d')
  expect(errors).toEqual([])
  expect((await player(page)).x).toBeCloseTo(474.5,1)
  const boxes=await page.locator('canvas').evaluate(c=>c.fieldBoxes)
  expect(boxes.some(b=>b.x>520)).toBe(true)
  await page.screenshot({path:info.outputPath('vertical-force-field.png')})
  await page.keyboard.down('Space'); await page.clock.runFor(32); await page.keyboard.up('Space'); await page.clock.runFor(200)
  expect((await player(page)).y).toBeLessThan(560)
  expect((await player(page)).x).toBeLessThan(500)
  expect(errors).toEqual([])
})

for (const night of [false,true]) test(`horizontal fields support the player while objects fall through, with visible ${night?'night':'day'} artwork`, async ({ page }, info) => {
  await openGame(page,fixture(true,night))
  await page.keyboard.down('d'); await page.clock.runFor(700); await page.keyboard.up('d'); await page.clock.runFor(500)
  const standing=await player(page)
  expect(standing.y).toBeCloseTo(330,1); expect(standing.signals.support).toBe('force-field:0'); expect(standing.signals.grounded).toBe(true)
  // Final composited pixels, including the night lighting pass.
  const visible=await page.locator('canvas').evaluate(c=>{
    const ctx=c.getContext('2d')
    return c.fieldBeams.some(p=>{
      if(p.x<2||p.y<2||p.x>=c.width-2||p.y>=c.height-2)return false
      const [r,g,b]=ctx.getImageData(Math.floor(p.x),Math.floor(p.y),1,1).data
      return b>100&&b>r+15&&g>r+10
    })
  })
  expect(visible).toBe(true)
  if(!night) expect((await page.locator('canvas').evaluate(c=>c.fieldBoxes)).some(b=>Math.abs(b.y-600)<1)).toBe(true)
  const sparks=await page.locator('canvas').evaluate(c=>c.fieldSparks)
  expect(sparks.length).toBeGreaterThan(0)
  await page.clock.runFor(200)
  expect(await page.locator('canvas').evaluate(c=>c.fieldSparks)).not.toEqual(sparks)
  await page.screenshot({path:info.outputPath(`horizontal-force-field-${night?'night':'day'}.png`)})
  await page.keyboard.down('Space'); await page.clock.runFor(32); await page.keyboard.up('Space'); await page.clock.runFor(160)
  expect((await player(page)).y).toBeLessThan(300); expect((await player(page)).signals.grounded).toBe(false)
  await page.clock.runFor(1200); expect((await player(page)).y).toBeCloseTo(330,1)
})

test('a pressure switch enables a field and a collected EMP removes it, restoring it after the outage', async ({ page }, info) => {
  const level=fixture(); level.props=[]; level.forceFields[0].power='switched'
  level.triggers=[{x:260,y:600,w:100,mode:'touch',behavior:'switch',targets:['barrier']}]
  level.pickups=[{kind:'emp',x:460,y:575}]
  await openGame(page,level)
  await page.keyboard.down('d'); await page.clock.runFor(280); await page.keyboard.up('d')
  expect((await page.locator('canvas').evaluate(c=>c.fieldBeams)).length).toBeGreaterThan(0)
  await page.keyboard.down('d'); await page.clock.runFor(1400); await page.keyboard.up('d')
  expect((await player(page)).x).toBeGreaterThan(540)
  expect((await page.locator('canvas').evaluate(c=>c.fieldBeams)).length).toBe(0)
  await page.screenshot({path:info.outputPath('force-field-emp-disabled.png')})
  await page.clock.runFor(4500)
  expect((await page.locator('canvas').evaluate(c=>c.fieldBeams)).length).toBeGreaterThan(0)
  await restartFromPause(page); await page.clock.runFor(64)
  expect((await page.locator('canvas').evaluate(c=>c.fieldBeams)).length).toBe(0)
})

test('both studio tools have end handles, support wiring and group copy, and persist after save/reopen', async ({ page }, info) => {
  const level=fixture(); level.forceFields=[]; level.props=[]
  level.triggers=[{x:180,y:600,w:80,mode:'touch',targets:[]}]
  await useLevelFixtures(page,[level]); await installTestFolder(page,{'fields.json':level}); await instrument(page)
  await page.goto('/untitled-jumping-game')
  await page.getByRole('button',{name:'Level studio',exact:true}).click()
  await page.getByRole('button',{name:'Library',exact:true}).click()
  await page.getByRole('button',{name:'Choose folder',exact:true}).click()
  await page.getByRole('button',{name:'Open fields.json',exact:true}).click()
  await expect(board(page)).toHaveAttribute('aria-busy','false')
  await page.getByRole('button',{name:'Fit level',exact:true}).click()
  for (const [tool, start, end] of [['Vertical force field',[500,170],[500,570]], ['Horizontal force field',[620,250],[900,250]]]) {
    await page.getByRole('button',{name:tool,exact:true}).click()
    const a=await point(page,...start),b=await point(page,...end)
    await page.mouse.move(a.x,a.y); await page.mouse.down(); await page.mouse.move(b.x,b.y,{steps:6}); await page.mouse.up()
    await expect(page.getByRole('combobox',{name:'Force field power',exact:true})).toHaveText('Always on')
    await expect.poll(()=>board(page).evaluate(c=>c.fieldHandles.length)).toBe(2)
  }
  await selectBuilderObject(page,'force-field:0')
  const before=await page.getByRole('spinbutton',{name:'Object h',exact:true}).inputValue()
  const handle=await board(page).evaluate(c=>({p:c.fieldHandles[0],ratio:c.width/c.getBoundingClientRect().width}))
  const rect=await board(page).boundingBox(),hx=rect.x+handle.p.x/handle.ratio,hy=rect.y+handle.p.y/handle.ratio
  await page.mouse.move(hx,hy); await page.mouse.down(); await page.mouse.move(hx,hy+40,{steps:6}); await page.mouse.up()
  expect(Number(await page.getByRole('spinbutton',{name:'Object h',exact:true}).inputValue())).toBeLessThan(Number(before))
  await page.getByRole('button',{name:'Undo',exact:true}).click(); await selectBuilderObject(page,'force-field:0')
  await expect(page.getByRole('spinbutton',{name:'Object h',exact:true})).toHaveValue(before)
  await expect(page.getByRole('spinbutton',{name:'Object w',exact:true})).toBeDisabled()
  await selectBuilderOption(page,'Force field power','switched')
  await page.getByRole('group',{name:'Switched by',exact:true}).getByRole('checkbox',{name:'Pressure plate 1',exact:true}).check()
  await board(page).focus(); await page.keyboard.press('Control+c'); await page.keyboard.press('Control+v')
  const saved=await saveTestLevel(page)
  expect(saved.level.forceFields).toHaveLength(3)
  expect(saved.level.forceFields[0]).toMatchObject({orientation:'vertical',power:'switched',w:12,h:Number(before)})
  expect(saved.level.forceFields[1]).toMatchObject({orientation:'horizontal',power:'always',h:12})
  expect(saved.level.forceFields[2].id).not.toBe(saved.level.forceFields[0].id)
  expect(saved.level.triggers[0].targets).toContain(saved.level.forceFields[0].id)
  await reopenTestLevel(page,saved); await selectBuilderObject(page,'force-field:0')
  await expect(page.getByRole('combobox',{name:'Force field power',exact:true})).toHaveText('Switched')
  await expect(page.getByRole('group',{name:'Switched by',exact:true}).getByRole('checkbox',{name:'Pressure plate 1',exact:true})).toBeChecked()
  await page.screenshot({path:info.outputPath('force-field-studio.png')})
})
