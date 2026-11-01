import { readFileSync, writeFileSync } from 'node:fs'
import { cpus } from 'node:os'
import { performance } from 'node:perf_hooks'
import { execFileSync } from 'node:child_process'
import { goldenScripts, loadGame } from '../tests/helpers/jumping-golden.mjs'

// Per-tick and per-frame simulation cost for Untitled Jumping Game in Node.
//
//   node scripts/benchmark-jumping-simulation.mjs [--only <text>] [--output file.json] [--compare before.json]
//
// It replays the golden-trace input scripts (two seeded explorers per built-in
// level, plus the recorded medal routes). A tick is one 120 Hz stepRun. A frame
// is two ticks plus presentedAthletePose for the player and every robot actor,
// which is the simulation and pose work of one 60 Hz rendered frame. Canvas
// drawing is not included. Each level runs its scripts once to warm the JIT,
// then once timed. Run it alone: concurrent work inflates every number.
// `--source <checkout>` times another checkout's game code with the same scripts.
// For a CPU profile, prefix with `node --cpu-prof --cpu-prof-dir=.local/profiles`.

const args = process.argv.slice(2)
const option = name => { const at = args.indexOf(name); return at < 0 ? undefined : args[at + 1] }
const only = option('--only'), output = option('--output'), compare = option('--compare')
const game = await loadGame(option('--source'))
const entries = goldenScripts(game).filter(entry => !only || entry.key.includes(only))
if (!entries.length) throw new Error(`No scripts match ${only}`)

const stats = values => {
  const sorted = values.toSorted((a, b) => a - b), pick = q => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))]
  return { mean: values.reduce((sum, v) => sum + v, 0) / values.length, p50: pick(.5), p95: pick(.95), max: sorted.at(-1) }
}
function replay(entry, timed) {
  const level = game.parseLevel(JSON.parse(readFileSync(new URL(entry.file, game.levelsRoot), 'utf8')))
  const run = game.createRun(level)
  game.stepRun(run, game.NEUTRAL_INPUT, game.entranceDuration(run.entrance))
  const ticks = [], frames = [], poses = []
  let frame = 0, posing = 0, tick = 0
  for (const { frames: count, input } of entry.script) {
    const controls = { ...game.NEUTRAL_INPUT, ...input }
    for (let i = 0; i < count && !run.finished; i++) {
      const started = performance.now()
      game.stepRun(run, controls)
      const stepped = performance.now()
      if (timed) ticks.push(stepped - started)
      frame += stepped - started
      if (++tick % 2 === 0) {
        const before = performance.now()
        game.presentedAthletePose(run.player)
        for (const robot of run.robots) if (robot.actor) game.presentedAthletePose(robot.actor)
        const pose = performance.now() - before
        posing += pose; frame += pose
        if (timed) { frames.push(frame); poses.push(posing) }
        frame = 0; posing = 0
      }
    }
  }
  return { ticks, frames, poses }
}

const byLevel = new Map()
for (const entry of entries) {
  if (!byLevel.has(entry.file)) byLevel.set(entry.file, [])
  byLevel.get(entry.file).push(entry)
}
const levels = {}
const all = { ticks: [], frames: [], poses: [] }
for (const [file, scripts] of byLevel) {
  for (const entry of scripts) replay(entry, false)
  const timed = { ticks: [], frames: [], poses: [] }
  for (const entry of scripts) {
    const result = replay(entry, true)
    for (const key of Object.keys(timed)) { timed[key].push(...result[key]); all[key].push(...result[key]) }
  }
  levels[file] = { ticks: timed.ticks.length, tickMs: stats(timed.ticks), frameMs: stats(timed.frames), poseMs: stats(timed.poses) }
}

const round = value => typeof value === 'number' ? Number(value.toFixed(4)) : value
const report = JSON.parse(JSON.stringify({
  commit: execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(),
  node: process.version, arch: process.arch, cpu: cpus()[0]?.model, scripts: entries.length,
  overall: { ticks: all.ticks.length, tickMs: stats(all.ticks), frameMs: stats(all.frames), poseMs: stats(all.poses) }, levels,
}, (key, value) => round(value)))
if (output) writeFileSync(output, `${JSON.stringify(report, null, 1)}\n`)

const before = compare ? JSON.parse(readFileSync(compare, 'utf8')) : null
const cell = (now, then) => then ? `${now.toFixed(3)} (${((now / then - 1) * 100).toFixed(0).padStart(4)}%)` : now.toFixed(3)
console.log(`${report.scripts} scripts, ${report.overall.ticks} ticks, ${report.node} ${report.arch} on ${report.cpu}${before ? `, compared with ${compare}` : ''}`)
console.log('level'.padEnd(34), 'tick mean', '  tick p95', ' frame p95', '  pose mean')
const rows = Object.entries(levels).sort((a, b) => b[1].tickMs.mean - a[1].tickMs.mean)
for (const [file, level] of [['overall', report.overall], ...rows]) {
  const then = file === 'overall' ? before?.overall : before?.levels[file]
  console.log(file.slice(0, 33).padEnd(34), cell(level.tickMs.mean, then?.tickMs.mean), cell(level.tickMs.p95, then?.tickMs.p95),
    cell(level.frameMs.p95, then?.frameMs.p95), cell(level.poseMs.mean, then?.poseMs.mean))
}
