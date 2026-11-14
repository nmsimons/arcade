// Scans every golden route (tests/helpers/jumping-golden.mjs) for pose flickers and snaps: a joint that is
// wrong for a few steps, which a drawn frame shows only when it lands on them (tests/helpers/jumping-flicker.mjs).
//
//   node scripts/jumping-flicker.mjs                     scan every route
//   node scripts/jumping-flicker.mjs --only Tower        scan routes whose key contains "Tower"
//   node scripts/jumping-flicker.mjs --kind flicker      report only flickers (or only snaps)
//   node scripts/jumping-flicker.mjs --gate              report only flickers that count against the budget
//   node scripts/jumping-flicker.mjs --write-budget --note 'why'
//       record each route's count of gate-sized flickers as its budget (tests/jumping-flicker.test.mjs)
//   --source <checkout>  scan another checkout's game code
//   --flicker <units> --snap <units>  detection thresholds; --show <n> events listed per route (default 3)
//   --json <file>        write every event, by route
//
// Exits non-zero when anything is reported, so it can gate a change.
import { writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { mathFingerprint } from '../tests/helpers/jumping-golden.mjs'
import { BUDGET, FLICKER_GATE, FLICKER_UNITS, SNAP_UNITS, gateCounts, runFlickerScan } from '../tests/helpers/jumping-flicker.mjs'

const args = process.argv.slice(2)
const option = name => { const at = args.indexOf(name); return at < 0 ? undefined : args[at + 1] }
const source = option('--source'), only = option('--only'), show = Number(option('--show') ?? 3), gate = args.includes('--gate')
const kind = gate ? 'flicker' : option('--kind')
const thresholds = { flicker: Number(option('--flicker') ?? FLICKER_UNITS), snap: Number(option('--snap') ?? SNAP_UNITS) }
const started = performance.now()
const results = await runFlickerScan({ source, thresholds })
const selected = results.filter(result => !only || result.key.includes(only))

if (args.includes('--write-budget')) {
  const note = option('--note')
  if (!note) throw new Error('Say why the budget changes: --note \'...\'')
  const revision = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim()
  const routes = gateCounts(results), total = Object.values(routes).reduce((sum, n) => sum + n, 0)
  writeFileSync(BUDGET, JSON.stringify({ math: mathFingerprint(), gate: FLICKER_GATE, recorded: `${revision}: ${note}`, routes }, null, 1) + '\n')
  console.log(`Recorded a budget of ${total} flickers of ${FLICKER_GATE} units or more over ${results.length} routes.`)
  process.exit(0)
}

let total = 0, routes = 0
const counts = { flicker: 0, snap: 0 }
for (const { key, events: all } of selected) {
  const events = all.filter(event => (!kind || event.kind === kind) && (!gate || event.units >= FLICKER_GATE))
  if (!events.length) continue
  routes++; total += events.length
  for (const event of events) counts[event.kind]++
  const tally = ['flicker', 'snap'].map(k => [k, events.filter(e => e.kind === k).length]).filter(([, n]) => n).map(([k, n]) => `${n} ${k}${n > 1 ? 's' : ''}`).join(', ')
  console.log(`✗ ${key}: ${tally}`)
  for (const event of events.toSorted((a, b) => b.units - a.units).slice(0, show))
    console.log(`    tick ${event.tick} (${(event.tick / 120).toFixed(2)} s) ${event.kind} ${event.joint} ${event.units} units${event.steps ? ` for ${event.steps} step${event.steps > 1 ? 's' : ''}` : ''}, ${event.context}`)
}
if (option('--json')) writeFileSync(option('--json'), JSON.stringify(Object.fromEntries(selected.map(({ key, events }) => [key, events.filter(event => !kind || event.kind === kind)])), null, 1))
console.log(`${selected.length - routes}/${selected.length} routes clean; ${counts.flicker} flickers and ${counts.snap} snaps (flicker ${thresholds.flicker}${gate ? `, at least ${FLICKER_GATE}` : ''}, snap ${thresholds.snap} units), in ${((performance.now() - started) / 1000).toFixed(1)} s.`)
process.exitCode = total ? 1 : 0
