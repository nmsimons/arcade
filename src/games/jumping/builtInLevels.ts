import { useEffect, useMemo, useRef, useState } from 'react'
import { decodeLevelFile, orderLevelFiles } from './levelAssets.ts'
import type { LevelFile, LevelManifest, LocalLevelEntry, MissingLevelFile } from './levelAssets.ts'
import type { JumpLevel } from './level.ts'
import type { LevelRepository } from './levelRepository.ts'
import type { DeletedLevel } from './levelFiles.ts'

const failure = (error: unknown) => error instanceof Error ? error.message : String(error)
interface BuiltInState {
  lastRemoved?: { fileName: string }
  manifest?: LevelManifest; manifestSource?: string
  files: LevelFile[]; missing: MissingLevelFile[]; errors: string[]; busy: boolean; restoring: boolean; canWrite: boolean
}
/** Only the localhost development repository can author the shipped collection. */
export function useBuiltInLevels(repository?: LevelRepository) {
  const revision = useRef(0)
  const [refreshing, setRefreshing] = useState(false)
  const [state, setState] = useState<BuiltInState>({ files: [], missing: [], errors: [], busy: false, restoring: !!repository, canWrite: false })
  const [trash, setTrash] = useState<{ deleted: DeletedLevel[]; errors: string[] }>({ deleted: [], errors: [] })
  const entries = useMemo(() => orderLevelFiles<LocalLevelEntry>([...state.files, ...state.missing], state.manifest), [state.files, state.missing, state.manifest])
  useEffect(() => {
    if (!repository) return
    let active = true
    void repository.read().then(result => {
      if (active) setState(previous => ({ ...previous, ...result, canWrite: true, restoring: false }))
    }, error => {
      if (active) setState(previous => ({ ...previous, errors: [failure(error)], restoring: false }))
    })
    return () => { active = false }
  }, [repository])
  function begin() {
    const version = ++revision.current
    setState(previous => ({ ...previous, busy: true }))
    return () => revision.current === version
  }
  async function refresh() {
    if (!repository) return
    const current = begin(); setRefreshing(true)
    try {
      const result = await repository.read()
      if (current()) setState(previous => ({ ...previous, ...result, canWrite: true }))
    } catch (error) { if (current()) setState(previous => ({ ...previous, errors: [failure(error)] })) }
    finally { setRefreshing(false); if (current()) setState(previous => ({ ...previous, busy: false })) }
  }
  async function save(fileName: string, level: JumpLevel, expected?: string, previousName = fileName) {
    if (!repository || !state.canWrite) throw new Error('Built-in editing requires the local development server.')
    const current = begin()
    try {
      const { text, manifest, manifestSource } = await repository!.save(fileName, level, expected, previousName)
      const next = { fileName, level: decodeLevelFile(text), sourceText: text }
      if (current()) setState(previous => ({ ...previous, manifest, manifestSource, missing: previous.missing.filter(f => f.fileName !== fileName && f.fileName !== previousName), files: orderLevelFiles([...previous.files.filter(f => f.fileName !== fileName && f.fileName !== previousName), next], manifest), errors: [] }))
      return text
    } finally { if (current()) setState(previous => ({ ...previous, busy: false })) }
  }
  async function reorder(files: LocalLevelEntry[], order: 'filename' | 'listed' = 'listed') {
    if (!repository || !state.canWrite) throw new Error('Built-in editing requires the local development server.')
    const current = begin()
    try {
      const result = await repository!.reorder(files, state.manifestSource, order)
      if (current()) setState(previous => ({ ...previous, ...result, files: orderLevelFiles(files.filter((file): file is LevelFile => 'level' in file), result.manifest) }))
      return result
    } finally { if (current()) setState(previous => ({ ...previous, busy: false })) }
  }
  async function remove(entry: LocalLevelEntry) {
    if (!repository || !state.canWrite) throw new Error('Built-in editing requires the local development server.')
    const current = begin()
    try {
      const result = await repository!.remove(entry, state.manifestSource)
      if (current()) setState(previous => ({ ...previous, ...result, lastRemoved: { fileName: entry.fileName }, files: previous.files.filter(file => file.fileName !== entry.fileName), missing: previous.missing.filter(file => file.fileName !== entry.fileName) }))
      return result
    } finally { if (current()) setState(previous => ({ ...previous, busy: false })) }
  }
  async function loadDeleted() {
    if (!repository) return
    const current = begin()
    try { const result = await repository!.deleted(); if (current()) setTrash(result) }
    catch (error) { if (current()) setTrash(previous => ({ ...previous, errors: [failure(error)] })) }
    finally { if (current()) setState(previous => ({ ...previous, busy: false })) }
  }
  async function restoreDeleted(entry: DeletedLevel, fileName: string) {
    if (!repository || !state.canWrite) throw new Error('Built-in editing requires the local development server.')
    if (entry.level && state.files.some(file => file.level.id === entry.level!.id)) throw new Error('This level already exists in the built-in collection. Its recovery copy has been kept.')
    const current = begin()
    try {
      await repository!.restore(entry, fileName, state.manifestSource)
      const result = await repository!.read(true)
      if (current()) {
        setState(previous => ({ ...previous, ...result }))
        setTrash(previous => ({ ...previous, deleted: previous.deleted.filter(file => file.directoryName !== entry.directoryName || file.fileName !== entry.fileName) }))
      }
    } finally { if (current()) setState(previous => ({ ...previous, busy: false })) }
  }
  async function deletePermanently(confirmed: DeletedLevel[]) {
    if (!repository || !state.canWrite) throw new Error('Built-in editing requires the local development server.')
    const current = begin(), backend = repository!
    try { await backend.empty(confirmed) }
    finally {
      try { const result = await backend.deleted(); if (current()) setTrash(result) }
      catch (error) { if (current()) setTrash(previous => ({ ...previous, errors: [failure(error)] })) }
      if (current()) setState(previous => ({ ...previous, busy: false }))
    }
  }
  return { ...state, entries, trash, loadDeleted, restoreDeleted, deletePermanently, reorder, remove, busy: state.busy || state.restoring, refreshing, refresh, save }
}
export type BuiltInLevels = ReturnType<typeof useBuiltInLevels>
