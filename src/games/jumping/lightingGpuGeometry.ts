import type { Vec } from './geometry.ts'

const cross = (a: Vec, b: Vec, c: Vec) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])

/** Ear clipping retains concave actor silhouettes; triangle fans would fill gaps. */
export function triangulateCaster(points: readonly Vec[]): Vec[] {
  const remaining = points.map((_, i) => i), triangles: Vec[] = []
  while (remaining.length > 2) {
    let found = false
    for (let k = 0; k < remaining.length; k++) {
      const ia = remaining[(k + remaining.length - 1) % remaining.length], ib = remaining[k], ic = remaining[(k + 1) % remaining.length]
      const a = points[ia], b = points[ib], c = points[ic], area = cross(a, b, c)
      if (Math.abs(area) < 1e-10) { remaining.splice(k, 1); found = true; break }
      if (area < 0) continue
      if (remaining.some(i => i !== ia && i !== ib && i !== ic
        && cross(a, b, points[i]) >= 0 && cross(b, c, points[i]) >= 0 && cross(c, a, points[i]) >= 0)) continue
      triangles.push(a, b, c); remaining.splice(k, 1); found = true; break
    }
    // An unsupported outline uses the Canvas fallback; never omit its shadow.
    if (!found) throw new Error('Cannot triangulate lighting silhouette.')
  }
  return triangles
}

/** Clip projected quads before converting to float32 GPU coordinates. A nearby
 * source can otherwise create far vertices millions of units outside the view. */
export function clipShadowPolygon(points: readonly Vec[], rect: { x: number; y: number; w: number; h: number }): Vec[] {
  let result = [...points]
  for (const [axis, bound, sign] of [[0, rect.x, 1], [0, rect.x + rect.w, -1], [1, rect.y, 1], [1, rect.y + rect.h, -1]]) {
    const input = result; result = []
    for (let i = 0; i < input.length; i++) {
      const a = input[i], b = input[(i + 1) % input.length]
      const insideA = sign * (a[axis] - bound) >= 0, insideB = sign * (b[axis] - bound) >= 0
      if (insideA) result.push(a)
      if (insideA !== insideB) {
        const t = (bound - a[axis]) / (b[axis] - a[axis])
        result.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])])
      }
    }
  }
  return result
}
