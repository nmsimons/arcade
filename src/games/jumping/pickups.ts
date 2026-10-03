import type { NamedObject } from './objectNames.ts'
import { TUNING } from './model.ts'
import type { Player } from './model.ts'
import { COIN_COLOR, COIN_EDGE_COLOR, COIN_RADIUS, COIN_SPIN_SPEED, COIN_THICKNESS, drawCoin } from './coins.ts'

/** Pickup coordinates mark the center of the face. */
export type Pickup = NamedObject & { x: number; y: number } & (
  { kind: 'stopwatch' | 'fast-stopwatch' | 'coin' | 'emp' } | { kind: 'time-bonus' | 'time-penalty'; seconds: number }
)
export interface PickupState { definition: Pickup; collectedAge: number | null }
export const STOPWATCH_SECONDS = 10
export const FAST_STOPWATCH_SECONDS = 5
export const EMP_SECONDS = 5
export const EMP_COLOR = COIN_COLOR
const EMP_BOLT_POINTS = [[6, -21], [-14, 3], [-2, 3], [-6, 21], [14, -3], [2, -3]] as const
export const EMP_BOLT_PATH = `M${EMP_BOLT_POINTS.map(([x, y]) => `${x} ${y}`).join('L')}Z`
export const EMP_ANIMATION_SECONDS = .55
export const PICKUP_ANIMATION_SECONDS = .34
export const TIME_BONUS_LABEL_SECONDS = .8
export const STOPWATCH_COLOR = '#ba8542'
export const TIME_PENALTY_COLOR = '#94433f'
export const TIME_BONUS_DEFAULT_SECONDS = 5
export const TIME_BONUS_ARROW_PATH = 'M-14.78-12.41A19.3 19.3 0 1 0 0-19.3L-8-20.3 M-1-27.3L-8-20.3L-1-13.3'
export const TIME_BONUS_ARROW_WIDTH = 5.4
export const pickupLabel = (kind: Pickup['kind']) => ({
  coin: 'Coin', stopwatch: 'Stopwatch', 'fast-stopwatch': 'Fast stopwatch', 'time-bonus': 'Time bonus', 'time-penalty': 'Time penalty', emp: 'EMP',
})[kind]
export const STOPWATCH_FACE_PATH = 'M20 0a20 20 0 1 1-40 0a20 20 0 1 1 40 0Z M14.6 0a14.6 14.6 0 1 0-29.2 0a14.6 14.6 0 1 0 29.2 0Z'
// The crown and pusher stay fixed while the capsule hand sweeps around its hub.
export const STOPWATCH_DETAILS_PATH = [
  'M-2.8-25H2.8V-18.5H-2.8Z',
  'M-4.4-29H4.4Q6-29 6-27.4V-25.6Q6-24 4.4-24H-4.4Q-6-24-6-25.6V-27.4Q-6-29-4.4-29Z',
  'M12.4-17.2 16.7-21.5 20.5-17.7 16.2-13.4Z',
  'M15.1-22.1 16.8-23.8Q17.9-24.9 19-23.8L22.8-20Q23.9-18.9 22.8-17.8L21.1-16.1Q20-15 18.9-16.1L15.1-19.9Q14-21 15.1-22.1Z',
].join(' ')
export const STOPWATCH_HAND_PATH = [
  'M-7.48-8.21 1.12-1.41A1.8 1.8 0 0 1-1.12 1.41L-9.72-5.39A1.8 1.8 0 0 1-7.48-8.21Z',
  'M3.5 0a3.5 3.5 0 1 1-7 0a3.5 3.5 0 1 1 7 0Z',
].join(' ')
export const pickupBounds = (p: Pick<Pickup, 'x' | 'y'> & Partial<Pick<Pickup, 'kind'>>) => p.kind === 'coin'
  ? { x: p.x - 20, y: p.y - 20, w: 40, h: 40 }
  : p.kind === 'emp' ? { x: p.x - 24, y: p.y - 24, w: 48, h: 48 }
  : { x: p.x - 24, y: p.y - 32, w: 48, h: 52 }

