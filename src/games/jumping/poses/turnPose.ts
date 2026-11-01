// Blends for turning while pushing or reaching.
import { bodyIntrusion, clearBody } from '../athleteClearance.ts'
import { FOREARM, HEAD_RADIUS, UPPER_ARM, add, lerp, mix, mixAngle, solve, solveNear } from '../athleteRig.ts'
import type { AthletePose } from '../athleteRig.ts'
import type { Point } from '../limbPose.ts'
import type { Player } from '../characterTypes.ts'

/** Release/reach through a fixed-length trunk, rather than collapsing opposite
 * chest positions. The current foot motor still owns both planted ankles. */
export function transferReachingPushTurn(p: Player, pose: AthletePose, from: AthletePose, target: AthletePose, t: number) {
  const pitch = (a: Point, b: Point) => Math.atan2(b[0] - a[0], a[1] - b[1])
  const pelvis = mixAngle(pitch(from.hip, from.waist), pitch(target.hip, target.waist), t)
  const chest = mixAngle(pitch(from.waist, from.shoulder), pitch(target.waist, target.shoulder), t)
  const neck = mixAngle(pitch(from.shoulder, from.head), pitch(target.shoulder, target.head), t)
  const neckLength = lerp(Math.hypot(from.head[0] - from.shoulder[0], from.head[1] - from.shoulder[1]),
    Math.hypot(target.head[0] - target.shoulder[0], target.head[1] - target.shoulder[1]), t)
  pose.waist = add(pose.hip, [Math.sin(pelvis) * 6.5, -Math.cos(pelvis) * 6.5])
  pose.shoulder = add(pose.waist, [Math.sin(chest) * 10.1, -Math.cos(chest) * 10.1])
  pose.head = add(pose.shoulder, [Math.sin(neck) * neckLength, -Math.cos(neck) * neckLength])
  pose = clearBody(p, pose).pose
  for (const name of ['frontArm', 'backArm'] as const) {
    const arm = pose[name], solved = solveNear({ ...arm, root: add(pose.shoulder, [0, .7]) }, arm.end, UPPER_ARM, FOREARM)
    pose[name] = { ...solved, hand: arm.hand && add(arm.hand, [solved.end[0] - arm.end[0], solved.end[1] - arm.end[1]]) }
  }
  return pose
}

/** Incoming force keeps its palms immediately. Fit the shoulder to that reach,
 * then let the head turn at the neck instead of mirroring the outgoing brace. */
export function transferPushTurn(p: Player, pose: AthletePose, from: AthletePose, target: AthletePose, fraction: number, armReach = 18.7) {
  const shoulder: Point = [...pose.shoulder]
  for (let pass = 0; pass < 8; pass++) for (const arm of [target.frontArm, target.backArm]) {
    const vector: Point = [shoulder[0] - arm.end[0], shoulder[1] + .7 - arm.end[1]]
    const reach = Math.hypot(...vector)
    if (reach > armReach) {
      shoulder[0] = arm.end[0] + vector[0] * armReach / reach
      shoulder[1] = arm.end[1] + vector[1] * armReach / reach - .7
    }
  }
  // Alternate reachable palms with an unfolded torso before reconstructing
  // the waist. Linear joint interpolation can collapse an opposing chest.
  for (let pass = 0; pass < 16; pass++) {
    const dx = shoulder[0] - pose.hip[0], dy = shoulder[1] - pose.hip[1], length = Math.hypot(dx,dy)
    if (length < 12) shoulder[1] = pose.hip[1] - Math.sqrt(Math.max(0, 12 ** 2 - dx ** 2))
    for (const arm of [target.frontArm,target.backArm]) {
      const dx = shoulder[0] - arm.end[0], dy = shoulder[1] + .7 - arm.end[1], reach = Math.hypot(dx,dy)
      if (reach > armReach) { shoulder[0] = arm.end[0] + dx * armReach / reach; shoulder[1] = arm.end[1] + dy * armReach / reach - .7 }
    }
  }
  const dx = shoulder[0] - pose.hip[0], dy = shoulder[1] - pose.hip[1], span = Math.hypot(dx,dy)
  if (span < 12) pose.hip[1] = shoulder[1] + Math.sqrt(Math.max(0, 12 ** 2 - dx ** 2))
  if (span > 16.58) { pose.hip[0] = shoulder[0] - dx * 16.58 / span; pose.hip[1] = shoulder[1] - dy * 16.58 / span }
  // Fitting an incoming palm can raise the pelvis beyond a loaded leg's reach.
  // Keep the actual ankles reachable while the shoulder and torso meet those
  // wrists; adjusting only the final leg would pull its planted shoe upward.
  for (let pass = 0; pass < 24; pass++) {
    for (const name of ['frontLeg','backLeg'] as const) if (target[name].planted) {
      const end = target[name].end, dx = pose.hip[0] - end[0], dy = pose.hip[1] + 1 - end[1], reach = Math.hypot(dx,dy)
      if (reach > 29.3) { pose.hip[0] = end[0] + dx * 29.3 / reach; pose.hip[1] = end[1] + dy * 29.3 / reach - 1 }
    }
    const dx = shoulder[0] - pose.hip[0], dy = shoulder[1] - pose.hip[1], span = Math.hypot(dx,dy)
    if (span > 16.58) { shoulder[0] = pose.hip[0] + dx * 16.58 / span; shoulder[1] = pose.hip[1] + dy * 16.58 / span }
    for (const arm of [target.frontArm,target.backArm]) {
      const dx = shoulder[0] - arm.end[0], dy = shoulder[1] + .7 - arm.end[1], reach = Math.hypot(dx,dy)
      if (reach > armReach) { shoulder[0] = arm.end[0] + dx * armReach / reach; shoulder[1] = arm.end[1] + dy * armReach / reach - .7 }
    }
  }
  const trunk = solve(pose.hip,shoulder,6.5,10.1,1), alternative = solve(pose.hip,shoulder,6.5,10.1,-1)
  const distance = (point: Point) => Math.hypot(point[0] - pose.waist[0], point[1] - pose.waist[1])
  pose.waist = distance(trunk.joint) < distance(alternative.joint) ? trunk.joint : alternative.joint
  const head = mix(from.head, target.head, fraction)
  const neckLength = (a: AthletePose) => Math.hypot(a.head[0] - a.shoulder[0], a.head[1] - a.shoulder[1])
  const neck = lerp(neckLength(from), neckLength(target), fraction)
  const vector: Point = [head[0] - shoulder[0], head[1] - shoulder[1]]
  const length = Math.hypot(...vector) || 1
  pose.shoulder = shoulder
  pose.head = add(shoulder, [vector[0] * neck / length, vector[1] * neck / length])
  // Fit the interpolated pelvis to the current ankle before resolving bones.
  for (const name of ['frontLeg', 'backLeg'] as const) {
    pose[name] = { ...pose[name], ...solveNear({ ...pose[name], root: add(pose.hip, [0, 1]) }, target[name].end, 15, 14.5) }
  }
  for (const name of ['frontArm', 'backArm'] as const) {
    const arm = target[name]
    pose[name] = { ...arm, ...solveNear({ ...arm, root: add(shoulder, [0, .7]) }, arm.end, UPPER_ARM, FOREARM) }
  }
  // A crowded transfer can look back only as far as the actual head clearance.
  for (let pass = 0; pass < 8; pass++) {
    const intrusion = bodyIntrusion(p, pose.head, HEAD_RADIUS)
    if (!intrusion) break
    pose.head = add(pose.head, [intrusion.x, intrusion.y])
  }
  return pose
}
