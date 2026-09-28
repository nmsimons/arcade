import type { JumpLevel } from './level.ts'
import type { CasterGroup } from './lightingModel.ts'

/** Geometry-only preparation also accepts unfinished editor documents. */
export function prepareLightingGeometry(level: JumpLevel, signal: AbortSignal): Promise<CasterGroup[]> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException('Cancelled', 'AbortError')); return }
    const worker = new Worker(new URL('./lightingGeometry.worker.ts', import.meta.url), { type: 'module' })
    const stop = () => { clearTimeout(timer); worker.terminate(); signal.removeEventListener('abort', abort) }
    const abort = () => { stop(); reject(new DOMException('Cancelled', 'AbortError')) }
    const timer = setTimeout(() => { stop(); reject(new Error('Lighting took too long to prepare. Simplify the terrain.')) }, 5000)
    signal.addEventListener('abort', abort, { once: true })
    worker.onmessage = (event: MessageEvent<{ groups: CasterGroup[]; error?: string }>) => {
      stop(); if (event.data.error) reject(new Error(event.data.error)); else resolve(event.data.groups)
    }
    worker.onerror = () => { stop(); reject(new Error('Could not prepare lighting geometry.')) }
    worker.onmessageerror = () => { stop(); reject(new Error('Could not read lighting geometry.')) }
    try { worker.postMessage(level) } catch (error) { stop(); reject(error) }
  })
}
