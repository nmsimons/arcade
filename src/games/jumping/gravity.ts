import type { NamedObject } from './objectNames.ts'
import type { PowerMode, SwitchSettings } from './switchPower.ts'
import type { JumpInput, Player } from './model.ts'
import type { Prop } from './challenge.ts'
import { TUNING } from './movementTuning.ts'
import { bodyPolygon } from './geometry.ts'
import { playerContactBody } from './playerContacts.ts'
import type { Vec } from './geometry.ts'
import { playerTurnAngle } from './ropeGravity.ts'

export const MAX_GRAVITY_PLATES = 16
export const isWeightless = (gravity: number) => Math.abs(gravity) < TUNING.gravity * .05
/** The rectangle is the field; the emitter sits on the floor or ceiling edge. */
export interface GravityPlate extends NamedObject, SwitchSettings {
  id: string; x: number; y: number; w: number; h: number
  power?: PowerMode
  ceiling?: boolean
  effect?: 'water'
  gravity: number // Multiplier of ordinary gravity; negative values accelerate up.
}
export const gravityPlateActive = (plate: GravityPlate, states: ReadonlyMap<string, boolean>) => plate.power === 'always' || !!states.get(plate.id)

interface Span { top: number; bottom: number; multiplier: number; dryMultiplier: number; swim: number; coverage: number }
interface Strip { left: number; right: number; spans: Span[] }
export interface GravityField { strips: Strip[]; mask: number; revision: number; maxMultiplier: number; hasWater: boolean }
export const createGravityField = (): GravityField => ({ strips: [], mask: -1, revision: 0, maxMultiplier: 1, hasWater: false })

/** Partition switched rectangles once per power change. Cells never overlap,
 * so integrating a body counts its mass exactly once, even under several plates. */
