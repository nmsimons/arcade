import { test, expect } from './helpers/test.mjs'

for (const backend of ['canvas', 'gpu']) test(`${backend}: water crosses sky and cave boundaries without a color seam`, async ({ page }, info) => {
  await page.goto('/lab')
  const result = await page.evaluate(async backend => {
    const { blankTrial } = await import('/src/games/jumping/level.ts')
    const { createPreviewRun, setWaterEffectsEnabled } = await import('/src/games/jumping/challenge.ts')
    const { LightingRenderer } = await import('/src/games/jumping/lightingRender.ts')
    const canvas=document.createElement('canvas');canvas.width=1600;canvas.height=900
    const ctx=canvas.getContext('2d',{willReadFrequently:true}),renderer=new LightingRenderer({backend})
    const level={...blankTrial(),version:2,width:2000,height:1000,floor:1000,
      entrance:{x:750,y:780},goal:{x:1900,y:1000},platforms:[{x:1600,y:700,w:100,h:200}],
      environment:{kind:'landscape',horizon:300,lighting:'regions',baseLighting:'day',
        walls:[{kind:'cave',x:900,y:0,w:1100,h:1000}]},
      gravityPlates:[{id:'pool',effect:'water',gravity:-1,x:100,y:400,w:1800,h:600}],
      lighting:{nightMode:true,ambient:0,lights:[]}}
    const view={x:300,y:100,zoom:1,width:1600,height:900}
    const run=createPreviewRun(level);run.entrance=null
    const render=(current,pan=0)=>{
      const stats=renderer.render(ctx,current,current.level.lighting,{...view,x:view.x+pan},0)
      const pixel=(x,y)=>Array.from(ctx.getImageData(x-view.x-pan,y-view.y,1,1).data).slice(0,3)
      const row=Array.from({length:121},(_,i)=>pixel(840+i,650))
      const jump=Math.max(...row.slice(1).flatMap((p,i)=>p.map((v,c)=>Math.abs(v-row[i][c]))))
      return{jump,day:pixel(800,650),deep:pixel(1800,650),air:[pixel(899,300),pixel(901,300)],rock:pixel(1650,800),stats}
    }
    const night=render(run)
    const before=ctx.getImageData(520,500,200,100).data
    render(run,16)
    const after=ctx.getImageData(504,500,200,100).data
    const panError=Math.max(...Array.from(before,(v,i)=>Math.abs(v-after[i])))
    setWaterEffectsEnabled(run,false);const fallback=render(run)
    const dayRun=createPreviewRun({...level,lighting:{...level.lighting,nightMode:false}});dayRun.entrance=null
    const day=render(dayRun)
    const halfRun=createPreviewRun({...level,gravityPlates:[{...level.gravityPlates[0],waterLevel:50}]});halfRun.entrance=null
    const half=render(halfRun)
    const row=y=>[899,901].map(x=>Array.from(ctx.getImageData(x-view.x,y-view.y,1,1).data).slice(0,3))
    const halfEdges={dry:row(650),wet:row(800)}
    const indoorRun=createPreviewRun({...level,environment:{...level.environment,kind:'interior'},lighting:{...level.lighting,nightMode:false}});indoorRun.entrance=null
    const indoor=render(indoorRun)
    render(run)
    document.body.replaceChildren(canvas);document.body.style.margin='0';renderer.dispose()
    return{night,day,fallback,panError,half,halfEdges,indoor}
  },backend)
  expect(result.night.stats.backend).toBe(backend)
  for(const sample of [result.night,result.fallback,result.day]) expect(sample.jump).toBeLessThanOrEqual(3)
  expect(result.night.day[2]-result.night.deep[2]).toBeGreaterThan(60)
  expect(Math.abs(result.day.day[2]-result.day.deep[2])).toBeLessThanOrEqual(2)
  // The fix is underwater only; above water the wall still has its real outline.
  expect(Math.abs(result.night.air[0][0]-result.night.air[1][0])).toBeGreaterThan(20)
  expect(result.night.rock[2]).toBeLessThan(result.night.deep[2])
  expect(result.panError).toBeLessThanOrEqual(2)
  expect(Math.abs(result.halfEdges.dry[0][0]-result.halfEdges.dry[1][0])).toBeGreaterThan(20)
  expect(Math.abs(result.halfEdges.wet[0][0]-result.halfEdges.wet[1][0])).toBeLessThanOrEqual(3)
  expect(result.indoor.day[0]).toBeGreaterThan(result.day.day[0]+20)
  await page.locator('canvas').screenshot({path:info.outputPath(`water-region-transition-${backend}.png`)})
})
