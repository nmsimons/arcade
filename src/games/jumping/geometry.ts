import type { Platform } from './model.ts'

export type Vec = readonly [number, number]
const EPS = 1e-7
const cross = (a: Vec, b: Vec, c: Vec) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
export const polygonArea = (points: readonly Vec[]) => points.reduce((area, a, i) => {
  const b = points[(i + 1) % points.length]; return area + a[0] * b[1] - a[1] * b[0]
}, 0) / 2
export function polygonPoints(b: Platform): Vec[] {
  const local = b.polygon ?? (b.profile ? [...b.profile, [b.w, b.h] as Vec, [0, b.h] as Vec] : [[0, 0], [b.w, 0], [b.w, b.h], [0, b.h]])
  const points = local.map(([x, y]) => [x + b.x, y + b.y] as Vec)
    .filter((p, i, all) => Math.hypot(p[0] - all[(i + 1) % all.length][0], p[1] - all[(i + 1) % all.length][1]) > EPS)
  return polygonArea(points) < 0 ? points.reverse() : points
}
function onSegment(p: Vec, a: Vec, b: Vec) {
  return Math.abs(cross(a, b, p)) < EPS && p[0] >= Math.min(a[0], b[0]) - EPS && p[0] <= Math.max(a[0], b[0]) + EPS
    && p[1] >= Math.min(a[1], b[1]) - EPS && p[1] <= Math.max(a[1], b[1]) + EPS
}
export function validPolygon(points: readonly Vec[]) {
  if (points.length < 3 || points.length > 64 || Math.abs(polygonArea(points)) < 1) return false
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length]
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < .01) return false
    for (let j = i + 1; j < points.length; j++) {
      if (j === i + 1 || i === 0 && j === points.length - 1) continue
      const c = points[j], d = points[(j + 1) % points.length]
      if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0
        || onSegment(c, a, b) || onSegment(d, a, b) || onSegment(a, c, d) || onSegment(b, c, d)) return false
    }
  }
  return true
}
export function pointInside(b: Platform, x: number, y: number) {
  if (x < b.x || x > b.x + b.w || y < b.y || y > b.y + b.h) return false
  const points = polygonPoints(b); let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], c = points[j]
    if (onSegment([x, y], a, c)) return true
    if ((a[1] > y) !== (c[1] > y) && x < (c[0] - a[0]) * (y - a[1]) / (c[1] - a[1]) + a[0]) inside = !inside
  }
  return inside
}
const cache = new WeakMap<Platform, Vec[][]>()
/** Convex pieces keep collision faithful to concave outlines and undercuts. */
function parts(b: Platform): Vec[][] {
  const saved = cache.get(b); if (saved) return saved
  const points = polygonPoints(b), result: Vec[][] = []
  if (points.every((p, i) => cross(points[(i + points.length - 1) % points.length], p, points[(i + 1) % points.length]) >= -EPS)) result.push(points)
  else {
    const remaining = [...points]
    while (remaining.length > 3) {
      const ear = remaining.findIndex((p, i) => {
        const a = remaining[(i + remaining.length - 1) % remaining.length], c = remaining[(i + 1) % remaining.length]
        return cross(a, p, c) > EPS && !remaining.some(q => q !== a && q !== p && q !== c
          && cross(a, p, q) >= -EPS && cross(p, c, q) >= -EPS && cross(c, a, q) >= -EPS)
      })
      if (ear < 0) break
      result.push([remaining[(ear + remaining.length - 1) % remaining.length], remaining[ear], remaining[(ear + 1) % remaining.length]])
      remaining.splice(ear, 1)
    }
    if (remaining.length === 3) result.push(remaining)
  }
  cache.set(b, result); return result
}
function axes(points: readonly Vec[]) {
  return points.map((a, i): Vec => {
    const b = points[(i + 1) % points.length], length = Math.hypot(b[0] - a[0], b[1] - a[1])
    return [(b[1] - a[1]) / length, (a[0] - b[0]) / length]
  })
}
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1]
const interval = (points: readonly Vec[], axis: Vec) => {
  const values = points.map(p => dot(p, axis)); return [Math.min(...values), Math.max(...values)]
}
/** Feet meet slopes at the sole; the broad upper hull protects torso and head. */
function body(x: number, y: number, height: number): Vec[] {
  return [[x - 12, y - height], [x + 12, y - height], [x + 12, y - 18], [x, y], [x - 12, y - 18]]
}
function penetration(a: readonly Vec[], b: readonly Vec[]) {
  let depth = Infinity, normal: Vec = [0, -1]
  for (const axis of [...axes(a), ...axes(b)]) {
    const [amin, amax] = interval(a, axis), [bmin, bmax] = interval(b, axis)
    if (amax <= bmin + EPS || amin >= bmax - EPS) return null
    const low = amax - bmin, high = bmax - amin
    if (Math.min(low, high) < depth) { depth = Math.min(low, high); normal = low < high ? [-axis[0], -axis[1]] : axis }
  }
  return { depth, normal }
}
export function bodyIntersects(x: number, y: number, b: Platform, height = 62) {
  if (x + 12 <= b.x || x - 12 >= b.x + b.w || y <= b.y || y - height >= b.y + b.h) return false
  const hull = body(x, y, height)
  return parts(b).some(piece => penetration(hull, piece) !== null)
}
function sweep(a: readonly Vec[], b: readonly Vec[], delta: Vec) {
  let enter = -Infinity, exit = Infinity, normal: Vec = [0, -1]
  for (const axis of [...axes(a), ...axes(b)]) {
    const [amin, amax] = interval(a, axis), [bmin, bmax] = interval(b, axis), speed = dot(delta, axis)
    if (Math.abs(speed) < EPS) { if (amax <= bmin + EPS || amin >= bmax - EPS) return null; continue }
    const t0 = (bmin - amax) / speed, t1 = (bmax - amin) / speed, first = Math.min(t0, t1)
    if (first > enter) { enter = first; normal = speed > 0 ? [-axis[0], -axis[1]] : axis }
    exit = Math.min(exit, Math.max(t0, t1))
    if (enter > exit + EPS) return null
  }
  if (enter < -EPS || enter > 1 || exit <= EPS || dot(delta, normal) >= -EPS) return null
  return { time: Math.max(0, enter), normal }
}
export interface TerrainContact { normal: Vec; platform: Platform }
/** Sweep the complete body before committing a position, including during catches and climbing. */
export function moveBody(from: Vec, to: Vec, terrain: readonly Platform[], height = 62) {
  let x = from[0], y = from[1], dx = to[0] - x, dy = to[1] - y
  const contacts: TerrainContact[] = []
  const nearby = terrain.filter(b => Math.max(x, to[0]) + 13 >= b.x && Math.min(x, to[0]) - 13 <= b.x + b.w
    && Math.max(y, to[1]) >= b.y && Math.min(y, to[1]) - height <= b.y + b.h)
  for (let pass = 0; pass < 12; pass++) {
    const hull = body(x, y, height)
    let stuck: { depth: number; normal: Vec; platform: Platform } | null = null
    for (const b of nearby) for (const piece of parts(b)) {
      const hit = penetration(hull, piece)
      if (hit && (!stuck || hit.depth < stuck.depth)) stuck = { ...hit, platform: b }
    }
    if (!stuck) break
    x += stuck.normal[0] * (stuck.depth + 1e-5); y += stuck.normal[1] * (stuck.depth + 1e-5)
    contacts.push(stuck)
  }
  for (let pass = 0; pass < 8 && Math.hypot(dx, dy) > EPS; pass++) {
    const hull = body(x, y, height)
    let first: { time: number; normal: Vec; platform: Platform } | null = null
    for (const b of nearby) for (const piece of parts(b)) {
      const hit = sweep(hull, piece, [dx, dy])
      if (hit && (!first || hit.time < first.time)) first = { ...hit, platform: b }
    }
    if (!first) { x += dx; y += dy; break }
    x += dx * first.time; y += dy * first.time
    dx *= 1 - first.time; dy *= 1 - first.time
    const into = dx * first.normal[0] + dy * first.normal[1]
    dx -= first.normal[0] * into; dy -= first.normal[1] * into
    contacts.push(first)
  }
  return { x, y, contacts }
}
export function nearestBoundary(b: Platform, x: number, y: number) {
  let best = { x, y, distance: Infinity, nx: 0, ny: -1 }
  const points = polygonPoints(b)
  for (let i = 0; i < points.length; i++) {
    const a = points[i], c = points[(i + 1) % points.length], dx = c[0] - a[0], dy = c[1] - a[1], length = Math.hypot(dx, dy)
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (length * length)))
    const px = a[0] + dx * t, py = a[1] + dy * t, distance = Math.hypot(px - x, py - y)
    if (distance < best.distance) best = { x: px, y: py, distance, nx: dy / length, ny: -dx / length }
  }
  return best
}
export function lineBlocked(a: Vec, b: Vec, terrain: readonly Platform[]) {
  const rx = b[0] - a[0], ry = b[1] - a[1]
  for (const shape of terrain) {
    if (Math.max(a[0], b[0]) < shape.x || Math.min(a[0], b[0]) > shape.x + shape.w
      || Math.max(a[1], b[1]) < shape.y || Math.min(a[1], b[1]) > shape.y + shape.h) continue
    const points = polygonPoints(shape)
    for (let i = 0; i < points.length; i++) {
      const c = points[i], d = points[(i + 1) % points.length], sx = d[0] - c[0], sy = d[1] - c[1], denominator = rx * sy - ry * sx
      if (Math.abs(denominator) < EPS) continue
      const t = ((c[0] - a[0]) * sy - (c[1] - a[1]) * sx) / denominator
      const u = ((c[0] - a[0]) * ry - (c[1] - a[1]) * rx) / denominator
      if (t > EPS && t < 1 - EPS && u >= 0 && u <= 1) return true
    }
    if (pointInside(shape, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2)) return true
  }
  return false
}

