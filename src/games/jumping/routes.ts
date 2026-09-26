export const JUMPING_MENU = '/untitled-jumping-game'
export const JUMPING_BUILDER = `${JUMPING_MENU}/builder`
export const JUMPING_BUILTIN_BUILDER = `${JUMPING_BUILDER}/built-in`
export const JUMPING_PLAYTEST = `${JUMPING_BUILDER}/playtest`
export type LevelSource = 'built-in' | 'local'
type FileRoute = { source: LevelSource; fileName: string }
export type JumpingRoute = { screen: 'menu' } | { screen: 'missing' } | { screen: 'playtest'; file?: FileRoute; draftId?: string }
  | { screen: 'builder'; file?: FileRoute; source?: LevelSource }
  | ({ screen: 'level' } & FileRoute)

export function levelPath(source: LevelSource, fileName: string, edit = false) {
  return `${edit ? JUMPING_BUILDER : `${JUMPING_MENU}/levels`}/${source}/${encodeURIComponent(fileName)}`
}
export function playtestPath(builderPath: string, levelId: string) {
  const route = jumpingRoute(builderPath)
  return route.screen === 'builder' && route.file ? `${builderPath}/playtest` : `${JUMPING_PLAYTEST}/${encodeURIComponent(levelId)}`
}

export function jumpingRoute(pathname: string): JumpingRoute {
  const path = pathname.replace(/\/$/, '')
  if (path === JUMPING_MENU) return { screen: 'menu' }
  if (path === JUMPING_BUILDER) return { screen: 'builder' }
  if (path === JUMPING_BUILTIN_BUILDER) return { screen: 'builder', source: 'built-in' }
  if (path === JUMPING_PLAYTEST) return { screen: 'playtest' }
  const draft = path.match(/^\/untitled-jumping-game\/builder\/playtest\/([^/]+)$/)
  if (draft) {
    try {
      const draftId = decodeURIComponent(draft[1])
      if (draftId && !/[/\\]/.test(draftId)) return { screen: 'playtest', draftId }
    } catch { /* A malformed draft link cannot identify a session snapshot. */ }
    return { screen: 'missing' }
  }
  const match = path.match(/^\/untitled-jumping-game\/(levels|builder)\/(built-in|local)\/([^/]+)(\/playtest)?$/)
  if (match) {
    try {
      const fileName = decodeURIComponent(match[3])
      if (!fileName || /[/\\]/.test(fileName)) return { screen: 'missing' }
      const file = { source: match[2] as LevelSource, fileName }
      if (match[4]) return match[1] === 'builder' ? { screen: 'playtest', file } : { screen: 'missing' }
      return match[1] === 'builder' ? { screen: 'builder', file } : { screen: 'level', ...file }
    } catch { /* Malformed links stay in the level menu. */ }
  }
  return { screen: 'missing' }
}
