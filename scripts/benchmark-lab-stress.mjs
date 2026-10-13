import { build, preview } from 'vite'
import { chromium } from '@playwright/test'
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { cpus, arch, platform, release } from 'node:os'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { propProbePlugin } from './lab-prop-probe-build.mjs'

const output = resolve(process.argv[2] ?? '.local/lab-stress-results.json')
const compareRopeAlgorithm = process.env.LAB_STRESS_COMPARE_ROPE_ALGORITHM === '1'
const wasmPath = resolve(process.env.LAB_STRESS_WASM ?? (compareRopeAlgorithm
  ? 'tests/fixtures/jumping/lab-rope-chain-probe/lab-rope.wasm' : 'public/wasm/lab-rope.wasm'))
const referenceWasm = process.env.LAB_STRESS_COMPARE_WASM ? resolve(process.env.LAB_STRESS_COMPARE_WASM) : null
const originalQueries = process.env.LAB_STRESS_COMPARE_COLLISION_QUERIES === '1'
const solver = process.env.LAB_STRESS_SOLVER ?? 'baseline'
const compareSolver = process.env.LAB_STRESS_COMPARE_SOLVER === '1'
const compareProps = process.env.LAB_STRESS_COMPARE_PROPS === '1'
const rapierRopes = process.env.LAB_STRESS_RAPIER_ROPES === '1'
if (rapierRopes && !compareProps)throw new Error('Batched native ropes require the prop-engine comparison')
if (!['baseline', 'active'].includes(solver)) throw new Error('Invalid LAB_STRESS_SOLVER')
if (originalQueries && process.env.LAB_STRESS_COMPARE_BUILD) throw new Error('Select one bundle reference')
const referenceBuild = process.env.LAB_STRESS_COMPARE_BUILD ? resolve(process.env.LAB_STRESS_COMPARE_BUILD) : originalQueries ? resolve('.local/lab-stress-reference-build') : null
if (referenceBuild && referenceWasm) throw new Error('Compare either a production bundle or a Wasm binary')
if (compareSolver && (referenceBuild || referenceWasm)) throw new Error('Select one comparison reference')
if (compareProps && (referenceBuild || referenceWasm || compareSolver)) throw new Error('Select one comparison reference')
if (compareRopeAlgorithm && (referenceBuild || referenceWasm || compareSolver || compareProps || rapierRopes)) throw new Error('Select one comparison reference')
const comparing = !!(referenceBuild || referenceWasm || compareSolver || compareProps || compareRopeAlgorithm)
const backends = compareRopeAlgorithm ? ['ordered', 'chain'] : compareProps ? ['matter', 'rapier'] : comparing ? ['before', 'optimized'] : ['typescript', 'wasm']
const wasmBytes = await readFile(wasmPath), referenceBytes = referenceWasm ? await readFile(referenceWasm) : originalQueries || compareSolver ? wasmBytes : referenceBuild ? await readFile(join(referenceBuild, 'lab-rope.wasm')) : null
const fixture = JSON.parse(await readFile('tests/fixtures/jumping/lab-stress.json', 'utf8'))
const filter = process.env.LAB_STRESS_CASES?.split(',')
const cases = filter ? fixture.cases.filter(c => filter.includes(c.id)) : fixture.cases
if (!cases.length || filter?.some(id => !fixture.cases.some(c => c.id === id))) throw new Error('Unknown LAB_STRESS_CASES')
const frames = Number(process.env.LAB_STRESS_FRAMES ?? 300), warmup = Number(process.env.LAB_STRESS_WARMUP ?? 30)
const episodes = Number(process.env.LAB_STRESS_EPISODES ?? 3)
const width = Number(process.env.LAB_STRESS_WIDTH ?? 1280), height = Number(process.env.LAB_STRESS_HEIGHT ?? 800), dpr = Number(process.env.LAB_STRESS_DPR ?? 1)
for (const [name, value, min, max] of [['frames', frames, 10, 10000], ['warmup', warmup, 2, 1000], ['episodes', episodes, 1, 20], ['width', width, 320, 7680], ['height', height, 320, 4320]]) {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Invalid ${name}`)
}
if (!Number.isFinite(dpr) || dpr < .5 || dpr > 4) throw new Error('Invalid DPR')
const root = process.cwd(), directory = resolve('.local/lab-stress-build'), input = resolve('.local/lab-stress-entry.html')
await mkdir('.local', { recursive: true }); await mkdir(directory, { recursive: true })
await writeFile(input, '<!doctype html><meta charset="utf-8"><title>LAB stress benchmark</title><script type="module" src="/tests/bench/labStressBrowser.mjs"></script>')
let referencePropPhysicsHash = null
if (originalQueries) {
  // Reproduce the pre-cache correction loop with the same current engine,
  // renderer and Wasm bytes. Remove only the local cache and its two call sites.
  await build({ configFile: false, root, publicDir: false, logLevel: 'warn', plugins: [{ name: 'reference-prop-queries', enforce: 'pre', transform(source, id) {
    if (!id.replaceAll('\\', '/').endsWith('/src/games/jumping/propPhysics.ts')) return
    if (!/  const queries = (active\?\.queries \?\? )?new CollisionQueries\(\)/.test(source) || source.match(/queries\.collides\(/g)?.length !== 2) throw new Error('Original query reference requires review after source changes')
    const original = source.replace(/^import \{ CollisionQueries \} from '\.\/collisionQueries\.ts'\r?\n/m, '')
      .replace(/^  const queries = (active\?\.queries \?\? )?new CollisionQueries\(\)\r?\n/m, '').replaceAll('queries.collides(', 'Query.collides(')
    referencePropPhysicsHash = createHash('sha256').update(original.replace(/\r\n/g, '\n')).digest('hex')
    return original
  } }], build: { outDir: referenceBuild, emptyOutDir: false, rollupOptions: { input }, minify: 'esbuild' } })
  await copyFile(join(referenceBuild, '.local/lab-stress-entry.html'), join(referenceBuild, 'index.html'))
  await writeFile(join(referenceBuild, 'lab-rope.wasm'), wasmBytes)
}
// Compile the production engine and renderer once. No dev server transforms or
// another app's RAF loops are part of these measurements.
await build({ configFile: false, root, publicDir: false, logLevel: 'warn', plugins: compareProps ? [propProbePlugin()] : [], build: {
  outDir: directory, emptyOutDir: false, rollupOptions: { input }, minify: 'esbuild',
} })
await copyFile(join(directory, '.local/lab-stress-entry.html'), join(directory, 'index.html'))
await writeFile(join(directory, 'lab-rope.wasm'), wasmBytes)
const server = await preview({ configFile: false, root, publicDir: false, logLevel: 'warn', build: { outDir: directory },
  preview: { host: '127.0.0.1', port: 4191, strictPort: true } })
const bundleHash = async directory => {
  const html = await readFile(join(directory, 'index.html'), 'utf8'), hash = createHash('sha256').update(html)
  for (const [, path] of html.matchAll(/<script[^>]+src="([^"]+)"/g)) hash.update(await readFile(join(directory, path.replace(/^\//, ''))))
  return hash.digest('hex')
}
let browser
let referenceServer
try {
  if (referenceBuild) referenceServer = await preview({ configFile: false, root, publicDir: false, logLevel: 'warn', build: { outDir: referenceBuild }, preview: { host: '127.0.0.1', port: 4193, strictPort: true } })
  const channel = process.env.LAB_STRESS_BROWSER ?? 'msedge', gpuRequested = process.env.LAB_STRESS_GPU !== '0'
  browser = await chromium.launch({ channel, args: gpuRequested ? ['--enable-gpu'] : [] })
  const cdp = await browser.newBrowserCDPSession(), { gpu } = await cdp.send('SystemInfo.getInfo')
  await cdp.detach()
  if (gpuRequested && (gpu.featureStatus['2d_canvas'] !== 'enabled' || gpu.featureStatus.gpu_compositing !== 'enabled'
    || /swiftshader|llvmpipe|software rasterizer/i.test(JSON.stringify(gpu.devices)))) {
    throw new Error('Hardware Canvas/compositing unavailable. Rejecting accelerated benchmark.')
  }
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: dpr }), errors = []
  let selectedWasm = wasmBytes
  if (comparing) await page.route('**/lab-rope.wasm', route => route.fulfill({ body: selectedWasm, contentType: 'application/wasm' }))
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('http://127.0.0.1:4191/'); await page.waitForFunction(() => !!window.labStress)
  const rows = [], hash = snapshot => createHash('sha256').update(JSON.stringify(snapshot)).digest('hex')
  const report = { date: new Date().toISOString(), machine: cpus()[0].model, system: `${platform()} ${arch()} ${release()}`,
    complete: false,
    browser: await browser.version(), channel, headless: true, gpuRequested, gpu: { devices: gpu.devices, featureStatus: gpu.featureStatus },
    fixtureHash: createHash('sha256').update(JSON.stringify(fixture)).digest('hex'),
    wasmHash: createHash('sha256').update(wasmBytes).digest('hex'),
    referenceWasmHash: referenceBytes ? createHash('sha256').update(referenceBytes).digest('hex') : null,
    referenceBuild,
    referenceMode: compareRopeAlgorithm ? 'same-bundle-rope-algorithm' : compareProps ? 'same-bundle-prop-engine' : compareSolver ? 'same-bundle-solver' : originalQueries ? 'original-prop-queries' : referenceBuild ? 'frozen-bundle' : referenceWasm ? 'frozen-wasm' : 'typescript',
    referencePropPhysicsHash,
    referenceBundleHash: referenceBuild ? await bundleHash(referenceBuild) : null,
    width, height, dpr, frames, warmup, episodes,
    solver, rapierRopes,
    note: 'Production LAB simulation and renderer; fixed two 120 Hz ticks per RAF for identical workloads. Full-quality lighting; adaptive quality disabled. Real RAF intervals include presentation and scheduling. CPU spans exclude asynchronous GPU completion. No React UI, accounts, persistence or audio. Isolated storage. Alternating sequential backends.' + (compareProps ? ' Rapier prop-engine probe allows changed trajectories; legacy player/robot/water contact cases fall back. Native sleeping is disabled. Population, initial inputs and render quality remain identical.' : '') + (compareRopeAlgorithm ? ' The chain tension algorithm allows changed trajectories. Forces, fine segments, contact predicates and recovery remain; converged solves stop at a complete contact cycle. End-state quality gates do not establish subjective feel.' : ''),
    bundleHash: await bundleHash(directory),
    rows, comparisons: [], summary: [], qualityFailures: [] }
  await mkdir(resolve(output, '..'), { recursive: true }); await writeFile(output, JSON.stringify(report, null, 2) + '\n')
  for (const scenario of cases) {
    for (let episode = 0; episode < episodes; episode++) {
      const snapshots = {}
      for (const backend of episode % 2 ? backends.toReversed() : backends) {
        selectedWasm = backend === 'before' ? referenceBytes : wasmBytes
        // Reset module globals, Matter IDs, rope-layout caches and render state.
        await page.goto(referenceBuild && backend === 'before' ? 'http://127.0.0.1:4193/' : 'http://127.0.0.1:4191/'); await page.waitForFunction(() => !!window.labStress)
        const result = await page.evaluate(options => window.labStress.runCase(options), { fixture, scenario, backend: comparing ? 'wasm' : backend,
          solver: backend === 'before' ? 'baseline' : solver, ropeAlgorithm: backend === 'chain' ? 'chain' : 'ordered', propBackend: backend === 'rapier' ? 'rapier' : 'matter', rapierRopes: backend==='rapier'&&rapierRopes, frames, warmup, width, height, dpr })
        const { snapshot, ...row } = result
        snapshots[backend] = snapshot; rows.push({ ...row, backend, episode, outcomeHash: hash(snapshot),
          wasmHash: backend === 'before' && comparing ? report.referenceWasmHash : report.wasmHash })
        await writeFile(output, JSON.stringify(report, null, 2) + '\n')
      }
      const [before, after] = backends.map(backend => snapshots[backend])
      assert.equal(before.length, after.length)
      assert.equal(rows.at(-2).renderer.backend, rows.at(-1).renderer.backend, 'Graphics backend changed between comparison arms')
      assert.equal(rows.at(-2).renderer.backingWidth, rows.at(-1).renderer.backingWidth)
      assert.equal(rows.at(-2).renderer.backingHeight, rows.at(-1).renderer.backingHeight)
      const maxDrift = Math.max(...before.map((value, i) => Math.abs(value - after[i])))
      if (compareRopeAlgorithm) {
        const candidate = rows.findLast(r => r.scenario === scenario.id && r.episode === episode && r.backend === 'chain')
        assert.ok(!scenario.ropes || candidate.chainStats[0] > 0, 'No actual chain solve')
        // Capture every planned pair even when the mechanical gates reject a
        // candidate. Such reports remain incomplete and cannot claim a win.
        for (const [name, passed] of [
          ['anchor drift', candidate.ropeQuality.maxAnchorDrift < .001],
          ['local rope stretch', candidate.ropeQuality.maxLocalStretch < 1.1],
          ['total rope stretch', candidate.ropeQuality.maxTotalStretch < 1.02],
          ['solid crossing', candidate.ropeQuality.blockedSpans === 0],
        ]) if (!passed) report.qualityFailures.push({ scenario: scenario.id, episode, name })
      } else if (!compareProps) {
        if (maxDrift >= 1e-6) await writeFile(join(directory, `${scenario.id}-parity-failure.json`), JSON.stringify({ scenario, snapshots, maxDrift }, null, 2))
        assert.ok(maxDrift < 1e-6, `${scenario.id}: trajectory drift ${maxDrift}`)
      } else {
        const candidate = rows.findLast(r=>r.scenario===scenario.id && r.episode===episode && r.backend==='rapier')
        assert.ok(!scenario.props || candidate.propQuality.nativeSteps > 0, 'No native prop steps executed')
        assert.ok(candidate.propQuality.maxPenetration == null || candidate.propQuality.maxPenetration < .5, `Final native overlap ${candidate.propQuality.maxPenetration} px`)
        if(rapierRopes){
          assert.ok(candidate.propQuality.maxAnchorDrift<.001,'Native rope anchor drift')
          assert.ok(candidate.propQuality.totalRopeStretch<1.02,'Native rope total stretch')
          assert.ok(candidate.propQuality.maxRopeStretch<1.1,'Native rope local stretch')
          assert.equal(candidate.propQuality.blockedRopeSpans,0,'Native rope cuts through a solid')
        }
      }
      report.comparisons.push({ scenario: scenario.id, episode, maxDrift, identical: hash(before) === hash(after), trajectoryParityRequired: !compareProps && !compareRopeAlgorithm })
      await mkdir(resolve(output, '..'), { recursive: true }); await writeFile(output, JSON.stringify(report, null, 2) + '\n')
      const a = rows.at(-2), b = rows.at(-1)
      console.log(`${scenario.id} episode ${episode + 1}: ${a.backend} ${a.fps.toFixed(1)} FPS / ${a.intervals.p95.toFixed(1)} ms p95; ${b.backend} ${b.fps.toFixed(1)} FPS / ${b.intervals.p95.toFixed(1)} ms p95`)
    }
    const median = values => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)]
    for (const backend of backends) {
      const data = rows.filter(r => r.scenario === scenario.id && r.backend === backend)
      report.summary.push({ scenario: scenario.id, backend, ropes: scenario.ropes ?? 0, lights: scenario.lights ?? 0,
        props: scenario.props ?? 0, rustExpectedEffect: !!scenario.ropes,
        fps: median(data.map(r => r.fps)), frameP95: median(data.map(r => r.intervals.p95)),
        simulationP95: median(data.map(r => r.simulation.p95)), drawP95: median(data.map(r => r.draw.p95)), cpuP95: median(data.map(r => r.cpu.p95)),
        over33_83ms: median(data.map(r => r.over33_83ms)),
        movingPropsMean: median(data.map(r => r.activity.props.mean)), movingRopesMean: median(data.map(r => r.activity.ropes.mean)),
        movingLiftsMean: median(data.map(r => r.activity.lifts.mean)), renderer: data[0].renderer,
        wasmMemoryBytes: Math.max(...data.map(r => r.wasmMemoryBytes)),
      })
    }
    await page.screenshot({ path: join(directory, `${scenario.id}.png`) })
  }
  assert.deepEqual(errors, [], 'Browser errors invalidate the run')
  report.measurementsComplete = true
  report.complete = report.qualityFailures.length === 0
  await writeFile(output, JSON.stringify(report, null, 2) + '\n')
  assert.deepEqual(report.qualityFailures, [], 'Rope quality gates reject the candidate; raw measurements retained')
  console.log(`Saved ${rows.length} measured arms across ${report.comparisons.length} matched episodes to ${output}`)
} finally { await browser?.close(); if (referenceServer) await new Promise(resolve => referenceServer.httpServer.close(resolve)); await new Promise(resolve => server.httpServer.close(resolve)) }
