import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { classifyChanges, deploymentScope, scopeFromRuns } from '../scripts/deploy-scope.mjs'

function repository(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'arcade-deploy-scope-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  const write = (path, value) => { mkdirSync(dirname(join(cwd, path)), { recursive: true }); writeFileSync(join(cwd, path), value) }
  const commit = () => { git('add', '.'); git('commit', '-m', 'fixture'); return git('rev-parse', 'HEAD') }
  git('init', '--initial-branch=main')
  git('config', 'user.name', 'Deployment test')
  git('config', 'user.email', 'deployment-test@example.invalid')
  write('src/arcade/ArcadeMenu.tsx', 'original menu')
  write('src/arcade/arcade.css', 'original style')
  write('src/games/example.ts', 'original game')
  const base = commit()
  const successfulRun = { head_sha: base, conclusion: 'success', event: 'push', head_branch: 'main' }
  return { cwd, git, write, commit, successfulRun }
}

test('only modifications to the explicit homepage allowlist qualify', () => {
  for (const path of ['src/arcade/ArcadeMenu.tsx', 'src/arcade/arcade.css', 'public/arcade-logo.svg', 'public/favicon.svg']) {
    assert.equal(classifyChanges([{ status: 'M', path }]), true)
    for (const status of ['A', 'D', 'T', 'R100']) assert.equal(classifyChanges([{ status, path }]), false)
  }
  for (const path of ['src/accounts/accounts.css', 'src/index.css', 'src/arcade/games.ts', 'src/games/example.ts',
    'public/levels/jumping/00.json', 'package-lock.json', 'vite.config.ts', '.github/workflows/deploy.yml',
    'scripts/deploy-scope.mjs', 'tests/browser/homepage.spec.mjs', 'src/arcade/arcade.css\nother-path']) {
    assert.equal(classifyChanges([{ status: 'M', path: 'src/arcade/arcade.css' }, { status: 'M', path }]), false, path)
  }
  assert.equal(classifyChanges([]), false)
})

test('homepage changes since a successful deployment use the fast path', t => {
  const repo = repository(t)
  repo.write('src/arcade/arcade.css', 'new layout')
  repo.write('src/arcade/ArcadeMenu.tsx', 'new slogan')
  repo.commit()
  assert.equal(scopeFromRuns([repo.successfulRun], repo).fast, true)
})

test('a homepage follow-up cannot bypass an earlier unvalidated game change', t => {
  const repo = repository(t)
  repo.write('src/games/example.ts', 'untested game change')
  const gameSha = repo.commit()
  repo.write('src/arcade/arcade.css', 'safe follow-up')
  repo.commit()
  for (const conclusion of ['failure', null, 'cancelled']) {
    const runs = [{ ...repo.successfulRun, head_sha: gameSha, conclusion }, repo.successfulRun]
    const result = scopeFromRuns(runs, repo)
    assert.equal(result.fast, false)
    assert.equal(result.base, repo.successfulRun.head_sha)
  }
})

test('renaming an allowed file is not a presentation-only modification', t => {
  const repo = repository(t)
  repo.git('mv', 'src/arcade/arcade.css', 'src/arcade/moved.css')
  repo.commit()
  assert.equal(scopeFromRuns([repo.successfulRun], repo).fast, false)
})

test('a successful deployment from a different history cannot approve this one', t => {
  const repo = repository(t)
  repo.git('switch', '-c', 'other-history')
  repo.write('src/games/example.ts', 'other game change')
  const unrelated = repo.commit()
  repo.git('switch', 'main')
  repo.write('src/arcade/arcade.css', 'new layout')
  repo.commit()
  assert.equal(scopeFromRuns([{ ...repo.successfulRun, head_sha: unrelated }], repo).fast, false)
  assert.equal(scopeFromRuns([{ ...repo.successfulRun, event: 'pull_request' }], repo).fast, false)
  assert.equal(scopeFromRuns([{ ...repo.successfulRun, head_branch: 'feature' }], repo).fast, false)
  assert.equal(scopeFromRuns([{ ...repo.successfulRun, head_sha: '--help' }], repo).fast, false)
})

test('missing or failed deployment history falls back to full validation', async () => {
  assert.equal((await deploymentScope()).fast, false)
  for (const request of [async () => { throw new Error('offline') },
    async () => ({ ok: false, status: 403 }), async () => ({ ok: true, json: async () => ({}) }),
    async () => ({ ok: true, json: async () => ({ workflow_runs: [] }) })]) {
    assert.equal((await deploymentScope({ repository: 'owner/repo', token: 'test-only', request })).fast, false)
  }
})


test('recent mixed workflow history selects a successful main deployment locally', async t => {
  const repo = repository(t)
  repo.write('src/arcade/arcade.css', 'new layout')
  const current = repo.commit()
  const runs = [
    { ...repo.successfulRun, head_sha: current, conclusion: null },
    { ...repo.successfulRun, head_sha: current, event: 'pull_request', head_branch: 'feature' },
    repo.successfulRun,
  ]
  const result = await deploymentScope({ ...repo, repository: 'owner/repo', token: 'test-only',
    request: async () => ({ ok: true, json: async () => ({ workflow_runs: runs }) }) })
  assert.equal(result.fast, true)
  assert.equal(result.base, repo.successfulRun.head_sha)
})
