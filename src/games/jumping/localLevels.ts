import { useRef, useState } from 'react'
import { decodeLevelFile, isLevelFileName, loadLocalLevelFiles } from './levelAssets.ts'
import type { LevelFile } from './levelAssets.ts'
import { parseLevel, prepareLevelRopes } from './level.ts'
import type { JumpLevel } from './level.ts'

export interface LocalFileHandle {
  kind: 'file'; name: string; getFile(): Promise<File>
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void>; abort(): Promise<void> }>
}
export interface LocalDirectory {
  name: string; values(): AsyncIterable<LocalFileHandle | { kind: 'directory'; name: string }>
  getFileHandle(name: string, options?: { create: boolean }): Promise<LocalFileHandle>
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

/** The selected folder stays on disk. Only an explicit save writes a level file. */
export function useLocalLevels() {
  const directory = useRef<LocalDirectory | null>(null)
  const picker = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<LevelFile[]>([]), [name, setName] = useState('')
  const [errors, setErrors] = useState<string[]>([]), [busy, setBusy] = useState(false)
  const [canWrite, setCanWrite] = useState(false)
  async function readFiles(selected: File[], folderName: string) {
    const result = await loadLocalLevelFiles(selected)
    setFiles(result.files); setErrors(result.errors); setName(folderName)
  }
  async function readDirectory(handle: LocalDirectory) {
    const selected: File[] = []
    for await (const entry of handle.values()) if (entry.kind === 'file' && isLevelFileName(entry.name)) selected.push(await entry.getFile())
    await readFiles(selected, handle.name)
  }
  async function open() {
    const choose = (window as FolderWindow).showDirectoryPicker
    if (!choose) { picker.current?.click(); return }
    try {
      const handle = await choose.call(window, { id: 'jumping-levels', mode: 'readwrite' })
      setBusy(true); await readDirectory(handle); directory.current = handle; setCanWrite(true)
    } catch (error) { if (!cancelled(error)) setErrors([failure(error)]) }
    finally { setBusy(false) }
  }
  async function importFolder(list: FileList | null) {
    if (!list?.length) return
    setBusy(true)
    try {
      // Match the native directory picker: only direct children, not nested folders.
      const selected = [...list].filter(file => file.webkitRelativePath.split('/').length <= 2)
      await readFiles(selected, list[0].webkitRelativePath.split('/')[0] || 'Local levels')
      directory.current = null; setCanWrite(false)
    } catch (error) { setErrors([failure(error)]) }
    finally { setBusy(false); if (picker.current) picker.current.value = '' }
  }
  async function refresh() {
    if (!directory.current) { picker.current?.click(); return }
    setBusy(true)
    try { await readDirectory(directory.current) } catch (error) { setErrors([failure(error)]) }
    finally { setBusy(false) }
  }
  async function save(fileName: string, level: JumpLevel, expected?: string) {
    if (!directory.current) throw new Error('Open a local folder first to save directly to it. Export is also available.')
    setBusy(true)
    try {
      const text = await writeLocalLevel(directory.current, fileName, level, expected)
      const next = { fileName, level: decodeLevelFile(text), sourceText: text }
      setFiles(previous => [...previous.filter(f => f.fileName !== fileName), next].sort((a, b) => a.fileName < b.fileName ? -1 : a.fileName > b.fileName ? 1 : 0))
      setErrors([])
      return text
    } finally { setBusy(false) }
  }
  return { files, name, errors, busy, canWrite, picker, open, importFolder, refresh, save }
}
export type LocalLevels = ReturnType<typeof useLocalLevels>
