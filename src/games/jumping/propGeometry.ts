import type { Prop } from './challenge.ts'
import type { Platform } from './model.ts'
import type { Vec } from './geometry.ts'
import { polygonPoints } from './geometry.ts'

/** Prop positions retain their file convention: center X and unrotated bottom Y. */
export function boxShape(b: Pick<Prop, 'x' | 'y' | 'size' | 'angle'>): Platform {
  const r = b.size / 2
  if (Math.abs(b.angle - Math.round(b.angle / (Math.PI / 2)) * (Math.PI / 2)) < 1e-8) return { looseProp: true, x: b.x - r, y: b.y - b.size, w: b.size, h: b.size }
  const c = Math.cos(b.angle), s = Math.sin(b.angle)
  const points = [[-r, -r], [r, -r], [r, r], [-r, r]].map(([x, y]) => [b.x + x * c - y * s, b.y - r + x * s + y * c] as Vec)
  const x = Math.min(...points.map(p => p[0])), y = Math.min(...points.map(p => p[1]))
  return { looseProp: true, x, y, w: Math.max(...points.map(p => p[0])) - x, h: Math.max(...points.map(p => p[1])) - y,
    polygon: points.map(p => [p[0] - x, p[1] - y]) }
}

const circleHulls = new Map<number, Vec[]>()
/** Small balls halve the collision sides; corners stay within .15 units of the circle. */
export function ballHull(size: number, inWater = false): readonly Vec[] {
  const r = size / 2, sides = inWater && size <= 60 ? 32 : 64
  let unit = circleHulls.get(sides)
  if (!unit) {
    unit = Array.from({ length: sides }, (_, i) => {
      const angle = (i + .5) * Math.PI * 2 / sides
      return [Math.cos(angle), Math.sin(angle)] as Vec
    })
    circleHulls.set(sides, unit)
  }
  const radius = r / Math.cos(Math.PI / sides)
  return unit.map(([x, y]) => [x * radius, y * radius])
}
const ballShapes = new WeakMap<object, { size: number; inWater: boolean; shape: Platform }>()
/** Match the prop solver's round hull so feet, jumps and neighboring terrain
 * all participate in the same player contact resolution. */
export function ballShape(b: Pick<Prop, 'x' | 'y' | 'size'> & { waterImmersion?: number }): Platform {
  const cached = ballShapes.get(b)
  const r = b.size / 2, inWater = (b.waterImmersion ?? 0) > 0
  const x = b.x - r, y = b.y - b.size
  if (cached?.size === b.size && cached.inWater === inWater && cached.shape.x === x && cached.shape.y === y) return cached.shape
  // Reuse the local outline during translation, and the entire shape at rest.
  // A moving shape gets a new identity so world-space collision caches stay valid.
  const polygon = cached?.size === b.size && cached.inWater === inWater ? cached.shape.polygon
    : ballHull(b.size, inWater).map(([x, y]): Vec => [r + x, r + y])
  const shape = { looseProp: true, x, y, w: b.size, h: b.size, polygon }
  ballShapes.set(b, { size: b.size, inWater, shape })
  return shape
}

export function propBounds(b: Prop) {
  return b.kind === 'box' ? boxShape(b) : { x: b.x - b.size / 2, y: b.y - b.size, w: b.size, h: b.size }
}

/** The face at hand height, rather than the outermost rotated corner. */
export function boxPushFace(b: Prop, x: number, y: number, direction: number, handHeight = 43) {
  if (b.kind !== 'box') return null
  const points = polygonPoints(boxShape(b)), handY = y - handHeight
  for (let i = 0; i < points.length; i++) {
    const a = points[i], c = points[(i + 1) % points.length], dx = c[0] - a[0], dy = c[1] - a[1]
    if (dy * direction >= 0 || Math.abs(dy) < Math.abs(dx) * .7 || handY < Math.min(a[1], c[1]) || handY > Math.max(a[1], c[1])) continue
    const wallX = a[0] + (handY - a[1]) * dx / dy, gap = (wallX - x) * direction
    if (gap >= 6 && gap <= 38) return { wallX, slope: dx / dy }
  }
  return null
}

