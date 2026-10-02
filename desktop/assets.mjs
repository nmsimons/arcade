import { existsSync, realpathSync, statSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'

export const APP_URL = 'arcade://game/'
const routes = /^\/(?:hard-vacuum|final-approach|no-exit|urban-fire|bumper-ball|sling-load|hello-world|untitled-jumping-game|games)(?:\/|$)/
export function isAppUrl(value) {
  try { const url = new URL(value); return url.protocol === 'arcade:' && url.host === 'game' && !url.username && !url.password }
  catch { return false }
}

/** Serve only installed assets. Missing files stay missing instead of receiving HTML. */
export function assetPath(root, value) {
  if (!isAppUrl(value)) return
  const url = new URL(value)
  const pathname = decodeURIComponent(url.pathname)
  if (pathname.includes('\\') || pathname.includes('\0')) return
  const segments = pathname.split('/').filter(Boolean)
  if (segments.some(part => part === '..' || part === '.' || part.includes(':'))) return
  const target = resolve(root, ...segments)
  const inside = relative(root, target)
  if (isAbsolute(inside) || inside === '..' || inside.startsWith(`..${sep}`)) return
  const file = pathname === '/' || routes.test(pathname) && !pathname.split('/').at(-1).includes('.') ? resolve(root, 'index.html') : target
  if (!existsSync(file) || !statSync(file).isFile()) return
  const actual = relative(realpathSync(root), realpathSync(file))
  if (isAbsolute(actual) || actual === '..' || actual.startsWith(`..${sep}`)) return
  return file
}
