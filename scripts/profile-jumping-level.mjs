// Frame timing for one built-in UJG level in hardware Edge, on production bundles, against a frozen copy of
// the level. Built for before/after comparisons: give two bundles and their episodes alternate.
//
//   node scripts/profile-jumping-level.mjs <level file> [options]
//     --build <dir>           Build the current source into <dir> (add --readable for function names) and exit.
//     --bundle <name>=<dir>   A production bundle to measure. Repeat for A/B. Default: build the current source.
//     --snapshot <file>       Frozen level JSON. Default: freeze public/levels/jumping/<level file> into --out.
//     --sections auto[:N]     N valid start points spread along the level (default auto:5), or x:y,x:y,...
//     --dpr 1,1.5             Device pixel ratios (default 1,1.5) at a 1280x800 CSS viewport.
//     --episodes 3            Episodes per bundle, section and DPR (default 3), alternating bundles.
//     --seconds 8             Measured play per episode (default 8).
//     --adaptive              Leave adaptive quality on. By default it is off, so resolution never changes mid-run.
//     --skip <name>=<layers>  A variant of the first bundle that leaves those drawing layers out (comma-separated:
//                             lighting, backdrop, gravity, displays, pickups, terrain, ground-cover, terrain-edges,
//                             terrain-texture (flat colour instead of the material pattern),
//                             fields, climbables, athlete, water; see src/games/jumping/measureLayers.ts). Repeat to
//                             price several layers; variants alternate with the bundles.
//     --trace                 Add one traced episode per section, on the first bundle at the highest DPR, and report
//                             how busy each browser thread was, the GPU process's included.
//     --profile               Add one CPU-profiled episode per section, on the first bundle, for attribution.
//                             Give that bundle readable names: --build <dir> --readable.
//     --out <dir>             Results folder (default .local/perf/<level>-<time>).
//
// Each episode opens the level with its entrance moved to the section's start, waits for play, then runs
// right with a jump every 0.9 s. Frames are grouped by animation-frame time: frame CPU is the main-thread
// time of all of that frame's callbacks (the game's tick: physics, then drawing). Steady figures exclude the
// first second of input, which is reported separately as the first-input hitch. Real-time play is not
// deterministic, so compare medians of several episodes, not single runs. Other applications using the CPU or
// GPU, such as the game open in a browser tab, can halve the frame rate: absolute figures from different runs
// are not comparable, so measure before and after together, interleaved. Each episode records the whole
// machine's CPU use (`machineCpuPercent`) to show when something else was busy.
import { build, preview } from 'vite'
import { chromium } from '@playwright/test'
import { readFile, writeFile, mkdir, copyFile, stat } from 'node:fs/promises'
import { resolve, join, basename } from 'node:path'
import { createHash } from 'node:crypto'
import { execSync } from 'node:child_process'
import { cpus } from 'node:os'
import { parseLevel, snapToGround, spawnProblem } from '../src/games/jumping/level.ts'

const args = process.argv.slice(2), file = args.find(a => !a.startsWith('--') && !args[args.indexOf(a) - 1]?.startsWith('--'))
const option = name => { const i = args.indexOf(`--${name}`); return i < 0 ? undefined : args[i + 1] }
const options = name => args.flatMap((a, i) => a === `--${name}` ? [args[i + 1]] : [])
const flag = name => args.includes(`--${name}`)

