import { digest, emptyWorkspace, parseWorkspace, readWorkspace, replaceWorkspace, serializeWorkspace } from './data.ts'
import type { KeyStorage } from './profileStorage.ts'
import type { CloudEntry, CloudStore } from './cloudStore.ts'

const BASELINE = 'arcade.cloud.baseline.v1'
export interface SyncResult { status: 'synced' | 'conflict'; entries: CloudEntry[]; heads: CloudEntry[] }
export function cloudHeads(entries: CloudEntry[]) {
  const byId = new Map(entries.map(entry => [entry.id, entry])), visited = new Set<string>(), visiting = new Set<string>()
  const walk = (id: string) => {
    if (visiting.has(id)) throw new Error('Cloud history contains a cycle. Local data is safe.')
    if (visited.has(id)) return
    visiting.add(id)
    for (const parent of byId.get(id)?.parents ?? []) walk(parent)
    visiting.delete(id); visited.add(id)
  }
  entries.forEach(entry => walk(entry.id))
  const parents = new Set(entries.flatMap(entry => entry.parents))
  return entries.filter(entry => !parents.has(entry.id)).sort((a, b) => b.at.localeCompare(a.at))
}
function baseline(store: KeyStorage): { id: string; hash: string } | undefined {
  try {
    const value = JSON.parse(store.getItem(BASELINE) ?? 'null')
    if (typeof value?.id === 'string' && typeof value?.hash === 'string') return value
  } catch { /* Unknown baseline forces reconciliation; never overwrite remote progress. */ }
}

/** Append-only history avoids depending on non-portable overwrite preconditions. */
export function createSync(store: KeyStorage, cloud: CloudStore) {
  async function download(entry: CloudEntry, signal: AbortSignal) {
    const text = await cloud.read(entry, signal)
    if (await digest(text) !== entry.hash) throw new Error('Cloud save integrity check failed. Local progress is safe.')
    return parseWorkspace(text)
  }
  async function upload(text: string, parents: string[], signal: AbortSignal) {
    const entry = await cloud.create({ id: crypto.randomUUID(), parents: [...new Set(parents)], hash: await digest(text), at: new Date().toISOString() }, text, signal)
    signal.throwIfAborted()
    return entry
  }
  function accept(entry: CloudEntry, signal: AbortSignal) { signal.throwIfAborted(); store.setItem(BASELINE, JSON.stringify({ id: entry.id, hash: entry.hash })) }
  return {
    async sync(signal: AbortSignal): Promise<SyncResult> {
      const text = serializeWorkspace(readWorkspace(store)), hash = await digest(text), base = baseline(store)
      const entries = await cloud.list(signal), heads = cloudHeads(entries)
      signal.throwIfAborted()
      if (serializeWorkspace(readWorkspace(store)) !== text) throw new Error('Progress changed in another tab. Sync again to include the latest local data.')
      const result = (status: SyncResult['status']): SyncResult => ({ status, entries, heads })
      if (heads.length === 1 && heads[0].hash === hash) { accept(heads[0], signal); return result('synced') }
      if (heads.length === 1 && (hash === base?.hash || !base && text === serializeWorkspace(emptyWorkspace()))) {
        const remote = await download(heads[0], signal)
        signal.throwIfAborted(); replaceWorkspace(store, remote, text); accept(heads[0], signal)
        return result('synced')
      }
      if (!heads.length && !base || heads.length === 1 && heads[0].id === base?.id) {
        // Nothing to upload for a brand-new empty account.
        if (!heads.length && text === serializeWorkspace(emptyWorkspace())) return result('synced')
        const entry = await upload(text, heads.map(head => head.id), signal)
        accept(entry, signal)
        return { status: 'synced', entries: [...entries, entry], heads: [entry] }
      }
      return result('conflict')
    },
    async resolve(choice: 'local' | CloudEntry, signal: AbortSignal): Promise<SyncResult> {
      const text = serializeWorkspace(readWorkspace(store)), base = baseline(store)
      const entries = await cloud.list(signal), heads = cloudHeads(entries)
      let target = text
      const parents = heads.map(entry => entry.id)
      if (choice !== 'local') {
        const selected = entries.find(entry => entry.id === choice.id && entry.fileId === choice.fileId && entry.hash === choice.hash)
        if (!selected) throw new Error('That cloud version changed. Refresh the history and try again.')
        target = serializeWorkspace(await download(selected, signal))
        // Preserve unsynced local edits in cloud history before a deliberate restore.
        if (text !== target && await digest(text) !== base?.hash && text !== serializeWorkspace(emptyWorkspace())) {
          const backup = await upload(text, base ? [base.id] : [], signal)
          parents.push(backup.id); entries.push(backup)
        }
      }
      signal.throwIfAborted()
      if (serializeWorkspace(readWorkspace(store)) !== text) throw new Error('Progress changed in another tab. Refresh before resolving the conflict.')
      const entry = await upload(target, parents, signal)
      if (target !== text) replaceWorkspace(store, parseWorkspace(target), text)
      accept(entry, signal)
      return { status: 'synced', entries: [...entries, entry], heads: [entry] }
    },
  }
}
