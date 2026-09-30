import type { CloudFolder, CloudProgress, CloudStore } from './cloudStore.ts'
import { CloudChangedError } from './errors.ts'
import { boundedText, oneDriveDownloadUrl } from './cloudStore.ts'
import { MAX_WORKSPACE_BYTES, object } from './data.ts'
import { portablePath } from './cloudLayout.ts'
import { createPortableStore } from './portableStore.ts'
import type { Item } from './portableStore.ts'
export { ACTIVE_HISTORY_LIMIT } from './portableStore.ts'
const VERSIONS = 'Sync history/Versions'
const changed = () => new CloudChangedError('OneDrive files changed during sync. Sync again to review both versions; local progress is safe.')
const encoded = (path: string) => portablePath(path).split('/').map(encodeURIComponent).join('/')
function parseJson(text: string, source: string): unknown {
  try { return JSON.parse(text) }
  catch { throw new Error(`${source} could not be read. Please try syncing again.`) }
}

function description(file: Item): string {
  if (file.description == null || file.description === '') return ''
  if (typeof file.description !== 'string' || file.description.length > 16000) throw new Error('OneDrive’s sync information could not be read. Please try syncing again.')
  // Personal OneDrive descriptions are display text and may contain HTML
  // entities, including numeric braces. Decode exactly once, only in this
  // metadata field; never interpret HTML or transform downloaded game files.
  const named: Record<string, string> = { quot: '"', amp: '&', apos: "'", lt: '<', gt: '>' }
  return file.description.replace(/&(?:#([0-9]{1,7})|#[xX]([0-9a-fA-F]{1,6})|(quot|amp|apos|lt|gt));/g, (entity, decimal: string | undefined, hex: string | undefined, name: string | undefined) => {
    if (name) return named[name]
    const code = Number.parseInt(decimal ?? hex!, decimal ? 10 : 16)
    return code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : entity
  })
}

function item(value: unknown): Item {
  if (!object(value) || typeof value.id !== 'string' || !value.id || value.id.length > 300 || typeof value.name !== 'string' || typeof value.eTag !== 'string' || !value.eTag) throw new Error('OneDrive did not return file version information.')
  const result = value as unknown as Item
  return { ...result, description: description(result) }
}

