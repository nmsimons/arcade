import { constants, closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

const MAX_BYTES = 4 * 1024 * 1024, MAX_SLOTS = 128
const missing = error => error.code === 'ENOENT'

/** Acknowledged writes preserve the synchronous save/recovery contract used by games. */
export function fileStorage(directory) {
  const root = resolve(directory)
  mkdirSync(root, { recursive: true, mode: 0o700 })
  if (!lstatSync(root).isDirectory() || lstatSync(root).isSymbolicLink()) throw new Error('The save directory must be a regular directory.')
  const path = key => {
    if (typeof key !== 'string' || !/^[a-zA-Z0-9.:-]{1,120}$/.test(key)) throw new Error('Invalid save key.')
    return join(root, `${Buffer.from(key).toString('base64url')}.json`)
  }
  const check = target => {
    try {
      const stat = lstatSync(target)
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > MAX_BYTES) throw new Error('The save file cannot be read or replaced safely.')
    } catch (error) { if (!missing(error)) throw error }
  }
  return {
    getItem(key) {
      const target = path(key); check(target)
      try { return readFileSync(target, { encoding: 'utf8', flag: constants.O_RDONLY | constants.O_NOFOLLOW }) }
      catch (error) { if (missing(error)) return null; throw error }
    },
    setItem(key, value) {
      const target = path(key); check(target)
      if (typeof value !== 'string' || Buffer.byteLength(value) > MAX_BYTES) throw new Error('The save is too large.')
      if (!existsSync(target) && readdirSync(root).filter(name => name.endsWith('.json')).length >= MAX_SLOTS) throw new Error('Too many save slots.')
      const temporary = join(root, `${randomUUID()}.tmp`)
      try {
        const fd = openSync(temporary, 'wx', 0o600)
        try { writeFileSync(fd, value); fsyncSync(fd) }
        finally { closeSync(fd) }
        check(target); renameSync(temporary, target)
      }
      finally { if (existsSync(temporary)) unlinkSync(temporary) }
    },
    removeItem(key) {
      const target = path(key); check(target)
      try { unlinkSync(target) } catch (error) { if (!missing(error)) throw error }
    },
  }
}
