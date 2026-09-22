import { test, expect } from './helpers/test.mjs'
import { pauseSimulation } from './helpers/simulation.mjs'
import { freshExpedition, powerReceiver, SAVE_KEY } from '../../src/games/hardVacuum/expedition.ts'

test('a security bot warns and shoots while the player parks nearby holding the upgraded laser',async({page},info)=>{
  // Rendering every simulation frame can exceed 30 seconds on shared CI runners.
  test.setTimeout(60000)
  const state=freshExpedition();powerReceiver(state,'works-power','works-power');state.botDoors={}
  state.position={x:5200,y:1030};state.impactShieldInstalled=true;state.shields=2
  state.upgrades.push('radiation');state.radiationCharge=100
  state.upgradeLevels.focus=5;state.upgradeLevels.capacitor=5
  await page.addInitScript(({key,state})=>{
    localStorage.setItem(key,JSON.stringify(state))
    const stroke=CanvasRenderingContext2D.prototype.stroke
    CanvasRenderingContext2D.prototype.stroke=function(...args) {
      const color=String(this.strokeStyle).replaceAll(' ','')
      if(color.startsWith('rgba(255,152,120,')) window.sawSecurityWarning=true
      if(color==='#ffab89' && Math.abs(this.lineWidth-2.2)<.001) window.sawSecurityFire=true
      return stroke.apply(this,args)
    }
  },{key:SAVE_KEY,state})
  await page.clock.install();await page.goto('/hard-vacuum')
  await expect(page.getByRole('button',{name:'Continue expedition',exact:true})).toBeVisible()
  await pauseSimulation(page)
  await page.getByRole('button',{name:'Continue expedition',exact:true}).press('Enter')
  await page.evaluate(()=>{window.sawSecurityWarning=false;window.sawSecurityFire=false})
  await page.keyboard.down('Space')
  // Render every frame: a point-blank shot can hit between the 100 ms batches
  // used by longer gameplay tests, so sampling those frames can miss the shot.
  await page.clock.runFor(7000)
  await page.keyboard.up('Space')
  expect(await page.evaluate(()=>window.sawSecurityWarning)).toBe(true)
  expect(await page.evaluate(()=>window.sawSecurityFire)).toBe(true)
  await page.screenshot({path:info.outputPath('close-range-security.png')})
  await page.keyboard.press('Escape')
  const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY)
  expect(saved.shields).toBeLessThan(2)
})
