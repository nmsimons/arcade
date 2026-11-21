import type { JumpLevel } from './level.ts'
import type { CasterGroup } from './lightingModel.ts'
import { LEVEL_PREPARATION_TIMEOUT, LEVEL_WORKER_START_TIMEOUT } from './levelPreparation.ts'

/** Level previews share a few workers. Dozens solving at once (a library showing many cards)
 *  each overran the solve deadline, and a failed preview stayed blank. */
export const PREVIEW_LIGHTING_WORKERS = Math.max(2, Math.min(4, (globalThis.navigator?.hardwareConcurrency ?? 4) - 1))
let previewWorkers = 0
const previewQueue: (() => void)[] = []
function previewSlot(signal: AbortSignal): Promise<() => void> {
  return new Promise((resolve, reject) => {
    const take = () => {
      signal.removeEventListener('abort', cancel); previewWorkers++
      let released = false
      resolve(() => { if (released) return; released = true; previewWorkers--; previewQueue.shift()?.() })
    }
    const cancel = () => {
      const index = previewQueue.indexOf(take)
      if (index >= 0) previewQueue.splice(index, 1)
      reject(new DOMException('Cancelled', 'AbortError'))
    }
    if (signal.aborted) cancel()
    else if (previewWorkers < PREVIEW_LIGHTING_WORKERS) take()
    else { previewQueue.push(take); signal.addEventListener('abort', cancel, { once: true }) }
  })
}

/** Geometry-only preparation also accepts unfinished editor documents. Previews wait for a
 *  shared worker slot; the editor and play prepare at once. Either way the draft is the one
 *  passed in, and the deadlines start when its worker does. */
export function prepareLightingGeometry(level: JumpLevel, signal: AbortSignal, { preview = false } = {}): Promise<CasterGroup[]> {
  if (signal.aborted) return Promise.reject(new DOMException('Cancelled', 'AbortError'))
  const request = structuredClone(level)
  if (!preview) return solveLightingGeometry(request, signal)
  return previewSlot(signal).then(release => solveLightingGeometry(request, signal).finally(release))
}

function solveLightingGeometry(request: JumpLevel, signal: AbortSignal): Promise<CasterGroup[]> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException('Cancelled', 'AbortError')); return }
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
