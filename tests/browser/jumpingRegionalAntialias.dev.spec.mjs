import { test, expect } from './helpers/test.mjs'

for (const software of [false,true]) test(`${software ? 'readback canvas' : 'default canvas'}: regional fade breaks up quantization without changing its curve or swimming with the camera`, async ({page},info) => {
  await page.goto('/tests/fixtures/jumping/lighting-prototype.json')
  const result = await page.evaluate(async software => {
    const { blankTrial } = await import('/src/games/jumping/level.ts')
    const { createPreviewRun } = await import('/src/games/jumping/challenge.ts')
    const { EnvironmentLighting, portalExposure, environmentBufferBytes } = await import('/src/games/jumping/environmentLighting.ts')
    const level = { ...blankTrial(), version: 2, width: 1800, height: 1200, floor: 1200,
      platforms: [{x:0,y:0,w:250,h:1200},{x:1550,y:0,w:250,h:1200}],
      entrance:{x:500,y:1200},goal:{x:1400,y:1200},
      environment:{kind:'interior',lighting:'regions',baseLighting:'day',walls:[{kind:'cave',x:0,y:300,w:1800,h:900}]},
      lighting:{nightMode:true,ambient:0,lights:[]} }
    const run=createPreviewRun(level),light=new EnvironmentLighting(),original=JSON.stringify(run.level)
    const dither=light.dither;let ditherCalls=0
    light.dither=function(...args){ditherCalls++;return dither.apply(this,args)}
    const view={x:300,y:280,zoom:1.5,width:1000,height:800}
    const before=light.render(run,view,software),image=before.ambient.ctx.getImageData(0,0,1000,800)
    const sample=(pixels,x,y,v=view)=>pixels[(Math.round((y-v.y)*v.zoom)*v.width+Math.round((x-v.x)*v.zoom))*4]
    const rows=[]
    for(const y of [360,420,480,540,600]){
      const values=Array.from({length:220},(_,i)=>sample(image.data,700+i/view.zoom,y))
      let equal=0;for(let i=1;i<values.length;i++)if(values[i]===values[i-1])equal++
      rows.push({y,mean:values.reduce((a,b)=>a+b,0)/values.length,expected:portalExposure(y-298)*255,equal:equal/(values.length-1),range:Math.max(...values)-Math.min(...values)})
    }
    const retained=light.fields.ambient.canvas,scratch=light.fields.readable.canvas,noise=light.noise.canvas
    const moved={...view,x:view.x+8/view.zoom,y:view.y+6/view.zoom},movedImage=light.render(run,moved,software).ambient.ctx.getImageData(0,0,1000,800)
    let max=0,total=0,count=0
    for(let y=400;y<=600;y+=2)for(let x=700;x<820;x+=2){const d=Math.abs(sample(image.data,x,y)-sample(movedImage.data,x,y,moved));max=Math.max(max,d);total+=d;count++}
    const sameAir=light.fields.ambient.canvas===retained&&light.fields.readable.canvas===scratch
    const cameraDitherCalls=ditherCalls
    const unchanged=JSON.stringify(run.level)===original
    const sheet=document.createElement('canvas');sheet.width=1000;sheet.height=800;sheet.getContext('2d').putImageData(image,0,0)
    document.body.replaceChildren(sheet);document.body.style.margin='0'
    const bytes=environmentBufferBytes(view),dimensions=[retained.width,retained.height]
    light.render(run,{...view,x:-60,y:-60,zoom:.35},software)
    const overviewUntouched=ditherCalls===1&&light.noise===undefined&&noise.width===0
    light.render(run,{...view,width:1600,height:1000},software)
    const largeUntouched=ditherCalls===1&&light.noise===undefined
    light.render(run,{...view,width:1500,height:1000},software)
    const boundaryAir=light.air,lastNoise=light.noise.canvas
    light.render(run,{...view,width:1500,height:1001},software)
    const limitRebuilt=ditherCalls===2&&light.air!==boundaryAir&&light.noise===undefined&&lastNoise.width===0
    light.release()
    return{rows,cameraDitherCalls,pan:{max,mean:total/count},sameAir,unchanged,overviewUntouched,largeUntouched,limitRebuilt,bytes,dimensions,released:noise.width===0&&noise.height===0}
  },software)
  for(const row of result.rows){
    // The retained low-resolution gradient already has interpolation/8-bit
    // error. Bound its mean against the analytic curve as well as the small
    // variation across each constant-exposure row.
    expect(Math.abs(row.mean-row.expected),JSON.stringify(result)).toBeLessThan(2)
    expect(row.range,JSON.stringify(result)).toBeLessThanOrEqual(3)
  }
  expect(result.rows.filter(r=>r.equal<.8).length,JSON.stringify(result)).toBeGreaterThanOrEqual(3)
  expect(result.cameraDitherCalls).toBe(1)
  expect(result.overviewUntouched).toBe(true);expect(result.largeUntouched).toBe(true)
  expect(result.limitRebuilt).toBe(true)
  expect(result.pan.max,JSON.stringify(result)).toBeLessThanOrEqual(2)
  expect(result.pan.mean,JSON.stringify(result)).toBeLessThan(.2)
  expect(result.sameAir).toBe(true);expect(result.unchanged).toBe(true);expect(result.released).toBe(true)
  expect(Math.max(...result.dimensions)).toBeLessThanOrEqual(640)
  expect(result.bytes).toBeLessThan(64*1024*1024)
  await info.attach('regional-fade-metrics',{body:JSON.stringify(result,null,2),contentType:'application/json'})
  await page.locator('canvas').screenshot({path:info.outputPath(`regional-fade-${software?'software':'hardware'}.png`)})
})
