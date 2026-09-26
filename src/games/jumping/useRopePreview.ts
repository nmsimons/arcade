import { useEffect, useMemo, useState } from 'react'
import { prepareLevelRopes } from './level'
import type { JumpLevel } from './level'
import { prepareLevelInWorker } from './levelPreparation'

/** Keep authoring input immediate; settle only the latest completed edit off-thread. */
export function useRopePreview(source: JumpLevel, dragging: boolean) {
  const [resolved, setResolved] = useState<{ source: JumpLevel; level: JumpLevel } | null>(null)
  const sketch = useMemo(() => prepareLevelRopes(source, true), [source])
  useEffect(() => {
    if (dragging || !sketch.climbables.ropes.some(r => r.rest?.key.startsWith('preview:'))) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      void prepareLevelInWorker(source, { signal: controller.signal }).then(({ level }) => setResolved({ source, level }))
        .catch(() => {
          // Stop announcing a busy canvas after failure; Save/Play reports the error.
          if (!controller.signal.aborted) setResolved({ source, level: sketch })
        })
    }, 120)
    return () => { clearTimeout(timer); controller.abort() }
  }, [source, sketch, dragging])
  return { level: resolved?.source === source ? resolved.level : sketch,
    busy: resolved?.source !== source && sketch.climbables.ropes.some(r => r.rest?.key.startsWith('preview:')) }
}
