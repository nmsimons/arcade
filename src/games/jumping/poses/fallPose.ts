// Long falls and their recovery.
import { clearAirborneFoot, clearBody, clearLimb } from '../athleteClearance.ts'
import { athletePose } from '../athletePose.ts'
import { FOREARM, MIN_KNEE_OPENING, UPPER_ARM, add, lerp, mix, rotatePose, smooth, solve, transferPose } from '../athleteRig.ts'
import type { AthletePose, Leg } from '../athleteRig.ts'
import { moveBody } from '../geometry.ts'
import type { Limb, Point } from '../limbPose.ts'
import { TUNING } from '../movementTuning.ts'
import { groundAt } from '../terrain.ts'
import type { Player } from '../characterTypes.ts'

/** A belly-first fall opens the legs behind the torso. Recovery plants the hands,
 * gathers the knees, then brings the feet underneath before standing. */
function fallFrame(p: Player, stage = 0): AthletePose {
  const hip: Point = stage === 0 ? [-7, -9] : stage === 1 ? [-5, -16] : [-4, -20]
  const pitch = stage === 0 ? Math.PI / 2 + .06 : stage === 1 ? 1.18 : .8
  const waist = add(hip, [Math.sin(pitch) * 6.5, -Math.cos(pitch) * 6.5])
  const shoulder = add(waist, [Math.sin(pitch) * 10.1, -Math.cos(pitch) * 10.1])
  const head = add(shoulder, stage === 0 ? [8, .2] : [4, -6.8])
  const armRoot = add(shoulder, [0, stage === 0 ? -.8 : .7]), legRoot = add(hip, [0, 1])
  // In sustained flight one arm opens for balance and the other folds toward
  // the chest. This is a braced fall, rather than a symmetrical diving pose.
  // On impact they settle into the existing hands-first recovery.
  const flight = stage === 0 ? (1 - smooth((p.freeFall?.recovery ?? 0) / .16)) * (1 - landingPreparation(p)) : 0
  const arm = (back: boolean) => solve(armRoot, stage === 0 ? mix([back ? 27 : 28, back ? -4.5 : -2.8], [back ? 13 : 25, back ? 3 : -4], flight)
    : stage === 1 ? [back ? 10 : 14, -2.8] : [back ? 7 : 11, -15], 10, 9, stage === 0 ? 1 : -1)
  const leg = (back: boolean): Leg => ({ ...solve(legRoot,
    stage === 0 ? [back ? -34 : -35, back ? -10 : -8.5] : stage === 1 ? [back ? -20 : -23, -2.8] : [back ? -5 : 3, -2.8],
    15, 14.5, -1, MIN_KNEE_OPENING),
    footAngle: stage === 0 ? Math.PI / 2 : 0, toeAngle: 0, footFacing: 1, planted: false })
  // Knees and elbows face the ground; pointed trailing feet and a turned neck
  // distinguish belly-down flight from a figure lying on its back.
  const frame = { hip, waist, shoulder, head, frontArm: arm(false), backArm: arm(true), frontLeg: leg(false), backLeg: leg(true), headTilt: stage === 0 ? pitch : 0 }
  return rotatePose(frame, p.groundAngle, p.facing)
}

/** The current collision world, rather than a flight timer, supplies the next
 * reachable landing. The swept standing/crouched hull also excludes ceilings
 * and respects intervening walls. This only anticipates support; it never
 * changes the motor or acquires a grip. Called in the player's gravity frame. */
