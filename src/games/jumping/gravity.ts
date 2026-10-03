import type { NamedObject } from './objectNames.ts'
import type { PowerMode, SwitchSettings } from './switchPower.ts'
import type { Player } from './model.ts'
import type { Prop } from './challenge.ts'
import { TUNING } from './movementTuning.ts'
import { bodyPolygon } from './geometry.ts'
import { playerContactBody } from './playerContacts.ts'
import type { Vec } from './geometry.ts'

export const MAX_GRAVITY_PLATES = 16
/** The rectangle is the field; its bottom edge is the emitter plate. */
export interface GravityPlate extends NamedObject, SwitchSettings {
  id: string; x: number; y: number; w: number; h: number
  power?: PowerMode
  gravity: number // Multiplier of ordinary gravity; negative values accelerate up.
}
export const gravityPlateActive = (plate: GravityPlate, states: ReadonlyMap<string, boolean>) => plate.power === 'always' || !!states.get(plate.id)

interface Span { top: number; bottom: number; multiplier: number }
interface Strip { left: number; right: number; spans: Span[] }
export interface GravityField { strips: Strip[]; mask: number; revision: number; maxMultiplier: number }
export const createGravityField = (): GravityField => ({ strips: [], mask: -1, revision: 0, maxMultiplier: 1 })

/** Partition switched rectangles once per power change. Cells never overlap,
 * so integrating a body counts its mass exactly once, even under several plates. */
export function updateGravityField(field: GravityField, plates: readonly GravityPlate[], states: ReadonlyMap<string, boolean>, powered: boolean) {
  let mask = 0
  if (powered) for (let i = 0; i < plates.length; i++) if (gravityPlateActive(plates[i], states)) mask |= 1 << i
  if (mask === field.mask) return
  field.mask = mask; field.revision++; field.strips = []; field.maxMultiplier = 1
  const active = plates.filter((_, i) => mask & (1 << i))
  const xs = [...new Set(active.flatMap(p => [p.x, p.x + p.w]))].sort((a, b) => a - b)
  for (let i = 1; i < xs.length; i++) {
    const left = xs[i - 1], right = xs[i]
    const crossing = active.filter(p => p.x < right && p.x + p.w > left)
    const ys = [...new Set(crossing.flatMap(p => [p.y, p.y + p.h]))].sort((a, b) => a - b)
    const spans: Span[] = []
    for (let j = 1; j < ys.length; j++) {
      const top = ys[j - 1], bottom = ys[j]
      let sum = 0, count = 0
      for (const p of crossing) if (p.y < bottom && p.y + p.h > top) { sum += p.gravity; count++ }
      if (!count) continue
      const multiplier = sum / count
      field.maxMultiplier = Math.max(field.maxMultiplier, Math.abs(multiplier))
      if (multiplier === 1) continue
      const previous = spans.at(-1)
      if (previous && previous.bottom === top && previous.multiplier === multiplier) previous.bottom = bottom
      else spans.push({ top, bottom, multiplier })
    }
    if (spans.length) field.strips.push({ left, right, spans })
  }
}

/** Point masses (rope particles) use the same precomputed field. */
export function gravityAtPoint(field: GravityField, x: number, y: number, baseline: number = TUNING.gravity) {
  for (const strip of field.strips) {
    if (strip.left > x) break
    if (x >= strip.right) continue
    for (const span of strip.spans) {
      if (span.top > y) break
      if (y < span.bottom) return baseline * span.multiplier
    }
  }
  return baseline
}

// Fixed scratch space: clipping convex player/box hulls creates no per-cell arrays.
const scratchA = new Float64Array(32), scratchB = new Float64Array(32)
export function clippedPolygonArea(points: readonly Vec[], left: number, top: number, right: number, bottom: number) {
  let source = scratchA, target = scratchB, count = points.length
  for (let i = 0; i < count; i++) { source[i * 2] = points[i][0]; source[i * 2 + 1] = points[i][1] }
  for (let edge = 0; edge < 4 && count; edge++) {
    const axis = edge % 2, limit = edge === 0 ? left : edge === 1 ? top : edge === 2 ? right : bottom
    let out = 0, a = count - 1
    for (let b = 0; b < count; b++) {
      const av = source[a * 2 + axis], bv = source[b * 2 + axis], ai = edge < 2 ? av >= limit : av <= limit, bi = edge < 2 ? bv >= limit : bv <= limit
      if (ai !== bi) {
        const t = (limit - av) / (bv - av)
        target[out * 2] = source[a * 2] + (source[b * 2] - source[a * 2]) * t
        target[out * 2 + 1] = source[a * 2 + 1] + (source[b * 2 + 1] - source[a * 2 + 1]) * t
        out++
      }
      if (bi) { target[out * 2] = source[b * 2]; target[out * 2 + 1] = source[b * 2 + 1]; out++ }
      a = b
    }
    count = out
    const swap = source; source = target; target = swap
  }
  let area = 0
  // Relative coordinates prevent cancellation far from the origin.
  for (let i = 1; i + 1 < count; i++) area += (source[i * 2] - source[0]) * (source[(i + 1) * 2 + 1] - source[1])
    - (source[i * 2 + 1] - source[1]) * (source[(i + 1) * 2] - source[0])
  return Math.abs(area) / 2
}

