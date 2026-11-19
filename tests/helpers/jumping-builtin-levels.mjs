// Built-in levels by their durable id. A level's file can be renamed and its title retitled in the studio; its `id`
// stays. Tests, fixtures and scripts name built-in levels by id and resolve the current file here.
import { readFileSync, readdirSync } from 'node:fs'

export const BUILTIN_LEVELS_ROOT = new URL('../../public/levels/jumping/', import.meta.url)

let cached = null
/** Every built-in level file with its id and title, read once. */
export function builtinLevels() {
  if (cached) return cached
  cached = readdirSync(BUILTIN_LEVELS_ROOT).filter(file => file.endsWith('.json') && file !== 'index.json').map(file => {
    const level = JSON.parse(readFileSync(new URL(encodeURIComponent(file), BUILTIN_LEVELS_ROOT), 'utf8'))
    return { file, id: level.id, name: level.name }
  })
  return cached
}

/** The current file of the built-in level with this id. Throws, naming the id, when no built-in level has it. */
export function builtinLevelFile(id) {
  const found = builtinLevels().find(level => level.id === id)
  if (!found) throw new Error(`No built-in level has id ${id}`)
  return found.file
}

/** The built-in level with this id, parsed from its current file. */
export function readBuiltinLevel(id) {
  return JSON.parse(readFileSync(new URL(encodeURIComponent(builtinLevelFile(id)), BUILTIN_LEVELS_ROOT), 'utf8'))
}

/** The id of the built-in level in this file. */
export function builtinLevelId(file) {
  const found = builtinLevels().find(level => level.file === file)
  if (!found) throw new Error(`No built-in level file ${file}`)
  return found.id
}

/** Fixture entries that name a built-in level by \`level\` (its id), with \`file\` set to that level's current file. */
export function withLevelFiles(entries = []) {
  return entries.map(entry => entry.level ? { ...entry, file: builtinLevelFile(entry.level) } : entry)
}
