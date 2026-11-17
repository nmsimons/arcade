import type { JumpLevel } from './level.ts'
import type { Platform } from './model.ts'
import { polygonPoints, pointInside } from './geometry.ts'
import { bezierKey } from './terrainCurves.ts'
import { terrainBoundary } from './lightingBoundary.ts'
import { insideConvex } from './surfaceDepth.ts'
import { ArtPath } from './webgl/artPath.ts'

/**
 * Frictionless terrain (`frictionless: true`) reads as a polished glaze: a cool translucent coat just inside every
 * exposed face, a bright line along the face itself, and paired glints along its tops. The look is the warning,
 * so it follows sides and undersides too: a wall of it can still be braced against, but nothing grips it.
 */
const COAT_DEPTH = 6
const GLINT_SPACING = 46

type Point = readonly [number, number]
const noise = (x: number, y: number) => { const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n) }
const trace = (path: ArtPath, points: readonly Point[]) => { points.forEach(([x, y], i) => i ? path.lineTo(x, y) : path.moveTo(x, y)); path.closePath() }

interface SlickPlan { key: string; coat: ArtPath; edge: ArtPath; glints: ArtPath }
const plans = new WeakMap<JumpLevel, SlickPlan>()

function slickPlan(platforms: readonly Platform[], level: JumpLevel): SlickPlan | null {
  if (!level.platforms.some(p => p.frictionless)) return null
  const key = platforms.map(b => `${b.x},${b.y},${b.w},${b.h},${b.frictionless ? 1 : 0}:${b.polygon?.flat() ?? b.profile?.flat() ?? ''}:${bezierKey(b)}`).join(';')
  const saved = plans.get(level)
  if (saved?.key === key) return saved
  const plan: SlickPlan = { key, coat: new ArtPath(), edge: new ArtPath(), glints: new ArtPath() }
  const slick = new Set(level.platforms.filter(p => p.frictionless))
  const shapes = new Map(platforms.filter(p => slick.has(p)).map(p => [p, polygonPoints(p) as Point[]]))
  for (const [a, b] of terrainBoundary(platforms)) {
    const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy)
    if (!length) continue
    const nx = dy / length, ny = -dx / length
    const mid: Point = [(a[0] + b[0]) / 2 - nx, (a[1] + b[1]) / 2 - ny]
    const owner = [...shapes.keys()].reverse().find(p => pointInside(p, mid[0], mid[1]))
    if (!owner) continue
    const inner = (p: Point, depth: number): Point => [p[0] - nx * depth, p[1] - ny * depth]
    const coat = insideConvex(shapes.get(owner)!, [a, b, inner(b, COAT_DEPTH), inner(a, COAT_DEPTH)])
    if (coat.length >= 3) trace(plan.coat, coat)
    const line = insideConvex(shapes.get(owner)!, [a, b, inner(b, 1.8), inner(a, 1.8)])
    if (line.length >= 3) trace(plan.edge, line)
    // Glints sit on faces that look up, where light catches a polished top.
    if (ny > -.6) continue
    const tx = dx / length, ty = dy / length
    for (let along = (noise(a[0], a[1]) * GLINT_SPACING) % GLINT_SPACING + 8; along < length - 8; along += GLINT_SPACING * (.7 + noise(along, a[0]) * .6)) {
      for (const [offset, size] of [[0, 7], [4.5, 4]] as const) {
        const s = along + offset, base: Point = [a[0] + tx * s, a[1] + ty * s]
        // A short stroke slanting back into the surface, like a reflected window bar.
        const tip: Point = [base[0] + tx * size * .6 - nx * size * .9, base[1] + ty * size * .6 - ny * size * .9]
        const glint = insideConvex(shapes.get(owner)!, [base, [base[0] + tx * 1.4, base[1] + ty * 1.4], [tip[0] + tx * 1.4, tip[1] + ty * 1.4], tip])
        if (glint.length >= 3) trace(plan.glints, glint)
      }
    }
  }
  plans.set(level, plan)
  return plan
}

/** The glaze over frictionless terrain, after its fill and trim and under its edge relief. */
export function drawSlickTerrain(ctx: CanvasRenderingContext2D, platforms: readonly Platform[], level: JumpLevel) {
  const plan = slickPlan(platforms, level)
  if (!plan) return
  ctx.save()
  ctx.fillStyle = 'rgba(120, 196, 232, .8)'; ctx.fill(plan.coat)
  ctx.fillStyle = '#e9f9ff'; ctx.fill(plan.edge)
  ctx.fillStyle = 'rgba(255, 255, 255, .95)'; ctx.fill(plan.glints)
  ctx.restore()
}
