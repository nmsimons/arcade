import { expect } from '@playwright/test'
import { freshExpedition, SAVE_KEY } from '../../../src/games/hardVacuum/expedition.ts'

export async function setup(page,state=freshExpedition(),mapping='standard',url='/hard-vacuum') {
  await page.addInitScript(({key,state,mapping})=>{
    localStorage.setItem(key,JSON.stringify(state))
    window.testPad={index:1,id:'Test standard controller',connected:true,mapping,axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))}
    Object.defineProperty(navigator,'getGamepads',{configurable:true,writable:true,value:()=>[null,window.testPad]})
  },{key:SAVE_KEY,state,mapping})
  await page.clock.install({time:new Date('2026-01-01T00:00:00Z')})
  await page.goto(url)
  await expect(page.getByRole('button',{name:url==='/'?'Hard Vacuum':'Continue expedition',exact:true})).toBeVisible()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.clock.runFor(64)
}
export async function hold(page,index,value,ms=64) {
  await page.evaluate(({index,value})=>{window.testPad.buttons[index]={pressed:value>=.5,value}},{index,value})
  await page.clock.runFor(ms)
}
export async function tap(page,index) {await hold(page,index,1);await hold(page,index,0)}
export const saved=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY)
export const armed=()=>{
  const state=freshExpedition();state.position={x:7800,y:3490};state.impactShieldInstalled=true;state.shields=2;state.blasterInstalled=true;state.blasterCharges=3
  return state
}
