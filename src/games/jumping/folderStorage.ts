import type { LocalDirectory } from './localLevels.ts'

interface RememberedFolder { name: string; handle?: LocalDirectory }
const DATABASE = 'arcade.jumping.folder.v1'
const STORE = 'preferences'

/** Persist only the directory reference, never level contents or editor drafts. */
function folderRequest<T>(mode: IDBTransactionMode, request: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false
    const fail = (error: unknown) => { settled = true; reject(error) }
    const opening = indexedDB.open(DATABASE, 1)
    opening.onupgradeneeded = () => opening.result.createObjectStore(STORE)
    opening.onerror = () => fail(opening.error)
    opening.onblocked = () => fail(new Error('Folder preferences are unavailable in another tab.'))
    opening.onsuccess = () => {
      const db = opening.result
      if (settled) { db.close(); return }
      db.onversionchange = () => db.close()
      try {
        const transaction = db.transaction(STORE, mode)
        const operation = request(transaction.objectStore(STORE))
        transaction.oncomplete = () => { db.close(); settled = true; resolve(operation.result) }
        transaction.onabort = transaction.onerror = () => { db.close(); fail(transaction.error ?? operation.error) }
      } catch (error) { db.close(); fail(error) }
    }
  })
}

export async function readRememberedFolder(): Promise<RememberedFolder | undefined> {
  const value = await folderRequest<unknown>('readonly', store => store.get('folder'))
  if (!value || typeof value !== 'object' || !('name' in value) || typeof value.name !== 'string' || !value.name) return
  const handle = 'handle' in value ? value.handle as LocalDirectory | undefined : undefined
  if (handle && (handle.kind !== 'directory' || typeof handle.values !== 'function' || typeof handle.getFileHandle !== 'function')) return
  return { name: value.name, handle }
}

export async function rememberFolder(name: string, handle?: LocalDirectory) {
  await folderRequest('readwrite', store => store.put({ name, ...(handle ? { handle } : {}) }, 'folder'))
}
