import type { Platform } from './model.ts'
import { outsideCorner, pointInside, polygonPoints } from './geometry.ts'

export interface TerrainLedge { edgeX: number; edgeY: number; side: number }
const ledges = new WeakMap<Platform, readonly TerrainLedge[]>()

/** Moving bodies can explicitly opt out of grips while unsupported or unstable. */
export function disablePlatformLedges(platform: Platform) { ledges.set(platform, []) }

/** Find exposed top corners throughout an outline, including inset towers and shelves. */
export function platformLedges(platform: Platform): readonly TerrainLedge[] {
  const cached = ledges.get(platform)
  if (cached) return cached
  const outline = polygonPoints(platform)
  // Extra editor nodes along a straight edge do not create or hide corners.
  const points = outline.filter((b, i) => {
    const a = outline[(i + outline.length - 1) % outline.length], c = outline[(i + 1) % outline.length]
    return Math.abs((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])) > 1e-7
  })
  const found: TerrainLedge[] = []
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length]
    if (b[0] <= a[0] || Math.abs(b[1] - a[1]) > 1e-7) continue
    const before = points[(i + points.length - 1) % points.length], after = points[(i + 2) % points.length]
    if (Math.abs(before[0] - a[0]) < 1e-7 && before[1] > a[1]) found.push({ edgeX: a[0], edgeY: a[1], side: 1 })
    if (Math.abs(after[0] - b[0]) < 1e-7 && after[1] > b[1]) found.push({ edgeX: b[0], edgeY: b[1], side: -1 })
  }
  ledges.set(platform, found)
  return found
}

export function sameLedge(a: TerrainLedge, b: TerrainLedge) {
  return a.side === b.side && Math.abs(a.edgeX - b.edgeX) < .01 && Math.abs(a.edgeY - b.edgeY) < .01
}

/** Both sides of the corner must open into air; joined terrain seams cannot be grabbed. */
export function ledgeExposed(platforms: readonly Platform[], edge: TerrainLedge) {
  return !platforms.some(b => pointInside(b, edge.edgeX - edge.side * .01, edge.edgeY + .01)
    || pointInside(b, edge.edgeX + edge.side * .01, edge.edgeY - .01))
}

/** The climb pose clears its supporting corner, but other parts of the same polygon still block it. */
export function ledgeObstacles(platforms: readonly Platform[], edge: TerrainLedge): readonly Platform[] {
  return platforms.flatMap(b => platformLedges(b).some(candidate => sameLedge(candidate, edge))
    ? outsideCorner(b, edge.edgeX, edge.edgeY, edge.side) : [b])
}
