// Hard limits on the presented rig (#106). Animation, contacts and clearance
// choose a pose; this is the last step before it is drawn, and it projects any
// pose that left the rig's envelope back inside it. See "Boundaries to preserve"
// in docs/jumping-physics.md.
import { FOREARM, SHIN, THIGH, UPPER_ARM } from './athleteRig.ts'
import type { AthletePose } from './athleteRig.ts'
import type { Limb } from './limbPose.ts'

/** No hinge closes tighter than this. A shin or forearm folded further would pass
 * through its upper bone; it matches the leg solver's deepest supported crouch. */
export const MIN_JOINT_OPENING = Math.PI / 12
/** Bone lengths hold to this; the solvers keep them exact. */
export const BONE_TOLERANCE = .05
/** The head rides its neck: never turned further than this from the torso's
 * line (waist to shoulder), forward or back. Turn poses mirror the whole body,
 * so the limit is the same both ways. */
export const MAX_NECK_ANGLE = 80 * Math.PI / 180
/** Shoulder to head centre. */
export const NECK_LENGTH: readonly [number, number] = [5.5, 9]

type Vec3 = [number, number, number]
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const length = (a: Vec3) => Math.hypot(...a)
const points = (limb: Limb): [Vec3, Vec3, Vec3] => [[limb.root[0], limb.root[1], 0],
  [limb.joint[0], limb.joint[1], limb.jointDepth ?? 0], [limb.end[0], limb.end[1], limb.endDepth ?? 0]]

/** The opening at a limb's hinge, in radians, measured in depth as well. */
export function jointOpening(limb: Limb): number {
  const [root, joint, end] = points(limb), upper = sub(root, joint), lower = sub(end, joint)
  const lengths = length(upper) * length(lower)
  return lengths > 1e-9 ? Math.acos(Math.max(-1, Math.min(1, dot(upper, lower) / lengths))) : Math.PI
}
export function boneLengths(limb: Limb): [number, number] {
  const [root, joint, end] = points(limb)
  return [length(sub(joint, root)), length(sub(end, joint))]
}

/** The head's turn from the torso's line, in radians; positive tips it toward local forward. */
export function neckAngle(pose: AthletePose): number {
  const torso = Math.atan2(pose.shoulder[1] - pose.waist[1], pose.shoulder[0] - pose.waist[0])
  const neck = Math.atan2(pose.head[1] - pose.shoulder[1], pose.head[0] - pose.shoulder[0])
  return Math.atan2(Math.sin(neck - torso), Math.cos(neck - torso))
}
const neckLength = (pose: AthletePose) => Math.hypot(pose.head[0] - pose.shoulder[0], pose.head[1] - pose.shoulder[1])

/** Every way a pose leaves the rig's envelope; empty for a valid pose. */
export function rigViolations(pose: AthletePose): string[] {
  const problems: string[] = []
  if (!finitePose(pose)) return ['non-finite']
  for (const [name, limb, upper, lower] of [['frontArm', pose.frontArm, UPPER_ARM, FOREARM], ['backArm', pose.backArm, UPPER_ARM, FOREARM],
    ['frontLeg', pose.frontLeg, THIGH, SHIN], ['backLeg', pose.backLeg, THIGH, SHIN]] as const) {
    const [a, b] = boneLengths(limb)
    if (Math.abs(a - upper) > BONE_TOLERANCE || Math.abs(b - lower) > BONE_TOLERANCE) problems.push(`${name} bone length`)
    if (jointOpening(limb) < MIN_JOINT_OPENING - 1e-6) problems.push(`${name} folded`)
  }
  if (Math.abs(neckAngle(pose)) > MAX_NECK_ANGLE + 1e-6) problems.push('neck turned')
  const neck = neckLength(pose)
  if (neck < NECK_LENGTH[0] - 1e-6 || neck > NECK_LENGTH[1] + 1e-6) problems.push('neck length')
  return problems
}

