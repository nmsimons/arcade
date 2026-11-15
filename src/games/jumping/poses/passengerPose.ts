// The bus passenger, seen through the rear window: it turns its back to us and sits on the back seat.
// Poses are in the body's own units with the floor at y = 0, like the standing rig.
import { FOREARM, SHIN, THIGH, UPPER_ARM, add, smooth, transferPose } from '../athleteRig.ts'
import type { AthletePose, Leg } from '../athleteRig.ts'
import { limbOnBend, limbReach } from '../limbPose.ts'
import type { Limb, Point } from '../limbPose.ts'

/** How far each side's shoulder socket, hand, hip socket and foot sit from the spine seen from behind. */
const SHOULDER_SPREAD = 3.9, HAND_SPREAD = 5.2, HIP_SPREAD = 2.7, FOOT_SPREAD = 3.3
/** Ankle height above the floor, as the standing rig has it. */
const ANKLE = 2.8
// The standing rig's torso: the waist, shoulder and head above the hip.
const WAIST = 6.5, CHEST = 10.1, NECK = 7.3

// Positive depth points away from the camera, the way the passenger faces.
const arm = (shoulder: Point, side: number, hand: Point, handDepth: number): Limb => {
  const root = add(shoulder, [side * SHOULDER_SPREAD, .7])
  // The elbows hang back toward us and a little out, as the forearms reach forward.
  return limbOnBend(limbReach(root, hand, UPPER_ARM, FOREARM, handDepth), [side * .35, 0, -1])
}
const leg = (hip: Point, side: number, foot: Point, footDepth: number): Leg => {
  const root = add(hip, [side * HIP_SPREAD, 1])
  // Knees bend forward, away from us; a seated knee points straight ahead.
  return { ...limbOnBend(limbReach(root, foot, THIGH, SHIN, footDepth), [side * .1, -.2, 1]),
    footAngle: 0, toeAngle: 0, footFacing: 1, planted: true, rear: 1 }
}
const torso = (hip: Point) => {
  const waist: Point = [hip[0], hip[1] - WAIST], shoulder: Point = [hip[0], hip[1] - WAIST - CHEST]
  return { hip, waist, shoulder, head: [hip[0], shoulder[1] - NECK] as Point }
}

/** Standing with its back to the camera, arms hanging: the standing rig turned a quarter. */
export function rearStandingPose(): AthletePose {
  const body = torso([0, -(THIGH + SHIN + ANKLE) + .5])
  const hand = (side: number): Point => [side * HAND_SPREAD, body.hip[1] + 2]
  const foot = (side: number): Point => [side * FOOT_SPREAD, -ANKLE]
  return { ...body,
    frontArm: arm(body.shoulder, -1, hand(-1), 2), backArm: arm(body.shoulder, 1, hand(1), 2),
    frontLeg: leg(body.hip, -1, foot(-1), .5), backLeg: leg(body.hip, 1, foot(1), .5), sideView: 0, backView: 1 }
}

/** Sat upright on a bench seat, thighs level and reaching away from us, hands resting on them. */
export function rearSeatedPose(): AthletePose {
  const body = torso([0, -(SHIN + ANKLE) - 1])
  const hand = (side: number): Point => [side * (HAND_SPREAD - .6), body.hip[1] - 1]
  const foot = (side: number): Point => [side * FOOT_SPREAD, -ANKLE]
  return { ...body,
    frontArm: arm(body.shoulder, -1, hand(-1), 9), backArm: arm(body.shoulder, 1, hand(1), 9),
    frontLeg: leg(body.hip, -1, foot(-1), THIGH - 1), backLeg: leg(body.hip, 1, foot(1), THIGH - 1), sideView: 0, backView: 1 }
}

const standing = rearStandingPose(), seated = rearSeatedPose()

/**
 * From the side-on walking pose, turn the back to the camera (`turn`), then sit (`sit`), both 0 to 1.
 * `settle` lowers the upper body a little into the cushion, and `lag` lifts the head against the shoulders.
 */
export function busPassengerPose(walking: AthletePose, turn: number, sit: number, settle = 0, lag = 0): AthletePose {
  // The turn carries the elbows and knees around through depth rather than across the body.
  let pose: AthletePose = { ...turn >= 1 ? standing : transferPose(walking, standing, [0, 0], smooth(turn), [0, 0], 0, true, 0,
    { depth: 3, kneeOpening: 0, footTurn: true }), sideView: 1 - smooth(turn) }
  if (sit > 0) pose = { ...transferPose(pose, seated, [0, 0], smooth(sit)), sideView: 0 }
  if (!settle && !lag) return pose
  // Only the upper body gives: the seat holds the hips and the floor the feet.
  const down = (point: Point, amount: number): Point => [point[0], point[1] + amount]
  const sag = (limb: Limb, amount: number): Limb => ({ ...limb, ...limbOnBend(
    limbReach(down(limb.root, amount), limb.end, UPPER_ARM, FOREARM, limb.endDepth ?? 0), [Math.sign(limb.root[0] - pose.shoulder[0]) * .35, 0, -1]) })
  return { ...pose, waist: down(pose.waist, settle * .5), shoulder: down(pose.shoulder, settle),
    head: down(pose.head, settle - lag), frontArm: sag(pose.frontArm, settle), backArm: sag(pose.backArm, settle) }
}
