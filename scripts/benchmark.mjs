import { build, preview } from 'vite'
import { chromium } from '@playwright/test'
import { mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { SCENES, BENCHMARK_SEED } from '../benchmarks/scenes.mjs'

const output=process.argv[2]??path.join(os.tmpdir(),'arcade-performance.json')
const outDir=await mkdtemp(path.join(os.tmpdir(),'arcade-benchmark-'))
const root=path.resolve('benchmarks')
await build({configFile:false,root,logLevel:'warn',build:{outDir,emptyOutDir:false}})
const server=await preview({configFile:false,root,logLevel:'warn',build:{outDir},preview:{host:'127.0.0.1',port:4177,strictPort:true}})
const browser=await chromium.launch()
try {
  const page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1})
  page.on('pageerror',error=>console.error(error))
  await page.goto('http://127.0.0.1:4177');await page.waitForFunction(()=>typeof window.runBenchmark==='function')
  const cdp=await page.context().newCDPSession(page)
  const data={label:process.argv[3]??'current',recordedAt:new Date().toISOString(),seed:BENCHMARK_SEED,hardware:{platform:os.platform(),arch:os.arch(),release:os.release(),cpu:os.cpus()[0]?.model,logicalCPUs:os.cpus().length,memoryGiB:os.totalmem()/1024**3},browser:browser.version(),userAgent:await page.evaluate(()=>navigator.userAgent),viewport:{width:1280,height:800,dpr:1},headless:true,cpuThrottle:1,memoryMethod:'Separate 120-frame allocation pass at 32 KiB sampling; includes fixture setup and, for moving-haven, 180 pre-transit ticks. CPU timings are not allocation-profiled.',results:[]}
  // Compile/warm shared renderer and wiring caches; each measured episode gets fresh gameplay.
  await page.evaluate(()=>window.runBenchmark({name:'late-field',density:1,frames:30,episodes:1}))
  const allocationBytes=node=>node.selfSize+node.children.reduce((n,child)=>n+allocationBytes(child),0)
  const scenes=process.env.BENCHMARK_SCENES?.split(',')??SCENES
  for(const name of scenes)for(const density of [1,3]) {
    await cdp.send('HeapProfiler.collectGarbage')
    const before=await cdp.send('Runtime.getHeapUsage')
    const result=await page.evaluate(options=>window.runBenchmark(options),{name,density})
    if(density===1)await page.screenshot({path:path.join(outDir,`${name}.png`)})
    const after=await cdp.send('Runtime.getHeapUsage')
    await cdp.send('HeapProfiler.collectGarbage')
    const retained=await cdp.send('Runtime.getHeapUsage')
    // Allocation sampling changes timing substantially. Keep it out of CPU/frame measurements.
    await cdp.send('HeapProfiler.startSampling',{samplingInterval:32768,includeObjectsCollectedByMajorGC:true,includeObjectsCollectedByMinorGC:true})
    await page.evaluate(options=>window.runBenchmark(options),{name,density,frames:120,episodes:1})
    const {profile}=await cdp.send('HeapProfiler.stopSampling')
    const allocated=allocationBytes(profile.head)
    result.memory={allocationFrames:120,sampledAllocatedBytes:allocated,sampledBytesPerFrame:allocated/120,heapBefore:before.usedSize,heapBeforeGC:after.usedSize,heapAfterGC:retained.usedSize,retainedDelta:retained.usedSize-before.usedSize}
    data.results.push(result)
    await writeFile(output,JSON.stringify(data,null,2)+'\n')
    console.log(`${name} ${density}x: ${result.peaks.bodies} bodies; CPU p95 ${result.stats.work.p95.toFixed(2)} / p99 ${result.stats.work.p99.toFixed(2)} ms`)
  }
  console.log(`Report: ${output}\nScene screenshots: ${outDir}`)
} finally {
  await browser.close();await new Promise(resolve=>server.httpServer.close(resolve))
}
