import { TUNING } from './model.ts'
import type { Player } from './model.ts'
import { levelHeight } from './level.ts'
import type { JumpLevel } from './level.ts'
import { playerTurnAngle } from './ropeGravity.ts'
import { AWAKENING_SECONDS, goalEase } from './goal.ts'
import type { EntranceAnimation } from './goal.ts'
import { landingDustStrength } from './worldEffects.ts'
export const LEVEL_BOTTOM_PADDING = 32

function verticalCamera(height: number, zoom: number, center: number, roomHeight: number) {
  const viewHeight = height / zoom, padding = LEVEL_BOTTOM_PADDING / zoom
  // Fit short rooms in the middle, and keep both enclosing contacts readable
  // in taller rooms. The two policies meet at the same position on resize.
  return roomHeight + padding * 2 <= viewHeight ? (roomHeight - viewHeight) / 2
    : Math.max(-padding, Math.min(center - viewHeight / 2, roomHeight + padding - viewHeight))
}

/** Shared by the original and lit renderers so lighting never changes framing. */
export function gameCamera(width: number, height: number, p: Player, level: JumpLevel, challenge: boolean, lookAhead = 0, verticalLook = 0) {
  const y = p.y + ((p.waterCamera?.y ?? p.y) - p.y) * (p.waterCamera?.amount ?? 0)
  const angle = playerTurnAngle(p), radius = TUNING.height / 2 * (p.inverted ? -1 : 1)
  // Follow occupied body space through a turn. The foot-root changes meaning
  // at inversion; treating it as upright until then makes the view jump a body height.
  const centerX = p.x + Math.sin(angle) * radius, center = y - Math.cos(angle) * radius
  const vertical = (zoom: number) => {
    const roomHeight = levelHeight(level), base = verticalCamera(height, zoom, center, roomHeight), viewHeight = height / zoom
    if (!verticalLook || roomHeight + LEVEL_BOTTOM_PADDING * 2 / zoom <= viewHeight) return base
    const margin = 12 / zoom, extent = Math.abs(Math.cos(angle) * radius) + Math.abs(Math.sin(angle) * TUNING.width / 2)
    const low = Math.max(-LEVEL_BOTTOM_PADDING / zoom, center + extent - viewHeight + margin)
    const high = Math.min(roomHeight + LEVEL_BOTTOM_PADDING / zoom - viewHeight, center - extent - margin)
    return Math.max(low, Math.min(high, base + verticalLook))
  }
  if (!challenge) {
    const zoom = Math.max(.45, Math.min(1.6, height / 760))
    return { zoom, x: centerX - width / zoom / 2,
      y: vertical(zoom) }
  }
  // At .42 the entire standing figure is only 26 CSS pixels high. A .6 floor
  // keeps its hands/feet legible on phones while retaining more approach view
  // than .65; normal desktop scales remain governed by the room and viewport.
  const zoom = Math.max(.6, Math.min(1.3, height / 850, width / Math.min(1800, level.width + 80)))
  const half = width / zoom / 2
  const leadLimit = Math.max(0, half - 72)
  const ahead = Math.max(-leadLimit, Math.min(leadLimit, lookAhead))
  const walkOff = level.goal?.kind === 'walk-off'
  const cameraX = level.width < half * 2 - 80 ? walkOff ? level.width - half : level.width / 2
    : Math.max(half - 40, Math.min(level.width - half + (walkOff ? 0 : 40), centerX + ahead))
  return { zoom, x: cameraX - half, y: vertical(zoom) }
}

/** Hold on the occupied pod, then quietly reveal the room before control starts. */
export function awakeningCamera(view: ReturnType<typeof gameCamera>, width: number, height: number, entrance?: EntranceAnimation | null) {
  if (entrance?.kind !== 'charging-bay') return view
  const reveal = goalEase((entrance.elapsed - 1.5) / (AWAKENING_SECONDS - 1.5))
  if (reveal >= 1) return view
  const closeZoom = Math.max(view.zoom, Math.min(1.65, width / 360, height / 300))
  const closeX = Math.max(-40, entrance.player.x + 85 - width / closeZoom / 2)
  const zoom = closeZoom + (view.zoom - closeZoom) * reveal
  // Blend the robot's screen position, so the floor never dips out of frame
  // as the visible world grows during the pullback.
  const fromX = (entrance.player.x - closeX) * closeZoom
  const toX = (entrance.player.x - view.x) * view.zoom
  const toY = (entrance.player.y - view.y) * view.zoom
  return { zoom, x: entrance.player.x - (fromX + (toX - fromX) * reveal) / zoom,
    y: entrance.player.y - (height * .76 + (toY - height * .76) * reveal) / zoom }
}

