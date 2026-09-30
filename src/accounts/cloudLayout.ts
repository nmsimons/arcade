import { emptyWorkspace, parseWorkspace, serializeWorkspace } from './data.ts'
import type { Workspace } from './data.ts'
import { isLevelFileName } from '../games/jumping/levelAssets.ts'

export const GAME_FOLDERS = ['Hard Vacuum', 'Untitled Jumping Game'] as const
export const LEVEL_FOLDER = 'Untitled Jumping Game/Levels'
const slots: Record<string, string> = {
  'hard-vacuum-expedition-v1': 'Hard Vacuum/expedition.json',
  'hard-vacuum-expedition-v1-backup': 'Hard Vacuum/expedition.backup.json',
  'hard-vacuum-expedition-v1-unreadable': 'Hard Vacuum/expedition.unreadable.json',
  'arcade.jumping.times.v1': 'Untitled Jumping Game/personal-bests.json',
}
const deletedDirectory = /^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)-([a-zA-Z0-9-]{1,100})$/
export const isDeletedDirectory = (name: string) => deletedDirectory.test(name)
export function portablePath(path: string) {
  if (path.split('/').some(part => !part || part === '.' || part === '..' || /[\\:*?"<>|]/.test(part) || /[. ]$/.test(part) || [...part].some(c => c.charCodeAt(0) < 32))) throw new Error(`“${path}” cannot be used as a portable cloud filename. Rename it before syncing.`)
  return path
}
export function isGameFile(path: string) {
  if (Object.values(slots).includes(path)) return true
  const parts = path.split('/')
  return parts[0] === GAME_FOLDERS[1] && parts[1] === 'Levels' && (
    parts.length === 3 && (parts[2] === 'index.json' || isLevelFileName(parts[2])) ||
    parts.length === 5 && parts[2] === 'Deleted levels' && isDeletedDirectory(parts[3]) && isLevelFileName(parts[4]))
}
/** Actual level/manifest bytes, never a JSON string embedded in another file. */
export function workspaceFiles(data: Workspace): Map<string, string> {
  const files = new Map<string, string>()
  for (const [slot, path] of Object.entries(slots)) if (data.slots[slot] !== undefined) files.set(path, data.slots[slot])
  for (const [name, text] of Object.entries(data.levels.files)) files.set(`${LEVEL_FOLDER}/${name}`, text)
  for (const item of data.levels.deleted) files.set(`${LEVEL_FOLDER}/Deleted levels/${new Date(item.at).toISOString().replace(/[:.]/g, '-')}-${item.id}/${item.name}`, item.text)
  const names = new Set<string>()
  for (const path of files.keys()) {
    portablePath(path)
    const folded = path.toLowerCase()
    if (names.has(folded)) throw new Error('Cloud filenames must be unique regardless of capitalization. Rename the conflicting files before syncing.')
    names.add(folded)
  }
  return files
}
export function filesWorkspace(files: ReadonlyMap<string, string>): Workspace {
  const data = emptyWorkspace(), keys = new Map(Object.entries(slots).map(([key, path]) => [path, key]))
  for (const [path, text] of files) {
    portablePath(path)
    if (!isGameFile(path)) throw new Error('Unrecognized game data path.')
    const slot = keys.get(path)
    if (slot) data.slots[slot] = text
    else {
      const parts = path.split('/')
      if (parts.length === 3) data.levels.files[parts[2]] = text
      else {
        const match = deletedDirectory.exec(parts[3])!
        const at = match[1].slice(0, 23).replace(/T(\d{2})-(\d{2})-(\d{2})-/, 'T$1:$2:$3.') + 'Z'
        data.levels.deleted.push({ id: match[2], at, name: parts[4], text })
      }
    }
  }
  return parseWorkspace(serializeWorkspace(data))
}
