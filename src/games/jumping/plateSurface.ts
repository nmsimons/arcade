import type { JumpLevel } from './level.ts'
import { levelTerrain } from './level.ts'
import { ballShape, boxShape } from './propGeometry.ts'
import { polygonIntersects, polygonPoints } from './geometry.ts'
import type { Platform } from './model.ts'

export const plateSolids = (level: JumpLevel) => [...levelTerrain(level), ...level.mechanisms ?? [],
  ...(level.props ?? []).map(p => p.kind === 'ball' ? ballShape(p) : boxShape({ ...p, angle: 0 }))]

/** Find the exposed floor or underside touching the plate's shallow footprint.
 * Nearby snapping chooses either face; explicit placement follows its facing. */
export function plateSurface(solids: readonly Platform[], left: number, width: number, anchor: number,
  reach: number, ceiling = false, accepts: (y: number, ceiling: boolean) => boolean = () => true) {
  const candidates: { y: number; left: number; right: number; delta: number; ceiling: boolean }[] = []
  for (const solid of solids) {
    const points = polygonPoints(solid)
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length], dx = b[0] - a[0], underside = dx < 0
      if (Math.abs(dx) < .01 || Math.abs((b[1] - a[1]) / dx) > .8 || reach === Infinity && underside !== ceiling) continue
      const l = Math.max(left, Math.min(a[0], b[0])), r = Math.min(left + width, Math.max(a[0], b[0]))
      if (r - l < .5) continue
      const slope = (b[1] - a[1]) / dx, at = (x: number) => a[1] + (x - a[0]) * slope
      const y = underside ? Math.max(at(l), at(r)) : Math.min(at(l), at(r)), delta = y - anchor
      if (Math.abs(delta) > reach || reach === Infinity && delta * (underside ? -1 : 1) < -20 || !accepts(y, underside)) continue
      const footprint = { x: left, y: underside ? y : y - 8, w: width, h: 8 }
      if (solids.some(other => polygonIntersects(polygonPoints(footprint), other, .02))) continue
      candidates.push({ y, left: l, right: r, delta, ceiling: underside })
    }
  }
  candidates.sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta) || Number(a.ceiling !== ceiling) - Number(b.ceiling !== ceiling))
  return candidates[0] ?? null
}
