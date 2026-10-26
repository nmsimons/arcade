import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { registerHooks, stripTypeScriptTypes } from 'node:module'
import { cpus } from 'node:os'
import { performance } from 'node:perf_hooks'
import { resolve } from 'node:path'

const option = name => { const at = process.argv.indexOf(name); return at < 0 ? undefined : process.argv[at + 1] }
const referenceDir = option('--reference-dir'), reference = option('--reference'), output = option('--output'), sources = {}
if (referenceDir || reference) {
  const overrides = new Map()
  for (const file of ['athlete.ts', 'geometry.ts']) {
    const source = referenceDir ? readFileSync(resolve(referenceDir, 'src/games/jumping', file), 'utf8')
      : execFileSync('git', ['show', `${reference}:src/games/jumping/${file}`], { encoding: 'utf8' })
    sources[file] = source
    overrides.set(new URL(`../src/games/jumping/${file}`, import.meta.url).href, stripTypeScriptTypes(source))
  }
  registerHooks({ load(url, context, next) {
    return overrides.has(url) ? { format: 'module', source: overrides.get(url), shortCircuit: true } : next(url, context)
  } })
} else for (const file of ['athlete.ts', 'geometry.ts']) sources[file] = readFileSync(new URL(`../src/games/jumping/${file}`, import.meta.url), 'utf8')
const { createPlayer, stepPlayer, NEUTRAL_INPUT, STEP, playerState } = await import('../src/games/jumping/model.ts')
const { athletePose } = await import('../src/games/jumping/athlete.ts')
const { levelTerrain, parseLevel } = await import('../src/games/jumping/level.ts')
const fixture = JSON.parse(readFileSync(new URL('../tests/fixtures/jumping/ascent-chimney-clearance.json', import.meta.url)))
// --level includes the complete current static cave, without changing the file.
// Rope simulation, rendering, diagnostics and browser scheduling are excluded.
const levelPath = option('--level'), levelSource = levelPath && readFileSync(levelPath, 'utf8')
const terrain = levelSource ? levelTerrain(parseLevel(JSON.parse(levelSource))) : fixture.platforms
const stats = values => {
  const sorted = values.toSorted((a, b) => a - b)
  return { mean: values.reduce((a, b) => a + b, 0) / values.length, p95: sorted[Math.floor(sorted.length * .95)], max: sorted.at(-1) }
}
const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex')
const sample = p => ({ x: p.x, y: p.y, vx: p.vx, vy: p.vy, state: playerState(p), brace: p.wallBrace, hang: p.hang })
const states = [], poses = [], times = []
const tick = (p, input) => {
  stepPlayer(p, { ...NEUTRAL_INPUT, ...input }, STEP, terrain)
  states.push(sample(p))
  const started = performance.now(), pose = athletePose(p)
  times.push(performance.now() - started); poses.push(pose)
}
for (const x of [780, 800]) {
  const p = createPlayer({ ...fixture.start, x })
  for (let i = 0; i < 30; i++) tick(p, {})
  for (let i = 0; i < 26; i++) tick(p, { move: 1, jump: true })
  let side = 1
  for (let jump = 0; jump < 16; jump++) {
    let waiting = 0
    while (!p.wallBrace?.active && !p.hang && !p.grounded && waiting++ < 240) tick(p, { move: side })
    if (p.hang) { for (let i = 0; i < 180; i++) tick(p, { climb: true }); break }
    if (p.grounded) break
    tick(p, { move: side })
    for (let i = 0; i < 26; i++) tick(p, { jump: true })
    side = -side
  }
  if (!p.grounded || p.y > 900) throw new Error('The diagnostic must climb onto the exit perch')
}
const p = createPlayer(fixture.start)
for (let i = 0; i < 55; i++) stepPlayer(p, { ...NEUTRAL_INPUT, ...(i < 30 ? {} : { move: 1, jump: true }) }, STEP, terrain)
const before = structuredClone(p), hotspot = []
for (let i = 0; i < 400; i++) {
  const started = performance.now(); athletePose(p)
  if (i >= 100) hotspot.push(performance.now() - started)
}
if (hash(p) !== hash(before)) throw new Error('Pose queries must leave the player unchanged')
const report = { reference: referenceDir ?? reference ?? 'working tree', node: process.version, cpu: cpus()[0].model,
  sourceHashes: Object.fromEntries(Object.entries(sources).map(([name, source]) => [name, hash(source)])),
  levelHash: hash(levelSource ?? fixture), samples: times.length, stateHash: hash(states), poseHash: hash(poses),
  poseMs: stats(times), hotspot: { ...sample(p), poseMs: stats(hotspot) } }
if (output) writeFileSync(output, JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
