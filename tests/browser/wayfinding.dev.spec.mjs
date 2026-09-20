import { test, expect } from './helpers/test.mjs'

for(const width of [1280,620])test(`area entrances share the anchorage sign language at ${width}px`,async({page},info)=>{
  await page.setViewportSize({width,height:800});await page.goto('/')
  await page.evaluate(async(width)=>{
    const [{createGameSession},{drawHardVacuumFrame},{freshExpedition,SECTORS},{advanceDevelopmentLevel},wayfinding]=await Promise.all([
      import('/src/games/hardVacuum/gameSession.ts'),import('/src/games/hardVacuum/render.ts'),import('/src/games/hardVacuum/expedition.ts'),
      import('/src/games/hardVacuum/development.ts'),import('/src/games/hardVacuum/stationWayfinding.ts'),
    ])
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=800
    document.body.replaceChildren(canvas);document.body.style.margin='0'
    const ctx=canvas.getContext('2d'),fillText=ctx.fillText.bind(ctx)
    const roomNames=new Set(SECTORS.map(room=>room.name.toUpperCase()))
    let lettering=[],smallRoomLabels=[]
    ctx.fillText=(text,...args)=>{
      if(ctx.font===wayfinding.WAYFINDING_STYLE.font)lettering.push({text,color:ctx.fillStyle,baseline:ctx.textBaseline})
      else if(roomNames.has(text))smallRoomLabels.push(text)
      fillText(text,...args)
    }
    window.entryFrame=(region,open)=>{
      const sign=wayfinding.REGION_ENTRY_SIGNS.find(s=>s.region===region),state=freshExpedition()
      if(open)advanceDevelopmentLevel(state,region)
      state.position={x:sign.pos.x-sign.direction.x*125,y:sign.pos.y-sign.direction.y*125}
      const session=createGameSession(state,{seed:42});session.command({type:'start'})
      const refs=session.refs;refs.shipRef.current.angle=Math.atan2(sign.direction.y,sign.direction.x)
      lettering=[];smallRoomLabels=[]
      drawHardVacuumFrame({...refs,ctx,gameState:session.mode,nowMs:1000,expedition:session.expedition,expeditionRuntime:refs.runtimeRef.current,mapOpen:false,canvasSizeRef:{current:{width,height:800}},RED_ROCK_DETONATION_DELAY:2,bots:refs.botsRef.current,shipAppearance:refs.shipAppearanceRef.current,shields:session.expedition.shields})
      return {lettering,smallRoomLabels,expected:[...wayfinding.REGION_ENTRY_SIGNS,wayfinding.BREACH_ANCHORAGE_SIGN].flatMap(s=>s.lines)}
    }
  },width)
  for(const region of ['freight','works','ring','refuge','heart'])for(const open of [false,true]) {
    const result=await page.evaluate(({region,open})=>window.entryFrame(region,open),{region,open})
    expect(result.lettering.map(l=>l.text)).toEqual(result.expected)
    expect(result.lettering.every(l=>l.color==='#9bb6a7' && l.baseline==='middle')).toBe(true)
    expect(result.smallRoomLabels).toEqual([])
    await page.screenshot({path:info.outputPath(`${region}-${open?'powered':'closed'}.png`)})
  }
})

test('room names remain on the survey map and respect exploration',async({page})=>{
  await page.goto('/')
  const result=await page.evaluate(async()=>{
    const [{drawExpeditionMap},{createGameSession},{freshExpedition,SECTORS},{REGIONS}]=await Promise.all([
      import('/src/games/hardVacuum/expeditionRender.ts'),import('/src/games/hardVacuum/gameSession.ts'),
      import('/src/games/hardVacuum/expedition.ts'),import('/src/games/hardVacuum/campaignWorld.ts'),
    ])
    const state=freshExpedition(),session=createGameSession(state,{seed:42})
    const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=800
    const ctx=canvas.getContext('2d'),fillText=ctx.fillText.bind(ctx)
    let words=[]
    ctx.fillText=(text,...args)=>{words.push(text);fillText(text,...args)}
    const draw=(overview=false)=>{
      words=[];drawExpeditionMap(ctx,state,session.refs.shipRef.current,1280,800,true,overview)
      return words
    }
    const explored=draw()
    state.visited=SECTORS.map(room=>room.id)
    return {explored,local:draw(),overview:draw(true),rooms:SECTORS.map(room=>room.name.toUpperCase()),regions:REGIONS.map(region=>region.name.toUpperCase())}
  })
  expect(result.explored).toContain('THE BREACH');expect(result.explored).not.toContain('THE WORKS')
  expect(result.local).toEqual(expect.arrayContaining(result.rooms))
  expect(result.overview).toEqual(expect.arrayContaining(result.regions))
})
