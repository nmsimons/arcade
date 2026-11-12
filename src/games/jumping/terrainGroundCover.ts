import type { Platform } from './model.ts'
import type { JumpLevel } from './level.ts'
import { platformOutline, pointInside } from './geometry.ts'
import type { Vec } from './geometry.ts'
import { terrainDrawOrder } from './terrainOrder.ts'
import { ArtPath } from './webgl/artPath.ts'

/** Decoration only; these choices never change terrain contacts or grip. */
export const GROUND_COVERS = [
  { id: 'none', label: 'None' }, { id: 'grass', label: 'Grass' },
  { id: 'scrub', label: 'Scrub' }, { id: 'moss', label: 'Moss' },
] as const
export type GroundCover = typeof GROUND_COVERS[number]['id']
export const isGroundCover = (value: unknown): value is GroundCover => GROUND_COVERS.some(cover => cover.id === value)
interface CoverRoot { x: number; y: number; slope: number; type: Exclude<GroundCover, 'none'>; terrain: number; legacy?: boolean }
interface CoverPlan {
  outlines: readonly (readonly Vec[])[]; covers: (GroundCover | undefined)[]
  order: readonly number[]; legacy: string; roots: CoverRoot[]
}
const plans = new WeakMap<JumpLevel, CoverPlan>()
const noise = (x: number, y: number) => {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return n - Math.floor(n)
}
const contains = (p: Platform, x: number, y: number) => x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h && pointInside(p, x, y)

/** Only the visible supporting top owns a root, including coincident layers. */
function rootOwner(platforms: readonly Platform[], order: readonly number[], x: number, y: number) {
  if (platforms.some(p => contains(p, x, y - .5))) return -1
  for (let i = order.length - 1; i >= 0; i--) if (contains(platforms[order[i]], x, y + .5)) return order[i]
  return -1
}

/** Retain the decorative plan; geometry caches also detect edits made in place. */
export function groundCoverRoots(level: JumpLevel): readonly CoverRoot[] {
  const platforms = level.platforms, order = terrainDrawOrder(platforms), outlines = platforms.map(platformOutline)
  const legacy = level.environment?.kind === 'landscape' ? JSON.stringify(level.environment.groundCover ?? []) : ''
  const saved = plans.get(level)
  if (saved && saved.order === order && saved.legacy === legacy && saved.outlines.length === outlines.length
    && platforms.every((p, i) => outlines[i] === saved.outlines[i] && p.groundCover === saved.covers[i])) return saved.roots
  const roots: CoverRoot[] = []
  for (const index of order) {
    const type = platforms[index].groundCover
    if (!type || type === 'none') continue
    const points = outlines[index]
    for (let edge = 0; edge < points.length; edge++) {
      const a = points[edge], b = points[(edge + 1) % points.length], dx = b[0] - a[0], dy = b[1] - a[1]
      // Positive winding puts the top on left-to-right edges. Avoid cliffs and
      // undersides; curved terrain uses the same sampled outline as collision.
      if (dx <= 0 || Math.abs(dy) > dx) continue
      const slope = dy / dx, small = platforms[index].w < 18
      const first = small ? platforms[index].x + platforms[index].w / 2 : Math.ceil((a[0] - 8) / 18) * 18 + 8
      for (let gridX = first; gridX >= a[0] && gridX < b[0] - .01; gridX += small ? platforms[index].w : 18) {
        const x = Math.max(a[0], Math.min(b[0] - .01, gridX + (small ? 0 : (noise(gridX, a[1]) - .5) * 9)))
        const y = a[1] + (x - a[0]) * slope
        if (rootOwner(platforms, order, x, y) === index) roots.push({ x, y, slope, type, terrain: index })
      }
    }
  }
  // Old files keep their sparse spans. An explicit terrain choice, including
  // None, supersedes them without rewriting authored assets on load.
  if (level.environment?.kind === 'landscape') for (const cover of level.environment.groundCover ?? []) {
    for (let x = cover.x; x < cover.x + cover.w; x += 19) {
      const index = rootOwner(platforms, order, x, cover.y)
      if (index >= 0 && platforms[index].groundCover === undefined)
        roots.push({ x, y: cover.y, slope: 0, type: 'scrub', terrain: index, legacy: true })
    }
  }
  plans.set(level, { outlines, covers: platforms.map(p => p.groundCover), order, legacy, roots })
  return roots
}

export function terrainGroundCover(level: JumpLevel, index: number): GroundCover {
  return level.platforms[index].groundCover ?? (groundCoverRoots(level).some(root => root.terrain === index && root.legacy) ? 'scrub' : 'none')
}

