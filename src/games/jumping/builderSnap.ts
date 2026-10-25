import type { Selection } from './editor.ts'
import type { JumpLevel } from './level.ts'
import { levelHeight } from './level.ts'
import { selectionBounds } from './editorSelection.ts'

/** Authoring precision is independent of wall tiles and terrain template dimensions. */
export const BUILDER_GRID_SIZE = 5

function selectionSnapPoints(level: JumpLevel, selections: readonly Selection[]) {
  const bounds = selectionBounds(level, selections)
  if (!bounds) return null
  return { bounds, x: [bounds.x + bounds.w / 2, bounds.x, bounds.x + bounds.w],
    y: [bounds.y + bounds.h / 2, bounds.y, bounds.y + bounds.h] }
}

/** Resolve each axis independently; the closest center or bounds edge wins. */
export function levelCenterSnap(level: JumpLevel, selections: readonly Selection[], dx: number, dy: number, tolerance: number) {
  const points = selectionSnapPoints(level, selections)
  const nearest = (values: number[], center: number, delta: number): number | null => {
    let distance = tolerance + 1e-8, result: number | null = null
    for (const value of values) {
      const correction = center - value - delta
      if (Math.abs(correction) < distance) { distance = Math.abs(correction); result = center - value }
    }
    return result
  }
  return { dx: points ? nearest(points.x, level.width / 2, dx) : null,
    dy: points ? nearest(points.y, levelHeight(level) / 2, dy) : null }
}

/** Draw the real geometric anchors, never the padded selection outline. */
export function drawLevelCenterGuides(ctx: CanvasRenderingContext2D, level: JumpLevel, selections: readonly Selection[], zoom: number) {
  const points = selectionSnapPoints(level, selections)
  if (!points) return
  const cx = level.width / 2, cy = levelHeight(level) / 2
  const alignedX = points.x.some(x => Math.abs(x - cx) < .01), alignedY = points.y.some(y => Math.abs(y - cy) < .01)
  ctx.save()
  for (const axis of ['x', 'y'] as const) {
    const aligned = axis === 'x' ? alignedX : alignedY
    ctx.strokeStyle = aligned ? '#287c9b' : '#287c9b66'; ctx.lineWidth = (aligned ? 2 : 1) / zoom
    ctx.setLineDash(aligned ? [] : [6 / zoom, 5 / zoom]); ctx.beginPath()
    if (axis === 'x') { ctx.moveTo(cx, 0); ctx.lineTo(cx, levelHeight(level)) }
    else { ctx.moveTo(0, cy); ctx.lineTo(level.width, cy) }
    ctx.stroke(); ctx.setLineDash([])
    // Diamonds mark the level center at its boundaries and the aligned anchors.
    const markers = axis === 'x' ? [{ x: cx, y: 0 }, { x: cx, y: levelHeight(level) }]
      : [{ x: 0, y: cy }, { x: level.width, y: cy }]
    if (aligned) markers.push(axis === 'x' ? { x: cx, y: points.bounds.y + points.bounds.h / 2 }
      : { x: points.bounds.x + points.bounds.w / 2, y: cy })
    ctx.fillStyle = aligned ? '#287c9b' : '#fffdf5'
    for (const p of markers) {
      const r = 4 / zoom
      ctx.beginPath(); ctx.moveTo(p.x, p.y - r); ctx.lineTo(p.x + r, p.y); ctx.lineTo(p.x, p.y + r); ctx.lineTo(p.x - r, p.y); ctx.closePath(); ctx.fill(); ctx.stroke()
    }
  }
  ctx.restore()
}
