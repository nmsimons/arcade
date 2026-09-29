import type { Provider } from './auth.ts'
import { MAX_WORKSPACE_BYTES, object } from './data.ts'

export interface CloudEntry { fileId: string; id: string; parents: string[]; hash: string; at: string }
export interface CloudStore {
  list(signal: AbortSignal): Promise<CloudEntry[]>
  read(entry: CloudEntry, signal: AbortSignal): Promise<string>
  create(entry: Omit<CloudEntry, 'fileId'>, text: string, signal: AbortSignal): Promise<CloudEntry>
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const filename = (id: string) => `arcade-v1-${id}.json`
const prefix = 'Arcade save v1 '
function metadata(value: unknown): Omit<CloudEntry, 'fileId'> {
  if (!object(value) || typeof value.id !== 'string' || !uuid.test(value.id) || typeof value.hash !== 'string' || !/^[0-9a-f]{64}$/.test(value.hash) || typeof value.at !== 'string' || !Number.isFinite(Date.parse(value.at)) || !Array.isArray(value.parents) || value.parents.length > 16 || value.parents.some(p => typeof p !== 'string' || !uuid.test(p) || p === value.id) || new Set(value.parents).size !== value.parents.length) throw new Error('Cloud save metadata is invalid. No progress was replaced.')
  return { id: value.id, parents: value.parents, hash: value.hash, at: value.at }
}
export function parseEntry(value: unknown): CloudEntry | undefined {
  if (!object(value) || typeof value.name !== 'string' || !value.name.startsWith('arcade-v1-')) return
  // A OneDrive upload is published only after its description has been written.
  if (value.description === undefined || value.description === '') return
  if (typeof value.description !== 'string' || !value.description.startsWith(prefix) || value.description.length > 2000) throw new Error('Unrecognized cloud save. No progress was replaced.')
  const entry = metadata(JSON.parse(value.description.slice(prefix.length)))
  if (value.name !== filename(entry.id) || typeof value.id !== 'string' || value.id.length > 300 || !value.id || Number(value.size) > MAX_WORKSPACE_BYTES) throw new Error('Invalid cloud save file.')
  return { ...entry, fileId: value.id }
}
export async function boundedText(response: Response, max = MAX_WORKSPACE_BYTES): Promise<string> {
  if (!response.ok) {
    let reasons: string[] = []
    try {
      const error = JSON.parse(await boundedText(new Response(response.body), 8192)).error
      reasons = [error?.code, ...(Array.isArray(error?.errors) ? error.errors.map((item: { reason?: string }) => item.reason) : [])]
    } catch { /* Do not expose raw provider error bodies or download unbounded errors. */ }
    if (response.status === 507 || reasons.some(reason => ['storageQuotaExceeded', 'quotaLimitReached'].includes(reason))) throw new Error('Your cloud drive is full. Free some space and sync again.')
    if (response.status === 429 || reasons.some(reason => ['rateLimitExceeded', 'userRateLimitExceeded', 'activityLimitReached'].includes(reason))) throw new Error('The storage provider is busy. Try syncing again later.')
    if (response.status === 401 || response.status === 403) throw new Error('Cloud access needs attention. Reconnect and check the granted permission.')
    throw new Error(`Cloud storage request failed (${response.status}). Local progress is safe.`)
  }
  if (Number(response.headers.get('content-length')) > max) { await response.body?.cancel(); throw new Error('Cloud response exceeds the size limit.') }
  if (!response.body) return ''
  const reader = response.body.getReader(), decoder = new TextDecoder()
  let bytes = 0, text = ''
  try {
    for (;;) {
      const part = await reader.read()
      if (part.done) break
      bytes += part.value.length
      if (bytes > max) throw new Error('Cloud response exceeds the size limit.')
      text += decoder.decode(part.value, { stream: true })
    }
    return text + decoder.decode()
  } catch (error) { await reader.cancel().catch(() => {}); throw error }
  finally { reader.releaseLock() }
}
const idPath = (id: string) => encodeURIComponent(id)
/** Download URLs come only from Graph, never from save content; never send tokens. */
export function oneDriveDownloadUrl(value: unknown) {
  if (typeof value !== 'string') throw new Error('OneDrive did not provide a download URL.')
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !['.1drv.com', '.storage.live.com'].some(suffix => url.hostname.endsWith(suffix))) throw new Error('OneDrive returned an unsupported download host.')
  return url.href
}
export function createCloudStore(provider: Provider, token: () => Promise<string>, fetcher: typeof fetch = fetch): CloudStore {
  const origin = provider === 'google' ? 'https://www.googleapis.com' : 'https://graph.microsoft.com'
  async function call(path: string, signal: AbortSignal, init: RequestInit = {}) {
    const url = new URL(path, origin)
    if (url.origin !== origin || url.username || url.password || !(provider === 'google' ? /^\/(?:upload\/)?drive\/v3\// : /^\/v1\.0\/me\/drive\//).test(url.pathname)) throw new Error('Invalid storage endpoint.')
    const access = await token()
    signal.throwIfAborted()
    return fetcher(url.href, { ...init, signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]), cache: 'no-store', credentials: 'omit', redirect: 'error', headers: { ...init.headers, Authorization: `Bearer ${access}` } })
  }
  async function json(path: string, signal: AbortSignal, init?: RequestInit) { return JSON.parse(await boundedText(await call(path, signal, init), 2_000_000)) as Record<string, unknown> }
  let root: string | undefined
  async function appRoot(signal: AbortSignal) {
    if (!root) {
      const item = await json('/v1.0/me/drive/special/approot', signal)
      if (typeof item.id !== 'string' || !item.id) throw new Error('OneDrive app folder is unavailable.')
      root = item.id
    }
    return root
  }
  return {
    async list(signal) {
      let path = provider === 'google'
        ? '/drive/v3/files?spaces=appDataFolder&pageSize=1000&fields=nextPageToken,files(id,name,size,description)&q=trashed%3Dfalse'
        : `/v1.0/me/drive/items/${idPath(await appRoot(signal))}/children?$top=200&$select=id,name,size,description`
      const entries: CloudEntry[] = [], seenPages = new Set<string>()
      let scanned = 0
      while (path) {
        if (seenPages.has(path) || seenPages.size >= 20) throw new Error('Cloud history is too large or pagination is invalid. Export your data before clearing old cloud history.')
        seenPages.add(path)
        const page = await json(path, signal), files = page[provider === 'google' ? 'files' : 'value']
        if (!Array.isArray(files)) throw new Error('Invalid cloud file listing.')
        scanned += files.length
        if (scanned > 2000) throw new Error('Cloud history has reached 2,000 files. Export your data before clearing old cloud history.')
        for (const file of files) { const entry = parseEntry(file); if (entry) entries.push(entry) }
        const next = page[provider === 'google' ? 'nextPageToken' : '@odata.nextLink']
        if (next !== undefined && typeof next !== 'string') throw new Error('Invalid cloud continuation.')
        path = next ? provider === 'google' ? `/drive/v3/files?spaces=appDataFolder&pageSize=1000&fields=nextPageToken,files(id,name,size,description)&q=trashed%3Dfalse&pageToken=${encodeURIComponent(next as string)}` : next as string : ''
      }
      // Duplicate logical IDs are ambiguous, even if providers permit duplicate filenames.
      if (new Set(entries.map(e => e.id)).size !== entries.length) throw new Error('Duplicate cloud saves need attention. No progress was replaced.')
      return entries
    },
    async read(entry, signal) {
      if (provider === 'google') return boundedText(await call(`/drive/v3/files/${idPath(entry.fileId)}?alt=media`, signal))
      const item = await json(`/v1.0/me/drive/items/${idPath(entry.fileId)}?$select=id,@microsoft.graph.downloadUrl`, signal)
      const url = oneDriveDownloadUrl(item['@microsoft.graph.downloadUrl'])
      return boundedText(await fetcher(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]), credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer' }))
    },
    async create(entry, text, signal) {
      metadata(entry)
      if (new TextEncoder().encode(text).length > MAX_WORKSPACE_BYTES) throw new Error('Cloud saves must fit within 4 MB.')
      const description = prefix + JSON.stringify(entry)
      let result: Record<string, unknown>
      if (provider === 'google') {
        const boundary = `arcade_${crypto.randomUUID()}`
        const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: filename(entry.id), parents: ['appDataFolder'], description })}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${text}\r\n--${boundary}--`
        result = await json('/upload/drive/v3/files?uploadType=multipart&fields=id', signal, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body })
      } else {
        result = await json(`/v1.0/me/drive/items/${idPath(await appRoot(signal))}:/${filename(entry.id)}:/content?@microsoft.graph.conflictBehavior=fail`, signal, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: text })
        if (typeof result.id !== 'string') throw new Error('OneDrive upload did not return a file.')
        await json(`/v1.0/me/drive/items/${idPath(result.id)}`, signal, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ description }) })
      }
      if (typeof result.id !== 'string') throw new Error('Cloud upload did not return a file.')
      return { ...entry, fileId: result.id }
    },
  }
}
