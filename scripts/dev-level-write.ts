import { constants } from 'node:fs'
import { lstat, open, rename, unlink } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import { setTimeout } from 'node:timers/promises'

const sharingFailure = (error: unknown) => process.platform === 'win32'
  && ['EPERM', 'EACCES', 'EBUSY'].includes((error as NodeJS.ErrnoException).code ?? '')

async function sameFile(file: FileHandle, target: string) {
  const [opened, current] = await Promise.all([file.stat(), lstat(target)])
  if (!opened.isFile() || opened.nlink !== 1 || !current.isFile() || current.isSymbolicLink() || current.nlink !== 1)
    throw new Error('Levels must be regular files without links.')
  if (opened.dev !== current.dev || opened.ino !== current.ino)
    throw new Error('This file changed on disk. Refresh before saving.')
}

async function overwrite(file: FileHandle, contents: string) {
  const bytes = Buffer.from(contents)
  let offset = 0
  while (offset < bytes.length) {
    const { bytesWritten } = await file.write(bytes, offset, bytes.length - offset, offset)
    if (!bytesWritten) throw new Error('Could not finish writing the level file.')
    offset += bytesWritten
  }
  await file.truncate(bytes.length)
  await file.sync()
}

/** Windows readers can allow writes while denying deletion/replacement. Keep
 * the directory entry in that case, with an original-content recovery copy and
 * rollback through the same verified handle if a write or truncate fails. */
async function replaceOpenFile(temporary: string, target: string, before: string, contents: string, unchanged: () => Promise<void>) {
  const file = await open(target, constants.O_RDWR | constants.O_NOFOLLOW)
  const backup = `${temporary}.original`
  let backupCreated = false, keepBackup = false
  try {
    await sameFile(file, target); await unchanged()
    const original = await open(backup, 'wx', 0o600)
    backupCreated = true
    try { await original.writeFile(before); await original.sync() }
    finally { await original.close() }
    // Backup I/O can yield to an external editor. Recheck both the path and
    // expected text immediately before writing to the pinned file descriptor.
    await unchanged(); await sameFile(file, target)
    try {
      await overwrite(file, contents)
      await sameFile(file, target)
    } catch (error) {
      try { await overwrite(file, before) }
      catch {
        keepBackup = true
        throw new Error(`Could not restore the original file after a failed save. Recovery copy kept at ${backup}.`, { cause: error })
      }
      throw error
    }
  } finally {
    await file.close()
    if (backupCreated && !keepBackup) await unlink(backup).catch(() => {})
  }
}

/** Prefer atomic replacement. Retry transient Windows sharing locks before
 * using a checked, recoverable overwrite; never unlink the destination first. */
export async function replaceDevLevelFile(temporary: string, target: string, before: string, contents: string, unchanged: () => Promise<void>) {
  for (const wait of [0, 25, 75, 150, 300]) {
    if (wait) await setTimeout(wait)
    await unchanged()
    try { await rename(temporary, target); return }
    catch (error) { if (!sharingFailure(error)) throw error }
  }
  await replaceOpenFile(temporary, target, before, contents, unchanged)
}
