import type { CloudEntry, CloudProgress, CloudStore } from './cloudStore.ts'
import { CloudBusyError, CloudChangedError } from './errors.ts'
import { digest, MAX_WORKSPACE_BYTES, object, parseWorkspace, serializeWorkspace } from './data.ts'
import { filesWorkspace, GAME_FOLDERS, isDeletedDirectory, isGameFile, LEVEL_FOLDER, portablePath, workspaceFiles } from './cloudLayout.ts'
import { readInBatches, textBytes } from '../games/jumping/levelLimits.ts'
import { cloudHeads } from './sync.ts'

export interface Item { id: string; name: string; eTag: string; size?: number; folder?: object; file?: object; description?: string; webUrl?: string }
export interface PortableStorage {
  beginSnapshot?(): void
  lookup(path: string, signal: AbortSignal): Promise<Item | undefined>
  directory(path: string, signal: AbortSignal): Promise<string>
  children(path: string, signal: AbortSignal): Promise<Item[]>
  download(file: Item, signal: AbortSignal): Promise<string>
  upload(path: string, text: string, signal: AbortSignal, beforeWrite?: () => Promise<void>): Promise<Item>
  describe(file: Item, description: string, signal: AbortSignal): Promise<unknown>
  move(file: Item, parent: string, signal: AbortSignal, name?: string): Promise<unknown>
}
interface LiveFile { item: Item; text: string }
interface State { version: 2; current?: string; hash?: string; pending?: { id: string; hash: string; at: number; failed?: boolean } }
interface Observation { state: State; files: Map<string, LiveFile> }
interface VersionFile { path: string; hash: string; source: string }
const SYNC = 'Sync history', VERSIONS = `${SYNC}/Versions`, PREFIX = 'Dream Large Arcade v2 '
const OLDER_VERSIONS = `${SYNC}/Older versions`
export const ACTIVE_HISTORY_LIMIT = 100
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const sha = /^[0-9a-f]{64}$/

const changed = () => new CloudChangedError('Cloud files changed during sync. Sync again to review both versions; local progress is safe.')
function parseJson(text: string, source: string): unknown {
  try { return JSON.parse(text) }
  catch { throw new Error(`${source} could not be read. Please try syncing again.`) }
}
function meta(value: unknown): Omit<CloudEntry, 'fileId'> {
  if (!object(value) || typeof value.id !== 'string' || !uuid.test(value.id) || typeof value.hash !== 'string' || !sha.test(value.hash) || typeof value.at !== 'string' || !Number.isFinite(Date.parse(value.at)) || !Array.isArray(value.parents) || value.parents.length > 16 || value.parents.some(id => typeof id !== 'string' || !uuid.test(id) || id === value.id) || new Set(value.parents).size !== value.parents.length) throw new Error('Invalid cloud storage version metadata.')
  return { id: value.id, hash: value.hash, at: value.at, parents: value.parents }
}

function description(file: Item): string {
  if (file.description == null) return ''
  if (typeof file.description !== 'string' || file.description.length > 16000) throw new Error('Cloud sync information could not be read. Please try syncing again.')
  return file.description
}
function readState(folder: Item): State {
  const text = description(folder)
  if (!text) return { version: 2 }
  const state = parseJson(text, 'Cloud sync information')
  if (!object(state) || state.version !== 2 || (state.current !== undefined && (typeof state.current !== 'string' || !uuid.test(state.current) || typeof state.hash !== 'string' || !sha.test(state.hash)))) throw new Error('Invalid cloud storage sync state.')
  if (state.pending !== undefined && (!object(state.pending) || typeof state.pending.id !== 'string' || !uuid.test(state.pending.id) || typeof state.pending.hash !== 'string' || !sha.test(state.pending.hash) || typeof state.pending.at !== 'number' || !Number.isFinite(state.pending.at))) throw new Error('Invalid cloud storage pending sync.')
  return state as unknown as State
}
const sameState = (a: State, b: State) => JSON.stringify(a) === JSON.stringify(b)
const signature = (files: Map<string, LiveFile>) => JSON.stringify([...files].map(([path, file]) => [path, file.item.id, file.item.eTag]).sort())
const historyPath = (id: string, path: string) => { const [game, ...rest] = path.split('/'); return `${game}/History/${id}/${rest.join('/')}` }


