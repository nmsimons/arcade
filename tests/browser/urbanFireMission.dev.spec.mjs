import {test,expect} from './helpers/test.mjs'

test('normal firing completes five fixture assaults, pause freezes resupply, and victory can restart',async({page},info)=>{
  test.setTimeout(120000)
  // Only the encounter factory is replaced. The real adapter, projectiles,
  // controls, score, mission clock, pause and menus run without gameplay hooks.
  await page.route('**/src/games/urbanFire/reinforcements.ts*',async route=>{
    const response=await route.fetch()
    const source=(await response.text())
      .replace('export function createTankReinforcements(', 'function fixtureTanks(')
      .replace('export function createHelicopterReinforcements(', 'function fixtureHelicopters(')
    await route.fulfill({response,body:source+`
      export function createTankReinforcements(...args){
        const [tank]=fixtureTanks(...args)
        tank.pos={x:args[1].x,y:args[1].y-90};tank.angle=tank.turretAngle=-Math.PI/2
        tank.state='active';tank.arrival=undefined;tank.shootCooldown=Infinity
        tank.brain.replan=Infinity
        return [tank]
      }
      export function createHelicopterReinforcements(){return []}
    `})
  })
  await page.clock.install({time:new Date('2026-01-01T00:00:00Z')})
  await page.addInitScript(()=>{
    const proto=CanvasRenderingContext2D.prototype,fill=proto.fillRect,text=proto.fillText
    proto.fillRect=function(...args){
      if(this.canvas.getAttribute('aria-label')==='Urban Fire battlefield'&&args[2]===this.canvas.width&&args[3]===this.canvas.height)window.urbanHud=[]
      return fill.apply(this,args)
    }
    proto.fillText=function(...args){
      if(this.canvas.getAttribute('aria-label')==='Urban Fire battlefield')window.urbanHud?.push(args[0])
      return text.apply(this,args)
    }
  })
  await page.goto('/urban-fire')
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.getByRole('button',{name:'Deploy',exact:true}).click()
  const hud=()=>page.evaluate(()=>window.urbanHud)
  for(let wave=1;wave<=5;wave++){
    await page.clock.runFor(32)
    expect((await hud()).some(t=>t.startsWith(`WAVE 0${wave} / 5`))).toBe(true)
    if(wave===5)expect(await hud()).toContain('FINAL ASSAULT')
    for(let hit=0;hit<2;hit++){await page.keyboard.press('Space');await page.clock.runFor(300)}
    if(wave<5){
      expect(await hud()).toContain(`WAVE ${wave} SECURED`)
      if(wave===1){
        await page.keyboard.press('p');await page.clock.runFor(32)
        const frozen=await page.locator('canvas').evaluate(c=>c.toDataURL())
        await page.clock.runFor(10000)
        expect(await page.locator('canvas').evaluate(c=>c.toDataURL())).toBe(frozen)
        await page.getByRole('button',{name:'Resume',exact:true}).click()
      }
      await page.clock.runFor(8200)
    }
  }
  await expect(page.getByRole('heading',{name:'DISTRICT SECURED',exact:true})).toBeVisible()
  const dialog=page.getByRole('dialog',{name:'District secured'})
  await expect(dialog).toContainText('003000')
  await expect(dialog).toContainText('5 / 5')
  await page.screenshot({path:info.outputPath('district-secured.png')})
  const finished=await page.locator('canvas').evaluate(c=>c.toDataURL())
  await page.clock.runFor(15000)
  expect(await page.locator('canvas').evaluate(c=>c.toDataURL())).toBe(finished)
  await page.getByRole('button',{name:'Play again',exact:true}).click();await page.clock.runFor(32)
  expect((await hud()).some(t=>t.startsWith('WAVE 01 / 5   000000'))).toBe(true)
  expect(await hud()).toContain('ARMOR 3')
  expect(await hud()).not.toContain('FINAL ASSAULT')
})
