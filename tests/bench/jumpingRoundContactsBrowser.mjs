import { createRun, stepRun } from '../helpers/jumping-active-run.mjs'
import { parseLevel } from '../../src/games/jumping/level.ts'
import { NEUTRAL_INPUT } from '../../src/games/jumping/model.ts'
import { LightingRenderer, lightingPixelRatio } from '../../src/games/jumping/lightingRender.ts'
import { lightingForLevel } from '../../src/games/jumping/lightingDefinition.ts'
import { gameCamera } from '../../src/games/jumping/camera.ts'
const stats = values => {
  const v = values.toSorted((a,b)=>a-b), n=v.length
  return {mean:v.reduce((a,b)=>a+b,0)/n,p95:v[Math.ceil(n*.95)-1],p99:v[Math.ceil(n*.99)-1],max:v.at(-1)}
}
window.pinballProbe = async ({data, scenario, frames=300,warmup=30,width=1280,height=800,dpr=1}) => {
  const run=createRun(parseLevel(data)), renderer=new LightingRenderer({backend:'auto'})
  const canvas=document.createElement('canvas'),ratio=lightingPixelRatio(width,height,dpr)
  canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio)
  document.body.style.margin='0';document.body.replaceChildren(canvas)
  const ctx=renderer.drawingContext(canvas),lighting=lightingForLevel(run.level)
  const simulation=[],draw=[],intervals=[],trajectory=[],phases=[]
  let previous,metrics
  try {
    for(let frame=0;frame<=frames+warmup;frame++) {
      if(document.hidden)throw new Error('Hidden benchmark')
      const now=await new Promise(requestAnimationFrame)
      if(frame>warmup)intervals.push(now-previous)
      if(frame===frames+warmup)break
      const ascending=frame>=194&&frame<522
      const input={...NEUTRAL_INPUT,
        move:scenario==='ascent'?(frame<14||ascending?1:0):scenario==='push'?(frame<100?1:0):(frame<14?1:0),
        jump:scenario==='ascent'&&ascending&&(frame-194)%41<11}
      const start=performance.now()
      stepRun(run,input);stepRun(run,input)
      const updated=performance.now(),view=gameCamera(width,height,run.player,run.level,true)
      metrics=renderer.render(ctx,run,lighting,{...view,zoom:view.zoom*ratio,width:canvas.width,height:canvas.height},1/60)
      const end=performance.now()
      if(frame>=warmup){simulation.push(updated-start);draw.push(end-updated)}
      trajectory.push([run.player.x,run.player.y,run.player.vx,run.player.vy,!!run.player.inverted,
        ...run.props.flatMap(p=>[p.x,p.y,p.vx,p.vy,p.angle,p.angularVelocity,p.grounded]),
        ...run.triggers.flatMap(t=>[t.held,t.pressed,t.active,t.depression]),...run.forceFields.map(f=>f.active)])
      if(frame%60===59)phases.push({frame:frame+1,x:run.player.x,y:run.player.y,active:run.triggers.map(t=>t.active),gravity:run.props.map(p=>p.gravity)})
      previous=now
    }
    if(scenario==='ascent'&&warmup+frames>=600&&(run.player.y>=200||!run.player.inverted))throw new Error('Gravity ascent changed')
    return {scenario,frames,warmup,fps:1000/stats(intervals).mean,simulation:stats(simulation),draw:stats(draw),intervals:stats(intervals),
      over33_83ms:intervals.filter(t=>t>33.83).length,renderer:metrics.backend,width:canvas.width,height:canvas.height,
      phases,samples:{simulation,draw,intervals},trajectory}
  }finally{renderer.dispose()}
}
