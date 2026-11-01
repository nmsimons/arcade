// Steep slides.
import { anticipateSlideLanding } from '../athleteAnimation.ts'
import { clearBody } from '../athleteClearance.ts'
import { FOREARM, MIN_KNEE_OPENING, UPPER_ARM, add, armPose, lerp, mix, smooth, solve, solveNear } from '../athleteRig.ts'
import type { AthletePose, Leg } from '../athleteRig.ts'
import type { Limb, Point } from '../limbPose.ts'
import { TUNING } from '../movementTuning.ts'
import { wallBraceArm } from './wallBracePose.ts'
import type { Player } from '../characterTypes.ts'

export function wallBraceSharesSlide(p: Player) {
  const s = p.sliding!, brace = p.wallBrace
  // A canted wall can also report a downhill slip. Its loaded palms keep
  // their wall targets as gravity changes sign. A separate slope in a narrow
  // gap still owns its ordinary balance arms.
  return !!brace?.normal && brace.normal[0] * Math.sin(s.angle) - brace.normal[1] * Math.cos(s.angle) > .999
    && Math.abs((s.x - brace.wallX) * brace.normal[0] + (s.y - (brace.wallY ?? p.y)) * brace.normal[1]) < .2
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
  const x = supported ? p.x : landing?.x ?? s.x, y = supported ? p.y : landing?.y ?? s.y
  const at = (along: number, above: number): Point => [(x + tx * along + nx * above - p.x) * p.facing, y + ty * along + ny * above - p.y]
  const spread = 2.5 + speed * 4, center = at(0, 2.8)
  const front = at((spread + correction * .6) * p.facing, 2.8), back = at(-(spread - correction * .6) * p.facing, 2.8)
  const hipTarget: Point = [center[0] - balance * 2, center[1] - 29 + speed * 2]
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
    return { ...limb, footAngle: lerp(original.footAngle, poseAngle * p.facing, weight), toeAngle: original.toeAngle * (1 - weight), footFacing: 1, planted: false, slideContact: weight === 1 }
  }
  const armRoot = add(shoulder, [0, .7])
  const frontArm = armPose(armRoot, .08 + speed * .16 + effort * .32 + correction * .015, .2 + speed * .55 + effort * .9)
  const backArm = armPose(armRoot, -.12 - speed * .18 - effort * .18 + correction * .02, .14 + speed * .1 + effort * .72)
  const arm = (original: Limb, relaxed: Limb, index: number) => {
    const target = mix(original.end, relaxed.end, weight)
    if (!wallBraceSharesSlide(p)) return solve(armRoot, target, UPPER_ARM, FOREARM, 1)
    // A faint slip retains the outgoing elbow's depth and bend plane, including
    // a hand that is still reaching for its first contact.
    const balanced = solveNear({ ...original, root: armRoot,
      joint: add(armRoot, [original.joint[0] - original.root[0], original.joint[1] - original.root[1]]),
      endDepth: (original.endDepth ?? 0) * (1 - weight) }, target, UPPER_ARM, FOREARM)
    if (original.hand) balanced.hand = add(balanced.end, [original.hand[0] - original.end[0], original.hand[1] - original.end[1]])
    // Keep palms on their face while the sliding torso changes height. A hand
    // can travel along the wall to stay within reach of the moving shoulder.
    const y = lerp(original.end[1], armRoot[1] - 12 - index * 2, weight)
    return wallBraceArm(p, shoulder, balanced, p.wallBrace!.hands[index], y)
  }
  return { hip, waist, shoulder, head, frontLeg: leg(free.frontLeg, front), backLeg: leg(free.backLeg, back),
    frontArm: arm(free.frontArm, frontArm, 0), backArm: arm(free.backArm, backArm, 1) }
}
