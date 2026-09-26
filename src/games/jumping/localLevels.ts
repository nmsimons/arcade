import { useEffect, useMemo, useRef, useState } from 'react'
import { compareFileNames, decodeLevelManifest, orderLevelFiles, decodeLevelFile, isLevelFileName, loadLocalLevelFiles } from './levelAssets.ts'
import type { LevelFile, LevelManifest, LocalLevelEntry, MissingLevelFile } from './levelAssets.ts'
import { parseLevel, prepareLevelRopes } from './level.ts'
import type { JumpLevel } from './level.ts'
import { readRememberedFolder, rememberFolder } from './folderStorage.ts'

export interface LocalFileHandle {
  kind: 'file'; name: string; getFile(): Promise<File>
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void>; abort(): Promise<void> }>
}
export interface LocalDirectory {
  kind?: 'directory'
  name: string; values(): AsyncIterable<LocalFileHandle | { kind: 'directory'; name: string }>
  getFileHandle(name: string, options?: { create: boolean }): Promise<LocalFileHandle>
  getDirectoryHandle(name: string, options?: { create: boolean }): Promise<LocalDirectory>
  removeEntry(name: string): Promise<void>
  queryPermission?(options: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
  requestPermission?(options: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
}
type FolderWindow = Window & { showDirectoryPicker?: (options: { id: string; mode: 'readwrite' }) => Promise<LocalDirectory> }
const failure = (error: unknown) => error instanceof Error ? error.message : String(error)
const cancelled = (error: unknown) => error instanceof DOMException && error.name === 'AbortError'
export function levelFileName(name: string) {
  return `${name.replace(/[^a-z0-9 _-]/gi, '').trim().replace(/\s+/g, ' ') || 'untitled'}.jump-level.json`
}
const conflict = () => new Error('This file already exists or changed on disk. Refresh the folder and open the latest file before saving.')
async function findFile(directory: LocalDirectory, name: string) {
  try { return await directory.getFileHandle(name) }
  catch (error) { if (!(error instanceof DOMException) || error.name !== 'NotFoundError') throw error }
}
async function writeText(handle: LocalFileHandle, text: string) {
  const writable = await handle.createWritable()
  try { await writable.write(text); await writable.close() }
  catch (error) { await writable.abort().catch(() => {}); throw error }
}
async function unchanged(handle: LocalFileHandle | undefined, expected: string | undefined) {
  if (!handle || expected === undefined || await (await handle.getFile()).text() !== expected) throw conflict()
}
async function readManifest(directory: LocalDirectory) {
  const handle = await findFile(directory, 'index.json')
  const manifestSource = handle ? await (await handle.getFile()).text() : undefined
  return { handle, manifestSource, manifest: manifestSource === undefined ? undefined : decodeLevelManifest(manifestSource) }
}
export async function writeLocalLevel(directory: LocalDirectory, fileName: string, level: JumpLevel, expected?: string, previousName = fileName) {
  if (!isLevelFileName(fileName) || !isLevelFileName(previousName)) throw new Error('Use a JSON filename without folder paths, such as my-level.json.')
  const text = JSON.stringify(parseLevel(prepareLevelRopes(level)), null, 2) + '\n'
  const renaming = previousName !== fileName
  const original = renaming ? await findFile(directory, previousName) : undefined
  if (renaming) await unchanged(original, expected)
  let target = await findFile(directory, fileName)
  if (target) {
    if (renaming) throw conflict()
    await unchanged(target, expected)
  } else if (!renaming && expected !== undefined) throw conflict()
  const index = await readManifest(directory)
  let manifest = index.manifest, manifestSource = index.manifestSource
  if (manifest) {
    const levels = [...new Set(manifest.levels.map(name => name === previousName ? fileName : name))]
    if (!levels.includes(fileName)) levels.push(fileName)
    if (JSON.stringify(levels) !== JSON.stringify(manifest.levels)) {
      manifest = { ...manifest, levels }; manifestSource = JSON.stringify(manifest, null, 2) + '\n'
    }
  }
  const creating = !target
  let indexWritten = false, levelWritten = false
  target ??= await directory.getFileHandle(fileName, { create: true })
  try {
    await writeText(target, text); levelWritten = true
    if (renaming) await unchanged(original, expected)
    if (manifestSource !== index.manifestSource) {
      await unchanged(index.handle, index.manifestSource)
      await writeText(index.handle!, manifestSource!); indexWritten = true
    }
    // The original remains intact until both the level and its manifest entry are saved.
    if (renaming) { await unchanged(original, expected); await directory.removeEntry(previousName) }
  } catch (error) {
    const incomplete: string[] = []
    if (indexWritten) {
      try { await unchanged(index.handle, manifestSource); await writeText(index.handle!, index.manifestSource!) }
      catch { incomplete.push('index.json') }
    }
    try {
      if (creating) {
        const current = await (await target.getFile()).text()
        if (current === text || current === '') await directory.removeEntry(fileName)
        else incomplete.push(fileName)
      } else if (levelWritten && expected !== undefined) { await unchanged(target, text); await writeText(target, expected) }
    } catch { incomplete.push(fileName) }
    if (incomplete.length) throw new Error(`${failure(error)} Could not fully restore: ${incomplete.join(', ')}. Refresh the folder before retrying.`)
    throw error
  }
  return { text, manifest, manifestSource }
}

/** Presentation changes write the manifest only; level files remain byte-for-byte intact. */
export async function writeLevelOrder(directory: LocalDirectory, files: Pick<LevelFile, 'fileName'>[], expected?: string, order: 'filename' | 'listed' = 'listed') {
  const index = await readManifest(directory)
  if (index.manifestSource !== expected) throw new Error('index.json changed on disk. Refresh the folder before saving the order.')
  // Retain references to temporarily missing or invalid levels, after the visible sequence.
  const visible = files.map(file => file.fileName)
  const levels = [...visible, ...(index.manifest?.levels ?? []).filter(name => !visible.includes(name))]
  const manifest: LevelManifest = { ...index.manifest, version: 1, order, levels }
  const manifestSource = JSON.stringify(manifest, null, 2) + '\n'
  decodeLevelManifest(manifestSource)
  const handle = index.handle ?? await directory.getFileHandle('index.json', { create: true })
  try { await writeText(handle, manifestSource) }
  catch (error) {
    if (!index.handle) {
      try { if (await (await handle.getFile()).text() === '') await directory.removeEntry('index.json') }
      catch { throw new Error(`${failure(error)} Could not remove the incomplete index.json. Refresh the folder before retrying.`) }
    }
    throw error
  }
  return { manifest, manifestSource }
}

/** Keep a verified recovery copy before deleting; browser deletion has no trash option. */
export async function deleteLocalLevel(directory: LocalDirectory, entry: LocalLevelEntry, expectedManifest?: string) {
  if (!isLevelFileName(entry.fileName)) throw new Error('Use a level filename without folder paths.')
  const index = await readManifest(directory)
  if (index.manifestSource !== expectedManifest) throw new Error('index.json changed on disk. Refresh the folder before deleting.')
  const original = await findFile(directory, entry.fileName)
  if ('missing' in entry && original) throw new Error('This file is back in the folder. Refresh before deleting it.')
  const expected = 'level' in entry ? entry.sourceText : undefined
  if (original) await unchanged(original, expected)
  let recoveryPath: string | undefined
  if (original) {
    const deleted = await directory.getDirectoryHandle('Deleted levels', { create: true })
    const stamp = `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID()}`
    const recovery = await deleted.getDirectoryHandle(stamp, { create: true })
    const backup = await recovery.getFileHandle(entry.fileName, { create: true })
    await writeText(backup, expected!)
    await unchanged(backup, expected)
    recoveryPath = `Deleted levels/${stamp}/${entry.fileName}`
  }
  const manifest = index.manifest ? { ...index.manifest, levels: index.manifest.levels.filter(name => name !== entry.fileName) } : undefined
  const manifestSource = manifest ? JSON.stringify(manifest, null, 2) + '\n' : undefined
  let indexWritten = false
  try {
    if (original) await unchanged(original, expected)
    if (index.handle) {
      await unchanged(index.handle, index.manifestSource)
      await writeText(index.handle, manifestSource!); indexWritten = true
    }
    // A missing entry must never delete a file restored while the dialog was open.
    if (!original && await findFile(directory, entry.fileName)) throw new Error('This file is back in the folder. Refresh before deleting it.')
    if (original) { await unchanged(original, expected); await directory.removeEntry(entry.fileName) }
  } catch (error) {
    if (indexWritten) {
      try { await unchanged(index.handle, manifestSource); await writeText(index.handle!, index.manifestSource!) }
      catch { throw new Error(`${failure(error)} Could not restore index.json. Refresh the folder.${recoveryPath ? ` Recovery copy: ${recoveryPath}` : ''}`) }
    }
    throw new Error(`${failure(error)}${recoveryPath ? ` Recovery copy kept in ${recoveryPath}.` : ''}`)
  }
  return { manifest, manifestSource, recoveryPath }
}

export interface DeletedLevel {
  directoryName: string; fileName: string; sourceText: string; deletedAt: string; level?: JumpLevel
}
const recoveryDirectory = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i
async function findDirectory(directory: LocalDirectory, name: string) {
  try { return await directory.getDirectoryHandle(name) }
  catch (error) { if (!(error instanceof DOMException) || error.name !== 'NotFoundError') throw error }
}
export async function readDeletedLevels(directory: LocalDirectory) {
  const deleted: DeletedLevel[] = [], errors: string[] = []
  const bin = await findDirectory(directory, 'Deleted levels')
  if (!bin) return { deleted, errors }
  for await (const item of bin.values()) {
    if (item.kind !== 'directory' || !recoveryDirectory.test(item.name)) continue
    try {
      const recovery = await bin.getDirectoryHandle(item.name)
      for await (const file of recovery.values()) {
        if (file.kind !== 'file' || !isLevelFileName(file.name)) continue
        const source = await file.getFile()
        if (source.size > 1_000_000) { errors.push(`${file.name} exceeds 1 MB.`); continue }
        const sourceText = await source.text()
        let level: JumpLevel | undefined
        try { level = decodeLevelFile(sourceText) } catch { /* Raw files remain recoverable even if their format needs repair. */ }
        deleted.push({ directoryName: item.name, fileName: file.name, sourceText, level, deletedAt: item.name.slice(0, 23).replace(/T(\d{2})-(\d{2})-(\d{2})-/, 'T$1:$2:$3.') + 'Z' })
      }
    } catch (error) { errors.push(`${item.name}: ${failure(error)}`) }
  }
  deleted.sort((a, b) => compareFileNames(b.directoryName, a.directoryName) || compareFileNames(a.fileName, b.fileName))
  return { deleted, errors }
}
async function recoveryFile(directory: LocalDirectory, entry: DeletedLevel) {
  if (!recoveryDirectory.test(entry.directoryName) || !isLevelFileName(entry.fileName)) throw new Error('Invalid recycle bin entry.')
  const bin = await directory.getDirectoryHandle('Deleted levels')
  const folder = await bin.getDirectoryHandle(entry.directoryName), file = await folder.getFileHandle(entry.fileName)
  await unchanged(file, entry.sourceText)
  return { bin, folder, file }
}
async function removeRecoveryFile(directory: LocalDirectory, entry: DeletedLevel) {
  const { bin, folder } = await recoveryFile(directory, entry)
  await folder.removeEntry(entry.fileName)
  try { await bin.removeEntry(entry.directoryName) }
  catch { /* Empty-folder cleanup is optional; never recursively delete other files or roll back a completed restore. */ }
}
export async function restoreDeletedLevel(directory: LocalDirectory, entry: DeletedLevel, fileName: string, expectedManifest?: string) {
  if (!isLevelFileName(fileName)) throw new Error('Use a JSON filename without folder paths.')
  await recoveryFile(directory, entry)
  if (await findFile(directory, fileName)) throw new Error(`“${fileName}” already exists. Choose another filename or cancel.`)
  const index = await readManifest(directory)
  if (index.manifestSource !== expectedManifest) throw new Error('index.json changed on disk. Refresh the folder before restoring.')
  const manifest = index.manifest ? { ...index.manifest, levels: [...new Set([...index.manifest.levels, fileName])] } : undefined
  const manifestSource = manifest ? JSON.stringify(manifest, null, 2) + '\n' : undefined
  const target = await directory.getFileHandle(fileName, { create: true })
  let indexWritten = false
  try {
    await writeText(target, entry.sourceText)
    if (index.handle) {
      await unchanged(index.handle, index.manifestSource)
      await writeText(index.handle, manifestSource!); indexWritten = true
    }
    await unchanged(target, entry.sourceText)
    await removeRecoveryFile(directory, entry)
  } catch (error) {
    const incomplete: string[] = []
    if (indexWritten) {
      try { await unchanged(index.handle, manifestSource); await writeText(index.handle!, index.manifestSource!) }
      catch { incomplete.push('index.json') }
    }
    try { const text = await (await target.getFile()).text(); if (text === entry.sourceText || text === '') await directory.removeEntry(fileName); else incomplete.push(fileName) }
    catch { incomplete.push(fileName) }
    throw new Error(`${failure(error)}${incomplete.length ? ` Could not fully roll back: ${incomplete.join(', ')}. Refresh the folder.` : ''}`)
  }
  return { manifest, manifestSource }
}
export async function emptyDeletedLevels(directory: LocalDirectory, entries: DeletedLevel[]) {
  // Check the confirmed snapshot before removing anything, then check each file again.
  for (const entry of entries) await recoveryFile(directory, entry)
  for (const entry of entries) await removeRecoveryFile(directory, entry)
}

export async function readLocalLevelDirectory(handle: LocalDirectory, canWrite = false) {
  const selected: File[] = []
  for await (const entry of handle.values()) if (entry.kind === 'file' && (isLevelFileName(entry.name) || entry.name === 'index.json')) selected.push(await entry.getFile())
  const result = await loadLocalLevelFiles(selected)
  if (canWrite && !selected.some(file => file.name === 'index.json')) {
    try {
      // Include files needing repair so the manifest describes the whole collection.
      const files = selected.map(file => ({ fileName: file.name })).sort((a, b) => compareFileNames(a.fileName, b.fileName))
      Object.assign(result, await writeLevelOrder(handle, files, undefined, 'filename'))
    } catch (error) {
      result.errors.push(`Could not create index.json: ${failure(error)} Refresh the folder to retry.`)
    }
  }
  return result
}

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
export function useLocalLevels() {
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
        if (current() && directory.current) setState(previous => ({ ...previous, errors: [`Could not reopen this folder: ${failure(error)}`] }))
      } finally {
        if (current()) setState(previous => ({ ...previous, restoring: false }))
      }
    }
    void restore()
    return () => { active = false }
  }, [])

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
    if (!directory.current) { picker.current?.click(); return }
    const current = begin(), handle = directory.current
    try {
      const result = await readLocalLevelDirectory(handle, state.canWrite)
      if (current()) setState(previous => ({ ...previous, ...result, status: 'ready' }))
    } catch (error) { if (current()) setState(previous => ({ ...previous, files: [], missing: [], canWrite: false, status: 'reconnect', errors: [failure(error)] })) }
    finally { if (current()) setState(previous => ({ ...previous, busy: false })) }
  }
  async function save(fileName: string, level: JumpLevel, expected?: string, previousName = fileName) {
    if (!directory.current || !state.canWrite) throw new Error('Choose a writable level folder before saving.')
    const current = begin()
    try {
      const { text, manifest, manifestSource } = await writeLocalLevel(directory.current, fileName, level, expected, previousName)
      const next = { fileName, level: decodeLevelFile(text), sourceText: text }
      if (current()) setState(previous => ({ ...previous, manifest, manifestSource, missing: previous.missing.filter(f => f.fileName !== fileName && f.fileName !== previousName), files: orderLevelFiles([...previous.files.filter(f => f.fileName !== fileName && f.fileName !== previousName), next], manifest), errors: [] }))
      return text
    } finally { if (current()) setState(previous => ({ ...previous, busy: false })) }
  }
  async function reorder(files: LocalLevelEntry[], order: 'filename' | 'listed' = 'listed') {
    if (!directory.current || !state.canWrite) throw new Error('Choose a writable level folder before saving the order.')
    const current = begin()
    try {
      const result = await writeLevelOrder(directory.current, files, state.manifestSource, order)
      if (current()) setState(previous => ({ ...previous, ...result, files: orderLevelFiles(files.filter((file): file is LevelFile => 'level' in file), result.manifest) }))
      return result
    } finally { if (current()) setState(previous => ({ ...previous, busy: false })) }
  }
  async function remove(entry: LocalLevelEntry) {
    if (!directory.current || !state.canWrite) throw new Error('Enable saving in this folder before deleting a level.')
    const current = begin()
    try {
      const result = await deleteLocalLevel(directory.current, entry, state.manifestSource)
      if (current()) setState(previous => ({ ...previous, ...result, lastRemoved: { fileName: entry.fileName, folderId: previous.folderId }, files: previous.files.filter(file => file.fileName !== entry.fileName), missing: previous.missing.filter(file => file.fileName !== entry.fileName) }))
      return result
    } finally { if (current()) setState(previous => ({ ...previous, busy: false })) }
  }
  async function loadDeleted() {
    if (!directory.current) return
    const current = begin()
    try { const result = await readDeletedLevels(directory.current); if (current()) setTrash(result) }
    catch (error) { if (current()) setTrash(previous => ({ ...previous, errors: [failure(error)] })) }
    finally { if (current()) setState(previous => ({ ...previous, busy: false })) }
  }
  async function restoreDeleted(entry: DeletedLevel, fileName: string) {
    if (!directory.current || !state.canWrite) throw new Error('Enable saving in this folder before restoring a level.')
    if (entry.level && state.files.some(file => file.level.id === entry.level!.id)) throw new Error('This level already exists in the folder. Its recovery copy has been kept.')
    const current = begin()
    try {
      await restoreDeletedLevel(directory.current, entry, fileName, state.manifestSource)
      const result = await readLocalLevelDirectory(directory.current, true)
      if (current()) {
        setState(previous => ({ ...previous, ...result }))
        setTrash(previous => ({ ...previous, deleted: previous.deleted.filter(file => file.directoryName !== entry.directoryName || file.fileName !== entry.fileName) }))
      }
    } finally { if (current()) setState(previous => ({ ...previous, busy: false })) }
  }
  async function deletePermanently(confirmed: DeletedLevel[]) {
    if (!directory.current || !state.canWrite) throw new Error('Enable saving in this folder before permanently deleting levels.')
    const current = begin(), handle = directory.current
    try { await emptyDeletedLevels(handle, confirmed) }
    finally {
      try { const result = await readDeletedLevels(handle); if (current()) setTrash(result) }
      catch (error) { if (current()) setTrash(previous => ({ ...previous, errors: [failure(error)] })) }
      if (current()) setState(previous => ({ ...previous, busy: false }))
    }
  }
  return { ...state, entries, trash, loadDeleted, restoreDeleted, deletePermanently, reorder, remove, busy: state.busy || state.restoring, picker, open, importFolder, reconnect, refresh, save }
}
export type LocalLevels = ReturnType<typeof useLocalLevels>
