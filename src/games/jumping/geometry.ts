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
interface BoundaryEdge { a: Vec; dx: number; dy: number; squared: number; nx: number; ny: number }
interface Bounds { left: number; right: number; top: number; bottom: number }
interface CollisionHull { points: readonly Vec[]; bounds: Bounds; axes?: Vec[] }
interface CollisionPiece extends CollisionHull { axes: Vec[]; projections: number[][] }
interface BoundaryGeometry {
  x: number; y: number; w: number; h: number
  polygon: number[]; profile: number[]; points: Vec[]; edges?: BoundaryEdge[]; nearest?: number
  parts?: Vec[][]; collision?: CollisionPiece[]
}
const boundaries = new WeakMap<Platform, BoundaryGeometry>()
const sameOutline = (outline: Platform['polygon'], saved: number[]) => (outline?.length ?? 0) * 2 === saved.length
  && (!outline || outline.every((p, i) => p[0] === saved[i * 2] && p[1] === saved[i * 2 + 1]))
/** Rope contacts revisit the same cave outline thousands of times per tick.
 * Retain world geometry, including edits made in place, without exposing the
 * cached arrays through the public polygonPoints authoring helper. */
function boundaryGeometry(b: Platform): BoundaryGeometry {
  const saved = boundaries.get(b)
  if (saved && b.x === saved.x && b.y === saved.y && b.w === saved.w && b.h === saved.h
    && sameOutline(b.polygon, saved.polygon) && sameOutline(b.profile, saved.profile)) return saved
  const geometry = { x: b.x, y: b.y, w: b.w, h: b.h, polygon: b.polygon?.flatMap(p => [...p]) ?? [],
    profile: b.profile?.flatMap(p => [...p]) ?? [], points: polygonPoints(b) }
  boundaries.set(b, geometry)
  return geometry
}
/** Read-only contact queries share the already validated world outline. The
 * authoring helper above still returns independent, editable points. */
export function platformOutline(b: Platform): readonly Vec[] {
  return boundaryGeometry(b).points
}
function boundaryEdges(geometry: BoundaryGeometry) {
  return geometry.edges ??= geometry.points.map((a, i) => {
    const c = geometry.points[(i + 1) % geometry.points.length], dx = c[0] - a[0], dy = c[1] - a[1], length = Math.hypot(dx, dy)
    return { a, dx, dy, squared: length * length, nx: dy / length, ny: -dx / length }
  })
}
function onSegment(p: Vec, a: Vec, b: Vec) {
  return p[0] >= Math.min(a[0], b[0]) - EPS && p[0] <= Math.max(a[0], b[0]) + EPS
    && p[1] >= Math.min(a[1], b[1]) - EPS && p[1] <= Math.max(a[1], b[1]) + EPS && Math.abs(cross(a, b, p)) < EPS
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
  const points = boundaryGeometry(b).points, point: Vec = [x, y]; let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], c = points[j]
    if (onSegment(point, a, c)) return true
    if ((a[1] > y) !== (c[1] > y) && x < (c[0] - a[0]) * (y - a[1]) / (c[1] - a[1]) + a[0]) inside = !inside
  }
  return inside
}
/** Convex pieces keep collision faithful to concave outlines and undercuts. */
function parts(b: Platform): Vec[][] {
  const geometry = boundaryGeometry(b)
  if (geometry.parts) return geometry.parts
  const points = geometry.points, result: Vec[][] = []
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
  geometry.parts = result; return result
}
const cornerCache = new WeakMap<Platform, Map<string, Platform[]>>()
/** Keep solids above or outside a ledge while its authored climb clears the supporting corner. */
export function outsideCorner(b: Platform, x: number, y: number, side: number, slope = 0): Platform[] {
  let saved = cornerCache.get(b)
  if (!saved) { saved = new Map(); cornerCache.set(b, saved) }
  const key = `${x},${y},${side},${slope}`, cached = saved.get(key)
  if (cached) return cached
  const clipped: Platform[] = []
  for (const points of parts(b)) for (const distance of [(p: Vec) => y + (p[0] - x) * side * slope - p[1], (p: Vec) => (x - p[0]) * side]) {
    const polygon: Vec[] = []
    for (let i = 0; i < points.length; i++) {
      const a = points[i], c = points[(i + 1) % points.length], da = distance(a), dc = distance(c)
      if (da >= 0) polygon.push(a)
      if ((da > 0 && dc < 0) || (da < 0 && dc > 0)) {
        const t = da / (da - dc)
        polygon.push([a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t])
      }
    }
    if (polygon.length < 3 || Math.abs(polygonArea(polygon)) < EPS) continue
    const left = Math.min(...polygon.map(p => p[0])), top = Math.min(...polygon.map(p => p[1]))
    clipped.push({ x: left, y: top, w: Math.max(...polygon.map(p => p[0])) - left, h: Math.max(...polygon.map(p => p[1])) - top,
      polygon: polygon.map(p => [p[0] - left, p[1] - top]) })
  }
  saved.set(key, clipped)
  return clipped
}
function axes(points: readonly Vec[]) {
  return points.map((a, i): Vec => {
    const b = points[(i + 1) % points.length], length = Math.hypot(b[0] - a[0], b[1] - a[1])
    return [(b[1] - a[1]) / length, (a[0] - b[0]) / length]
  })
}
function bounds(points: readonly Vec[]): Bounds {
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity
  for (const [x, y] of points) {
    left = Math.min(left, x); right = Math.max(right, x)
    top = Math.min(top, y); bottom = Math.max(bottom, y)
  }
  return { left, right, top, bottom }
}
/** A concave platform's overall bounds can cover large empty pits. Retain each
 * convex piece's bounds and separating axes, and test only reachable pieces. */
