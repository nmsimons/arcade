import { test, expect } from './helpers/test.mjs'
import { freshExpedition, SAVE_KEY, powerReceiver } from '../../src/games/hardVacuum/expedition.ts'
import { SURVIVAL_PODS } from '../../src/games/hardVacuum/survivalPods.ts'
import { ARRIVAL_POSITION, DEPARTURE_ROUTE } from '../../src/games/hardVacuum/campaignWorld.ts'
import { setup, tap } from './helpers/controller.mjs'

async function start(page,state) {
  await page.clock.install()
  await page.addInitScript(({key,state})=>{
    if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(state))
  },{key:SAVE_KEY,state})
  await page.goto('/hard-vacuum')
  await page.getByRole('button',{name:'Continue expedition',exact:true}).press('Enter')
}
const atHaven=tethered=>({pos:{x:7868,y:3560},vel:{x:0,y:0},tethered})

for(const width of [360,620])test(`Haven lamps replace survivor counters at ${width}px`,async({page},testInfo)=>{
  await page.setViewportSize({width,height:640})
  const state=freshExpedition('refuge');state.banked=72000;state.credits=1234;state.impactShieldInstalled=true;state.shields=2
  state.rescuedPods=SURVIVAL_PODS.filter(pod=>!pod.locked).map(pod=>pod.id)
  await start(page,state)
  await expect(page.locator('.hud-rescue-count')).toHaveCount(0)
  await expect(page.getByText(/\d+\/12 aboard/)).toHaveCount(0)
  await expect(page.locator('.hud-credits')).toContainText('72,000')
  await page.screenshot({path:testInfo.outputPath('survivor-hud.png')})
})

test('pod rescue banks and persists without counters or duplicate payments',async({page})=>{
  const state=freshExpedition();state.cargo={'survival-01':atHaven(true)}
  await start(page,state)
  await expect(page.locator('.hud-rescue-count')).toHaveCount(0)
  await page.clock.runFor(4000)
  await expect(page.getByRole('status')).toHaveCount(0)
  await expect(page.locator('.hud-credits')).toContainText('1,000')
  await page.keyboard.press('e');await page.clock.runFor(1000)
  await expect(page.getByRole('heading',{name:'Haven outfitter'})).toBeVisible()
  await expect(page.getByText(/Survivors aboard:/)).toHaveCount(0)
  const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY)
  expect(saved.rescuedPods).toEqual(['survival-01']);expect(saved.banked).toBe(1000)
  expect(saved.cargo['survival-01']).toBeUndefined()
  await page.reload();await page.getByRole('button',{name:'Continue expedition',exact:true}).press('Enter')
  await page.clock.runFor(4000)
  await expect(page.locator('.hud-rescue-count')).toHaveCount(0)
  await expect(page.locator('.hud-credits')).toContainText('1,000')
})

test('a pod floating against Haven is not rescued without a prior tether recovery',async({page})=>{
  const state=freshExpedition();state.cargo={'survival-01':atHaven(false)}
  await start(page,state);await page.clock.runFor(4000)
  expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).rescuedPods,SAVE_KEY)).toEqual([])
  await expect(page.locator('.hud-credits')).not.toContainText('1,000')
})

test('the last docked rescue enables launch, and keyboard launch wins only after the tunnel flight',async({page},testInfo)=>{
  test.setTimeout(60000)
  const state=freshExpedition();state.core=true;powerReceiver(state,'ward-power','ward-power');state.doors={}
  state.rescuedPods=SURVIVAL_PODS.filter(pod=>pod.id!=='survival-01').map(pod=>pod.id)
  state.cargo={'survival-01':atHaven(true)}
  await start(page,state)
  await expect(page.getByRole('dialog',{name:'Expedition complete',exact:true})).toHaveCount(0)
  await page.keyboard.press('e');await page.clock.runFor(4000)
  await expect(page.getByRole('dialog',{name:'Expedition complete',exact:true})).toHaveCount(0)
  const launch=page.getByRole('button',{name:'Launch Haven',exact:true})
  await expect(launch).toBeEnabled();await launch.focus();await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog',{name:'Expedition complete',exact:true})).toHaveCount(0)
  await page.clock.runFor(30000)
  await expect(page.getByRole('dialog',{name:'Expedition complete',exact:true})).toBeVisible()
  await expect(page.getByRole('heading',{name:'Everyone is coming home.',exact:true})).toBeVisible()
  await expect(page.getByText(/12\/12/)).toHaveCount(0)
  const escaped=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY)
  expect(escaped.complete).toBe(true);expect(escaped.campaign.haven).toEqual(DEPARTURE_ROUTE.at(-1))
  await page.screenshot({path:testInfo.outputPath('evacuation-complete.png')})
  await page.getByRole('button',{name:'Keep exploring · Esc',exact:true}).press('Enter')
  await expect(page.locator('canvas')).toBeFocused()
})

test('departure remains unavailable with a missing survivor',async({page})=>{
  const state=freshExpedition();state.core=true;state.rescuedPods=SURVIVAL_PODS.slice(1).map(p=>p.id)
  await start(page,state);await page.keyboard.press('e');await page.clock.runFor(1000)
  await expect(page.getByRole('button',{name:'Launch Haven',exact:true})).toBeDisabled()
  await expect(page.getByText('Passengers missing.',{exact:true})).toBeVisible()
  await expect(page.getByText(/11\/12/)).toHaveCount(0)
})

test('a controller can select and authorize Haven departure',async({page})=>{
  test.setTimeout(60000)
  const state=freshExpedition();state.core=true;state.rescuedPods=SURVIVAL_PODS.map(p=>p.id)
  await setup(page,state);await tap(page,0);await tap(page,3);await page.clock.runFor(1000)
  const launch=page.getByRole('button',{name:'Launch Haven',exact:true})
  await expect(launch).toBeEnabled()
  for(let i=0;i<8&&!(await launch.evaluate(el=>el===document.activeElement));i++)await tap(page,12)
  await expect(launch).toBeFocused();await tap(page,0)
  await page.clock.runFor(30000)
  await expect(page.getByRole('heading',{name:'Everyone is coming home.',exact:true})).toBeVisible()
})

test('a new expedition starts in the Access Tunnel and leaves survivor tracking to Haven',async({page},testInfo)=>{
  await page.clock.install();await page.goto('/hard-vacuum')
  await page.getByRole('button',{name:'Launch expedition',exact:true}).press('Enter')
  await page.clock.runFor(500)
  await expect(page.locator('.hud-room')).toHaveText('Access Tunnel')
  await expect(page.getByText(/Follow the tunnel left/)).toHaveCount(0)
  await expect(page.locator('.hud-rescue-count')).toHaveCount(0)
  await expect(page.getByText('Hull exposed',{exact:true})).toBeVisible()
  await page.screenshot({path:testInfo.outputPath('arrival-tunnel.png')})
  const state=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY)
  expect(state.position).toEqual(ARRIVAL_POSITION)
})
