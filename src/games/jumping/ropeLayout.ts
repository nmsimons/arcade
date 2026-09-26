import type { Platform } from './model.ts'
import type { Rope, Point } from './climbables.ts'
import { createRope, stepRope, ROPE_CLEARANCE, ROPE_SEGMENT_LENGTH, ropeSegmentCount } from './climbables.ts'
import { lineBlocked, nearestBoundary, pointInside, polygonPoints } from './geometry.ts'

// Keep drag previews and unrelated inspector changes from solving the same layout twice.
const layouts = new Map<string, Rope['rest']>()
function fingerprint(source: string) {
  let a = 2166136261, b = 5381
  for (let i = 0; i < source.length; i++) {
    a = Math.imul(a ^ source.charCodeAt(i), 16777619)
    b = Math.imul(b, 33) ^ source.charCodeAt(i)
  }
  return `7:${(a >>> 0).toString(16).padStart(8, '0')}${(b >>> 0).toString(16).padStart(8, '0')}`
}

/** Start on a continuous route around solids, rather than ejecting isolated particles
 * to opposite faces of a block (which can thread a rope through thin platforms). */
function seedPath(rope: Rope, terrain: readonly Platform[]): Point[] {
  const start: Point = [rope.x, rope.y], end: Point = [rope.x, rope.y + rope.length]
  for (let pass = 0; pass < 12; pass++) {
    const solid = terrain.find(b => pointInside(b, ...end))
    if (!solid) break
    const edge = nearestBoundary(solid, ...end)
    end[0] = edge.x + edge.nx * ROPE_CLEARANCE; end[1] = edge.y + edge.ny * ROPE_CLEARANCE
  }
  if (!lineBlocked(start, end, terrain)) {
    // On a vertical face, clear the wall with the first segment and hang the
    // rest straight down. A diagonal seed makes every particle slide sideways
    // against the wall, taking seconds to converge for a long rope.
    const dx = end[0] - start[0], firstLength = Math.min(rope.length, ROPE_SEGMENT_LENGTH)
    if (Math.abs(dx) > 0 && Math.abs(dx) <= ROPE_CLEARANCE + .00001 && end[1] > start[1] + firstLength) {
      const first: Point = [end[0], start[1] + Math.sqrt(firstLength * firstLength - dx * dx)]
      if (!lineBlocked(start, first, terrain) && !lineBlocked(first, end, terrain)) return [start, first, end]
    }
    return [start, end]
  }
  const vertices: Point[] = [start, end]
  for (const b of terrain) {
    const points = polygonPoints(b)
    for (let i = 0; i < points.length; i++) {
      const a = points[(i + points.length - 1) % points.length], p = points[i], c = points[(i + 1) % points.length]
      if (Math.hypot(p[0] - rope.x, p[1] - rope.y) > rope.length + 32) continue
      const u = Math.hypot(p[0] - a[0], p[1] - a[1]), v = Math.hypot(c[0] - p[0], c[1] - p[1])
      const n1 = [(p[1] - a[1]) / u, (a[0] - p[0]) / u], n2 = [(c[1] - p[1]) / v, (p[0] - c[0]) / v]
      const scale = ROPE_CLEARANCE / Math.max(.1, 1 + n1[0] * n2[0] + n1[1] * n2[1])
      const corner: Point = [p[0] + (n1[0] + n2[0]) * scale, p[1] + (n1[1] + n2[1]) * scale]
      if (!terrain.some(shape => pointInside(shape, ...corner))) vertices.push(corner)
    }
  }
  const distance = vertices.map(() => Infinity), previous = vertices.map(() => -1), visited = new Set<number>()
  distance[0] = 0
  for (let step = 0; step < vertices.length; step++) {
    let from = -1
    for (let i = 0; i < vertices.length; i++) if (!visited.has(i) && (from < 0 || distance[i] < distance[from])) from = i
    if (from < 0 || !Number.isFinite(distance[from])) break
    if (from === 1) {
      const route: Point[] = []
      for (let i = 1; i !== -1; i = previous[i]) route.unshift(vertices[i])
      // The free tail hangs below the last obstacle, not back toward the original
      // vertical line through the anchor. Seed that rest direction when it is clear.
      const support = route.at(-2)!
      const used = route.slice(1, -1).reduce((sum, p, i) => sum + Math.hypot(p[0] - route[i][0], p[1] - route[i][1]), 0)
      const tail: Point = [support[0], support[1] + Math.max(0, rope.length - used)]
      if (used < rope.length && !lineBlocked(support, tail, terrain)) route[route.length - 1] = tail
      return route
    }
    visited.add(from)
    for (let to = 0; to < vertices.length; to++) {
      if (visited.has(to)) continue
      const candidate = distance[from] + Math.hypot(vertices[to][0] - vertices[from][0], vertices[to][1] - vertices[from][1])
      if (candidate < distance[to] && !lineBlocked(vertices[from], vertices[to], terrain)) { distance[to] = candidate; previous[to] = from }
    }
  }
  return [start, end]
}

// A coat of paint must not discard an authored rope's settled path or change its cache key.
const geometryOnly = (key: string, value: unknown) => key === 'material' ? undefined : value

