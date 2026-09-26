import { randomBytes } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { devLevelDirectory } from './dev-level-directory.ts'
import { directoryRepository } from '../src/games/jumping/levelRepository.ts'
import { decodeLevelFile, isLevelFileName } from '../src/games/jumping/levelAssets.ts'
import { parseLevel } from '../src/games/jumping/level.ts'
import { MAX_COLLECTION_BYTES, MAX_LEVEL_BYTES, MAX_LEVEL_FILES, textBytes } from '../src/games/jumping/levelLimits.ts'
import type { DeletedLevel } from '../src/games/jumping/levelFiles.ts'

const endpoint = '/__arcade/jumping-levels'
const failure = (status: number, message: string) => Object.assign(new Error(message), { status })
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw failure(400, 'Invalid request.')
  return value as Record<string, unknown>
}
const text = (value: unknown) => { if (typeof value !== 'string' || textBytes(value) > MAX_LEVEL_BYTES) throw failure(400, 'Invalid or oversized file contents.'); return value }
const optional = (value: unknown) => value == null ? undefined : text(value)
const name = (value: unknown) => { const result = text(value); if (!isLevelFileName(result) || result.length > 255) throw failure(400, 'Invalid level filename.'); return result }
const list = (value: unknown): unknown[] => { if (!Array.isArray(value) || value.length > MAX_LEVEL_FILES) throw failure(400, 'Too many levels.'); return value }
function deleted(value: unknown): DeletedLevel {
  const entry = object(value)
  return { directoryName: text(entry.directoryName), fileName: name(entry.fileName), sourceText: text(entry.sourceText), deletedAt: '' }
}

/** No generic filesystem API: only the same level operations available in Library. */
export function devLevelsMiddleware(project: string) {
  const token = randomBytes(32).toString('hex')
  let queue: Promise<unknown> = Promise.resolve()
  async function operation(value: unknown) {
    const request = object(value), args = list(request.args)
    const repository = directoryRepository(await devLevelDirectory(project))
    switch (request.method) {
      case 'read': return repository.read()
      case 'save': return repository.save(name(args[0]), parseLevel(args[1]), optional(args[2]), args[3] == null ? name(args[0]) : name(args[3]))
      case 'reorder': {
        if (!['filename', 'listed'].includes(args[2] as string)) throw failure(400, 'Invalid order mode.')
        return repository.reorder(list(args[0]).map(entry => ({ fileName: name(object(entry).fileName) })), optional(args[1]), args[2] as 'filename' | 'listed')
      }
      case 'remove': {
        const entry = object(args[0]), fileName = name(entry.fileName)
        return repository.remove(entry.missing === true ? { fileName, missing: true } : { fileName, sourceText: text(entry.sourceText), level: decodeLevelFile(text(entry.sourceText)) }, optional(args[1]))
      }
      case 'deleted': return repository.deleted()
      case 'restore': return repository.restore(deleted(args[0]), name(args[1]), optional(args[2]))
      case 'empty': {
        const entries = list(args[0]).map(deleted)
        if (entries.reduce((bytes, entry) => bytes + textBytes(entry.sourceText), 0) > MAX_COLLECTION_BYTES) throw failure(400, 'Recycle bin exceeds 25 MB.')
        await repository.empty(entries); return null
      }
      default: throw failure(400, 'Unknown level operation.')
    }
  }
  return (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (req.url?.split('?')[0] !== endpoint) { next(); return }
    const send = (status: number, value: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(value))
    }
    void (async () => {
      const host = req.headers.host ?? '', origin = req.headers.origin
      const requestOrigin = `${'encrypted' in req.socket && req.socket.encrypted ? 'https' : 'http'}://${host}`
      if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host)
        || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '')
        || origin && origin !== requestOrigin
        || req.headers['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin') throw failure(403, 'Built-in editing is available only from this local dev server.')
      // Override any permissive dev-server CORS policy before returning the token.
      res.setHeader('Access-Control-Allow-Origin', requestOrigin)
      if (req.method === 'GET') { send(200, { token }); return }
      if (req.method !== 'POST') throw failure(405, 'Use GET or POST.')
      if (req.headers['x-arcade-level-token'] !== token || req.headers['content-type'] !== 'application/json') throw failure(403, 'Invalid development session. Refresh and try again.')
      const chunks: Buffer[] = []; let bytes = 0
      for await (const chunk of req) {
        bytes += chunk.length
        if (bytes > MAX_COLLECTION_BYTES * 2 + MAX_LEVEL_BYTES) throw failure(413, 'Request is too large.')
        chunks.push(chunk)
      }
      const payload: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      const result = queue.then(() => operation(payload))
      queue = result.catch(() => {})
      send(200, await result)
    })().catch(error => send(error.status ?? 400, { error: error.message }))
  }
}

export function devLevelsPlugin(): Plugin {
  return { name: 'local-built-in-level-editor', apply: 'serve', configureServer(server) {
    if (!server.config.isProduction) server.middlewares.use(devLevelsMiddleware(server.config.root))
  } }
}
