import { copyLevel, levelHeight } from './level.ts'
import type { JumpLevel } from './level.ts'
import { nightModeEnabled } from './ambientLight.ts'
import { lightingForLevel } from './lightingDefinition.ts'
import { usesRegionLighting } from './environment.ts'

export function setBackground(level: JumpLevel, kind: 'interior' | 'landscape'): JumpLevel {
  const next = copyLevel(level), old = next.environment
  if (!old && kind === 'interior') return level
  next.version = 2; next.lighting = structuredClone(lightingForLevel(level))
  const common = old ?? { walls: [], lighting: 'uniform' as const }
  next.environment = kind === 'landscape' ? { ...common, kind, horizon: old?.horizon ?? Math.round(levelHeight(level) * .55) }
    : { ...common, kind }
  return next
}

export function setLightingLayout(level: JumpLevel, layout: 'uniform' | 'regions'): JumpLevel {
  const next = copyLevel(level), before = usesRegionLighting(level)
  if (!next.environment && layout === 'uniform') return level
  next.version = 2; next.lighting = structuredClone(lightingForLevel(level))
  next.environment ??= { kind: 'interior', walls: [] }
  next.environment.lighting = layout
  if (layout === 'regions') {
    if (!before) next.environment.baseLighting = nightModeEnabled(level.lighting) ? 'night' : 'day'
    next.lighting.nightMode = true
  } else if (before) next.lighting.nightMode = next.environment.baseLighting === 'night'
  return next
}

export function prepareBackWall(level: JumpLevel): JumpLevel {
  return usesRegionLighting(level) ? copyLevel(level) : setLightingLayout(level, 'regions')
}