/** Seconds a hard landing's settle takes to ease out, and its size in screen pixels at the softest and hardest landing. */
export const LANDING_SETTLE_SECONDS = .18
export const LANDING_SETTLE_PIXELS = [3, 5] as const
let reducedMotion: MediaQueryList | null | undefined
/** Whether the player asked for less motion; read live, so changing the setting applies at once. */
function prefersReducedMotion() {
  if (reducedMotion === undefined) reducedMotion = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null
  return reducedMotion?.matches ?? false
}

/** Presentation state belongs to the view, so sampling a camera never changes
 * the player or advances the motor. Both renderers can use the returned view. */
export class GameCamera {
  private player?: Player
  private level?: JumpLevel
  private lookAhead = 0
  private verticalLook = 0
  /** A hard landing nudges the view along the fall for a moment, in screen pixels, then eases back. */
  private settle = { pixels: 0, age: LANDING_SETTLE_SECONDS, airborne: false, fall: 0 }

  view(width: number, height: number, p: Player, level: JumpLevel, challenge: boolean, dt = 0) {
    if (p !== this.player || level !== this.level) {
      this.player = p; this.level = level; this.lookAhead = 0; this.verticalLook = 0
      this.settle = { pixels: 0, age: LANDING_SETTLE_SECONDS, airborne: !p.grounded, fall: 0 }
    }
    const offset = this.landingSettle(p, Math.max(0, dt))
    const view = this.follow(width, height, p, level, challenge, dt)
    // A short room is framed whole and holds still; only a view that follows the robot settles.
    const fixed = levelHeight(level) + LEVEL_BOTTOM_PADDING * 2 / view.zoom <= height / view.zoom
    return offset && !fixed ? { ...view, y: view.y + offset / view.zoom } : view
  }

  /** Reads the landing from the player each drawn frame: the last airborne fall speed, then the first frame on the ground. */
  private landingSettle(p: Player, dt: number) {
    const s = this.settle, up = p.inverted ? -1 : 1
    if (dt > 0) {
      s.age += dt
      if (s.airborne && p.grounded && !p.sliding?.active) {
        const strength = landingDustStrength(s.fall)
        if (strength > 0 && !prefersReducedMotion()) {
          s.pixels = up * (LANDING_SETTLE_PIXELS[0] + (LANDING_SETTLE_PIXELS[1] - LANDING_SETTLE_PIXELS[0]) * strength); s.age = 0
        }
      }
      s.airborne = !p.grounded; s.fall = p.grounded ? 0 : p.vy * up
    }
    if (s.age >= LANDING_SETTLE_SECONDS) return 0
    return s.pixels * (1 - s.age / LANDING_SETTLE_SECONDS) ** 2
  }

  private follow(width: number, height: number, p: Player, level: JumpLevel, challenge: boolean, dt: number) {
    // The original desktop view already covers a full running jump. Add lead
    // only when the visible half-span falls short of that commitment.
    const base = gameCamera(width, height, p, level, challenge)
    const lead = challenge ? Math.min(200, Math.max(0, 480 - width / base.zoom / 2)) : 0
    const speed = Math.max(0, Math.min(1, (Math.abs(p.vx) - TUNING.walkSpeed) / (TUNING.runSpeed - TUNING.walkSpeed)))
    const target = Math.sign(p.vx) * speed * speed * (3 - 2 * speed) * lead
    // Use actual outgoing velocity through turns, then blend the view itself;
    // changing facing or input never flips the camera in a single frame.
    const elapsed = Math.max(0, dt), change = (target - this.lookAhead) * (1 - Math.exp(-elapsed / .12))
    this.lookAhead += Math.max(-800 * elapsed, Math.min(800 * elapsed, change))
    const verticalTarget = (p.crouch - p.anim.look) * (p.inverted ? -1 : 1) * Math.cos(playerTurnAngle(p))
      * Math.min(80, height / base.zoom * .08)
    this.verticalLook += (verticalTarget - this.verticalLook) * (1 - Math.exp(-elapsed / .16))
    return gameCamera(width, height, p, level, challenge, this.lookAhead, this.verticalLook)
  }
}
