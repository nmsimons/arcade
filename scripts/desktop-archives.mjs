import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { desktopTarget } from '../desktop/packaging.mjs'
import { createWindowsArchive } from '../desktop/windows-archive.mjs'

const root = resolve(import.meta.dirname, '..')
const product = JSON.parse(readFileSync(join(root, 'desktop/renderer/release.json'), 'utf8'))
const target = desktopTarget(product)
const packages = join(root, 'desktop/out')
const downloads = join(packages, 'downloads')
mkdirSync(downloads, { recursive: true })
// Keep the existing Steam artifact contract; tar preserves mode bits and links.
execFileSync('tar', ['-czf', join(packages, `arcade-${target.platform}-${target.arch}.tar.gz`), '-C', packages, target.directory], { stdio: 'inherit' })
const archive = join(downloads, target.download)
if (target.platform === 'win32') {
  createWindowsArchive(join(packages, target.directory), archive)
} else if (target.platform === 'linux') {
  execFileSync('tar', ['-czf', archive, '-C', packages, target.directory], { stdio: 'inherit' })
} else if (process.env.ARCADE_MAC_SIGNED === '1') {
  const app = join(packages, target.directory, `${target.name}.app`)
  execFileSync('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app], { stdio: 'inherit' })
  execFileSync('xcrun', ['stapler', 'validate', app], { stdio: 'inherit' })
  execFileSync('spctl', ['--assess', '--type', 'execute', '--verbose=2', app], { stdio: 'inherit' })
  execFileSync('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', app, archive], { stdio: 'inherit' })
}
