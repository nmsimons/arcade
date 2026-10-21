import type { Player } from './model.ts'
import { climbGait } from './climbables.ts'
import { climbFrame, ladderMantleProgress, LEDGE_CATCH_TIME, LEDGE_CLIMB_TIME } from './ledge.ts'

/** The equipped right arm is the rear arm when facing left. Contact slots use
 * the same front/rear order as the rig, wall brace and climbing choreography. */
export function rightArmSupporting(p: Player): boolean {
  const hand = p.facing < 0 ? 1 : 0
  if (p.hang) return true
  if (p.mantle) {
    const m = p.mantle
    let progress = m.descending ? 1 - Math.max(0, (m.time - LEDGE_CATCH_TIME) / LEDGE_CLIMB_TIME) : m.time / LEDGE_CLIMB_TIME
    if (m.ladder) progress = ladderMantleProgress(m.time, m.ladder.entry)
    if (m.step) {
      const step = m.step, t = Math.min(1, m.time / step.duration)
      if (step.rise > 40.01 && !step.climbing) {
        const start = (74 - step.rise) / 100
        progress = start + (1 - start) * t
      } else {
        // stepUpPose uses the lip briefly above a 20-unit rise, and keeps the
        // incoming rope grip during its initial .18 phase of the transfer.
        return step.rise > 20 && t > 0 && t < .48 || !!step.climbing && t < .18
      }
    }
    const frame = climbFrame(progress, m.braced, m.slope, m.crouched, m.inset)
    return (hand ? frame.backRelease : frame.frontRelease) < .999
  }
  if (p.climbing) {
    const c = p.climbing
    // Catching, hanging, rappelling and gravity turns keep both rope grips.
    if (c.time < .16 || c.turn || c.hangBlend > .01 || c.wall || (c.wallBlend ?? 0) > .01) return true
    return climbGait(c.distance, c.rope?.definition.length, c.ladder ? c.ladder.bottom - c.ladder.top : undefined).hands[hand].planted
  }
  if (p.wallBrace?.active && p.wallBrace.hands[hand] > .01) return true
  if (p.contacts?.push?.hands && p.pushing?.palms?.[hand] && (p.pushing.load ?? 0) > .01) return true
  const motion = p.waterMotion
  if (motion?.ceiling && motion.ceiling.amount > .01 && motion.ceiling.load > 0 && motion.ceiling.hands[hand]) return true
  // The dive recovery plants the front palm; the other arm remains available.
  if (!hand && motion?.landing && !motion.landing.leaving && motion.landing.time < .54) return true
  const recovery = p.freeFall?.recovery
  return recovery != null && recovery >= .18 && recovery < .48
}

/** Keep the ordinary traversal/reach pose even when its hand is between grips.
 * An explicit, legal aim may use that free hand; passive carry never replaces it. */
export function rightArmAnimating(p: Player): boolean {
  return rightArmSupporting(p) || !!(p.climbing || p.hang || p.mantle || p.ledgeReach
    || p.pushing && Math.max(p.pushing.amount, p.pushing.ready ?? 0) > .001
    || p.wallBrace && p.wallBrace.hands[p.facing < 0 ? 1 : 0] > .001
    || p.waterMotion?.landing || p.waterMotion?.ceiling || p.releaseTurn || p.freeFall)
}
