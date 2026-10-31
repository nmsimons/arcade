import test from 'node:test'
import assert from 'node:assert/strict'
import { auditResult } from '../scripts/security-check.mjs'

const advisory = (name, id, severity = 'moderate') => ({ source: 1, name, dependency: name, title: `${name} issue`, url: `https://github.com/advisories/${id}`, severity, range: '<2.0.0' })
const report = (...advisories) => ({
  auditReportVersion: 2,
  vulnerabilities: Object.fromEntries(advisories.map(a => [a.name, { name: a.name, severity: a.severity, via: [a] }])
    .concat([['dependent', { name: 'dependent', severity: 'moderate', via: advisories.map(a => a.name) }]])),
})
const allowed = [{ id: 'GHSA-aaaa-bbbb-cccc', package: 'globber', until: '2026-11-30', reason: 'test' }]

test('moderate and higher advisories block; low and informational ones do not', () => {
  const result = auditResult(report(advisory('globber', 'GHSA-1111-2222-3333'), advisory('parser', 'GHSA-4444-5555-6666', 'critical'),
    advisory('logger', 'GHSA-7777-8888-9999', 'low')), { allowed: [] })
  assert.deepEqual(result.failures.map(a => a.id), ['GHSA-1111-2222-3333', 'GHSA-4444-5555-6666'])
})

test('an allowed advisory passes through its final day, then blocks again', () => {
  const minimatch = report(advisory('globber', 'GHSA-aaaa-bbbb-cccc'))
  const before = auditResult(minimatch, { allowed, now: new Date('2026-11-30T23:59:59Z') })
  assert.deepEqual(before.failures, [])
  assert.deepEqual(before.excused.map(a => [a.id, a.until]), [['GHSA-aaaa-bbbb-cccc', '2026-11-30']])
  const after = auditResult(minimatch, { allowed, now: new Date('2026-12-01T00:00:00Z') })
  assert.deepEqual(after.failures.map(a => a.id), ['GHSA-aaaa-bbbb-cccc'])
})

test('an exception covers only its advisory and package, and reports when it is no longer needed', () => {
  const now = new Date('2026-11-01T00:00:00Z')
  const other = auditResult(report(advisory('globber', 'GHSA-dddd-eeee-ffff'), advisory('wrapper', 'GHSA-aaaa-bbbb-cccc')), { allowed, now })
  assert.deepEqual(other.failures.map(a => `${a.package} ${a.id}`), ['globber GHSA-dddd-eeee-ffff', 'wrapper GHSA-aaaa-bbbb-cccc'])
  const clean = auditResult(report(), { allowed, now })
  assert.deepEqual(clean.failures, [])
  assert.deepEqual(clean.unused.map(entry => entry.id), ['GHSA-aaaa-bbbb-cccc'])
})

test('an audit that cannot run blocks instead of passing silently', () => {
  const result = auditResult({ error: { code: 'ENOTFOUND', summary: 'request to registry failed' } }, { allowed })
  assert.equal(result.failures.length, 1)
  assert.match(result.failures[0].title, /registry/)
})
