// Steep slides.
import { anticipateSlideLanding } from '../athleteAnimation.ts'
import { clearBody } from '../athleteClearance.ts'
import { FOREARM, MIN_KNEE_OPENING, UPPER_ARM, add, armPose, lerp, mix, smooth, solve, solveNear } from '../athleteRig.ts'
import type { AthletePose, Leg } from '../athleteRig.ts'
import type { Limb, Point } from '../limbPose.ts'
import { FOOT_CONTACT, footPoint } from '../footwork.ts'
import { pointInside } from '../geometry.ts'
import { TUNING } from '../movementTuning.ts'
import { wallBraceArm } from './wallBracePose.ts'
import type { Player } from '../characterTypes.ts'

/** How far a sliding sole tilts its toes up, facing up a steep slope. */
const MAX_TOE_RISE = .6

export function wallBraceSharesSlide(p: Player) {
  const s = p.sliding!, brace = p.wallBrace
  // A canted wall can also report a downhill slip. Its loaded palms keep
  // their wall targets as gravity changes sign. A separate slope in a narrow
  // gap still owns its ordinary balance arms.
  return !!brace?.normal && brace.normal[0] * Math.sin(s.angle) - brace.normal[1] * Math.cos(s.angle) > .999
    && Math.abs((s.x - brace.wallX) * brace.normal[0] + (s.y - (brace.wallY ?? p.y)) * brace.normal[1]) < .2
}

/**
 * How fully a canted wall brace and the slip lean the same way, from 0 to 1, so the brace's palms belong to
 * this slide rather than to a separate wall across a narrow gap. Sliding past a corner, the slip's contact
 * leaves the brace's face before the brace moves on to the next one, or the robot slides off the foot of the
 * face while its palms are still on it; only a contact well away from the face rules it out. The palms find
 * the actual face themselves (see palmWall).
 */
function braceShare(p: Player) {
  const s = p.sliding!, brace = p.wallBrace
  if (!brace?.normal) return 0
  const agreement = brace.normal[0] * Math.sin(s.angle) - brace.normal[1] * Math.cos(s.angle)
  const gap = Math.abs((s.x - brace.wallX) * brace.normal[0] + (s.y - (brace.wallY ?? p.y)) * brace.normal[1])
  return smooth((agreement - .94) / .05) * smooth((24 - gap) / 12)
}

/**
 * Where the face a sliding palm reaches for actually is, at the palm's height, in the robot's own frame: near
 * the brace's face, which can run on past a corner into the wall or out into the air. Null where there is no
 * face within reach of that line, as above the top of a short one.
 */
function palmWall(p: Player, y: number): number | null {
  const brace = p.wallBrace!, slope = -brace.normal![1] / brace.normal![0] * p.facing
  const line = (brace.wallX - p.x) * p.facing + slope * (p.y + y - (brace.wallY ?? p.y))
  const solid = (local: number) => !!p.terrain?.some(b => pointInside(b, p.x + local * p.facing, p.y + y))
  let open = line - 6, closed = line + 3
  if (solid(open) || !solid(closed)) return null
  for (let i = 0; i < 12; i++) { const mid = (open + closed) / 2; if (solid(mid)) closed = mid; else open = mid }
  return (open + closed) / 2
}

