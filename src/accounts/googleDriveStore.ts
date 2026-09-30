import type { CloudFolder, CloudProgress, CloudStore } from './cloudStore.ts'
import { boundedText } from './cloudStore.ts'
import { CloudChangedError } from './errors.ts'
import { MAX_WORKSPACE_BYTES, object } from './data.ts'
import { LEVEL_FOLDER, portablePath } from './cloudLayout.ts'
import { decodeLevelFile, decodeLevelManifest, isLevelFileName } from '../games/jumping/levelAssets.ts'
import { MAX_LEVEL_BYTES, readInBatches, textBytes } from '../games/jumping/levelLimits.ts'
import { createPortableStore } from './portableStore.ts'
import type { Item } from './portableStore.ts'

const FOLDER = 'application/vnd.google-apps.folder'
const FIELDS = 'id,title,mimeType,etag,fileSize,description,parents(id),alternateLink'
const ROOT_QUERY = `mimeType = '${FOLDER}' and properties has { key='dreamLargeArcade' and value='root-v2' and visibility='PRIVATE' }`
type DriveItem = Item & { parents: string[] }
export interface PickedGoogleFile { name: string; text: string; inLibrary: boolean }
interface GoogleDriveStore extends CloudStore {
  levelFolder(signal: AbortSignal): Promise<string>
  pickedFiles(ids: string[], signal: AbortSignal): Promise<PickedGoogleFile[]>
}
const changed = () => new CloudChangedError('Google Drive files changed during sync. We’ll check them again; your local saves are safe.')
const quote = (value: string) => `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`