/** Reopen a folded hinge about its own bend plane. The root and joint stay put,
 * so the upper bone keeps its place; the hand or foot swings out just far enough. */
function reopen(limb: Limb): Limb {
  const opening = jointOpening(limb)
  if (opening >= MIN_JOINT_OPENING) return limb
  const [root, joint, end] = points(limb), upper = sub(root, joint), lower = sub(end, joint)
  const lowerLength = length(lower), axis = upper.map(n => n / (length(upper) || 1)) as Vec3
  // The lower bone's direction away from the upper bone, in their shared plane.
  let away = sub(lower, axis.map(n => n * dot(lower, axis)) as Vec3)
  if (length(away) < 1e-6) away = [-axis[1], axis[0], 0] // Fully folded: open within the picture plane.
  const across = away.map(n => n / length(away)) as Vec3
  const next = axis.map((n, i) => joint[i] + lowerLength * (Math.cos(MIN_JOINT_OPENING) * n + Math.sin(MIN_JOINT_OPENING) * across[i])) as Vec3
  const shift: [number, number] = [next[0] - end[0], next[1] - end[1]]
  return { ...limb, end: [next[0], next[1]], ...(limb.endDepth !== undefined || next[2] ? { endDepth: next[2] } : {}),
    ...(limb.hand ? { hand: [limb.hand[0] + shift[0], limb.hand[1] + shift[1]] as [number, number] } : {}) }
}

/** Swing the head about the shoulder back inside the neck's range, at a neck length within its own. */
function seatHead(pose: AthletePose): AthletePose {
  const angle = neckAngle(pose), neck = neckLength(pose)
  const turned = Math.abs(angle) > MAX_NECK_ANGLE, length = Math.max(NECK_LENGTH[0], Math.min(NECK_LENGTH[1], neck))
  if (!turned && length === neck) return pose
  const torso = Math.atan2(pose.shoulder[1] - pose.waist[1], pose.shoulder[0] - pose.waist[0])
  const direction = turned ? torso + Math.sign(angle) * MAX_NECK_ANGLE : Math.atan2(pose.head[1] - pose.shoulder[1], pose.head[0] - pose.shoulder[0])
  return { ...pose, head: [pose.shoulder[0] + Math.cos(direction) * length, pose.shoulder[1] + Math.sin(direction) * length] }
}

function finitePose(pose: AthletePose): boolean {
  const check = (value: unknown): boolean => typeof value === 'number' ? Number.isFinite(value)
    : Array.isArray(value) ? value.every(check) : value && typeof value === 'object' ? Object.values(value).every(check) : true
  return check(pose)
}

let corrections = 0
/** Poses the limits had to correct since the module loaded; diagnostics and tests read it. */
export const rigLimitCorrections = () => corrections

const lastValid = new WeakMap<object, AthletePose>()
/**
 * The pose as drawn: inside the rig's envelope. A folded knee or elbow reopens
 * to the minimum, and a head turned or stretched off its neck swings back onto
 * it; a pose with a non-finite value is replaced by the actor's last valid pose,
 * so a numerical failure can never reach the screen.
 */
export function withinRigLimits(actor: object, pose: AthletePose): AthletePose {
  if (!finitePose(pose)) {
    corrections++
    return lastValid.get(actor) ?? pose
  }
  const limbs = [pose.frontArm, pose.backArm, pose.frontLeg, pose.backLeg].map(reopen)
  const seated = seatHead(pose)
  const changed = seated !== pose || limbs.some((limb, i) => limb !== [pose.frontArm, pose.backArm, pose.frontLeg, pose.backLeg][i])
  const valid = changed ? { ...seated, frontArm: limbs[0], backArm: limbs[1], frontLeg: { ...pose.frontLeg, ...limbs[2] }, backLeg: { ...pose.backLeg, ...limbs[3] } } : pose
  if (changed) corrections++
  lastValid.set(actor, valid)
  return valid
}
