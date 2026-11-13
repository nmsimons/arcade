import type { JumpLevel } from './level.ts'
import type { Platform } from './model.ts'
import { polygonPoints } from './geometry.ts'

/**
 * A look under review (docs/jumping-look-plan.md, D5), not shipped: wall brackets
 * under thin, level, free-standing slabs, so they read as fixed to the building.
 * Drawn only in development builds with localStorage `jumping:look-brackets` set
 * to '1', for before-and-after comparison sheets. Artwork on the back wall only;
 * collision and lighting geometry are unchanged.
 */
export const slabBracketsPreviewed = (() => {
  try { return !!import.meta.env?.DEV && typeof window !== 'undefined' && window.localStorage.getItem('jumping:look-brackets') === '1' } catch { return false }
})()

// Authored slabs are commonly 25 units thick; the plan's 24 caught none of them.
const MAX_THICKNESS = 30, MIN_LENGTH = 60, MAX_TILT = 6
interface Bracket { x: number; y: number }
const cache = new WeakMap<readonly Platform[], Bracket[]>()

/** Two brackets per slab, in from each end, at the slab's underside. Computed once per platform list. */
export function slabBrackets(platforms: readonly Platform[]): Bracket[] {
  const cached = cache.get(platforms)
  if (cached) return cached
  const boxes = platforms.map(b => ({ x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.h }))
  const out: Bracket[] = []
  platforms.forEach((b, i) => {
    const points = polygonPoints(b), ys = points.map(p => p[1])
    if (b.h > MAX_THICKNESS || b.w < MIN_LENGTH || Math.max(...ys) - Math.min(...ys) > MAX_THICKNESS + MAX_TILT) return
    const box = boxes[i]
    // A slab joined to other terrain is already held up by it.
    if (boxes.some((other, j) => j !== i && other.x0 <= box.x1 + 1 && other.x1 >= box.x0 - 1 && other.y0 <= box.y1 + 1 && other.y1 >= box.y0 - 1)) return
    const inset = Math.max(10, b.w * .12)
    for (const x of [b.x + inset, b.x + b.w - inset]) {
      // The underside at x: the lowest edge point crossing that column.
      let y = -Infinity
      for (let k = 0; k < points.length; k++) {
        const a = points[k], c = points[(k + 1) % points.length]
        if ((a[0] - x) * (c[0] - x) > 0 || a[0] === c[0]) continue
        y = Math.max(y, a[1] + (x - a[0]) * (c[1] - a[1]) / (c[0] - a[0]))
      }
      if (Number.isFinite(y)) out.push({ x, y })
    }
  })
  cache.set(platforms, out)
  return out
}

/** A wall plate below the slab with a web up into it and two bolts. */
export function drawSlabBrackets(ctx: CanvasRenderingContext2D, level: JumpLevel) {
  const brackets = slabBrackets(level.platforms)
  if (!brackets.length) return
  ctx.save()
  ctx.fillStyle = '#a9b1ab'; ctx.beginPath()
  for (const { x, y } of brackets) {
    ctx.moveTo(x - 7, y); ctx.lineTo(x + 7, y); ctx.lineTo(x + 3, y + 16); ctx.lineTo(x - 3, y + 16); ctx.closePath()
    ctx.rect(x - 6, y + 14, 12, 6)
  }
  ctx.fill()
  ctx.fillStyle = '#6f7a73'
  for (const { x, y } of brackets) { ctx.fillRect(x - 4, y + 16, 1.6, 1.6); ctx.fillRect(x + 2.4, y + 16, 1.6, 1.6) }
  ctx.restore()
}
