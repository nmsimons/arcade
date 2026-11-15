import { drawDoorway } from './goal.ts'
import type { WallText } from './wallText.ts'
import type { WorldPaint } from './worldPaint.ts'

/**
 * The facility's Exit (the level door marked `dispatch`) is its one way out, so it is drawn as a bulkhead
 * built bigger and heavier: a wider, taller opening, a frame twice as thick and a deeper striped lintel, with
 * EXIT painted on the wall over it in larger lettering. Shut, it is one plain panel with a seam down the
 * middle; open, a dark doorway. The robot still goes through the shared 40-by-80 doorway at its middle
 * (`hubDoorBounds`).
 */
const WIDTH = 112, HEIGHT = 136, JAMB = 14, LINTEL = 20, STRIPE = 14, STRIPE_DEPTH = 8

type Door = { x: number; y: number }
/** The opening the gate closes. */
export const exitOpening = (door: Door) => ({ x: door.x - WIDTH / 2, y: door.y - HEIGHT, w: WIDTH, h: HEIGHT })
/** Where the open Exit's chevrons rise: a level door's proportions, at the opening's height, so they scale evenly. */
export const exitChevrons = (door: Door) => ({ x: door.x - HEIGHT / 4, y: door.y - HEIGHT, w: HEIGHT / 2, h: HEIGHT })
/** Everything the gate draws, but not the sign over it. */
export const exitGateBounds = (door: Door) => ({ x: door.x - WIDTH / 2 - JAMB, y: door.y - HEIGHT - LINTEL, w: WIDTH + JAMB * 2, h: HEIGHT + LINTEL })
/** EXIT is painted on the wall over the lintel, as a bulkhead's destination is, but larger. */
export const exitSignBounds = (door: Door) => ({ x: door.x - 150, y: door.y - HEIGHT - LINTEL - 60, w: 300, h: 52 })
export function exitSign(door: Door, text: string): WallText {
  return { ...exitSignBounds(door), text, fontSize: 40, align: 'center', style: 'official' }
}

export function drawExitGate(ctx: CanvasRenderingContext2D, door: Door, open: boolean, paint: WorldPaint) {
  const b = exitOpening(door), frame = exitGateBounds(door)
  paint(ctx, 0, () => {
    // The bulkhead's frame and striped lintel, heavier.
    ctx.fillStyle = '#5c6460'; ctx.fillRect(frame.x, frame.y, frame.w, frame.h)
    for (let x = frame.x, i = 0; x < frame.x + frame.w; x += STRIPE, i++) {
      ctx.fillStyle = i % 2 ? '#2f3431' : '#d9b545'; ctx.fillRect(x, frame.y, Math.min(STRIPE, frame.x + frame.w - x), STRIPE_DEPTH)
    }
    if (!open) {
      ctx.fillStyle = '#424a46'; ctx.fillRect(b.x, b.y, b.w, b.h)
      ctx.fillStyle = '#00000038'; ctx.fillRect(b.x + b.w / 2 - 1, b.y, 2, b.h)
    }
  })
  if (open) paint(ctx, 0, () => drawDoorway(ctx, b, 1))
}
