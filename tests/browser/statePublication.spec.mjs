import { test, expect } from './helpers/test.mjs'
import { freshExpedition, newExpedition, SAVE_KEY } from '../../src/games/hardVacuum/expedition.ts'
import { SURVIVAL_PODS } from '../../src/games/hardVacuum/survivalPods.ts'

async function start(page,state) {
  const cdp=await page.context().newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:2})
  await page.clock.install({time:new Date('2026-01-01T00:00:00Z')})
  await page.addInitScript(({key,state})=>{
    if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(state))
  },{key:SAVE_KEY,state})
  await page.goto('/hard-vacuum')
  await expect(page.getByRole('button',{name:'Continue expedition',exact:true})).toBeVisible()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.getByRole('button',{name:'Continue expedition',exact:true}).press('Enter')
}
const saved=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY)
const cargoAtHaven={pos:{x:7868,y:3560},vel:{x:0,y:0},tethered:true}

test('a slower browser publishes installed equipment and restores the same state after reload',async({page})=>{
  test.setTimeout(60000)
  const state=freshExpedition();state.cargo={impact:cargoAtHaven}
  await start(page,state);await page.clock.runFor(4000)
  const committed=await saved(page)
  expect(committed.impactShieldInstalled).toBe(true)
  const meter=page.getByRole('meter',{name:'Shields',exact:true})
  await expect(meter).toHaveAttribute('aria-valuenow',String(committed.shields))
  await expect(page.getByText('Hull exposed',{exact:true})).toHaveCount(0)
  // The lazy route's loading transition needs its clock running on navigation.
  await page.clock.resume()
  await page.reload()
  await page.getByRole('button',{name:'Continue expedition',exact:true}).press('Enter')
  await expect(meter).toHaveAttribute('aria-valuenow',String(committed.shields))
})

test('a slower browser shows the Haven recording when activation is committed',async({page})=>{
  const state=newExpedition();state.position={x:8050,y:3560};state.visited.push('breach')
  await start(page,state);await page.clock.runFor(64)
  await page.keyboard.press('f');await page.clock.runFor(600)
  const committed=await saved(page)
  expect(committed.campaign.havenActivated).toBe(true)
  expect(committed.campaign.havenLinkPending).toBe(true)
  await expect(page.getByRole('button',{name:'Read recording: A link to come back to',exact:true})).toBeVisible()
})

test('a slower browser enables launch from the same committed rescue state',async({page})=>{
  test.setTimeout(60000)
  const state=freshExpedition();state.core=true
  state.rescuedPods=SURVIVAL_PODS.filter(pod=>pod.id!=='survival-01').map(pod=>pod.id)
  state.cargo={'survival-01':cargoAtHaven}
  await start(page,state);await page.keyboard.press('e');await page.clock.runFor(4000)
  const committed=await saved(page)
  expect(committed.rescuedPods).toHaveLength(12)
  expect(committed.banked).toBe(1000)
  await expect(page.getByRole('button',{name:'Launch Haven',exact:true})).toBeEnabled()
  await expect(page.getByText('Passengers missing.',{exact:true})).toHaveCount(0)
})
