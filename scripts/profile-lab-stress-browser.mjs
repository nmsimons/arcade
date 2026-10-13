import { build, preview } from 'vite'
import { chromium } from '@playwright/test'
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'

const fixture = JSON.parse(await readFile('tests/fixtures/jumping/lab-stress.json', 'utf8'))
const scenario = fixture.cases.find(c => c.id === (process.env.LAB_STRESS_CASE ?? 'mixed-max'))
const start = Number(process.env.LAB_STRESS_SKIP ?? 210), frames = Number(process.env.LAB_STRESS_FRAMES ?? 60)
if (!scenario || !Number.isInteger(start) || start < 30 || start > 10000 || !Number.isInteger(frames) || frames < 10 || frames > 1000) throw new Error('Invalid profiling window')
const readable = process.env.LAB_STRESS_PROFILE_READABLE === '1'
const output = resolve(process.argv[2] ?? `.local/${scenario.id}-${start}-browser.cpuprofile`)
const root = process.cwd(), directory = resolve('.local/lab-profile-build'), input = resolve('.local/lab-profile-entry.html')
await mkdir(directory, { recursive: true }); await mkdir(resolve(output, '..'), { recursive: true })
await writeFile(input, '<!doctype html><meta charset="utf-8"><title>LAB CPU profile</title><script type="module" src="/tests/bench/labStressBrowser.mjs"></script>')
await build({ configFile: false, root, publicDir: false, logLevel: 'warn', build: { outDir: directory, emptyOutDir: true, rollupOptions: { input }, minify: readable ? false : 'esbuild' } })
await copyFile(join(directory, '.local/lab-profile-entry.html'), join(directory, 'index.html'))
const server = await preview({ configFile: false, root, publicDir: false, logLevel: 'warn', build: { outDir: directory }, preview: { host: '127.0.0.1', port: 4192, strictPort: true } })
let browser
try {
  browser = await chromium.launch({ channel: 'msedge', args: ['--enable-gpu'] })
  const host = await browser.newBrowserCDPSession(), { gpu } = await host.send('SystemInfo.getInfo')
  await host.detach()
  if (gpu.featureStatus['2d_canvas'] !== 'enabled' || gpu.featureStatus.gpu_compositing !== 'enabled' || /swiftshader|llvmpipe/i.test(JSON.stringify(gpu.devices))) throw new Error('Hardware renderer unavailable')
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 }), errors = []
  page.on('pageerror', error => errors.push(error.message))
  const cdp = await page.context().newCDPSession(page)
  let profile
  await page.exposeFunction('labStressProfileBoundary', async boundary => {
    if (boundary === 'start') {
      await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 1000 }); await cdp.send('Profiler.start')
    } else profile = (await cdp.send('Profiler.stop')).profile
  })
  await page.goto('http://127.0.0.1:4192/'); await page.waitForFunction(() => !!window.labStress)
  const result = await page.evaluate(options => window.labStress.runCase(options), { fixture, scenario, frames: start + frames - 30, warmup: 30, width: 1280, height: 800, dpr: 1, profileWindow: { start, end: start + frames } })
  if (errors.length || !profile) throw new Error(`Invalid profile: ${errors.join(', ')}`)
  await writeFile(output, JSON.stringify(profile))
  const byId = new Map(profile.nodes.map(n => [n.id, n])), parents = new Map(), self = new Map(), inclusive = new Map(), families = { matterCollision: 0 }
  for (const n of profile.nodes) for (const child of n.children ?? []) parents.set(child, n.id)
  for (const id of profile.samples) {
    const n = byId.get(id), key = `${n.callFrame.functionName || '(anonymous)'} ${n.callFrame.url}`
    self.set(key, (self.get(key) ?? 0) + 1)
    if (/^n\.collides$|_overlapAxes|_findSupports/.test(n.callFrame.functionName)) families.matterCollision++
    for (let p = id; p; p = parents.get(p)) {
      const name = byId.get(p).callFrame.functionName
      if (/^(planMechanismMotion|stepMechanisms|stepPropPhysics|stepRope)$/.test(name)) inclusive.set(name,(inclusive.get(name)??0)+1)
    }
  }
  const summary = { scenario: scenario.id, start, frames, readable, browser: await browser.version(),
    fixtureHash: createHash('sha256').update(JSON.stringify(fixture)).digest('hex'), samples: profile.samples.length,
    note: 'Instrumented production-browser sampling profile. Timings are diagnostic only; compare uninstrumented stress runs for FPS.',
    inclusivePhases: [...inclusive].map(([name,count])=>({name,count,percent:100*count/profile.samples.length})),
    selfSampleFamilies: Object.fromEntries(Object.entries(families).map(([name, count]) => [name, { count, percent: 100 * count / profile.samples.length }])),
    topSelfSamples: [...self].toSorted((a, b) => b[1] - a[1]).slice(0, 25), outcomeHash: createHash('sha256').update(JSON.stringify(result.snapshot)).digest('hex'), output }
  await writeFile(output.replace(/\.cpuprofile$/, '.summary.json'), JSON.stringify(summary, null, 2) + '\n')
  console.log(JSON.stringify(summary, null, 2))
} finally { await browser?.close(); await new Promise(resolve => server.httpServer.close(resolve)) }
