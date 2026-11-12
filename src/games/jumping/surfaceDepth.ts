import type { JumpLevel } from './level.ts'
import type { Platform } from './model.ts'
import { polygonPoints } from './geometry.ts'
import { bezierKey } from './terrainCurves.ts'
import { terrainBoundary } from './lightingBoundary.ts'
import { ArtPath } from './webgl/artPath.ts'

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
  // Each panel's tint differs, so tints are separate fills; the edge lines share
  // two strokes, one per colour, instead of two per panel. Fills never cover a
  // line, so only the few pixels where neighbouring panels' lines meet can differ.
  const shade = new ArtPath(), sheen = new ArtPath()
  for (let row = Math.floor(view.y / h); row <= Math.floor((view.y + view.h) / h); row++) {
    const stagger = (row % 2) * w / 2
    for (let col = Math.floor((view.x - stagger) / w); col <= Math.floor((view.x + view.w - stagger) / w); col++) {
      const x = col * w + stagger, y = row * h, seed = noise(col, row)
      ctx.fillStyle = `rgba(91,111,94,${.012 + seed * .022})`
      ctx.fillRect(x + 1, y + 1, w - 2, h - 2)
      shade.moveTo(x, y + h); shade.lineTo(x, y); shade.lineTo(x + w, y)
      sheen.moveTo(x + 1.4, y + h); sheen.lineTo(x + 1.4, y + 1.4); sheen.lineTo(x + w, y + 1.4)
    }
  }
  ctx.strokeStyle = '#52635421'; ctx.lineWidth = 1.1; ctx.stroke(shade)
  ctx.strokeStyle = '#ffffff91'; ctx.lineWidth = .8; ctx.stroke(sheen)
  ctx.restore()
}

type Point = readonly [number, number]
interface Box { x0: number; y0: number; x1: number; y1: number }
const boxOf = (points: readonly Point[]): Box => ({ x0: Math.min(...points.map(p => p[0])), y0: Math.min(...points.map(p => p[1])),
  x1: Math.max(...points.map(p => p[0])), y1: Math.max(...points.map(p => p[1])) })
const overlaps = (a: Box, b: Box) => a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1

/** The part of `subject` inside the convex polygon `convex` (Sutherland–Hodgman). */
export function insideConvex(subject: readonly Point[], convex: readonly Point[]): Point[] {
  let area = 0
  for (let i = 0; i < convex.length; i++) { const a = convex[i], b = convex[(i + 1) % convex.length]; area += a[0] * b[1] - b[0] * a[1] }
  const turn = Math.sign(area)
  if (!turn) return []
  let output: Point[] = [...subject]
  for (let i = 0; i < convex.length && output.length; i++) {
    const a = convex[i], b = convex[(i + 1) % convex.length]
    const side = (p: Point) => turn * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]))
    const input = output; output = []
    for (let j = 0; j < input.length; j++) {
      const p = input[j], q = input[(j + 1) % input.length], sp = side(p), sq = side(q)
      if (sp >= 0) output.push(p)
      if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); output.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]) }
    }
  }
  return output
}

interface Relief { key: string; light: Path2D; dark: Path2D }
const reliefs = new WeakMap<object, Relief>()
function relief(platforms: readonly Platform[], level: JumpLevel): Relief {
  // Editor geometry can be edited in place. Appearance caches never own or
  // change the platforms, and invalidate for local outline edits as well.
  const key = platforms.map(b => `${b.x},${b.y},${b.w},${b.h}:${b.polygon?.flat() ?? b.profile?.flat() ?? ''}:${bezierKey(b)}`).join(';')
  const cached = reliefs.get(level)
  if (cached?.key === key) return cached
  const light = new ArtPath(), dark = new ArtPath()
  const shapes = platforms.map(shape => polygonPoints(shape) as Point[]), boxes = shapes.map(boxOf)
  // The union boundary omits internal seams and retains real gaps and slopes.
  for (const [a, b] of terrainBoundary(platforms)) {
    const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy)
    if (!length) continue
    const nx = dy / length, ny = -dx / length
    const lit = nx * -.55 + ny * -.83 > 0, depth = lit ? 2 : 3
    const strip: Point[] = [a, b, [b[0] - nx * depth, b[1] - ny * depth], [a[0] - nx * depth, a[1] - ny * depth]], bounds = boxOf(strip)
    // A strip running past an inner corner would show outside the rock. Trim it
    // to the terrain here, once, rather than clip to the whole silhouette every
    // frame: that clip cost a screen-sized mask. Terrain shapes all wind the same
    // way, so the trimmed pieces cover exactly what the clip let through.
    const path = lit ? light : dark
    shapes.forEach((shape, i) => {
      if (!overlaps(bounds, boxes[i])) return
      const piece = insideConvex(shape, strip)
      if (piece.length < 3) return
      piece.forEach(([x, y], k) => k ? path.lineTo(x, y) : path.moveTo(x, y)); path.closePath()
    })
  }
  const result = { key, light, dark }; reliefs.set(level, result); return result
}

/** Fine relief stays inside the real collision silhouette. */
export function drawTerrainEdges(ctx: CanvasRenderingContext2D, platforms: readonly Platform[], level: JumpLevel) {
  const r = relief(platforms, level)
  ctx.save()
  ctx.fillStyle = '#ffffff35'; ctx.fill(r.light)
  ctx.fillStyle = '#26382d25'; ctx.fill(r.dark)
  ctx.restore()
}
