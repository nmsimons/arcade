import type { Prop } from './challenge.ts'
import type { Platform } from './model.ts'
import { TUNING } from './model.ts'
import { groundAt } from './terrain.ts'
import { BOX_RESTING_ANGLE_TOLERANCE } from './propGeometry.ts'

/** Two flat contacts under the base distinguish a resting face from a balancing corner. */
export function flatBoxSupport(b: Prop, solids: readonly Platform[], allowRestingTilt = false) {
  const left = groundAt(solids, b.x - b.size * .4, b.y, .25)
  const right = groundAt(solids, b.x + b.size * .4, b.y, .25)
  if (!left || !right) return null
  // A grip tolerates the supporting crates' resting solver tilt. Squaring a
  // crate still requires horizontal supports, so it cannot open a contact gap
  // by flattening one layer independently of the rest of its stack.
  const flat = (surface: typeof left) => Math.abs(surface.angle)
    < (allowRestingTilt && surface.platform.looseProp ? BOX_RESTING_ANGLE_TOLERANCE : 1e-6)
  const heightTolerance = .001 + (allowRestingTilt && (left.platform.looseProp || right.platform.looseProp)
    ? b.size * .8 * BOX_RESTING_ANGLE_TOLERANCE : 0)
  return flat(left) && flat(right) && Math.abs(left.y - right.y) < heightTolerance ? left.y : null
}

export function canHangFromBox(b: Prop, solids: readonly Platform[]) {
  const flatAngle = Math.round(b.angle / (Math.PI / 2)) * (Math.PI / 2)
  return b.kind === 'box' && b.size >= TUNING.hangReach + 4 && b.grounded
    && Math.abs(b.angle - flatAngle) <= BOX_RESTING_ANGLE_TOLERANCE && Math.abs(b.angularVelocity) < .01
    && Math.abs(b.vy) < 2 && flatBoxSupport(b, solids, true) !== null
}
