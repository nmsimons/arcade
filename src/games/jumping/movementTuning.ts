import { LEDGE_CLIMB_TIME } from './ledge.ts'

export const TUNING = {
  runSpeed: 410, walkSpeed: 125, acceleration: 2000, airAcceleration: 300,
  braking: 2800, gravity: 1550, jumpSpeed: 400, directedJumpSpeed: 800, jumpHoldTime: .18,
  wallJumpSpeed: 500, wallJumpHeldSpeed: 600, wallJumpPush: 300, wallJumpControlTime: .12,
  wallJumpMaxCant: Math.PI / 6,
  coyoteTime: .1, jumpBuffer: .13, width: 24, height: 62, crouchHeight: 40, hangReach: 74,
  climbTime: LEDGE_CLIMB_TIME,
  freeFallTime: .9, freeFallBlendTime: .28, fallRecoveryTime: .95,
  zeroGravityDrag: .6,
  swimSpeed: 85, diveSpeed: 100, swimHorizontalSpeed: 110, swimHorizontalAcceleration: 160, swimBlendTime: .65, swimStrokeDistance: 130, swimAcceleration: 4000, waterRiseDrag: 5.2,
  swimSteeringAcceleration: 260, swimResponse: 7, swimCoastResponse: 4, swimPitchTime: .42,
  waterMomentumDrag: 4, waterPropDrag: 5, waterSpinDrag: 6,
  waterBobHeight: 2.25, waterBobPeriod: 3.8,
} as const

/** Preset gesture strength; held buttons build the same bounded lift after takeoff. */
export function jumpSpeed(strength: number) {
  return TUNING.jumpSpeed + (TUNING.directedJumpSpeed - TUNING.jumpSpeed) * Math.max(0, Math.min(1, strength))
}
