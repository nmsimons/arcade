import { execFileSync, spawnSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

// Exact presentation-only files. Shared code, assets used by games, dependencies,
// and the workflow/classifier itself always require the full suite.
const fastPaths = new Set([
  'src/arcade/ArcadeMenu.tsx',
  'src/arcade/arcade.css',
  'public/arcade-logo.svg',
  'public/favicon.svg',
])

export function classifyChanges(changes) {
  return changes.length > 0 && changes.every(({ status, path }) => status === 'M' && fastPaths.has(path))
}

export function scopeFromRuns(runs, { cwd = process.cwd(), head = 'HEAD' } = {}) {
  // Comparing only the last push would let an unvalidated game change ride along
  // with a later homepage fix. Use a successfully deployed ancestor instead.
  const baseline = runs.find(run => run.conclusion === 'success' && run.event === 'push'
    && run.head_branch === 'main' && /^[a-f0-9]{40}$/.test(run.head_sha ?? '')
    && spawnSync('git', ['merge-base', '--is-ancestor', run.head_sha, head], { cwd }).status === 0)
  if (!baseline) return { fast: false, reason: 'No successful deployment ancestor was found.' }
  const base = baseline.head_sha
  const fields = execFileSync('git', ['diff', '--no-ext-diff', '--no-renames', '--name-status', '-z', base, head, '--'],
    { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).split('\0')
  fields.pop()
  if (fields.length % 2) throw new Error('Unexpected Git diff output.')
  const changes = []
  for (let i = 0; i < fields.length; i += 2) changes.push({ status: fields[i], path: fields[i + 1] })
  const fast = classifyChanges(changes)
  return { fast, base, changes, reason: fast
    ? 'Only existing homepage presentation files changed since the successful deployment.'
    : 'The complete deployment diff needs full validation (or contains no changes).' }
}

export async function deploymentScope({ repository, token, apiUrl = 'https://api.github.com', request = fetch, cwd, head } = {}) {
  try {
    if (!repository || !token) throw new Error('GitHub API credentials are unavailable.')
    const repo = repository.split('/').map(encodeURIComponent).join('/')
    const workflow = 'azure-static-web-apps-agreeable-glacier-048815c10.yml'
    // The filtered runs endpoint can lag recent deployments. Read recent runs
    // and select successful main pushes locally, including the ancestry check.
    const url = `${apiUrl}/repos/${repo}/actions/workflows/${workflow}/runs?per_page=100`
    const response = await request(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(15000),
    })
    if (!response.ok) throw new Error(`Workflow history returned HTTP ${response.status}.`)
    const { workflow_runs: runs } = await response.json()
    if (!Array.isArray(runs)) throw new Error('Workflow history is unavailable.')
    return scopeFromRuns(runs, { cwd, head })
  } catch {
    // An API outage, missing Git history or unknown diff must never skip tests.
    return { fast: false, reason: 'Could not establish a verified deployment baseline; using full validation.' }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await deploymentScope({
    repository: process.env.GITHUB_REPOSITORY,
    token: process.env.GH_TOKEN,
    apiUrl: process.env.GITHUB_API_URL,
    head: process.env.GITHUB_SHA || 'HEAD',
  })
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `fast=${result.fast}\n`)
  const summary = `## ${result.fast ? 'Fast homepage' : 'Full'} deployment checks\n\n${result.reason}\n`
    + (result.base ? `\nBaseline: \`${result.base}\`\n` : '')
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary)
  console.log(summary)
}
