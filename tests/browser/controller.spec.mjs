import { test, expect } from './helpers/test.mjs'
import { freshExpedition, powerReceiver } from '../../src/games/hardVacuum/expedition.ts'
import { BERTHS } from '../../src/games/hardVacuum/campaignWorld.ts'
import { setup, hold, tap, saved, armed } from './helpers/controller.mjs'

test('controller-only launch, RT thrust, turn-only stick, pause, map and recorder work without menu input leaking into flight',async({page})=>{
  const state=armed();state.cargo={'rescue-cache':{pos:{x:7660,y:3490},vel:{x:0,y:0},tethered:false}}
  await setup(page,state)
  await expect(page.getByText(/Controller connected/)).toBeVisible()
  await hold(page,0,1,500)
  await expect(page.locator('canvas')).toBeFocused()
  await tap(page,9)
  await expect(page.getByRole('dialog',{name:'Expedition paused',exact:true})).toBeVisible()
  expect((await saved(page)).position).toEqual(state.position,'holding A after selecting Continue must not thrust')
  expect((await saved(page)).cargo['rescue-cache'].vel).toEqual({x:0,y:0},'holding A after selecting Continue must not fire the laser')
  await hold(page,0,0);await tap(page,9)
  await page.evaluate(()=>{window.testPad.axes[1]=-1});await page.clock.runFor(250)
  await page.evaluate(()=>{window.testPad.axes[1]=1});await page.clock.runFor(250)
  await page.evaluate(()=>{window.testPad.axes[1]=0});await tap(page,9)
  expect((await saved(page)).position).toEqual(state.position,'vertical stick motion never thrusts or reverses')
  await tap(page,9);await hold(page,7,1,250);await hold(page,7,0);await tap(page,9)
  expect((await saved(page)).position.x).toBeLessThan(state.position.x)
  await tap(page,9);await tap(page,8)
  await expect(page.getByRole('dialog',{name:'Station survey',exact:true})).toBeVisible()
  await tap(page,15)
  await expect(page.getByRole('button',{name:'Zoom · 2× · X / □',exact:true})).toBeFocused()
  await tap(page,0)
  await expect(page.getByText('Pan · Left stick',{exact:true})).toBeVisible()
  await tap(page,3)
  await expect(page.getByRole('button',{name:'Local survey · Y / △',exact:true})).toBeVisible()
  await tap(page,15);await tap(page,1)
  await expect(page.getByRole('dialog',{name:'Station survey',exact:true})).toHaveCount(0)
  await tap(page,4)
  await expect(page.getByRole('dialog',{name:'Flight recorder',exact:true})).toBeVisible()
  await tap(page,1)
  await expect(page.getByRole('dialog',{name:'Expedition paused',exact:true})).toBeVisible()
  await tap(page,1)
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

for(const [trigger,name] of [[7,'RT'],[6,'LT']]) test(`LT reverses, but partial ${name} held through a menu stays neutral until released`,async({page})=>{
  const state=armed();await setup(page,state)
  await hold(page,trigger,.25);await tap(page,0);await page.clock.runFor(300);await tap(page,9)
  expect((await saved(page)).position).toEqual(state.position)
  await hold(page,trigger,0);await tap(page,9)
  await hold(page,6,.525,250);await hold(page,6,0);await tap(page,9)
  expect((await saved(page)).position.x).toBeGreaterThan(state.position.x)
})

test('B blasts once per press and A holds the real laser, while equipment stays gated',async({page})=>{
  const state=armed();state.cargo={'rescue-cache':{pos:{x:7660,y:3490},vel:{x:0,y:0},tethered:false}}
  await setup(page,state);await tap(page,0)
  await hold(page,1,1,1000)
  await expect(page.getByRole('button',{name:'Fire blaster, 2 of 3 charges',exact:true})).toBeVisible()
  await hold(page,1,0);await tap(page,1)
  await expect(page.getByRole('button',{name:'Fire blaster, 1 of 3 charges',exact:true})).toBeVisible()
  await hold(page,0,1,700);await hold(page,0,0);await tap(page,9)
  const afterLaser=await saved(page)
  expect(afterLaser.cargo['rescue-cache'].vel.x).toBeLessThan(-50)
  expect(afterLaser.cargo['rescue-cache'].tethered).toBe(false)
  await tap(page,9);await tap(page,3);await tap(page,9)
  expect((await saved(page)).teleporterInstalled).toBe(false,'Y cannot grant a missing teleporter')
})

test('X connects and releases a cargo cable; RB and closing the pause menu cannot fire it',async({page})=>{
  const state=armed()
  state.cargo={'rescue-cache':{pos:{x:7710,y:3490},vel:{x:0,y:0},tethered:false}}
  await setup(page,state);await tap(page,0);await tap(page,9)
  await hold(page,1,1,400);await hold(page,1,0);await tap(page,9)
  expect((await saved(page)).cargo['rescue-cache'].tethered).toBe(false)
  expect((await saved(page)).blasterCharges).toBe(3)
  await tap(page,9);await tap(page,5);await page.clock.runFor(400);await tap(page,9)
  expect((await saved(page)).cargo['rescue-cache'].tethered).toBe(false,'RB no longer fires the tether')
  await tap(page,9);await tap(page,2);await page.clock.runFor(400)
  await tap(page,9)
  expect((await saved(page)).cargo['rescue-cache'].tethered).toBe(true)
  await tap(page,9);await tap(page,2);await page.clock.runFor(200)
  // The saved tethered flag records cargo claimed by the pilot, not a live cable.
  await expect(page.getByRole('status').filter({hasText:'Cable released.'})).toHaveCount(0)
})

test('Y docks; menus skip locked upgrades and B undocks',async({page})=>{
  const state=freshExpedition();state.banked=10000;state.teleporterInstalled=true
  await setup(page,state);await tap(page,0);await tap(page,3);await page.clock.runFor(800)
  await expect(page.getByRole('heading',{name:'Haven outfitter',exact:true})).toBeVisible()
  await expect(page.getByRole('button',{name:'Undock · B / ○',exact:true})).toBeFocused()
  await tap(page,12)
  const active=await page.evaluate(()=>({tag:document.activeElement.tagName,disabled:document.activeElement.disabled}))
  expect(active).toEqual({tag:'BUTTON',disabled:false})
  await tap(page,1);await page.clock.runFor(800)
  await expect(page.getByRole('heading',{name:'Haven outfitter',exact:true})).toHaveCount(0)
})

test('Y teleports home, banks credits and does not also dock until released and pressed again',async({page})=>{
  const state=armed();state.teleporterInstalled=true;state.credits=123
  await setup(page,state);await tap(page,0);await hold(page,3,1,500)
  await expect(page.getByRole('heading',{name:'Haven outfitter',exact:true})).toHaveCount(0)
  const home=await saved(page)
  expect(home.position).toEqual(freshExpedition().position)
  expect(home.credits).toBe(0);expect(home.banked).toBe(123)
  await hold(page,3,0);await tap(page,3);await page.clock.runFor(800)
  await expect(page.getByRole('heading',{name:'Haven outfitter',exact:true})).toBeVisible()
})

for(const blocked of [false,true])test(`Y calls Haven instead of teleporting from a berth${blocked ? ' even when the route is blocked' : ''}`,async({page})=>{
  const state=armed();state.teleporterInstalled=true;state.credits=123
  const berth=BERTHS.find(berth=>berth.id==='freight')
  state.position={...berth.pos};state.visited.push('freight');state.campaign.berths.push('freight')
  powerReceiver(state,'freight-power','freight-power')
  if(!blocked)powerReceiver(state,'breach-power','breach-power')
  state.doors={}
  await setup(page,state);await tap(page,0);await hold(page,3,1,300);await hold(page,3,0);await tap(page,9)
  const called=await saved(page)
  expect(called.position).toEqual(berth.pos)
  expect(called.credits).toBe(123)
  if(blocked)expect(called.campaign.journey).toBeUndefined()
  else {
    expect(called.campaign.journey.destination).toBe('freight')
    expect(called.campaign.journey.riding).toBe(false)
  }
})

test('disconnect and loss of focus pause safely; reconnection cannot activate a held A button',async({page})=>{
  await setup(page,armed());await tap(page,0)
  await hold(page,7,1,150)
  await hold(page,0,1)
  await page.evaluate(()=>{window.testPad.connected=false});await page.clock.runFor(64)
  await expect(page.getByRole('dialog',{name:'Expedition paused',exact:true})).toBeVisible()
  await expect(page.getByText(/Controller disconnected/)).toBeVisible()
  await page.evaluate(()=>{window.testPad.connected=true});await page.clock.runFor(500)
  await expect(page.getByRole('dialog',{name:'Expedition paused',exact:true})).toBeVisible()
  await hold(page,7,0);await hold(page,0,0);await tap(page,9)
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.clock.runFor(64)
  await expect(page.getByRole('dialog',{name:'Expedition paused',exact:true})).toBeVisible()
  await hold(page,0,1)
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.clock.runFor(64)
  await expect(page.getByRole('dialog',{name:'Expedition paused',exact:true})).toBeVisible()
  await hold(page,0,0);await tap(page,1)
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('D-pad navigation and held confirmation cannot overwrite a save; unsupported controllers leave the keyboard usable',async({page})=>{
  const state=freshExpedition();state.banked=4321
  await setup(page,state)
  await tap(page,13);await tap(page,13);await tap(page,13)
  await expect(page.getByRole('button',{name:'Start a new expedition…',exact:true})).toBeFocused()
  await hold(page,0,1,500)
  await expect(page.getByRole('alertdialog',{name:'Replace saved expedition',exact:true})).toBeVisible()
  await expect(page.getByRole('button',{name:'Cancel · B / ○',exact:true})).toBeFocused()
  expect((await saved(page)).banked).toBe(4321)
  await hold(page,0,0);await tap(page,13);await tap(page,1)
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  expect((await saved(page)).banked).toBe(4321)
  await page.evaluate(()=>{window.testPad.mapping=''});await page.clock.runFor(64)
  await expect(page.getByText(/without a standard layout/)).toBeVisible()
  await page.getByRole('button',{name:'Continue expedition',exact:true}).press('Enter')
  await page.clock.runFor(64)
  await expect(page.locator('canvas')).toBeFocused()
  await page.keyboard.press('p')
  await expect(page.getByRole('dialog',{name:'Expedition paused',exact:true})).toBeVisible()
})

test('unavailable or blocked controller access does not prevent keyboard play',async({page})=>{
  await setup(page)
  await page.evaluate(()=>{navigator.getGamepads=undefined});await page.clock.runFor(64)
  await expect(page.getByText(/Controller access unavailable/)).toBeVisible()
  await page.evaluate(()=>{navigator.getGamepads=()=>{throw new DOMException('Blocked','SecurityError')}})
  await page.clock.runFor(64)
  await page.getByRole('button',{name:'Continue expedition',exact:true}).press('Enter')
  await page.clock.runFor(64);await page.keyboard.press('p')
  await expect(page.getByRole('dialog',{name:'Expedition paused',exact:true})).toBeVisible()
})
