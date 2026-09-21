import { test, expect } from './helpers/test.mjs'
import { pauseSimulation } from './helpers/simulation.mjs'
import { freshExpedition, newExpedition, SAVE_KEY } from '../../src/games/hardVacuum/expedition.ts'

async function start(page,training=false,state=newExpedition()) {
  await page.addInitScript(({key,state})=>{
    localStorage.setItem(key,JSON.stringify(state))
    const proto=CanvasRenderingContext2D.prototype
    const matrix=ctx=>{
      const {a,b,c,d,e,f}=ctx.getTransform()
      return {a,b,c,d,e,f}
    }
    let path=[]
    for(const method of ['fillRect','beginPath','moveTo','lineTo','fill','translate','fillText']) {
      const original=proto[method]
      proto[method]=function(...args) {
        const result=original.apply(this,args)
        if(method==='fillRect' && this.fillStyle==='#050808') window.flightFrame={width:this.canvas.width,height:this.canvas.height,labels:[]}
        const frame=window.flightFrame
        if(!frame) return result
        if(method==='beginPath') path=[]
        if(method==='moveTo' || method==='lineTo') path.push(args)
        if(method==='fill' && this.fillStyle==='#081211' && !frame.camera) {
          frame.camera=matrix(this);frame.boundary=path
        }
        if(method==='translate' && frame.camera) {
          const camera=frame.camera,transform=matrix(this)
          const x=(frame.width/2-camera.e)/camera.a,y=(frame.height/2-camera.f)/camera.d
          // The ship is translated to its world position before drawing its hull.
          if(Math.abs(args[0]-x)<.01 && Math.abs(args[1]-y)<.01 && Math.abs(transform.a-camera.a)<.0001) frame.ship={x:args[0],y:args[1],transform}
        }
        if(method==='fillText') frame.labels.push({text:args[0],x:args[1],y:args[2],transform:matrix(this)})
        return result
      }
    }
  },{key:SAVE_KEY,state})
  await page.clock.install();await page.goto('/hard-vacuum')
  await expect(page.getByRole('button',{name:'Continue expedition',exact:true})).toBeVisible()
  await pauseSimulation(page)
  await page.getByRole('button',{name:training ? 'Flight training' : 'Continue expedition',exact:true}).press('Enter')
}

async function frame(page) {
  await page.clock.runFor(32)
  return page.evaluate(()=>window.flightFrame)
}
function centered(output,zoom) {
  expect(output.camera.a).toBeCloseTo(zoom,5)
  expect(output.camera.d).toBe(output.camera.a)
  expect(output.camera.b).toBe(0);expect(output.camera.c).toBe(0)
  expect(output.ship.transform.e).toBeCloseTo(output.width/2,2)
  expect(output.ship.transform.f).toBeCloseTo(output.height/2,2)
  expect(output.ship.transform.a).toBeCloseTo(zoom,5)
}
const saved=page=>page.evaluate(key=>localStorage.getItem(key),SAVE_KEY)

for(const training of [false,true]) test(`${training ? 'training' : 'expedition'} camera centers moving flight and adapts to resized viewports without changing the world`,async({page},info)=>{
  await start(page,training)
  const initial=await frame(page)
  centered(initial,1.116129)
  const hudFont=await page.locator('.hud-room').evaluate(el=>getComputedStyle(el).fontSize)
  await page.keyboard.down('w');await page.clock.runFor(200);await page.keyboard.up('w')
  const moving=await frame(page)
  centered(moving,1.116129)
  expect(Math.hypot(moving.ship.x-initial.ship.x,moving.ship.y-initial.ship.y)).toBeGreaterThan(.1)
  await page.keyboard.press('Escape')
  const dialog=page.getByRole('dialog',{name:training ? 'Training paused' : 'Expedition paused',exact:true})
  await expect(dialog).toBeVisible()
  const before=await frame(page),save=await saved(page)
  for(const [viewport,zoom] of [
    [{width:360,height:640},.58], [{width:620,height:360},360/620],
    [{width:900,height:620},1], [{width:1920,height:1080},1.296774],
    [{width:3840,height:2160},1.993548], [{width:3440,height:1440},1.529032],
    [{width:800,height:1280},800/900], [{width:1280,height:800},1.116129],
  ]) {
    await page.setViewportSize(viewport)
    await expect(page.locator('canvas')).toHaveAttribute('width',String(viewport.width))
    await expect(page.locator('canvas')).toHaveAttribute('height',String(viewport.height))
    const output=await frame(page)
    centered(output,zoom)
    expect(output.boundary).toEqual(before.boundary)
    expect({x:output.ship.x,y:output.ship.y}).toEqual({x:before.ship.x,y:before.ship.y})
    expect(await saved(page)).toBe(save)
    await expect(dialog).toBeVisible()
  }
  await page.keyboard.press('Escape')
  // A live resize changes only the world scale, not desktop HUD text/controls.
  for(const viewport of [{width:900,height:620},{width:1920,height:1080}]) {
    await page.setViewportSize(viewport);await frame(page)
    await expect(page.locator('.hud-room')).toHaveCSS('font-size',hudFont)
    await expect(page.locator('.hud-console')).toHaveCSS('width','296px')
    await page.screenshot({path:info.outputPath(`flight-${viewport.width}.png`)})
  }
  if(!training) {
    await page.keyboard.press('m')
    await expect(page.getByRole('dialog',{name:'Station survey'})).toBeVisible()
    await page.getByRole('button',{name:/Zoom · 2×/}).press('Enter')
    await expect(page.getByRole('button',{name:/Zoom · Fit/})).toBeVisible()
    await page.keyboard.press('Escape')
    centered(await frame(page),1.296774)
  }
})

for(const viewport of [{width:620,height:700},{width:2560,height:1600}]) test(`floor docking hit target matches the rendered label at ${viewport.width}px`,async({page})=>{
  await page.setViewportSize(viewport)
  const state=freshExpedition();state.position={x:state.campaign.haven.x+40,y:state.campaign.haven.y}
  await start(page,false,state)
  const output=await frame(page),dock=output.labels.find(label=>label.text==='Dock · E')
  expect(dock).toBeDefined()
  const x=dock.x*dock.transform.a+dock.transform.e,y=dock.y*dock.transform.d+dock.transform.f
  await page.mouse.click(x,y-45);await page.clock.runFor(32)
  await expect(page.getByRole('heading',{name:'Haven outfitter'})).toHaveCount(0)
  await page.mouse.click(x,y);await page.clock.runFor(1600)
  await expect(page.getByRole('heading',{name:'Haven outfitter'})).toBeVisible()
})