async function buildBundle(dir, readable = flag('readable')) {
  await build({ logLevel: 'warn', build: { outDir: resolve(dir), emptyOutDir: true, minify: readable ? false : 'esbuild' } })
  await writeFile(join(resolve(dir), 'perf-build.json'), JSON.stringify({ readable }))
  return resolve(dir)
}
if (option('build')) { console.log('Built', await buildBundle(option('build'))); process.exit(0) }
if (!file || !/\.jump-level\.json$/.test(file)) throw new Error('Give a built-in level file, such as fulltilt.jump-level.json')

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const out = resolve(option('out') ?? `.local/perf/${basename(file, '.jump-level.json')}-${stamp}`)
await mkdir(out, { recursive: true })
let snapshotPath = option('snapshot')
if (!snapshotPath) { snapshotPath = join(out, `${basename(file, '.json')}.snapshot.json`); await copyFile(resolve('public/levels/jumping', file), snapshotPath) }
const snapshotText = await readFile(snapshotPath, 'utf8'), snapshot = JSON.parse(snapshotText)
const level = parseLevel(snapshot)
const bundles = options('bundle').map(b => { const [name, dir] = b.split('='); return { name, dir: resolve(dir) } })
if (!bundles.length) bundles.push({ name: 'current', dir: await buildBundle(join(out, 'bundle')) })
const variants = [...bundles.map((bundle, i) => ({ name: bundle.name, bundle: i, skip: '' })),
  ...options('skip').map(spec => { const [name, layers] = spec.split('='); return { name, bundle: 0, skip: layers } })]
if (flag('profile')) {
  const built = await readFile(join(bundles[0].dir, 'perf-build.json'), 'utf8').then(JSON.parse, () => ({}))
  if (!built.readable) console.warn(`${bundles[0].name} is minified: --profile names will be mangled. Build one with --build <dir> --readable.`)
}
const dprs = (option('dpr') ?? '1,1.5').split(',').map(Number), episodes = Number(option('episodes') ?? 3), seconds = Number(option('seconds') ?? 8)

/** Start points where the entrance is valid (flat, with a clear doorway), spread along the level. */
function chooseSections(spec) {
  if (!spec.startsWith('auto')) return spec.split(',').map(pair => { const [x, y] = pair.split(':').map(Number); return { x, y } })
  const count = Number(spec.split(':')[1] ?? 5), valid = []
  for (let x = 100; x <= level.width - 100; x += 25) {
    for (let y = 200; y <= 3000; y += 200) {
      const ground = snapToGround(level, x, y)
      if (!spawnProblem(parseLevel({ ...snapshot, entrance: { ...snapshot.entrance, x, y: ground.y } }))) { valid.push({ x, y: ground.y }); break }
    }
  }
  const sections = [{ x: snapshot.entrance.x, y: snapshot.entrance.y }]
  for (let i = 1; i < count; i++) {
    const target = level.width * i / count, next = valid.find(p => p.x >= target) ?? valid.at(-1)
    if (next && !sections.some(s => Math.abs(s.x - next.x) < 200)) sections.push(next)
  }
  return sections
}
const sections = chooseSections(option('sections') ?? 'auto:5')

const stats = values => {
  if (!values.length) return null
  const s = values.toSorted((a, b) => a - b), p = q => +s[Math.min(s.length - 1, Math.ceil(s.length * q) - 1)].toFixed(2)
  return { mean: +(values.reduce((a, b) => a + b, 0) / values.length).toFixed(2), p50: p(.5), p95: p(.95), p99: p(.99), worst: +s.at(-1).toFixed(2) }
}
/** Whole-machine CPU busy share between two readings: this harness and its browser included. */
const cpuTimes = () => cpus().reduce((sum, c) => { const total = Object.values(c.times).reduce((a, b) => a + b, 0); return { busy: sum.busy + total - c.times.idle, total: sum.total + total } }, { busy: 0, total: 0 })
const busyShare = (from, to) => +(100 * (to.busy - from.busy) / Math.max(1, to.total - from.total)).toFixed(1)
/** Busy share of each browser thread between the perf-input and perf-end markers, from its top-level tasks. */
function threadBusy(events) {
  const names = new Map(), processes = new Map()
  for (const e of events) if (e.ph === 'M' && e.name === 'thread_name') names.set(`${e.pid}:${e.tid}`, e.args.name)
  for (const e of events) if (e.ph === 'M' && e.name === 'process_name') processes.set(e.pid, e.args.name)
  const marks = events.filter(e => e.name === 'TimeStamp' && /perf-(input|end)/.test(e.args?.data?.message ?? ''))
  const start = marks.find(e => e.args.data.message === 'perf-input')?.ts, end = marks.find(e => e.args.data.message === 'perf-end')?.ts
  if (start === undefined || end === undefined) return [{ thread: 'markers missing', busyPercent: 0 }]
  const busy = new Map()
  for (const e of events) {
    if (e.ph !== 'X' || e.name !== 'ThreadControllerImpl::RunTask' || !e.dur) continue
    const from = Math.max(e.ts, start), to = Math.min(e.ts + e.dur, end)
    if (to > from) { const key = `${e.pid}:${e.tid}`; busy.set(key, (busy.get(key) ?? 0) + to - from) }
  }
  return [...busy].map(([key, us]) => ({ thread: `${processes.get(Number(key.split(':')[0])) ?? '?'} / ${names.get(key) ?? key}`, busyPercent: +(100 * us / (end - start)).toFixed(1) }))
    .sort((a, b) => b.busyPercent - a.busyPercent).slice(0, 12)
}
const median = values => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)]