function touchesPlayer(p: Player, pickup: Pickup) {
  const height = p.crouching ? TUNING.crouchHeight : TUNING.height
  const top = Math.min(p.y, p.y - height * (p.inverted ? -1 : 1)), bottom = top + height
  const nearestX = Math.max(p.x - TUNING.width / 2, Math.min(p.x + TUNING.width / 2, pickup.x))
  const numbered = pickup.kind === 'time-bonus' || pickup.kind === 'time-penalty'
  const centerY = pickup.y - (numbered ? 4 : 0)
  const nearestY = Math.max(top, Math.min(bottom, centerY))
  if (pickup.kind === 'coin') return Math.hypot(pickup.x - nearestX, pickup.y - nearestY) <= COIN_RADIUS
  if (pickup.kind === 'emp') return Math.hypot(pickup.x - nearestX, pickup.y - nearestY) <= 20
  if (numbered) return Math.hypot(pickup.x - nearestX, centerY - nearestY) <= 22
  const face = Math.hypot(pickup.x - nearestX, pickup.y - nearestY) <= 20
  const crown = p.x + TUNING.width / 2 >= pickup.x - 9 && p.x - TUNING.width / 2 <= pickup.x + 9
    && bottom >= pickup.y - 31 && top <= pickup.y - 20
  const button = p.x + TUNING.width / 2 >= pickup.x + 12 && p.x - TUNING.width / 2 <= pickup.x + 24
    && bottom >= pickup.y - 25 && top <= pickup.y - 13
  return face || crown || button
}

/** Collection effects use simulation time, even while the level clock is stopped. */
export function stepPickups(pickups: PickupState[], player: Player, dt: number, canCollect: boolean) {
  let seconds = 0, coins = 0, timeOff = 0, timeAdded = 0, fastSeconds = 0, empSeconds = 0
  for (const pickup of pickups) {
    if (pickup.collectedAge !== null) pickup.collectedAge = Math.min(
      pickup.definition.kind === 'time-bonus' || pickup.definition.kind === 'time-penalty' ? TIME_BONUS_LABEL_SECONDS
        : pickup.definition.kind === 'emp' ? EMP_ANIMATION_SECONDS : PICKUP_ANIMATION_SECONDS, pickup.collectedAge + dt)
    else if (canCollect && touchesPlayer(player, pickup.definition)) {
      pickup.collectedAge = 0
      if (pickup.definition.kind === 'coin') coins++
      else if (pickup.definition.kind === 'time-bonus') timeOff += pickup.definition.seconds
      else if (pickup.definition.kind === 'time-penalty') timeAdded += pickup.definition.seconds
      else if (pickup.definition.kind === 'fast-stopwatch') fastSeconds += FAST_STOPWATCH_SECONDS
      else if (pickup.definition.kind === 'emp') empSeconds += EMP_SECONDS
      else seconds += STOPWATCH_SECONDS
    }
  }
  return { seconds, coins, timeOff, timeAdded, fastSeconds, empSeconds }
}

