import type { Prop } from './challenge.ts'
import type { Platform } from './model.ts'
import type { Vec } from './geometry.ts'
import { polygonPoints } from './geometry.ts'

/** Prop positions retain their file convention: center X and unrotated bottom Y. */
export function boxShape(b: Pick<Prop, 'x' | 'y' | 'size' | 'angle'>): Platform {
  const r = b.size / 2
  if (Math.abs(b.angle) < 1e-9) return { x: b.x - r, y: b.y - b.size, w: b.size, h: b.size }
  const c = Math.cos(b.angle), s = Math.sin(b.angle)
  const points = [[-r, -r], [r, -r], [r, r], [-r, r]].map(([x, y]) => [b.x + x * c - y * s, b.y - r + x * s + y * c] as Vec)
  const x = Math.min(...points.map(p => p[0])), y = Math.min(...points.map(p => p[1]))
  return { x, y, w: Math.max(...points.map(p => p[0])) - x, h: Math.max(...points.map(p => p[1])) - y,
    polygon: points.map(p => [p[0] - x, p[1] - y]) }
}

/** Match the prop solver's round hull so feet, jumps and neighboring terrain
 * all participate in the same player contact resolution. */
export function ballShape(b: Pick<Prop, 'x' | 'y' | 'size'>): Platform {
  const r = b.size / 2, radius = r / Math.cos(Math.PI / 64)
  return { x: b.x - r, y: b.y - b.size, w: b.size, h: b.size,
    polygon: Array.from({ length: 64 }, (_, i) => {
      const angle = (i + .5) * Math.PI / 32
      return [r + Math.cos(angle) * radius, r + Math.sin(angle) * radius]
    }) }
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

/** Only the actual bottom edge/corner loads a plate, including a tilted box. */
export function propLoadsPlate(b: Prop, left: number, y: number, width: number) {
  if (!b.grounded) return false
  if (b.kind === 'ball') return Math.abs(b.y - y) < 2 && b.x > left + 2 && b.x < left + width - 2
  const shape = boxShape(b), points = shape.polygon?.map(([x, y]) => [shape.x + x, shape.y + y])
    ?? [[shape.x, shape.y + shape.h], [shape.x + shape.w, shape.y + shape.h]]
  const feet = points.filter(p => Math.abs(p[1] - y) < 2)
  return !!feet.length && Math.max(...feet.map(p => p[0])) > left + 2 && Math.min(...feet.map(p => p[0])) < left + width - 2
}
