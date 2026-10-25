import { cancelJumpInput } from './model.ts'
import type { Player } from './model.ts'
import type { Vec } from './geometry.ts'
import { startImpactRagdoll } from './athlete.ts'

export const REPULSOR_BOT_IMPULSE = 1100

/** Release grips and add velocity; the normal swept motor resolves the result. */
export function repulsePlayer(actor: Player, direction: Vec) {
  if (Math.hypot(...direction) * REPULSOR_BOT_IMPULSE >= 750 && !actor.waterMotion) {
    startImpactRagdoll(actor, [direction[0] * REPULSOR_BOT_IMPULSE, direction[1] * REPULSOR_BOT_IMPULSE], 'repulsor')
  }
  const gripping = !!(actor.climbing || actor.hang || actor.mantle)
  actor.climbing = null; actor.hang = null; actor.mantle = null; actor.releaseTurn = undefined
  actor.wallJump = null; actor.wallBrace = null; actor.jumpLift = null; actor.pushing = null
  actor.dryTurn = null; actor.freeFall = null; actor.stepIntent = null; actor.shove = undefined
  actor.grabCooldown = .4; actor.coyote = 0; cancelJumpInput(actor)
  if (gripping || direction[1] * (actor.inverted ? -1 : 1) < -.1) actor.grounded = false
  actor.vx = Math.max(-1300, Math.min(1300, actor.vx + direction[0] * REPULSOR_BOT_IMPULSE))
  actor.vy = Math.max(-1300, Math.min(1300, actor.vy + direction[1] * REPULSOR_BOT_IMPULSE))
}
