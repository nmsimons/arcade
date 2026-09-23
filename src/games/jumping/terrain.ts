import type { Platform } from './model.ts'

export interface GroundSurface { platform: Platform; y: number; angle: number }

/** Profile points are local x/y offsets from the platform's upper-left corner. */
export function platformSurface(platform: Platform, x: number): GroundSurface {
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
export function groundAt(platforms: readonly Platform[], x: number, y: number, reach = 26): GroundSurface | null {
  let found: GroundSurface | null = null
  for (const platform of platforms) {
    if (x < platform.x || x > platform.x + platform.w) continue
    const surface = platformSurface(platform, x)
    if (Math.abs(surface.y - y) <= reach && (!found || surface.y < found.y)) found = surface
  }
  return found
}

/** Internal seams are not walls: subtract solids on the outside of this face. */
export function exposedSide(platforms: readonly Platform[], platform: Platform, side: number, top: number, bottom: number): boolean {
  const x = side === 1 ? platform.x : platform.x + platform.w
  let spans = [[Math.max(top, platformSurface(platform, x).y), Math.min(bottom, platform.y + platform.h)]]
  for (const other of platforms) {
    if (other === platform || (side === 1 ? other.x >= x - .01 || other.x + other.w < x - .01 : other.x > x + .01 || other.x + other.w <= x + .01)) continue
    const y = platformSurface(other, x).y, end = other.y + other.h
    spans = spans.flatMap(([a, b]) => end <= a || y >= b ? [[a, b]] : [[a, Math.min(b, y)], [Math.max(a, end), b]])
      .filter(([a, b]) => b - a > .01)
  }
  return spans.some(([a, b]) => b - a > .01)
}

/** Follow connected terrain only: never snap across a gap or down from a ledge. */
export function followGround(platforms: readonly Platform[], oldX: number, x: number, y: number) {
  const before = groundAt(platforms, oldX, y, .15)
  if (!before) return null
  const after = groundAt(platforms, x, y, Math.abs(x - oldX) * .85 + .15)
  if (!after || Math.abs(Math.tan(after.angle)) > .85) return null
  const a = before.platform, b = after.platform
  if (a === b) return after
  // Overlapping ramps can meet a flat floor at their zero-height ends.
  const connected = [a.x, a.x + a.w, b.x, b.x + b.w].some(seam =>
    seam >= Math.min(oldX, x) - .01 && seam <= Math.max(oldX, x) + .01
    && seam >= a.x && seam <= a.x + a.w && seam >= b.x && seam <= b.x + b.w
    && Math.abs(platformSurface(a, seam).y - platformSurface(b, seam).y) < .15)
  return connected ? after : null
}
