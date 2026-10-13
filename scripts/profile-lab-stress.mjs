import { Session } from 'node:inspector'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { stressRun, stressSnapshot } from '../tests/bench/labStressScene.mjs'
import { stepRun } from '../src/games/jumping/challenge.ts'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'

const fixture = JSON.parse(readFileSync('tests/fixtures/jumping/lab-stress.json'))
const scenario = fixture.cases.find(c => c.id === (process.env.LAB_STRESS_CASE ?? 'mixed-medium'))
if (!scenario) throw new Error('Unknown LAB_STRESS_CASE')
const frames = Number(process.env.LAB_STRESS_FRAMES ?? 90)
const skip = Number(process.env.LAB_STRESS_SKIP ?? 30)
if (!Number.isInteger(frames) || frames < 10 || frames > 10000) throw new Error('Invalid frames')
if (!Number.isInteger(skip) || skip < 0 || skip > 10000) throw new Error('Invalid skip')
const run = stressRun(fixture, scenario)
for (let tick = 0; tick < skip * 2; tick++) stepRun(run, NEUTRAL_INPUT, STEP)
const session = new Session()
session.connect()
const post = (method, params = {}) => new Promise((resolve, reject) => session.post(method, params, (error, result) => error ? reject(error) : resolve(result)))
await post('Profiler.enable')
await post('Profiler.setSamplingInterval', { interval: 1000 })
await post('Profiler.start')
try {
  for (let tick = 0; tick < frames * 2; tick++) stepRun(run, NEUTRAL_INPUT, STEP)
  const { profile } = await post('Profiler.stop')
  const output = resolve(process.argv[2] ?? `.local/${scenario.id}-javascript.cpuprofile`)
  mkdirSync(dirname(output), { recursive: true })
  writeFileSync(output, JSON.stringify(profile))
  const byId = new Map(profile.nodes.map(n => [n.id, n.callFrame])), counts = new Map()
  for (const id of profile.samples) {
    const frame = byId.get(id), key = `${frame.functionName || '(anonymous)'} ${frame.url}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  console.log(JSON.stringify({ scenario: scenario.id, backend: 'javascript', frames, skip, samples: profile.samples.length,
    note: 'Instrumented simulation-only CPU profile; use uninstrumented browser stress runs for timing claims.',
    topSelfSamples: [...counts].toSorted((a, b) => b[1] - a[1]).slice(0, 20), snapshotValues: stressSnapshot(run).length, output }, null, 2))
} finally { session.disconnect() }