export function landingPreparation(p: Player): number {
  if (p.grounded) return p.landing > 0 ? 1 : 0
  if (p.vy <= 0 || !p.terrain?.length) return 0
  const horizon = .16, dy = p.vy * horizon + (p.gravity ?? TUNING.gravity) * horizon ** 2 / 2
  if (dy <= 0) return 0
  const x = p.x + p.vx * horizon, y = p.y + dy
  // Most airborne frames have no nearby floor. Avoid a full hull query then.
  if (![x - 12, x, x + 12].some(at => groundAt(p.terrain!, at, p.y + dy / 2, dy / 2 + .01))) return 0
  const sweep = moveBody([p.x, p.y], [x, y], p.terrain, p.crouching ? TUNING.crouchHeight : TUNING.height)
  const support = sweep.contacts.find(contact => contact.normal[1] < 0 && 'time' in contact)
  // Round objects gradually change from a landing face into a sliding side.
  // Their contact normal must fade preparation rather than toggle the rig.
  return support && 'time' in support && typeof support.time === 'number'
    ? smooth(1 - support.time) * smooth((-support.normal[1] - .5) / .35) : 0
}
export function fallRecoveryPose(p: Player): AthletePose {
  const fall = p.freeFall!, recovery = fall.recovery
  const impact = fall.impact
  const source = athletePose({ ...p, ...(impact && { vx: impact.vx, vy: impact.vy }), freeFall: null, grounded: false,
    groundAngle: 0, landing: 0, pushing: null, ledgeReach: null, wallBrace: null, sliding: null,
    anim: { ...p.anim, ...(impact && { gait: impact.gait }), ragdoll: null, footwork: null, recovery: null } })
  const prone = fallFrame(p)
  // Bend through depth as the limbs fold across the torso; interpolating only
  // their projected joints would flip an elbow or knee through a straight limb.
  const blend = (from: AthletePose, to: AthletePose, t: number) => transferPose(from, to, [0, 0], t, [0, 0], 0, true)
  if (recovery === null) {
    // The prone rig extends beyond the standing hull. Fold and balance the
    // visible body against real terrain without changing the physical root.
    return blend(source, prone, fall.amount)
  }
  if (recovery < .18) return blend(source, prone, lerp(fall.amount, 1, smooth(recovery / .16)))
  const kneeling = fallFrame(p, 1), crouched = fallFrame(p, 2)
  if (recovery < .48) return blend(prone, kneeling, smooth((recovery - .18) / .3))
  if (recovery < .7) return blend(kneeling, crouched, smooth((recovery - .48) / .22))
  const standing = athletePose({ ...p, freeFall: null, anim: { ...p.anim, ragdoll: null, recovery: null }, landing: 0 })
  return blend(crouched, standing, smooth((recovery - .7) / (TUNING.fallRecoveryTime - .7)))
}

/** Falling and impact recoil share the same loose-limb clearance policy.
 * Apply it after articulation so the final rig, rather than its unused target,
 * owns the body, palm and shoe queries. */
export function clearLoosePose(p: Player, source: AthletePose, initial?: Point, retainSide = false): AthletePose {
  const pose = clearBody(p, source, initial, retainSide).pose
  // The body has settled and limb roots stay fixed through all bend/foot
  // searches. No point of the final limb can reach beyond its bones and skin.
  const nearby = (limb: Limb, reach: number): Player => {
    if (!p.terrain || p.terrain.length < 2) return p
    const x = p.x + limb.root[0] * p.facing, y = p.y + limb.root[1]
    const terrain = p.terrain.filter(b => b.x <= x + reach && b.x + b.w >= x - reach
      && b.y <= y + reach && b.y + b.h >= y - reach)
    return terrain.length === p.terrain.length ? p : { ...p, terrain }
  }
  for (const name of ['frontArm', 'backArm'] as const) {
    const arm = pose[name], hand = arm.hand ? Math.hypot(arm.hand[0] - arm.end[0], arm.hand[1] - arm.end[1]) : 1.4
    pose[name] = clearLimb(nearby(arm, UPPER_ARM + FOREARM + hand + 2.2), arm, UPPER_ARM, FOREARM, 1, true)
  }
  for (const name of ['frontLeg', 'backLeg'] as const) {
    let leg = pose[name]
    // Include the heel and the toe's full rotation around the ball of the foot.
    const local = nearby(leg, 15 + 14.5 + 8)
    for (let i = 0; i < 4; i++) {
      leg = { ...leg, ...clearLimb(local, leg, 15, 14.5, -1) }
      leg = clearAirborneFoot(local, leg)
    }
    pose[name] = leg
  }
  return pose
}

export function fallPose(p: Player, deferClearance = false): AthletePose {
  const source = fallRecoveryPose(p), offset = p.anim.recovery ? undefined : p.freeFall?.bodyOffset
  // Preserve the settled balance offset when recoil will clear the final rig.
  return deferClearance ? rotatePose(source, 0, 1, [0, 0], offset)
    : clearLoosePose(p, source, offset, true)
}
