import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

// Advisories that may temporarily pass the gate, shared by the web and desktop
// audits. Each entry needs a reason and an expiry; once it expires, the advisory
// blocks again so the exception is revisited.
export const ALLOWED_ADVISORIES = [
  { id: 'GHSA-g3hv-75wg-m249', package: 'minimatch', until: '2026-11-30',
    reason: 'Published 2026-10-30 with no released fix (minimatch 11.0.1 is not yet on npm). Only ESLint and Electron packaging tooling depend on it; no shipped code does.' },
  { id: 'GHSA-3g3m-2fjr-6pw4', package: 'glob', until: '2026-11-30',
    reason: 'Published 2026-10-30 with no released fix (glob 14.0.2 is not yet on npm). Only @electron/packager depends on it, at build time; the desktop app does not ship it.' },
]
const BLOCKING = new Set(['moderate', 'high', 'critical'])

const advisoryId = advisory => advisory.url?.match(/GHSA-[a-z0-9-]+$/i)?.[0] ?? String(advisory.source)

/** Classify `npm audit --json` (report version 2) advisories at moderate severity or above. */
export function auditResult(report, { now = new Date(), allowed = ALLOWED_ADVISORIES } = {}) {
  if (report.error) return { failures: [{ id: 'npm-audit', package: 'npm audit', title: report.error.summary ?? 'npm audit failed' }], excused: [], unused: [] }
  const advisories = new Map()
  for (const vulnerability of Object.values(report.vulnerabilities ?? {})) {
    for (const via of vulnerability.via) if (typeof via === 'object' && BLOCKING.has(via.severity)) {
      advisories.set(advisoryId(via), { id: advisoryId(via), package: via.name, severity: via.severity, title: via.title, url: via.url })
    }
  }
  // An exception lasts through the whole of its final UTC day.
  const active = allowed.filter(entry => now.getTime() < Date.parse(`${entry.until}T00:00:00Z`) + 24 * 60 * 60 * 1000)
  const failures = [], excused = []
  for (const advisory of advisories.values()) {
    const exception = active.find(entry => entry.id === advisory.id && entry.package === advisory.package)
    if (exception) excused.push({ ...advisory, until: exception.until })
    else failures.push(advisory)
  }
  const unused = allowed.filter(entry => !advisories.has(entry.id))
  return { failures, excused, unused }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // npm audit exits non-zero whenever it finds anything; the JSON report decides.
  // Under `npm run`, reuse the running npm instead of resolving it through a shell.
  const options = { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }, npm = process.env.npm_execpath
  const audit = npm ? spawnSync(process.execPath, [npm, 'audit', '--json'], options) : spawnSync('npm audit --json', { ...options, shell: true })
  let report
  try { report = JSON.parse(audit.stdout) } catch { report = { error: { summary: audit.stderr.trim() || 'npm audit did not return JSON' } } }
  const { failures, excused, unused } = auditResult(report)
  for (const advisory of excused) console.log(`Allowed until ${advisory.until}: ${advisory.package} ${advisory.id} (${advisory.severity}) ${advisory.title}`)
  for (const entry of unused) console.log(`Not reported by this audit (remove it once neither audit reports it): ${entry.package} ${entry.id}`)
  for (const advisory of failures) console.error(`Blocking: ${advisory.package} ${advisory.id}${advisory.severity ? ` (${advisory.severity})` : ''} ${advisory.title}${advisory.url ? ` ${advisory.url}` : ''}`)
  if (failures.length) process.exit(1)
  console.log('No blocking dependency advisories.')
}
