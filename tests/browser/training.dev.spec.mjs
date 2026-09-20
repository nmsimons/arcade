import {test,expect} from './helpers/test.mjs'

test('training zones render at flight scale with readable floor instructions and world geometry',async({page},info)=>{
  await page.goto('/')
  await page.evaluate(async()=>{
    const [{createGameSession},{drawHardVacuumFrame},training]=await Promise.all([import('/src/games/hardVacuum/gameSession.ts'),import('/src/games/hardVacuum/render.ts'),import('/src/games/hardVacuum/training.ts')])
    const session=createGameSession(undefined,{training:true,seed:42}),refs=session.refs
    window.trainingSession=session;window.trainingFixtures=training
    const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=800
    document.body.replaceChildren(canvas);document.body.style.margin='0'
    const ctx=canvas.getContext('2d'),fillText=ctx.fillText.bind(ctx)
    window.floorWords=[]
    ctx.fillText=(text,...args)=>{window.floorWords.push(text);fillText(text,...args)}
    window.trainingFrame=(pos)=>{
      refs.shipRef.current.pos=pos
      drawHardVacuumFrame({...refs,ctx,gameState:session.mode,nowMs:1000,expedition:session.expedition,expeditionRuntime:refs.runtimeRef.current,training:session.training,mapOpen:false,canvasSizeRef:{current:{width:1280,height:800}},RED_ROCK_DETONATION_DELAY:2,bots:refs.botsRef.current,shipAppearance:refs.shipAppearanceRef.current,shields:0})
    }
    window.trainingFrame({x:680,y:1720})
  })
  await expect(page.locator('canvas')).toBeVisible()
  await page.screenshot({path:info.outputPath('training-hoppers.png')})
  await page.evaluate(()=>window.trainingFrame({x:1770,y:1890}))
  await page.screenshot({path:info.outputPath('training-power.png')})
  await page.evaluate(()=>window.trainingFrame({x:1760,y:580}))
  await page.screenshot({path:info.outputPath('training-mining.png')})
  expect(await page.evaluate(()=>window.floorWords)).toEqual(expect.arrayContaining([
    '01 / FLIGHT HANDLING','02 / EXTRACTION RANGE','03 / ORE HANDLING','04 / AUXILIARY SYSTEMS','MINER INDUCTION / TRAINING RIG','ROCK DISPENSER',
  ]))
  expect((await page.evaluate(()=>window.floorWords)).join('\n')).not.toMatch(/NO STAKES|LEVEL 1|PRACTICE CREDITS ONLY|little lasers/i)
  const active=await page.evaluate(()=>{
    const session=window.trainingSession
    session.refs.rocksRef.current=window.trainingFixtures.TRAINING_HOPPERS.map(p=>session.createRock(p.x,p.y,19,{x:0,y:0},'blue'))
    for(let i=0;i<64;i++)session.step()
    window.trainingFrame({x:680,y:1900})
    return {shots:session.refs.baseShotsRef.current.length,rocks:session.refs.rocksRef.current.length,credits:session.expedition.banked}
  })
  expect(active.shots).toBeGreaterThanOrEqual(2)
  expect(active.rocks).toBe(2)
  expect(active.credits).toBe(0)
  await page.screenshot({path:info.outputPath('training-hopper-lasers.png')})
  const powered=await page.evaluate(()=>{
    const session=window.trainingSession
    session.command({type:'start'})
    session.refs.rocksRef.current.find(r=>r.sourceId).pos={...window.trainingFixtures.TRAINING_SOCKET}
    for(let i=0;i<95;i++)session.step()
    window.trainingFrame({x:1770,y:1890})
    return {powered:session.training.powered,door:session.training.door,words:window.floorWords.join('\n')}
  })
  expect(powered.powered).toBe(true)
  expect(powered.door).toBe(1)
  expect(powered.words).not.toMatch(/Haven|Orison|survivor|expedition|radiation|blaster|escape power|out there/i)
  await page.screenshot({path:info.outputPath('training-powered-door.png')})
  const charging=await page.evaluate(()=>{
    const s=window.trainingSession;s.command({type:'start'})
    const rocks=s.refs.rocksRef.current,initialRed=rocks.filter(r=>r.kind==='red').length
    rocks.splice(rocks.findIndex(r=>r.kind==='normal' && r.radius>20),1)
    s.refs.shipRef.current.pos={x:1760,y:580}
    for(let i=0;i<36;i++)s.step()
    window.trainingFrame({x:1760,y:580})
    return {initialRed,charge:s.training.emitter.charge,emitted:s.training.emitter.emitted}
  })
  expect(charging.initialRed).toBe(0);expect(charging.charge).toBeGreaterThan(.4);expect(charging.emitted).toBe(0)
  await page.screenshot({path:info.outputPath('training-emitter-charging.png')})
  const launched=await page.evaluate(()=>{
    const s=window.trainingSession
    for(let i=0;i<60 && !s.training.emitter.emitted;i++)s.step()
    window.trainingFrame({x:1760,y:580})
    const rock=s.refs.rocksRef.current.at(-1)
    window.emittedRock=rock
    return {pos:rock.pos,kind:rock.kind,flash:s.training.emitter.flash,emitted:s.training.emitter.emitted}
  })
  expect(launched).toEqual({pos:{x:2180,y:620},kind:'normal',flash:.6,emitted:1})
  await page.screenshot({path:info.outputPath('training-emitter-launch.png')})
  const out=await page.evaluate(()=>{
    for(let i=0;i<110;i++)window.trainingSession.step()
    window.trainingFrame({x:1760,y:580})
    return {x:window.emittedRock.pos.x,mode:window.trainingSession.mode}
  })
  expect(out.x).toBeLessThan(2112);expect(out.mode).toBe('playing')
  await page.screenshot({path:info.outputPath('training-emitter-clear.png')})
})
