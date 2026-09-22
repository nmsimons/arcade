import { build, preview } from 'vite'
import { chromium } from '@playwright/test'
import { mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

// Real production React adapter, isolated browser/save storage, real RAF clock.
// Run CPU profiling separately: it must not contaminate reported timing samples.
const output=process.argv[2]??path.join(os.tmpdir(),'urban-fire-performance.json')
const outDir=process.env.BENCHMARK_BUILD??await mkdtemp(path.join(os.tmpdir(),'urban-fire-benchmark-'))
const profiling=process.env.BENCHMARK_PROFILE==='1'
const viewport={width:Number(process.env.BENCHMARK_WIDTH??1280),height:Number(process.env.BENCHMARK_HEIGHT??800)}
const dpr=Number(process.env.BENCHMARK_DPR??1)
const episodes=profiling?1:Number(process.env.BENCHMARK_EPISODES??3),frames=Number(process.env.BENCHMARK_FRAMES??300)
if(!process.env.BENCHMARK_BUILD)await build({logLevel:'warn',build:{outDir,emptyOutDir:false,minify:profiling?false:'esbuild'}})
const server=await preview({logLevel:'warn',build:{outDir},preview:{host:'127.0.0.1',port:4178,strictPort:true}})
const gpuRequested=process.env.BENCHMARK_GPU==='1',channel=process.env.BENCHMARK_BROWSER
const browser=await chromium.launch({channel,args:gpuRequested?['--enable-gpu']:[]})
const stats=values=>{
  const sorted=[...values].sort((a,b)=>a-b),n=sorted.length
  return {samples:n,mean:values.reduce((a,b)=>a+b,0)/n,p50:sorted[Math.floor((n-1)*.5)],p95:sorted[Math.floor((n-1)*.95)],p99:sorted[Math.floor((n-1)*.99)],max:sorted[n-1]}
}
try {
  const page=await browser.newPage({viewport,deviceScaleFactor:dpr})
  const errors=[];page.on('pageerror',error=>errors.push(String(error)))
  await page.addInitScript(()=>{
    let seed=713
    Math.random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296}
    const raf=window.requestAnimationFrame.bind(window)
    const gameCallbacks=new WeakSet()
    let activeCallback
    window.perf={samples:[],intervals:[],cities:0,enabled:false,previous:0}
    window.requestAnimationFrame=callback=>raf(timestamp=>{
      activeCallback=callback
      const before=performance.now();callback(timestamp)
      activeCallback=undefined
      if(window.perf.enabled&&gameCallbacks.has(callback)){
        window.perf.samples.push(performance.now()-before)
        if(window.perf.previous)window.perf.intervals.push(timestamp-window.perf.previous)
        window.perf.previous=timestamp
      }
    })
    const getContext=HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext=function(...args){
      if(args[0]==='2d'&&this.width===3648&&this.height===3148)window.perf.cities++
      const context=getContext.apply(this,args)
      if(args[0]==='2d'&&this.getAttribute('aria-label')==='Urban Fire battlefield'&&!context.perfObserved){
        context.perfObserved=true
        for(const method of ['fillRect','drawImage']){
          const original=context[method]
          context[method]=function(...args){
            if(activeCallback)gameCallbacks.add(activeCallback)
            return original.apply(this,args)
          }
        }
      }
      return context
    }
  })
  const cdp=await page.context().newCDPSession(page)
  const browserCdp=await browser.newBrowserCDPSession()
  const {gpu}=await browserCdp.send('SystemInfo.getInfo')
  await browserCdp.detach()
  if(gpuRequested&&(gpu.featureStatus['2d_canvas']!=='enabled'||gpu.featureStatus.gpu_compositing!=='enabled'))
    throw new Error('Hardware Canvas/compositing unavailable; do not accept this run as an accelerated benchmark.')
  const waitForSamples=async count=>{
    const deadline=Date.now()+60000
    // Poll from Node: a browser-side RAF poll would be counted as game work.
    while(await page.evaluate(()=>window.perf.samples.length)<count){
      if(Date.now()>deadline)throw new Error('Urban Fire stopped producing animation callbacks')
      await new Promise(resolve=>setTimeout(resolve,100))
    }
  }
  const data={label:process.argv[3]??'current',recordedAt:new Date().toISOString(),profiling,seed:713,
    hardware:{platform:os.platform(),arch:os.arch(),cpu:os.cpus()[0]?.model,logicalCPUs:os.cpus().length},
    browser:browser.version(),channel:channel??'headless-shell',viewport:{...viewport,dpr},headless:true,gpuRequested,
    gpu:{devices:gpu.devices,features:gpu.featureStatus,renderer:gpu.auxAttributes?.glRenderer},
    method:`${episodes} fresh production-adapter episodes: ${frames} game RAF callbacks while driving/firing, then 60 paused callbacks. The game callback is identified by its battlefield draw; unrelated app/menu RAF callbacks are excluded. Transition latency includes browser/Playwright scheduling. No synthetic clock or developer hooks.`,episodes:[]}
  for(let episode=0;episode<episodes;episode++){
    await page.goto('http://127.0.0.1:4178/urban-fire')
    await page.getByRole('button',{name:'Deploy',exact:true}).waitFor()
    if(profiling){await cdp.send('Profiler.enable');await cdp.send('Profiler.start')}
    const deployed=performance.now()
    await page.getByRole('button',{name:'Deploy',exact:true}).click()
    await page.getByRole('button',{name:'Deploy',exact:true}).waitFor({state:'hidden'})
    const deployMs=performance.now()-deployed
    await page.keyboard.down('ArrowUp')
    await page.evaluate(()=>{window.perf.enabled=true})
    for(let shot=0;shot<8;shot++){await page.keyboard.press('Space');await page.waitForTimeout(100)}
    await waitForSamples(frames)
    const playing=await page.evaluate(()=>{window.perf.enabled=false;return structuredClone(window.perf)})
    await page.keyboard.up('ArrowUp')
    const paused=performance.now()
    await page.keyboard.press('p')
    await page.getByRole('heading',{name:'PAUSED',exact:true}).waitFor()
    const pauseMs=performance.now()-paused
    await page.screenshot({path:path.join(outDir,`episode-${episode}.png`)})
    await page.evaluate(()=>{window.perf.samples=[];window.perf.intervals=[];window.perf.previous=0;window.perf.enabled=true})
    await waitForSamples(60)
    const pause=await page.evaluate(()=>{window.perf.enabled=false;return structuredClone(window.perf)})
    const resumed=performance.now()
    await page.getByRole('button',{name:'Resume',exact:true}).click()
    await page.getByRole('heading',{name:'PAUSED',exact:true}).waitFor({state:'hidden'})
    const resumeMs=performance.now()-resumed
    await cdp.send('HeapProfiler.collectGarbage')
    data.episodes.push({deployMs,pauseMs,resumeMs,cityBuilds:await page.evaluate(()=>window.perf.cities),
      playing:{work:stats(playing.samples),frameInterval:stats(playing.intervals)},paused:{work:stats(pause.samples),frameInterval:stats(pause.intervals)},heap:await cdp.send('Runtime.getHeapUsage')})
    if(profiling){const {profile}=await cdp.send('Profiler.stop');await writeFile(output+'.cpuprofile',JSON.stringify(profile))}
    await writeFile(output,JSON.stringify({...data,errors},null,2)+'\n')
    console.log(`Episode ${episode+1}: playing p95 ${stats(playing.samples).p95.toFixed(2)} ms; pause ${pauseMs.toFixed(0)} ms; city builds ${data.episodes.at(-1).cityBuilds}`)
  }
  if(errors.length)throw new Error(errors.join('\n'))
  console.log(`Report: ${output}\nScreenshots: ${outDir}`)
}finally{await browser.close();await new Promise(resolve=>server.httpServer.close(resolve))}
