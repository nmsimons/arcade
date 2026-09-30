import type { KeyStorage } from './profileStorage.ts'

const DATABASE = 'arcade.account.libraries.v1', LIBRARIES = 'libraries'

/** IndexedDB is authoritative; localStorage is a cache for synchronous UI reads. */
export function transactLibrary<T>(store: KeyStorage, key: string, work: (current: KeyStorage) => T): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false
    const fail = (error: unknown) => { settled = true; reject(error) }
    const opening = indexedDB.open(DATABASE, 1)
    opening.onupgradeneeded = () => opening.result.createObjectStore(LIBRARIES)
    opening.onerror = () => fail(opening.error)
    opening.onblocked = () => fail(new Error('Account storage is unavailable in another tab. Close that tab and try again.'))
    opening.onsuccess = () => {
      const db = opening.result
      if (settled) { db.close(); return }
      db.onversionchange = () => db.close()
      try {
        const transaction = db.transaction(LIBRARIES, 'readwrite', { durability: 'strict' })
        const libraries = transaction.objectStore(LIBRARIES), request = libraries.get(store.workspaceLock!)
        let result: T, failure: unknown, previous: string | null, next: string | null, mirrored = false
        const writes = new Map<string, { before: string | null; after: string | null }>()
        const write = (name: string, value: string | null) => {
          const before = writes.has(name) ? writes.get(name)!.before : store.getItem(name)
          if (value === null) store.removeItem(name); else store.setItem(name, value)
          writes.set(name, { before, after: value })
        }
        request.onsuccess = () => {
          try {
            previous = request.result === undefined ? store.getItem(key) : request.result as string | null
            if (previous !== null && typeof previous !== 'string') throw new Error('The saved account library could not be read.')
            next = previous
            const current: KeyStorage = {
              getItem: name => name === key ? next : store.getItem(name),
              setItem: (name, value) => { if (name === key) next = value; else write(name, value) },
              removeItem: name => { if (name === key) next = null; else write(name, null) },
            }
            result = work(current)
            // Check browser-cache quota before committing. Never report a save
            // complete until both the cache and the durable transaction succeed.
            if (store.getItem(key) !== next) {
              if (next === null) store.removeItem(key); else store.setItem(key, next)
              mirrored = true
            }
            if (next !== previous || request.result === undefined) libraries.put(next, store.workspaceLock!)
          } catch (error) { failure = error; transaction.abort() }
        }
        transaction.oncomplete = () => { db.close(); settled = true; resolve(result) }
        transaction.onabort = () => {
          // The caller holds the workspace lock until this rollback finishes.
          // The previous durable library remains available even if quota blocks
          // repairing the cache; the next read starts from IndexedDB again.
          if (mirrored) {
            try { if (previous === null) store.removeItem(key); else store.setItem(key, previous) } catch { /* Keep the committed database copy. */ }
          }
          for (const [name, { before, after }] of writes) {
            try {
              if (store.getItem(name) === after) { if (before === null) store.removeItem(name); else store.setItem(name, before) }
            } catch { /* Existing workspace recovery remains available. */ }
          }
          db.close(); fail(failure ?? transaction.error ?? new Error('The account save could not finish. Try saving again.'))
        }
      } catch (error) { db.close(); fail(error) }
    }
  })
}
