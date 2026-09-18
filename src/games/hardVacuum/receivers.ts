import type { TetherBody, Vector2 } from './types'

export const RECEIVER_HALF_GAP = 66
export const RECEIVER_HALF_HEIGHT = 24
export const RECEIVER_PLATE_WIDTH = 12

export function receiverPlates(pos: Vector2): Vector2[][] {
  return [-1,1].map(side => {
    const x=pos.x+(side<0 ? -RECEIVER_HALF_GAP-RECEIVER_PLATE_WIDTH : RECEIVER_HALF_GAP)
    const y=pos.y-RECEIVER_HALF_HEIGHT
    return [{x,y},{x:x+RECEIVER_PLATE_WIDTH,y},{x:x+RECEIVER_PLATE_WIDTH,y:y+RECEIVER_HALF_HEIGHT*2},{x,y:y+RECEIVER_HALF_HEIGHT*2}]
  })
}

/** The cell must clear the inner plate edges and enter their vertical span.
 * Nothing outside this physical aperture is pulled toward the receiver. */
export function betweenReceiverPlates(cell: Pick<TetherBody,'pos' | 'radius'>, receiver: Vector2) {
  return Math.abs(cell.pos.x-receiver.x)+cell.radius <= RECEIVER_HALF_GAP && Math.abs(cell.pos.y-receiver.y) <= RECEIVER_HALF_HEIGHT
}
