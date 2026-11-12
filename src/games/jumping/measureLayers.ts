/**
 * Measurement only. A profiling harness prices a drawing layer by leaving it out
 * (`scripts/profile-jumping-level.mjs --skip`): localStorage
 * `jumping:measure-skip-layers` holds a comma-separated list, read once at load.
 * Players never set it, and with it unset each check is an empty-set lookup.
 */
export type MeasuredLayer = 'lighting' | 'backdrop' | 'gravity' | 'displays' | 'pickups' | 'terrain' | 'ground-cover'
  | 'terrain-edges' | 'terrain-texture' | 'fields' | 'climbables' | 'athlete' | 'water'

const skipped: ReadonlySet<string> = (() => {
  // Only a browser page can carry the switch; Node's own localStorage would warn.
  try { return new Set(typeof window === 'undefined' ? [] : (window.localStorage.getItem('jumping:measure-skip-layers') ?? '').split(',').filter(Boolean)) } catch { return new Set() }
})()

export const layerSkipped = (layer: MeasuredLayer) => skipped.size > 0 && skipped.has(layer)
