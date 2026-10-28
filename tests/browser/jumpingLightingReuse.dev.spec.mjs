import { test, expect } from './helpers/test.mjs'

for(const backend of ['canvas','gpu'])test(`${backend}: foreground reuse and empty-pass pruning preserve water, fades and charging-bay lighting`,async({page},info)=>{
  await page.goto('/lab')
  const result=await page.evaluate(async backend=>{
    const {blankTrial}=await import('/src/games/jumping/level.ts')
    const {createPreviewRun}=await import('/src/games/jumping/challenge.ts')
    const {LightingRenderer}=await import('/src/games/jumping/lightingRender.ts')
    const canvases=[document.createElement('canvas'),document.createElement('canvas')]
    for(const canvas of canvases){canvas.width=900;canvas.height=600}
    const contexts=canvases.map(canvas=>canvas.getContext('2d'))
    const renderers=[new LightingRenderer({backend,reuseObjectArtwork:false,skipEmptyAmbientPass:false}),new LightingRenderer({backend})]
    const level={...blankTrial(),version:2,width:1400,height:900,floor:900,entrance:{x:600,y:760},goal:{x:1300,y:900},
      platforms:[{x:0,y:550,w:350,h:350,groundCover:'grass'},{x:900,y:500,w:250,h:400}],
      props:[{kind:'ball',x:800,y:700,size:55},{kind:'box',x:440,y:760,size:40}],
      environment:{kind:'landscape',horizon:300,lighting:'regions',walls:[{kind:'cave',x:700,y:0,w:700,h:900}]},
      gravityPlates:[{id:'pool',x:350,y:600,w:900,h:300,effect:'water',gravity:-1}],
      lighting:{nightMode:true,ambient:0,lights:[{id:'lamp',x:450,y:300,direction:65,spread:120,intensity:100,power:'always'}]}}
    const cases=[]
    for(const charging of [false,true]){
      const current={...level,entrance:{...level.entrance,...(charging?{kind:'charging-bay'}:{})}}
      const run=createPreviewRun(current);run.entrance=null
      const view={x:260.3,y:200.7,zoom:.9,width:900,height:600}
      for(let frame=0;frame<9;frame++){
        if(frame===1){view.x+=.37;view.y-=.23}
        if(frame===2){run.props[0].angle=.33;run.props[1].x+=10;run.player.stride=.7}
        if(frame===3)run.exit={elapsed:.5}
        if(frame===4){run.exit=null;run.player.facing=-1;run.player.crouch=.7}
        if(frame===5){for(const surface of run.waterSurface.surfaces){surface.active=true;surface.height.fill(-3);surface.previous.fill(-2)}}
        if(frame===6)run.empRemaining=5
        if(frame===7){run.empRemaining=0;view.zoom=1.1}
        if(frame===8)for(const ctx of contexts)ctx.globalAlpha=.7
        const stats=renderers.map((renderer,i)=>renderer.render(contexts[i],run,current.lighting,view,.2))
        const pixels=contexts.map(ctx=>ctx.getImageData(0,0,900,600).data)
        let max=0,total=0,large=0
        for(let p=0;p<pixels[0].length;p++){const delta=Math.abs(pixels[0][p]-pixels[1][p]);max=Math.max(max,delta);total+=delta;if(delta>2)large++}
        cases.push({charging,frame,max,mean:total/pixels[0].length,large:large/pixels[0].length,reused:stats[1].objectArtworkReused,skipped:stats[1].ambientReadableSkipped})
      }
      for(const ctx of contexts)ctx.globalAlpha=1
    }
    document.body.replaceChildren(...canvases);document.body.style.margin='0'
    for(const renderer of renderers)renderer.dispose()
    return cases
  },backend)
  await info.attach('pixel-comparison',{body:JSON.stringify(result,null,2),contentType:'application/json'})
  for(const frame of result){expect(frame.max,JSON.stringify(frame)).toBeLessThanOrEqual(3);expect(frame.mean).toBeLessThan(.03);expect(frame.large).toBeLessThan(.0001);expect(frame.skipped).toBe(!frame.charging)}
  expect(result.some(frame=>frame.reused)).toBe(true)
  expect(result.find(frame=>frame.frame===8).reused).toBe(false)
  await page.locator('canvas').last().screenshot({path:info.outputPath(`retained-foreground-${backend}.png`)})
})

test('regional high DPI stays on GPU, and an oversized direct viewport can recover after resizing',async({page})=>{
  await page.goto('/lab')
  const result=await page.evaluate(async()=>{
    const {blankTrial}=await import('/src/games/jumping/level.ts')
    const {createPreviewRun}=await import('/src/games/jumping/challenge.ts')
    const {LightingRenderer,lightingPixelRatio}=await import('/src/games/jumping/lightingRender.ts')
    const level={...blankTrial(),version:2,width:1800,height:1200,floor:1200,environment:{kind:'landscape',horizon:400,walls:[{kind:'cave',x:700,y:0,w:1100,h:1200}]},lighting:{nightMode:true,ambient:0,lights:[]}}
    const run=createPreviewRun(level),renderer=new LightingRenderer({backend:'gpu'}),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d'),ratio=lightingPixelRatio(1280,800,1.5,false,true)
    const draw=(width,height,zoom)=>{canvas.width=width;canvas.height=height;return renderer.render(ctx,run,level.lighting,{x:0,y:0,width,height,zoom},0)}
    const native=draw(Math.round(1280*ratio),Math.round(800*ratio),ratio)
    const oversized=draw(1789,1118,1.3975)
    const recovered=draw(1280,800,1)
    const released=renderer.canvasFields===undefined&&renderer.staticFields.size===0
    renderer.dispose();return{ratio,native,oversized,recovered,released}
  })
  expect(result.ratio).toBeGreaterThan(1.2)
  expect(result.native.backend).toBe('gpu')
  expect(result.oversized.backend).toBe('canvas')
  expect(result.recovered.backend).toBe('gpu')
  expect(result.released).toBe(true)
  for(const stats of [result.native,result.oversized,result.recovered])expect(stats.bufferBytes).toBeLessThanOrEqual(64*1024*1024)
})
