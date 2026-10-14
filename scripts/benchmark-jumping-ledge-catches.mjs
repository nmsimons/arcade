import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { registerHooks, stripTypeScriptTypes } from 'node:module'
import { cpus } from 'node:os'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'

// CPU-only diagnostic: isolated falls at exposed Escapade tower lips, with the
// authored static terrain. Moving props, mechanisms, lighting and RAF are absent.
// Compare the same installed Node/runtime and map with --reference <commit>.
const option = name => { const at = process.argv.indexOf(name); return at < 0 ? undefined : process.argv[at + 1] }
const reference = option('--reference'), output = option('--output')
const athletePath = fileURLToPath(new URL('../src/games/jumping/athlete.ts', import.meta.url))
let athleteSource = readFileSync(athletePath, 'utf8')
if (reference) {
  athleteSource = execFileSync('git', ['show', `${reference}:src/games/jumping/athlete.ts`], { encoding: 'utf8' })
  // Pose selection also lives in the controller/contact modules. Load the
  // complete referenced runtime so older exports and their callers agree.
  const changed = execFileSync('git', ['diff', '--name-only', '--diff-filter=M', reference, '--', 'src/games/jumping'], { encoding: 'utf8' })
    .trim().split('\n').filter(path => path.endsWith('.ts'))
  const sources = new Map(changed.map(path => [new URL(`../${path}`, import.meta.url).href,
    stripTypeScriptTypes(execFileSync('git', ['show', `${reference}:${path}`], { encoding: 'utf8' }))]))
  sources.set(new URL('../src/games/jumping/athlete.ts', import.meta.url).href, stripTypeScriptTypes(athleteSource))
  registerHooks({ load(url, context, next) {
    if (sources.has(url)) return { format: 'module', source: sources.get(url), shortCircuit: true }
    return next(url, context)
  } })
}
const { parseLevel, levelTerrain } = await import('../src/games/jumping/level.ts')
const { createPlayer, stepPlayer, NEUTRAL_INPUT, STEP } = await import('../src/games/jumping/model.ts')
const { athletePose } = await import('../src/games/jumping/athlete.ts')
const { platformLedges, ledgeExposed } = await import('../src/games/jumping/terrainLedges.ts')
const source = readFileSync(new URL('../public/levels/jumping/escapade.jump-level.json', import.meta.url), 'utf8')
const level = parseLevel(JSON.parse(source)), terrain = levelTerrain(level), cases = []
for (const index of [0, 3, 4, 6, 7, 9, 11, 13, 14, 15, 16, 17, 19, 21, 22, 24, 25, 27, 40, 41]) {
  for (const edge of platformLedges(level.platforms[index])) if (ledgeExposed(terrain, edge)) {
    for (const prone of [false, true]) cases.push({ index, edge, prone })
  }
}
const stats = values => {
  const sorted = values.toSorted((a, b) => a - b)
  return { mean: values.reduce((a, b) => a + b, 0) / values.length,
    p95: sorted[Math.floor(sorted.length * .95)], p99: sorted[Math.floor(sorted.length * .99)], max: sorted.at(-1) }
}
const simulation = [], poses = [], states = [], rigs = [], results = []
// Warm the same paths once, then record three complete repetitions.
for (let repeat = -1; repeat < 3; repeat++) for (const { index, edge, prone } of cases) {
  const p = createPlayer({ x: edge.edgeX - edge.side * 30, y: edge.edgeY + 35 })
  Object.assign(p, { grounded: false, coyote: 0, facing: edge.side, vy: 400 })
  if (prone) p.freeFall = { time: 2, amount: 1, recovery: null }
  let caught = false
  for (let tick = 0; tick < 40; tick++) {
    const start = performance.now()
    stepPlayer(p, NEUTRAL_INPUT, STEP, terrain)
    const moved = performance.now(), rig = athletePose(p), drawn = performance.now()
    caught ||= !!p.hang
    if (repeat >= 0) { simulation.push(moved - start); poses.push(drawn - moved) }
    if (repeat === 0) {
      states.push({ index, edge, prone, tick, x: p.x, y: p.y, vx: p.vx, vy: p.vy,
        grounded: p.grounded, facing: p.facing, hang: structuredClone(p.hang), freeFall: structuredClone(p.freeFall), ledgeReach: structuredClone(p.ledgeReach) })
      rigs.push(rig)
    }
  }
  if (repeat === 0) results.push({ index, edge, prone, caught })
}
const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex')
const report = { reference: reference ?? 'working tree', node: process.version, cpu: cpus()[0].model,
  levelHash: hash(source), athleteHash: hash(athleteSource), cases: cases.length, ticksPerCase: 40, repetitions: 3,
  samples: poses.length, caught: results.filter(r => r.caught).length,
  simulationMs: stats(simulation), poseMs: stats(poses), physicsHash: hash(states), poseHash: hash(rigs), results }
// The complete state hash above includes caught/prepared presentation. Keep
// a separate movement hash when deliberately revising that choreography.
report.motionHash = hash(states.map(({ index, edge, prone, tick, x, y, vx, vy, grounded, facing, hang, freeFall }) =>
  ({ index, edge, prone, tick, x, y, vx, vy, grounded, facing,
    hang: hang && { x: hang.edgeX, y: hang.edgeY, time: hang.time },
    freeFall: freeFall && { time: freeFall.time, amount: freeFall.amount, recovery: freeFall.recovery } })))
if (report.caught !== cases.length) throw new Error('Every diagnostic fall must catch its exposed lip')
if (output) writeFileSync(output, JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ ...report, results: undefined }, null, 2))