type CoverType = Exclude<GroundCover, 'none'>
// These are artwork colors. The ordinary ambient passes darken the same ink
// at night, including the whole-piece terrain shade in regional lighting.
const colors: Record<CoverType, readonly string[]> = {
  grass: ['#6c8246', '#809651', '#95a963'],
  scrub: ['#7b8053', '#929264', '#a3a16f'],
  moss: ['#57794f', '#698c5e', '#7b9b6e'],
}
/** World-space bounds, for culling artwork outside the view. */
interface Box { x0: number; y0: number; x1: number; y1: number }
const overlaps = (a: Box, b: Box) => a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1
// Artwork is built in vertical slices so a frame draws only the slices in view.
// Long courses otherwise stroke and clip every tuft and band in the level.
const SLICE = 512
// Tufts and bands extend at most this far from their roots, even rotated on a slope.
const REACH = 24
interface CoverArtwork {
  tufts: { type: CoverType; slices: { bounds: Box; paths: Path2D[] }[] }[]
  // One clip per visible terrain: its slices in view share the outline and the terrain that can hide them.
  surfaces: { type: CoverType; clip: Path2D; occluders: { path: Path2D; bounds: Box }[]; slices: { bounds: Box; paths: Path2D[] }[] }[]
}
const artwork = new WeakMap<readonly CoverRoot[], CoverArtwork>()
const outlinePath = (points: readonly Vec[]) => {
  const path = new ArtPath()
  points.forEach(([x, y], i) => i ? path.lineTo(x, y) : path.moveTo(x, y)); path.closePath()
  return path
}
const rootBounds = (roots: readonly CoverRoot[]): Box => ({
  x0: Math.min(...roots.map(root => root.x)) - REACH, x1: Math.max(...roots.map(root => root.x)) + REACH,
  y0: Math.min(...roots.map(root => root.y)) - REACH, y1: Math.max(...roots.map(root => root.y)) + REACH,
})
function slices(roots: readonly CoverRoot[]) {
  const groups = new Map<number, CoverRoot[]>()
  for (const root of roots) {
    const key = Math.floor(root.x / SLICE)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(root)
  }
  return [...groups.values()]
}
function coverArtwork(level: JumpLevel): CoverArtwork {
  const roots = groundCoverRoots(level), saved = artwork.get(roots)
  if (saved) return saved
  const tufts: CoverArtwork['tufts'] = [], surfaces: CoverArtwork['surfaces'] = [], order = terrainDrawOrder(level.platforms)
  const tuftSlices = new Map<string, { bounds: Box; paths: Path2D[] }>()
  for (const terrain of order) {
    const owned = roots.filter(root => root.terrain === terrain)
    if (!owned.length) continue
    const type = owned[0].type, platform = level.platforms[terrain]
    const clip = outlinePath(platformOutline(platform)), band = rootBounds(owned)
    // Only terrain drawn above the planted band can hide part of it.
    const occluders = order.slice(order.indexOf(terrain) + 1).flatMap(index => {
      const other = level.platforms[index], bounds = { x0: other.x, y0: other.y, x1: other.x + other.w, y1: other.y + other.h }
      if (!overlaps(band, bounds)) return []
      // Successive outside clips subtract the union, including nested overlaps.
      const outside = new ArtPath(); outside.rect(platform.x - 20, platform.y - 20, platform.w + 40, platform.h + 40)
      outside.addPath(outlinePath(platformOutline(other)))
      return [{ path: outside, bounds }]
    })
    const surface: CoverArtwork['surfaces'][number] = { type, clip, occluders, slices: [] }
    surfaces.push(surface)
    for (const slice of slices(owned)) {
      const paths = colors[type].map(() => new ArtPath()), bounds = rootBounds(slice)
      surface.slices.push({ bounds, paths })
      for (const root of slice) {
      const seed = noise(root.x, root.y), detail = noise(root.y + 19, root.x)
      const tone = Math.floor(seed * 3), height = 4 + detail * 9, lean = (seed - .5) * 5
      const matrix = new DOMMatrix().translate(root.x, root.y).rotate(Math.atan(root.slope) * 180 / Math.PI)
      const tuft = new ArtPath()
      if (type === 'grass') {
        tuft.moveTo(-4 - seed * 2, -height * .65); tuft.quadraticCurveTo(-1, -height * .4, 0, 0)
        tuft.quadraticCurveTo(lean, -height * .5, 2 + lean, -height)
        tuft.moveTo(0, 0); tuft.quadraticCurveTo(4, -height * .3, 5 + detail * 3, -height * .55)
        if (detail > .65) { tuft.moveTo(0, 0); tuft.lineTo(-2 + lean, -height * 1.15) }
      } else if (type === 'moss') {
        tuft.moveTo(-8, 0); tuft.quadraticCurveTo(-5, -2 - seed * 3, -1, -1)
        tuft.quadraticCurveTo(3, -3 - detail * 2, 8, 0)
      } else {
        tuft.moveTo(-3, -height * .4); tuft.lineTo(0, 0); tuft.lineTo(3 + lean, -height * .55)
        if (detail > .58) {
          tuft.moveTo(-6 - seed * 3, -height * .7); tuft.quadraticCurveTo(-2, -4, 0, 0)
          tuft.quadraticCurveTo(lean, -height, 3 + lean, -height * 1.4)
          tuft.moveTo(0, 0); tuft.quadraticCurveTo(5, -4, 9, -height * .5)
        }
      }
        const key = `${type}:${Math.floor(root.x / SLICE)}`
        if (!tuftSlices.has(key)) tuftSlices.set(key, { bounds: { ...bounds }, paths: colors[type].map(() => new ArtPath()) })
        const tuftSlice = tuftSlices.get(key)!
        tuftSlice.bounds = { x0: Math.min(tuftSlice.bounds.x0, bounds.x0), y0: Math.min(tuftSlice.bounds.y0, bounds.y0),
          x1: Math.max(tuftSlice.bounds.x1, bounds.x1), y1: Math.max(tuftSlice.bounds.y1, bounds.y1) }
        tuftSlice.paths[tone].addPath(tuft, matrix)
        const width = type === 'scrub' ? 7 + seed * 3 : 10 + seed * 3
        const depth = type === 'moss' ? 3 + detail * 4 : type === 'grass' ? 2 + detail * 3 : 1.5 + detail * 2
        const band = new ArtPath()
        band.moveTo(-width, -1); band.lineTo(width, -1); band.lineTo(width, depth * .45)
        band.quadraticCurveTo(width * .4, depth * .6, 1, depth)
        band.quadraticCurveTo(-width * .4, depth * .55, -width, depth * .35); band.closePath()
        paths[tone].addPath(band, matrix)
      }
    }
  }
  for (const type of ['grass', 'scrub', 'moss'] as const) {
    tufts.push({ type, slices: [...tuftSlices].filter(([key]) => key.startsWith(`${type}:`)).map(([, slice]) => slice) })
  }
  const result = { tufts, surfaces }; artwork.set(roots, result); return result
}

