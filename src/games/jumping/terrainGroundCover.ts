import type { Platform } from './model.ts'
import type { JumpLevel } from './level.ts'
import { platformOutline, pointInside } from './geometry.ts'
import type { Vec } from './geometry.ts'
import { terrainDrawOrder } from './terrainOrder.ts'

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
      for (let x = first; x >= a[0] && x < b[0] - .01; x += small ? platforms[index].w : 18) {
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

/** Draw before solid terrain, so blades cannot paint through neighboring rock. */
export function drawTerrainGroundCover(ctx: CanvasRenderingContext2D, level: JumpLevel) {
  const roots = groundCoverRoots(level)
  if (!roots.length) return
  const t = ctx.getTransform(), left = -t.e / t.a - 20, right = (ctx.canvas.width - t.e) / t.a + 20
  const top = -t.f / t.d - 20, bottom = (ctx.canvas.height - t.f) / t.d + 20
  ctx.save(); ctx.lineCap = 'round'
  for (const type of ['grass', 'scrub', 'moss'] as const) {
    ctx.strokeStyle = type === 'grass' ? '#7e966d' : type === 'scrub' ? '#879579' : '#7c8c70'
    ctx.lineWidth = type === 'moss' ? 2.5 : 1.4; ctx.beginPath()
    for (const root of roots) {
      if (root.type !== type || root.x < left || root.x > right || root.y < top || root.y > bottom) continue
      const seed = Math.abs(Math.floor(root.x * 7 + root.y * 3)) % 5
      ctx.save(); ctx.translate(root.x, root.y); ctx.rotate(Math.atan(root.slope))
      if (type === 'grass') {
        ctx.moveTo(-4, -5 - seed); ctx.lineTo(0, 0); ctx.lineTo(2, -8 - seed)
        ctx.moveTo(0, 0); ctx.lineTo(6, -4 - seed)
      } else if (type === 'moss') {
        ctx.moveTo(-7, -.5); ctx.quadraticCurveTo(-3, -3 - seed / 3, 0, -1)
        ctx.quadraticCurveTo(3, -3, 7, -.5)
      } else {
        ctx.moveTo(-2, -3 - seed); ctx.lineTo(0, 0); ctx.lineTo(3, -4 - seed)
        if (Math.floor(root.x / 19) % 3 === 0) {
          ctx.moveTo(-7, -7); ctx.quadraticCurveTo(-2, -6, 0, 0)
          ctx.quadraticCurveTo(2, -12, 5, -15)
          ctx.moveTo(0, 0); ctx.quadraticCurveTo(7, -5, 11, -6)
        }
      }
      ctx.restore()
    }
    ctx.stroke()
  }
  ctx.restore()
}
