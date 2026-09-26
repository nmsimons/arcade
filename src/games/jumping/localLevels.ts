import { useEffect, useMemo, useRef, useState } from 'react'
import { decodeLevelFile, loadLocalLevelFiles, orderLevelFiles } from './levelAssets.ts'
import type { LevelFile, LevelManifest, LocalLevelEntry, MissingLevelFile } from './levelAssets.ts'
import type { JumpLevel } from './level.ts'
import { readRememberedFolder, rememberFolder } from './folderStorage.ts'
import { directoryRepository, type LevelRepository } from './levelRepository.ts'
import { readLocalLevelDirectory } from './levelFiles.ts'
import type { LocalDirectory, DeletedLevel } from './levelFiles.ts'
export * from './levelFiles.ts'

type FolderWindow = Window & { showDirectoryPicker?: (options: { id: string; mode: 'readwrite' }) => Promise<LocalDirectory> }
const failure = (error: unknown) => error instanceof Error ? error.message : String(error)
const cancelled = (error: unknown) => error instanceof DOMException && error.name === 'AbortError'

interface FolderState {
  lastRemoved?: { fileName: string; folderId: number }
  manifest?: LevelManifest; manifestSource?: string
  folderId: number; files: LevelFile[]; missing: MissingLevelFile[]; name: string; errors: string[]; busy: boolean; restoring: boolean
  canWrite: boolean; hasHandle: boolean; canRequest: boolean; notice: string
  status: 'closed' | 'ready' | 'reconnect' | 'reselect'
}

export function missingManifestPrompt(local: FolderState) {
  if (local.status !== 'ready' || local.busy || local.canWrite || local.manifestSource !== undefined || local.errors.some(error => error.includes('index.json'))) return ''
  return local.canRequest
    ? 'This folder has no index.json. Enable saving to create it automatically.'
    : 'Open this folder in Chrome or Edge with saving enabled to create index.json. Levels use filename order until then.'
}

