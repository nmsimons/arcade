import { test, expect } from './helpers/test.mjs'

test('the central Haven link retracts visibly and leaves no socket after stowing',async({page},testInfo)=>{
  await page.goto('/')
  const result=await page.evaluate(async()=>{
    const [{drawHaven},{drawHavenLink}]=await Promise.all([
      import('/src/games/hardVacuum/havenRender.ts'),import('/src/games/hardVacuum/havenLinkRender.ts'),
    ])
    const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=650
    canvas.style.cssText='display:block;max-width:100%;margin:auto';document.body.replaceChildren(canvas)
    const ctx=canvas.getContext('2d');ctx.fillStyle='#081211';ctx.fillRect(0,0,1200,650)
    for(const [i,deployment] of [1,.75,.5,.25,0].entries()) {
      const x=120+i*240,y=195
      drawHaven(ctx,{pos:{x,y},angle:0,deployment:1},3,0,0,0,true,0,{deployment,connected:deployment===1})
      ctx.save();ctx.translate(x,460);ctx.scale(3,3)
      drawHavenLink(ctx,{x:0,y:0},3,deployment,deployment===1);ctx.restore()
      ctx.fillStyle='#b8cec3';ctx.font='13px monospace';ctx.textAlign='center'
      ctx.fillText(i===0 ? 'CONNECTED' : deployment ? `STOWING / ${i*25}%` : 'RETRACTED',x,600)
    }
    const tile=document.createElement('canvas');tile.width=120;tile.height=120
    const t=tile.getContext('2d'),signatures=[]
    for(const deployment of [1,.75,.5,.25,0]) {
      t.clearRect(0,0,120,120);drawHavenLink(t,{x:60,y:60},3,deployment,deployment===1)
      signatures.push([...t.getImageData(0,0,120,120).data].reduce((sum,n,i)=>sum+n*(i%7+1),0))
    }
    return signatures
  })
  expect(new Set(result).size).toBe(5)
  expect(result.at(-1)).toBe(0)
  await page.screenshot({path:testInfo.outputPath('haven-link-retraction.png'),fullPage:true})
})
