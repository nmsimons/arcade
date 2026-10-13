import { readFile, lstat } from 'node:fs/promises'
import { join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { decodeLevelManifest, decodeLevelFile, playableLevelFile } from '../src/games/jumping/levelAssets.ts'
import { MAX_LEVEL_BYTES } from '../src/games/jumping/levelLimits.ts'


/** Read-only, manifest-listed assets outside public/. Vite builds and previews
 * never install this middleware or copy these maps into their output. */
export function devStressLevelsMiddleware(project: string, base = '/') {
  const endpoint = `${base.replace(/\/?$/, '/')}__arcade/jumping-stress-levels/`
  const directory = join(project, 'dev/levels/jumping')
  async function read(name: string) {
    const path = join(directory, name), info = await lstat(path)
    if (!info.isFile() || info.nlink !== 1 || info.size > MAX_LEVEL_BYTES) throw new Error('Invalid stress level asset.')
    return readFile(path, 'utf8')
  }
  return (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const path = req.url?.split('?')[0] ?? ''
    if (!path.startsWith(endpoint)) { next(); return }
    const send = (status: number, text: string) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
      res.end(req.method === 'HEAD' ? undefined : text)
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { send(405, JSON.stringify({ error: 'Use GET or HEAD.' })); return }
    void (async () => {
      const name = decodeURIComponent(path.slice(endpoint.length))
      const index = await read('index.json'), manifest = decodeLevelManifest(index)
      if (name === 'index.json') { send(200, index); return }
      if (!manifest.levels.includes(name)) { send(404, JSON.stringify({ error: 'Unknown stress level.' })); return }
      const text = await read(name)
      playableLevelFile({ fileName: name, level: decodeLevelFile(text) })
      send(200, text)
    })().catch(() => send(404, JSON.stringify({ error: 'Stress level unavailable.' })))
  }
}

export function devStressLevelsPlugin(): Plugin {
  return { name: 'development-stress-levels', apply: 'serve', configureServer(server) {
    if (!server.config.isProduction) server.middlewares.use(devStressLevelsMiddleware(server.config.root, server.config.base))
  } }
}
