import { readFileSync, writeFileSync } from 'node:fs'
import { cpus, arch, platform } from 'node:os'
import { performance } from 'node:perf_hooks'
import assert from 'node:assert/strict'
import { createRope, ropeImpulse, stepRope } from '../src/games/jumping/climbables.ts'
import { STEP } from '../src/games/jumping/model.ts'
import { installRopeWasm, setRopeWasmEnabled, ropeWasmStatus } from '../src/games/jumping/ropeWasm.ts'

await installRopeWasm(readFileSync(new URL('../public/wasm/lab-rope.wasm', import.meta.url)))
const frames = Number(process.env.LAB_ROPE_FRAMES ?? 120), episodes = Number(process.env.LAB_ROPE_EPISODES ?? 3)
const counts = (process.env.LAB_ROPE_COUNTS ?? '1,8,32,64').split(',').map(Number)
const contactsMode = process.env.LAB_ROPE_CONTACTS ?? 'all'
if (!Number.isInteger(frames) || frames < 10 || frames > 10000) throw new Error('LAB_ROPE_FRAMES must be 10..10000')
if (!Number.isInteger(episodes) || episodes < 1 || episodes > 20) throw new Error('LAB_ROPE_EPISODES must be 1..20')
if (counts.some(n => !Number.isInteger(n) || n < 1 || n > 256)) throw new Error('LAB_ROPE_COUNTS must contain 1..256')
if (!['all', 'free', 'wall'].includes(contactsMode)) throw new Error('LAB_ROPE_CONTACTS must be all, free or wall')
const results = [], median = values => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)]
for (const contacts of contactsMode === 'all' ? [false, true] : [contactsMode === 'wall']) for (const count of counts) {
  // Numerical stress workload, not an authored/playable level. Every long rope
  // stays active; the contact case swings into a narrow wall beside each anchor.
  const terrain = contacts ? Array.from({ length: count }, (_, i) => ({ x: i * 160 - 30, y: 150, w: 20, h: 700 })) : []
  const runs = [], differences = []
  for (let episode = 0; episode < episodes; episode++) {
  const outcomes = {}
  // Alternate order to reduce warmup/background-load bias. Never time backends concurrently.
  for (const backend of episode % 2 ? ['wasm', 'typescript'] : ['typescript', 'wasm']) {
    setRopeWasmEnabled(backend === 'wasm')
    const ropes = Array.from({ length: count }, (_, i) => createRope({ x: i * 160, y: 0, length: 760, segments: 95 }))
    for (const rope of ropes) ropeImpulse(rope, 650, -220, -60, STEP)
    const samples = [], start = ropeWasmStatus().wasmSteps
    for (let frame = 0; frame < frames + 30; frame++) {
      const began = performance.now()
      for (let substep = 0; substep < 2; substep++) for (const rope of ropes) stepRope(rope, STEP, terrain, null)
      if (frame >= 30) samples.push(performance.now() - began)
    }
    if (backend === 'wasm') assert.ok(ropeWasmStatus().wasmSteps > start, 'Wasm must actually execute')
    const sorted = samples.toSorted((a, b) => a - b), percentile = p => sorted[Math.ceil(sorted.length * p) - 1]
    runs.push({ backend, episode,
      meanMs: samples.reduce((a, b) => a + b, 0) / frames, p50Ms: percentile(.5), p95Ms: percentile(.95), p99Ms: percentile(.99) })
    outcomes[backend] = ropes
  }
  let worstDifference = 0
  for (let r = 0; r < count; r++) for (let i = 0; i < outcomes.typescript[r].nodes.length; i++) for (const key of ['x', 'y', 'oldX', 'oldY']) {
    worstDifference = Math.max(worstDifference, Math.abs(outcomes.typescript[r].nodes[i][key] - outcomes.wasm[r].nodes[i][key]))
  }
  for (let r = 0; r < count; r++) assert.deepEqual(outcomes.typescript[r].bends.map(Boolean), outcomes.wasm[r].bends.map(Boolean))
  assert.ok(worstDifference < 1e-6, `trajectory mismatch: ${worstDifference}`)
  differences.push(worstDifference)
  }
  for (const backend of ['typescript', 'wasm']) {
    const backendRuns = runs.filter(r => r.backend === backend)
    results.push({ contacts, ropes: count, segmentsPerRope: 95, backend, frames, episodes,
      ...Object.fromEntries(['meanMs', 'p50Ms', 'p95Ms', 'p99Ms'].map(key => [key, median(backendRuns.map(r => r[key]))])),
      worstTrajectoryDifference: Math.max(...differences), runs: backendRuns })
  }
  console.log(`${contacts ? 'wall' : 'free'} ${count} ropes: ${results.at(-2).p95Ms.toFixed(2)} → ${results.at(-1).p95Ms.toFixed(2)} ms p95`)
}
const report = { machine: cpus()[0].model, system: `${platform()} ${arch()}`, node: process.version,
  note: 'Median episode statistics. Two 120 Hz ticks per sample; 30 warmup frames per episode; alternating backend order. Includes JS culling, sleeping checks, packing, transfers and Wasm work. Excludes rendering/GPU, input and browser scheduling. Sequential episodes.',
  ropeWasm: ropeWasmStatus(), results }
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(report, null, 2) + '\n')
else console.log(JSON.stringify(report, null, 2))
