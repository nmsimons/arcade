import { constants } from 'node:fs'
import { lstat, mkdir, open, readdir, realpath, rename, rmdir, unlink } from 'node:fs/promises'
import { join, relative, resolve, sep } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { LocalDirectory, LocalFileHandle } from '../src/games/jumping/levelFiles.ts'
import { isLevelFileName } from '../src/games/jumping/levelAssets.ts'
import { MAX_LEVEL_BYTES, textBytes } from '../src/games/jumping/levelLimits.ts'

const recoveryName = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[\da-f-]{36}$/i
const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT'
const notFound = () => new DOMException('File not found.', 'NotFoundError')

/** Fixed roots only. Recovery files never enter public/ or the published catalog. */
export async function devLevelDirectory(project: string): Promise<LocalDirectory> {
  const root = await realpath(project), assets = join(root, 'public/levels/jumping'), bin = join(root, '.local/jumping-recycle-bin')
  async function directory(path: string, create = false) {
    const parts = relative(root, path).split(sep)
    if (parts.some(part => !part || part === '..') || resolve(root, ...parts) !== path) throw new Error('Invalid level directory.')
    let current = root
    for (const part of parts) {
      current = join(current, part)
      if (create) await mkdir(current).catch(error => { if (error.code !== 'EEXIST') throw error })
      const stat = await lstat(current).catch(error => { if (missing(error)) throw notFound(); throw error })
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Level directories cannot be symlinks.')
    }
  }
  function fileName(name: string) {
    if (typeof name !== 'string' || name.length > 255 || name !== 'index.json' && !isLevelFileName(name)) throw new Error('Invalid level filename.')
    return name
  }
  async function read(path: string) {
    await directory(resolve(path, '..'))
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW).catch(error => { if (missing(error)) throw notFound(); throw error })
    try {
      const stat = await file.stat()
      if (!stat.isFile() || stat.nlink !== 1) throw new Error('Levels must be regular files without links.')
      if (stat.size > MAX_LEVEL_BYTES) throw new Error('Level files must be smaller than 1 MB.')
      const buffer = Buffer.alloc(MAX_LEVEL_BYTES + 1)
      let bytes = 0
      while (bytes < buffer.length) {
        const chunk = await file.read(buffer, bytes, buffer.length - bytes, null)
        if (!chunk.bytesRead) break
        bytes += chunk.bytesRead
      }
      if (bytes > MAX_LEVEL_BYTES) throw new Error('Level files must be smaller than 1 MB.')
      return buffer.subarray(0, bytes).toString('utf8')
    } finally { await file.close() }
  }
  function folder(path: string): LocalDirectory {
    return {
      name: path === assets ? 'Built-in levels' : path.split(sep).at(-1)!, kind: 'directory',
      async *values() {
        await directory(path)
        for (const entry of await readdir(path, { withFileTypes: true })) {
          if (entry.isSymbolicLink()) throw new Error('Level folders cannot contain symlinks.')
          if (entry.isFile() && (entry.name === 'index.json' || isLevelFileName(entry.name))) yield await this.getFileHandle(entry.name)
          else if (entry.isDirectory()) yield { kind: 'directory', name: entry.name }
        }
        if (path === assets) {
          try { await directory(bin); yield { kind: 'directory', name: 'Deleted levels' } }
          catch (error) { if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error }
        }
      },
      async getFileHandle(name, options): Promise<LocalFileHandle> {
        name = fileName(name); await directory(path)
        const target = join(path, name)
        if (options?.create) {
          const file = await open(target, 'wx', 0o600).catch(error => { if (error.code !== 'EEXIST') throw error })
          await file?.close()
        }
        const stat = await lstat(target).catch(error => { if (missing(error)) throw notFound(); throw error })
        if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error('Levels must be regular files without links.')
        return { kind: 'file', name, getFile: async () => {
          await directory(path)
          const current = await lstat(target)
          if (!current.isFile() || current.isSymbolicLink() || current.nlink !== 1) throw new Error('Levels must be regular files without links.')
          return { name, size: current.size, text: () => read(target) }
        },
          createWritable: async () => {
            const before = await read(target)
            let staged: string | undefined
            return {
              write: async text => { if (textBytes(text) > MAX_LEVEL_BYTES) throw new Error('Level files must be smaller than 1 MB.'); staged = text },
              abort: async () => { staged = undefined },
              close: async () => {
                if (staged === undefined) throw new Error('No level contents supplied.')
                await directory(join(root, '.local'), true)
                const temporary = join(root, '.local', `jumping-save-${randomUUID()}.tmp`)
                const file = await open(temporary, 'wx', 0o600)
                try {
                  await file.writeFile(staged); await file.close()
                  if (await read(target) !== before) throw new Error('This file changed on disk. Refresh before saving.')
                  await rename(temporary, target)
                } finally { await file.close(); await unlink(temporary).catch(() => {}) }
              },
            }
          },
        }
      },
      async getDirectoryHandle(name, options) {
        const target = path === assets && name === 'Deleted levels' ? bin : path === bin && recoveryName.test(name) ? join(bin, name) : undefined
        if (!target) throw new Error('Invalid recovery directory.')
        await directory(target, options?.create)
        return folder(target)
      },
      async removeEntry(name) {
        await directory(path)
        if (path === bin && recoveryName.test(name)) { await directory(join(path, name)); await rmdir(join(path, name)); return }
        const target = join(path, fileName(name))
        await read(target)
        await unlink(target)
      },
    }
  }
  await directory(assets)
  return folder(assets)
}
