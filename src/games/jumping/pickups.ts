import type { NamedObject } from './objectNames.ts'
import { TUNING } from './model.ts'
import type { Player } from './model.ts'

/** Pickup coordinates mark the center of the stopwatch face. */
export interface Pickup extends NamedObject { kind: 'stopwatch'; x: number; y: number }
export interface PickupState { definition: Pickup; collectedAge: number | null }
export const STOPWATCH_SECONDS = 10
export const PICKUP_ANIMATION_SECONDS = .34
export const STOPWATCH_COLOR = '#ba8542'
export const STOPWATCH_FACE_PATH = 'M20 0a20 20 0 1 1-40 0a20 20 0 1 1 40 0Z M14.6 0a14.6 14.6 0 1 0-29.2 0a14.6 14.6 0 1 0 29.2 0Z'
// Clockwise filled shapes join cleanly: a compact crown, rounded pusher, and capsule hand with a circular hub.
export const STOPWATCH_DETAILS_PATH = [
  'M-2.8-25H2.8V-18.5H-2.8Z',
  'M-4.4-29H4.4Q6-29 6-27.4V-25.6Q6-24 4.4-24H-4.4Q-6-24-6-25.6V-27.4Q-6-29-4.4-29Z',
  'M12.4-17.2 16.7-21.5 20.5-17.7 16.2-13.4Z',
  'M15.1-22.1 16.8-23.8Q17.9-24.9 19-23.8L22.8-20Q23.9-18.9 22.8-17.8L21.1-16.1Q20-15 18.9-16.1L15.1-19.9Q14-21 15.1-22.1Z',
  'M-7.48-8.21 1.12-1.41A1.8 1.8 0 0 1-1.12 1.41L-9.72-5.39A1.8 1.8 0 0 1-7.48-8.21Z',
  'M3.5 0a3.5 3.5 0 1 1-7 0a3.5 3.5 0 1 1 7 0Z',
].join(' ')
export const pickupBounds = (p: Pick<Pickup, 'x' | 'y'>) => ({ x: p.x - 24, y: p.y - 32, w: 48, h: 52 })

function touchesPlayer(p: Player, pickup: Pickup) {
  const nearestX = Math.max(p.x - TUNING.width / 2, Math.min(p.x + TUNING.width / 2, pickup.x))
  const nearestY = Math.max(p.y - TUNING.height, Math.min(p.y, pickup.y))
  const face = Math.hypot(pickup.x - nearestX, pickup.y - nearestY) <= 20
  const crown = p.x + TUNING.width / 2 >= pickup.x - 9 && p.x - TUNING.width / 2 <= pickup.x + 9
    && p.y >= pickup.y - 31 && p.y - TUNING.height <= pickup.y - 20
  const button = p.x + TUNING.width / 2 >= pickup.x + 12 && p.x - TUNING.width / 2 <= pickup.x + 24
    && p.y >= pickup.y - 25 && p.y - TUNING.height <= pickup.y - 13
  return face || crown || button
}

/** Collection effects use simulation time, even while the level clock is stopped. */
export function stepPickups(pickups: PickupState[], player: Player, dt: number, canCollect: boolean) {
  let seconds = 0
  for (const pickup of pickups) {
    if (pickup.collectedAge !== null) pickup.collectedAge = Math.min(PICKUP_ANIMATION_SECONDS, pickup.collectedAge + dt)
    else if (canCollect && touchesPlayer(player, pickup.definition)) {
      pickup.collectedAge = 0
      seconds += STOPWATCH_SECONDS
    }
  }
  return seconds
}

let face: Path2D | undefined, details: Path2D | undefined
export function drawPickup(ctx: CanvasRenderingContext2D, pickup: PickupState) {
  const age = pickup.collectedAge
  if (age !== null && age >= PICKUP_ANIMATION_SECONDS) return
  face ??= new Path2D(STOPWATCH_FACE_PATH); details ??= new Path2D(STOPWATCH_DETAILS_PATH)
  ctx.save(); ctx.translate(pickup.definition.x, pickup.definition.y)
  if (age !== null) {
    const progress = age / PICKUP_ANIMATION_SECONDS
    ctx.strokeStyle = STOPWATCH_COLOR; ctx.lineWidth = 2; ctx.globalAlpha = (1 - progress) * .65
    ctx.beginPath(); ctx.arc(0, 0, 22 + 24 * progress, 0, Math.PI * 2); ctx.stroke()
    const pulse = .09, shrink = Math.max(0, (age - pulse) / (PICKUP_ANIMATION_SECONDS - pulse))
    const scale = age < pulse ? 1 + .22 * Math.sin(age / pulse * Math.PI / 2) : 1.22 * (1 - shrink) ** 2
    ctx.scale(scale, scale); ctx.globalAlpha = 1 - shrink
  }
  ctx.fillStyle = STOPWATCH_COLOR; ctx.fill(face, 'evenodd'); ctx.fill(details)
  ctx.restore()
}
