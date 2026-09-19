import { createScene } from './scenes.mjs'
import { drawHardVacuumFrame } from '../src/games/hardVacuum/render.ts'
import { stepShipAppearance, stepHullSparks } from '../src/games/hardVacuum/shipRender.ts'
import { configureProfiling } from '../src/games/hardVacuum/profiling.ts'
import { createExpeditionSaveSession } from '../src/games/hardVacuum/expeditionSave.ts'

const canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d')
const nextFrame=()=>new Promise(resolve=>requestAnimationFrame(resolve))
const stats=values=>{
  const sorted=[...values].sort((a,b)=>a-b),n=sorted.length
  return {samples:n,mean:values.reduce((a,b)=>a+b,0)/n,p50:sorted[Math.floor((n-1)*.5)],p95:sorted[Math.floor((n-1)*.95)],p99:sorted[Math.floor((n-1)*.99)],max:sorted[n-1]}
}

window.runBenchmark=async({name,density,frames=180,episodes=3})=>{
  const samples={},peaks={},minimums={},outcomes=[]
  let sections={}
  const add=(key,value)=>(samples[key]??=[]).push(value)
  configureProfiling({now:()=>performance.now(),sample:(section,ms)=>{sections[section]=(sections[section]??0)+ms}})
  try {
    for(let episode=0;episode<episodes;episode++) {
      const fixture=createScene(name,density),s=fixture.session
      localStorage.clear() // Isolated benchmark browser origin only.
      const saves=createExpeditionSaveSession();saves.startNew()
      let previous=await nextFrame()
      for(let frame=0;frame<frames;frame++) {
        const timestamp=await nextFrame();add('frameInterval',timestamp-previous);previous=timestamp
        if(ctx.isContextLost())throw new Error('Canvas context lost; discard this benchmark run')
        sections={};const start=performance.now()
        fixture.control();s.step();const stepped=performance.now();add('simulation',stepped-start)
        const events=s.drainEvents()
        if(events.some(e=>e.type==='hud'||e.type==='state')) {
          const before=performance.now();s.snapshot();add('snapshot',performance.now()-before)
        }
        if(events.some(e=>e.type==='persist')||frame===frames-1) {
          const before=performance.now(),result=saves.save(s.expedition)
          if(result.status!=='saved')throw new Error(`Save benchmark failed: ${result.status}`)
          add('saving',performance.now()-before)
        }
        const drawing=performance.now(),appearance=s.refs.shipAppearanceRef.current
        stepShipAppearance(appearance,s.refs.keysRef.current,1/60,s.refs.shipRef.current.angularVelocity)
        s.refs.debrisRef.current.push(...stepHullSparks(appearance,s.refs.shipRef.current,s.expedition.shields,1/60))
        drawHardVacuumFrame({...s.refs,ctx,gameState:s.mode,nowMs:s.timeMs,expedition:s.expedition,
          expeditionRuntime:s.refs.runtimeRef.current,mapOpen:false,canvasSizeRef:{current:{width:1280,height:800}},
          RED_ROCK_DETONATION_DELAY:2,bots:s.refs.botsRef.current,shipAppearance:appearance,shields:s.expedition.shields})
        add('drawing',performance.now()-drawing);add('work',performance.now()-start)
        for(const key of ['collisions','geometry','radiation-dose','radiation-footprint'])add(key,sections[key]??0)
        // Diagnostic scans are outside CPU work timings, but inside frame/heap observations.
        for(const [key,value] of Object.entries(fixture.observe())) {
          peaks[key]=Math.max(peaks[key]??0,value);minimums[key]=Math.min(minimums[key]??Infinity,value)
        }
        if(s.mode!=='playing')throw new Error(`Fixture stopped: ${name}/${density}/${frame}: ${s.mode}`)
      }
      outcomes.push(fixture.outcome())
    }
  } finally {configureProfiling()}
  return {name,density,frames,episodes,stats:Object.fromEntries(Object.entries(samples).map(([k,v])=>[k,stats(v)])),minimums,peaks,outcomes}
}
