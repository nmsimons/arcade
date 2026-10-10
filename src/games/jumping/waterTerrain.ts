import { convexParts, polygonArea } from './geometry.ts'
import type { Vec } from './geometry.ts'
import type { Platform } from './model.ts'
import type { GravityPlate } from './gravity.ts'

const side = (a: Vec, b: Vec, p: Vec) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])
function halfPlane(points: readonly Vec[], a: Vec, b: Vec, inside: boolean): Vec[] {
  const result: Vec[] = []
  for (let i = 0; i < points.length; i++) {
    const p = points[i], q = points[(i + 1) % points.length], pd = side(a, b, p), qd = side(a, b, q)
    const pin = inside ? pd >= 0 : pd <= 0, qin = inside ? qd >= 0 : qd <= 0
    if (pin) result.push(p)
    if (pin !== qin) {
      const t = pd / (pd - qd)
      result.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t])
    }
  }
  return result
}

/** Difference against each convex terrain piece, compiled once per reservoir.
 * Emitted pieces do not overlap, even where authored terrain blocks overlap. */
export function waterSpace(plate: GravityPlate, terrain: readonly Platform[]): Vec[][] {
  let space: Vec[][] = [[[plate.x, plate.y], [plate.x + plate.w, plate.y], [plate.x + plate.w, plate.y + plate.h], [plate.x, plate.y + plate.h]]]
  for (const block of terrain) {
    if (block.x >= plate.x + plate.w || block.x + block.w <= plate.x || block.y >= plate.y + plate.h || block.y + block.h <= plate.y) continue
    for (const solid of convexParts(block)) {
      const left = Math.min(...solid.map(p => p[0])), right = Math.max(...solid.map(p => p[0]))
      const top = Math.min(...solid.map(p => p[1])), bottom = Math.max(...solid.map(p => p[1]))
      const next: Vec[][] = []
      for (const piece of space) {
        if (piece.every(p => p[0] <= left) || piece.every(p => p[0] >= right) || piece.every(p => p[1] <= top) || piece.every(p => p[1] >= bottom)) { next.push(piece); continue }
        let remaining = piece
        for (let i = 0; i < solid.length && remaining.length >= 3; i++) {
          const a = solid[i], b = solid[(i + 1) % solid.length], outside = halfPlane(remaining, a, b, false)
          if (outside.length >= 3 && Math.abs(polygonArea(outside)) > 1e-7) next.push(outside)
          remaining = halfPlane(remaining, a, b, true)
        }
      }
      space = next
    }
  }
  return space
}
