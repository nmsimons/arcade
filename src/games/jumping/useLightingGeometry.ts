import { nightModeEnabled } from './ambientLight.ts'
import { useEffect, useMemo, useState } from 'react'
import type { JumpLevel } from './level'
import { levelHeight } from './level'
import { lightingProblems, levelLightCount } from './lightingDefinition'
import { prepareLightingGeometry } from './lightingPreparation'
import type { CasterGroup } from './lightingModel'

/** Terrain edits prepare off-thread; dragging lamps/props reuses the same geometry. */
export function useLightingGeometry(level: JumpLevel, active: boolean) {
  const complexityError = useMemo(() => active ? lightingProblems(level).find(issue => issue.includes('too complex')) : undefined, [level, active])
  const needed = !complexityError && active && !!levelLightCount(level) && nightModeEnabled(level.lighting)
  const key = useMemo(() => JSON.stringify([level.width, levelHeight(level), level.platforms]), [level])
  const [state, setState] = useState<{ key: string; groups?: CasterGroup[]; error?: string } | null>(null)
  useEffect(() => {
    if (!needed) return
    const controller = new AbortController()
    void prepareLightingGeometry(level, controller.signal).then(groups => setState({ key, groups })).catch(error => {
      if (!controller.signal.aborted) setState({ key, error: (error as Error).message })
    })
    return () => controller.abort()
    // A light move does not change the geometry key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, needed])
  return { ready: !complexityError && (!needed || state?.key === key && !!state.groups), groups: state?.key === key ? state.groups : undefined,
    error: complexityError ?? (state?.key === key ? state.error : undefined) }
}
