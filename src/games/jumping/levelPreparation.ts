import type { JumpLevel } from './level.ts'
import type { Player } from './model.ts'
import type { Run } from './challenge.ts'
import { initRopeSleep } from './ropeSleep.ts'

export const LEVEL_PREPARATION_TIMEOUT = 5000
export interface PreparedLevel { level: JumpLevel; run: Run | null; player: Player | null }
export type PreparationReply = { result: PreparedLevel } | { error: string }

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
    const worker = new Worker(new URL('./ropeLayout.worker.ts', import.meta.url), { type: 'module' })
    let settled = false
    const finish = (error?: Error, result?: PreparedLevel) => {
      if (settled) return
      settled = true
      clearTimeout(timer); worker.terminate(); options.signal?.removeEventListener('abort', abort)
      if (error) reject(error); else resolve(result!)
    }
    const abort = () => finish(new DOMException('Preparation cancelled.', 'AbortError'))
    const timer = setTimeout(() => finish(new Error('This level took too long to prepare. Simplify its ropes or terrain and try again.')), LEVEL_PREPARATION_TIMEOUT)
    options.signal?.addEventListener('abort', abort, { once: true })
    worker.onmessage = (event: MessageEvent<PreparationReply>) => {
      if ('error' in event.data) finish(new Error(event.data.error))
      else finish(undefined, event.data.result)
    }
    worker.onerror = event => { event.preventDefault(); finish(new Error('This level could not be prepared.')) }
    worker.onmessageerror = () => finish(new Error('This level could not be prepared.'))
    try { worker.postMessage({ level, play: options.play ?? false }) } catch (error) { finish(error as Error) }
  })
}
