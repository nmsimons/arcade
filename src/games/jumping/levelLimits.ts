export const MAX_LEVEL_BYTES = 1_000_000
export const MAX_LEVEL_FILES = 500
export const MAX_COLLECTION_BYTES = 25_000_000
export const LEVEL_READ_CONCURRENCY = 4
export type LevelInputFile = Pick<File, 'name' | 'size' | 'text'>
export const textBytes = (text: string) => new TextEncoder().encode(text).byteLength

export function checkCollectionSize(bytes: number, count: number) {
  if (count > MAX_LEVEL_FILES) throw new Error(`Choose a folder with at most ${MAX_LEVEL_FILES} JSON levels.`)
  if (bytes > MAX_COLLECTION_BYTES) throw new Error('Level collections must be at most 25 MB in total.')
}
export async function readLevelText(file: LevelInputFile) {
  if (file.size > MAX_LEVEL_BYTES) throw new Error('Level files must be smaller than 1 MB.')
  const text = await file.text()
  if (textBytes(text) > MAX_LEVEL_BYTES) throw new Error('Level files must be smaller than 1 MB.')
  return text
}
export async function readInBatches<T, R>(items: readonly T[], read: (item: T, index: number) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(items.length, LEVEL_READ_CONCURRENCY) }, async () => {
    while (next < items.length) {
      const index = next++
      try { results[index] = { status: 'fulfilled', value: await read(items[index], index) } }
      catch (reason) { results[index] = { status: 'rejected', reason } }
    }
  }))
  return results
}

/** Count actual streamed bytes, even without or with an incorrect Content-Length. */
export async function readLevelResponse(response: Response, consume: (bytes: number) => void) {
  if (Number(response.headers.get('content-length')) > MAX_LEVEL_BYTES) {
    await response.body?.cancel(); throw new Error('Level files must be smaller than 1 MB.')
  }
  if (!response.body) return ''
  const reader = response.body.getReader(), decoder = new TextDecoder()
  let text = '', bytes = 0
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      bytes += chunk.value.byteLength
      consume(chunk.value.byteLength)
      if (bytes > MAX_LEVEL_BYTES) throw new Error('Level files must be smaller than 1 MB.')
      text += decoder.decode(chunk.value, { stream: true })
    }
    return text + decoder.decode()
  } catch (error) { await reader.cancel().catch(() => {}); throw error }
  finally { reader.releaseLock() }
}
