import { LEDGE_CLIMB_TIME } from './ledge.ts'

export const TUNING = {
  runSpeed: 410, walkSpeed: 125, acceleration: 2000, airAcceleration: 300,
  braking: 2800, gravity: 1550, jumpSpeed: 500, directedJumpSpeed: 800,
  wallJumpSpeed: 500, wallJumpPush: 300, wallJumpControlTime: .12,
  coyoteTime: .1, jumpBuffer: .13, width: 24, height: 62, crouchHeight: 40, hangReach: 74,
  climbTime: LEDGE_CLIMB_TIME,
  freeFallTime: .9, freeFallBlendTime: .28, fallRecoveryTime: .95,
  zeroGravityDrag: .6,
} as const

/** Stick deflection sets strength; horizontal momentum separately sets range. */
export function jumpSpeed(strength: number) {
  return TUNING.jumpSpeed + (TUNING.directedJumpSpeed - TUNING.jumpSpeed) * Math.max(0, Math.min(1, strength))
}
