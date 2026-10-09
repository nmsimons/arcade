/** Minimum exposure is readability, not a light source. Paint order stays intact. */
export type WorldLayer = 'all' | 'wall' | 'objects'
export type Exposure = 0 | .65 | 1
/** Optional conservative local bounds of this artwork, including strokes. */
export interface PaintBounds { x: number; y: number; w: number; h: number }
export type WorldPaint = (ctx: CanvasRenderingContext2D, exposure: Exposure, draw: () => void, receivesLight?: boolean, bounds?: PaintBounds) => void
export const paintNormally: WorldPaint = (_ctx, _exposure, draw) => draw()

/** Replay the same artwork, erasing emissions behind ordinary foreground art. */
export function emissionPaint(floor: Exposure, include?: (ctx: CanvasRenderingContext2D, bounds?: PaintBounds) => void): WorldPaint {
  return (ctx, exposure, draw, _receivesLight, bounds) => {
    if (exposure === floor) include?.(ctx, bounds)
    ctx.save()
    ctx.globalCompositeOperation = exposure === floor ? 'source-over' : 'destination-out'
    draw()
    ctx.restore()
  }
}

/** Wall artwork and structural solids receive ambient, but still occlude later masks. */
export const ambientPaint = (paint: WorldPaint): WorldPaint =>
  (ctx, exposure, draw, _receivesLight, bounds) => paint(ctx, exposure, draw, false, bounds)

/** Replay in draw order so only visible ambient-only artwork receives correction. */
export function ambientSurfacePaint(floor: Exposure, ceiling: Exposure = floor): WorldPaint {
  return (ctx, exposure, draw, receivesLight = true) => {
    ctx.save()
    ctx.globalCompositeOperation = !receivesLight && exposure >= floor && exposure <= ceiling ? 'source-over' : 'destination-out'
    draw()
    ctx.restore()
  }
}