export interface PushPalm { x: number; y: number; nx: number; ny: number }
export interface PushHands {
  wallX: number
  /** Change in the hand face's X as the player's footing rises or falls. */
  slope: number
  height?: number
  palms?: [PushPalm, PushPalm]
}

/** Two reachable contacts on the visible surface, independent of a ball's
 * rotation. Short props lower the hands instead of dropping the pushing pose. */
export function propPushHands(b: Prop, x: number, y: number, direction: number, handHeight = 43, maxGap = 38): PushHands | null {
  if (b.kind === 'ball') {
    const r = b.size / 2, cy = b.y - r
    const handY = Math.max(cy - r * .6 + 3, Math.min(cy + r * .6, y - handHeight))
    const palm = (height: number): PushPalm => {
      const ny = (height - cy) / r, nx = -direction * Math.sqrt(1 - ny * ny)
      return { x: b.x + nx * r, y: height, nx, ny }
    }
    const palms: [PushPalm, PushPalm] = [palm(handY), palm(handY - 3)]
    const gap = (palms[0].x - x) * direction
    if (gap < 6 || gap > maxGap) return null
    return { wallX: palms[0].x, slope: handY === y - handHeight ? -palms[0].ny / palms[0].nx : 0, height: y - handY, palms }
  }
  const shape = boxShape(b), points = polygonPoints(shape)
  // Base low grips on the center, not the top of whichever edge is currently
  // facing us: a tumbling box must not make the stance jump between corners.
  // A higher footing can bring the upper face into ordinary standing reach.
  // Keep the center-based low grip for short props, but do not drag those hands
  // down toward a tall box's center while the player is standing on a ball.
  const lowGrip = b.size * .7 < handHeight ? b.y - b.size * .7
    : Math.min(b.y - b.size * .7, Math.max(shape.y + 3, y - handHeight))
  const handY = Math.max(lowGrip, Math.min(shape.y + shape.h - 5, y - handHeight))
  const palm = (height: number): PushPalm | null => {
    for (let i = 0; i < points.length; i++) {
      const a = points[i], c = points[(i + 1) % points.length], dx = c[0] - a[0], dy = c[1] - a[1]
      if (dy * direction >= 0 || height < Math.min(a[1], c[1]) || height > Math.max(a[1], c[1])) continue
      const length = Math.hypot(dx, dy)
      return { x: a[0] + (height - a[1]) * dx / dy, y: height, nx: dy / length, ny: -dx / length }
    }
    return null
  }
  const front = palm(handY), back = palm(handY - 3)
  if (!front || !back) return null
  const gap = (front.x - x) * direction
  return gap >= 6 && gap <= maxGap ? { wallX: front.x, slope: handY === y - handHeight ? -front.ny / front.nx : 0,
    height: y - handY, palms: [front, back] } : null
}

/** Only the contacting edge/corner loads a plate, including a tilted box. */
export function propLoadsPlate(b: Prop, left: number, y: number, width: number, ceiling = false) {
  if (!b.grounded) return false
  if (b.kind === 'ball') return Math.abs(b.y - (ceiling ? b.size : 0) - y) < 2 && b.x > left + 2 && b.x < left + width - 2
  const shape = boxShape(b), points = shape.polygon?.map(([x, y]) => [shape.x + x, shape.y + y])
    ?? [[shape.x, shape.y + (ceiling ? 0 : shape.h)], [shape.x + shape.w, shape.y + (ceiling ? 0 : shape.h)]]
  const feet = points.filter(p => Math.abs(p[1] - y) < 2)
  return !!feet.length && Math.max(...feet.map(p => p[0])) > left + 2 && Math.min(...feet.map(p => p[0])) < left + width - 2
}
