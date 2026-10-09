import { TUNING } from './model.ts'
import type { Player } from './model.ts'
import { levelHeight } from './level.ts'
import type { JumpLevel } from './level.ts'
export const LEVEL_BOTTOM_PADDING = 32

function verticalCamera(height: number, zoom: number, center: number, roomHeight: number) {
  const viewHeight = height / zoom, padding = LEVEL_BOTTOM_PADDING / zoom
  // Fit short rooms in the middle, and keep both enclosing contacts readable
  // in taller rooms. The two policies meet at the same position on resize.
  return roomHeight + padding * 2 <= viewHeight ? (roomHeight - viewHeight) / 2
    : Math.max(-padding, Math.min(center - viewHeight / 2, roomHeight + padding - viewHeight))
}

/** Shared by the original and lit renderers so lighting never changes framing. */
export function gameCamera(width: number, height: number, p: Player, level: JumpLevel, challenge: boolean, lookAhead = 0) {
  const y = p.y + ((p.waterCamera?.y ?? p.y) - p.y) * (p.waterCamera?.amount ?? 0)
  const center = y - TUNING.height / 2 * (p.inverted ? -1 : 1)
  if (!challenge) {
    const zoom = Math.max(.45, Math.min(1.6, height / 760))
    return { zoom, x: p.x - width / zoom / 2,
      y: verticalCamera(height, zoom, center, levelHeight(level)) }
  }
  // At .42 the entire standing figure is only 26 CSS pixels high. A .6 floor
  // keeps its hands/feet legible on phones while retaining more approach view
  // than .65; normal desktop scales remain governed by the room and viewport.
  const zoom = Math.max(.6, Math.min(1.3, height / 850, width / Math.min(1800, level.width + 80)))
  const half = width / zoom / 2
  const leadLimit = Math.max(0, half - 72)
  const ahead = Math.max(-leadLimit, Math.min(leadLimit, lookAhead))
  const cameraX = level.width < half * 2 - 80 ? level.width / 2 : Math.max(half - 40, Math.min(level.width - half + 40, p.x + ahead))
  return { zoom, x: cameraX - half, y: verticalCamera(height, zoom, center, levelHeight(level)) }
}

/** Presentation state belongs to the view, so sampling a camera never changes
 * the player or advances the motor. Both renderers can use the returned view. */
export class GameCamera {
  private player?: Player
  private level?: JumpLevel
  private lookAhead = 0

  view(width: number, height: number, p: Player, level: JumpLevel, challenge: boolean, dt = 0) {
    if (p !== this.player || level !== this.level) {
      this.player = p; this.level = level; this.lookAhead = 0
    }
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
    return gameCamera(width, height, p, level, challenge, this.lookAhead)
  }
}