/** Interior intervals catch thin terrain and corners between rope particles. */
export function segmentPenetration(a: Vec, b: Vec, shape: Platform, clearance: number) {
  if (Math.max(a[0], b[0]) <= shape.x - clearance || Math.min(a[0], b[0]) >= shape.x + shape.w + clearance
    || Math.max(a[1], b[1]) <= shape.y - clearance || Math.min(a[1], b[1]) >= shape.y + shape.h + clearance) return null
  const dx = b[0] - a[0], dy = b[1] - a[1], cuts = [0, 1], points = polygonPoints(shape)
  // Maintain clearance at convex corners, rather than repeatedly penetrating and
  // popping out by the rope radius. That also lets an unloaded rope settle quietly.
  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    if (cross(points[(i + points.length - 1) % points.length], p, points[(i + 1) % points.length]) <= EPS) continue
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)))
    const x = a[0] + dx * t - p[0], y = a[1] + dy * t - p[1], distance = Math.hypot(x, y)
    if (distance > EPS && distance < clearance && !pointInside(shape, p[0] + x, p[1] + y)) return { t, dx: x * (clearance / distance - 1), dy: y * (clearance / distance - 1) }
  }
  for (let i = 0; i < points.length; i++) {
    const c = points[i], d = points[(i + 1) % points.length], sx = d[0] - c[0], sy = d[1] - c[1], denominator = dx * sy - dy * sx
    if (Math.abs(denominator) < EPS) continue
    const t = ((c[0] - a[0]) * sy - (c[1] - a[1]) * sx) / denominator
    const u = ((c[0] - a[0]) * dy - (c[1] - a[1]) * dx) / denominator
    if (t > 0 && t < 1 && u >= 0 && u <= 1) cuts.push(t)
  }
  cuts.sort((x, y) => x - y)
  for (let i = 1; i < cuts.length; i++) {
    const t = (cuts[i - 1] + cuts[i]) / 2, x = a[0] + dx * t, y = a[1] + dy * t
    if (pointInside(shape, x, y)) {
      const edge = nearestBoundary(shape, x, y)
      if (edge.distance > EPS) {
        // Move the whole span to that face, not just its interior sample. A small
        // correction at the sample can leave the ends on opposite sides of a slab.
        const depth = Math.max((edge.x - a[0]) * edge.nx + (edge.y - a[1]) * edge.ny,
          (edge.x - b[0]) * edge.nx + (edge.y - b[1]) * edge.ny) + clearance
        return { t: .5, dx: edge.nx * depth, dy: edge.ny * depth }
      }
    }
  }
  return null
}

