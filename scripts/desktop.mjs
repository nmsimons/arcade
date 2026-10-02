import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const action = process.argv[2], root = resolve(import.meta.dirname, '..')
if (!['build', 'dev', 'package', 'test'].includes(action)) throw new Error('Expected build, dev, package, or test.')
function run(script, args = [], cwd = root, env = process.env) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd, env, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}
if (action !== 'test') {
  const { version } = JSON.parse(readFileSync(resolve(root, 'desktop/package.json'), 'utf8'))
  const tagPrefix = 'refs/tags/desktop-v'
  if (process.env.GITHUB_REF?.startsWith(tagPrefix) && process.env.GITHUB_REF.slice(tagPrefix.length) !== version) throw new Error('The desktop release tag must match desktop/package.json version.')
  run(resolve(root, 'scripts/jumping-levels.mjs'), ['index'])
  run(resolve(root, 'node_modules/typescript/bin/tsc'), ['-b'])
  run(resolve(root, 'node_modules/vite/bin/vite.js'), ['build', '--mode', 'desktop'])
  const product = JSON.parse(readFileSync(resolve(root, 'release/products/arcade.json'), 'utf8'))
  const commit = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' })
  writeFileSync(resolve(root, 'desktop/renderer/release.json'), JSON.stringify({ product: product.id, name: product.name, startPath: product.startPath, executable: product.executable, version, commit: commit.status === 0 ? commit.stdout.trim() : null }, null, 2) + '\n')
}
if (action !== 'build' && !existsSync(resolve(root, 'desktop/node_modules/electron'))) throw new Error('Install desktop dependencies first: npm ci --prefix desktop')
if (action === 'dev') run(resolve(root, 'desktop/node_modules/electron/cli.js'), ['.'], resolve(root, 'desktop'))
if (action === 'package') {
  run(resolve(root, 'desktop/package.mjs'), [], resolve(root, 'desktop'))
}
if (action === 'test') run(resolve(root, 'node_modules/@playwright/test/cli.js'), ['test', '--config=playwright.desktop.config.mjs'])
