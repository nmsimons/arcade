import { useEffect, useMemo, useState } from 'react'
import { prepareLevelRopes } from './level'
import type { JumpLevel } from './level'

/** Keep authoring input immediate; settle only the latest completed edit off-thread. */
export function useRopePreview(source: JumpLevel, dragging: boolean) {
  const [resolved, setResolved] = useState<{ source: JumpLevel; level: JumpLevel } | null>(null)
  const sketch = useMemo(() => prepareLevelRopes(source, true), [source])
  useEffect(() => {
    if (dragging || !sketch.climbables.ropes.some(r => r.rest?.key.startsWith('preview:'))) return
    let worker: Worker | undefined
    const timer = setTimeout(() => {
      worker = new Worker(new URL('./ropeLayout.worker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = (event: MessageEvent<JumpLevel>) => {
        setResolved({ source, level: event.data }); worker?.terminate()
      }
      worker.postMessage(source)
    }, 120)
    return () => { clearTimeout(timer); worker?.terminate() }
  }, [source, sketch, dragging])
  return resolved?.source === source ? resolved.level : sketch
}
