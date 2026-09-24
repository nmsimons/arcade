import { useEffect, useRef, useState } from 'react'
import { decodeLevelFile, isLevelFileName, loadLocalLevelFiles } from './levelAssets.ts'
import type { LevelFile } from './levelAssets.ts'
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
  queryPermission?(options: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
  requestPermission?(options: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
}
type FolderWindow = Window & { showDirectoryPicker?: (options: { id: string; mode: 'readwrite' }) => Promise<LocalDirectory> }
const failure = (error: unknown) => error instanceof Error ? error.message : String(error)
const cancelled = (error: unknown) => error instanceof DOMException && error.name === 'AbortError'
export function levelFileName(name: string) {
  return `${name.replace(/[^a-z0-9 _-]/gi, '').trim() || 'untitled'}.jump-level.json`
}
export async function writeLocalLevel(directory: LocalDirectory, fileName: string, level: JumpLevel, expected?: string) {
  if (!isLevelFileName(fileName)) throw new Error('Use a JSON filename without folder paths, such as 03-my-level.json.')
  const text = JSON.stringify(parseLevel(prepareLevelRopes(level)), null, 2) + '\n'
  let handle: LocalFileHandle | undefined
  try { handle = await directory.getFileHandle(fileName) }
  catch (error) { if (!(error instanceof DOMException) || error.name !== 'NotFoundError') throw error }
  if (handle && await (await handle.getFile()).text() !== expected) throw new Error('This file already exists or changed on disk. Refresh the folder and load that file, or choose a new filename.')
  handle ??= await directory.getFileHandle(fileName, { create: true })
  const writable = await handle.createWritable()
  try { await writable.write(text); await writable.close() }
  catch (error) { await writable.abort().catch(() => {}); throw error }
  return text
}

async function readDirectory(handle: LocalDirectory) {
  const selected: File[] = []
  for await (const entry of handle.values()) if (entry.kind === 'file' && isLevelFileName(entry.name)) selected.push(await entry.getFile())
  return loadLocalLevelFiles(selected)
}

interface FolderState {
  files: LevelFile[]; name: string; errors: string[]; busy: boolean; restoring: boolean
  canWrite: boolean; hasHandle: boolean; canRequest: boolean; notice: string
  status: 'closed' | 'ready' | 'reconnect' | 'reselect'
}

/** The selected folder stays on disk. Only an explicit save writes a level file. */
export function useLocalLevels() {
  const directory = useRef<LocalDirectory | null>(null)
  const picker = useRef<HTMLInputElement>(null)
  const revision = useRef(0)
  const [state, setState] = useState<FolderState>({ files: [], name: '', errors: [], busy: false, restoring: true, canWrite: false, hasHandle: false, canRequest: false, notice: '', status: 'closed' })

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
        setState(previous => ({ ...previous, name: saved.name, status: handle ? 'reconnect' : 'reselect', hasHandle: !!handle, canRequest: !!handle?.requestPermission }))
        if (!handle) return
        const read = await handle.queryPermission?.({ mode: 'read' })
        if (!current() || read !== 'granted') return
        const canWrite = await handle.queryPermission?.({ mode: 'readwrite' }) === 'granted'
        const result = await readDirectory(handle)
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
  function adopt(name: string, result: Awaited<ReturnType<typeof readDirectory>>, handle: LocalDirectory | undefined, canWrite: boolean) {
    directory.current = handle ?? null
    setState(previous => ({ ...previous, ...result, name, canWrite, hasHandle: !!handle, canRequest: !!handle?.requestPermission, status: 'ready', notice: '' }))
  }
  async function open() {
    const choose = (window as FolderWindow).showDirectoryPicker
    if (!choose) { picker.current?.click(); return }
    const current = begin()
    try {
      const handle = await choose.call(window, { id: 'jumping-levels', mode: 'readwrite' })
      const result = await readDirectory(handle)
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
        setState(previous => ({ ...previous, files: [], canWrite: false, status: 'reconnect', notice: 'Access was not granted. Reconnect to try again, or choose another folder.' }))
        return
      }
      const result = await readDirectory(handle)
      if (current()) adopt(handle.name, result, handle, canWrite)
    } catch (error) { if (current() && !cancelled(error)) setState(previous => ({ ...previous, errors: [failure(error)] })) }
    finally { if (current()) setState(previous => ({ ...previous, busy: false })) }
  }
  async function refresh() {
    if (!directory.current) { picker.current?.click(); return }
    const current = begin(), handle = directory.current
    try {
      const result = await readDirectory(handle)
      if (current()) setState(previous => ({ ...previous, ...result, status: 'ready' }))
    } catch (error) { if (current()) setState(previous => ({ ...previous, files: [], canWrite: false, status: 'reconnect', errors: [failure(error)] })) }
    finally { if (current()) setState(previous => ({ ...previous, busy: false })) }
  }
  async function save(fileName: string, level: JumpLevel, expected?: string) {
    if (!directory.current) throw new Error('Open a local folder first to save directly to it. Export is also available.')
    const current = begin()
    try {
      const text = await writeLocalLevel(directory.current, fileName, level, expected)
      const next = { fileName, level: decodeLevelFile(text), sourceText: text }
      if (current()) setState(previous => ({ ...previous, files: [...previous.files.filter(f => f.fileName !== fileName), next].sort((a, b) => a.fileName < b.fileName ? -1 : a.fileName > b.fileName ? 1 : 0), errors: [] }))
      return text
    } finally { if (current()) setState(previous => ({ ...previous, busy: false })) }
  }
  return { ...state, busy: state.busy || state.restoring, picker, open, importFolder, reconnect, refresh, save }
}
export type LocalLevels = ReturnType<typeof useLocalLevels>
