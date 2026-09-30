import {test,expect} from './helpers/test.mjs'

test('opaque parachutes cover an overlapping jeep during tank and supply descents',async({page},info)=>{
  await page.goto('/')
  const result=await page.evaluate(async()=>{
    const [{drawBattle},{createVehicleVisuals},{createTankBrain}]=await Promise.all([
      import('/src/games/urbanFire/render.ts'),import('/src/games/urbanFire/appearance.ts'),import('/src/games/urbanFire/ai.ts')])
    const jeep={pos:{x:0,y:0},vel:{x:0,y:0},angle:0,health:3,state:'active',explodeTime:0,wheelAngle:0,hitFlash:0}
    const tank={pos:{x:0,y:127},vel:{x:0,y:0},angle:0,turretAngle:0,health:2,state:'incoming',explodeTime:0,
      shootCooldown:2000,trackOffset:0,losTimeMs:0,role:0,brain:createTankBrain(),recoil:0,arrival:{elapsed:1.4,height:80,landed:false}}
    const city=document.createElement('canvas');city.width=3648;city.height=3148
    const differences=[]
    const sheet=document.createElement('canvas');sheet.width=1536;sheet.height=512
    const out=sheet.getContext('2d')
    for(const [i,kind] of ['tank','health','armor'].entries()){
      const scene={jeep,tanks:kind==='tank'?[tank]:[],helicopters:[],bullets:[],debris:[],civilianVehicles:[],
        kits:kind==='health'?[{pos:{x:0,y:83},arrival:{elapsed:.8,height:60,landed:false}}]:[],
        armor:kind==='armor'?[{pos:{x:0,y:83},arrival:{elapsed:.8,height:60,landed:false}}]:[]}
      const render=active=>{
        const canvas=document.createElement('canvas');canvas.width=canvas.height=512
        drawBattle(canvas.getContext('2d'),city,{...scene,jeep:{...jeep,state:active?'active':'dead'}},512,512,0,1,createVehicleVisuals())
        return canvas
      }
      const visible=render(true),absent=render(false)
      const pixels=visible.getContext('2d').getImageData(250,250,12,12).data
      const reference=absent.getContext('2d').getImageData(250,250,12,12).data
      differences.push({kind,different:pixels.some((v,index)=>v!==reference[index])})
      out.drawImage(visible,i*512,0)
    }
    document.body.replaceChildren(sheet);document.body.style.margin='0'
    return differences
  })
  expect(result).toEqual([{kind:'tank',different:false},{kind:'health',different:false},{kind:'armor',different:false}])
  await page.screenshot({path:info.outputPath('parachute-overlaps.png'),fullPage:true})
})

test('settling canopies blend above the jeep after their cargo has landed',async({page})=>{
  await page.goto('/')
  const differences=await page.evaluate(async()=>{
    const [{drawBattle},{drawTankCanopy,drawSupplyCanopy},{createVehicleVisuals},{createTankBrain}]=await Promise.all([
      import('/src/games/urbanFire/render.ts'),import('/src/games/urbanFire/reinforcementRender.ts'),
      import('/src/games/urbanFire/appearance.ts'),import('/src/games/urbanFire/ai.ts')])
    const jeep={pos:{x:0,y:0},vel:{x:0,y:0},angle:0,health:3,state:'active',explodeTime:0,wheelAngle:0,hitFlash:0}
    const tank={pos:{x:0,y:63},vel:{x:0,y:0},angle:0,turretAngle:0,health:2,state:'incoming',explodeTime:0,
      shootCooldown:2000,trackOffset:0,losTimeMs:0,role:0,brain:createTankBrain(),recoil:0,arrival:{elapsed:2.85,height:0,landed:true}}
    const kit={pos:{x:0,y:35},arrival:{elapsed:1.7,height:0,landed:true}}
    const city=document.createElement('canvas');city.width=3648;city.height=3148
    return ['tank','health'].map(kind=>{
      const scene={jeep,tanks:kind==='tank'?[tank]:[],kits:kind==='health'?[kit]:[],
        helicopters:[],bullets:[],debris:[],armor:[],civilianVehicles:[]}
      const render=expected=>{
        const canvas=document.createElement('canvas');canvas.width=canvas.height=512
        const ctx=canvas.getContext('2d')
        const base=expected?{...scene,tanks:scene.tanks.map(t=>({...t,state:'active',arrival:undefined})),
          kits:scene.kits.map(k=>({...k,arrival:undefined}))}:scene
        drawBattle(ctx,city,base,512,512,0,1,createVehicleVisuals())
        if(expected){
          ctx.save();ctx.translate(256,256);ctx.scale(.8,.8)
          if(kind==='tank')drawTankCanopy(ctx,tank);else drawSupplyCanopy(ctx,kit)
          ctx.restore()
        }
        return ctx.getImageData(250,250,12,12).data
      }
      const actual=render(false),expected=render(true)
      return {kind,different:actual.some((v,index)=>v!==expected[index])}
    })
  })
  expect(differences).toEqual([{kind:'tank',different:false},{kind:'health',different:false}])
})

