import { build, preview } from 'vite'
import { chromium } from '@playwright/test'
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { cpus, arch, platform, release } from 'node:os'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'

const output = resolve(process.argv[2] ?? '.local/lab-stress-results.json')
const originalQueries = process.env.LAB_STRESS_COMPARE_COLLISION_QUERIES === '1'
if (originalQueries && process.env.LAB_STRESS_COMPARE_BUILD) throw new Error('Select one bundle reference')
const referenceBuild = process.env.LAB_STRESS_COMPARE_BUILD ? resolve(process.env.LAB_STRESS_COMPARE_BUILD) : originalQueries ? resolve('.local/lab-stress-reference-build') : null
const backends = referenceBuild ? ['before', 'optimized'] : ['javascript']
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
if (referenceBuild === directory) throw new Error('The frozen reference must be outside the rebuilt output directory')
await mkdir('.local', { recursive: true })
await writeFile(input, '<!doctype html><meta charset="utf-8"><title>LAB stress benchmark</title><script type="module" src="/tests/bench/labStressBrowser.mjs"></script>')
let referencePropPhysicsHash = null
if (originalQueries) {
  // Same current engine and renderer; remove only the cache and its two queries.
  await build({ configFile: false, root, publicDir: false, logLevel: 'warn', plugins: [{ name: 'reference-prop-queries', enforce: 'pre', transform(source, id) {
    if (!id.replaceAll('\\', '/').endsWith('/src/games/jumping/propPhysics.ts')) return
    if (!source.includes('  const queries = new CollisionQueries()') || source.match(/queries\.collides\(/g)?.length !== 2) throw new Error('Original query reference requires review after source changes')
    const original = source.replace(/^import \{ CollisionQueries \} from '\.\/collisionQueries\.ts'\r?\n/m, '')
      .replace(/^  const queries = new CollisionQueries\(\)\r?\n/m, '').replaceAll('queries.collides(', 'Query.collides(')
    referencePropPhysicsHash = createHash('sha256').update(original.replace(/\r\n/g, '\n')).digest('hex')
    return original
  } }], build: { outDir: referenceBuild, emptyOutDir: true, rollupOptions: { input }, minify: 'esbuild' } })
  await copyFile(join(referenceBuild, '.local/lab-stress-entry.html'), join(referenceBuild, 'index.html'))
}
await build({ configFile: false, root, publicDir: false, logLevel: 'warn', build: {
  outDir: directory, emptyOutDir: true, rollupOptions: { input }, minify: 'esbuild',
} })
await copyFile(join(directory, '.local/lab-stress-entry.html'), join(directory, 'index.html'))
const bundleHash = async directory => {
  const html = await readFile(join(directory, 'index.html'), 'utf8'), hash = createHash('sha256').update(html)
  for (const [, path] of html.matchAll(/<script[^>]+src="([^"]+)"/g)) hash.update(await readFile(join(directory, path.replace(/^\//, ''))))
  return hash.digest('hex')
}
let browser, server, referenceServer
try {
  server = await preview({ configFile: false, root, publicDir: false, logLevel: 'warn', build: { outDir: directory }, preview: { host: '127.0.0.1', port: 4191, strictPort: true } })
  if (referenceBuild) referenceServer = await preview({ configFile: false, root, publicDir: false, logLevel: 'warn', build: { outDir: referenceBuild }, preview: { host: '127.0.0.1', port: 4193, strictPort: true } })
  const channel = process.env.LAB_STRESS_BROWSER ?? 'msedge', gpuRequested = process.env.LAB_STRESS_GPU !== '0'
  browser = await chromium.launch({ channel, args: gpuRequested ? ['--enable-gpu'] : [] })
  const cdp = await browser.newBrowserCDPSession(), { gpu } = await cdp.send('SystemInfo.getInfo')
  await cdp.detach()
  if (gpuRequested && (gpu.featureStatus['2d_canvas'] !== 'enabled' || gpu.featureStatus.gpu_compositing !== 'enabled'
    || /swiftshader|llvmpipe|software rasterizer/i.test(JSON.stringify(gpu.devices)))) throw new Error('Hardware Canvas/compositing unavailable. Rejecting accelerated benchmark.')
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: dpr }), errors = []
  page.on('pageerror', error => errors.push(error.message))
  const rows = [], hash = snapshot => createHash('sha256').update(JSON.stringify(snapshot)).digest('hex')
  const report = { date: new Date().toISOString(), machine: cpus()[0].model, system: `${platform()} ${arch()} ${release()}`,
    complete: false, browser: await browser.version(), channel, headless: true, gpuRequested, gpu: { devices: gpu.devices, featureStatus: gpu.featureStatus },
    fixtureHash: createHash('sha256').update(JSON.stringify(fixture)).digest('hex'), referenceBuild,
    referenceMode: originalQueries ? 'original-prop-queries' : referenceBuild ? 'frozen-bundle' : 'javascript', referencePropPhysicsHash,
    referenceBundleHash: referenceBuild ? await bundleHash(referenceBuild) : null, bundleHash: await bundleHash(directory),
    width, height, dpr, frames, warmup, episodes,
    note: 'Production JavaScript LAB simulation and renderer; fixed two 120 Hz ticks per RAF. Full-quality lighting; adaptive quality disabled. Real RAF intervals include presentation and scheduling. CPU spans exclude asynchronous GPU completion. No React UI, accounts, persistence or audio. Fresh arms with alternating sequential comparison order. Rope quality values are diagnostics, not universal contact guarantees.',
    rows, comparisons: [], summary: [] }
  await mkdir(resolve(output, '..'), { recursive: true })
  const checkpoint = () => writeFile(output, JSON.stringify(report, null, 2) + '\n')
  await checkpoint()
  for (const scenario of cases) {
    for (let episode = 0; episode < episodes; episode++) {
      const snapshots = {}, arms = {}
      for (const backend of episode % 2 ? backends.toReversed() : backends) {
        await page.goto(referenceBuild && backend === 'before' ? 'http://127.0.0.1:4193/' : 'http://127.0.0.1:4191/')
        await page.waitForFunction(() => !!window.labStress)
        // Legacy frozen harnesses recognize typescript; the current harness is JS only.
        const result = await page.evaluate(options => window.labStress.runCase(options), { fixture, scenario, backend: 'typescript', frames, warmup, width, height, dpr })
        const { snapshot, ...row } = result
        snapshots[backend] = snapshot
        arms[backend] = { ...row, backend, episode, outcomeHash: hash(snapshot) }
        rows.push(arms[backend]); await checkpoint()
      }
      if (referenceBuild) {
        const before = snapshots.before, after = snapshots.optimized
        assert.equal(before.length, after.length)
        for (const key of ['backend', 'backingWidth', 'backingHeight', 'ratio']) assert.equal(arms.before.renderer[key], arms.optimized.renderer[key], `Graphics ${key} changed between arms`)
        const maxDrift = Math.max(...before.map((value, i) => Math.abs(value - after[i])))
        report.comparisons.push({ scenario: scenario.id, episode, maxDrift, identical: hash(before) === hash(after), trajectoryParityRequired: true })
        await checkpoint()
        if (!(maxDrift < 1e-6)) await writeFile(join(directory, `${scenario.id}-parity-failure.json`), JSON.stringify({ scenario, snapshots, maxDrift }, null, 2))
        assert.ok(maxDrift < 1e-6, `${scenario.id}: trajectory drift ${maxDrift}`)
      }
      console.log(`${scenario.id} episode ${episode + 1}: ` + backends.map(b => `${b} ${arms[b].fps.toFixed(1)} FPS / ${arms[b].intervals.p95.toFixed(1)} ms p95`).join('; '))
    }
    const median = values => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)]
    for (const backend of backends) {
      const data = rows.filter(r => r.scenario === scenario.id && r.backend === backend)
      report.summary.push({ scenario: scenario.id, backend, ropes: scenario.ropes ?? 0, lights: scenario.lights ?? 0, props: scenario.props ?? 0,
        fps: median(data.map(r => r.fps)), frameP95: median(data.map(r => r.intervals.p95)),
        simulationP95: median(data.map(r => r.simulation.p95)), drawP95: median(data.map(r => r.draw.p95)), cpuP95: median(data.map(r => r.cpu.p95)),
        over33_83ms: median(data.map(r => r.over33_83ms)), movingPropsMean: median(data.map(r => r.activity.props.mean)),
        movingRopesMean: median(data.map(r => r.activity.ropes.mean)), movingLiftsMean: median(data.map(r => r.activity.lifts.mean)), renderer: data[0].renderer })
    }
    await checkpoint()
    await page.screenshot({ path: join(directory, `${scenario.id}.png`) })
  }
  assert.deepEqual(errors, [], 'Browser errors invalidate the run')
  report.complete = true
  await checkpoint()
  console.log(`Saved ${rows.length} measured arms across ${report.comparisons.length} matched episodes to ${output}`)
} finally {
  await browser?.close()
  for (const running of [referenceServer, server]) if (running) await new Promise(resolve => running.httpServer.close(resolve))
}
