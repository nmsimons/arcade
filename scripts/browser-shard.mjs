import { readdirSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Run one balanced shard of the browser suite:
//   node scripts/browser-shard.mjs 2/3 [playwright arguments]
//   node scripts/browser-shard.mjs --plan 3
// Playwright's own --shard gives every shard the same number of tests, so the
// shard holding the ten-minute studio spec finished long after the others.
// This assigns whole spec files by the durations CI recorded most recently;
// refresh them with `node scripts/browser-timings.mjs <reports> --write`.

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
export const TIMINGS_PATH = join(root, 'tests/browser/timings.json')
export const SPECS_PATH = join(root, 'tests/browser')

export function listSpecs(dir = SPECS_PATH) {
  return readdirSync(dir).filter(name => name.endsWith('.spec.mjs')).sort()
}

export function readTimings(path = TIMINGS_PATH) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

/** Longest file first onto the least-loaded shard. A spec without a recorded
 * duration counts as the median recorded spec until the record is refreshed. */
export function assignShards(files, seconds, total) {
  const known = Object.values(seconds).sort((a, b) => a - b)
  const fallback = known.length ? known[Math.floor(known.length / 2)] : 1
  const estimate = file => seconds[file] ?? fallback
  const shards = Array.from({ length: total }, () => ({ files: [], seconds: 0 }))
  const ordered = [...files].sort((a, b) => estimate(b) - estimate(a) || a.localeCompare(b))
  for (const file of ordered) {
    const shard = shards.reduce((least, candidate) => candidate.seconds < least.seconds ? candidate : least)
    shard.files.push(file); shard.seconds += estimate(file)
  }
  for (const shard of shards) shard.files.sort()
  return shards
}

/** Playwright treats positional arguments as case-insensitive regular expressions
 * over absolute paths; anchor each file so `water.spec` cannot match `water.dev.spec`. */
export function fileFilter(file) {
  return `[\\\\/]${file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`
}

export function parseShard(text) {
  const match = /^([1-9]\d*)\/([1-9]\d*)$/.exec(text ?? '')
  if (!match || Number(match[1]) > Number(match[2])) throw new Error(`Expected <current>/<total> such as 2/3, got ${JSON.stringify(text ?? '')}.`)
  return { current: Number(match[1]), total: Number(match[2]) }
}

function minutes(seconds) { return `${(seconds / 60).toFixed(1)} min` }

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [first, ...args] = process.argv.slice(2)
  const timings = readTimings(), files = listSpecs()
  if (first === '--plan') {
    const total = Number(args[0] ?? 3)
    console.log(`Recorded ${timings.recorded} from ${timings.build ?? 'local reports'}\n`)
    for (const [index, shard] of assignShards(files, timings.seconds, total).entries()) {
      const unknown = shard.files.filter(file => !(file in timings.seconds))
      console.log(`Shard ${index + 1}/${total}: ${shard.files.length} files, ${minutes(shard.seconds)}${unknown.length ? ` (${unknown.length} unrecorded)` : ''}`)
      for (const file of shard.files.toSorted((a, b) => (timings.seconds[b] ?? 0) - (timings.seconds[a] ?? 0)).slice(0, 5)) console.log(`  ${minutes(timings.seconds[file] ?? 0).padStart(9)}  ${file}`)
    }
    process.exit(0)
  }
  let shard
  try { shard = parseShard(first) } catch (error) { console.error(`${error.message}\nUsage: node scripts/browser-shard.mjs <current>/<total> [playwright arguments]`); process.exit(2) }
  const assigned = assignShards(files, timings.seconds, shard.total)[shard.current - 1]
  console.log(`Browser shard ${shard.current}/${shard.total}: ${assigned.files.length} spec files, ${minutes(assigned.seconds)} of test time recorded ${timings.recorded}.`)
  const cli = createRequire(import.meta.url).resolve('@playwright/test/cli')
  const result = spawnSync(process.execPath, [cli, 'test', ...assigned.files.map(fileFilter), ...args], { stdio: 'inherit', cwd: root })
  process.exit(result.status ?? 1)
}
