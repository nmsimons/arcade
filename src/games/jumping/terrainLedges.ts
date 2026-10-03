import type { Platform } from './model.ts'
import { outsideCorner, pointInside, polygonPoints } from './geometry.ts'
import { canGrip } from './friction.ts'

/** Slope is the top's rise per unit inward from the corner. */
export interface TerrainLedge { edgeX: number; edgeY: number; side: number; slope?: number }
const ledges = new WeakMap<Platform, readonly TerrainLedge[]>()
const disabled = new WeakSet<Platform>()

/** Moving bodies can explicitly opt out of grips while unsupported or unstable. */
export function disablePlatformLedges(platform: Platform) { disabled.add(platform); ledges.set(platform, []) }
export const platformLedgesDisabled = (platform: Platform) => disabled.has(platform)

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
    if (b[0] <= a[0]) continue
    const slope = (b[1] - a[1]) / (b[0] - a[0])
    if (!canGrip(Math.atan(slope))) continue
    const before = points[(i + points.length - 1) % points.length], after = points[(i + 2) % points.length]
    // A hanging face may retreat underneath the top instead of being exactly
    // vertical. Keep only outward corners; a concave recess is not a lip.
    const leftTurn = (a[0] - before[0]) * (b[1] - a[1]) - (a[1] - before[1]) * (b[0] - a[0])
    const rightTurn = (b[0] - a[0]) * (after[1] - b[1]) - (b[1] - a[1]) * (after[0] - b[0])
    if (before[0] >= a[0] - 1e-7 && before[1] > a[1] && leftTurn > 1e-7) found.push({ edgeX: a[0], edgeY: a[1], side: 1, ...(slope ? { slope } : {}) })
    if (after[0] <= b[0] + 1e-7 && after[1] > b[1] && rightTurn > 1e-7) found.push({ edgeX: b[0], edgeY: b[1], side: -1, ...(slope ? { slope: -slope } : {}) })
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
    || pointInside(b, edge.edgeX + edge.side * .01, edge.edgeY + (edge.slope ?? 0) * .01 - .01))
}

/** The climb pose clears its continuous supporting top, including joined pieces.
 * Geometry above or outside the corner still blocks the authored climb. */
export function ledgeObstacles(platforms: readonly Platform[], edge: TerrainLedge): readonly Platform[] {
  const support = new Set(platforms.filter(b => platformLedges(b).some(candidate => sameLedge(candidate, edge))))
  if (!support.size) return platforms
  // Walk touching collinear top edges inward from the grip. A narrow post
  // joined to a beam must offer the same clearance as one solid L shape.
  const tops = platforms.flatMap(platform => {
    const points = polygonPoints(platform)
    const above = (point: readonly [number, number]) => point[1] - edge.edgeY - (point[0] - edge.edgeX) * edge.side * (edge.slope ?? 0)
    return points.flatMap((a, i) => {
      const b = points[(i + 1) % points.length]
      if (b[0] <= a[0] || Math.abs(above(a)) > .01 || Math.abs(above(b)) > .01) return []
      const from = (a[0] - edge.edgeX) * edge.side, to = (b[0] - edge.edgeX) * edge.side
      return [{ platform, from: Math.min(from, to), to: Math.max(from, to) }]
    })
  }).sort((a, b) => a.from - b.from)
  let reach = 0
  for (const top of tops) {
    if (top.to < 0) continue
    if (top.from > reach + .01) break
    support.add(top.platform); reach = Math.max(reach, top.to)
  }
  // Follow the continuous outside face down from the grip too. A thin cap
  // and a flush wall beneath it are the same supporting corner as one polygon.
  // Keep genuine gaps separate, and retain anything above/outside via clipping.
  const faces = platforms.flatMap(platform => {
    const points = polygonPoints(platform)
    return points.flatMap((a, i) => {
      const b = points[(i + 1) % points.length]
      if (Math.abs(a[0] - edge.edgeX) > 1e-7 || Math.abs(b[0] - edge.edgeX) > 1e-7
        || (b[1] - a[1]) * edge.side >= 0) return []
      return [{ platform, from: Math.min(a[1], b[1]) - edge.edgeY, to: Math.max(a[1], b[1]) - edge.edgeY }]
    })
  }).sort((a, b) => a.from - b.from)
  let depth = 0
  for (const face of faces) {
    if (face.to < 0) continue
    if (face.from > depth + 1e-7) break
    support.add(face.platform); depth = Math.max(depth, face.to)
  }
  return platforms.flatMap(b => support.has(b)
    ? outsideCorner(b, edge.edgeX, edge.edgeY, edge.side, edge.slope) : [b])
}
