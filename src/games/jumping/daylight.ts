import type { Vec } from './geometry.ts'
import type { TerrainEdge } from './lightingBoundary.ts'
import { clipShadowPolygon } from './lightingGpuGeometry.ts'

/** Reflected daylight keeps sheltered routes bright; the overhead sun supplies
 * the remaining exposure. Neither contribution depends on electrical power. */
export const DAY_AMBIENT_EXPOSURE = .95
const SUN_ANGLE = 25 * Math.PI / 180
export const DAYLIGHT_DIRECTION = { x: Math.sin(SUN_ANGLE), y: Math.cos(SUN_ANGLE) }

/** Parallel rays from the upper left, with no widening or distance attenuation.
 * Cast from exposed exit edges so a solid does not shadow its own front. The
 * enclosing frame admits daylight; authored roofs and walls still block it. */
export function daylightShadowPolygons(edges: readonly TerrainEdge[], bounds: { x: number; y: number; w: number; h: number }, roomWidth = Infinity, roomHeight = Infinity): Vec[][] {
  const bottom = bounds.y + bounds.h, right = bounds.x + bounds.w
  const direction = DAYLIGHT_DIRECTION
  return edges.flatMap(([a, b]) => {
    const dx = b[0] - a[0], dy = b[1] - a[1]
    if (dy * direction.x - dx * direction.y <= 1e-7 || Math.max(a[1], b[1]) <= 0
      || Math.min(a[1], b[1]) >= Math.min(bottom, roomHeight) || Math.min(a[0], b[0]) >= right
      || Math.max(a[0], b[0]) <= 0 || Math.min(a[0], b[0]) >= roomWidth
      || a[0] === b[0] && (a[0] === 0 || a[0] === roomWidth)) return []
    const distance = (bottom - Math.min(a[1], b[1]) + 1) / direction.y
    const extend = ([x, y]: Vec): Vec => [x + distance * direction.x, y + distance * direction.y]
    const polygon = clipShadowPolygon([a, b, extend(b), extend(a)], bounds)
    return polygon.length >= 3 ? [polygon] : []
  })
}
