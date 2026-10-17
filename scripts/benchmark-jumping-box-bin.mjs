import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { registerHooks, stripTypeScriptTypes } from 'node:module'
import { cpus } from 'node:os'
import { performance } from 'node:perf_hooks'
import { resolve } from 'node:path'

// Simulation-only diagnostic. Compare fresh processes with the same saved JSON,
// no builds/tests running, and the same --reference module set below.
const option = name => { const at = process.argv.indexOf(name); return at < 0 ? undefined : process.argv[at + 1] }
const reference = option('--reference'), referenceDir = option('--reference-dir'), output = option('--output')
if (reference && referenceDir) throw new Error('Choose a Git reference or a saved source directory')
const frames = Number(option('--ticks') ?? 720), warmup = Number(option('--warmup') ?? 480)
const episodes = Number(option('--episodes') ?? 3)
for (const [name, value, min] of [['ticks', frames, 1], ['warmup', warmup, 0], ['episodes', episodes, 1]]) {
  if (!Number.isInteger(value) || value < min || value > 10000) throw new Error(`Invalid ${name}`)
}
const files = ['robotPhysics', 'propPhysics', 'collisionQueries', 'roundCollision'], sources = new Map()
for (const name of files) {
  const path = `src/games/jumping/${name}.ts`
  const source = reference ? execFileSync('git', ['show', `${reference}:${path}`], { encoding: 'utf8' })
    : readFileSync(referenceDir ? resolve(referenceDir, path) : path, 'utf8')
  sources.set(new URL(`../${path}`, import.meta.url).href, source)
}
if (reference || referenceDir) registerHooks({ load(url, context, next) {
  if (sources.has(url)) return { format: 'module', source: stripTypeScriptTypes(sources.get(url)), shortCircuit: true }
  return next(url, context)
} })
const { parseLevel } = await import('../src/games/jumping/level.ts')
const { createRun, stepRun } = await import('../tests/helpers/jumping-active-run.mjs')
const { NEUTRAL_INPUT } = await import('../src/games/jumping/model.ts')
const hash = value => createHash('sha256').update(value).digest('hex')
const source = readFileSync(option('--level') ?? 'tests/fixtures/jumping/box-bin.json', 'utf8'), level = parseLevel(JSON.parse(source))
const stats = values => {
  const sorted = values.toSorted((a, b) => a - b)
  return { mean: values.reduce((a, b) => a + b) / values.length,
    p95: sorted[Math.floor(sorted.length * .95)], p99: sorted[Math.floor(sorted.length * .99)], max: sorted.at(-1),
    overBudget: values.filter(ms => ms > 1000 / 120).length,
    overFrame: values.filter(ms => ms > 1000 / 60).length,
    overTwoFrames: values.filter(ms => ms > 1000 / 30).length }
}
const rows = []
for (const scenario of ['idle', 'pressure']) for (let episode = 0; episode < episodes; episode++) {
  const definition = structuredClone(level)
  if (scenario === 'pressure') definition.entrance = { x: Number(option('--pressure-x') ?? 630), y: Number(option('--pressure-y') ?? 1620) }
  const run = createRun(definition), input = scenario === 'pressure' ? { ...NEUTRAL_INPUT, move: 1 } : NEUTRAL_INPUT
  for (let tick = 0; tick < warmup; tick++) stepRun(run, NEUTRAL_INPUT)
  const times = [], trajectory = createHash('sha256')
  let loadedTicks = 0
  for (let tick = 0; tick < frames; tick++) {
    const start = performance.now(); stepRun(run, input); times.push(performance.now() - start)
    loadedTicks += Number(run.player.contacts.body.some(c => c.collider.prop && c.load > 0 && Math.abs(c.normal[0]) > .5))
    trajectory.update(JSON.stringify({ props: run.props.map(({ x, y, angle, vx, vy, angularVelocity, grounded }) => ({ x, y, angle, vx, vy, angularVelocity, grounded })),
      robots: run.robots.map(({ x, y, vx, angle, facing, phase, time }) => ({ x, y, vx, angle, facing, phase, time })),
      player: [run.player.x, run.player.y, run.player.vx, run.player.vy, run.player.grounded] }))
  }
  rows.push({ scenario, episode, simulationMs: stats(times), hash: trajectory.digest('hex'), loadedTicks,
    movingProps: run.props.filter(p => Math.hypot(p.vx, p.vy) > .05 || Math.abs(p.angularVelocity) > .001).length })
}
const report = { reference: reference ?? referenceDir ?? 'working tree', node: process.version, cpu: cpus()[0].model,
  note: 'Node simulation CPU diagnostic, excluding rendering, audio, browser scheduling and real-game catch-up; not an FPS measurement.',
  ticks: frames, warmup, episodes, levelHash: hash(source), level: JSON.parse(source),
  sourceHashes: Object.fromEntries([...sources].map(([url, source]) => [url.split('/').at(-1), hash(source)])), rows }
if (output) writeFileSync(output, JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ ...report, level: undefined }, null, 2))
