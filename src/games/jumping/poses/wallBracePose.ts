// Wall braces.
import { handGeometry, pushPalmFrame } from '../androidHand.ts'
import { athletePose } from '../athletePose.ts'
import { FOREARM, UPPER_ARM, add, lerp, mix, mixAngle, reachingBend, smooth, solveLeg, solveNear } from '../athleteRig.ts'
import type { AthletePose, Leg } from '../athleteRig.ts'
import { FOOT_CONTACT, footPoint } from '../footwork.ts'
import { limbOnBend, limbReach } from '../limbPose.ts'
import type { Limb, Point } from '../limbPose.ts'
import { TUNING } from '../movementTuning.ts'
import { gaitPose } from '../gait.ts'
import type { Player } from '../characterTypes.ts'

export function wallBraceArm(p: Player, shoulder: Point, limb: Limb, weight: number, y: number, wallX?: number): Limb {
  const brace = p.wallBrace!, slope = brace.normal ? -brace.normal[1] / brace.normal[0] * p.facing : 0
  // The palm meets the brace's face, or the actual face found at its height (see slidingPose).
  const wall = wallX ?? ((brace.wallX - p.x) * p.facing + slope * (p.y + y - (brace.wallY ?? p.y)))
  const contact = smooth(weight), normal: Point = [-1 / Math.hypot(1, slope), slope / Math.hypot(1, slope)]
  const root = add(shoulder, [0, .7]), frame = pushPalmFrame([wall, y], normal), wrist = frame.wrist
  // A cleared airborne elbow can cross the angular branch cut while the
  // torso leans in. Carry its bend around the wrist through depth, rather
  // than reversing the forearm's interpolated rotation halfway to the wall.
  // Prefer the air side with room in depth when the shoulder nears the wrist.
  const target = solveNear({ root, end: wrist, joint: add(root, [normal[0] * 6, 8 + normal[1] * 6]),
    jointDepth: 6, endDepth: 0 }, wrist, UPPER_ARM, FOREARM)
  const end = mix(add(root, [limb.end[0] - limb.root[0], limb.end[1] - limb.root[1]]), target.end, contact)
  const endDepth = (limb.endDepth ?? 0) * (1 - contact) + Math.sin(Math.PI * contact) * 3
  const reach = limbReach(root, end, UPPER_ARM, FOREARM, endDepth)
  const solved = limbOnBend(reach, reachingBend(limb, target, contact, reach.axis, 3))
  const palm = handGeometry(limb)
  return { ...solved, hand: add(solved.end, mix([palm.palm[0] - limb.end[0], palm.palm[1] - limb.end[1]],
    [frame.palm[0] - wrist[0], frame.palm[1] - wrist[1]], contact)),
    handAngle: mixAngle(palm.angle, frame.angle, contact), handOpen: lerp(limb.handOpen ?? 0, 1, contact) }
}

/** Keep the ordinary pushing silhouette, with the legs reaching diagonally to the wall. */
export function wallBracePose(p: Player, free: AthletePose): AthletePose {
  if (p.grounded) return free
  const brace = p.wallBrace!, slope = brace.normal ? -brace.normal[1] / brace.normal[0] * p.facing : 0
  const wallAt = (y: number) => (brace.wallX - p.x) * p.facing + slope * (p.y + y - (brace.wallY ?? p.y))
  const wall = Math.min(wallAt(-43), wallAt(-TUNING.height)), wallAngle = -Math.PI / 2 - Math.atan(slope)
  const amount = smooth(brace.amount ?? Math.max(...brace.hands, ...brace.feet))
  // Use the same body and arm rig as a settled ground push, including its distance
  // from the wall. The physical capsule stays at the collision boundary.
  const pushDistance = 25.5
  const pushing = athletePose({ ...p, x: p.x + p.facing * (wall - pushDistance),
    grounded: true, vx: 0, vy: 0, wallBrace: null, sliding: null, anim: { ...p.anim, footwork: null, gait: gaitPose(0) },
    crouch: 0, crouching: false, reach: 0, landing: 0, groundAngle: 0,
    pushing: { wallX: p.x + p.facing * wall, direction: p.facing, amount: 1, effort: 1 } })
  const offset: Point = [wall - pushDistance, 0]
  const lean = .2
  const towardWall = (point: Point): Point => {
    const x = point[0] - pushing.hip[0], y = point[1] - pushing.hip[1]
    return add(pushing.hip, [x * Math.cos(lean) - y * Math.sin(lean) + offset[0], x * Math.sin(lean) + y * Math.cos(lean)])
  }
  const hip = mix(free.hip, add(pushing.hip, offset), amount), waist = mix(free.waist, towardWall(pushing.waist), amount)
  const shoulder = mix(free.shoulder, towardWall(pushing.shoulder), amount), head = mix(free.head, towardWall(pushing.head), amount)
  const leg = (limb: Leg, weight: number, y: number): Leg => {
    const contact = smooth(weight)
    const target = mix(limb.end, [wallAt(y) - 2.8, y], contact)
    const root = add(hip, [0, 1])
    const desired = lerp(limb.footAngle, wallAngle, contact)
    let result = solveLeg(root, target, desired, false)
    // Use the normal forward knee bend throughout the reach. Let the ankle flex
    // within its usual limits, then place the contacting part of the foot at the wall.
    for (let i = 0; i < 12; i++) {
      const reach = Math.max(...FOOT_CONTACT.map(point => {
        const [x, y] = footPoint(point, result.footAngle, result.toeAngle); return x - slope * y
      }))
      const limit = wallAt(result.end[1]) - reach
      target[0] = Math.min(limit, lerp(limb.end[0], limit, contact))
      result = solveLeg(root, target, desired, false)
    }
    return result
  }
  return { hip, waist, shoulder, head,
    frontArm: wallBraceArm(p, shoulder, free.frontArm, brace.hands[0], -43), backArm: wallBraceArm(p, shoulder, free.backArm, brace.hands[1], -46),
    frontLeg: leg(free.frontLeg, brace.feet[0], -13), backLeg: leg(free.backLeg, brace.feet[1], -17) }
}
