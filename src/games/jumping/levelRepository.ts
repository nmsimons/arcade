import { readLocalLevelDirectory, writeLocalLevel, writeLevelOrder, deleteLocalLevel, readDeletedLevels, restoreDeletedLevel, emptyDeletedLevels } from './levelFiles.ts'
import type { LocalDirectory } from './levelFiles.ts'

/** Both storage backends use the same conflict checks, budgets and recovery logic. */
export function directoryRepository(directory: LocalDirectory) {
  return {
    read: (canWrite = true) => readLocalLevelDirectory(directory, canWrite),
    save: (...args: Parameters<typeof writeLocalLevel> extends [unknown, ...infer Rest] ? Rest : never) => writeLocalLevel(directory, ...args),
    reorder: (...args: Parameters<typeof writeLevelOrder> extends [unknown, ...infer Rest] ? Rest : never) => writeLevelOrder(directory, ...args),
    remove: (...args: Parameters<typeof deleteLocalLevel> extends [unknown, ...infer Rest] ? Rest : never) => deleteLocalLevel(directory, ...args),
    deleted: () => readDeletedLevels(directory),
    restore: (...args: Parameters<typeof restoreDeletedLevel> extends [unknown, ...infer Rest] ? Rest : never) => restoreDeletedLevel(directory, ...args),
    empty: (entries: Parameters<typeof emptyDeletedLevels>[1]) => emptyDeletedLevels(directory, entries),
  }
}
export type LevelRepository = ReturnType<typeof directoryRepository>
