import type { JumpLevel } from './level.ts'
import type { Platform } from './model.ts'
import type { NamedObject } from './objectNames.ts'
import { polygonPoints, pointInside } from './geometry.ts'
import { bezierKey } from './terrainCurves.ts'
import { terrainBoundary } from './lightingBoundary.ts'
import { insideConvex } from './surfaceDepth.ts'
import { ArtPath } from './webgl/artPath.ts'

/**
 * Hazard striping, painted where a place warns of something: the worn yellow and black band along a dock edge or
 * a drop (a terrain piece's `trim`), or a band painted on the back wall (`stripes`). Both are flat paint in the
 * game's 2D look: diagonal bands anchored to the world, so neighbouring pieces line up, with paint worn off here
 * and there. Artwork only: collision, grip, cover and lighting are unchanged.
 */
export const HAZARD_YELLOW = '#d6a93a'
export const HAZARD_BLACK = '#2f312e'
/** One yellow and one black band, measured along the wall. */
const PERIOD = 16
/** A terrain band starts this far below the top surface, under the edge's lit lip, and runs this deep. */
const TRIM_FROM = 2.5, TRIM_DEPTH = 8

export const TERRAIN_TRIMS = [{ id: 'none', label: 'None' }, { id: 'hazard', label: 'Hazard stripes' }] as const
export type TerrainTrim = typeof TERRAIN_TRIMS[number]['id']
export const isTerrainTrim = (value: unknown): value is TerrainTrim => TERRAIN_TRIMS.some(trim => trim.id === value)

/** A band of stripes painted on the back wall. `lean` is the way the stripes slant; they lean right by default. */
export interface WallStripes extends NamedObject { x: number; y: number; w: number; h: number; lean?: 'left' }
export const MAX_WALL_STRIPES = 40
export const WALL_STRIPES_MIN = { w: 16, h: 6 }

type Point = readonly [number, number]
const noise = (x: number, y: number) => { const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n) }
const boxOf = (points: readonly Point[]) => ({ x0: Math.min(...points.map(p => p[0])), y0: Math.min(...points.map(p => p[1])),
  x1: Math.max(...points.map(p => p[0])), y1: Math.max(...points.map(p => p[1])) })
const trace = (path: ArtPath, points: readonly Point[]) => { points.forEach(([x, y], i) => i ? path.lineTo(x, y) : path.moveTo(x, y)); path.closePath() }

interface Paint { yellow: ArtPath; black: ArtPath; worn: ArtPath }
/**
 * Stripes over `area` (any simple polygon), slanting by `lean`: the yellow bands, the black ground between them,
 * and the worn patches where the paint has gone. Anchored to the world, so pieces side by side continue each other.
 */
function stripe(area: readonly Point[], lean: 1 | -1, paint: Paint) {
  if (area.length < 3) return
  trace(paint.black, area)
  const box = boxOf(area), slope = lean, height = box.y1 - box.y0 + 2
  // A stripe is the strip between the lines x - slope·y = k and k + PERIOD / 2.
  const lowest = Math.min(box.x0 - slope * box.y0, box.x0 - slope * box.y1), highest = Math.max(box.x1 - slope * box.y0, box.x1 - slope * box.y1)
  for (let k = Math.floor(lowest / PERIOD) * PERIOD; k <= highest; k += PERIOD) {
    const top = box.y0 - 1, bottom = top + height
    const band: Point[] = [[k + slope * top, top], [k + PERIOD / 2 + slope * top, top], [k + PERIOD / 2 + slope * bottom, bottom], [k + slope * bottom, bottom]]
    const piece = insideConvex(area, band)
    if (piece.length < 3) continue
    trace(paint.yellow, piece)
  }
  // Wear: a few chips where the paint has gone, most along the top where feet and loads scuff it.
  const span = box.x1 - box.x0
  for (let i = 0, count = Math.max(1, Math.round(span / 34)); i < count; i++) {
    const seed = noise(box.x0 + i * 13.7, box.y0 + i * 3.1)
    if (seed < .3) continue
    const x = box.x0 + (i + noise(i * 7.3, box.x0)) / count * span, y = box.y0 + (noise(box.x0, i * 5.9) ** 2) * (box.y1 - box.y0)
    const w = 1.5 + seed * 4.5, h = .9 + noise(x, y) * 2.2, tilt = (noise(y, x) - .5) * .6
    const chip: Point[] = [[x, y], [x + w, y + tilt * w], [x + w * .8, y + h], [x + w * .1, y + h * .8]]
    const piece = insideConvex(area, chip)
    if (piece.length >= 3) trace(paint.worn, piece)
  }
}

