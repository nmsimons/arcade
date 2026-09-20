import { test, expect } from '@playwright/test'
import { SAVE_SCHEMA_VERSION } from '../../src/games/hardVacuum/saveMigrations.ts'
import { freshExpedition, SAVE_KEY } from '../../src/games/hardVacuum/expedition.ts'

async function launch(page,state) {
  await page.addInitScript(({key,state})=>{
    if(!sessionStorage.getItem('equipment-seeded')) {
      localStorage.setItem(key,JSON.stringify(state));sessionStorage.setItem('equipment-seeded','true')
    }
  },{key:SAVE_KEY,state})
  await page.goto('/hard-vacuum')
  await page.getByRole('button',{name:'Continue expedition',exact:true}).press('Enter')
}

test('new pilots see the impact-shield lesson and cannot buy protection before recovering it',async({page})=>{
  const state=freshExpedition();state.banked=10000
  await launch(page,state)
  await expect(page.getByText('Impact shield not installed',{exact:true})).toHaveCount(0)
  await expect(page.getByRole('meter',{name:'Shields',exact:true})).toHaveCount(0)
  await expect(page.locator('.hud-meters')).toHaveCount(0)
  await expect(page.getByRole('alert').filter({hasText:'Hull exposed'})).toBeVisible()
  await expect(page.getByRole('status')).toContainText('impact shield is in the rescue locker')
  await page.keyboard.press('p')
  await expect(page.getByText('Install your impact shield',{exact:true})).toBeVisible()
  await page.getByRole('button',{name:'Resume · P / Esc',exact:true}).press('Enter')
  await page.keyboard.press('e')
  const hull=page.getByRole('button',{name:/Reinforced hull I,/})
  await expect(hull).toBeDisabled()
  await expect(hull).toContainText('Recover and install the impact shield first.')
  await expect(page.getByRole('button',{name:/Beam capacitor I,/})).toBeEnabled()
  await page.reload()
  await page.getByRole('button',{name:'Continue expedition',exact:true}).press('Enter')
  await expect(page.getByText('Impact shield not installed',{exact:true})).toHaveCount(0)
  await expect(page.getByRole('meter',{name:'Shields',exact:true})).toHaveCount(0)
  await expect(page.getByRole('alert').filter({hasText:'Hull exposed'})).toBeVisible()
  await expect(page.getByRole('status')).toContainText('impact shield is in the rescue locker')
})

test('impact-shield delivery animates recharge and activates its meter, with no replay after reload',async({page})=>{
  await page.addInitScript(()=>{
    const probe=document.createElement('canvas').getContext('2d')
    probe.shadowColor='#00ff8860';const rings=probe.shadowColor
    probe.shadowColor='#00ff8880';const flash=probe.shadowColor
    window.shieldRechargeDraws={rings:0,flash:0}
    const stroke=CanvasRenderingContext2D.prototype.stroke
    CanvasRenderingContext2D.prototype.stroke=function(...args){
      if(this.strokeStyle==='#00ff88') {
        if(this.shadowColor===rings)window.shieldRechargeDraws.rings++
        if(this.shadowColor===flash)window.shieldRechargeDraws.flash++
      }
      return stroke.apply(this,args)
    }
  })
  const state=freshExpedition();state.banked=10000
  state.cargo={impact:{pos:{x:state.position.x-132,y:state.position.y},vel:{x:0,y:0},tethered:true}}
  await launch(page,state)
  const meter=page.getByRole('meter',{name:'Shields',exact:true})
  await expect(page.getByRole('status')).toContainText('Haven is installing the impact shield')
  await expect(meter).toHaveAttribute('aria-valuenow','2',{timeout:10000})
  await expect(meter).toHaveAttribute('aria-valuemax','2')
  await expect(page.getByText('Impact shield not installed',{exact:true})).toHaveCount(0)
  await expect(page.getByRole('alert').filter({hasText:'Hull exposed'})).toHaveCount(0)
  await expect.poll(()=>page.evaluate(()=>window.shieldRechargeDraws.rings)).toBeGreaterThan(0)
  await expect.poll(()=>page.evaluate(()=>window.shieldRechargeDraws.flash)).toBeGreaterThan(0)
  await expect.poll(()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)).impactShieldInstalled,SAVE_KEY)).toBe(true)
  await page.keyboard.press('e')
  await page.getByRole('button',{name:/Reinforced hull I,/}).press('Enter')
  await expect(page.getByRole('button',{name:/Reinforced hull II,/})).toBeVisible()
  await page.reload()
  await page.getByRole('button',{name:'Continue expedition',exact:true}).press('Enter')
  await expect(meter).toHaveAttribute('aria-valuemax','3')
  await expect(meter).toHaveAttribute('aria-valuenow','3')
  await expect(page.getByRole('alert').filter({hasText:'Hull exposed'})).toHaveCount(0)
  await expect(page.getByRole('status').filter({hasText:'impact shield'})).toHaveCount(0)
  expect(await page.evaluate(()=>window.shieldRechargeDraws)).toEqual({rings:0,flash:0})
})

