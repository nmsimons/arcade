import type { JumpLevel } from './level.ts'
import type { Player } from './model.ts'
import type { Run } from './challenge.ts'
import { initRopeSleep } from './ropeSleep.ts'
import type { CasterGroup } from './lightingModel.ts'

export const LEVEL_PREPARATION_TIMEOUT = 5000
export const LEVEL_WORKER_START_TIMEOUT = 30000
export interface PreparedLevel { level: JumpLevel; run: Run | null; player: Player | null; lighting?: CasterGroup[] }
export type PreparationReply = { ready: true } | { result: PreparedLevel } | { error: string }

/** Worker transfer and restart copies do not preserve WeakMap simulation caches. */
export function clonePreparedLevel(prepared: PreparedLevel): PreparedLevel {
  const world = structuredClone(prepared)
  for (const rope of world.player?.ropes ?? []) initRopeSleep(rope, !!rope.definition.rest)
  return world
}

/** Every request owns its worker: cancellation and deadlines stop CPU work too. */
export function prepareLevelInWorker(level: JumpLevel, options: { signal?: AbortSignal; play?: boolean } = {}): Promise<PreparedLevel> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) { reject(new DOMException('Preparation cancelled.', 'AbortError')); return }
    const request = { level: structuredClone(level), play: options.play ?? false }
    const worker = new Worker(new URL('./ropeLayout.worker.ts', import.meta.url), { type: 'module' })
    let settled = false, started = false
    const finish = (error?: Error, result?: PreparedLevel) => {
      if (settled) return
      settled = true
      clearTimeout(timer); worker.terminate(); options.signal?.removeEventListener('abort', abort)
      if (error) reject(error); else resolve(result!)
    }
    const abort = () => finish(new DOMException('Preparation cancelled.', 'AbortError'))
    // Module loading and compilation happen before the worker can prepare a
    // level. A cold/contended browser must not spend the geometry CPU budget
    // fetching code, nor tell the author that an ordinary map is too complex.
    let timer = setTimeout(() => finish(new Error('Level preparation could not start. Please try opening the level again.')), LEVEL_WORKER_START_TIMEOUT)
    options.signal?.addEventListener('abort', abort, { once: true })
    worker.onmessage = (event: MessageEvent<PreparationReply>) => {
      if (settled) return
      if ('ready' in event.data) {
        if (started) return
        started = true
        clearTimeout(timer)
        timer = setTimeout(() => finish(new Error('This level took too long to prepare. Simplify its ropes or terrain and try again.')), LEVEL_PREPARATION_TIMEOUT)
        try { worker.postMessage(request) } catch (error) { finish(error as Error) }
      } else if ('error' in event.data) finish(new Error(event.data.error))
      else finish(undefined, event.data.result)
    }
    worker.onerror = event => { event.preventDefault(); finish(new Error('This level could not be prepared.')) }
    worker.onmessageerror = () => finish(new Error('This level could not be prepared.'))
  })
}
