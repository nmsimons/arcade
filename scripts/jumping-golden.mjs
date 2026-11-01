import { existsSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { CHECKPOINT, GOLDEN, KINDS, compareTrace, goldenScripts, loadGame, mathFingerprint, missingGolden, readGolden, runTraces, traceScript } from '../tests/helpers/jumping-golden.mjs'

// Golden traces for Untitled Jumping Game (see tests/helpers/jumping-golden.mjs).
//
//   node scripts/jumping-golden.mjs                      check every trace
//   node scripts/jumping-golden.mjs --only Tower         check traces whose key contains "Tower"
//   node scripts/jumping-golden.mjs --write              record every kind
//   node scripts/jumping-golden.mjs --write --kinds pose --note 'why'   record only the pose hashes
//   node scripts/jumping-golden.mjs --print 'Tower.jump-level.json|runner' --kinds physics --from 600 --to 720
//       print per-tick values. Run it in two checkouts, or with --source, and diff
//       the output to find the first changed tick and field.
//   --source <checkout>  replay another checkout's game code with these scripts
//   --cadence off|frame  animate never, or once per two steps; physics must not change
//
// Physics hashes must not be re-recorded for a change that claims to preserve
// behaviour. Record a kind only when its change is intended, and say so.
//
// Hashes are kept per math library (arm64 and x64 differ). Checking and
// recording use this process's set, so record an intended change on both: on
// Apple Silicon, run the same command again under Rosetta with an x64 Node,
// arch -x86_64 <x64 node> scripts/jumping-golden.mjs --write ... (docs/testing.md).

const args = process.argv.slice(2)
const option = name => { const at = args.indexOf(name); return at < 0 ? undefined : args[at + 1] }
const kinds = option('--kinds')?.split(',') ?? KINDS
for (const kind of kinds) if (!KINDS.includes(kind)) throw new Error(`Unknown kind ${kind}; expected ${KINDS.join(', ')}`)
const source = option('--source'), only = option('--only'), print = option('--print'), cadence = option('--cadence')
if (cadence && kinds.includes('pose')) throw new Error('--cadence other than tick changes poses; pass --kinds physics')

if (print) {
  const game = await loadGame(source), entry = goldenScripts(game).find(candidate => candidate.key === print)
  if (!entry) throw new Error(`No trace ${print}`)
  const from = Number(option('--from') ?? 0), to = Number(option('--to') ?? Infinity)
  traceScript(game, entry.url, entry.script, { kinds, cadence, onTick(tick, values) {
    if (tick >= from && tick <= to) for (const kind of kinds) if (values[kind] !== undefined) console.log(`${tick} ${kind} ${values[kind]}`)
  } })
  process.exit(0)
}

const game = await loadGame(source)
const keys = goldenScripts(game).map(entry => entry.key).filter(key => !only || key.includes(only))
const started = performance.now()
const results = await runTraces({ keys, kinds, source, cadence, jobs: option('--jobs') && Number(option('--jobs')) })
const seconds = ((performance.now() - started) / 1000).toFixed(1)

const math = mathFingerprint()
if (args.includes('--write')) {
  // A new math library gets a file named for its CPU, or for its platform and
  // CPU when another library already has that name.
  const golden = readGolden(math) ?? { name: [`${process.arch}.json`, `${process.platform}-${process.arch}.json`].find(name => !existsSync(new URL(name, GOLDEN))), traces: {} }
  if (!golden.recorded && kinds.length < KINDS.length) throw new Error(`${golden.name} is a new set; record every kind`)
  for (const { key, ...result } of results) {
    const previous = golden.traces[key] ?? {}
    golden.traces[key] = { ticks: result.ticks, finished: result.finished,
      ...Object.fromEntries(KINDS.map(kind => [kind, kinds.includes(kind) ? result[kind] : previous[kind]])) }
  }
  // Drop traces for levels or routes that no longer exist.
  const current = new Set(goldenScripts(game).map(entry => entry.key))
  for (const key of Object.keys(golden.traces)) if (!current.has(key)) delete golden.traces[key]
  const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim()
  const dirty = execFileSync('git', ['status', '--porcelain', '--', 'src', 'public/levels'], { encoding: 'utf8' }).trim() !== ''
  const note = option('--note')
  const recorded = { ...golden.recorded, ...Object.fromEntries(kinds.map(kind => [kind, `${commit}${dirty ? ' with uncommitted changes' : ''}${note ? `: ${note}` : ''}`])) }
  const ordered = Object.fromEntries(Object.keys(golden.traces).sort().map(key => [key, golden.traces[key]]))
  writeFileSync(new URL(golden.name, GOLDEN), `${JSON.stringify({ version: 2, checkpoint: CHECKPOINT, math, cpu: process.arch, recorded, traces: ordered }, null, 1)}\n`)
  console.log(`Recorded ${kinds.join(', ')} for ${results.length} traces in ${golden.name} in ${seconds} s (${recorded[kinds[0]]}).`)
  process.exit(0)
}

const golden = readGolden(math)
if (!golden) { console.log(missingGolden(math)); process.exit(1) }
let failures = 0
for (const { key, ...result } of results) {
  const expected = golden.traces[key]
  const problem = expected ? compareTrace(expected, result, kinds) : 'no recorded trace'
  if (problem) { failures++; console.log(`✗ ${key}: ${problem}`) }
}
console.log(`${results.length - failures}/${results.length} traces match (${kinds.join(', ')}) in ${golden.name}, in ${seconds} s.`)
process.exit(failures ? 1 : 0)