/** Keep weight over staggered feet, with restrained slow slips and fast counterbalance. */
export function slidingPose(p: Player, free: AthletePose): AthletePose {
  const s = p.sliding!, brace = wallBraceSharesSlide(p) ? p.wallBrace : null
  // A weak field can reverse a tiny slip on every bob. Retain the relaxed
  // wall brace instead of straightening the body over a nearly vertical sole
  // contact. Ordinary gravity keeps the full downhill balance and landing rig.
  const floating = smooth((1 - Math.abs(p.gravity ?? TUNING.gravity) / TUNING.gravity) / .4)
  const weight = smooth(s.amount) * (1 - (brace ? smooth(brace.amount ?? Math.max(...brace.hands, ...brace.feet)) * floating : 0))
  if (!weight) return free
  const landing = anticipateSlideLanding(p), supported = p.grounded && !s.active
  const poseAngle = supported ? p.groundAngle : landing?.angle ?? s.angle
  const tx = Math.cos(poseAngle), ty = Math.sin(poseAngle), nx = ty, ny = -tx
  const velocity = s.balanceSpeed ?? p.vx * tx + p.vy * ty, speed = smooth(Math.abs(velocity) / 450)
  const balance = Math.tanh(velocity / 150) * p.facing, correction = Math.sin(s.time * 5.5) * speed
  // Once the slip lets go, as falling off the foot of a face, its last contact stays behind on the face. The
  // fading pose falls with the body instead, never more than a few units from it, so it cannot hang up there
  // and then snap down on landing.
  const released = !s.active && !supported && !landing
  const x = supported ? p.x : landing?.x ?? (released ? p.x + Math.max(-18, Math.min(18, s.x - p.x)) : s.x)
  const y = supported ? p.y : landing?.y ?? (released ? p.y + Math.max(-6, Math.min(6, s.y - p.y)) : s.y)
  const at = (along: number, above: number): Point => [(x + tx * along + nx * above - p.x) * p.facing, y + ty * along + ny * above - p.y]
  // Facing up a steep slope, as against a canted wall, the knees can only bend toward it. The hips sit back
  // from it, the feet come together, and the soles tilt up no further than the ankles allow, the toes
  // against the slope, so neither knee folds backward to fit a sole laid flat along the face.
  const facingUp = -Math.sign(tx * ty) === p.facing ? 1 : 0, upslope = facingUp * smooth((Math.abs(poseAngle) - .7) / .35)
  // A sole tilted less steeply than the slope rests on its toes: the ankle rises until the lowest point of the
  // sole meets the face, as a sole laid along it rests at 2.8.
  const soleAngle = lerp(poseAngle * p.facing, Math.max(poseAngle * p.facing, -MAX_TOE_RISE), upslope)
  const lowest = (angle: number) => Math.min(...FOOT_CONTACT.map(point => { const q = footPoint(point, angle, 0); return q[0] * nx * p.facing + q[1] * ny }))
  const ankle = 2.8 + lowest(poseAngle * p.facing) - lowest(soleAngle)
  const spread = (2.5 + speed * 4) * (1 - .6 * upslope), center = at(0, 2.8)
  const front = at((spread + correction * .6) * p.facing, ankle), back = at(-(spread - correction * .6) * p.facing, ankle)
  const away = 9 * upslope
  const hipTarget: Point = [center[0] - balance * 2 + nx * p.facing * away, center[1] - 29 + speed * 2 + ny * away]
  // Fit both legs before placing the torso, instead of pulling a foot off the
  // slope or rotating the entire person to match its angle.
  for (const foot of [front, back]) {
    const reach = 28.5 - speed, rise = Math.sqrt(Math.max(0, reach ** 2 - (foot[0] - hipTarget[0]) ** 2))
    hipTarget[1] = Math.max(hipTarget[1], foot[1] - rise - 1)
  }
  const effort = smooth((Math.abs(velocity) - 130) / 420)
  const lean = -balance * (1.5 + speed + effort * 3) + correction * .4
  // A nearly vertical slip can blend over a wall brace. Its balance target
  // puts the torso over the feet, which can pull the head through that face.
  // Clear the blended trunk before solving limbs, so palms and feet keep
  // their own targets and the visual correction never moves the motor hull.
  const { hip, waist, shoulder, head } = clearBody(p, { ...free,
    hip: mix(free.hip, hipTarget, weight), waist: mix(free.waist, add(hipTarget, [lean * .3, -6.5]), weight),
    shoulder: mix(free.shoulder, add(hipTarget, [lean, -16.4]), weight),
    head: mix(free.head, add(hipTarget, [lean + .45 - balance * effort * .8, -23.7]), weight),
  }).pose
  const leg = (original: Leg, foot: Point): Leg => {
    const target = mix(original.end, foot, weight), origin = at(0, 0)
    const above = (target[0] - origin[0]) * nx * p.facing + (target[1] - origin[1]) * ny
    // The sliding contact plane belongs to this blend, too. Actual terrain
    // clearance is applied to the finished feet below; a faint slip must not
    // project them fully onto a plane extending beyond a round obstacle.
    if (above < 2.8) { target[0] += nx * p.facing * (2.8 - above) * weight; target[1] += ny * (2.8 - above) * weight }
    const limb = solve(add(hip, [0, 1]), target, 15, 14.5, -1, MIN_KNEE_OPENING)
    // A settled sliding sole stays on its plane while moving along it.
    // Keep planted false so turns can blend the ankle instead of pinning it.
    return { ...limb, footAngle: lerp(original.footAngle, soleAngle, weight), toeAngle: original.toeAngle * (1 - weight), footFacing: 1, planted: false, slideContact: weight === 1 }
  }
  const armRoot = add(shoulder, [0, .7])
  const frontArm = armPose(armRoot, .08 + speed * .16 + effort * .32 + correction * .015, .2 + speed * .55 + effort * .9)
  const backArm = armPose(armRoot, -.12 - speed * .18 - effort * .18 + correction * .02, .14 + speed * .1 + effort * .72)
  // Sliding down a canted wall, the palms stay on the face wherever it is there at their height, as long as
  // the brace holds; the brace's own hand contacts lapse for a moment at each corner of the face.
  const share = braceShare(p)
  const arm = (original: Limb, relaxed: Limb, index: number) => {
    const target = mix(original.end, relaxed.end, weight)
    if (!share) return solve(armRoot, target, UPPER_ARM, FOREARM, 1)
    // A faint slip retains the outgoing elbow's depth and bend plane, including
    // a hand that is still reaching for its first contact.
    const balanced = solveNear({ ...original, root: armRoot,
      joint: add(armRoot, [original.joint[0] - original.root[0], original.joint[1] - original.root[1]]),
      endDepth: (original.endDepth ?? 0) * (1 - weight) }, target, UPPER_ARM, FOREARM)
    if (original.hand) balanced.hand = add(balanced.end, [original.hand[0] - original.end[0], original.hand[1] - original.end[1]])
    // Keep palms on their face while the sliding torso changes height. A hand
    // can travel along the wall to stay within reach of the moving shoulder.
    const y = lerp(original.end[1], armRoot[1] - 12 - index * 2, weight), face = palmWall(p, y)
    const contact = Math.max(p.wallBrace!.hands[index], face === null ? 0 : p.wallBrace!.amount ?? 0) * share
    return wallBraceArm(p, shoulder, balanced, contact, y, face ?? undefined)
  }
  return { hip, waist, shoulder, head, frontLeg: leg(free.frontLeg, front), backLeg: leg(free.backLeg, back),
    frontArm: arm(free.frontArm, frontArm, 0), backArm: arm(free.backArm, backArm, 1) }
}
