import { compareFileNames, decodeLevelManifest, decodeLevelFile, isLevelFileName, loadLocalLevelFiles } from './levelAssets.ts'
import type { LevelFile, LevelManifest, LocalLevelEntry } from './levelAssets.ts'
import { parseLevel } from './level.ts'
import type { JumpLevel } from './level.ts'
import { MAX_LEVEL_BYTES, checkCollectionSize, readInBatches, readLevelText, textBytes } from './levelLimits.ts'
import type { LevelInputFile } from './levelLimits.ts'

export interface LocalFileHandle {
  kind: 'file'; name: string; getFile(): Promise<LevelInputFile>
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
const failure = (error: unknown) => error instanceof Error ? error.message : String(error)
export function levelFileName(name: string, existing: Iterable<string> = []) {
  const base = name.replace(/[^a-z0-9 _-]/gi, '').trim().replace(/\s+/g, ' ') || 'untitled'
  const names = new Set([...existing].map(value => value.toLowerCase()))
  let candidate = `${base}.jump-level.json`, suffix = 2
  while (names.has(candidate.toLowerCase())) candidate = `${base} ${suffix++}.jump-level.json`
  return candidate
}
const conflict = () => new Error('This file changed on disk. Refresh the folder and open the latest file before saving.')
const nameCollision = (fileName: string) => new Error(`“${fileName}” already exists in this folder. Choose a different File name in Level settings and save again.`)
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
  if (!handle || expected === undefined || await readLevelText(await handle.getFile()) !== expected) throw conflict()
}
async function readManifest(directory: LocalDirectory) {
  const handle = await findFile(directory, 'index.json')
  const manifestSource = handle ? await readLevelText(await handle.getFile()) : undefined
  return { handle, manifestSource, manifest: manifestSource === undefined ? undefined : decodeLevelManifest(manifestSource) }
}
async function checkWriteSize(directory: LocalDirectory, fileName: string, text: string, previousName = fileName, manifestSource?: string) {
  let bytes = textBytes(text), count = fileName === 'index.json' ? 0 : 1
  if (bytes > MAX_LEVEL_BYTES) throw new Error('Level files must be smaller than 1 MB.')
  for await (const entry of directory.values()) {
    if (entry.kind !== 'file' || entry.name === fileName || entry.name === previousName || !isLevelFileName(entry.name) && entry.name !== 'index.json') continue
    bytes += entry.name === 'index.json' && manifestSource !== undefined ? textBytes(manifestSource) : (await entry.getFile()).size
    if (entry.name !== 'index.json') count++
    checkCollectionSize(bytes, count)
  }
}
export async function writeLocalLevel(directory: LocalDirectory, fileName: string, level: JumpLevel, expected?: string, previousName = fileName) {
  if (!isLevelFileName(fileName) || !isLevelFileName(previousName)) throw new Error('Use a JSON filename without folder paths, such as my-level.json.')
  const text = JSON.stringify(parseLevel(level), null, 2) + '\n'
  if (textBytes(text) > MAX_LEVEL_BYTES) throw new Error('Level files must be smaller than 1 MB.')
  const renaming = previousName !== fileName
  const original = renaming ? await findFile(directory, previousName) : undefined
  if (renaming) await unchanged(original, expected)
  let target = await findFile(directory, fileName)
  if (target) {
    if (renaming || expected === undefined) throw nameCollision(fileName)
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
  if (manifestSource !== undefined) decodeLevelManifest(manifestSource)
  await checkWriteSize(directory, fileName, text, previousName, manifestSource)
  if (target) await unchanged(target, expected)
  else if (await findFile(directory, fileName)) throw nameCollision(fileName)
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
        const current = await readLevelText(await target.getFile())
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
  await checkWriteSize(directory, 'index.json', manifestSource)
  if (index.handle) await unchanged(index.handle, expected)
  else if (await findFile(directory, 'index.json')) throw new Error('index.json changed on disk. Refresh the folder before saving the order.')
  const handle = index.handle ?? await directory.getFileHandle('index.json', { create: true })
  try { await writeText(handle, manifestSource) }
  catch (error) {
    if (!index.handle) {
      try { if (await readLevelText(await handle.getFile()) === '') await directory.removeEntry('index.json') }
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
    try { await deletedFiles(directory, textBytes(expected!), 1) }
    catch (error) { throw new Error(`Could not move this level to the recycle bin: ${failure(error)} Empty or make room in the bin first.`) }
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
async function deletedFiles(directory: LocalDirectory, reservedBytes = 0, reservedCount = 0) {
  const files: { directoryName: string; file: LevelInputFile }[] = []
  const bin = await findDirectory(directory, 'Deleted levels')
  if (!bin) return files
  let bytes = reservedBytes, folders = reservedCount
  for await (const item of bin.values()) {
    if (item.kind !== 'directory' || !recoveryDirectory.test(item.name)) continue
    checkCollectionSize(bytes, ++folders)
    const recovery = await bin.getDirectoryHandle(item.name)
    for await (const entry of recovery.values()) {
      if (entry.kind !== 'file' || !isLevelFileName(entry.name)) continue
      const file = await entry.getFile()
      bytes += file.size; checkCollectionSize(bytes, files.length + 1 + reservedCount)
      files.push({ directoryName: item.name, file })
    }
  }
  return files
}
export async function readDeletedLevels(directory: LocalDirectory) {
  const deleted: DeletedLevel[] = [], errors: string[] = []
  const files = await deletedFiles(directory)
  const results = await readInBatches(files, async ({ directoryName, file }) => {
    const sourceText = await readLevelText(file)
    let level: JumpLevel | undefined
    try { level = decodeLevelFile(sourceText) } catch { /* Invalid JSON remains recoverable. */ }
    return { directoryName, fileName: file.name, sourceText, level,
      deletedAt: directoryName.slice(0, 23).replace(/T(\d{2})-(\d{2})-(\d{2})-/, 'T$1:$2:$3.') + 'Z' }
  })
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') deleted.push(result.value)
    else errors.push(`${files[i].file.name}: ${failure(result.reason)}`)
  })
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
  await checkWriteSize(directory, fileName, entry.sourceText, fileName, manifestSource)
  if (manifestSource !== undefined) decodeLevelManifest(manifestSource)
  if (await findFile(directory, fileName)) throw new Error(`“${fileName}” already exists. Choose another filename or cancel.`)
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
    try { const text = await readLevelText(await target.getFile()); if (text === entry.sourceText || text === '') await directory.removeEntry(fileName); else incomplete.push(fileName) }
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
  const selected: LevelInputFile[] = []
  let bytes = 0, count = 0
  for await (const entry of handle.values()) if (entry.kind === 'file' && (isLevelFileName(entry.name) || entry.name === 'index.json')) {
    if (entry.name !== 'index.json') count++
    checkCollectionSize(bytes, count)
    const file = await entry.getFile(); bytes += file.size
    checkCollectionSize(bytes, count); selected.push(file)
  }
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
