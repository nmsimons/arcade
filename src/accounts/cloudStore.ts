import type { Provider } from './auth.ts'
import { MAX_WORKSPACE_BYTES } from './data.ts'
import { createOneDriveStore } from './oneDriveStore.ts'
import { createGoogleDriveStore } from './googleDriveStore.ts'
import { CloudAccessError } from './errors.ts'

export interface CloudEntry { fileId: string; id: string; parents: string[]; hash: string; at: string }
export interface CloudFolder { name: string; webUrl?: string }
export interface CloudProgress { stage: 'checking' | 'history' | 'publishing' | 'verifying'; completed?: number; total?: number; fileName?: string }
export interface CloudStore {
  list(signal: AbortSignal): Promise<CloudEntry[]>
  read(entry: CloudEntry, signal: AbortSignal): Promise<string>
  create(entry: Omit<CloudEntry, 'fileId'>, text: string, signal: AbortSignal): Promise<CloudEntry>
  publish?(entry: CloudEntry, text: string, signal: AbortSignal): Promise<void>
  recoveryRequired?(): boolean
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
    if (reasons.some(reason => ['accessNotConfigured', 'serviceDisabled'].includes(reason))) throw new Error('The Google Drive API is not enabled for this app. Enable it in the Google Cloud project, then try syncing again.')
    if (response.status === 401 || response.status === 403) throw new CloudAccessError('Cloud access needs attention. Reconnect and check the granted permission.')
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
/** Download URLs come only from Graph, never from save content; never send tokens. */
export function oneDriveDownloadUrl(value: unknown) {
  if (typeof value !== 'string') throw new Error('OneDrive did not provide a download URL.')
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.username || url.password || url.port) throw new Error('OneDrive returned an invalid download link.')
  const supported = url.hostname === 'my.microsoftpersonalcontent.com'
    || ['.1drv.com', '.storage.live.com'].some(suffix => url.hostname.endsWith(suffix))
  // Only expose the hostname on failure: the path and query may contain a
  // private file identifier and a temporary download credential.
  if (!supported) throw new Error(`OneDrive returned an unsupported download host (${url.hostname}).`)
  return url.href
}
export function createCloudStore(provider: Provider, token: () => Promise<string>, fetcher: typeof fetch = fetch, onFolder?: (folder: CloudFolder) => void, progress?: (value: CloudProgress) => void): CloudStore {
  return provider === 'microsoft' ? createOneDriveStore(token, fetcher, onFolder, progress) : createGoogleDriveStore(token, fetcher, onFolder, progress)
}
