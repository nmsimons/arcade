import { build, preview } from 'vite'
import { chromium } from '@playwright/test'
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { cpus, platform, arch } from 'node:os'
import { execFileSync } from 'node:child_process'
import assert from 'node:assert/strict'

// A supplied runtime JSON asset; the opening control sequences were measured
// on pinball. They exercise pushing, a gravity plate, and the lift ascent.
if (!process.argv[2]) throw new Error('Usage: node scripts/benchmark-jumping-round-contacts.mjs LEVEL_JSON [REPORT_JSON]')
const levelPath = resolve(process.argv[2]), levelSource = await readFile(levelPath, 'utf8'), data = JSON.parse(levelSource)
const output = resolve(process.argv[3] ?? '.local/round-contacts-results.json')
const frames = Number(process.env.ROUND_CONTACT_FRAMES ?? 300), warmup = Number(process.env.ROUND_CONTACT_WARMUP ?? 30)
const episodes = Number(process.env.ROUND_CONTACT_EPISODES ?? 3)
const scenarios = process.env.ROUND_CONTACT_CASES?.split(',') ?? ['push', 'plate', 'ascent']
if (!scenarios.length || scenarios.some(id => !['push', 'plate', 'ascent'].includes(id))) throw new Error('Invalid ROUND_CONTACT_CASES')
for (const [name, value, min, max] of [['frames', frames, 10, 10000], ['warmup', warmup, 0, 1000], ['episodes', episodes, 1, 20]]) {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Invalid ${name}`)
}
const hash = value => createHash('sha256').update(value).digest('hex')
const referenceCommit = process.env.ROUND_CONTACT_COMPARE_COMMIT
const referenceFiles = new Map()
if (referenceCommit) for (const name of ['roundCollision', 'collisionQueries', 'propPhysics', 'athlete']) {
  referenceFiles.set(name, execFileSync('git', ['show', `${referenceCommit}:src/games/jumping/${name}.ts`], { encoding: 'utf8' }))
}
const input = resolve('.local/round-contacts-entry.html'), directories = ['before', 'after'].map(mode => resolve(`.local/round-contacts-${mode}-build`))
await mkdir('.local', { recursive: true }); await mkdir(dirname(output), { recursive: true })
await writeFile(input, '<!doctype html><meta charset="utf-8"><script type="module" src="/tests/bench/jumpingRoundContactsBrowser.mjs"></script>')
const bundleHashes = []
for (const [index, mode] of ['before', 'after'].entries()) {
  await build({ configFile: false, publicDir: false, logLevel: 'warn', plugins: mode === 'before' ? [{ name: 'original-round-contacts', enforce: 'pre', transform(source, id) {
    if (referenceCommit) {
      const name = id.replaceAll('\\', '/').match(/\/src\/games\/jumping\/(roundCollision|collisionQueries|propPhysics|athlete)\.ts$/)?.[1]
      return name ? referenceFiles.get(name) : undefined
    }
    if (!id.replaceAll('\\', '/').endsWith('/src/games/jumping/roundCollision.ts')) return
    return "import Matter from 'matter-js'; export function registerRoundBody() {} export function registerRoundProbe() {} export function roundCollision(a,b) { return Matter.Collision.collides(a,b) } export const roundQuery = Matter.Query.collides;"
  } }] : [], build: { outDir: directories[index], emptyOutDir: true, rollupOptions: { input } } })
  await copyFile(`${directories[index]}/.local/round-contacts-entry.html`, `${directories[index]}/index.html`)
  const html = await readFile(`${directories[index]}/index.html`, 'utf8'), chunks = [html]
  for (const [, path] of html.matchAll(/<script[^>]+src="([^"]+)"/g)) chunks.push(await readFile(`${directories[index]}${path}`))
  bundleHashes.push(hash(Buffer.concat(chunks.map(chunk => Buffer.from(chunk)))))
}
const servers = [], rows = []
let browser
try {
  browser = await chromium.launch({ channel: 'msedge', args: ['--enable-gpu'] })
  for (const [index, directory] of directories.entries()) servers.push(await preview({ configFile: false, publicDir: false, logLevel: 'warn', build: { outDir: directory }, preview: { host: '127.0.0.1', port: 4195 + index, strictPort: true } }))
  const cdp = await browser.newBrowserCDPSession(), { gpu } = await cdp.send('SystemInfo.getInfo'); await cdp.detach()
  assert.equal(gpu.featureStatus['2d_canvas'], 'enabled'); assert.equal(gpu.featureStatus.gpu_compositing, 'enabled')
  assert.doesNotMatch(JSON.stringify(gpu.devices), /swiftshader|llvmpipe|software rasterizer/i)
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 }), errors = []
  page.on('pageerror', error => errors.push(error.message))
  const report = { date: new Date().toISOString(), machine: cpus()[0].model, system: `${platform()} ${arch()}`, browser: await browser.version(), gpu,
    levelPath, levelHash: hash(levelSource), referenceCommit, bundleHashes, frames, warmup, episodes, width: 1280, height: 800, dpr: 1, rows, complete: false,
    note: 'Full-quality production simulation and renderer. Two 120 Hz ticks per RAF; excludes React, audio, persistence and real-game catch-up. Fresh alternating arms; exact per-frame player/prop/switch trajectory parity required. Opening controls are probes, not completed routes.' }
  const checkpoint = () => writeFile(output, JSON.stringify(report, null, 2) + '\n')
  await checkpoint()
  for (const scenario of scenarios) for (let episode = 0; episode < episodes; episode++) {
    const hashes = [], graphics = []
    for (const mode of episode % 2 ? ['after', 'before'] : ['before', 'after']) {
      await page.goto(`http://127.0.0.1:${mode === 'before' ? 4195 : 4196}`); await page.waitForFunction(() => !!window.pinballProbe)
      const { trajectory, ...row } = await page.evaluate(options => window.pinballProbe(options), { data, scenario, frames, warmup: scenario === 'ascent' ? 300 : warmup })
      const trajectoryHash = hash(JSON.stringify(trajectory)); hashes.push(trajectoryHash); graphics.push([row.renderer, row.width, row.height])
      rows.push({ ...row, mode, episode, hash: trajectoryHash }); await checkpoint()
      console.log(`${scenario} ${episode + 1} ${mode}: ${row.fps.toFixed(1)} FPS, simulation p95 ${row.simulation.p95.toFixed(1)} ms, frame p95 ${row.intervals.p95.toFixed(1)} ms`)
    }
    assert.equal(hashes[0], hashes[1], 'trajectory parity'); assert.deepEqual(graphics[0], graphics[1], 'graphics parity')
  }
  assert.deepEqual(errors, []); report.complete = true; await checkpoint()
} finally {
  await browser?.close()
  for (const server of servers) await new Promise(resolve => server.httpServer.close(resolve))
}