test('an installed but depleted shield keeps its meter and shows Hull exposed',async({page})=>{
  const state=freshExpedition();state.impactShieldInstalled=true;state.position={x:7600,y:3490}
  await launch(page,state)
  await expect(page.getByRole('meter',{name:'Shields',exact:true})).toHaveAttribute('aria-valuenow','0')
  await expect(page.getByRole('meter',{name:'Shields',exact:true})).toHaveAttribute('aria-valuemax','2')
  await expect(page.getByRole('alert').filter({hasText:'Hull exposed'})).toBeVisible()
})

test('schema-four expeditions keep their installed impact shield without a free refill',async({page})=>{
  const state={...freshExpedition(),version:4,shields:1,position:{x:7600,y:3490}}
  delete state.impactShieldInstalled
  await launch(page,state)
  await expect(page.getByRole('meter',{name:'Shields',exact:true})).toHaveAttribute('aria-valuenow','1')
  await expect(page.getByText('Impact shield not installed',{exact:true})).toHaveCount(0)
  await expect.poll(()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)).version,SAVE_KEY)).toBe(SAVE_SCHEMA_VERSION)
  const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY)
  expect(saved.impactShieldInstalled).toBe(true);expect(saved.cargo?.impact).toBeUndefined()
})

test('unclaimed modules in older saves relocate to the Works and rescue locker on continue',async({page})=>{
  const state={...freshExpedition(),version:5}
  state.cargo={blaster:{pos:{x:8750,y:630},vel:{x:1,y:2},tethered:false},impact:{pos:{x:7830,y:3560},vel:{x:1,y:2},tethered:false}}
  await launch(page,state)
  await expect.poll(()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)).version,SAVE_KEY)).toBe(SAVE_SCHEMA_VERSION)
  await expect.poll(()=>page.evaluate(key=>{
    const body=JSON.parse(localStorage.getItem(key)).cargo?.blaster
    return body ? Math.hypot(body.pos.x-5110,body.pos.y-1320) : Infinity
  },SAVE_KEY)).toBeLessThan(40)
  await expect.poll(()=>page.evaluate(key=>{
    const body=JSON.parse(localStorage.getItem(key)).cargo?.impact
    return body ? Math.hypot(body.pos.x-7110,body.pos.y-3600) : Infinity
  },SAVE_KEY)).toBeLessThan(40)
  await expect(page.getByRole('button',{name:/Fire blaster/})).toHaveCount(0)
  await page.reload()
  await page.getByRole('button',{name:'Continue expedition',exact:true}).press('Enter')
  const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY)
  expect(saved.blasterInstalled).toBe(false);expect(saved.blasterCharges).toBe(0)
  expect(saved.impactShieldInstalled).toBe(false)
  expect(Math.hypot(saved.cargo.blaster.pos.x-5110,saved.cargo.blaster.pos.y-1320)).toBeLessThan(40)
  expect(Math.hypot(saved.cargo.impact.pos.x-7110,saved.cargo.impact.pos.y-3600)).toBeLessThan(40)
})

test('the dock opens on upgrades and cannot sell devices or remote recharge',async({page})=>{
  const state=freshExpedition();state.banked=10000;state.impactShieldInstalled=true;state.shields=2
  await launch(page,state)
  await page.keyboard.press('e')
  await expect(page.getByRole('heading',{name:'Haven outfitter',exact:true})).toBeVisible()
  await expect(page.getByRole('button',{name:'Ship upgrades',exact:true})).toHaveAttribute('aria-pressed','true')
  await expect(page.getByRole('button',{name:'Supplies',exact:true})).toHaveCount(0)
  await expect(page.getByRole('button',{name:/Haven teleporter|Remote recharge|Radiation reserve/i})).toHaveCount(0)
  const magazine=page.getByRole('button',{name:/Blaster magazine I,/})
  await expect(magazine).toBeDisabled()
  await expect(magazine).toContainText('Recover and install the blaster first.')
  await page.getByRole('button',{name:/Reinforced hull I,/}).press('Enter')
  await expect(page.getByRole('button',{name:/Reinforced hull II,/})).toBeVisible()
  await expect.poll(()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)).banked,SAVE_KEY)).toBe(9250)
})