const servers = await Promise.all(bundles.map((bundle, i) => preview({ logLevel: 'warn', build: { outDir: bundle.dir }, preview: { host: '127.0.0.1', port: 4193 + i, strictPort: true } })))
const browser = await chromium.launch({ channel: 'msedge', args: ['--enable-gpu'] })
const results = []
try {
  const host = await browser.newBrowserCDPSession(), { gpu } = await host.send('SystemInfo.getInfo'); await host.detach()
  if (gpu.featureStatus['2d_canvas'] !== 'enabled' || /swiftshader|llvmpipe|basic render/i.test(gpu.devices[0]?.deviceString ?? '')) throw new Error(`Hardware renderer unavailable: ${gpu.devices[0]?.deviceString}`)

  async function episode(variantIndex, section, dpr, profiled, traced) {
    const variant = variants[variantIndex]
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: dpr }), errors = []
    page.on('pageerror', e => errors.push(e.message))
    const moved = { ...snapshot, entrance: { ...snapshot.entrance, x: section.x, y: section.y } }
    await page.route(`**/levels/jumping/${file}`, route => route.fulfill({ body: JSON.stringify(moved), contentType: 'application/json' }))
    await page.addInitScript(({ adaptive, skip }) => {
      try {
        if (!adaptive) localStorage.setItem('jumping:lighting-performance-mode', 'false')
        if (skip) localStorage.setItem('jumping:measure-skip-layers', skip); else localStorage.removeItem('jumping:measure-skip-layers')
      } catch { /* Measured with the defaults. */ }
      const raf = window.requestAnimationFrame.bind(window)
      window.perfFrames = []; window.perfStates = []; window.perfOn = false
      window.requestAnimationFrame = callback => raf(time => {
        const start = performance.now(); callback(time)
        if (window.perfOn) window.perfFrames.push([time, performance.now() - start])
      })
      setInterval(() => { if (window.perfOn) window.perfStates.push([performance.now(), document.querySelector('.jumping-state')?.textContent ?? '']) }, 100)
    }, { adaptive: flag('adaptive'), skip: variant.skip })
    try {
      await page.goto(`http://127.0.0.1:${4193 + variant.bundle}/lab/levels/built-in/${file}`)
      const canvas = page.locator('.jumping-game > canvas')
      await canvas.waitFor({ timeout: 60000 })
      if (!page.url().includes(file)) throw new Error(`The level link was refused at ${section.x},${section.y}`)
      await page.waitForFunction(() => !document.querySelector('.jumping-game[aria-busy="true"]'), null, { timeout: 60000 })
      await page.waitForFunction(() => { const s = document.querySelector('.jumping-state')?.textContent; return s && !/Entering|Waking/.test(s) }, null, { timeout: 60000 })
      await canvas.focus(); await page.waitForTimeout(1500)
      const cdp = profiled || traced ? await page.context().newCDPSession(page) : null
      if (profiled) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); await cdp.send('Profiler.start') }
      const traceEvents = []
      if (traced) {
        cdp.on('Tracing.dataCollected', ({ value }) => traceEvents.push(...value))
        await cdp.send('Tracing.start', { transferMode: 'ReportEvents', traceConfig: { recordMode: 'recordContinuously',
          includedCategories: ['toplevel', 'devtools.timeline', 'gpu', 'viz', 'cc', 'disabled-by-default-gpu.service'] } })
      }
      const backingBefore = await canvas.evaluate(c => `${c.width}x${c.height}`)
      const inputStart = await page.evaluate(() => { window.perfOn = true; console.timeStamp('perf-input'); return performance.now() })
      const machineBefore = cpuTimes(), began = Date.now(); await page.keyboard.down('d')
      while (Date.now() - began < seconds * 1000) { await page.keyboard.down('Space'); await page.waitForTimeout(220); await page.keyboard.up('Space'); await page.waitForTimeout(680) }
      await page.keyboard.up('d')
      const machineCpuPercent = busyShare(machineBefore, cpuTimes())
      const { frames: log, states } = await page.evaluate(() => { window.perfOn = false; return { frames: window.perfFrames, states: window.perfStates } })
      const profile = profiled ? (await cdp.send('Profiler.stop')).profile : null
      let threads
      if (traced) {
        await page.evaluate(() => console.timeStamp('perf-end'))
        await new Promise(done => { cdp.once('Tracing.tracingComplete', done); cdp.send('Tracing.end') })
        threads = threadBusy(traceEvents)
      }
      const backingAfter = await canvas.evaluate(c => `${c.width}x${c.height}`)
      const byFrame = new Map(); for (const [time, ms] of log) byFrame.set(time, (byFrame.get(time) ?? 0) + ms)
      const times = [...byFrame.keys()].sort((a, b) => a - b)
      const steady = times.filter(t => t >= inputStart + 1000), first = times.filter(t => t < inputStart + 1000)
      const intervals = list => list.slice(1).map((t, i) => t - list[i])
      // The display refresh is the fastest common interval: the median frame may already span two refreshes.
      const steadyIntervals = intervals(steady), vsync = steadyIntervals.toSorted((a, b) => a - b)[Math.floor(steadyIntervals.length * .05)]
      const stateCounts = {}; for (const [, s] of states) stateCounts[s] = (stateCounts[s] ?? 0) + 1
      return {
        bundle: variant.name, skip: variant.skip, section: `${section.x}:${section.y}`, dpr, profiled: !!profiled,
        backing: backingBefore === backingAfter ? backingAfter : `${backingBefore} -> ${backingAfter}`,
        fps: +(steady.length / ((steady.at(-1) - steady[0]) / 1000)).toFixed(1), vsyncMs: +vsync.toFixed(2),
        frameCpuMs: stats(steady.map(t => byFrame.get(t))), frameIntervalMs: stats(steadyIntervals),
        missedFrames: steadyIntervals.filter(d => d > vsync * 1.5).length, steadyFrames: steady.length,
        firstInputHitchMs: +Math.max(0, ...intervals(first)).toFixed(1), machineCpuPercent, states: stateCounts, errors, profile, threads,
      }
    } finally { await page.close() }
  }

  const order = []
  for (const dpr of dprs) for (const section of sections) for (let e = 0; e < episodes; e++)
    for (let v = 0; v < variants.length; v++) order.push([(v + e) % variants.length, section, dpr])
  let done = 0
  for (const [b, section, dpr] of order) {
    const result = await episode(b, section, dpr, false); delete result.profile; results.push(result)
    process.stdout.write(`\r${++done}/${order.length} episodes`)
  }
  process.stdout.write('\n')

  // One traced episode per section: how busy each browser thread was between the first key press and the end.
  const traces = []
  if (flag('trace')) for (const section of sections) {
    const { threads } = await episode(0, section, dprs.at(-1), false, true)
    traces.push({ section: `${section.x}:${section.y}`, dpr: dprs.at(-1), threads })
    console.log(`Trace ${section.x}:${section.y}: ` + threads.slice(0, 5).map(t => `${t.thread} ${t.busyPercent}%`).join(', '))
  }

  let attribution
  if (flag('profile')) {
    const self = new Map(), inclusive = new Map(), files = new Map(); let total = 0
    for (const section of sections) {
      const { profile } = await episode(0, section, dprs.at(-1), true)
      const byId = new Map(profile.nodes.map(n => [n.id, n])), parent = new Map()
      for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id)
      profile.samples.forEach((id, i) => {
        const frame = byId.get(id).callFrame, ms = profile.timeDeltas[i] / 1000
        if (frame.functionName === '(idle)') return
        total += ms
        const where = frame.url.split('/').at(-1).split('?')[0] || '(native)', key = `${frame.functionName || '(anonymous)'} (${where}:${frame.lineNumber + 1})`
        self.set(key, (self.get(key) ?? 0) + ms); files.set(where, (files.get(where) ?? 0) + ms)
        const seen = new Set()
        for (let p = id; p; p = parent.get(p)) { const name = byId.get(p).callFrame.functionName; if (name && !seen.has(name)) { seen.add(name); inclusive.set(name, (inclusive.get(name) ?? 0) + ms) } }
      })
    }
    const top = (map, n) => [...map].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, ms]) => ({ percent: +(100 * ms / total).toFixed(1), name: k }))
    attribution = { busyMs: Math.round(total), dpr: dprs.at(-1), bundle: bundles[0].name, self: top(self, 40),
      inclusive: top(new Map([...inclusive].filter(([k]) => !k.startsWith('('))), 60), files: top(files, 12) }
  }

  // Medians of episode medians, per bundle, DPR and section.
  const summary = []
  for (const dpr of dprs) for (const section of sections) {
    const key = `${section.x}:${section.y}`, row = { dpr, section: key }
    for (const bundle of variants) {
      const runs = results.filter(r => r.bundle === bundle.name && r.dpr === dpr && r.section === key)
      row[bundle.name] = { fps: median(runs.map(r => r.fps)), cpuP50: median(runs.map(r => r.frameCpuMs.p50)), cpuP99: median(runs.map(r => r.frameCpuMs.p99)),
        missed: median(runs.map(r => r.missedFrames)), machineCpu: median(runs.map(r => r.machineCpuPercent)), firstInputHitch: median(runs.map(r => r.firstInputHitchMs)), backing: [...new Set(runs.map(r => r.backing))].join(' | ') }
    }
    summary.push(row)
  }
  let commit = 'unknown'; try { commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim() + (execSync('git status --porcelain src', { encoding: 'utf8' }).trim() ? '+uncommitted src' : '') } catch { /* Outside git. */ }
  const report = {
    level: file, snapshot: { path: snapshotPath, sha256: createHash('sha256').update(snapshotText).digest('hex'), modified: (await stat(snapshotPath)).mtime },
    commit, browser: browser.version(), gpu: gpu.devices[0].deviceString, viewport: '1280x800', adaptiveQuality: flag('adaptive'),
    episodes, seconds, sections, bundles, variants, summary, attribution, threads: traces, results,
  }
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 1) + '\n')
  for (const row of summary) console.log(`DPR ${row.dpr}  ${row.section.padEnd(10)} ` + variants.map(b => {
    const r = row[b.name]; return `${b.name}: ${r.fps} fps, CPU p50 ${r.cpuP50} / p99 ${r.cpuP99} ms, missed ${r.missed}, first input ${r.firstInputHitch} ms, machine ${r.machineCpu}%`
  }).join('  |  '))
  if (attribution) console.log('Top inclusive:', attribution.inclusive.slice(0, 15).map(r => `${r.percent}% ${r.name}`).join(', '))
  console.log('Report:', join(out, 'report.json'))
} finally {
  await browser.close()
  await Promise.all(servers.map(server => new Promise(done => server.httpServer.close(done))))
}