let face: Path2D | undefined, details: Path2D | undefined, hand: Path2D | undefined, bonusArrow: Path2D | undefined, bolt: Path2D | undefined
function drawEmp(ctx: CanvasRenderingContext2D, time: number, age: number | null, phase: number) {
  if (age !== null && age >= EMP_ANIMATION_SECONDS) return
  ctx.save()
  if (age !== null) {
    const progress = age / EMP_ANIMATION_SECONDS
    ctx.strokeStyle = EMP_COLOR; ctx.lineWidth = 3 * (1 - progress); ctx.globalAlpha = (1 - progress) ** 2
    ctx.beginPath(); ctx.arc(0, 0, 22 + 130 * (1 - (1 - progress) ** 2), 0, Math.PI * 2); ctx.stroke()
  }
  if (age === null || age < PICKUP_ANIMATION_SECONDS) {
    const shrink = age === null ? 0 : Math.max(0, (age - .09) / (PICKUP_ANIMATION_SECONDS - .09))
    const scale = age === null ? 1
      : age < .09 ? 1 + .18 * Math.sin(age / .09 * Math.PI / 2) : 1.18 * (1 - shrink) ** 2
    ctx.scale(scale, scale); ctx.globalAlpha = 1 - shrink
    const angle = time * COIN_SPIN_SPEED + phase, width = Math.cos(angle), depth = COIN_THICKNESS * Math.abs(Math.sin(angle))
    ctx.rotate(Math.sin(angle) * .1)
    bolt ??= new Path2D(EMP_BOLT_PATH)
    ctx.fillStyle = COIN_EDGE_COLOR
    ctx.save(); ctx.translate(depth / 2, 0); ctx.scale(width, 1); ctx.fill(bolt); ctx.restore()
    // Extrude every edge of the bolt so the narrow side stays solid as it turns.
    for (const [i, [x, y]] of EMP_BOLT_POINTS.entries()) {
      const [nextX, nextY] = EMP_BOLT_POINTS[(i + 1) % EMP_BOLT_POINTS.length]
      ctx.beginPath(); ctx.moveTo(x * width - depth / 2, y); ctx.lineTo(x * width + depth / 2, y)
      ctx.lineTo(nextX * width + depth / 2, nextY); ctx.lineTo(nextX * width - depth / 2, nextY); ctx.closePath(); ctx.fill()
    }
    ctx.translate(-depth / 2, 0); ctx.scale(width, 1); ctx.fillStyle = EMP_COLOR; ctx.fill(bolt)
  }
  ctx.restore()
}
export function drawPickup(ctx: CanvasRenderingContext2D, pickup: PickupState, time = 0) {
  const { definition, collectedAge: age } = pickup
  if (definition.kind === 'emp') {
    ctx.save(); ctx.translate(definition.x, definition.y); drawEmp(ctx, time, age, definition.x * .013 + definition.y * .007); ctx.restore()
    return
  }
  const penalty = definition.kind === 'time-penalty' || definition.kind === 'fast-stopwatch'
  const color = definition.kind === 'coin' ? COIN_COLOR : penalty ? TIME_PENALTY_COLOR : STOPWATCH_COLOR
  const numbered = definition.kind === 'time-bonus' || definition.kind === 'time-penalty'
  if (age !== null && age >= (numbered ? TIME_BONUS_LABEL_SECONDS : PICKUP_ANIMATION_SECONDS)) return
  ctx.save(); ctx.translate(definition.x, definition.y)
  if (age === null || age < PICKUP_ANIMATION_SECONDS) {
    ctx.save()
    if (age !== null) {
      const progress = age / PICKUP_ANIMATION_SECONDS
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.globalAlpha = (1 - progress) * .65
      ctx.beginPath(); ctx.arc(0, 0, 22 + 24 * progress, 0, Math.PI * 2); ctx.stroke()
      const pulse = .09, shrink = Math.max(0, (age - pulse) / (PICKUP_ANIMATION_SECONDS - pulse))
      const scale = age < pulse ? 1 + .22 * Math.sin(age / pulse * Math.PI / 2) : 1.22 * (1 - shrink) ** 2
      ctx.scale(scale, scale); ctx.globalAlpha = 1 - shrink
    }
    if (definition.kind === 'coin') drawCoin(ctx, time, definition.x * .013 + definition.y * .007)
    else if (numbered) {
      bonusArrow ??= new Path2D(TIME_BONUS_ARROW_PATH)
      ctx.translate(0, -4); ctx.fillStyle = color; ctx.strokeStyle = color
      ctx.lineWidth = TIME_BONUS_ARROW_WIDTH; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
      ctx.save(); ctx.rotate((penalty ? 1 : -1) * time * Math.PI * 2 / 12)
      if (penalty) ctx.scale(-1, 1)
      ctx.stroke(bonusArrow); ctx.restore()
      if (age === null) {
        ctx.font = '700 22px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'
        ctx.fillText(String(definition.seconds), 0, 8)
      }
    }
    else {
      face ??= new Path2D(STOPWATCH_FACE_PATH); details ??= new Path2D(STOPWATCH_DETAILS_PATH); hand ??= new Path2D(STOPWATCH_HAND_PATH)
      ctx.fillStyle = color; ctx.fill(face, 'evenodd'); ctx.fill(details)
      ctx.save(); ctx.rotate(time * Math.PI * 2 * (penalty ? 1 / 1.2 : -1 / 8)); ctx.fill(hand); ctx.restore()
    }
    ctx.restore()
  }
  if (age !== null && numbered) {
    const progress = age / TIME_BONUS_LABEL_SECONDS
    ctx.fillStyle = color; ctx.globalAlpha = 1 - progress ** 2
    ctx.font = '700 22px system-ui, sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic'
    // Lift the existing numeral out of the face; adding the sign must
    // not recenter it or leave a second numeral in the shrinking ring.
    const right = ctx.measureText(String(definition.seconds)).width / 2
    ctx.fillText(`${penalty ? '+' : '−'}${definition.seconds}`, right, 4 - 56 * (1 - (1 - progress) ** 2))
  }
  ctx.restore()
}
