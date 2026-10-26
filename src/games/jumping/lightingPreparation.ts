import type { JumpLevel } from './level.ts'
import type { CasterGroup } from './lightingModel.ts'
import { LEVEL_PREPARATION_TIMEOUT, LEVEL_WORKER_START_TIMEOUT } from './levelPreparation.ts'

/** Geometry-only preparation also accepts unfinished editor documents. */
export function prepareLightingGeometry(level: JumpLevel, signal: AbortSignal): Promise<CasterGroup[]> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException('Cancelled', 'AbortError')); return }
    const request = structuredClone(level)
    const worker = new Worker(new URL('./lightingGeometry.worker.ts', import.meta.url), { type: 'module' })
    let settled = false, started = false
    const finish = (error?: Error, groups?: CasterGroup[]) => {
      if (settled) return
      settled = true; clearTimeout(timer); worker.terminate(); signal.removeEventListener('abort', abort)
      if (error) reject(error); else resolve(groups!)
    }
    const abort = () => finish(new DOMException('Cancelled', 'AbortError'))
    let timer = setTimeout(() => finish(new Error('Lighting preparation could not start. Please try opening the level again.')), LEVEL_WORKER_START_TIMEOUT)
    signal.addEventListener('abort', abort, { once: true })
    worker.onmessage = (event: MessageEvent<{ ready: true } | { groups: CasterGroup[]; error?: string }>) => {
      if (settled) return
      if ('ready' in event.data) {
        if (started) return
        started = true; clearTimeout(timer)
        timer = setTimeout(() => finish(new Error('Lighting took too long to prepare. Simplify the terrain.')), LEVEL_PREPARATION_TIMEOUT)
        try { worker.postMessage(request) } catch (error) { finish(error as Error) }
      } else if (event.data.error) finish(new Error(event.data.error))
      else finish(undefined, event.data.groups)
    }
    worker.onerror = () => finish(new Error('Could not prepare lighting geometry.'))
    worker.onmessageerror = () => finish(new Error('Could not read lighting geometry.'))
  })
}
