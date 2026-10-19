import type { JumpLevel } from './level.ts'
import type { Platform } from './model.ts'
import { polygonPoints } from './geometry.ts'
import { terrainBoundary } from './lightingBoundary.ts'

interface WallView { x: number; y: number; w: number; h: number }
const noise = (x: number, y: number) => {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return n - Math.floor(n)
}

/** World-anchored precast panels. Decorative hardware belongs to authored art. */
export function drawWallPanels(ctx: CanvasRenderingContext2D, view: WallView) {
  if (view.w <= 0 || view.h <= 0) return
  const w = 360, h = 240
  ctx.save()
  // A cropped replay can use a larger scratch canvas. Translucent panels
  // must never accumulate beyond the part of the wall being repainted.
  ctx.beginPath(); ctx.rect(view.x, view.y, view.w, view.h); ctx.clip()
  for (let row = Math.floor(view.y / h); row <= Math.floor((view.y + view.h) / h); row++) {
    const stagger = (row % 2) * w / 2
    for (let col = Math.floor((view.x - stagger) / w); col <= Math.floor((view.x + view.w - stagger) / w); col++) {
      const x = col * w + stagger, y = row * h, seed = noise(col, row)
      ctx.fillStyle = `rgba(91,111,94,${.012 + seed * .022})`
      ctx.fillRect(x + 1, y + 1, w - 2, h - 2)
      ctx.strokeStyle = '#52635421'; ctx.lineWidth = 1.1
      ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x, y); ctx.lineTo(x + w, y); ctx.stroke()
      ctx.strokeStyle = '#ffffff91'; ctx.lineWidth = .8
      ctx.beginPath(); ctx.moveTo(x + 1.4, y + h); ctx.lineTo(x + 1.4, y + 1.4); ctx.lineTo(x + w, y + 1.4); ctx.stroke()
    }
  }
  ctx.restore()
}

interface Relief { key: string; clip: Path2D; light: Path2D; dark: Path2D }
const reliefs = new WeakMap<object, Relief>()
const strip = (path: Path2D, ax: number, ay: number, bx: number, by: number, dx: number, dy: number) => {
  path.moveTo(ax, ay); path.lineTo(bx, by); path.lineTo(bx + dx, by + dy); path.lineTo(ax + dx, ay + dy); path.closePath()
}
function relief(platforms: readonly Platform[], level: JumpLevel): Relief {
  // Editor geometry can be edited in place. Appearance caches never own or
  // change the platforms, and invalidate for local outline edits as well.
  const key = platforms.map(b => `${b.x},${b.y},${b.w},${b.h}:${b.polygon?.flat() ?? b.profile?.flat() ?? ''}`).join(';')
  const cached = reliefs.get(level)
  if (cached?.key === key) return cached
  const clip = new Path2D(), light = new Path2D(), dark = new Path2D()
  for (const shape of platforms) {
    const points = polygonPoints(shape)
    points.forEach(([x, y], i) => i ? clip.lineTo(x, y) : clip.moveTo(x, y)); clip.closePath()
  }
  // The union boundary omits internal seams and retains real gaps and slopes.
  for (const [a, b] of terrainBoundary(platforms)) {
    const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy)
    if (!length) continue
    const nx = dy / length, ny = -dx / length
    const lit = nx * -.55 + ny * -.83 > 0
    strip(lit ? light : dark, ...a, ...b, -nx * (lit ? 2 : 3), -ny * (lit ? 2 : 3))
  }
  const result = { key, clip, light, dark }; reliefs.set(level, result); return result
}

/** Fine relief stays inside the real collision silhouette. */
export function drawTerrainEdges(ctx: CanvasRenderingContext2D, platforms: readonly Platform[], level: JumpLevel) {
  const r = relief(platforms, level)
  ctx.save(); ctx.clip(r.clip)
  ctx.fillStyle = '#ffffff35'; ctx.fill(r.light)
  ctx.fillStyle = '#26382d25'; ctx.fill(r.dark)
  ctx.restore()
}
