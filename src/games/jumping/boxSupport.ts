import type { Prop } from './challenge.ts'
import type { Platform } from './model.ts'
import { TUNING } from './model.ts'
import { groundAt } from './terrain.ts'
import { BOX_RESTING_ANGLE_TOLERANCE } from './propGeometry.ts'

/** Two flat contacts under the base distinguish a resting face from a balancing corner. */
export function flatBoxSupport(b: Prop, solids: readonly Platform[]) {
  const left = groundAt(solids, b.x - b.size * .4, b.y, .25)
  const right = groundAt(solids, b.x + b.size * .4, b.y, .25)
  return left && right && Math.abs(left.angle) < 1e-6 && Math.abs(right.angle) < 1e-6
    && Math.abs(left.y - right.y) < .001 ? left.y : null
}

export function canHangFromBox(b: Prop, solids: readonly Platform[]) {
  const flatAngle = Math.round(b.angle / (Math.PI / 2)) * (Math.PI / 2)
  return b.kind === 'box' && b.size >= TUNING.hangReach + 4 && b.grounded
    && Math.abs(b.angle - flatAngle) <= BOX_RESTING_ANGLE_TOLERANCE && Math.abs(b.angularVelocity) < .01
    && Math.abs(b.vy) < 2 && flatBoxSupport(b, solids) !== null
}
