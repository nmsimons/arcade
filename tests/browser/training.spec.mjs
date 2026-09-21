import { test, expect } from './helpers/test.mjs'
import { setup, tap, hold, saved, armed } from './helpers/controller.mjs'
import { advanceSimulation, pauseSimulation } from './helpers/simulation.mjs'
import { freshExpedition, newExpedition, SAVE_KEY } from '../../src/games/hardVacuum/expedition.ts'

async function captureFloor(page) {
  await page.addInitScript(()=>{
    window.floorWords=[]
    const original=CanvasRenderingContext2D.prototype.fillText
    CanvasRenderingContext2D.prototype.fillText=function(text,...args) {
      if(!window.floorWords.includes(text))window.floorWords.push(text)
      return original.call(this,text,...args)
    }
  })
}
test('keyboard training has floor instructions, minimal HUD, working menus and never touches the saved expedition',async({page},info)=>{
  const state=freshExpedition();state.banked=4567;const bytes=JSON.stringify(state)
  await page.addInitScript(({key,bytes})=>{localStorage.setItem(key,bytes);localStorage.setItem(`${key}-backup`,bytes)},{key:SAVE_KEY,bytes})
  await captureFloor(page)
  await page.clock.install();await page.goto('/hard-vacuum')
  await page.getByRole('button',{name:'Flight training',exact:true}).press('Enter')
  await expect(page.locator('.hud-room')).toHaveText('Flight training')
  await expect(page.locator('canvas')).toBeFocused()
  await page.clock.runFor(100)
  await expect(page.getByText('Hull exposed',{exact:true})).toBeVisible()
  await expect(page.getByRole('meter')).toHaveCount(0)
  await expect(page.getByRole('button',{name:'Station map',exact:true})).toHaveCount(0)
  expect(await page.evaluate(()=>window.floorWords)).toContain('HOLD Space  CUTTING LASER')
  await page.screenshot({path:info.outputPath('training-flight.png')})
  await page.keyboard.press('w',{delay:100});await page.keyboard.press('f');await page.clock.runFor(100)
  await page.keyboard.press('Escape');await expect(page.getByRole('dialog',{name:'Training paused'})).toBeVisible()
  await page.keyboard.press('ArrowRight');await expect(page.getByRole('button',{name:'Restart simulation'})).toBeFocused()
  await page.keyboard.press('Enter');await expect(page.locator('canvas')).toBeFocused()
  await page.keyboard.press('g');await expect(page.getByText('No recordings downloaded',{exact:true})).toBeVisible()
  await page.keyboard.press('Escape');await page.keyboard.press('Escape')
  await page.clock.runFor(3500)
  expect(await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY)).toBe(bytes)
  expect(await page.evaluate(key=>localStorage.getItem(`${key}-backup`),SAVE_KEY)).toBe(bytes)
  await page.keyboard.press('Escape');await page.getByRole('button',{name:'Leave training'}).press('Enter')
  await expect(page.getByRole('button',{name:'Continue expedition',exact:true})).toBeVisible()
  expect(await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY)).toBe(bytes)
})

test('training is available with an unreadable save and leaving preserves the original bytes',async({page})=>{
  await page.addInitScript(key=>localStorage.setItem(key,'broken save — keep me'),SAVE_KEY)
  await page.goto('/hard-vacuum');await page.getByRole('button',{name:'Flight training',exact:true}).click()
  await page.keyboard.press('Escape');await page.getByRole('button',{name:'Leave training'}).click()
  expect(await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY)).toBe('broken save — keep me')
  await expect(page.getByRole('button',{name:'Launch expedition',exact:true})).toHaveCount(0)
})

test('controller enters training, updates floor bindings, navigates reset and leave, and disconnect pauses safely',async({page})=>{
  await captureFloor(page);await setup(page)
  await tap(page,15);await expect(page.getByRole('button',{name:'Flight training',exact:true})).toBeFocused()
  await tap(page,0);await page.clock.runFor(100)
  await expect(page.locator('.hud-room')).toHaveText('Flight training')
  expect(await page.evaluate(()=>window.floorWords)).toContain('HOLD A / ×  CUTTING LASER')
  expect(await page.evaluate(()=>window.floorWords)).toContain('RT / R2  THRUST     LT / L2  REVERSE')
  expect(await page.evaluate(()=>window.floorWords)).toContain('LB / L1 / RB / R1  STRAFE LEFT / RIGHT')
  expect(await page.evaluate(()=>window.floorWords)).toContain('TAP X / □  TETHER / RELEASE')
  await tap(page,9);await expect(page.getByRole('dialog',{name:'Training paused'})).toBeVisible()
  await tap(page,15);await expect(page.getByRole('button',{name:'Restart simulation'})).toBeFocused()
  await tap(page,0);await expect(page.locator('canvas')).toBeFocused()
  await page.evaluate(()=>{window.testPad.connected=false;window.floorWords=[]});await page.clock.runFor(100)
  await expect(page.getByRole('dialog',{name:'Training paused'})).toBeVisible()
  expect(await page.evaluate(()=>window.floorWords)).toContain('HOLD Space  CUTTING LASER')
  expect((await page.evaluate(()=>window.floorWords)).some(text=>text.includes('STRAFE'))).toBe(false)
  await page.evaluate(()=>{window.testPad.connected=true});await page.clock.runFor(100)
  await tap(page,15);await tap(page,15);await expect(page.getByRole('button',{name:'Leave training'})).toBeFocused()
  await tap(page,0);await expect(page.getByRole('button',{name:'Continue expedition',exact:true})).toBeVisible()
})