export function createOneDriveStore(token: () => Promise<string>, fetcher: typeof fetch, onFolder?: (folder: CloudFolder) => void, progress: (value: CloudProgress) => void = () => {}): CloudStore {
  let root: string | undefined
  const directories = new Map<string, string>()
  const creatingDirectories = new Map<string, Promise<string>>()
  async function call(path: string, signal: AbortSignal, init: RequestInit = {}) {
    const url = new URL(path, 'https://graph.microsoft.com')
    if (url.origin !== 'https://graph.microsoft.com' || url.username || url.password || !/^\/v1\.0\/me\/drive\//.test(url.pathname)) throw new Error('Invalid storage endpoint.')
    const access = await token(); signal.throwIfAborted()
    const response = await fetcher(url.href, { ...init, signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]), cache: 'no-store', credentials: 'omit', redirect: 'error', headers: { ...init.headers, Authorization: `Bearer ${access}` } })
    if (response.status === 409 || response.status === 412) throw changed()
    return response
  }
  const json = async (response: Response) => parseJson(await boundedText(response, 2_000_000), 'OneDrive’s response')
  const byId = (id: string) => `/v1.0/me/drive/items/${encodeURIComponent(id)}`
  async function appRoot(signal: AbortSignal) {
    if (!root) {
      const folder = item(await json(await call('/v1.0/me/drive/special/approot', signal)))
      if (!folder.folder) throw new Error('OneDrive did not return an app folder.')
      root = folder.id
      let webUrl: string | undefined
      try {
        // Use Graph's actual folder link, never a guessed path or a download URL.
        const url = new URL(folder.webUrl ?? '')
        if (url.protocol === 'https:' && !url.username && !url.password) webUrl = url.href
      } catch { /* Folder discovery and sync remain usable without a web link. */ }
      onFolder?.({ name: folder.name, webUrl })
    }
    return root
  }
  async function lookup(path: string, signal: AbortSignal): Promise<Item | undefined> {
    const response = await call(`${byId(await appRoot(signal))}:/${encoded(path)}`, signal)
    if (response.status === 404) return
    return item(await json(response))
  }
  async function directory(path: string, signal: AbortSignal): Promise<string> {
    if (!path) return appRoot(signal)
    const cached = directories.get(path)
    if (cached) return cached
    const pending = creatingDirectories.get(path)
    if (pending) return pending
    const work = findOrCreateDirectory(path, signal)
    creatingDirectories.set(path, work)
    try { return await work } finally { creatingDirectories.delete(path) }
  }
  async function findOrCreateDirectory(path: string, signal: AbortSignal): Promise<string> {
    let found = await lookup(path, signal)
    if (!found) {
      const parts = path.split('/'), name = parts.pop()!, parent = await directory(parts.join('/'), signal)
      try {
        found = item(await json(await call(`${byId(parent)}/children`, signal, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }) })))
      } catch (error) {
        // Two clients may create the same container; neither may replace it.
        if (signal.aborted) throw error
        found = await lookup(path, signal)
        if (!found) throw error
      }
    }
    if (!found.folder) throw new Error(`“${path}” must be a folder in OneDrive.`)
    directories.set(path, found.id)
    return found.id
  }
  async function children(path: string, signal: AbortSignal): Promise<Item[]> {
    // Graph supports listing by path; looking up each folder first doubled the
    // round trips in every snapshot. Keep path addressing to detect moved folders.
    let next = `${byId(await appRoot(signal))}:/${encoded(path)}:/children?$top=200&$select=id,name,eTag,size,file,folder,description`
    const values: Item[] = [], pages = new Set<string>()
    while (next) {
      if (pages.has(next) || pages.size >= (path === VERSIONS ? 100 : 20)) throw new Error('OneDrive file listing is too large or invalid.')
      pages.add(next)
      const response = await call(next, signal)
      if (response.status === 404 && pages.size === 1) return []
      const page = await json(response)
      if (!object(page) || !Array.isArray(page.value)) throw new Error('Invalid OneDrive file listing.')
      values.push(...page.value.map(item))
      if (values.length > (path === VERSIONS ? 20000 : 2000)) throw new Error('This OneDrive folder contains too many files.')
      const continuation = page['@odata.nextLink']
      if (continuation !== undefined && typeof continuation !== 'string') throw new Error('Invalid cloud continuation.')
      next = continuation as string ?? ''
    }
    return values
  }
  async function download(file: Item, signal: AbortSignal) {
    // downloadUrl is an instance annotation, not an ordinary selected field.
    // Read full metadata so Graph's $select projection cannot strip it out.
    const info = await json(await call(byId(file.id), signal))
    if (!object(info) || info.id !== file.id || info.eTag !== file.eTag) throw changed()
    if (Number(info.size) > MAX_WORKSPACE_BYTES) throw new Error('Cloud file exceeds the size limit.')
    const url = oneDriveDownloadUrl(info['@microsoft.graph.downloadUrl'])
    return boundedText(await fetcher(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]), credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer' }))
  }
  async function upload(path: string, text: string, signal: AbortSignal, beforeWrite?: () => Promise<void>) {
    const parts = portablePath(path).split('/'), name = parts.pop()!, parent = await directory(parts.join('/'), signal)
    await beforeWrite?.()
    return item(await json(await call(`${byId(parent)}:/${encodeURIComponent(name)}:/content?@microsoft.graph.conflictBehavior=fail`, signal, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: text })))
  }
  async function patch(file: Item, value: object, signal: AbortSignal) {
    return item(await json(await call(byId(file.id), signal, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'If-Match': file.eTag }, body: JSON.stringify(value) })))
  }

  return createPortableStore({ lookup, directory, children, download, upload,
    describe: (file, description, signal) => patch(file, { description }, signal),
    move: (file, parent, signal, name) => patch(file, { parentReference: { id: parent }, ...(name ? { name } : {}), '@microsoft.graph.conflictBehavior': 'fail' }, signal),
  }, progress)
}
