import { test, expect } from './helpers/test.mjs'

for (const backend of ['canvas','gpu']) test(`${backend}: player materials fade smoothly through regional light in every composition pass`, async ({ page }, info) => {
  await page.goto('/tests/fixtures/jumping/lighting-prototype.json')
  const result = await page.evaluate(async backend => {
    const { blankTrial } = await import('/src/games/jumping/level.ts')
    const { createPreviewRun } = await import('/src/games/jumping/challenge.ts')
    const { drawAthlete } = await import('/src/games/jumping/athlete.ts')
    const { LightingRenderer } = await import('/src/games/jumping/lightingRender.ts')
    const level = { ...blankTrial(), version: 2, width: 1800, height: 900, floor: 900,
      entrance: { x: 100, y: 900 }, goal: { x: 1700, y: 900 },
      environment: { kind: 'interior', lighting: 'regions', baseLighting: 'day', walls: [{ kind: 'facility', x: 800, y: 0, w: 1000, h: 900 }] },
      lighting: { nightMode: true, ambient: 0, lights: [] } }
    const run=createPreviewRun(level),renderer=new LightingRenderer({backend}),canvas=document.createElement('canvas')
    canvas.width=700;canvas.height=600
    const ctx=canvas.getContext('2d',{willReadFrequently:true}),crop={x:310,y:350,w:80,h:160}
    const mask=document.createElement('canvas');mask.width=700;mask.height=600
    const paint=mask.getContext('2d',{willReadFrequently:true})
    run.player.x=970
    paint.setTransform(2,0,0,2,-(970-175)*2,-650*2);drawAthlete(paint,run.player,'#fff')
    const alpha=paint.getImageData(crop.x,crop.y,crop.w,crop.h).data,interior=[]
    for(let y=2;y<crop.h-2;y++)for(let x=2;x<crop.w-2;x++) {
      if([-1,0,1].every(dy=>[-1,0,1].every(dx=>alpha[((y+dy)*crop.w+x+dx)*4+3]===255)))interior.push((y*crop.w+x)*4)
    }
    const render=x=>{
      run.player.x=x
      const before=JSON.stringify(run.player)
      const stats=renderer.render(ctx,run,level.lighting,{x:x-175,y:650,zoom:2,width:700,height:600},0)
      if(JSON.stringify(run.player)!==before)throw new Error('Rendering changed player state')
      return {stats,pixels:ctx.getImageData(crop.x,crop.y,crop.w,crop.h).data}
    }
    let previous,worst=0,bytes=0
    for(const x of [...Array.from({length:41},(_,i)=>970+i),...Array.from({length:40},(_,i)=>1009-i)]) {
      const {pixels,stats}=render(x);bytes=Math.max(bytes,stats.bufferBytes)
      if(previous)for(const index of interior)for(let c=0;c<3;c++)worst=Math.max(worst,Math.abs(pixels[index+c]-previous[index+c]))
      previous=pixels
    }
    const sheet=document.createElement('canvas');sheet.width=700;sheet.height=190
    const gallery=sheet.getContext('2d')
    for(const [i,x] of [800,850,900,950,1000,1100,1400].entries()) {
      render(x);gallery.drawImage(canvas,crop.x,crop.y,crop.w,crop.h,i*100+10,25,crop.w,crop.h)
      gallery.fillStyle='#303c36';gallery.font='12px monospace';gallery.fillText(String(x),i*100+30,15)
    }
    document.body.replaceChildren(sheet);document.body.style.margin='0';renderer.dispose()
    return {worst,interior:interior.length,bytes}
  },backend)
  expect(result.interior).toBeGreaterThan(100)
  expect(result.worst).toBeLessThanOrEqual(4)
  expect(result.bytes).toBeLessThan(64*1024*1024)
  await page.locator('canvas').screenshot({path:info.outputPath(`player-region-palette-${backend}.png`)})
})