for(const id of ['blaster','teleporter']) test(`delivering the ${id} unlocks its flight control and persists after reload`,async({page})=>{
  const state=freshExpedition()
  // These later pickups follow the shield tutorial. Keep the pilot protected
  // from incidental impacts while Haven's recovery animation finishes.
  state.impactShieldInstalled=true;state.shields=2
  state.cargo={[id]:{pos:{x:state.position.x-132,y:state.position.y},vel:{x:0,y:0},tethered:true}}
  const label=id==='blaster'?'Fire blaster, 3 of 3 charges':'Teleport to Haven'
  await launch(page,state)
  await expect(page.getByRole('button',{name:label,exact:true})).toHaveCount(0)
  await expect(page.getByRole('button',{name:label,exact:true})).toBeVisible({timeout:10000})
  await expect.poll(()=>page.evaluate(({key,id})=>JSON.parse(localStorage.getItem(key))[id+'Installed'],{key:SAVE_KEY,id})).toBe(true)
  await page.reload()
  await page.getByRole('button',{name:'Continue expedition',exact:true}).press('Enter')
  await expect(page.getByRole('button',{name:label,exact:true})).toBeVisible()
})

for(const width of [1280,620]) test(`upgraded blaster HUD and controls retain spent ammunition after reload at ${width}px`,async({page},testInfo)=>{
  await page.setViewportSize({width,height:800})
  const state=freshExpedition();state.position={x:7600,y:3490};state.impactShieldInstalled=true;state.shields=2
  state.blasterInstalled=true;state.blasterCharges=6;state.upgradeLevels.magazine=5;state.upgrades=['magazine']
  await launch(page,state)
  const hud=page.locator('.hud-instrument').filter({hasText:'Blaster'})
  await expect(hud).toHaveAttribute('aria-label','Fire blaster, 6 of 8 charges')
  await expect(hud.locator('.hud-meter-segment')).toHaveCount(8)
  await expect(hud.locator('.is-filled')).toHaveCount(6)
  if(width<1024) {
    const touch=page.getByRole('button',{name:'Fire blaster, 6 of 8 charges',exact:true}).filter({hasText:/^BLAST/})
    await expect(touch).toContainText('6/8')
    await touch.click()
  } else await hud.click()
  await expect(hud).toHaveAttribute('aria-label','Fire blaster, 5 of 8 charges')
  await page.keyboard.press('p')
  await expect(page.getByRole('button',{name:'Resume · P / Esc',exact:true})).toBeVisible()
  await page.reload()
  await page.getByRole('button',{name:'Continue expedition',exact:true}).press('Enter')
  await expect(hud).toHaveAttribute('aria-label','Fire blaster, 5 of 8 charges')
  await expect(hud.locator('.is-filled')).toHaveCount(5)
  if(width<1024) await expect(page.getByRole('button',{name:'Fire blaster, 5 of 8 charges',exact:true}).filter({hasText:/^BLAST/})).toContainText('5/8')
  await page.screenshot({path:testInfo.outputPath('upgraded-blaster-hud.png')})
})

test('old packs are refunded with no recharge button or R-key repair',async({page})=>{
  const state={...freshExpedition(),version:2,rechargePacks:2,remoteRechargeRemaining:.5}
  state.position={x:7600,y:3490};state.shields=1;state.blasterInstalled=true;state.blasterCharges=1
  await launch(page,state)
  await expect(page.getByRole('button',{name:/Remote recharge/i})).toHaveCount(0)
  await page.keyboard.press('r')
  await expect(page.locator('.hud-credits')).toContainText('1,000')
  await expect.poll(()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)).version,SAVE_KEY)).toBe(SAVE_SCHEMA_VERSION)
  await page.keyboard.press('p')
  await page.getByRole('button',{name:'Save & exit',exact:true}).press('Enter')
  const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY)
  expect(saved.shields).toBe(1);expect(saved.blasterCharges).toBe(1)
  expect(saved.rechargePacks).toBeUndefined();expect(saved.remoteRechargeRemaining).toBeUndefined()
})

test('legacy radiation upgrades refund once, use the original meter, and disappear from the dock',async({page})=>{
  const state={...freshExpedition(),version:3,banked:10000,upgrades:['radiation','radiationReserve'],upgradeLevels:{radiationReserve:3},radiationCharge:250}
  await launch(page,state)
  const meter=page.getByRole('meter',{name:'Radiation',exact:true})
  await expect(meter).toHaveAttribute('aria-valuemax','100')
  await expect(meter).toHaveAttribute('aria-valuenow','100')
  await expect(page.locator('.hud-credits')).toContainText('52,000')
  await page.keyboard.press('e')
  await expect(page.getByRole('heading',{name:'Haven outfitter',exact:true})).toBeVisible()
  await expect(page.getByRole('button',{name:/Radiation reserve/i})).toHaveCount(0)
  await expect.poll(()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)).version,SAVE_KEY)).toBe(SAVE_SCHEMA_VERSION)
  await page.reload()
  await page.getByRole('button',{name:'Continue expedition',exact:true}).press('Enter')
  await expect(page.locator('.hud-credits')).toContainText('52,000')
  const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY)
  expect(saved.upgradeLevels.radiationReserve).toBeUndefined()
  expect(saved.upgrades).toEqual(['radiation'])
})
