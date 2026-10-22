import type { Platform } from './model.ts'
import { convexParts, platformOutline, polygonArea } from './geometry.ts'
import type { Vec } from './geometry.ts'

const EPS = 1e-7
const side = (a: Vec, b: Vec, p: Vec) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])
const joins = new WeakMap<readonly Platform[], { key: string; patches: Vec[][][] }>()

function clip(points: Vec[], solid: readonly Vec[]): Vec[] {
  for (let i = 0; i < solid.length && points.length; i++) {
    const a = solid[i], b = solid[(i + 1) % solid.length], input = points
    points = []
    for (let j = 0; j < input.length; j++) {
      const p = input[j], q = input[(j + 1) % input.length], pd = side(a, b, p), qd = side(a, b, q)
      if (pd >= 0) points.push(p)
      if ((pd >= 0) !== (qd >= 0)) {
        const t = pd / (pd - qd)
        points.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t])
      }
    }
  }
  return points
}

/** Carry a back surface one canvas pixel into its touching front neighbor.
 * Separate material fills otherwise expose the backdrop at a shared AA edge.
 * Clip patches to the neighbor: acute corners and real gaps must stay exact. */
export function terrainUnderlaps(platforms: readonly Platform[], order: readonly number[], scale: number): readonly Vec[][][] {
  const key = `${scale}:${order}:` + platforms.map(b => `${b.x},${b.y},${b.w},${b.h}:${b.polygon ? 'p' : 'h'}:${b.polygon?.flat() ?? b.profile?.flat() ?? ''}`).join(';')
  const cached = joins.get(platforms)
  if (cached?.key === key) return cached.patches
  const indices = [...order, ...platforms.slice(order.length).map((_, i) => i + order.length)]
  const outlines = platforms.map(platformOutline), patches: Vec[][][] = platforms.map(() => [])
  const depth = 1 / Math.max(scale, .0001)
  for (let i = 0; i < indices.length; i++) for (let j = i + 1; j < indices.length; j++) {
    const back = indices[i], front = indices[j], a = platforms[back], b = platforms[front]
    if (a.x > b.x + b.w || a.x + a.w < b.x || a.y > b.y + b.h || a.y + a.h < b.y) continue
    const earlier = outlines[back], later = outlines[front]
    for (let k = 0; k < earlier.length; k++) {
      const p = earlier[k], q = earlier[(k + 1) % earlier.length], dx = q[0] - p[0], dy = q[1] - p[1], length = Math.hypot(dx, dy)
      for (let n = 0; n < later.length; n++) {
        const r = later[n], s = later[(n + 1) % later.length]
        if (dx * (s[0] - r[0]) + dy * (s[1] - r[1]) >= 0
          || Math.abs(side(p, q, r)) > EPS * length || Math.abs(side(p, q, s)) > EPS * length) continue
        const along = (v: Vec) => ((v[0] - p[0]) * dx + (v[1] - p[1]) * dy) / length
        const from = Math.max(0, along(s)), to = Math.min(length, along(r))
        if (to - from <= EPS) continue
        const start: Vec = [p[0] + dx * from / length, p[1] + dy * from / length]
        const end: Vec = [p[0] + dx * to / length, p[1] + dy * to / length]
        const nx = dy / length * depth, ny = -dx / length * depth
        const strip: Vec[] = [start, [start[0] + nx, start[1] + ny], [end[0] + nx, end[1] + ny], end]
        for (const part of convexParts(b)) {
          const patch = clip(strip, part)
          if (patch.length >= 3 && polygonArea(patch) > EPS) patches[back].push(patch)
        }
      }
    }
  }
  joins.set(platforms, { key, patches })
  return patches
}
