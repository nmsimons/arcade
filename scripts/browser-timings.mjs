import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

// Summarize Playwright JSON reports, such as CI's browser-timings-* artifacts:
//   gh run download <run-id> -p 'browser-timings-*' -D .tmp/timings
//   node scripts/browser-timings.mjs .tmp/timings [count]

/** Flatten a Playwright JSON report into one entry per test with its final attempt. */
export function reportTests(report) {
  const tests = []
  const walk = (suite, file) => {
    for (const spec of suite.specs ?? []) for (const test of spec.tests) {
      const result = test.results.at(-1) ?? { duration: 0, status: 'skipped' }
      tests.push({ file: (spec.file ?? file ?? '').replaceAll('\\', '/'), title: spec.title, project: test.projectName, duration: result.duration, status: result.status })
    }
    for (const child of suite.suites ?? []) walk(child, child.file ?? file)
  }
  for (const suite of report.suites ?? []) walk(suite, suite.file)
  return tests
}

/** Total time per spec file, slowest first. */
export function fileTotals(tests) {
  const files = new Map()
  for (const test of tests) {
    const entry = files.get(test.file) ?? { file: test.file, duration: 0, tests: 0 }
    entry.duration += test.duration; entry.tests++
    files.set(test.file, entry)
  }
  return [...files.values()].sort((a, b) => b.duration - a.duration)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [root = '.', count = '20'] = process.argv.slice(2)
  const reports = []
  const find = path => statSync(path).isDirectory() ? readdirSync(path).forEach(name => find(join(path, name)))
    : path.endsWith('.json') && reports.push(path)
  find(root)
  const tests = reports.flatMap(path => reportTests(JSON.parse(readFileSync(path, 'utf8'))))
  if (!tests.length) { console.error(`No Playwright JSON reports found under ${root}.`); process.exit(1) }
  const total = tests.reduce((sum, test) => sum + test.duration, 0), limit = Number(count)
  const minutes = ms => `${(ms / 60000).toFixed(1)} min`
  console.log(`${tests.length} tests in ${reports.length} reports, ${minutes(total)} of test time\n\nSlowest files:`)
  for (const file of fileTotals(tests).slice(0, limit)) console.log(`${minutes(file.duration).padStart(9)} ${(100 * file.duration / total).toFixed(1).padStart(5)}%  ${file.file} (${file.tests})`)
  console.log('\nSlowest tests:')
  for (const test of tests.toSorted((a, b) => b.duration - a.duration).slice(0, limit)) {
    console.log(`${(test.duration / 1000).toFixed(1).padStart(7)} s  ${test.status === 'passed' ? '' : `[${test.status}] `}${test.project} › ${test.file} › ${test.title}`)
  }
}
