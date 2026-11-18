import { LEDGE_CLIMB_TIME } from './ledge.ts'

export const TUNING = {
  runSpeed: 410, walkSpeed: 125,
  // The crouch shuffle's 14-unit, .24 s step covers about 58 units per second.
  // Faster crouching only quickens that same short step into a frantic patter.
  crouchSpeed: 60,
  acceleration: 2000, airAcceleration: 300,
  braking: 2800, gravity: 1550, jumpSpeed: 400, directedJumpSpeed: 800, jumpHoldTime: .18,
  wallJumpSpeed: 500, wallJumpHeldSpeed: 600, wallJumpPush: 300, wallJumpControlTime: .12,
  wallJumpMaxCant: Math.PI / 6,
  coyoteTime: .1, jumpBuffer: .13, width: 24, height: 62, crouchHeight: 40, hangReach: 74,
  climbTime: LEDGE_CLIMB_TIME,
  freeFallTime: .9, freeFallBlendTime: .28, fallRecoveryTime: .95,
  // Air resists a weightless body: lightly at a drift, more as it speeds up (`zeroGravityAirDrag` per unit of
  // speed), so a slow float carries on and a fast one settles. The boots' thrust keeps accelerating against it,
  // up to the speed where the two balance (about 520 here).
  zeroGravityDrag: .15, zeroGravityAirDrag: .0009,
  // Weightless booster boots: a gentle thrust in any held direction up to a slow cruise, and a push-off from any
  // surface the body touches. Both only apply without weight (gravity.ts isWeightless) and out of water.
  zeroGravityThrust: 320, zeroGravityPushOff: 500,
  // Drifting onto a surface: slower than `zeroGravityStick` lands and stays; faster rebounds at `zeroGravityRebound` of
  // its speed. The body rolls feet-first toward a surface it is coasting onto, taking between `zeroGravityRollMin`
  // and `zeroGravityRollMax` seconds and timed to finish with `zeroGravityRollLead` seconds of travel left.
  zeroGravityStick: 170, zeroGravityRebound: .35, zeroGravityRollMin: .5, zeroGravityRollMax: .9, zeroGravityRollLead: .3,
  // Thrust against the drift brakes this many times harder. With no thrust held, the boots trim the last of a slow
  // drift (extra drag up to `zeroGravityRestDrag` per second, fading in below `zeroGravityRestSpeed`) with small puffs,
  // gently enough that a nudge still carries the body to a nearby surface.
  zeroGravityBrake: 2, zeroGravityRestDrag: .5, zeroGravityRestSpeed: 50,
  // A rebound lands into a crouch: the hit drives the legs' spring, which folds them at the arrival speed and slows
  // them to the bottom of the fold this many seconds later, where they push off.
  zeroGravityAbsorbTime: .12,
  /** Seconds weightlessness must last before the boots, push-offs, rebounds and feet-first turns take over. A body
   * crossing a flipping field's edge is weightless for a step or two and keeps ordinary flight. */
  zeroGravitySettle: .04,
  /** Seconds for the feet's hold on a surface to take up the drift a slow weightless landing brings (time constant). */
  zeroGravityGrip: .05,
  swimSpeed: 85, diveSpeed: 100, swimHorizontalSpeed: 110, swimHorizontalAcceleration: 160, swimBlendTime: .65, swimStrokeDistance: 130, swimAcceleration: 4000, waterRiseDrag: 5.2,
  swimSteeringAcceleration: 260, swimResponse: 7, swimCoastResponse: 4, swimPitchTime: .42,
  waterMomentumDrag: 4, waterPropDrag: 5, waterSpinDrag: 6,
  waterBobHeight: 2.25, waterBobPeriod: 3.8,
} as const

/** Preset gesture strength; held buttons build the same bounded lift after takeoff. */
export function jumpSpeed(strength: number) {
  return TUNING.jumpSpeed + (TUNING.directedJumpSpeed - TUNING.jumpSpeed) * Math.max(0, Math.min(1, strength))
}

/** Coast a weightless body against the air (TUNING.zeroGravityDrag, zeroGravityAirDrag and, without thrust, the slow
 * settle zeroGravityRestDrag), with `push` (px/s², negative to brake) along its travel, in 1/60 s steps until
 * `done(time, distance, speed)` says to stop. */
function coast(speed: number, push: number, done: (time: number, distance: number, speed: number) => boolean) {
  const dt = 1 / 60
  let time = 0, distance = 0
  while (!done(time, distance, speed) && (speed > .5 || push > 0) && time < 12) {
    const rest = push ? 0 : TUNING.zeroGravityRestDrag * Math.max(0, 1 - speed / TUNING.zeroGravityRestSpeed)
    const next = Math.max(0, speed * Math.exp(-(TUNING.zeroGravityDrag + TUNING.zeroGravityAirDrag * speed + rest) * dt) + push * dt)
    distance += (speed + next) / 2 * dt; speed = next; time += dt
  }
  return { time, distance, speed }
}
/** Seconds a weightless body at `speed` takes to cover `distance`, pushed along by `push`, or Infinity if it stops first. */
export function weightlessArrivalTime(distance: number, speed: number, push = 0) {
  if (distance <= 0) return 0
  const end = coast(speed, push, (_, travelled) => travelled >= distance)
  return end.distance >= distance ? end.time : Infinity
}
/** How far a weightless body coasting at `speed` travels in `time` seconds against the air. */
export function weightlessCoastDistance(speed: number, time: number) {
  return coast(speed, 0, elapsed => elapsed >= time - 1e-9).distance
}
