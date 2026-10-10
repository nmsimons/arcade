import type { GravityPlate } from './gravity.ts'

export const WATER_LEVEL_STEP = 1 / 30
export const waterControlId = (id: string, action: 'fill' | 'drain') => `${id}:${action}`
export interface WaterLevels {
  plates: GravityPlate[]
  pools: { definition: GravityPlate; region: GravityPlate; level: number; pending: number }[]
  accumulator: number; revision: number
}

/** Stable runtime rectangles leave the authored reservoir and initial level intact. */
export function createWaterLevels(plates: readonly GravityPlate[]): WaterLevels {
  const pools: WaterLevels['pools'] = []
  const regions = plates.map(definition => {
    if (definition.effect !== 'water') return definition
    const level = Math.max(definition.waterMinLevel ?? 0, definition.waterLevel ?? 100), region = { ...definition }
    region.h = definition.h * level / 100
    region.y = definition.y + definition.h - region.h
    pools.push({ definition, region, level, pending: 0 })
    return region
  })
  return { plates: regions, pools, accumulator: 0, revision: 0 }
}

/** A scalar waterline, not a fluid grid. Rebuild field geometry at most 30 Hz;
 * idle reservoirs do no geometric work. Opposing pumps cancel. EMP pauses pumps. */
export function advanceWaterLevels(water: WaterLevels, switches: ReadonlyMap<string, boolean>, dt: number) {
  if (!water.pools.length) return false
  for (const pool of water.pools) {
    const direction = Number(!!switches.get(waterControlId(pool.definition.id, 'fill')))
      - Number(!!switches.get(waterControlId(pool.definition.id, 'drain')))
    pool.pending += direction * (pool.definition.waterRate ?? 10) * dt
  }
  water.accumulator += dt
  if (water.accumulator + 1e-9 < WATER_LEVEL_STEP) return false
  water.accumulator = 0
  let changed = false
  for (const pool of water.pools) {
    const minimum = pool.definition.waterMinLevel ?? 0
    const requested = Math.max(minimum, Math.min(100, pool.level + pool.pending))
    const level = requested < minimum + 1e-8 ? minimum : requested > 100 - 1e-8 ? 100 : requested
    pool.pending = 0
    if (level === pool.level) continue
    pool.level = level
    pool.region.h = pool.definition.h * level / 100
    pool.region.y = pool.definition.y + pool.definition.h - pool.region.h
    changed = true
  }
  if (changed) water.revision++
  return changed
}