/** The world rectangle the context draws into, or null when it cannot tell (no culling). */
function visibleBox(ctx: CanvasRenderingContext2D): Box | null {
  const transform = ctx.getTransform?.(), canvas = ctx.canvas
  if (!transform || !canvas?.width || !canvas.height) return null
  const inverse = transform.inverse()
  const corners = [[0, 0], [canvas.width, 0], [0, canvas.height], [canvas.width, canvas.height]].map(([x, y]) => inverse.transformPoint({ x, y }))
  if (corners.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y))) return null
  return { x0: Math.min(...corners.map(p => p.x)), y0: Math.min(...corners.map(p => p.y)),
    x1: Math.max(...corners.map(p => p.x)), y1: Math.max(...corners.map(p => p.y)) }
}

/** Blades stay behind rock. Cached world-space paths never shimmer with time
 * or camera movement and reuse the existing terrain artwork caches. */
export function drawTerrainGroundCover(ctx: CanvasRenderingContext2D, level: JumpLevel) {
  if (!groundCoverRoots(level).length) return
  const view = visibleBox(ctx)
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  for (const { type, slices } of coverArtwork(level).tufts) {
    const visible = view ? slices.filter(slice => overlaps(slice.bounds, view)) : slices
    if (!visible.length) continue
    ctx.lineWidth = type === 'moss' ? 2.5 : 1.4
    colors[type].forEach((color, tone) => { ctx.strokeStyle = color; for (const slice of visible) ctx.stroke(slice.paths[tone]) })
  }
  ctx.restore()
}

/** Color sits inside the supporting rock, never on a cliff or underside.
 * Foreground terrain and enclosing solids still hide the planted surface. */
export function drawTerrainGroundCoverSurface(ctx: CanvasRenderingContext2D, level: JumpLevel) {
  if (!groundCoverRoots(level).length) return
  const view = visibleBox(ctx)
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, level.width, level.floor ?? level.height ?? 1020); ctx.clip()
  for (const { type, clip, occluders, slices } of coverArtwork(level).surfaces) {
    const visible = view ? slices.filter(slice => overlaps(slice.bounds, view)) : slices
    if (!visible.length) continue
    const band = { x0: Math.min(...visible.map(s => s.bounds.x0)), y0: Math.min(...visible.map(s => s.bounds.y0)),
      x1: Math.max(...visible.map(s => s.bounds.x1)), y1: Math.max(...visible.map(s => s.bounds.y1)) }
    // Clip to the band first: an outline clip over the whole view costs a full-canvas mask.
    ctx.save(); ctx.beginPath(); ctx.rect(band.x0, band.y0, band.x1 - band.x0, band.y1 - band.y0); ctx.clip(); ctx.clip(clip)
    for (const outside of occluders) if (overlaps(outside.bounds, band)) ctx.clip(outside.path, 'evenodd')
    colors[type].forEach((color, tone) => { ctx.fillStyle = color; for (const slice of visible) ctx.fill(slice.paths[tone]) })
    ctx.restore()
  }
  ctx.restore()
}
