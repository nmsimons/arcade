import { convexParts, polygonArea } from './geometry.ts'
import type { Vec } from './geometry.ts'
import type { Platform } from './model.ts'
import type { LevelEnvironment } from './environment.ts'

const EPS = 1e-7
const area = (points: readonly Vec[]) => points.length >= 3 && Math.abs(polygonArea(points)) > EPS
const side = (a: Vec, b: Vec, p: Vec) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])

/** Split a convex piece at a clipping edge, retaining both half-planes. */
function split(points: readonly Vec[], a: Vec, b: Vec) {
  const inside: Vec[] = [], outside: Vec[] = []
  for (let i = 0; i < points.length; i++) {
    const p = points[i], q = points[(i + 1) % points.length], dp = side(a, b, p), dq = side(a, b, q)
    if (dp >= 0) inside.push(p)
    if (dp <= 0) outside.push(p)
    if (dp > 0 && dq < 0 || dp < 0 && dq > 0) {
      const t = dp / (dp - dq), hit: Vec = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]
      inside.push(hit); outside.push(hit)
    }
  }
  return { inside, outside }
}

/** Removing a convex cover leaves disjoint convex pieces and its intersection. */
function subtract(points: readonly Vec[], cover: readonly Vec[]) {
  let inside = points
  const outside: (readonly Vec[])[] = []
  for (let i = 0; i < cover.length && area(inside); i++) {
    const halves = split(inside, cover[i], cover[(i + 1) % cover.length])
    if (area(halves.outside)) outside.push(halves.outside)
    inside = halves.inside
  }
  const overlaps = area(inside)
  return { outside: overlaps ? outside : [points], overlaps }
}

/** A whole terrain piece is dark if any area belongs to a visible Night region.
 * Process frontmost walls first so Day overrides mask earlier Night regions.
 * This per-piece classification is independent of lamps and spill. */
export function terrainRegionLighting(environment: LevelEnvironment, platform: Platform): 'day' | 'night' {
  let remaining: (readonly Vec[])[] = convexParts(platform)
  for (let i = environment.walls.length - 1; i >= 0 && remaining.length; i--) {
    const wall = environment.walls[i]
    if (wall.x + wall.w <= platform.x || wall.x >= platform.x + platform.w
      || wall.y + wall.h <= platform.y || wall.y >= platform.y + platform.h) continue
    for (const cover of convexParts(wall)) {
      const uncovered: (readonly Vec[])[] = []
      for (const piece of remaining) {
        const cut = subtract(piece, cover)
        if (cut.overlaps && (wall.lighting ?? 'night') === 'night') return 'night'
        uncovered.push(...cut.outside)
      }
      remaining = uncovered
      if (!remaining.length) break
    }
  }
  return remaining.length && environment.baseLighting === 'night' ? 'night' : 'day'
}
