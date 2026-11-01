import test from 'node:test'
import assert from 'node:assert/strict'
import { KINDS, compareTrace, goldenScripts, goldenSets, loadGame, missingGolden, readGolden, runTraces } from './helpers/jumping-golden.mjs'

// Fixed input scripts on every built-in level must reproduce their recorded
// physics, state and pose hashes bit for bit. To find a divergence, run
// `node scripts/jumping-golden.mjs --only <level>` and then `--print` the trace.
// Re-record a kind only for an intended change to it; physics hashes are never
// re-recorded for a change that claims to preserve behaviour.
//
// Hashes hold only for the math library that recorded them (see the helper), so
// the replay is skipped on a CPU with no recorded set, such as CI's Linux x64.
// There, physics with animation off is compared with this machine's own run.
// CI's unit-test jobs set SKIP_UJG_GOLDEN, and a separate job runs this file.
const golden = readGolden(), game = await loadGame()
const scripts = goldenScripts(game), sets = goldenSets()
const skipped = process.env.SKIP_UJG_GOLDEN ? 'CI replays golden traces in its own job' : null

test('every built-in level and medal route has a recorded golden trace', () => {
  assert.equal(new Set(scripts.map(entry => entry.file)).size, scripts.filter(entry => entry.key.endsWith('|runner')).length)
  assert.ok(scripts.filter(entry => entry.file.startsWith('fixture:')).length >= 60, 'mechanism fixtures are included')
  assert.ok(sets.length, 'a golden set is recorded')
  for (const set of sets) {
    assert.deepEqual(scripts.map(entry => entry.key).sort(), Object.keys(set.traces).sort(), `${set.name} covers every script`)
    for (const [key, trace] of Object.entries(set.traces)) {
      if (key.endsWith('|medal-route')) assert.equal(trace.finished, true, `${key} must still complete its level in ${set.name}`)
    }
  }
})

// One run at the default cadence serves as the replay and as the reference for
// the other cadences.
let tick
const tickRun = () => tick ??= runTraces({ kinds: golden ? KINDS : ['physics'] })
  .then(results => new Map(results.map(({ key, ...result }) => [key, result])))

test('golden traces reproduce their physics, state and pose hashes', { skip: skipped ?? (!golden && missingGolden()) }, async t => {
  for (const [key, result] of await tickRun()) {
    await t.test(key, () => {
      const problem = compareTrace(golden.traces[key], result)
      assert.equal(problem, null, `${key}: ${problem}. Run node scripts/jumping-golden.mjs --only '${key}' to reproduce.`)
    })
  }
})

// Physics never reads animation, so neither skipping it (headless runs and
// off-screen robots) nor running it once per drawn frame may change motion.
// The game never animates once per frame, so that cadence is checked only
// where hashes are recorded.
for (const cadence of ['off', 'frame']) test(`physics is unchanged when animation runs ${cadence === 'off' ? 'never' : 'once per frame'}`, {
  skip: skipped ?? (cadence === 'frame' && !golden && `${missingGolden()} The game never animates once per frame.`),
}, async () => {
  const reference = await tickRun(), results = await runTraces({ kinds: ['physics'], cadence })
  const problems = results.flatMap(({ key, ...result }) => {
    const problem = compareTrace(reference.get(key), result, ['physics'])
    return problem ? [`${key}: ${problem}`] : []
  })
  assert.deepEqual(problems, [])
})