async function startExpedition(page,state) {
  await page.addInitScript(({key,state})=>localStorage.setItem(key,JSON.stringify(state)),{key:SAVE_KEY,state})
  await page.clock.install();await page.goto('/hard-vacuum')
  await expect(page.getByRole('button',{name:'Continue expedition',exact:true})).toBeVisible()
  await pauseSimulation(page)
  await page.getByRole('button',{name:'Continue expedition',exact:true}).press('Enter')
}

test('pause-menu training is keyboard-accessible before Haven activation and returns to the frozen expedition',async({page},info)=>{
  await startExpedition(page,newExpedition())
  await page.clock.runFor(100);await page.keyboard.press('Escape')
  const before=await saved(page)
  expect(before.campaign.havenActivated).toBe(false)
  await page.keyboard.press('Tab');await page.keyboard.press('Tab')
  const help=page.getByRole('button',{name:'Flight training · Help',exact:true})
  await expect(help).toBeFocused()
  await page.screenshot({path:info.outputPath('pause-help.png')})
  await page.keyboard.press('Enter')
  await expect(page.locator('.hud-room')).toHaveText('Flight training')
  await expect(page.locator('canvas')).toHaveCount(1)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await advanceSimulation(page,5000)
  await page.keyboard.press('Escape')
  await page.keyboard.press('End');await expect(page.getByRole('button',{name:'Return to expedition'})).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog',{name:'Expedition paused'})).toBeVisible()
  await expect(page.getByRole('button',{name:'Resume · P / Esc',exact:true})).toBeFocused()
  await page.clock.runFor(300)
  expect(await saved(page)).toEqual(before)
  await page.keyboard.press('Escape')
  await expect(page.locator('canvas')).toBeFocused()
  await expect(page.locator('.hud-room')).toHaveText('Access Tunnel')
  await page.keyboard.press('Escape')
  expect(await saved(page)).toEqual(before)
  await expect(help).toBeVisible()
})

test('training preserves the live Haven tether and unsaved progress even when storage fails',async({page})=>{
  const state=newExpedition();state.position={x:8050,y:3560};state.visited.push('breach');state.credits=321
  await startExpedition(page,state)
  await page.clock.runFor(200)
  const before=await saved(page)
  await page.evaluate(()=>{
    window.originalStorageWrite=Storage.prototype.setItem
    Storage.prototype.setItem=function(){throw new DOMException('Full','QuotaExceededError')}
  })
  await page.keyboard.press('f');await page.clock.runFor(600)
  const recording=page.getByRole('button',{name:'Read recording: A link to come back to',exact:true})
  await expect(recording).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByText(/Recovery link: Haven/)).toBeVisible()
  await page.getByRole('button',{name:'Flight training · Help',exact:true}).press('Enter')
  await advanceSimulation(page,4000)
  await page.keyboard.press('Escape');await page.getByRole('button',{name:'Restart simulation'}).press('Enter')
  await page.clock.runFor(200)
  await page.keyboard.press('Escape');await page.getByRole('button',{name:'Return to expedition'}).press('Enter')
  await expect(page.getByRole('dialog',{name:'Expedition paused'})).toBeVisible()
  await expect(page.getByText(/Recovery link: Haven/)).toBeVisible()
  expect(await saved(page)).toEqual(before)
  await page.evaluate(()=>{Storage.prototype.setItem=window.originalStorageWrite})
  await page.keyboard.press('Escape')
  await expect(recording).toBeVisible()
  // Tick once to prove the actual cable survived, not just an old HUD snapshot.
  await page.clock.runFor(200)
  await expect(recording).toBeVisible()
  await page.keyboard.press('Escape')
  const after=await saved(page)
  expect(after.campaign.havenActivated).toBe(true)
  expect(after.campaign.havenLinkPending).toBe(true)
  expect(after.campaign.records).toContain('first-light')
  expect(after.credits).toBe(321)
  expect(after.campaign.playedSeconds-before.campaign.playedSeconds).toBeLessThan(1)
})

test('controller can revisit pause-menu help without held confirm resuming or resetting the expedition',async({page})=>{
  const state=armed();state.credits=567;state.banked=8901
  await setup(page,state);await tap(page,0);await tap(page,9)
  const before=await saved(page)
  for(let visit=0;visit<2;visit++) {
    await tap(page,15);await tap(page,15)
    await expect(page.getByRole('button',{name:'Flight training · Help',exact:true})).toBeFocused()
    await hold(page,0,1,400)
    await expect(page.locator('.hud-room')).toHaveText('Flight training')
    await hold(page,0,0)
    await tap(page,9);await tap(page,15);await tap(page,15)
    await expect(page.getByRole('button',{name:'Return to expedition'})).toBeFocused()
    await hold(page,0,1,600)
    await expect(page.getByRole('dialog',{name:'Expedition paused'})).toBeVisible()
    await expect(page.getByRole('button',{name:'Resume · B / ○',exact:true})).toBeFocused()
    expect(await saved(page)).toEqual(before)
    await hold(page,0,0)
  }
  await tap(page,1)
  await expect(page.locator('canvas')).toBeFocused()
  await expect(page.getByRole('button',{name:'Fire blaster, 3 of 3 charges',exact:true})).toBeVisible()
})
