import { LEVELS_SLOT, withWorkspaceLock } from './profileStorage.ts'
import type { KeyStorage } from './profileStorage.ts'
import { emptyLibrary, MAX_WORKSPACE_BYTES, readWorkspace, serializeWorkspace, validateLibrary } from './data.ts'
import { decodeLevelFile, decodeLevelManifest, isLevelFileName, loadLocalLevelFiles } from '../games/jumping/levelAssets.ts'
import type { LevelManifest } from '../games/jumping/levelAssets.ts'
import type { LevelRepository } from '../games/jumping/levelRepository.ts'
import type { DeletedLevel } from '../games/jumping/levelFiles.ts'
import { textBytes } from '../games/jumping/levelLimits.ts'
import type { LevelLibrary } from './data.ts'

/** Import the same files as a local/built-in collection, including its index. */
export function importLevelCollection(library: LevelLibrary, incoming: Record<string, string>): LevelLibrary {
  for (const name of Object.keys(incoming)) {
    if (name !== 'index.json' && library.files[name] !== undefined) throw new Error(`“${name}” already exists. Rename the imported file first.`)
  }
  const files = { ...library.files, ...incoming }
  const old = library.files['index.json'] ? decodeLevelManifest(library.files['index.json']) : undefined
  const supplied = incoming['index.json'] ? decodeLevelManifest(incoming['index.json']) : undefined
  const base = supplied ?? old
  const levels = [...new Set([...(base?.levels ?? []), ...(old?.levels ?? []), ...Object.keys(files).filter(isLevelFileName).sort()])]
  if (!base || JSON.stringify(levels) !== JSON.stringify(base.levels)) files['index.json'] = JSON.stringify({ ...base, version: 1, order: base?.order ?? 'filename', levels }, null, 2) + '\n'
  return validateLibrary({ files, deleted: library.deleted })
}

export function accountLevelRepository(store: KeyStorage): LevelRepository {
  const read = (current: KeyStorage) => validateLibrary(JSON.parse(current.getItem(LEVELS_SLOT) ?? JSON.stringify(emptyLibrary())))
  const manifest = (files: Record<string, string>) => ({ manifestSource: files['index.json'], manifest: files['index.json'] ? decodeLevelManifest(files['index.json']) : undefined })
  const check = (actual: string | undefined, expected: string | undefined) => { if (actual !== expected) throw new Error('These account levels changed in another tab. Refresh before saving.') }
  function save(data: ReturnType<typeof read>, current: KeyStorage) {
    validateLibrary(data)
    if (textBytes(serializeWorkspace({ ...readWorkspace(current), levels: data })) > MAX_WORKSPACE_BYTES) throw new Error('Account saves and levels must fit within 4 MB. Export some levels to a local folder to free space.')
    current.setItem(LEVELS_SLOT, JSON.stringify(data))
  }
  function index(files: Record<string, string>, levels: string[], order: 'filename' | 'listed' = 'listed') {
    const previous = manifest(files).manifest
    const value: LevelManifest = { ...previous, version: 1, order, levels }
    files['index.json'] = JSON.stringify(value, null, 2) + '\n'
    return manifest(files)
  }
  function checkName(name: string) { if (!isLevelFileName(name) || name.length > 200) throw new Error('Use a JSON filename without folder paths (up to 200 characters).') }
  function recovery(data: ReturnType<typeof read>, entry: DeletedLevel) {
    const item = data.deleted.find(item => item.id === entry.directoryName && item.name === entry.fileName)
    if (!item || item.text !== entry.sourceText) throw new Error('The recycle bin changed. Refresh before continuing.')
    return item
  }
  return {
    async read() {
      const data = await withWorkspaceLock(store, read)
      return loadLocalLevelFiles(Object.entries(data.files).map(([name, text]) => ({ name, size: textBytes(text), text: async () => text })))
    },
    async save(name, level, expected, previousName = name) {
      return withWorkspaceLock(store, current => {
        checkName(name); checkName(previousName)
        const data = read(current), renaming = previousName !== name
        if (data.files[name] !== undefined && (renaming || expected === undefined)) throw new Error(`“${name}” already exists in your account levels. Choose a different File name in Level settings and save again.`)
        check(data.files[previousName], expected)
        const text = JSON.stringify(level, null, 2) + '\n'
        decodeLevelFile(text)
        const old = manifest(data.files).manifest
        data.files[name] = text
        if (renaming) delete data.files[previousName]
        const result = index(data.files, [...new Set([...(old?.levels ?? Object.keys(data.files).filter(isLevelFileName)).map(n => n === previousName ? name : n), name])], old?.order ?? 'filename')
        save(data, current)
        return { text, ...result }
      })
    },
    async reorder(files, expected, order = 'listed') {
      return withWorkspaceLock(store, current => {
        const data = read(current); check(data.files['index.json'], expected)
        const old = manifest(data.files).manifest, names = files.map(file => file.fileName)
        const result = index(data.files, [...names, ...(old?.levels ?? []).filter(n => !names.includes(n))], order)
        save(data, current); return { manifest: result.manifest!, manifestSource: result.manifestSource! }
      })
    },
    async remove(entry, expectedManifest) {
      return withWorkspaceLock(store, current => {
        const data = read(current); check(data.files['index.json'], expectedManifest)
        check(data.files[entry.fileName], 'sourceText' in entry ? entry.sourceText : undefined)
        if (data.files[entry.fileName] !== undefined) {
          data.deleted.push({ id: crypto.randomUUID(), name: entry.fileName, text: data.files[entry.fileName], at: new Date().toISOString() })
          delete data.files[entry.fileName]
        }
        const old = manifest(data.files).manifest
        const result = index(data.files, (old?.levels ?? Object.keys(data.files).filter(isLevelFileName)).filter(n => n !== entry.fileName), old?.order ?? 'filename')
        save(data, current); return { ...result, recoveryPath: 'Account recycle bin' }
      })
    },
    async deleted() {
      const data = await withWorkspaceLock(store, read)
      return { errors: [], deleted: data.deleted.map(item => ({ directoryName: item.id, fileName: item.name, sourceText: item.text, deletedAt: item.at, level: decodeLevelFile(item.text) })).sort((a, b) => b.deletedAt.localeCompare(a.deletedAt)) }
    },
    async restore(entry, name, expectedManifest) {
      return withWorkspaceLock(store, current => {
        checkName(name)
        const data = read(current); check(data.files['index.json'], expectedManifest)
        const item = recovery(data, entry)
        if (data.files[name] !== undefined) throw new Error('That filename already exists. Choose another name.')
        data.files[name] = item.text; data.deleted = data.deleted.filter(saved => saved.id !== item.id)
        const old = manifest(data.files).manifest
        const result = index(data.files, [...new Set([...(old?.levels ?? Object.keys(data.files).filter(isLevelFileName)), name])], old?.order ?? 'filename')
        save(data, current); return result
      })
    },
    async empty(entries) {
      return withWorkspaceLock(store, current => {
        const data = read(current)
        const ids = new Set(entries.map(entry => recovery(data, entry).id))
        data.deleted = data.deleted.filter(item => !ids.has(item.id)); save(data, current)
      })
    },
  }
}