/** Exact disk/rectangle intersection, using a signed quadrant integral. */
export function circleRectangleArea(cx: number, cy: number, radius: number, left: number, top: number, right: number, bottom: number) {
  const r2 = radius * radius
  const primitive = (x: number) => .5 * (x * Math.sqrt(Math.max(0, r2 - x * x)) + r2 * Math.asin(x / radius))
  const quadrant = (dx: number, dy: number) => {
    const x = Math.min(radius, Math.abs(dx)), y = Math.min(radius, Math.abs(dy))
    const cut = Math.sqrt(Math.max(0, r2 - y * y))
    const area = x <= cut ? x * y : cut * y + primitive(x) - primitive(cut)
    return Math.sign(dx) * Math.sign(dy) * area
  }
  return Math.max(0, quadrant(right - cx, bottom - cy) - quadrant(left - cx, bottom - cy)
    - quadrant(right - cx, top - cy) + quadrant(left - cx, top - cy))
}

function integrate(field: GravityField, left: number, top: number, right: number, bottom: number, area: number,
  intersection: (left: number, top: number, right: number, bottom: number) => number) {
  let multiplier = 1
  for (const strip of field.strips) {
    if (strip.left >= right) break
    if (strip.right <= left) continue
    for (const span of strip.spans) {
      if (span.top >= bottom) break
      if (span.bottom <= top) continue
      // Most bodies are wholly inside one cell: no clipping or trig needed.
      if (strip.left <= left && strip.right >= right && span.top <= top && span.bottom >= bottom) return span.multiplier * TUNING.gravity
      multiplier += (span.multiplier - 1) * intersection(strip.left, span.top, strip.right, span.bottom) / area
    }
  }
  return multiplier * TUNING.gravity
}

export function playerGravity(field: GravityField, player: Player) {
  if (!field.strips.length) return TUNING.gravity
  const body = playerContactBody(player), left = body.x - 12, right = body.x + 12, top = Math.min(body.y, body.y - body.height * (player.inverted ? -1 : 1)), bottom = Math.max(body.y, body.y - body.height * (player.inverted ? -1 : 1))
  let points: Vec[] | undefined
  return integrate(field, left, top, right, bottom, 24 * (body.height - 9), (l, t, r, b) => {
    points ??= bodyPolygon(body.x, body.y, body.height, player.inverted ? -1 : 1)
    return clippedPolygonArea(points, l, t, r, b)
  })
}
export function propGravity(field: GravityField, prop: Prop) {
  if (!field.strips.length) return TUNING.gravity
  const radius = prop.size / 2, cx = prop.x, cy = prop.y - radius
  if (prop.kind === 'ball') return integrate(field, cx - radius, cy - radius, cx + radius, cy + radius, Math.PI * radius * radius,
    (l, t, r, b) => circleRectangleArea(cx, cy, radius, l, t, r, b))
  const cos = Math.cos(prop.angle), sin = Math.sin(prop.angle), extent = radius * (Math.abs(cos) + Math.abs(sin))
  let points: Vec[] | undefined
  return integrate(field, cx - extent, cy - extent, cx + extent, cy + extent, prop.size * prop.size, (l, t, r, b) => {
    points ??= [[-radius, -radius], [radius, -radius], [radius, radius], [-radius, radius]].map(([x, y]) => [cx + x * cos - y * sin, cy + x * sin + y * cos])
    return clippedPolygonArea(points, l, t, r, b)
  })
}

export function setPlayerGravity(player: Player, gravity: number) {
  player.gravity = gravity
  if (gravity * (player.inverted ? -1 : 1) < 0 && !player.hang && !player.mantle && !player.climbing) {
    player.grounded = false; player.coyote = 0
    if (player.sliding) player.sliding.active = false
  }
}
