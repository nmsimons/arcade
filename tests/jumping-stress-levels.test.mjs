import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { decodeLevelFile, playableLevelFile, decodeLevelManifest } from '../src/games/jumping/levelAssets.ts'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'

const root = new URL('../dev/levels/jumping/', import.meta.url)
const manifest = decodeLevelManifest(await readFile(new URL('index.json', root), 'utf8'))
const recordings = JSON.parse(await readFile(new URL('fixtures/jumping-stress-level-runs.json', import.meta.url), 'utf8'))

test('development maps stay outside production; stress benchmarks retain both recorded routes', async () => {
  const production = decodeLevelManifest(await readFile(new URL('../public/levels/jumping/index.json', import.meta.url), 'utf8'))
  assert.equal(recordings.jumpModel, 'tap-hold')
  let timedMaps = 0
  for (const file of manifest.levels) {
    assert.ok(!production.levels.includes(file))
    const level = decodeLevelFile(await readFile(new URL(file, root), 'utf8'))
    if (level.timing === 'untimed') {
      // Untimed mechanic rooms use focused interaction coverage. Benchmark
      // recordings belong to the timed load-test courses.
      assert.ok(playableLevelFile({ fileName: file, level }))
      if (file === 'Tool Bench.jump-level.json') {
        assert.ok(level.props.some(prop => prop.gadget === 'emp'))
        assert.ok(level.props.some(prop => prop.gadget === 'repulsor'))
      }
      continue
    }
    timedMaps++
    assert.deepEqual(recordings.runs.filter(r => r.file === file).map(r => r.route).sort(), ['service', 'upper'])
  }
  assert.equal(recordings.runs.length, timedMaps * 2)
})

for (const recording of recordings.runs) test(`development stress ${recording.route} route: ${recording.file}`, async () => {
  assert.ok(manifest.levels.includes(recording.file))
  const level = playableLevelFile({ fileName: recording.file, level: decodeLevelFile(await readFile(new URL(recording.file, root), 'utf8')) }).level
  const run = createRun(level)
  for (const { frames, input } of recording.trace) {
    assert.ok(Number.isInteger(frames) && frames > 0)
    assert.ok(Object.keys(input).every(key => key in NEUTRAL_INPUT))
    for (let frame = 0; frame < frames; frame++) {
      assert.equal(run.finished, false)
      stepRun(run, { ...NEUTRAL_INPUT, ...input })
    }
  }
  assert.equal(run.finished, true)
  assert.ok(Math.abs(run.elapsed - recording.elapsed) < STEP)
  assert.ok(Math.abs(run.activeTime - recording.activeTime) < STEP)
  assert.equal(run.coinsCollected, recording.coins)
  if (recording.route === 'upper') assert.equal(run.grade, 'A')
})
