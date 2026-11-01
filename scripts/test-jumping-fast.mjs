import { readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

// The fast tier for Untitled Jumping Game simulation work: golden traces, medal
// and course routes, contacts, props, ropes, water and robots. It leaves out the
// stress-level routes and the long whole-skin acceptance sweeps, which run in
// the full `npm test`. Extra arguments go to `node --test`.
//
//   npm run test:fast
//   npm run test:fast -- --test-name-pattern Tower
const SLOW = /^jumping-(stress-|.*-acceptance\.)/
const files = readdirSync(new URL('../tests/', import.meta.url))
  .filter(name => /^jumping-.*\.test\.mjs$/.test(name) && !SLOW.test(name)).sort()
  .map(name => `tests/${name}`)
const result = spawnSync(process.execPath, ['--test', ...process.argv.slice(2), ...files], { stdio: 'inherit' })
process.exit(result.status ?? 1)