/** Shared publication, file reuse, conflict recovery and bounded active history. */
export function createPortableStore(io: PortableStorage, progress: (value: CloudProgress) => void = () => {}): CloudStore {
  const { lookup, directory, children, download, upload, describe, move } = io
  let observed: Observation | undefined, recovery = false
  const knownEntries = new Map<string, CloudEntry>(), versionItems = new Map<string, Item>()
  async function stateFolder(signal: AbortSignal) {
    await directory(SYNC, signal)
    const folder = await lookup(SYNC, signal)
    if (!folder?.folder) throw changed()
    return folder
  }
  async function setState(expected: State, next: State, signal: AbortSignal) {
    const folder = await stateFolder(signal)
    if (!sameState(readState(folder), expected)) throw changed()
    await describe(folder, JSON.stringify(next), signal)
  }
  async function currentItems(signal: AbortSignal) {
    io.beginSnapshot?.()
    const files = new Map<string, Item>()
    const add = (path: string, value: Item) => {
      if (isGameFile(path)) {
        if (!value.file || value.folder) throw new Error(`“${path}” must be a file.`)
        files.set(path, value)
      }
      if (files.size > 1005) throw new Error('Too many account level files.')
    }
    // These are independent reads. Keep both snapshots for change detection,
    // but avoid paying a network round trip for each folder in sequence.
    const paths = [...GAME_FOLDERS, LEVEL_FOLDER, `${LEVEL_FOLDER}/Deleted levels`]
    const listings = await readInBatches(paths, async path => ({ path, files: await children(path, signal) }))
    const deleted: string[] = []
    for (const listing of listings) {
      if (listing.status === 'rejected') throw listing.reason
      const { path, files: children } = listing.value
      for (const file of children) {
        if (path === `${LEVEL_FOLDER}/Deleted levels`) {
          if (file.folder && isDeletedDirectory(file.name)) deleted.push(`${path}/${file.name}`)
        } else add(`${path}/${file.name}`, file)
      }
    }
    const recycled = await readInBatches(deleted, async path => ({ path, files: await children(path, signal) }))
    for (const listing of recycled) {
      if (listing.status === 'rejected') throw listing.reason
      for (const file of listing.value.files) add(`${listing.value.path}/${file.name}`, file)
    }
    return files
  }
  async function currentFiles(signal: AbortSignal) {
    const items = await currentItems(signal), files = new Map<string, LiveFile>()
    let bytes = 0
    const results = await readInBatches([...items], async ([path, file]) => {
      const cached = observed?.files.get(path)
      const text = cached?.item.id === file.id && cached.item.eTag === file.eTag ? cached.text : await download(file, signal)
      bytes += textBytes(text)
      if (bytes > MAX_WORKSPACE_BYTES) throw new Error('Account saves and levels must fit within 4 MB.')
      files.set(path, { item: file, text })
    })
    for (const result of results) if (result.status === 'rejected') throw result.reason
    const after = new Map([...await currentItems(signal)].map(([path, item]) => [path, { item, text: '' }]))
    if (signature(files) !== signature(after)) throw changed()
    return files
  }
  const contents = (files: Map<string, LiveFile>) => new Map([...files].map(([path, file]) => [path, file.text]))
  async function versions(signal: AbortSignal) {
    const entries: CloudEntry[] = []
    knownEntries.clear(); versionItems.clear()
    for (const file of await children(VERSIONS, signal)) {
      if (!file.file) continue
      const text = description(file)
      if (!text.startsWith(PREFIX)) continue
      const entry = meta(parseJson(text.slice(PREFIX.length), 'cloud storage’s save history'))
      if (file.name !== `${entry.id}.json`) throw new Error('Invalid cloud storage version filename.')
      const value = { ...entry, fileId: file.id }
      entries.push(value); knownEntries.set(entry.id, value); versionItems.set(entry.id, file)
    }
    if (new Set(entries.map(entry => entry.id)).size !== entries.length) throw new Error('Duplicate cloud storage versions.')
    return entries
  }
  async function archiveVersions(entries: CloudEntry[], state: State, signal: AbortSignal) {
    if (entries.length <= ACTIVE_HISTORY_LIMIT + 20) return entries
    // Preserve every unresolved branch, the published version and any pending
    // transaction. Moving an ancestor's manifest does not move its file payloads.
    const heads = cloudHeads(entries), byId = new Map(entries.map(entry => [entry.id, entry]))
    const keep = new Set(heads.map(entry => entry.id)), queue = heads.flatMap(entry => entry.parents)
    const protectedIds = [state.current, state.pending?.id].filter((id): id is string => !!id && byId.has(id))
    // Walk from heads, not timestamps: clock skew must not leave an ancestor
    // behind while archiving its child and thereby invent a conflicting head.
    for (let i = 0; i < queue.length && (keep.size < ACTIVE_HISTORY_LIMIT || protectedIds.some(id => !keep.has(id))); i++) {
      const entry = byId.get(queue[i])
      if (!entry || keep.has(entry.id)) continue
      keep.add(entry.id); queue.push(...entry.parents)
    }
    const parent = await directory(OLDER_VERSIONS, signal)
    const remaining = new Map(entries.filter(entry => !keep.has(entry.id)).map(entry => [entry.id, entry]))
    const dependencies = new Map<string, number>(), children = new Map<string, string[]>()
    for (const entry of remaining.values()) {
      const parents = [...new Set(entry.parents.filter(id => remaining.has(id)))]
      dependencies.set(entry.id, parents.length)
      for (const id of parents) children.set(id, [...children.get(id) ?? [], entry.id])
    }
    let roots = [...remaining.values()].filter(entry => dependencies.get(entry.id) === 0)
    while (remaining.size) {
      // Archive parents before children. If a move fails or the tab closes,
      // every surviving ancestor still has its child in the active graph.
      if (!roots.length) throw new Error('Cloud history contains a cycle. Local data is safe.')
      const results = await readInBatches(roots, async entry => {
        await move(versionItems.get(entry.id)!, parent, signal)
      })
      for (const result of results) if (result.status === 'rejected') throw result.reason
      const next: CloudEntry[] = []
      for (const entry of roots) {
        remaining.delete(entry.id)
        for (const id of children.get(entry.id) ?? []) {
          const count = dependencies.get(id)! - 1
          dependencies.set(id, count)
          if (!count) next.push(remaining.get(id)!)
        }
      }
      roots = next
    }
    return entries.filter(entry => keep.has(entry.id))
  }
  async function descriptors(entry: CloudEntry, signal: AbortSignal): Promise<VersionFile[]> {
    meta(entry)
    const file = await lookup(`${VERSIONS}/${entry.id}.json`, signal) ?? await lookup(`${OLDER_VERSIONS}/${entry.id}.json`, signal)
    if (!file || file.id !== entry.fileId) throw new Error('Cloud version is missing.')
    const manifest = parseJson(await download(file, signal), 'This cloud save')
    if (!object(manifest) || manifest.version !== 2 || !Array.isArray(manifest.files) || manifest.files.length > 1005 || JSON.stringify(meta(manifest.entry)) !== JSON.stringify(meta(entry))) throw new Error('Invalid cloud version manifest.')
    const paths = new Set<string>()
    return manifest.files.map(descriptor => {
      if (!object(descriptor) || typeof descriptor.path !== 'string' || !isGameFile(descriptor.path) || typeof descriptor.hash !== 'string' || !sha.test(descriptor.hash) || paths.has(descriptor.path.toLowerCase()) || (descriptor.source !== undefined && (typeof descriptor.source !== 'string' || !uuid.test(descriptor.source)))) throw new Error('Invalid or duplicate cloud version path.')
      portablePath(descriptor.path); paths.add(descriptor.path.toLowerCase())
      return { path: descriptor.path, hash: descriptor.hash, source: descriptor.source as string ?? entry.id }
    })
  }
  async function create(entry: Omit<CloudEntry, 'fileId'>, text: string, signal: AbortSignal) {
    meta(entry)
    if (await digest(text) !== entry.hash) throw new Error('Invalid cloud save digest.')
    const files = workspaceFiles(parseWorkspace(text))
    const parent = entry.parents.map(id => knownEntries.get(id)).find(value => value !== undefined)
    const reusable = new Map((parent ? await descriptors(parent, signal) : []).map(file => [file.path, file]))
    const saved = await Promise.all([...files].map(async ([path, value]) => {
      const hash = await digest(value), previous = reusable.get(path)
      return { path, hash, source: previous?.hash === hash ? previous.source : entry.id }
    }))
    const changedFiles = saved.filter(file => file.source === entry.id)
    let completed = 0
    progress({ stage: 'history', completed, total: changedFiles.length })
    // Independent immutable files can upload concurrently. Wait for ALL results
    // before publishing the record, including when one upload fails.
    const results = await readInBatches(changedFiles, async file => {
      await upload(historyPath(entry.id, file.path), files.get(file.path)!, signal)
      progress({ stage: 'history', completed: ++completed, total: changedFiles.length })
    })
    for (const result of results) if (result.status === 'rejected') throw result.reason
    const file = await upload(`${VERSIONS}/${entry.id}.json`, JSON.stringify({ version: 2, entry, files: saved }), signal)
    await describe(file, PREFIX + JSON.stringify(entry), signal)
    const value = { ...entry, fileId: file.id }; knownEntries.set(entry.id, value)
    return value
  }
  async function read(entry: CloudEntry, signal: AbortSignal) {
    const savedFiles = await descriptors(entry, signal)
    const files = new Map<string, string>(); let bytes = 0
    const results = await readInBatches(savedFiles, async descriptor => {
      const saved = await lookup(historyPath(descriptor.source, descriptor.path), signal)
      if (!saved?.file) throw new Error('A cloud recovery file is missing.')
      const text = await download(saved, signal); bytes += textBytes(text)
      if (bytes > MAX_WORKSPACE_BYTES || files.has(descriptor.path)) throw new Error('Cloud version is too large or contains duplicate files.')
      if (await digest(text) !== descriptor.hash) throw new Error('Cloud save integrity check failed.')
      files.set(descriptor.path, text)
    })
    for (const result of results) if (result.status === 'rejected') throw result.reason
    return serializeWorkspace(filesWorkspace(files))
  }
  return {
    create, read,
    recoveryRequired: () => recovery,
    async list(signal) {
      recovery = false
      progress({ stage: 'checking' })
      let state = readState(await stateFolder(signal))
      if (state.pending && !state.pending.failed && Date.now() - state.pending.at < 120000) throw new CloudBusyError('Another device is publishing to cloud storage. Waiting for it to finish.')
      const [history, current] = await Promise.allSettled([versions(signal), currentFiles(signal)])
      if (history.status === 'rejected') throw history.reason
      if (current.status === 'rejected') throw current.reason
      const entries = await archiveVersions(history.value, state, signal), files = current.value
      if (!sameState(readState(await stateFolder(signal)), state)) throw changed()
      if (state.current && !entries.some(entry => entry.id === state.current)) throw new Error('cloud storage sync history is missing. Export your data before starting a new cloud folder.')
      let text: string
      try { text = serializeWorkspace(filesWorkspace(contents(files))) }
      catch (error) {
        if (!state.pending || !entries.some(entry => entry.id === state.pending!.id)) throw error
        // An interrupted rename can contain two files with the same level ID.
        // Never import that partial collection. Keep its raw files for conditional
        // recovery moves, and let the player choose a valid local/history version.
        observed = { state, files }; recovery = true
        return entries
      }
      const hash = await digest(text)
      if (state.pending && hash === state.pending.hash) {
        if (!entries.some(entry => entry.id === state.pending!.id)) throw new Error('Pending cloud version is missing.')
        const next: State = { version: 2, current: state.pending.id, hash }
        await setState(state, next, signal); state = next
      } else if (state.pending || state.current && hash !== state.hash || !state.current && files.size) {
        // External additions, edits and removals become recoverable versions.
        // An interrupted publication leaves this version AND its intended version
        // as heads, requiring a choice instead of silently accepting partial data.
        const entry = await create({ id: crypto.randomUUID(), hash, parents: state.current ? [state.current] : [], at: new Date().toISOString() }, text, signal)
        const next: State = { version: 2, current: entry.id, hash }
        await setState(state, next, signal); state = next; entries.push(entry)
      }
      if (!sameState(readState(await stateFolder(signal)), state)) throw changed()
      observed = { state, files }
      return entries
    },
    async publish(entry, text, signal) {
      if (!observed) throw new Error('Read the cloud folder before publishing.')
      const before = observed, target = workspaceFiles(parseWorkspace(text))
      // Already verified content in list(). Recheck IDs/eTags here rather than
      // downloading and taking two more complete snapshots of the same bytes.
      const fresh = before.files
      const checked = new Map([...await currentItems(signal)].map(([path, item]) => [path, { item, text: '' }]))
      if (signature(checked) !== signature(fresh)) throw changed()
      const hash = await digest(serializeWorkspace(filesWorkspace(target)))
      if (before.state.current === entry.id && before.state.hash === hash && fresh.size === target.size && [...target].every(([path, value]) => fresh.get(path)?.text === value)) {
        if (!sameState(readState(await stateFolder(signal)), before.state)) throw changed()
        return
      }
      let pending: State = { ...before.state, pending: { id: entry.id, hash, at: Date.now() } }
      await setState(before.state, pending, signal)
      const transaction = crypto.randomUUID()
      try {
        async function ownership() {
          if (!sameState(readState(await stateFolder(signal)), pending)) throw changed()
          if (Date.now() - pending.pending!.at > 30000) {
            const next = { ...pending, pending: { ...pending.pending!, at: Date.now() } }
            await setState(pending, next, signal); pending = next
          }
        }
        // Move originals with documented If-Match metadata preconditions, then
        // create replacements with conflictBehavior=fail. Never use an unchecked
        // overwrite PUT, even when a file changes outside the app during sync.
        async function retain(path: string, file: LiveFile) {
          const parts = path.split('/'), game = parts.shift()!, name = parts.pop()!
          const parent = await directory(`${game}/History/Replaced/${transaction}/${parts.join('/')}`.replace(/\/$/, ''), signal)
          await ownership()
          await move(file.item, parent, signal, name)
        }
        const remaining = new Map(fresh)
        const expected = new Map<string, LiveFile>()
        const changedFiles = [...target].filter(([path, value]) => fresh.get(path)?.text !== value)
        let completed = 0
        progress({ stage: 'publishing', completed, total: changedFiles.length })
        for (const [path, value] of [...target].sort(([a], [b]) => Number(a.endsWith('/index.json')) - Number(b.endsWith('/index.json')))) {
          const previousPath = [...remaining.keys()].find(name => name.toLowerCase() === path.toLowerCase())
          const previous = previousPath ? remaining.get(previousPath)! : undefined
          if (previousPath) remaining.delete(previousPath)
          if (previous && previousPath === path && previous.text === value) { expected.set(path, previous); continue }
          progress({ stage: 'publishing', completed, total: changedFiles.length, fileName: path.split('/').pop() })
          if (previous) await retain(previousPath!, previous)
          const item = await upload(path, value, signal, ownership)
          expected.set(path, { item, text: value })
          progress({ stage: 'publishing', completed: ++completed, total: changedFiles.length })
        }
        for (const [path, file] of remaining) await retain(path, file)
        progress({ stage: 'verifying' })
        // Successful create responses identify the uploaded bytes. A final
        // snapshot must match those exact file IDs/eTags, including unchanged
        // files and removals, before marking the workspace saved.
        const actual = new Map([...await currentItems(signal)].map(([path, item]) => [path, { item, text: '' }]))
        if (signature(actual) !== signature(expected)) throw changed()
        const next: State = { version: 2, current: entry.id, hash }
        await setState(pending, next, signal)
        observed = { state: next, files: expected }
      } catch (error) {
        // If the tab is closed, the pending marker expires. Otherwise make the
        // incomplete upload immediately reviewable on the next sync.
        if (!signal.aborted) await setState(pending, { ...pending, pending: { ...pending.pending!, failed: true } }, signal).catch(() => {})
        throw error
      }
    },
  }
}