interface TrimPlan { key: string; paint: Paint }
const plans = new WeakMap<JumpLevel, TrimPlan>()

/** The striped band under each exposed top of a piece with `trim: 'hazard'`, cut to that piece's own outline. */
function trimPlan(platforms: readonly Platform[], level: JumpLevel): TrimPlan | null {
  if (!level.platforms.some(p => p.trim === 'hazard')) return null
  const key = platforms.map(b => `${b.x},${b.y},${b.w},${b.h},${b.trim ?? ''},${b.material ?? ''}:${b.polygon?.flat() ?? b.profile?.flat() ?? ''}:${bezierKey(b)}`).join(';')
  const saved = plans.get(level)
  if (saved?.key === key) return saved
  const paint: Paint = { yellow: new ArtPath(), black: new ArtPath(), worn: new ArtPath() }
  const trimmed = new Set(level.platforms.filter(p => p.trim === 'hazard'))
  const shapes = new Map(platforms.filter(p => trimmed.has(p)).map(p => [p, polygonPoints(p) as Point[]]))
  for (const [a, b] of terrainBoundary(platforms)) {
    const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy)
    if (!length) continue
    // The boundary's outward normal; a top faces up, and a slope counts while it is walkable.
    const nx = dy / length, ny = -dx / length
    if (ny > -.6) continue
    const mid: Point = [(a[0] + b[0]) / 2 - nx, (a[1] + b[1]) / 2 - ny]
    const owner = [...shapes.keys()].reverse().find(p => pointInside(p, mid[0], mid[1]))
    if (!owner) continue
    const inner = (p: Point, depth: number): Point => [p[0] - nx * depth, p[1] - ny * depth]
    const strip: Point[] = [inner(a, TRIM_FROM), inner(b, TRIM_FROM), inner(b, TRIM_FROM + TRIM_DEPTH), inner(a, TRIM_FROM + TRIM_DEPTH)]
    const band = insideConvex(shapes.get(owner)!, strip)
    if (band.length < 3) continue
    stripe(band, 1, paint)
  }
  const plan = { key, paint }
  plans.set(level, plan)
  return plan
}

/** Paint worn through to bare concrete. */
const WORN_ON_TERRAIN = '#8e9190'
/** Hazard trim on terrain, over its fill and under its edge relief. */
export function drawTerrainTrim(ctx: CanvasRenderingContext2D, platforms: readonly Platform[], level: JumpLevel) {
  const plan = trimPlan(platforms, level)
  if (!plan) return
  ctx.save()
  ctx.fillStyle = HAZARD_BLACK; ctx.fill(plan.paint.black)
  ctx.fillStyle = HAZARD_YELLOW; ctx.fill(plan.paint.yellow)
  ctx.fillStyle = WORN_ON_TERRAIN; ctx.fill(plan.paint.worn)
  ctx.restore()
}

const wallPaint = new WeakMap<WallStripes, { key: string; paint: Paint }>()
/** Stripes painted on the back wall: a little thinner than terrain trim's paint, so the wall shows in the wear. */
export function drawWallStripes(ctx: CanvasRenderingContext2D, stripes: readonly WallStripes[]) {
  if (!stripes.length) return
  ctx.save()
  for (const band of stripes) {
    const key = `${band.x},${band.y},${band.w},${band.h},${band.lean ?? ''}`
    let saved = wallPaint.get(band)
    if (saved?.key !== key) {
      const paint: Paint = { yellow: new ArtPath(), black: new ArtPath(), worn: new ArtPath() }
      stripe([[band.x, band.y], [band.x + band.w, band.y], [band.x + band.w, band.y + band.h], [band.x, band.y + band.h]], band.lean === 'left' ? -1 : 1, paint)
      saved = { key, paint }; wallPaint.set(band, saved)
    }
    ctx.globalAlpha = .88
    ctx.fillStyle = HAZARD_BLACK; ctx.fill(saved.paint.black)
    ctx.fillStyle = HAZARD_YELLOW; ctx.fill(saved.paint.yellow)
    // Worn through to the wall's own pale paint.
    ctx.globalAlpha = .7; ctx.fillStyle = '#e4e4de'; ctx.fill(saved.paint.worn)
  }
  ctx.restore()
}

export const wallStripesBounds = (band: WallStripes) => ({ x: band.x, y: band.y, w: band.w, h: band.h })