export function updateGravityField(field: GravityField, plates: readonly GravityPlate[], states: ReadonlyMap<string, boolean>, powered: boolean) {
  let mask = 0
  if (powered) for (let i = 0; i < plates.length; i++) if (gravityPlateActive(plates[i], states)) mask |= 1 << i
  if (mask === field.mask) return
  field.mask = mask; field.revision++; field.strips = []; field.maxMultiplier = 1
  const active = plates.filter((_, i) => mask & (1 << i))
  field.hasWater = active.some(p => p.effect === 'water')
  const xs = [...new Set(active.flatMap(p => [p.x, p.x + p.w]))].sort((a, b) => a - b)
  for (let i = 1; i < xs.length; i++) {
    const left = xs[i - 1], right = xs[i]
    const crossing = active.filter(p => p.x < right && p.x + p.w > left)
    const ys = [...new Set(crossing.flatMap(p => [p.y, p.y + p.h]))].sort((a, b) => a - b)
    const spans: Span[] = []
    for (let j = 1; j < ys.length; j++) {
      const top = ys[j - 1], bottom = ys[j]
      let sum = 0, swimSum = 0, count = 0
      for (const p of crossing) if (p.y < bottom && p.y + p.h > top) { sum += p.effect === 'water' ? -1 : p.gravity; swimSum += p.effect === 'water' ? 1 : 0; count++ }
      if (!count) continue
      const multiplier = sum / count, swim = swimSum / count
      field.maxMultiplier = Math.max(field.maxMultiplier, Math.abs(multiplier))
      const previous = spans.at(-1)
      if (previous && previous.bottom === top && previous.multiplier === multiplier && previous.swim === swim) previous.bottom = bottom
      else spans.push({ top, bottom, multiplier, dryMultiplier: multiplier + 2 * swim, swim, coverage: 1 })
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
  intersection: (left: number, top: number, right: number, bottom: number) => number,
  property: 'multiplier' | 'dryMultiplier' | 'swim' | 'coverage' = 'multiplier', baseline: number = TUNING.gravity, outside = 1) {
  let multiplier = outside
  for (const strip of field.strips) {
    if (strip.left >= right) break
    if (strip.right <= left) continue
    for (const span of strip.spans) {
      if (span.top >= bottom) break
      if (span.bottom <= top) continue
      // Most bodies are wholly inside one cell: no clipping or trig needed.
      if (strip.left <= left && strip.right >= right && span.top <= top && span.bottom >= bottom) return span[property] * baseline
      multiplier += (span[property] - outside) * intersection(strip.left, span.top, strip.right, span.bottom) / area
    }
  }
  return multiplier * baseline
}

function playerFieldValue(field: GravityField, player: Player, offsetY = 0, property: 'multiplier' | 'dryMultiplier' | 'swim' | 'coverage' = 'multiplier') {
  const swim = property === 'swim' || property === 'coverage'
  if (!field.strips.length) return swim ? 0 : TUNING.gravity
  const body = playerContactBody(player), angle = playerTurnAngle(player)
  body.y += offsetY
  let points: Vec[] | undefined
  if (angle) points = bodyPolygon(body.x, body.y, body.height, player.inverted ? -1 : 1, angle)
  const left = points ? Math.min(...points.map(p => p[0])) : body.x - 12, right = points ? Math.max(...points.map(p => p[0])) : body.x + 12
  const top = points ? Math.min(...points.map(p => p[1])) : Math.min(body.y, body.y - body.height * (player.inverted ? -1 : 1))
  const bottom = points ? Math.max(...points.map(p => p[1])) : Math.max(body.y, body.y - body.height * (player.inverted ? -1 : 1))
  return integrate(field, left, top, right, bottom, 24 * (body.height - 9), (l, t, r, b) => {
    points ??= bodyPolygon(body.x, body.y, body.height, player.inverted ? -1 : 1)
    return clippedPolygonArea(points, l, t, r, b)
  }, property, swim ? 1 : TUNING.gravity, swim ? 0 : 1)
}
// A person displaces their weight with about 78% submerged. Upright, that puts
// the waterline at the neck. The prone rig lies close to the foot root, so its
// displaced volume must follow that pose rather than the standing contact hull.
const PLAYER_WATER_DENSITY = .78
function playerWaterPoints(player: Player): Vec[] {
  const amount = player.freeFall?.recovery === null ? player.freeFall.amount : 0
  const body = playerContactBody(player), orientation = player.inverted ? -1 : 1
  body.height = TUNING.height + (TUNING.crouchHeight - TUNING.height) * player.crouch
  const standing: Vec[] = [[-12, -body.height], [12, -body.height], [12, -18], [0, 0], [-12, -18]]
  const dive = player.waterMotion?.dive ?? 0, pitch = (1 + dive * orientation) * Math.PI / 2 * amount
  let area = 0, moment = 0
  for (let i = 0; i < standing.length; i++) {
    const a = standing[i], b = standing[(i + 1) % standing.length], cross = a[0] * b[1] - b[0] * a[1]
    area += cross; moment += (a[1] + b[1]) * cross
  }
  const standingCenter = moment / (3 * area), center = standingCenter + (-5 - Math.abs(dive) * 21 - standingCenter) * amount
  const width = 1 - amount * .5
  const angle = playerTurnAngle(player), cos = Math.cos(angle), sin = Math.sin(angle)
  return standing.map(([x, y]) => {
    // Rotate the displaced body with the extended rig. A linear blend of upright
    // and prone polygon vertices collapses its area midway through a swim start.
    const px = (x * width * Math.cos(pitch) - (y - standingCenter) * Math.sin(pitch)) * player.facing
    const py = (center + x * width * Math.sin(pitch) + (y - standingCenter) * Math.cos(pitch)) * orientation
    return [px * cos - py * sin, px * sin + py * cos] as Vec
  })
}
/** Changing pose reparametrizes the foot root around the same displaced center;
 * it must not teleport the body's mass downward when the swimmer becomes prone. */
export function playerWaterCenterOffset(player: Player) {
  const points = playerWaterPoints(player)
  let area = 0, moment = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length], cross = a[0] * b[1] - b[0] * a[1]
    area += cross; moment += (a[1] + b[1]) * cross
  }
  return moment / (3 * area)
}
function playerWaterValue(field: GravityField, player: Player, offsetY = 0, property: 'swim' | 'coverage' = 'swim') {
  const amount = player.freeFall?.recovery === null ? player.freeFall.amount : 0
  if (!amount) return playerFieldValue(field, player, offsetY, property)
  const body = playerContactBody(player)
  const points = playerWaterPoints(player).map(([x, y]) => [body.x + x, body.y + offsetY + y] as Vec)
  const left = Math.min(...points.map(p => p[0])), right = Math.max(...points.map(p => p[0]))
  const top = Math.min(...points.map(p => p[1])), bottom = Math.max(...points.map(p => p[1]))
  const area = clippedPolygonArea(points, left, top, right, bottom)
  return integrate(field, left, top, right, bottom, area, (l, t, r, b) => clippedPolygonArea(points, l, t, r, b), property, 1, 0)
}
export function playerGravity(field: GravityField, player: Player, offsetY = 0) {
  if (!field.hasWater) return playerFieldValue(field, player, offsetY)
  return playerFieldValue(field, player, offsetY, 'dryMultiplier')
    - TUNING.gravity * playerWaterValue(field, player, offsetY) / PLAYER_WATER_DENSITY
}
/** Buoyancy can lift a swimmer without reversing their footing or rope hang. */
export const playerOrientationGravity = (field: GravityField, player: Player) => playerFieldValue(field, player, 0, field.hasWater ? 'dryMultiplier' : 'multiplier')
export const playerSwimStrength = (field: GravityField, player: Player) => field.hasWater ? playerWaterValue(field, player) : 0
export const playerFieldCoverage = (field: GravityField, player: Player) => field.hasWater ? playerWaterValue(field, player, 0, 'coverage') : playerFieldValue(field, player, 0, 'coverage')

