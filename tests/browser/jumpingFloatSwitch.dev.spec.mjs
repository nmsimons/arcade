import { test, expect } from './helpers/folderTest.mjs'
import { finishJumpingEntrance, useLevelFixtures, installTestFolder, selectBuilderObject, selectBuilderOption, saveTestLevel, reopenTestLevel, restartFromPause } from './helpers/jumpingLevels.mjs'
import { readLevelAsset } from '../helpers/jumping-fixtures.mjs'

test('float switch editor controls, outputs, undo, duplication and saved templates work', async ({page}, info) => {
  const level = readLevelAsset('float-switch.json')
  await useLevelFixtures(page,[level]); await installTestFolder(page,{'floats.json':level})
  await page.goto('/lab')
  await page.getByRole('button',{name:'Level studio',exact:true}).click()
  await page.getByRole('button',{name:'Library',exact:true}).click()
  await page.getByRole('dialog').getByRole('button',{name:'Local folder',exact:true}).click()
  await page.getByRole('button',{name:'Choose folder',exact:true}).click()
  await page.getByRole('button',{name:'Open floats.json',exact:true}).click()
  const canvas=page.getByRole('application',{name:'Level canvas'})
  await expect(canvas).toHaveAttribute('aria-busy','false')
  await selectBuilderObject(page,'float-switch:0')
  await expect(page.getByRole('combobox',{name:'Float activation',exact:true})).toHaveText('Raised')
  await expect(page.getByRole('group',{name:'Switched by',exact:true})).toHaveCount(0)
  await expect(page.getByRole('combobox',{name:/power/i})).toHaveCount(0)
  await page.getByRole('spinbutton',{name:'Float arm length',exact:true}).fill('120')
  await page.getByRole('spinbutton',{name:'Float arm length',exact:true}).press('Enter')
  await selectBuilderOption(page,'Float activation','lowered')
  await selectBuilderOption(page,'Float starting position','raised')
  await page.getByRole('button',{name:'Flip horizontally',exact:true}).click()
  await page.getByRole('button',{name:'Undo',exact:true}).click()
  await selectBuilderObject(page,'float-switch:0')
  await page.getByRole('button',{name:'Redo',exact:true}).click()
  await selectBuilderObject(page,'float-switch:0')
  await page.getByRole('group',{name:'Activates',exact:true}).getByRole('checkbox',{name:'Wall light 1',exact:true}).uncheck()
  await page.getByRole('button',{name:'Duplicate',exact:true}).click()
  const saved=await saveTestLevel(page)
  expect(saved.level.floatSwitches).toHaveLength(3)
  expect(saved.level.floatSwitches[0]).toMatchObject({armLength:120,activeWhen:'lowered',startsRaised:true,flipX:true,targets:['exit']})
  expect(saved.level.floatSwitches[2].id).not.toBe(saved.level.floatSwitches[0].id)
  await page.screenshot({path:info.outputPath('float-switch-inspector.png')})
  await page.reload(); await reopenTestLevel(page,saved)
  await selectBuilderObject(page,'float-switch:0')
  await expect(page.getByRole('combobox',{name:'Float activation',exact:true})).toHaveText('Lowered')
  await expect(page.getByRole('spinbutton',{name:'Float arm length',exact:true})).toHaveValue('120')
  await page.getByRole('button',{name:'Float switch',exact:true}).click()
  const bounds=await canvas.boundingBox()
  await canvas.click({position:{x:bounds.width*.5,y:bounds.height*.45}})
  const placed=await saveTestLevel(page)
  expect(placed.level.floatSwitches).toHaveLength(4)
})

test('normal controls raise water and grav floats, open the exit, drain and restart', async ({page}, info) => {
  test.setTimeout(60_000)
  const level=readLevelAsset('float-switch.json')
  await useLevelFixtures(page,[level])
  await page.addInitScript(() => {
    const arc=CanvasRenderingContext2D.prototype.arc
    CanvasRenderingContext2D.prototype.arc=function(x,y,r,...rest) {
      if(r===11 && y===550 && [420,950].includes(x)) {
        this.canvas.floatContacts ??= {}; this.canvas.floatContacts[x]=this.fillStyle==='#a9d56b'
      }
      if(r===20 && this.fillStyle==='#8f9e98') {
        this.canvas.floatCenters ??= {}; this.canvas.floatCenters[x<750?'water':'gravity']={x,y}
      }
      return arc.call(this,x,y,r,...rest)
    }
  })
  await page.clock.install({time:new Date('2026-01-01T00:00:00Z')})
  await page.goto('/lab?motionDebug=1')
  await expect(page.locator('.jumping-level-card[aria-pressed=true]')).toBeVisible()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.locator('.jumping-level-card[aria-pressed=true]').click(); await finishJumpingEntrance(page)
  const canvas=page.getByRole('img',{name:`${level.name}: reach the exit`})
  await expect(canvas).toBeFocused(); await page.clock.runFor(64)
  const contacts=()=>canvas.evaluate(c=>c.floatContacts)
  const x=()=>page.evaluate(()=>window.jumpingMotion.read().recent.at(-1)?.x ?? 100)
  const walkTo=async target=>{
    const direction=target>await x()?1:-1,key=direction>0?'d':'a'
    await page.keyboard.down(key)
    for(let i=0;i<400 && (await x()-(target-direction*50))*direction<0;i++) await page.clock.runFor(16)
    await page.keyboard.up(key); await page.clock.runFor(350)
  }
  expect(await contacts()).toEqual({'420':false,'950':false})
  await walkTo(320); await page.clock.runFor(3000)
  expect(await contacts()).toEqual({'420':true,'950':false})
  expect((await canvas.evaluate(c=>c.floatCenters.water)).y).toBeLessThan(550)
  await page.screenshot({path:info.outputPath('water-float-raised.png')})
  await walkTo(870); await page.clock.runFor(1000)
  expect(await contacts()).toEqual({'420':true,'950':true})
  await page.screenshot({path:info.outputPath('grav-float-raised.png')})
  await walkTo(760); await walkTo(870); await page.clock.runFor(1000)
  expect(await contacts()).toEqual({'420':true,'950':false})
  await walkTo(760); await walkTo(320); await page.clock.runFor(3000)
  expect(await contacts()).toEqual({'420':false,'950':false})
  await page.screenshot({path:info.outputPath('water-float-lowered.png')})
  await restartFromPause(page); await page.clock.runFor(64)
  expect(await contacts()).toEqual({'420':false,'950':false})
  await walkTo(320); await page.clock.runFor(3000)
  await walkTo(870); await page.clock.runFor(1000)
  await page.keyboard.down('d'); await page.clock.runFor(5000); await page.keyboard.up('d')
  await expect(page.getByRole('dialog',{name:'Level complete',exact:true})).toBeVisible()
})
