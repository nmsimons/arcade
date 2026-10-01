import type { Platform } from './model.ts'
import { polygonPoints } from './geometry.ts'
import { canGrip } from './friction.ts'

export interface GroundSurface { platform: Platform; y: number; angle: number }

/** Profile points are local x/y offsets from the platform's upper-left corner. */
export function platformSurfaces(platform: Platform, x: number): GroundSurface[] {
  if (!platform.polygon) return [platformSurface(platform, x)]
  const points = polygonPoints(platform), found: GroundSurface[] = []
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length], dx = b[0] - a[0]
    if (dx <= 1e-7 || x < a[0] - 1e-7 || x > b[0] + 1e-7) continue
    const slope = (b[1] - a[1]) / dx
    found.push({ platform, y: a[1] + (x - a[0]) * slope, angle: Math.atan(slope) })
  }
  return found
}
export function platformSurface(platform: Platform, x: number, nearY = -Infinity): GroundSurface {
  if (platform.polygon) {
    const surfaces = platformSurfaces(platform, Math.max(platform.x, Math.min(platform.x + platform.w, x)))
    surfaces.sort((a, b) => nearY === -Infinity ? a.y - b.y : Math.abs(a.y - nearY) - Math.abs(b.y - nearY))
    return surfaces[0] ?? { platform, y: Infinity, angle: 0 }
  }
  const points = platform.profile
  if (!points) return { platform, y: platform.y, angle: 0 }
  const local = Math.max(0, Math.min(platform.w, x - platform.x))
  let i = 1
  while (i < points.length - 1 && local > points[i][0]) i++
  const [ax, ay] = points[i - 1], [bx, by] = points[i]
  const slope = (by - ay) / (bx - ax)
  return { platform, y: platform.y + ay + (local - ax) * slope, angle: Math.atan(slope) }
}

/** Choose the exposed surface within reach, ignoring floors far below and ceilings above. */
export function groundAt(platforms: readonly Platform[], x: number, y: number, reach = 26,
  accepts?: (surface: GroundSurface) => boolean): GroundSurface | null {
  let found: GroundSurface | null = null
  for (const platform of platforms) {
    if (x < platform.x || x > platform.x + platform.w) continue
    for (const surface of platformSurfaces(platform, x))
      if (Math.abs(surface.y - y) <= reach && (!accepts || accepts(surface)) && (!found || surface.y < found.y)) found = surface
  }
  return found
}

/** Solid intervals on a vertical slice. Concave terrain can have open air
 * between its ceiling and floor even when both belong to the same polygon. */
function solidSpans(platform: Platform, x: number): number[][] {
  if (x < platform.x || x > platform.x + platform.w) return []
  if (!platform.polygon) return [[platformSurface(platform, x).y, platform.y + platform.h]]
  const points = polygonPoints(platform), crossings: number[] = []
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length]
    if ((a[0] > x) !== (b[0] > x)) crossings.push(a[1] + (x - a[0]) * (b[1] - a[1]) / (b[0] - a[0]))
  }
  crossings.sort((a, b) => a - b)
  return crossings.flatMap((y, i) => i % 2 === 0 && i + 1 < crossings.length ? [[y, crossings[i + 1]]] : [])
}

/** Internal seams are not walls: subtract actual solids on the outside of this face. */
export function exposedSide(platforms: readonly Platform[], platform: Platform, side: number, top: number, bottom: number): boolean {
  const x = side === 1 ? platform.x : platform.x + platform.w
  return exposedFace(platforms, platform, side, top, bottom, x)
}

/** Reachable walls can be inset within a concave outline's bounding rectangle. */
export function exposedWallFaces(platforms: readonly Platform[], platform: Platform, side: number, top: number, bottom: number): number[] {
  if (platform.y >= bottom || platform.y + platform.h <= top) return []
  const points = polygonPoints(platform)
  const faces = points.flatMap((a, i) => {
    const b = points[(i + 1) % points.length]
    return Math.abs(a[0] - b[0]) < .01 && (b[1] - a[1]) * side < 0
      && Math.min(a[1], b[1]) < bottom && Math.max(a[1], b[1]) > top ? [a[0]] : []
  })
  return [...new Set(faces)].filter(x => exposedFace(platforms, platform, side, top, bottom, x))
}

function exposedFace(platforms: readonly Platform[], platform: Platform, side: number, top: number, bottom: number, x: number): boolean {
  let spans: number[][]
  if (platform.polygon) {
    const points = polygonPoints(platform)
    spans = points.flatMap((a, i) => {
      const b = points[(i + 1) % points.length]
      return Math.abs(a[0] - x) < .01 && Math.abs(b[0] - x) < .01 && (b[1] - a[1]) * side < 0
        ? [[Math.max(top, Math.min(a[1], b[1])), Math.min(bottom, Math.max(a[1], b[1]))]] : []
    })
  } else spans = [[Math.max(top, platformSurface(platform, x).y), Math.min(bottom, platform.y + platform.h)]]
  spans = spans.filter(([a, b]) => b - a > .01)
  if (!spans.length) return false
  const outsideX = x - side * .01
  for (const other of platforms) {
    if (other === platform || outsideX < other.x || outsideX > other.x + other.w || other.y >= bottom || other.y + other.h <= top) continue
    for (const [y, end] of solidSpans(other, outsideX)) {
      spans = spans.flatMap(([a, b]) => end <= a || y >= b ? [[a, b]] : [[a, Math.min(b, y)], [Math.max(a, end), b]])
        .filter(([a, b]) => b - a > .01)
      if (!spans.length) return false
    }
  }
  return true
}

/** Follow connected terrain only: never snap across a gap or down from a ledge. */
export function followGround(platforms: readonly Platform[], oldX: number, x: number, y: number) {
  const before = groundAt(platforms, oldX, y, .15)
  if (!before) return null
  const after = groundAt(platforms, x, y, Math.abs(x - oldX) + .15)
  if (!after || !canGrip(after.angle)) return null
  const a = before.platform, b = after.platform
  if (a === b) return after
  // Overlapping ramps can meet a flat floor at their zero-height ends.
  const connected = [a.x, a.x + a.w, b.x, b.x + b.w].some(seam =>
    seam >= Math.min(oldX, x) - .01 && seam <= Math.max(oldX, x) + .01
    && seam >= a.x && seam <= a.x + a.w && seam >= b.x && seam <= b.x + b.w
    && Math.abs(platformSurface(a, seam).y - platformSurface(b, seam).y) < .15)
  return connected ? after : null
}