/** Resolve an unloaded rope once, in authoring time, using the game's own constraints. */
export function prepareRope(definition: Rope, terrain: readonly Platform[], preview = false): Rope {
  if (preview) {
    // Interactive sketches must never route around geometry or run constraints.
    // Keep a matching saved path; otherwise show a straight rope until the worker finishes.
    const rope = { ...definition, segments: ropeSegmentCount(definition.length) }, reach = rope.length + 32
    const nearby = terrain.filter(b => b.x < rope.x + reach && b.x + b.w > rope.x - reach && b.y < rope.y + reach && b.y + b.h > rope.y - reach)
    const source = JSON.stringify([rope.x, rope.y, rope.length, rope.segments, nearby], geometryOnly), key = fingerprint(source)
    if (rope.rest?.key === key || rope.rest?.key === `preview:${key}`) return definition
    const state = createRope({ ...rope, rest: undefined })
    return { ...rope, rest: { key: `preview:${key}`, points: state.nodes.map(n => [n.x, n.y] as Point),
      distances: state.nodes.map((_, i) => Math.min(rope.length, i * ROPE_SEGMENT_LENGTH)) } }
  }
  const rope = { ...definition, segments: ropeSegmentCount(definition.length) }
  // Use an exposed face of the terrain union, so overlapping blocks cannot bounce
  // a buried anchor back and forth between their internal edges.
  if (terrain.some(b => pointInside(b, rope.x, rope.y) && nearestBoundary(b, rope.x, rope.y).distance > .01)) {
    let best: { x: number; y: number; distance: number } | undefined
    for (const shape of terrain) {
      const points = polygonPoints(shape)
      for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length], dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy)
        const t = Math.max(0, Math.min(1, ((rope.x - a[0]) * dx + (rope.y - a[1]) * dy) / (length * length)))
        for (const along of [t, 0, 1]) {
          const x = a[0] + along * dx, y = a[1] + along * dy, distance = Math.hypot(x - rope.x, y - rope.y)
          if (best && distance >= best.distance) continue
          if (!terrain.some(s => pointInside(s, x + dy / length * .001, y - dx / length * .001))) best = { x, y, distance }
        }
      }
    }
    if (best) { rope.x = best.x; rope.y = best.y; delete rope.anchor }
  }
  const reach = rope.length + 32
  const nearby = terrain.filter(b => b.x < rope.x + reach && b.x + b.w > rope.x - reach && b.y < rope.y + reach && b.y + b.h > rope.y - reach)
  const source = JSON.stringify([rope.x, rope.y, rope.length, rope.segments, nearby], geometryOnly), key = fingerprint(source)
  if (rope.rest?.key === key) return definition
  const cached = layouts.get(source)
  if (cached) return { ...rope, rest: cached }
  delete rope.rest
  const state = createRope(rope)
  const distances = state.nodes.map((_, i) => Math.min(rope.length, i * ROPE_SEGMENT_LENGTH))
  // A free vertical span is already its exact rest shape. Do not simulate
  // thousands of constraint passes merely to rediscover that straight line.
  if (!nearby.some(b => b.x < rope.x + ROPE_CLEARANCE && b.x + b.w > rope.x - ROPE_CLEARANCE
    && b.y < rope.y + rope.length + ROPE_CLEARANCE && b.y + b.h > rope.y - ROPE_CLEARANCE)) {
    const rest = { key, points: state.nodes.map(n => [n.x, n.y] as Point), distances, bends: state.bends }
    if (layouts.size >= 128) layouts.delete(layouts.keys().next().value!)
    layouts.set(source, rest)
    return { ...rope, rest }
  }
  const path = seedPath(rope, nearby)
  for (let i = 1; i < state.nodes.length; i++) {
    let travel = distances[i]
    for (let j = 1; j < path.length; j++) {
      const a = path[j - 1], b = path[j], length = Math.hypot(b[0] - a[0], b[1] - a[1])
      if (travel > length && j < path.length - 1) { travel -= length; continue }
      const t = Math.min(1, travel / (length || 1)), n = state.nodes[i]
      n.x = n.oldX = a[0] + (b[0] - a[0]) * t; n.y = n.oldY = a[1] + (b[1] - a[1]) * t
      break
    }
  }
  rope.rest = { key, points: state.nodes.map(n => [n.x, n.y] as Point), distances }
  let quiet = 0
  // Fixed steps and a fixed seed give identical results regardless of frame rate.
  // Extra damping removes the long, uninteresting startup swing in the editor.
  for (let frame = 0; frame < 4800; frame++) {
    stepRope(state, 1 / 120, nearby, null)
    let motion = 0
    for (const node of state.nodes) {
      motion = Math.max(motion, Math.hypot(node.x - node.oldX, node.y - node.oldY))
      node.oldX = node.x - (node.x - node.oldX) * .98
      node.oldY = node.y - (node.y - node.oldY) * .98
    }
    quiet = motion < .0005 ? quiet + 1 : 0
    if (quiet >= 60) break
  }
  const rest = { key, points: state.nodes.map(n => [n.x, n.y] as Point), distances, bends: state.bends }
  if (layouts.size >= 128) layouts.delete(layouts.keys().next().value!)
  layouts.set(source, rest)
  return { ...rope, rest }
}
