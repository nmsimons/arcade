import { packager } from '@electron/packager'
import { join, resolve } from 'node:path'
import { mkdirSync, readFileSync } from 'node:fs'
import { desktopTarget, macSigningOptions } from './packaging.mjs'

const product = JSON.parse(readFileSync(join(import.meta.dirname, 'renderer/release.json'), 'utf8'))
const target = desktopTarget(product)
const temporary = resolve(import.meta.dirname, '../.local/desktop-packager')
mkdirSync(temporary, { recursive: true })

await packager({
  dir: import.meta.dirname,
  out: join(import.meta.dirname, 'out'),
  arch: target.arch, platform: target.platform,
  name: target.name,
  tmpdir: temporary,
  asar: true, overwrite: true,
  executableName: product.executable,
  appBundleId: 'com.dreamlarge.arcade',
  appCategoryType: 'public.app-category.games',
  ...macSigningOptions(target.platform),
  ignore: [/^\/out(?:\/|$)/, /^\/package(?:-lock\.json|\.mjs)$/, /^\/(?:packaging|windows-archive)\.mjs$/],
})