/** Visible, portable files using drive.file, never access to the user's whole Drive. */
export function createGoogleDriveStore(token: () => Promise<string>, fetcher: typeof fetch, onFolder?: (folder: CloudFolder) => void, progress?: (value: CloudProgress) => void): GoogleDriveStore {
  const directories = new Map<string, Promise<string>>()
  let rootRequest: Promise<DriveItem> | undefined
  async function call(path: string, signal: AbortSignal, init: RequestInit = {}) {
    const url = new URL(path, 'https://www.googleapis.com')
    // v2 exposes the resource ETag in JSON, including listings. Conditional
    // metadata updates therefore do not depend on CORS exposing a response header.
    if (url.origin !== 'https://www.googleapis.com' || url.username || url.password || !/^\/(?:upload\/)?drive\/v2\/files(?:\/|$)/.test(url.pathname)) throw new Error('Invalid storage endpoint.')
    const access = await token(); signal.throwIfAborted()
    const response = await fetcher(url.href, { ...init, signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]), credentials: 'omit', cache: 'no-store', redirect: 'error', headers: { ...init.headers, Authorization: `Bearer ${access}` } })
    if (response.status === 409 || response.status === 412) throw changed()
    return response
  }
  async function json(response: Response): Promise<unknown> {
    const text = await boundedText(response, 2_000_000)
    try { return JSON.parse(text) }
    catch { throw new Error('Google Drive’s response could not be read. Please try syncing again.') }
  }
  function item(value: unknown): DriveItem {
    if (!object(value) || typeof value.id !== 'string' || !value.id || value.id.length > 300 || typeof value.title !== 'string' || typeof value.etag !== 'string' || !value.etag || typeof value.mimeType !== 'string' || !Array.isArray(value.parents) || value.parents.some(parent => !object(parent) || typeof parent.id !== 'string')) throw new Error('Google Drive did not return file version information.')
    return { id: value.id, name: value.title, eTag: value.etag, size: Number(value.fileSize ?? 0), description: value.description as string | undefined, parents: value.parents.map(parent => parent.id), ...(value.mimeType === FOLDER ? { folder: {} } : { file: {} }) }
  }
  async function list(query: string, signal: AbortSignal, limit = 2000) {
    let pageToken = ''
    const items: DriveItem[] = [], seen = new Set<string>()
    do {
      if (seen.has(pageToken) || seen.size >= Math.ceil(limit / 200)) throw new Error('Google Drive returned an invalid or oversized file listing.')
      seen.add(pageToken)
      const params = new URLSearchParams({ q: `trashed = false and (${query})`, spaces: 'drive', maxResults: '200', fields: `nextPageToken,items(${FIELDS})`, ...(pageToken ? { pageToken } : {}) })
      const page = await json(await call(`/drive/v2/files?${params}`, signal))
      if (!object(page) || !Array.isArray(page.items) || (page.nextPageToken !== undefined && typeof page.nextPageToken !== 'string')) throw new Error('Google Drive returned an invalid file listing.')
      items.push(...page.items.map(item))
      if (items.length > limit) throw new Error('This Google Drive folder contains too many files.')
      pageToken = page.nextPageToken as string ?? ''
    } while (pageToken)
    return items
  }
  function unique(items: DriveItem[], name: string) {
    if (items.length > 1) throw new Error(`Google Drive has more than one “${name}”. Rename or move the extra item in Drive, then sync again. Your local files are kept.`)
    return items[0]
  }
  async function createFolder(name: string, parent: string, signal: AbortSignal, root = false) {
    return item(await json(await call(`/drive/v2/files?fields=${FIELDS}`, signal, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: name, mimeType: FOLDER, parents: [{ id: parent }], ...(root ? { properties: [{ key: 'dreamLargeArcade', value: 'root-v2', visibility: 'PRIVATE' }] } : {}) }) })))
  }
  async function discoverRoot(signal: AbortSignal) {
    const findRoot = async () => {
      const roots = await list(ROOT_QUERY, signal)
      if (roots.length > 1) throw new Error('Google Drive has multiple Arcade folders. Back up their files, then move the extra folder to Trash in Drive and sync again. Your local files are kept.')
      return roots[0]
    }
    let found = await findRoot()
    if (!found) {
      await createFolder('Dream Large Arcade', 'root', signal, true)
      found = await findRoot()
    }
    if (!found?.folder) throw changed()
    onFolder?.({ name: found.name, webUrl: `https://drive.google.com/drive/folders/${encodeURIComponent(found.id)}` })
    return found
  }
  async function root(signal: AbortSignal) {
    // Coalesce concurrent discovery, but recheck on later snapshots. Duplicate
    // first-time folders on two devices must never hide one device's files.
    rootRequest ??= discoverRoot(signal).catch(error => { rootRequest = undefined; throw error })
    return rootRequest
  }
  async function child(parent: string, name: string, signal: AbortSignal) {
    return unique(await list(`${quote(parent)} in parents and title = ${quote(name)}`, signal), name)
  }
  async function lookup(path: string, signal: AbortSignal): Promise<DriveItem | undefined> {
    if (!path) return root(signal)
    const parts = portablePath(path).split('/'), name = parts.pop()!, parentPath = parts.join('/')
    const parent = parentPath ? await folderId(parentPath, signal) : (await root(signal)).id
    return parent ? child(parent, name, signal) : undefined
  }
  async function folderId(path: string, signal: AbortSignal): Promise<string | undefined> {
    const cached = directories.get(path)
    if (cached) return cached
    const folder = await lookup(path, signal)
    if (!folder) return
    if (!folder.folder) throw new Error(`“${path}” must be a folder in Google Drive.`)
    directories.set(path, Promise.resolve(folder.id))
    return folder.id
  }
  async function directory(path: string, signal: AbortSignal): Promise<string> {
    if (!path) return (await root(signal)).id
    const existing = directories.get(path)
    if (existing) return existing
    const task = (async () => {
      const parts = portablePath(path).split('/'), name = parts.pop()!, parent = await directory(parts.join('/'), signal)
      let found = await child(parent, name, signal)
      if (!found) { await createFolder(name, parent, signal); found = await child(parent, name, signal) }
      if (!found?.folder) throw new Error(`“${path}” must be a folder in Google Drive.`)
      return found.id
    })()
    directories.set(path, task)
    try { return await task } catch (error) { directories.delete(path); throw error }
  }
  async function children(path: string, signal: AbortSignal) {
    const id = await folderId(path, signal)
    if (!id) return []
    const files = await list(`${quote(id)} in parents`, signal, path === 'Sync history/Versions' ? 20000 : 2000)
    const names = new Set<string>()
    for (const file of files) {
      const name = file.name.toLowerCase()
      if (names.has(name)) throw new Error(`Google Drive has duplicate filenames in “${path}”. Rename the extra file before syncing.`)
      names.add(name)
    }
    return files
  }
  async function download(file: Item, signal: AbortSignal) {
    if ((file.size ?? 0) > MAX_WORKSPACE_BYTES) throw new Error('Cloud file exceeds the size limit.')
    const path = `/drive/v2/files/${encodeURIComponent(file.id)}`
    const text = await boundedText(await call(`${path}?alt=media`, signal))
    const after = item(await json(await call(`${path}?fields=${FIELDS}`, signal)))
    if (after.eTag !== file.eTag) throw changed()
    return text
  }
  async function upload(path: string, text: string, signal: AbortSignal, beforeWrite?: () => Promise<void>) {
    const parts = portablePath(path).split('/'), name = parts.pop()!, parent = await directory(parts.join('/'), signal)
    if (await child(parent, name, signal)) throw changed()
    await beforeWrite?.()
    const boundary = `arcade_${crypto.randomUUID()}`
    const metadata = { title: name, mimeType: 'application/json', parents: [{ id: parent }] }
    const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${text}\r\n--${boundary}--`
    // Always create. Google permits duplicate names; final listings explicitly
    // reject those instead of ever picking or overwriting an arbitrary file.
    return item(await json(await call(`/upload/drive/v2/files?uploadType=multipart&fields=${FIELDS}`, signal, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body })))
  }
  async function patch(file: Item, data: object, signal: AbortSignal, params = '') {
    return item(await json(await call(`/drive/v2/files/${encodeURIComponent(file.id)}?fields=${FIELDS}${params}`, signal, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'If-Match': file.eTag }, body: JSON.stringify(data) })))
  }
  const store = createPortableStore({ lookup, directory, children, download, upload,
    beginSnapshot: () => { directories.clear(); rootRequest = undefined },
    describe: (file, description, signal) => patch(file, { description }, signal),
    move: async (file, parent, signal, name = file.name) => {
      const other = await child(parent, name, signal)
      if (other && other.id !== file.id) throw changed()
      const parents = (file as DriveItem).parents
      return patch(file, { title: name }, signal, `&addParents=${encodeURIComponent(parent)}&removeParents=${encodeURIComponent(parents.join(','))}`)
    },
  }, progress)
  return { ...store,
    levelFolder: signal => directory(LEVEL_FOLDER, signal),
    async pickedFiles(ids, signal) {
      if (!ids.length || ids.length > 501 || ids.some(id => !/^[\w-]{1,300}$/.test(id)) || new Set(ids).size !== ids.length) throw new Error('Invalid Google Drive file selection.')
      const parent = await directory(LEVEL_FOLDER, signal), names = new Set<string>(), files: PickedGoogleFile[] = []
      let bytes = 0
      const results = await readInBatches(ids, async id => {
        if (bytes > MAX_WORKSPACE_BYTES) throw new Error('The selected level files exceed the import size limit.')
        const file = item(await json(await call(`/drive/v2/files/${encodeURIComponent(id)}?fields=${FIELDS}`, signal)))
        if (!file.file || file.name !== 'index.json' && !isLevelFileName(file.name)) throw new Error('Choose level JSON files and an optional index.json, not folders or other documents.')
        portablePath(file.name)
        if (file.name.includes('/') || names.has(file.name.toLowerCase())) throw new Error('Choose each filename only once.')
        names.add(file.name.toLowerCase())
        if ((file.size ?? 0) > MAX_LEVEL_BYTES) throw new Error(`“${file.name}” exceeds the 1 MB level file limit.`)
        const text = await download(file, signal), size = textBytes(text)
        bytes += size
        if (size > MAX_LEVEL_BYTES || bytes > MAX_WORKSPACE_BYTES) throw new Error('The selected level files exceed the import size limit.')
        if (file.name === 'index.json') decodeLevelManifest(text)
        else decodeLevelFile(text)
        return { name: file.name, text, inLibrary: file.parents.includes(parent) }
      })
      for (const result of results) {
        if (result.status === 'rejected') throw result.reason
        files.push(result.value)
      }
      return files
    },
  }
}
