import { levelProblems, parseLevel } from './level.ts'
import type { JumpLevel } from './level.ts'

export interface LevelFile<T extends JumpLevel = JumpLevel> { fileName: string; level: T; sourceText?: string }
export interface LevelCatalog {
  files: LevelFile[]; errors: string[]
}
export const MAX_LEVEL_BYTES = 1_000_000
export const MAX_LEVEL_FILES = 500
export const compareFileNames = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0
export const isLevelFileName = (name: string) => !!name && !/[\\/]/.test(name) && ![...name].some(c => c.charCodeAt(0) < 32) && name.toLowerCase().endsWith('.json') && name !== 'index.json'
export function decodeLevelFile(text: string): JumpLevel {
  if (text.length > MAX_LEVEL_BYTES) throw new Error('Level files must be smaller than 1 MB.')
  return parseLevel(JSON.parse(text))
}
export function playableLevelFile(file: LevelFile) {
  const problems = levelProblems(file.level)
  if (problems.length) throw new Error(problems.join(' '))
  return file
}
/** Filenames determine order; IDs identify records and must be unique within a collection. */
export function collectLevelFiles(results: PromiseSettledResult<LevelFile>[], names: string[]) {
  const files: LevelFile[] = [], errors: string[] = [], ids = new Set<string>()
  for (const [i, result] of results.entries()) {
    if (result.status === 'rejected') { errors.push(`${names[i]}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`); continue }
    if (ids.has(result.value.level.id)) { errors.push(`${names[i]}: another file uses level ID “${result.value.level.id}”. Give each level a unique ID.`); continue }
    ids.add(result.value.level.id); files.push(result.value)
  }
  files.sort((a, b) => compareFileNames(a.fileName, b.fileName))
  return { files, errors }
}
export async function loadLocalLevelFiles(files: readonly File[]) {
  const selected = files.filter(f => isLevelFileName(f.name)).sort((a, b) => compareFileNames(a.name, b.name))
  if (selected.length > MAX_LEVEL_FILES) throw new Error(`Choose a folder with at most ${MAX_LEVEL_FILES} JSON levels.`)
  return collectLevelFiles(await Promise.allSettled(selected.map(async file => {
    if (file.size > MAX_LEVEL_BYTES) throw new Error('Level files must be smaller than 1 MB.')
    const sourceText = await file.text()
    return { fileName: file.name, level: decodeLevelFile(sourceText), sourceText }
  })), selected.map(f => f.name))
}
/** Public assets are fetched afresh, never imported into the JavaScript bundle. */
export async function loadLevelCatalog(base: string, fetchFile: typeof fetch = fetch): Promise<LevelCatalog> {
  const root = `${base.replace(/\/?$/, '/')}levels/jumping/`
  const read = async (path: string) => {
    const response = await fetchFile(root + path, { cache: 'no-store' })
    if (!response.ok) throw new Error(`Could not load ${path} (HTTP ${response.status}).`)
    if (Number(response.headers.get('content-length')) > MAX_LEVEL_BYTES) throw new Error(`${path} exceeds 1 MB.`)
    const text = await response.text()
    if (text.length > MAX_LEVEL_BYTES) throw new Error(`${path} exceeds 1 MB.`)
    return text
  }
  const index = JSON.parse(await read('index.json'))
  const names = (value: unknown): string[] => {
    if (!Array.isArray(value) || value.length > MAX_LEVEL_FILES || value.some(n => typeof n !== 'string' || !isLevelFileName(n)) || new Set(value).size !== value.length) throw new Error('The level index must list unique JSON filenames without paths.')
    return [...value].sort(compareFileNames)
  }
  if (!index || index.version !== 1) throw new Error('The level index is not valid.')
  const files = names(index.levels)
  return collectLevelFiles(await Promise.allSettled(files.map(async fileName => {
    const sourceText = await read(encodeURIComponent(fileName))
    return playableLevelFile({ fileName, level: decodeLevelFile(sourceText), sourceText })
  })), files)
}
