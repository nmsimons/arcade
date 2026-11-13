import { ArtPath } from './webgl/artPath.ts'

/**
 * A level's back-wall finish: wing identity on the course wall (docs/jumping-facility.md,
 * Wing identity). Artwork only: collision, cover, lighting and movement are unchanged,
 * and every finish keeps the wall's base fill and camera report. The course wall is the
 * default and keeps its fine grid; the others replace that grid with their own joints, so
 * the studio offers its editor grid over them.
 */
export const WALL_FINISHES = [
  { id: 'course', label: 'Course wall' },
  { id: 'panels', label: 'Bolted panels' },
  { id: 'tile', label: 'Tiled' },
  { id: 'bulkhead', label: 'Bulkhead' },
] as const
export type WallFinish = typeof WALL_FINISHES[number]['id']
export const isWallFinish = (value: unknown): value is WallFinish => WALL_FINISHES.some(finish => finish.id === value)
/** Whether the wall draws the course grid itself; otherwise the studio overlays its editor grid. */
export const wallHasGrid = (finish?: WallFinish) => !finish || finish === 'course'

interface Area { x: number; y: number; w: number; h: number }
const noise = (x: number, y: number) => { const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n) }
/** Whole cells of size w by h that touch the area, with their indices. */
function cells(area: Area, w: number, h: number, stagger = 0) {
  const out: { x: number; y: number; col: number; row: number }[] = []
  for (let row = Math.floor(area.y / h); row * h < area.y + area.h; row++) {
    const offset = row % 2 ? stagger : 0
    for (let col = Math.floor((area.x - offset) / w); col * w + offset < area.x + area.w; col++) out.push({ x: col * w + offset, y: row * h, col, row })
  }
  return out
}
/** Draws a finish over the wall's base fill, within `area` (the visible part of the level). */
export function drawWallFinish(ctx: CanvasRenderingContext2D, finish: Exclude<WallFinish, 'course'>, area: Area, zoom: number) {
  if (area.w <= 0 || area.h <= 0) return
  ctx.save(); ctx.beginPath(); ctx.rect(area.x, area.y, area.w, area.h); ctx.clip()
  // Fixings smaller than about a pixel only add noise when the view is zoomed out.
  const fixings = zoom >= .35
  if (finish === 'panels') drawPanels(ctx, area, fixings)
  else if (finish === 'tile') drawTile(ctx, area, fixings)
  else drawBulkhead(ctx, area, fixings)
  ctx.restore()
}

/** Large plates, each faintly its own tint, with shadowed joints and a bolt in each corner. */
function drawPanels(ctx: CanvasRenderingContext2D, area: Area, fixings: boolean) {
  const w = 240, h = 160, plates = cells(area, w, h)
  for (const p of plates) {
    ctx.fillStyle = `rgba(91,111,94,${.015 + noise(p.col, p.row) * .03})`; ctx.fillRect(p.x + 1, p.y + 1, w - 2, h - 2)
  }
  const shade = new ArtPath(), sheen = new ArtPath()
  for (const p of plates) {
    shade.moveTo(p.x, p.y + h); shade.lineTo(p.x, p.y); shade.lineTo(p.x + w, p.y)
    sheen.moveTo(p.x + 1.6, p.y + h); sheen.lineTo(p.x + 1.6, p.y + 1.6); sheen.lineTo(p.x + w, p.y + 1.6)
  }
  ctx.strokeStyle = '#4f5d5350'; ctx.lineWidth = 1.8; ctx.stroke(shade)
  ctx.strokeStyle = '#ffffffa8'; ctx.lineWidth = .9; ctx.stroke(sheen)
  if (!fixings) return
  const bolts = new ArtPath()
  for (const p of plates) for (const [dx, dy] of [[10, 10], [w - 10, 10], [10, h - 10], [w - 10, h - 10]]) bolts.rect(p.x + dx - 1.4, p.y + dy - 1.4, 2.8, 2.8)
  ctx.fillStyle = '#a9b1ab'; ctx.fill(bolts)
}

/** A wet room's wall: pale blue-grey glazed tiles, 80 by 40, laid in running bond. A light top-left edge and
 * a shaded bottom-right edge form each joint, so the tiles read as glazed rather than ruled. */
function drawTile(ctx: CanvasRenderingContext2D, area: Area, fixings: boolean) {
  const w = 80, h = 40, tiles = cells(area, w, h, w / 2)
  ctx.fillStyle = '#e6edec'; ctx.fillRect(area.x, area.y, area.w, area.h)
  for (const t of tiles) { ctx.fillStyle = `rgba(88,120,128,${.008 + noise(t.col, t.row) * .02})`; ctx.fillRect(t.x, t.y, w, h) }
  // Joints finer than about a pixel only add noise when the view is zoomed out.
  if (!fixings) return
  const light = new ArtPath(), shade = new ArtPath()
  for (const t of tiles) {
    light.moveTo(t.x + .5, t.y + h); light.lineTo(t.x + .5, t.y + .5); light.lineTo(t.x + w, t.y + .5)
    shade.moveTo(t.x, t.y + h - .5); shade.lineTo(t.x + w - .5, t.y + h - .5); shade.lineTo(t.x + w - .5, t.y)
  }
  ctx.lineWidth = 1.2; ctx.strokeStyle = '#ffffffb0'; ctx.stroke(light)
  ctx.strokeStyle = '#9fb6b866'; ctx.stroke(shade)
}

/** Heavy steel plates on a square grid, with deep seams and rivets along every edge. */
function drawBulkhead(ctx: CanvasRenderingContext2D, area: Area, fixings: boolean) {
  const w = 200, h = 200, plates = cells(area, w, h)
  ctx.fillStyle = '#cdd2d0'; ctx.fillRect(area.x, area.y, area.w, area.h)
  for (const p of plates) {
    ctx.fillStyle = `rgba(60,70,72,${.02 + noise(p.col, p.row) * .035})`; ctx.fillRect(p.x + 2, p.y + 2, w - 4, h - 4)
  }
  const seams = new ArtPath(), lips = new ArtPath()
  for (const p of plates) {
    seams.moveTo(p.x, p.y + h); seams.lineTo(p.x, p.y); seams.lineTo(p.x + w, p.y)
    lips.moveTo(p.x + 2.4, p.y + h); lips.lineTo(p.x + 2.4, p.y + 2.4); lips.lineTo(p.x + w, p.y + 2.4)
  }
  ctx.save(); ctx.strokeStyle = '#4c5658'; ctx.globalAlpha *= .55; ctx.lineWidth = 2.4; ctx.stroke(seams); ctx.restore()
  ctx.strokeStyle = '#ffffffb3'; ctx.lineWidth = 1; ctx.stroke(lips)
  if (!fixings) return
  const rivets = new ArtPath()
  for (const p of plates) for (let d = 14; d < w - 6; d += 22) {
    rivets.rect(p.x + d - 1.2, p.y + 6, 2.4, 2.4); rivets.rect(p.x + d - 1.2, p.y + h - 8.4, 2.4, 2.4)
    rivets.rect(p.x + 6, p.y + d - 1.2, 2.4, 2.4); rivets.rect(p.x + w - 8.4, p.y + d - 1.2, 2.4, 2.4)
  }
  ctx.fillStyle = '#9da6a4'; ctx.fill(rivets)
}