function collisionParts(b: Platform) {
  const geometry = boundaryGeometry(b)
  return geometry.collision ??= parts(b).map(points => {
    const normals = axes(points)
    return { points, bounds: bounds(points), axes: normals, projections: normals.map(axis => interval(points, axis)) }
  })
}
function separated(a: Bounds, b: Bounds, dx = 0, dy = 0) {
  return a.right + Math.max(0, dx) < b.left - EPS || a.left + Math.min(0, dx) > b.right + EPS
    || a.bottom + Math.max(0, dy) < b.top - EPS || a.top + Math.min(0, dy) > b.bottom + EPS
}
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1]
const interval = (points: readonly Vec[], axis: Vec) => {
  let min = Infinity, max = -Infinity
  for (const point of points) {
    const value = dot(point, axis)
    min = Math.min(min, value); max = Math.max(max, value)
  }
  return [min, max]
}
/** Feet meet slopes at the sole; the broad upper hull protects torso and head. */
export function bodyPolygon(x: number, y: number, height: number, orientation = 1, angle = 0, outline?: readonly Vec[]): Vec[] {
  if (outline) return outline.map(([px, py]) => [x + px, y + py])
  if (!angle) {
    const hull: Vec[] = [[x - 12, y - height * orientation], [x + 12, y - height * orientation], [x + 12, y - 18 * orientation], [x, y], [x - 12, y - 18 * orientation]]
    return orientation < 0 ? hull.reverse() : hull
  }
  const points: Vec[] = [[-12, -height], [12, -height], [12, -18], [0, 0], [-12, -18]]
  const cos = Math.cos(angle), sin = Math.sin(angle)
  const hull = points.map(([px, py]) => [x + px * cos - py * orientation * sin, y + px * sin + py * orientation * cos] as Vec)
  return orientation < 0 ? hull.reverse() : hull
}
function penetration(a: CollisionHull, b: CollisionPiece) {
  if (separated(a.bounds, b.bounds)) return null
  const normals = a.axes ??= axes(a.points)
  let depth = Infinity, normal: Vec = [0, -1]
  for (let i = 0; i < normals.length + b.axes.length; i++) {
    const axis = i < normals.length ? normals[i] : b.axes[i - normals.length]
    const [amin, amax] = interval(a.points, axis), [bmin, bmax] = i < normals.length ? interval(b.points, axis) : b.projections[i - normals.length]
    if (amax <= bmin + EPS || amin >= bmax - EPS) return null
    const low = amax - bmin, high = bmax - amin
    if (Math.min(low, high) < depth) { depth = Math.min(low, high); normal = low < high ? [-axis[0], -axis[1]] : axis }
  }
  return { depth, normal }
}
export function bodyIntersects(x: number, y: number, b: Platform, height = 62, orientation = 1, angle = 0, outline?: readonly Vec[]) {
  if (outline) return polygonIntersects(bodyPolygon(x, y, height, orientation, angle, outline), b)
  if (orientation < 0 || angle) return polygonIntersects(bodyPolygon(x, y, height, orientation, angle), b)
  if (x + 12 <= b.x || x - 12 >= b.x + b.w || y <= b.y || y - height >= b.y + b.h) return false
  const points = bodyPolygon(x, y, height), hull = { points, bounds: bounds(points) }
  return collisionParts(b).some(piece => penetration(hull, piece) !== null)
}
function sweep(a: CollisionHull, b: CollisionPiece, delta: Vec) {
  if (separated(a.bounds, b.bounds, delta[0], delta[1])) return null
  const normals = a.axes ??= a.points.length > 1 ? axes(a.points) : []
  let enter = -Infinity, exit = Infinity, normal: Vec = [0, -1]
  for (let i = 0; i < normals.length + b.axes.length; i++) {
    const axis = i < normals.length ? normals[i] : b.axes[i - normals.length]
    const [amin, amax] = interval(a.points, axis), [bmin, bmax] = i < normals.length ? interval(b.points, axis) : b.projections[i - normals.length], speed = dot(delta, axis)
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
/** Sweep a particle correction too: resolving a body must not teleport its
 * supporting rope through a thin wall or onto the opposite face. */
export function movePoint(from: Vec, to: Vec, terrain: readonly Platform[], clearance: number) {
  let x = from[0], y = from[1], dx = to[0] - x, dy = to[1] - y
  const nearby = terrain.filter(b => Math.max(x, to[0]) + clearance >= b.x && Math.min(x, to[0]) - clearance <= b.x + b.w
    && Math.max(y, to[1]) + clearance >= b.y && Math.min(y, to[1]) - clearance <= b.y + b.h)
  for (let pass = 0; pass < 4 && Math.hypot(dx, dy) > EPS; pass++) {
    let first: { time: number; normal: Vec } | null = null
    const hull = { points: [[x, y]] as Vec[], bounds: { left: x, right: x, top: y, bottom: y } }
    for (const b of nearby) for (const piece of collisionParts(b)) {
      const hit = sweep(hull, piece, [dx, dy])
      if (hit && (!first || hit.time < first.time)) first = hit
    }
    if (!first) { x += dx; y += dy; break }
    x += dx * first.time + first.normal[0] * clearance
    y += dy * first.time + first.normal[1] * clearance
    dx *= 1 - first.time; dy *= 1 - first.time
    const into = dx * first.normal[0] + dy * first.normal[1]
    dx -= first.normal[0] * into; dy -= first.normal[1] * into
  }
  return { x, y }
}
/** Sweep the complete body before committing a position, including during catches and climbing. */
export function moveBody(from: Vec, to: Vec, terrain: readonly Platform[], height = 62, orientation = 1, angle = 0, outline?: readonly Vec[] | ((solid: Platform) => readonly Vec[] | undefined)) {
  let x = from[0], y = from[1], dx = to[0] - x, dy = to[1] - y
  const contacts: TerrainContact[] = []
  const extent = typeof outline === 'function' ? height + 13 : outline ? Math.max(...outline.map(p => Math.hypot(...p))) : angle ? height + 13 : 13
  const nearby = terrain.filter(b => Math.max(x, to[0]) + extent >= b.x && Math.min(x, to[0]) - extent <= b.x + b.w
    && Math.max(y, to[1]) + (outline ? extent : angle || orientation < 0 ? height : 0) >= b.y && Math.min(y, to[1]) - (outline ? extent : angle || orientation > 0 ? height : 0) <= b.y + b.h)
  const hullsAt = (x: number, y: number) => {
    if (typeof outline !== 'function') {
      const points = bodyPolygon(x, y, height, orientation, angle, outline), hull = { points, bounds: bounds(points) }
      return () => hull
    }
    const cache = new Map<readonly Vec[] | undefined, CollisionHull>()
    return (solid: Platform) => {
      const selected = typeof outline === 'function' ? outline(solid) : outline
      let hull = cache.get(selected)
      if (!hull) {
        const points = bodyPolygon(x, y, height, orientation, angle, selected)
        hull = { points, bounds: bounds(points) }; cache.set(selected, hull)
      }
      return hull
    }
  }
  for (let pass = 0; pass < 12; pass++) {
    const hullFor = hullsAt(x, y)
    let stuck: { depth: number; normal: Vec; platform: Platform } | null = null
    for (const b of nearby) for (const piece of collisionParts(b)) {
      const hit = penetration(hullFor(b), piece)
      if (hit && (!stuck || hit.depth < stuck.depth)) stuck = { ...hit, platform: b }
    }
    if (!stuck) break
    x += stuck.normal[0] * (stuck.depth + 1e-5); y += stuck.normal[1] * (stuck.depth + 1e-5)
    contacts.push(stuck)
  }
  for (let pass = 0; pass < 8 && Math.hypot(dx, dy) > EPS; pass++) {
    const hullFor = hullsAt(x, y)
    let first: { time: number; normal: Vec; platform: Platform } | null = null
    for (const b of nearby) for (const piece of collisionParts(b)) {
      const hit = sweep(hullFor(b), piece, [dx, dy])
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
export function nearestBoundary(b: Platform, x: number, y: number, normal?: Vec) {
  const geometry = boundaryGeometry(b), edges = boundaryEdges(geometry)
  const hint = !normal && edges.length ? geometry.nearest ?? 0 : -1
  let best = { x, y, distance: Infinity, nx: 0, ny: -1 }
  let bestIndex = Infinity
  // Adjacent rope particles usually meet the same face. Its exact distance is
  // an upper bound, so distant faces can be rejected before a square root.
  // Still visit every edge and preserve the original first-edge tie policy.
  if (hint >= 0) {
    bestIndex = hint
    const { a, dx, dy, squared, nx, ny } = edges[bestIndex]
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / squared))
    const px = a[0] + dx * t, py = a[1] + dy * t
    best = { x: px, y: py, distance: Math.hypot(px - x, py - y), nx, ny }
  }
  for (let i = 0; i < edges.length; i++) {
    if (i === hint) continue // Its exact distance was already tested above.
    const { a, dx, dy, squared, nx, ny } = edges[i]
    // A collision query must keep a face that can supply its separating normal.
    // The midpoint of a tall body's side can lie above a short box: a tiny
    // overlap must not relabel that side contact as the box's walkable top.
    if (normal && nx * normal[0] + ny * normal[1] <= EPS) continue
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / squared))
    const px = a[0] + dx * t, py = a[1] + dy * t, gapX = px - x, gapY = py - y
    // Reject clearly farther edges before a square root. Keep the original
    // hypot comparison for close candidates and the normal tie-break policy.
    if (!normal && gapX * gapX + gapY * gapY > (best.distance + EPS) * (best.distance + EPS)) continue
    const distance = Math.hypot(gapX, gapY)
    // Adjacent faces can share the contact point. Prefer the face that supplied
    // the collision normal instead of depending on vertex order or roundoff.
    const tied = normal && Math.abs(distance - best.distance) < 1e-5
    if (tied ? nx * normal[0] + ny * normal[1] > best.nx * normal[0] + best.ny * normal[1]
      : distance < best.distance || !normal && distance === best.distance && i < bestIndex) {
      best = { x: px, y: py, distance, nx, ny }; bestIndex = i
    }
  }
  if (!normal && bestIndex !== Infinity) geometry.nearest = bestIndex
  return best
}
export { parts as convexParts }
export function polygonIntersects(hull: readonly Vec[], terrain: Platform, tolerance = 0) {
  const hullBounds = bounds(hull), { left, right, top, bottom } = hullBounds
  if (right <= terrain.x || left >= terrain.x + terrain.w || bottom <= terrain.y || top >= terrain.y + terrain.h) return false
  const prepared = { points: hull, bounds: hullBounds }
  return collisionParts(terrain).some(piece => (penetration(prepared, piece)?.depth ?? 0) > tolerance)
}
/** Locate the face at the part of the hull that actually made contact. At a
 * concave corner, the face nearest the feet can differ from the blocking face. */
export function bodyContact(b: Platform, x: number, y: number, normal: Vec, height = 62, outline?: readonly Vec[]) {
  const hull = bodyPolygon(x, y, height, 1, 0, outline), depth = Math.min(...hull.map(p => dot(p, normal)))
  const touching = hull.filter(p => dot(p, normal) <= depth + EPS)
  return nearestBoundary(b, touching.reduce((sum, p) => sum + p[0], 0) / touching.length,
    touching.reduce((sum, p) => sum + p[1], 0) / touching.length, normal)
}
export function lineBlocked(a: Vec, b: Vec, terrain: Iterable<Platform>) {
  const rx = b[0] - a[0], ry = b[1] - a[1]
  for (const shape of terrain) {
    if (Math.max(a[0], b[0]) < shape.x || Math.min(a[0], b[0]) > shape.x + shape.w
      || Math.max(a[1], b[1]) < shape.y || Math.min(a[1], b[1]) > shape.y + shape.h) continue
    const points = boundaryGeometry(shape).points
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
  const dx = b[0] - a[0], dy = b[1] - a[1], cuts = [0, 1], points = boundaryGeometry(shape).points
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
    const points = boundaryGeometry(shape).points, blocked = lineBlocked(a, b, [shape])
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