/** A rope can bend between particles at an exposed convex terrain corner. The
 * corner carries the transverse force; neighboring particles only carry tension. */
export function ropeBend(a: Vec, b: Vec, terrain: readonly Platform[], clearance: number): [number, number] | null {
  const dx = b[0] - a[0], dy = b[1] - a[1], direct = Math.hypot(dx, dy)
  let best: [number, number] | null = null, length = Infinity
  for (const shape of terrain) {
    if (Math.max(a[0], b[0]) < shape.x - clearance || Math.min(a[0], b[0]) > shape.x + shape.w + clearance
      || Math.max(a[1], b[1]) < shape.y - clearance || Math.min(a[1], b[1]) > shape.y + shape.h + clearance) continue
    const points = polygonPoints(shape), blocked = lineBlocked(a, b, [shape])
    for (let i = 0; i < points.length; i++) {
      const before = points[(i + points.length - 1) % points.length], p = points[i], after = points[(i + 1) % points.length]
      if (cross(before, p, after) <= EPS) continue
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (direct * direct || 1)))
      if (!blocked && (t <= EPS || t >= 1 - EPS || Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]) > clearance + .01)) continue
      const u = Math.hypot(p[0] - before[0], p[1] - before[1]), v = Math.hypot(after[0] - p[0], after[1] - p[1])
      const n1 = [(p[1] - before[1]) / u, (before[0] - p[0]) / u], n2 = [(after[1] - p[1]) / v, (p[0] - after[0]) / v]
      const scale = clearance / Math.max(.1, 1 + n1[0] * n2[0] + n1[1] * n2[1])
      const c: [number, number] = [p[0] + (n1[0] + n2[0]) * scale, p[1] + (n1[1] + n2[1]) * scale]
      const along = ((c[0] - a[0]) * dx + (c[1] - a[1]) * dy) / (direct * direct || 1)
      if (along <= EPS || along >= 1 - EPS) continue
      const arc = Math.hypot(c[0] - a[0], c[1] - a[1]) + Math.hypot(c[0] - b[0], c[1] - b[1])
      if (arc - direct < EPS || arc >= length || arc > direct + clearance * 6 || lineBlocked(a, c, terrain) || lineBlocked(c, b, terrain)) continue
      best = c; length = arc
    }
  }
  return best
}
