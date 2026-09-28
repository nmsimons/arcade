import type { Platform } from './model.ts'
import type { Vec } from './geometry.ts'
import { pointInside, polygonPoints } from './geometry.ts'

export type TerrainEdge = readonly [Vec, Vec]
const EPS = 1e-7
const cross = (x: number, y: number, u: number, v: number) => x * v - y * u

export function edgeTouchesShape([a, b]: TerrainEdge, shape: Platform) {
  return Math.max(a[0], b[0]) >= shape.x && Math.min(a[0], b[0]) <= shape.x + shape.w
    && Math.max(a[1], b[1]) >= shape.y && Math.min(a[1], b[1]) <= shape.y + shape.h
}

/** Remove only the intervals covered by another solid. Shared endpoints and
 * crossings split edges; a real gap, however small, remains exposed. */
export function exposedBoundary(edges: readonly TerrainEdge[], covers: readonly Platform[]): TerrainEdge[] {
  const polygons = covers.map(polygonPoints), result: TerrainEdge[] = []
  for (const edge of edges) {
    const [a, b] = edge, dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy)
    const neighbors = covers.flatMap((shape, j) => edgeTouchesShape(edge, shape) ? [j] : [])
    if (!neighbors.length) { result.push(edge); continue }
    const cuts = [0, 1]
    for (const j of neighbors) {
      const other = polygons[j]
      for (const [k, c] of other.entries()) {
        const d = other[(k + 1) % other.length], sx = d[0] - c[0], sy = d[1] - c[1]
        const denominator = cross(dx, dy, sx, sy), cx = c[0] - a[0], cy = c[1] - a[1]
        if (Math.abs(denominator) > EPS) {
          const t = cross(cx, cy, sx, sy) / denominator, u = cross(cx, cy, dx, dy) / denominator
          if (t > 0 && t < 1 && u >= -EPS && u <= 1 + EPS) cuts.push(t)
        } else if (Math.abs(cross(cx, cy, dx, dy)) < EPS) {
          for (const p of [c, d]) {
            const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (length * length)
            if (t > 0 && t < 1) cuts.push(t)
          }
        }
      }
    }
    cuts.sort((a, b) => a - b)
    for (let k = 1; k < cuts.length; k++) {
      const from = cuts[k - 1], to = cuts[k]
      if ((to - from) * length < EPS) continue
      const mid = (from + to) / 2
      // polygonPoints winds with the interior on the left. A tiny outward
      // probe removes joined/overlapping edges without welding nearby gaps.
      const x = a[0] + dx * mid + dy / length * .0001
      const y = a[1] + dy * mid - dx / length * .0001
      if (!neighbors.some(j => pointInside(covers[j], x, y))) {
        result.push(from === 0 && to === 1 ? edge
          : [[a[0] + dx * from, a[1] + dy * from], [a[0] + dx * to, a[1] + dy * to]])
      }
    }
  }
  return result
}

/** Prepare the exposed outline of a terrain union, not the seams between tiles. */
export function terrainBoundary(shapes: readonly Platform[]): TerrainEdge[] {
  return shapes.flatMap((shape, i) => {
    const points = polygonPoints(shape)
    const edges = points.map((p, j): TerrainEdge => [p, points[(j + 1) % points.length]])
    return exposedBoundary(edges, shapes.filter((other, j) => i !== j
      && shape.x <= other.x + other.w && shape.x + shape.w >= other.x
      && shape.y <= other.y + other.h && shape.y + shape.h >= other.y))
  })
}

/** Only the edge where a ray exits material starts a shadow. This lights the
 * first solid face through its thickness, but shades later terrain across air
 * gaps—even if it belongs to the same concave polygon or connected room. */
export function isExitEdge(light: { x: number; y: number }, [a, b]: TerrainEdge) {
  return cross(b[0] - a[0], b[1] - a[1], light.x - a[0], light.y - a[1]) > EPS
}
export function terrainShadowsPoint(light: { x: number; y: number }, edges: readonly TerrainEdge[], x: number, y: number) {
  const rx = x - light.x, ry = y - light.y
  return edges.some(edge => {
    if (!isExitEdge(light, edge)) return false
    const [a, b] = edge, sx = b[0] - a[0], sy = b[1] - a[1], denominator = cross(rx, ry, sx, sy)
    if (Math.abs(denominator) < EPS) return false
    const cx = a[0] - light.x, cy = a[1] - light.y
    const t = cross(cx, cy, sx, sy) / denominator, u = cross(cx, cy, rx, ry) / denominator
    return t > EPS && t < 1 - EPS && u >= 0 && u <= 1
  })
}
