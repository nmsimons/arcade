import { test, expect } from './helpers/test.mjs'

for(const width of [1280,620]) test(`anchorage floor sign is centered and readable at ${width}px`,async({page},info)=>{
  await page.setViewportSize({width,height:800})
  await page.goto('/')
  const sign=await page.evaluate(async(width)=>{
    const [{createGameSession},{drawHardVacuumFrame},{ARRIVAL_POSITION,OUTER_LOCK}]=await Promise.all([
      import('/src/games/hardVacuum/gameSession.ts'),import('/src/games/hardVacuum/render.ts'),import('/src/games/hardVacuum/campaignWorld.ts'),
    ])
    const session=createGameSession(undefined,{seed:42});session.command({type:'start',fresh:true})
    const refs=session.refs
    refs.shipRef.current.pos={...ARRIVAL_POSITION}
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=800
    document.body.replaceChildren(canvas);document.body.style.margin='0'
    const ctx=canvas.getContext('2d'),fillText=ctx.fillText.bind(ctx)
    let label
    ctx.fillText=(text,x,y,...args)=>{
      if(text==='BREACH ANCHORAGE') {
        const transform=ctx.getTransform(),point=transform.transformPoint({x,y})
        label={font:ctx.font,align:ctx.textAlign,baseline:ctx.textBaseline,x:point.x,y:point.y,scale:transform.a}
      }
      fillText(text,x,y,...args)
    }
    drawHardVacuumFrame({...refs,ctx,gameState:session.mode,nowMs:1000,expedition:session.expedition,expeditionRuntime:refs.runtimeRef.current,mapOpen:false,canvasSizeRef:{current:{width,height:800}},RED_ROCK_DETONATION_DELAY:2,bots:refs.botsRef.current,shipAppearance:refs.shipAppearanceRef.current,shields:0})
    const centerX=(8670+OUTER_LOCK.x)/2
    return {label,expectedX:width/2+(centerX-ARRIVAL_POSITION.x)*label.scale,expectedY:400-22*label.scale}
  },width)
  expect(sign.label.font).toBe('600 20px monospace')
  expect(sign.label.align).toBe('center');expect(sign.label.baseline).toBe('middle')
  expect(sign.label.x).toBeCloseTo(sign.expectedX,3);expect(sign.label.y).toBeCloseTo(sign.expectedY,3)
  await page.screenshot({path:info.outputPath('anchorage-floor-sign.png')})
})
