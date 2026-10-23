import type { Platform } from './model.ts'

type Point = readonly [number, number]
/** Control points are offsets from their authored node, in local terrain units. */
export interface TerrainBezier { in?: Point; out?: Point; mode?: 'corner' | 'smooth' | 'symmetric' }
export const CURVE_TOLERANCE = .06
/** Handles author the curve; gameplay uses a compact polygon on this grid. */
export const CURVE_GRID_SIZE = 5
export const MAX_CURVE_POINTS = 2048
export const bezierKey = (b: Platform) => b.bezier ? JSON.stringify(b.bezier) : ''

/** Editable anchors, in authored order; generated curve samples are never nodes. */
export function terrainNodes(b: Platform): Point[] {
  const local = b.polygon ?? (b.profile ? [...b.profile, [b.w, b.h] as Point, [0, b.h] as Point]
    : [[0, 0], [b.w, 0], [b.w, b.h], [0, b.h]])
  const points: Point[] = local.map(([x, y]) => [x + b.x, y + b.y] as Point)
    .filter((p, i, all) => b.bezier || Math.hypot(p[0] - all[(i + 1) % all.length][0], p[1] - all[(i + 1) % all.length][1]) > 1e-7)
  const area = points.reduce((sum, p, i) => { const q = points[(i + 1) % points.length]; return sum + p[0] * q[1] - q[0] * p[1] }, 0)
  return !b.bezier && area < 0 ? points.reverse() : points
}
const mix = (a: Point, b: Point, t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
const offset = (p: Point, d?: Point): Point => [p[0] + (d?.[0] ?? 0), p[1] + (d?.[1] ?? 0)]
export const relativePoint = (p: Point, anchor: Point): Point => [p[0] - anchor[0], p[1] - anchor[1]]
export function terrainCubic(b: Platform, edge: number): readonly [Point, Point, Point, Point] {
  const nodes = terrainNodes(b), a = nodes[edge], next = (edge + 1) % nodes.length, d = nodes[next]
  if (!b.bezier?.[edge]?.out && !b.bezier?.[next]?.in) return [a, mix(a, d, 1 / 3), mix(a, d, 2 / 3), d]
  return [a, offset(a, b.bezier?.[edge]?.out), offset(d, b.bezier?.[next]?.in), d]
}
export function splitCubic([a, b, c, d]: readonly Point[], t: number) {
  const ab = mix(a, b, t), bc = mix(b, c, t), cd = mix(c, d, t), abc = mix(ab, bc, t), bcd = mix(bc, cd, t), p = mix(abc, bcd, t)
  return { left: [a, ab, abc, p] as const, right: [p, bcd, cd, d] as const, point: p }
}
export const cubicPoint = (cubic: readonly Point[], t: number) => splitCubic(cubic, t).point
function distanceToSegment(p: Point, a: Point, b: Point) {
  const dx = b[0] - a[0], dy = b[1] - a[1], squared = dx * dx + dy * dy
  const t = squared ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / squared)) : 0
  return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t)
}
export interface CurveSample { point: Point; edge: number; t: number }
/** One bounded, deterministic outline for rendering and every collision consumer. */
export function terrainCurveSamples(b: Platform, tolerance = CURVE_TOLERANCE): CurveSample[] {
  const nodes = terrainNodes(b), samples: CurveSample[] = []
  function flatten(cubic: readonly Point[], edge: number, from: number, to: number, depth: number) {
    if (samples.length >= MAX_CURVE_POINTS) throw new Error('Terrain curve is too detailed. Shorten its handles or use fewer nodes.')
    const [a, p, q, d] = cubic
    if (depth >= 12 || Math.max(distanceToSegment(p, a, d), distanceToSegment(q, a, d)) <= tolerance) {
      samples.push({ point: a, edge, t: from }); return
    }
    const split = splitCubic(cubic, .5), mid = (from + to) / 2
    flatten(split.left, edge, from, mid, depth + 1); flatten(split.right, edge, mid, to, depth + 1)
  }
  for (let edge = 0; edge < nodes.length; edge++) {
    const next = (edge + 1) % nodes.length
    if (b.bezier?.[edge]?.out || b.bezier?.[next]?.in) flatten(terrainCubic(b, edge), edge, 0, 1, 0)
    else samples.push({ point: nodes[edge], edge, t: 0 })
  }
  return samples
}

/** Compact runtime geometry. Preserve explicit anchors, fit intermediate points
 * to the 5-unit grid, and discard duplicate/collinear samples before collision
 * decomposition. The same polygon is drawn and collided with in every system. */
export function terrainCurveOutline(b: Platform): Point[] {
  const grid = CURVE_GRID_SIZE
  // Ties away from zero keep inverted-gravity geometry exactly reflected.
  const snap = (v: number, min: number, max: number) => Math.max(Math.ceil(min / grid) * grid,
    Math.min(Math.floor(max / grid) * grid, Math.sign(v) * Math.round(Math.abs(v) / grid) * grid))
  const points = terrainCurveSamples(b, grid / 4).map(({ point: p, t }) => t === 0 ? p
    : [snap(p[0], b.x, b.x + b.w), snap(p[1], b.y, b.y + b.h)] as Point)
    .filter((p, i, all) => p[0] !== all[(i + 1) % all.length][0] || p[1] !== all[(i + 1) % all.length][1])
  return points.filter((p, i) => {
    const a = points[(i + points.length - 1) % points.length], c = points[(i + 1) % points.length]
    const dx = p[0] - a[0], dy = p[1] - a[1], ex = c[0] - p[0], ey = c[1] - p[1]
    // Grid fitting can flatten a narrow tip back onto its adjoining wall.
    // Remove that zero-area spike as well as ordinary collinear samples.
    return Math.abs(dx * ey - dy * ex) > 1e-7
  })
}
