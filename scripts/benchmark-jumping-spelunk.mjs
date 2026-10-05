import { readFileSync, writeFileSync } from 'node:fs'
import { cpus, arch, platform } from 'node:os'
import { performance } from 'node:perf_hooks'
import { createHash } from 'node:crypto'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { parseLevel } from '../src/games/jumping/level.ts'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'

// Simulation CPU only. The historical recording preserves its original explicit
// jump impulses so a before/after run visits identical contacts and mechanisms.
// One complete warmup, then one measured fresh-start playthrough. No rendering.
const level = parseLevel(JSON.parse(readFileSync(new URL('../public/levels/jumping/spelunk1.jump-level.json', import.meta.url))))
const recording = JSON.parse(readFileSync(new URL('../tests/fixtures/jumping-builtin-medal-runs.json', import.meta.url))).runs.find(r => r.file === 'spelunk1.jump-level.json')
const samples = [], phases = [], checksum = createHash('sha256')
for (let trial = 0; trial < 2; trial++) {
  const run = createRun(level)
  let tick = 0, frameMs = 0
  for (const { frames, input } of recording.trace) {
    const controls = { ...NEUTRAL_INPUT, ...input }
    let phaseMs = 0
    for (let i = 0; i < frames; i++) {
      const start = performance.now()
      stepRun(run, controls)
      const ms = performance.now() - start
      if (trial) {
        phaseMs += ms; frameMs += ms
        // Pair adjacent 120 Hz steps as a 60 Hz display frame, even across input changes.
        if (tick % 2) { samples.push(frameMs); frameMs = 0 }
        checksum.update(JSON.stringify([run.player.x, run.player.y, run.player.vx, run.player.vy,
          run.props.map(p => [p.x, p.y, p.vx, p.vy, p.angle, p.angularVelocity]),
          run.player.ropes?.map(r => r.nodes.map(n => [n.x, n.y, n.oldX, n.oldY])),
          run.mechanisms.map(m => [m.x, m.y, m.active]), run.elapsed]))
      }
      tick++
    }
    if (trial) phases.push({ endTick: tick, x: run.player.x, y: run.player.y, msPerTick: phaseMs / frames })
  }
  if (!run.finished || Math.abs(run.elapsed - recording.elapsed) > STEP || run.coinsCollected !== recording.coins) throw new Error('Spelunk recording changed')
}
const sorted = samples.toSorted((a, b) => a - b), percentile = p => sorted[Math.ceil(sorted.length * p) - 1]
const result = { machine: cpus()[0].model, system: `${platform()} ${arch()}`, node: process.version,
  note: 'Simulation CPU for two adjacent 120 Hz ticks; excludes rendering, browser scheduling and input latency. One warmup and one measured historical route.',
  frames: samples.length, meanMs: samples.reduce((a, b) => a + b, 0) / samples.length,
  p50Ms: percentile(.5), p95Ms: percentile(.95), p99Ms: percentile(.99), worstMs: sorted.at(-1),
  trajectoryChecksum: checksum.digest('hex'), slowPhases: phases.toSorted((a, b) => b.msPerTick - a.msPerTick).slice(0, 5) }
console.log(JSON.stringify(result, null, 2))
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(result, null, 2) + '\n')
