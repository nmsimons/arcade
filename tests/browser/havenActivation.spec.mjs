import { test, expect } from './helpers/test.mjs'
import { freshExpedition, newExpedition, powerReceiver, SAVE_KEY } from '../../src/games/hardVacuum/expedition.ts'
import { setup, tap } from './helpers/controller.mjs'
import { advanceSimulation, pauseSimulation } from './helpers/simulation.mjs'

async function start(page,state) {
  await page.clock.install()
  await page.addInitScript(({key,state})=>{
    if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(state))
  },{key:SAVE_KEY,state})
  await page.goto('/hard-vacuum')
  await expect(page.getByRole('button',{name:'Continue expedition',exact:true})).toBeVisible()
  await pauseSimulation(page)
  await page.getByRole('button',{name:'Continue expedition',exact:true}).press('Enter')
}
const saved=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY)
const approach=()=>{const s=newExpedition();s.position={x:8050,y:3560};s.visited.push('breach');return s}
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

test('keyboard tether wakes Haven, saves the link, and retains it after reload',async({page},testInfo)=>{
  test.setTimeout(60000)
  await captureFloor(page)
  await start(page,approach());await page.clock.runFor(200)
  expect((await page.evaluate(()=>window.floorWords)).join('\n')).not.toMatch(/ · (Connect|Read|Disconnect)/)
  expect((await page.evaluate(()=>window.floorWords)).join('\n')).not.toMatch(/TOW TO HAVEN|SEAT POWER CELL|REGISTER RECOVERY|SHIELD RECHARGES|VIA STORES|RELEASE POD CLAMPS/)
  await expect(page.getByRole('status').filter({hasText:'Haven is dormant'})).toHaveCount(0)
  await page.screenshot({path:testInfo.outputPath('haven-dormant.png')})
  await page.keyboard.press('e');await page.clock.runFor(100)
  expect((await saved(page)).campaign.havenActivated).toBe(false)
  await expect(page.getByRole('heading',{name:'Haven outfitter'})).toHaveCount(0)
  await page.keyboard.press('f');await page.clock.runFor(600)
  expect((await saved(page)).campaign.havenActivated).toBe(true)
  const message=page.getByRole('button',{name:'Read recording: A link to come back to',exact:true})
  await expect(message).toBeVisible();await expect(message).toContainText('Recovery link established.')
  await expect(message).toContainText('impact-shield module in the rescue locker')
  await expect(message).toContainText('passage west of me')
  expect((await page.evaluate(()=>window.floorWords)).join('\n')).not.toMatch(/ · (Connect|Read|Disconnect)/)
  await expect(message).not.toContainText('Log ·')
  expect(await page.evaluate(()=>window.floorWords)).not.toContain('Dock · E')
  await expect(page.locator('.tether-info')).toHaveCount(1)
  await expect(page.getByRole('status')).toHaveCount(0)
  await page.screenshot({path:testInfo.outputPath('haven-online.png')})
  await advanceSimulation(page,20000)
  await expect(message).toBeVisible()
  expect((await saved(page)).campaign.havenLinkPending).toBe(true)
  await message.press('Enter')
  await expect(page.getByRole('dialog',{name:'Flight recorder'})).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog',{name:'Expedition paused'})).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(message).toBeVisible()
  await page.keyboard.press('f');await page.clock.runFor(500)
  await expect(message).toHaveCount(0)
  expect(await page.evaluate(()=>window.floorWords)).not.toContain('Dock · E')
  expect((await saved(page)).campaign.havenLinkPending).toBeUndefined()
  await page.screenshot({path:testInfo.outputPath('haven-link-retracting.png')})
  await page.clock.runFor(1000)
  expect(await page.evaluate(()=>window.floorWords)).toContain('Dock · E')
  await expect(page.getByRole('button',{name:/^Dock ·/})).toHaveCount(0)
  await page.screenshot({path:testInfo.outputPath('haven-link-stowed.png')})
  await page.clock.resume();await page.reload()
  await expect(page.getByRole('button',{name:'Continue expedition',exact:true})).toBeVisible()
  await pauseSimulation(page)
  await page.getByRole('button',{name:'Continue expedition',exact:true}).press('Enter')
  await page.clock.runFor(200)
  await expect(page.getByText('Haven is dormant.',{exact:false})).toHaveCount(0)
  expect((await saved(page)).campaign.havenLinkPending).toBeUndefined()
  await page.keyboard.press('Escape')
  await expect(page.getByText(/Recovery link: Haven/)).toBeVisible()
})

test('controller tether works without repeating training hints beside Haven or logs',async({page})=>{
  await captureFloor(page)
  await setup(page,approach());await tap(page,0);await page.clock.runFor(200)
  expect((await page.evaluate(()=>window.floorWords)).join('\n')).not.toMatch(/ · (Connect|Read|Disconnect)/)
  const lesson=page.getByRole('status').filter({hasText:'Haven is dormant'})
  await expect(lesson).toHaveCount(0)
  await tap(page,2);await page.clock.runFor(600)
  expect((await saved(page)).campaign.havenActivated).toBe(true)
  const message=page.getByRole('button',{name:'Read recording: A link to come back to',exact:true})
  await expect(message).toBeVisible();await expect(message).toContainText('Recovery link established.')
  expect((await page.evaluate(()=>window.floorWords)).join('\n')).not.toMatch(/ · (Connect|Read|Disconnect)/)
  await expect(message).not.toContainText('Log ·')
  expect((await saved(page)).campaign.havenLinkPending).toBe(true)
  await tap(page,2);await page.clock.runFor(1500)
  expect((await saved(page)).campaign.havenLinkPending).toBeUndefined()
  await expect(message).toHaveCount(0)
})

for(const active of [false,true])test(`death ${active ? 'after' : 'before'} activation offers the right recovery flow`,async({page},testInfo)=>{
  test.setTimeout(60000)
  const s=active ? freshExpedition() : newExpedition()
  s.position={x:1500,y:4090};s.credits=81;s.banked=800
  powerReceiver(s,'refuge-power','refuge-power');s.doors={}
  await start(page,s)
  await advanceSimulation(page,20000)
  const dialog=page.getByRole('dialog',{name:active ? 'Ship recovery' : 'Expedition lost',exact:true})
  await expect(dialog).toBeVisible()
  const button=dialog.getByRole('button',{name:active ? 'Respawn' : 'Start again',exact:true})
  await expect(button).toBeFocused()
  await expect(dialog).toContainText(active ? 'Recovery complete.' : 'Expedition ended.')
  const state=await saved(page)
  expect(state.campaign.havenActivated).toBe(active)
  expect(state.banked).toBe(active ? 800 : 0)
  expect(state.credits).toBe(0)
  await page.screenshot({path:testInfo.outputPath(active ? 'reconstruction.png' : 'no-recovery.png')})
  await button.press('Enter');await page.clock.runFor(64)
  await expect(page.locator('.hud-room')).toHaveText(active ? 'The Breach' : 'Access Tunnel')
  expect((await saved(page)).campaign.havenActivated).toBe(active)
})

test('controller can start again after an unregistered death',async({page})=>{
  test.setTimeout(60000)
  const s=newExpedition();s.position={x:1500,y:4090}
  powerReceiver(s,'refuge-power','refuge-power');s.doors={}
  await setup(page,s);await tap(page,0);await advanceSimulation(page,20000)
  await expect(page.getByRole('button',{name:'Start again',exact:true})).toBeFocused()
  await tap(page,0)
  await expect(page.locator('.hud-room')).toHaveText('Access Tunnel')
  expect((await saved(page)).campaign.havenActivated).toBe(false)
})