/** Down drives a bounded dive motor. Up releases the dive and returns upright;
 * ordinary buoyancy lifts and settles the swimmer at the same neck depth. */
export function swimmingAcceleration(player: Player, input: JumpInput, strength: number, coverage: number) {
  const direction = Number(input.descend || input.drop && !input.detach) - Number(input.climb)
  if (direction <= 0 || strength <= 0 || player.hang || player.mantle || player.climbing) return 0
  const target = TUNING.diveSpeed * strength / Math.max(coverage, 1e-9)
  const requested = (target - player.vy) * 10 - (player.gravity ?? TUNING.gravity)
  const maximum = TUNING.swimAcceleration * strength
  return Math.max(-maximum, Math.min(maximum, requested))
}
function propFieldValue(field: GravityField, prop: Prop, offsetY = 0, property: 'multiplier' | 'swim' = 'multiplier') {
  const water = property === 'swim', baseline = water ? 1 : TUNING.gravity, outside = water ? 0 : 1
  if (!field.strips.length) return water ? 0 : TUNING.gravity
  const radius = prop.size / 2, cx = prop.x, cy = prop.y - radius + offsetY
  if (prop.kind === 'ball') return integrate(field, cx - radius, cy - radius, cx + radius, cy + radius, Math.PI * radius * radius,
    (l, t, r, b) => circleRectangleArea(cx, cy, radius, l, t, r, b), property, baseline, outside)
  const cos = Math.cos(prop.angle), sin = Math.sin(prop.angle), extent = radius * (Math.abs(cos) + Math.abs(sin))
  let points: Vec[] | undefined
  return integrate(field, cx - extent, cy - extent, cx + extent, cy + extent, prop.size * prop.size, (l, t, r, b) => {
    points ??= [[-radius, -radius], [radius, -radius], [radius, radius], [-radius, radius]].map(([x, y]) => [cx + x * cos - y * sin, cy + x * sin + y * cos])
    return clippedPolygonArea(points, l, t, r, b)
  }, property, baseline, outside)
}
export const propGravity = (field: GravityField, prop: Prop, offsetY = 0) => propFieldValue(field, prop, offsetY)
/** Water resistance uses the same submerged area and overlap composition as buoyancy. */
export const propWaterStrength = (field: GravityField, prop: Prop) => field.hasWater ? propFieldValue(field, prop, 0, 'swim') : 0

/** Only a restoring vertical gradient damps bobbing. Uniform weak/reverse/zero
 * gravity and sideways field edges retain their ordinary free-flight behavior.
 * Critical damping scales with the body's actual local restoring stiffness. */
function floatDrag(above: number, below: number) {
  const stiffness = (above - below) / 2
  return stiffness > .01 ? 2 * Math.sqrt(stiffness) : 0
}
export function playerFloatDrag(field: GravityField, player: Player) {
  return field.strips.length ? floatDrag(playerGravity(field, player, -1), playerGravity(field, player, 1)) : 0
}
export function propFloatDrag(field: GravityField, prop: Prop) {
  return field.strips.length ? floatDrag(propGravity(field, prop, -1), propGravity(field, prop, 1)) : 0
}

export function setPlayerGravity(player: Player, gravity: number, supportAcceleration = gravity) {
  player.gravity = gravity
  if (supportAcceleration * (player.inverted ? -1 : 1) < 0 && !player.hang && !player.mantle && !player.climbing) {
    player.grounded = false; player.coyote = 0
    if (player.sliding) player.sliding.active = false
  }
}
