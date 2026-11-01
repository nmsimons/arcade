import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assignShards, fileFilter, listSpecs, parseShard, readTimings } from '../scripts/browser-shard.mjs'
import { timingSnapshot } from '../scripts/browser-timings.mjs'

test('longest files go first onto the least-loaded shard', () => {
  const seconds = { a: 100, b: 90, c: 50, d: 40, e: 30, f: 20, g: 10 }
  const shards = assignShards(Object.keys(seconds), seconds, 3)
  assert.deepEqual(shards.map(shard => shard.files), [['a', 'g'], ['b', 'e'], ['c', 'd', 'f']])
  assert.deepEqual(shards.map(shard => shard.seconds), [110, 120, 110])
})

test('unrecorded specs count as the median recorded spec and ties stay deterministic', () => {
  const seconds = { slow: 30, mid: 20, quick: 10 }
  const shards = assignShards(['quick', 'new.spec.mjs', 'slow', 'mid', 'other.spec.mjs'], seconds, 2)
  assert.deepEqual(shards.map(shard => shard.files), [['other.spec.mjs', 'slow'], ['mid', 'new.spec.mjs', 'quick']])
  assert.deepEqual(shards.map(shard => shard.seconds), [50, 50])
  assert.deepEqual(assignShards(['b', 'a', 'c'], {}, 2).map(shard => shard.files), [['a', 'c'], ['b']])
})

test('the recorded durations keep every current spec in exactly one balanced shard', () => {
  const files = listSpecs(), timings = readTimings()
  assert.ok(files.length > 100)
  for (const name of Object.keys(timings.seconds)) assert.match(name, /^[\w.-]+\.spec\.mjs$/)
  const shards = assignShards(files, timings.seconds, 3)
  assert.deepEqual(shards.flatMap(shard => shard.files).sort(), files)
  const mean = shards.reduce((sum, shard) => sum + shard.seconds, 0) / shards.length
  for (const shard of shards) assert.ok(Math.abs(shard.seconds - mean) < mean * .1, `${shard.seconds} s against a mean of ${mean} s`)
})

test('file filters match only the whole spec file name', () => {
  const matcher = pattern => path => { const re = new RegExp(pattern, 'gi'); return re.test(path) }
  const water = matcher(fileFilter('jumpingWater.spec.mjs'))
  assert.ok(water('/home/ci/arcade/tests/browser/jumpingWater.spec.mjs'))
  assert.ok(water('C:\\arcade\\tests\\browser\\jumpingWater.spec.mjs'))
  assert.ok(!water('/home/ci/arcade/tests/browser/jumpingWater.dev.spec.mjs'))
  assert.ok(!water('/home/ci/arcade/tests/browser/jumpingWaterx.spec.mjs'))
  assert.ok(!water('/home/ci/arcade/tests/browser/rbotJumpingWater.spec.mjs'))
  assert.ok(!water('/home/ci/arcade/tests/browser/jumpingWaterXspecXmjs'))
})

test('shard arguments are validated', () => {
  assert.deepEqual(parseShard('2/3'), { current: 2, total: 3 })
  for (const bad of ['0/3', '4/3', '3', 'a/b', undefined]) assert.throws(() => parseShard(bad))
})

test('timing snapshots total each file across projects and keep the CI build and date', () => {
  const report = project => ({ config: { metadata: { ci: { commitHash: 'abc', buildHref: 'https://example.test/run/1' } } }, stats: { startTime: '2026-10-31T23:58:30.000Z' }, suites: [
    { file: 'b.spec.mjs', specs: [{ title: 'x', file: 'b.spec.mjs', tests: [{ projectName: project, results: [{ duration: 1500, status: 'passed' }] }] }] },
    { file: 'a.spec.mjs', specs: [{ title: 'y', file: 'a.spec.mjs', tests: [{ projectName: project, results: [{ duration: 250, status: 'failed' }, { duration: 260, status: 'passed' }] }] }] },
  ] })
  const snapshot = timingSnapshot([report('development'), report('iphone-webkit')])
  assert.deepEqual(snapshot, { recorded: '2026-10-31', commit: 'abc', build: 'https://example.test/run/1', seconds: { 'a.spec.mjs': .5, 'b.spec.mjs': 3 } })
  assert.deepEqual(Object.keys(snapshot.seconds), ['a.spec.mjs', 'b.spec.mjs'])
  assert.equal(timingSnapshot([{ suites: [] }], new Date('2026-05-04T12:00:00Z')).recorded, '2026-05-04')
})
