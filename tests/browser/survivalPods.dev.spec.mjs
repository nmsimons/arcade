import { test, expect } from './helpers/test.mjs'

test('pod glass and medical cross remain legible throughout the animation at every display scale',async({page},testInfo)=>{
  await page.goto('/')
  const result=await page.evaluate(async()=>{
    const [{drawCargo},{rotX,rotY,rotZ}]=await Promise.all([
      import('/src/games/hardVacuum/cargoRender.ts'),import('/src/games/hardVacuum/math.ts'),
    ])
    const tile=document.createElement('canvas');tile.width=200;tile.height=200
    const ctx=tile.getContext('2d'),failures=[]
    const study=document.createElement('canvas');study.width=1200;study.height=660
    study.style.cssText='display:block;max-width:100%;margin:auto';document.body.replaceChildren(study)
    const sheet=study.getContext('2d');sheet.fillStyle='#081211';sheet.fillRect(0,0,1200,660)
    for(const scale of [.58,1,3])for(let time=0;time<=240;time+=.5) {
      ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#081211';ctx.fillRect(0,0,200,200)
      ctx.translate(100,100);ctx.scale(scale,scale)
      drawCargo(ctx,'survival-04',{x:0,y:0},{time})
      const angles=[.16+Math.sin(time*.4+1)*.08,-.28+Math.sin(time*.28+1)*.16,Math.sin(time*.3+1)*.12]
      for(const [name,point]of [['glass',[0,-5,-5]],['cross',[0,12,-5]]]) {
        const p=rotZ(rotY(rotX(point,angles[0]),angles[1]),angles[2]),perspective=420/(420+p[2])
        const x=Math.round(100+p[0]*perspective*scale),y=Math.round(100+p[1]*perspective*scale)
        const pixels=ctx.getImageData(x-1,y-1,3,3).data
        let visible=false
        for(let i=0;i<pixels.length;i+=4)if(pixels[i+1]>60&&pixels[i+1]>pixels[i]*1.35)visible=true
        if(!visible)failures.push({scale,time,name})
      }
    }
    for(const [index,time]of [0,5,10,15,20,30,40,60,90,120,180,240].entries()) {
      const x=100+(index%6)*200,y=110+Math.floor(index/6)*320
      sheet.fillStyle='#a7c3b8';sheet.font='12px monospace';sheet.textAlign='center';sheet.fillText(`${time}s`,x,y-70)
      drawCargo(sheet,'survival-04',{x,y},{time,scale:3})
      drawCargo(sheet,'survival-04',{x:x-35,y:y+125},{time})
      drawCargo(sheet,'survival-04',{x:x+35,y:y+125},{time,laserGlow:1})
    }
    return failures
  })
  expect(result).toEqual([])
  await page.screenshot({path:testInfo.outputPath('pod-animation-study.png'),fullPage:true})
})

test('survival pod, twelve ward cradles and two berth lights per Haven section render coherently',async({page},testInfo)=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message))
  await page.goto('/')
  const result=await page.evaluate(async()=>{
    const [{drawCargo},{drawHaven},{drawExpeditionWorld},{freshExpedition,freshRuntime,cargoBodies,powerReceiver},{SURVIVAL_PODS},{drawPlayerShip,freshShipAppearance}]=await Promise.all([
      import('/src/games/hardVacuum/cargoRender.ts'),import('/src/games/hardVacuum/havenRender.ts'),
      import('/src/games/hardVacuum/expeditionRender.ts'),import('/src/games/hardVacuum/expedition.ts'),
      import('/src/games/hardVacuum/survivalPods.ts'),import('/src/games/hardVacuum/shipRender.ts'),
    ])
    const canvas=document.createElement('canvas');canvas.width=1400;canvas.height=1000
    canvas.style.cssText='display:block;max-width:100%;height:auto;margin:auto';document.body.replaceChildren(canvas)
    const ctx=canvas.getContext('2d');ctx.fillStyle='#081211';ctx.fillRect(0,0,1400,1000)
    const label=(text,x,y)=>{ctx.fillStyle='#a7c3b8';ctx.font='14px monospace';ctx.textAlign='left';ctx.fillText(text,x,y)}
    label('ORISON / SURVIVAL POD & LIFEBOAT',30,35)
    label('PILOT SHIP',40,85);label('SURVIVAL POD',245,85);label('NATIVE SCALE',450,85)
    const drawShip=()=>drawPlayerShip(ctx,{pos:{x:0,y:0},vel:{x:0,y:0},radius:15,angle:-.3},freshShipAppearance(),{time:1,shields:0,maxShields:0,hitAge:Infinity,rechargeAge:Infinity,recharging:false,rechargeProgress:0,laser:false})
    ctx.save();ctx.translate(110,170);ctx.scale(3,3);drawShip();ctx.restore()
    drawCargo(ctx,'survival-01',{x:300,y:170},{time:1,scale:3})
    ctx.save();ctx.translate(475,160);drawShip();ctx.restore();drawCargo(ctx,'survival-01',{x:555,y:160},{time:1})
    for(const [i,count] of [0,7,12].entries()) {
      label(`${count}/12 ABOARD`,80+i*220,295)
      drawHaven(ctx,{pos:{x:145+i*220,y:435},angle:0,deployment:1},0,0,0,count)
    }
    label('ALL TWELVE / FOLDING FOR TRANSIT',80,630)
    for(const [i,deployment] of [1,.5,0].entries())drawHaven(ctx,{pos:{x:145+i*220,y:755},angle:0,deployment},0,.2,0,12)
    label('MEDICAL / TWELVE SPOTS, FOUR EMPTY',760,85)
    const state=freshExpedition('refuge'),rt=freshRuntime(),ship={pos:{x:2530,y:3530},vel:{x:0,y:0},angle:0,radius:15}
    cargoBodies(state,rt)
    ctx.save();ctx.beginPath();ctx.rect(720,110,660,830);ctx.clip();ctx.translate(1040,525);ctx.scale(.8,.8);ctx.translate(-2530,-3530)
    drawExpeditionWorld(ctx,state,rt,ship);ctx.restore()
    powerReceiver(state,'ward-power','ward-power')
    return {pods:SURVIVAL_PODS.length,locked:SURVIVAL_PODS.filter(pod=>pod.locked).length,
      released:cargoBodies(state,rt).filter(body=>body.identity.kind==='pod'&&!body.anchored).length}
  })
  expect(result).toEqual({pods:12,locked:8,released:12});expect(errors).toEqual([])
  await page.screenshot({path:testInfo.outputPath('survival-pod-study.png'),fullPage:true})
})
