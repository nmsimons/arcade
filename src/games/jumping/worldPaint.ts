/** Minimum exposure is readability, not a light source. Paint order stays intact. */
export type WorldLayer = 'all' | 'wall' | 'objects'
export type Exposure = 0 | .65 | 1
export type WorldPaint = (ctx: CanvasRenderingContext2D, exposure: Exposure, draw: () => void, receivesLight?: boolean) => void
export const paintNormally: WorldPaint = (_ctx, _exposure, draw) => draw()

/** Replay the same artwork, erasing emissions behind ordinary foreground art. */
export function emissionPaint(floor: Exposure): WorldPaint {
  return (ctx, exposure, draw) => {
    ctx.save()
    ctx.globalCompositeOperation = exposure === floor ? 'source-over' : 'destination-out'
    draw()
    ctx.restore()
  }
}

/** Wall artwork and structural solids receive ambient, but still occlude later masks. */
export const ambientPaint = (paint: WorldPaint): WorldPaint =>
  (ctx, exposure, draw) => paint(ctx, exposure, draw, false)

/** Replay in draw order so only visible ambient-only artwork receives correction. */
export function ambientSurfacePaint(floor: Exposure): WorldPaint {
  return (ctx, exposure, draw, receivesLight = true) => {
    ctx.save()
    ctx.globalCompositeOperation = !receivesLight && exposure === floor ? 'source-over' : 'destination-out'
    draw()
    ctx.restore()
  }
}
