import { ArtPath } from './webgl/artPath.ts'
import { WALL_PANEL } from './surfaceDepth.ts'

/**
 * A level's back-wall finish: wing identity on the course wall (docs/jumping-facility.md,
 * Wing identity). Every finish keeps the course wall itself, its fine grid and its tinted,
 * shaded precast panels, and only adds a light layer over it: bolts on the panels, a cool
 * wash that turns the grid into tile, or a steel wash with rivets. Artwork only: collision,
 * cover, lighting and movement are unchanged, as are the wall's base fill and camera report.
 */
export const WALL_FINISHES = [
  { id: 'course', label: 'Course wall' },
  { id: 'panels', label: 'Bolted panels' },
  { id: 'tile', label: 'Tiled' },
  { id: 'bulkhead', label: 'Bulkhead' },
] as const
export type WallFinish = typeof WALL_FINISHES[number]['id']
export const isWallFinish = (value: unknown): value is WallFinish => WALL_FINISHES.some(finish => finish.id === value)

interface Area { x: number; y: number; w: number; h: number }
/** The course wall's panels that touch the area, by their top-left corners. */
function panels(area: Area) {
  const { w, h } = WALL_PANEL, out: [number, number][] = []
  for (let row = Math.floor(area.y / h); row * h < area.y + area.h; row++) {
    const stagger = (row % 2) * w / 2
    for (let col = Math.floor((area.x - stagger) / w); col * w + stagger < area.x + area.w; col++) out.push([col * w + stagger, row * h])
  }
  return out
}
/** Small, pale fixings as one path. */
function fixings(ctx: CanvasRenderingContext2D, points: [number, number][], color: string) {
  const path = new ArtPath()
  for (const [x, y] of points) path.rect(x - 1.1, y - 1.1, 2.2, 2.2)
  ctx.fillStyle = color; ctx.fill(path)
}

/** Draws a finish over the finished course wall, within `area` (the visible part of the level). */
export function drawWallFinish(ctx: CanvasRenderingContext2D, finish: Exclude<WallFinish, 'course'>, area: Area, zoom: number) {
  if (area.w <= 0 || area.h <= 0) return
  ctx.save(); ctx.beginPath(); ctx.rect(area.x, area.y, area.w, area.h); ctx.clip()
  const { w, h } = WALL_PANEL
  // Fixings smaller than about a pixel only add noise when the view is zoomed out.
  const close = zoom >= .35
  if (finish === 'tile') {
    // A faint cool glaze: the fine grid reads as small tiles.
    ctx.fillStyle = 'rgba(110,165,180,.07)'; ctx.fillRect(area.x, area.y, area.w, area.h)
  } else if (finish === 'panels') {
    if (close) fixings(ctx, panels(area).flatMap(([x, y]): [number, number][] => [[x + 9, y + 9], [x + w - 9, y + 9], [x + 9, y + h - 9], [x + w - 9, y + h - 9]]), '#bfc7c1')
  } else {
    // A cooler steel tone, and a short row of rivets under each panel's top joint.
    ctx.fillStyle = 'rgba(70,84,92,.05)'; ctx.fillRect(area.x, area.y, area.w, area.h)
    if (close) fixings(ctx, panels(area).flatMap(([x, y]): [number, number][] => [30, 60, 90, 270, 300, 330].map((d): [number, number] => [x + d, y + 7])), '#b8c0be')
  }
  ctx.restore()
}
