import test from 'node:test'
import assert from 'node:assert/strict'
import { compareTrace, goldenScripts, goldenSets, loadGame, missingGolden, readGolden, runTraces } from './helpers/jumping-golden.mjs'

// Fixed input scripts on every built-in level must reproduce their recorded
// physics, state and pose hashes bit for bit. To find a divergence, run
// `node scripts/jumping-golden.mjs --only <level>` and then `--print` the trace.
// Re-record a kind only for an intended change to it; physics hashes are never
// re-recorded for a change that claims to preserve behaviour.
//
// Each math library (arm64, x64) has its own set; see the helper. Where none is
// recorded the replays are skipped, except in CI, which must check one.
const golden = readGolden(), game = await loadGame()
const scripts = goldenScripts(game), sets = goldenSets()
const replay = golden || process.env.CI ? {} : { skip: missingGolden() }

test('every math library records a golden trace for every built-in level and medal route', () => {
  assert.equal(new Set(scripts.map(entry => entry.file)).size, scripts.filter(entry => entry.key.endsWith('|runner')).length)
  assert.ok(scripts.filter(entry => entry.file.startsWith('fixture:')).length >= 60, 'mechanism fixtures are included')
  assert.ok(sets.length >= 2, 'arm64 and x64 sets are recorded')
  for (const set of sets) {
    assert.deepEqual(scripts.map(entry => entry.key).sort(), Object.keys(set.traces).sort(), `${set.name} covers every script`)
    for (const [key, trace] of Object.entries(set.traces)) {
      if (key.endsWith('|medal-route')) assert.equal(trace.finished, true, `${key} must still complete its level in ${set.name}`)
      // Scripts have fixed lengths, so only the hashes may differ between sets.
      assert.equal(trace.ticks, sets[0].traces[key].ticks, `${key} runs as long in ${set.name}`)
    }
  }
})

// Physics never reads animation, so neither skipping it (headless runs and
// off-screen robots) nor running it once per drawn frame may change motion.
for (const cadence of ['off', 'frame']) test(`physics is unchanged when animation runs ${cadence === 'off' ? 'never' : 'once per frame'}`, replay, async () => {
  assert.ok(golden, missingGolden())
  const results = await runTraces({ kinds: ['physics'], cadence })
  const problems = results.flatMap(({ key, ...result }) => {
    const problem = compareTrace(golden.traces[key], result, ['physics'])
    return problem ? [`${key}: ${problem}`] : []
  })
  assert.deepEqual(problems, [])
})

test('golden traces reproduce their physics, state and pose hashes', replay, async t => {
  assert.ok(golden, missingGolden())
  const results = await runTraces()
  for (const { key, ...result } of results) {
    await t.test(key, () => {
      const problem = compareTrace(golden.traces[key], result)
      assert.equal(problem, null, `${key}: ${problem} (${golden.name}). Run node scripts/jumping-golden.mjs --only '${key}' on ${golden.cpu} to reproduce, and record an intended change in every set (docs/testing.md).`)
    })
  }
})
