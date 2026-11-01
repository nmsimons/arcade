import test from 'node:test'
import assert from 'node:assert/strict'
import { compareTrace, goldenScripts, loadGame, readGolden, runTraces } from './helpers/jumping-golden.mjs'

// Fixed input scripts on every built-in level must reproduce their recorded
// physics, state and pose hashes bit for bit. To find a divergence, run
// `node scripts/jumping-golden.mjs --only <level>` and then `--print` the trace.
// Re-record a kind only for an intended change to it; physics hashes are never
// re-recorded for a change that claims to preserve behaviour.
const golden = readGolden(), game = await loadGame()
const scripts = goldenScripts(game)

test('every built-in level and medal route has a recorded golden trace', () => {
  assert.deepEqual(scripts.map(entry => entry.key).sort(), Object.keys(golden.traces).sort())
  assert.equal(new Set(scripts.map(entry => entry.file)).size, scripts.filter(entry => entry.key.endsWith('|runner')).length)
  assert.ok(scripts.filter(entry => entry.file.startsWith('fixture:')).length >= 60, 'mechanism fixtures are included')
  for (const [key, trace] of Object.entries(golden.traces)) {
    if (key.endsWith('|medal-route')) assert.equal(trace.finished, true, `${key} must still complete its level`)
  }
})

test('golden traces reproduce their physics, state and pose hashes', async t => {
  const results = await runTraces()
  for (const { key, ...result } of results) {
    await t.test(key, () => {
      const problem = compareTrace(golden.traces[key], result)
      assert.equal(problem, null, `${key}: ${problem}. Run node scripts/jumping-golden.mjs --only '${key}' to reproduce.`)
    })
  }
})
