export const JUMPING_MENU = '/untitled-jumping-game'
export const JUMPING_BUILDER = `${JUMPING_MENU}/builder`
export const JUMPING_PLAYTEST = `${JUMPING_BUILDER}/playtest`
export type LevelSource = 'built-in' | 'local'
type FileRoute = { source: LevelSource; fileName: string }
export type JumpingRoute = { screen: 'menu' } | { screen: 'missing' } | { screen: 'playtest' }
  | { screen: 'builder'; file?: FileRoute }
  | ({ screen: 'level' } & FileRoute)

export function levelPath(source: LevelSource, fileName: string, edit = false) {
  return `${edit ? JUMPING_BUILDER : `${JUMPING_MENU}/levels`}/${source}/${encodeURIComponent(fileName)}`
}

export function jumpingRoute(pathname: string): JumpingRoute {
  const path = pathname.replace(/\/$/, '')
  if (path === JUMPING_MENU) return { screen: 'menu' }
  if (path === JUMPING_BUILDER) return { screen: 'builder' }
  if (path === JUMPING_PLAYTEST) return { screen: 'playtest' }
  const match = path.match(/^\/untitled-jumping-game\/(levels|builder)\/(built-in|local)\/([^/]+)$/)
  if (match) {
    try {
      const fileName = decodeURIComponent(match[3])
      if (!fileName || /[/\\]/.test(fileName)) return { screen: 'missing' }
      const file = { source: match[2] as LevelSource, fileName }
      return match[1] === 'builder' ? { screen: 'builder', file } : { screen: 'level', ...file }
    } catch { /* Malformed links stay in the level menu. */ }
  }
  return { screen: 'missing' }
}