test('vehicle culling retains an elevated canopy at the viewport edge and omits fully offscreen models',async({page})=>{
  await page.goto('/')
  const result=await page.evaluate(async()=>{
    const [{drawBattle},{createVehicleVisuals},{createTankBrain}]=await Promise.all([
      import('/src/games/urbanFire/render.ts'),import('/src/games/urbanFire/appearance.ts'),import('/src/games/urbanFire/ai.ts')])
    const jeep={pos:{x:0,y:0},vel:{x:0,y:0},angle:0,health:3,state:'active',explodeTime:0,wheelAngle:0,hitFlash:0}
    const canvas=document.createElement('canvas');canvas.width=canvas.height=512
    const city=document.createElement('canvas');city.width=3648;city.height=3148
    const ctx=canvas.getContext('2d'),fill=ctx.fill.bind(ctx)
    let fills=0;ctx.fill=(...args)=>{fills++;return fill(...args)}
    const scene={jeep,tanks:[],helicopters:[],bullets:[],debris:[],kits:[],armor:[],civilianVehicles:[]}
    const draw=()=>{fills=0;drawBattle(ctx,city,scene,512,512,0,1,createVehicleVisuals());return fills}
    const base=draw()
    scene.helicopters=[{pos:{x:5000,y:5000},vel:{x:0,y:0},angle:0,state:'incoming',rotorAngle:0,recoil:0,losTimeMs:0,shootCooldown:2000}]
    const offscreen=draw()
    scene.tanks=[{pos:{x:0,y:480},vel:{x:0,y:0},angle:0,turretAngle:0,health:2,state:'incoming',role:0,recoil:0,
      brain:createTankBrain(),losTimeMs:0,shootCooldown:2000,arrival:{height:180,elapsed:.3,landed:false}}]
    const canopy=draw()
    return {base,offscreen,canopy}
  })
  expect(result.offscreen).toBe(result.base)
  expect(result.canopy).toBeGreaterThan(result.base)
})

test('settled cars reuse a raster at the current scale, and movement or changed appearance invalidates it',async({page},info)=>{
  await page.goto('/')
  const result=await page.evaluate(async()=>{
    const [{drawCivilianVehicles},{createCivilianVehicles}]=await Promise.all([
      import('/src/games/urbanFire/civilianModels.ts'),import('/src/games/urbanFire/civilianVehicles.ts')])
    const car=createCivilianVehicles([{x:112,y:120,width:32,height:16,kind:'car',condition:'abandoned',direction:'east',tone:0}])[0]
    const canvas=document.createElement('canvas');canvas.width=canvas.height=256
    const ctx=canvas.getContext('2d'),original=CanvasRenderingContext2D.prototype.fill
    let fills=0
    CanvasRenderingContext2D.prototype.fill=function(...args){fills++;return original.apply(this,args)}
    const draw=(scale=1)=>{fills=0;ctx.clearRect(0,0,256,256);drawCivilianVehicles(ctx,[car],undefined,scale);return fills}
    try{
      const initial=draw(),cached=draw(),cachePixels=ctx.getImageData(0,0,256,256).data
      car.vel.x=1
      const moving=draw(),directPixels=ctx.getImageData(0,0,256,256).data
      let pixelError=0;for(let i=0;i<cachePixels.length;i++)pixelError+=Math.abs(cachePixels[i]-directPixels[i])
      car.vel.x=0;car.angle=.3
      const turned=draw(),turnedCached=draw(),resized=draw(2),resizedCached=draw(2)
      car.hit=.4;const damaged=draw(2)
      document.body.replaceChildren(canvas);document.body.style.margin='0'
      return {initial,cached,moving,turned,turnedCached,resized,resizedCached,damaged,pixelError:pixelError/cachePixels.length}
    }finally{CanvasRenderingContext2D.prototype.fill=original}
  })
  expect(result.initial).toBeGreaterThan(0);expect(result.cached).toBe(0)
  expect(result.moving).toBeGreaterThan(0);expect(result.turned).toBeGreaterThan(0)
  expect(result.turnedCached).toBe(0);expect(result.resized).toBeGreaterThan(0)
  expect(result.resizedCached).toBe(0);expect(result.damaged).toBeGreaterThan(0)
  expect(result.pixelError).toBeLessThan(.1)
  await page.screenshot({path:info.outputPath('civilian-cache.png')})
})
