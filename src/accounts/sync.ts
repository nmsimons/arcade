import { digest, emptyWorkspace, parseWorkspace, readCurrentWorkspace, replaceWorkspace, serializeWorkspace } from './data.ts'
import type { KeyStorage } from './profileStorage.ts'
import { CLOUD_BASELINE_SLOT as BASELINE } from './profileStorage.ts'
import type { CloudEntry, CloudStore } from './cloudStore.ts'
import { CloudChangedError } from './errors.ts'

export interface SyncResult { status: 'synced' | 'conflict' | 'deferred'; entries: CloudEntry[]; heads: CloudEntry[]; hash?: string; recovery?: boolean }
export type SyncPhase = 'checking' | 'downloading' | 'uploading'
export function cloudHeads(entries: CloudEntry[]) {
  const byId = new Map(entries.map(entry => [entry.id, entry])), visited = new Set<string>(), visiting = new Set<string>()
  for (const entry of entries) {
    const stack = [{ id: entry.id, leave: false }]
    while (stack.length) {
      const { id, leave } = stack.pop()!
      if (leave) { visiting.delete(id); visited.add(id); continue }
      if (visiting.has(id)) throw new Error('Cloud history contains a cycle. Local data is safe.')
      if (visited.has(id)) continue
      visiting.add(id); stack.push({ id, leave: true })
      for (const parent of byId.get(id)?.parents ?? []) stack.push({ id: parent, leave: false })
    }
  }
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
export function createSync(store: KeyStorage, cloud: CloudStore, progress: (phase: SyncPhase) => void = () => {}, canApply: () => boolean = () => true) {
  async function download(entry: CloudEntry, signal: AbortSignal) {
    progress('downloading')
    const text = await cloud.read(entry, signal)
    if (await digest(text) !== entry.hash) throw new Error('Cloud save integrity check failed. Local progress is safe.')
    return parseWorkspace(text)
  }
  async function upload(text: string, parents: string[], signal: AbortSignal) {
    progress('uploading')
    const entry = await cloud.create({ id: crypto.randomUUID(), parents: [...new Set(parents)], hash: await digest(text), at: new Date().toISOString() }, text, signal)
    signal.throwIfAborted()
    return entry
  }
  async function accept(entry: CloudEntry, text: string, signal: AbortSignal) {
    const files = Object.fromEntries(await Promise.all(Object.entries(parseWorkspace(text).levels.files).map(async ([name, value]) => [name, await digest(value)])))
    signal.throwIfAborted()
    // Record the exact published bytes, never the possibly newer local files.
    // File badges survive reloads without storing another copy of the level data.
    store.setItem(BASELINE, JSON.stringify({ id: entry.id, hash: entry.hash, files }))
  }
  async function publish(entry: CloudEntry, text: string, signal: AbortSignal) {
    // The folder provider reports actual writes. An unchanged publish only
    // verifies the snapshot; calling that "Saving" made every poll look dirty.
    if (cloud.publish) await cloud.publish(entry, text, signal)
    signal.throwIfAborted()
  }
  return {
    async sync(signal: AbortSignal): Promise<SyncResult> {
      progress('checking')
      const entries = await cloud.list(signal), heads = cloudHeads(entries)
      signal.throwIfAborted()
      // Capture after the network check so frequent game autosaves cannot starve sync.
      const text = serializeWorkspace(await readCurrentWorkspace(store)), hash = await digest(text), base = baseline(store)
      const result = (status: SyncResult['status'], confirmedHash?: string): SyncResult => ({ status, entries, heads, hash: confirmedHash })
      if (cloud.recoveryRequired?.()) return { ...result('conflict'), recovery: true }
      if (heads.length === 1 && heads[0].hash === hash) { await publish(heads[0], text, signal); await accept(heads[0], text, signal); return result('synced', hash) }
      if (heads.length === 1 && (hash === base?.hash || !base && text === serializeWorkspace(emptyWorkspace()))) {
        if (!canApply()) return result('deferred')
        const remote = await download(heads[0], signal)
        await publish(heads[0], serializeWorkspace(remote), signal)
        if (!canApply()) return result('deferred')
        await replaceWorkspace(store, remote, text, () => {
          signal.throwIfAborted()
          if (!canApply()) throw new CloudChangedError('The game started before cloud saves could be loaded.')
        })
        await accept(heads[0], serializeWorkspace(remote), signal)
        return result('synced', heads[0].hash)
      }
      if (!heads.length && !base || heads.length === 1 && heads[0].id === base?.id) {
        // Nothing to upload for a brand-new empty account.
        if (!heads.length && text === serializeWorkspace(emptyWorkspace())) return result('synced', hash)
        const entry = await upload(text, heads.map(head => head.id), signal)
        await publish(entry, text, signal)
        await accept(entry, text, signal)
        return { status: 'synced', entries: [...entries, entry], heads: [entry], hash }
      }
      return result('conflict')
    },
    async resolve(choice: 'local' | CloudEntry, signal: AbortSignal): Promise<SyncResult> {
      progress('checking')
      const text = serializeWorkspace(await readCurrentWorkspace(store)), base = baseline(store)
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
      if (serializeWorkspace(await readCurrentWorkspace(store)) !== text) throw new Error('Progress changed in another tab. Refresh before resolving the conflict.')
      const entry = await upload(target, parents, signal)
      await publish(entry, target, signal)
      if (target !== text) await replaceWorkspace(store, parseWorkspace(target), text, () => signal.throwIfAborted())
      await accept(entry, target, signal)
      return { status: 'synced', entries: [...entries, entry], heads: [entry], hash: entry.hash }
    },
  }
}