/** The selected folder stays on disk. Only an explicit save writes a level file. */
export function useLocalLevels(repository?: LevelRepository | null) {
  const directory = useRef<LocalDirectory | null>(null)
  const picker = useRef<HTMLInputElement>(null)
  const revision = useRef(0)
  const [state, setState] = useState<FolderState>({ folderId: 0, files: [], missing: [], name: '', errors: [], busy: false, restoring: true, canWrite: false, hasHandle: false, canRequest: false, notice: '', status: 'closed' })
  const [trash, setTrash] = useState<{ deleted: DeletedLevel[]; errors: string[] }>({ deleted: [], errors: [] })
  const entries = useMemo(() => orderLevelFiles<LocalLevelEntry>([...state.files, ...state.missing], state.manifest), [state.files, state.missing, state.manifest])

  useEffect(() => {
    let active = true
    const version = revision.current
    const current = () => active && revision.current === version
    async function restore() {
      try {
        if (repository === null) return
        if (repository) {
          const result = await repository.read()
          if (current()) setState(previous => ({ ...previous, ...result, folderId: -1, name: 'Built-in levels', canWrite: true, hasHandle: true, status: 'ready' }))
          return
        }
        const saved = await readRememberedFolder()
        if (!current() || !saved) return
        const handle = saved.handle
        directory.current = handle ?? null
        setState(previous => ({ ...previous, folderId: previous.folderId + 1, name: saved.name, status: handle ? 'reconnect' : 'reselect', hasHandle: !!handle, canRequest: !!handle?.requestPermission }))
        if (!handle) return
        const read = await handle.queryPermission?.({ mode: 'read' })
        if (!current() || read !== 'granted') return
        const canWrite = await handle.queryPermission?.({ mode: 'readwrite' }) === 'granted'
        const result = await readLocalLevelDirectory(handle, canWrite)
        if (current()) setState(previous => ({ ...previous, ...result, canWrite, status: 'ready' }))
      } catch (error) {
        if (current() && (directory.current || repository)) setState(previous => ({ ...previous, errors: [`Could not reopen this folder: ${failure(error)}`] }))
      } finally {
        if (current()) setState(previous => ({ ...previous, restoring: false }))
      }
    }
    void restore()
    return () => { active = false }
  }, [repository])

  function storage() { return repository === null ? null : repository ?? (directory.current ? directoryRepository(directory.current) : null) }
  function begin() {
    const version = ++revision.current
    setState(previous => ({ ...previous, busy: true, restoring: false }))
    return () => revision.current === version
  }
  async function remember(name: string, handle: LocalDirectory | undefined, current: () => boolean) {
    try { await rememberFolder(name, handle) }
    catch {
      // Some browsers can remember the name but cannot serialize a directory handle.
      if (current()) {
        await rememberFolder(name).catch(() => {})
        if (current()) setState(previous => ({ ...previous, notice: 'This folder could not be remembered for automatic access. Choose it again after reloading.' }))
      }
    }
  }
  function adopt(name: string, result: Awaited<ReturnType<typeof readLocalLevelDirectory>>, handle: LocalDirectory | undefined, canWrite: boolean) {
    const changed = directory.current !== (handle ?? null)
    directory.current = handle ?? null
    if (changed) setTrash({ deleted: [], errors: [] })
    setState(previous => ({ ...previous, folderId: previous.folderId + (changed ? 1 : 0), ...result, name, canWrite, hasHandle: !!handle, canRequest: !!handle?.requestPermission, status: 'ready', notice: '' }))
  }
  async function open() {
    if (repository) { await refresh(); return }
    const choose = (window as FolderWindow).showDirectoryPicker
    if (!choose) { picker.current?.click(); return }
    const current = begin()
    try {
      const handle = await choose.call(window, { id: 'jumping-levels', mode: 'readwrite' })
      const result = await readLocalLevelDirectory(handle, true)
      if (!current()) return
      adopt(handle.name, result, handle, true)
      await remember(handle.name, handle, current)
    } catch (error) { if (current() && !cancelled(error)) setState(previous => ({ ...previous, errors: [failure(error)] })) }
    finally { if (current()) setState(previous => ({ ...previous, busy: false })) }
  }
  async function importFolder(list: FileList | null) {
    if (!list?.length) return
    const current = begin()
    try {
      // Match the native directory picker: only direct children, not nested folders.
      const selected = [...list].filter(file => file.webkitRelativePath.split('/').length <= 2)
      const name = list[0].webkitRelativePath.split('/')[0] || 'Local levels'
      const result = await loadLocalLevelFiles(selected)
      if (!current()) return
      adopt(name, result, undefined, false)
      await remember(name, undefined, current)
    } catch (error) { if (current()) setState(previous => ({ ...previous, errors: [failure(error)] })) }
    finally { if (current()) setState(previous => ({ ...previous, busy: false })); if (picker.current) picker.current.value = '' }
  }
  async function reconnect() {
    if (repository) { await refresh(); return }
    const handle = directory.current
    if (!handle?.requestPermission) { await open(); return }
    const current = begin()
    try {
      // Request access directly in the click handler, while user activation is available.
      const canWrite = await handle.requestPermission({ mode: 'readwrite' }) === 'granted'
      const canRead = canWrite || await handle.queryPermission?.({ mode: 'read' }) === 'granted'
      if (!current()) return
      if (!canRead) {
        setState(previous => ({ ...previous, files: [], missing: [], canWrite: false, status: 'reconnect', notice: 'Access was not granted. Reconnect to try again, or choose another folder.' }))
        return
      }
      const result = await readLocalLevelDirectory(handle, canWrite)
      if (current()) adopt(handle.name, result, handle, canWrite)
    } catch (error) { if (current() && !cancelled(error)) setState(previous => ({ ...previous, errors: [failure(error)] })) }
    finally { if (current()) setState(previous => ({ ...previous, busy: false })) }
  }
  async function refresh() {
    const backend = storage()
    if (!backend) { picker.current?.click(); return }
    const current = begin()
    try {
      const result = await backend.read(state.canWrite)
      if (current()) setState(previous => ({ ...previous, ...result, status: 'ready', ...(repository ? { folderId: -1, name: 'Built-in levels', canWrite: true, hasHandle: true } : {}) }))
    } catch (error) { if (current()) setState(previous => ({ ...previous, files: [], missing: [], canWrite: false, status: 'reconnect', errors: [failure(error)] })) }
    finally { if (current()) setState(previous => ({ ...previous, busy: false })) }
  }
  async function save(fileName: string, level: JumpLevel, expected?: string, previousName = fileName) {
    if (!storage() || !state.canWrite) throw new Error('Choose a writable level folder before saving.')
    const current = begin()
    try {
      const { text, manifest, manifestSource } = await storage()!.save(fileName, level, expected, previousName)
      const next = { fileName, level: decodeLevelFile(text), sourceText: text }
      if (current()) setState(previous => ({ ...previous, manifest, manifestSource, missing: previous.missing.filter(f => f.fileName !== fileName && f.fileName !== previousName), files: orderLevelFiles([...previous.files.filter(f => f.fileName !== fileName && f.fileName !== previousName), next], manifest), errors: [] }))
      return text
    } finally { if (current()) setState(previous => ({ ...previous, busy: false })) }
  }
  async function reorder(files: LocalLevelEntry[], order: 'filename' | 'listed' = 'listed') {
    if (!storage() || !state.canWrite) throw new Error('Choose a writable level folder before saving the order.')
    const current = begin()
    try {
      const result = await storage()!.reorder(files, state.manifestSource, order)
      if (current()) setState(previous => ({ ...previous, ...result, files: orderLevelFiles(files.filter((file): file is LevelFile => 'level' in file), result.manifest) }))
      return result
    } finally { if (current()) setState(previous => ({ ...previous, busy: false })) }
  }
  async function remove(entry: LocalLevelEntry) {
    if (!storage() || !state.canWrite) throw new Error('Enable saving in this folder before deleting a level.')
    const current = begin()
    try {
      const result = await storage()!.remove(entry, state.manifestSource)
      if (current()) setState(previous => ({ ...previous, ...result, lastRemoved: { fileName: entry.fileName, folderId: previous.folderId }, files: previous.files.filter(file => file.fileName !== entry.fileName), missing: previous.missing.filter(file => file.fileName !== entry.fileName) }))
      return result
    } finally { if (current()) setState(previous => ({ ...previous, busy: false })) }
  }
  async function loadDeleted() {
    if (!storage()) return
    const current = begin()
    try { const result = await storage()!.deleted(); if (current()) setTrash(result) }
    catch (error) { if (current()) setTrash(previous => ({ ...previous, errors: [failure(error)] })) }
    finally { if (current()) setState(previous => ({ ...previous, busy: false })) }
  }
  async function restoreDeleted(entry: DeletedLevel, fileName: string) {
    if (!storage() || !state.canWrite) throw new Error('Enable saving in this folder before restoring a level.')
    if (entry.level && state.files.some(file => file.level.id === entry.level!.id)) throw new Error('This level already exists in the folder. Its recovery copy has been kept.')
    const current = begin()
    try {
      await storage()!.restore(entry, fileName, state.manifestSource)
      const result = await storage()!.read(true)
      if (current()) {
        setState(previous => ({ ...previous, ...result }))
        setTrash(previous => ({ ...previous, deleted: previous.deleted.filter(file => file.directoryName !== entry.directoryName || file.fileName !== entry.fileName) }))
      }
    } finally { if (current()) setState(previous => ({ ...previous, busy: false })) }
  }
  async function deletePermanently(confirmed: DeletedLevel[]) {
    if (!storage() || !state.canWrite) throw new Error('Enable saving in this folder before permanently deleting levels.')
    const current = begin(), backend = storage()!
    try { await backend.empty(confirmed) }
    finally {
      try { const result = await backend.deleted(); if (current()) setTrash(result) }
      catch (error) { if (current()) setTrash(previous => ({ ...previous, errors: [failure(error)] })) }
      if (current()) setState(previous => ({ ...previous, busy: false }))
    }
  }
  return { ...state, repository: !!repository, entries, trash, loadDeleted, restoreDeleted, deletePermanently, reorder, remove, busy: state.busy || state.restoring, picker, open, importFolder, reconnect, refresh, save }
}
export type LocalLevels = ReturnType<typeof useLocalLevels>
