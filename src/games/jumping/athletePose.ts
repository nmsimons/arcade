// Pose queries: the per-render pose cache, mode dispatch and the final arm, shove and ankle passes.
import { rightArmAnimating, rightArmSupporting } from './armSupport.ts'
import { ankleSkin, bodyIntrusion, clearLimb, limbClearance } from './athleteClearance.ts'
import { FOREARM, HEAD_RADIUS, UPPER_ARM, add, armPose, clamp, mix, mixAngle, reflectAthletePose, smooth, solve, solveNear, solveRear, transferPose } from './athleteRig.ts'
import type { AthletePose, Leg } from './athleteRig.ts'
import { footPoint } from './footwork.ts'
import { lineBlocked, withTerrainQueries } from './geometry.ts'
import { mirrorPlatform, mirrorPlayerState } from './gravityFrame.ts'
import { BACK_WRIST, FRONT_WRIST, LEDGE_CLIMB_TIME } from './ledge.ts'
import { ANKLE_FLEX_LIMIT, openAnkle } from './limbPose.ts'
import type { Limb, Point } from './limbPose.ts'
import { climbingAimArm, climbingPose } from './poses/climbingPose.ts'
import { fallPose } from './poses/fallPose.ts'
import { ledgePose, prepareReturningStepPose } from './poses/ledgePose.ts'
import { locomotionPose } from './poses/locomotionPose.ts'
import { impactRagdollPose } from './poses/ragdollPose.ts'
import { releaseTurnPose } from './poses/releaseTurnPose.ts'
import { waterPose } from './poses/waterPose.ts'
import { SHOVE_RECOVERY } from './shove.ts'
import { withinRigLimits } from './athleteLimits.ts'
import type { Player } from './characterTypes.ts'

const renderPoses = new WeakMap<Player, { pose?: AthletePose; base?: AthletePose }>()

/** A synchronous, read-only render may query the same rig for skin, shadow and
 * emissions. Reuse that solve only within this call; the next frame is fresh. */
export function withAthletePose<T>(p: Player, render: () => T): T {
  if (renderPoses.has(p)) return render()
  renderPoses.set(p, {})
  try { return render() }
  finally { renderPoses.delete(p) }
}

/** Preparation observes the visible body, including a turn's outgoing facing.
 * Established grips and their catch choreography have separate ownership. */
export function dryPreparationFacesForward(p: Player, direction: number): boolean {
  const turn = p.anim.dryTurn
  return !turn || (turn.pose.head[0] - turn.pose.hip[0]) * turn.facing * direction >= -1
}
export function dryLedgeReachPose(p: Player): AthletePose | null {
  if (p.freeFall?.amount || p.wallBrace?.amount || p.sliding?.amount || p.anim.slideEntry || p.vx * p.facing < -5) return null
  if (!dryPreparationFacesForward(p, p.facing)) return null
  const pose = athletePose({ ...p, ledgeReach: null, pushing: null })
  return pose
}

/** A dry lip can prepare the hands only within a short, clear approach from
 * both actual shoulders. Root proximity cannot justify reaching overhead,
 * backward through the body, or through another solid. */
export function dryLedgeReach(p: Player, edgeX: number, edgeY: number, pose: AthletePose | null): number {
  if (!pose) return 0
  const edge: Point = [(edgeX - p.x) * p.facing, edgeY - p.y]
  let amount = 1
  for (const [arm, wrist] of [[pose.frontArm, FRONT_WRIST], [pose.backArm, BACK_WRIST]] as const) {
    const dx = edge[0] + wrist[0] - arm.root[0], dy = edge[1] + wrist[1] - arm.root[1]
    if (dx <= 0 || Math.abs(dy) > UPPER_ARM + FOREARM) return 0
    amount = Math.min(amount, smooth((28 - Math.hypot(dx, dy)) / 9), smooth(dx / 4))
    if (!amount) return 0
    if (p.terrain && lineBlocked([p.x + arm.root[0] * p.facing, p.y + arm.root[1]],
      [p.x + (arm.root[0] + dx) * p.facing, p.y + arm.root[1] + dy], p.terrain)) return 0
  }
  return amount
}

/** Local-space poses share one rig, from planted contact through flight and landing. */
export function athletePose(p: Player): AthletePose {
  const frame = renderPoses.get(p)
  if (frame?.pose) return frame.pose
  const pose = withTerrainQueries(() => articulateAnkles(p, shovingPose(p, equippedArmPose(p, baseAthletePose(p)))))
  if (frame) frame.pose = pose
  return pose
}

function baseAthletePose(p: Player): AthletePose {
  const frame = renderPoses.get(p)
  if (frame?.base) return frame.base
  const pose = resolveAthletePose(p)
  if (frame) frame.base = pose
  return pose
}

function equippedArmPose(p: Player, pose: AthletePose, presentation = false): AthletePose {
  const tool = p.heldTool ?? (p.armAim?.aiming ? p.armAim : undefined)
  if (tool && !rightArmSupporting(p) && (tool.aiming || !rightArmAnimating(p))) {
    const flip = p.inverted ? -1 : 1
    const display = presentation ? p.heldTool?.presentation : undefined
    const angle = display?.forearm ?? (tool.aiming ? tool.angle : p.facing < 0 ? Math.PI : 0)
    const direction: Point = [Math.cos(angle) * p.facing, Math.sin(angle) * flip]
    // The sleeve wraps the forearm. Solve the bones first, with no separate grip
    // or floating weapon target; its muzzle follows the elbow-to-wrist axis.
    const upper = display ? Math.atan2(Math.sin(display.upper) * flip, Math.cos(display.upper) * p.facing)
      : tool.aiming ? Math.atan2(direction[1], direction[0]) + .65 : Math.PI / 2 - .22
    const root = add(pose.shoulder, [0, .7])
    const joint = add(root, [Math.cos(upper) * UPPER_ARM, Math.sin(upper) * UPPER_ARM])
    const end = add(joint, [direction[0] * FOREARM, direction[1] * FOREARM])
    const name = p.facing < 0 ? 'backArm' : 'frontArm'
    let arm: Limb = { root, joint, end,
      hand: add(end, [direction[0] * 1.2, direction[1] * 1.2]), handAngle: Math.atan2(direction[1], direction[0]) }
    if (presentation && p.climbing && !display?.firing) arm = climbingAimArm(p, pose[name], arm)
    pose = { ...pose, [name]: arm }
  }
  return pose
}

/** Ease only presentation; the arm and its sleeve always share the same bones.
 * Contacts, obstruction queries and fresh shots use the selected direction. */
export function presentedAthletePose(p: Player): AthletePose {
  return withinRigLimits(p, withTerrainQueries(() => reachingForRope(p, articulateAnkles(p, shovingPose(p, equippedArmPose(p, baseAthletePose(p), true))))))
}

/** Flying at a hanging rope, the hands reach out for the point of it the catch will take, so the catch
 * closes the hands on the rope rather than lunging them there. Presentation only: the catch itself still
 * probes from just ahead of the head. */
function reachingForRope(p: Player, pose: AthletePose): AthletePose {
  if (p.grounded || p.climbing || p.hang || p.mantle || p.inverted || p.waterMotion || p.grabCooldown > 0 || p.heldTool || !p.ropes?.length) return pose
  const probe: Point = [p.x + p.facing * 10, p.y - 56]
  let nearest: Point | null = null, gap = Infinity
  for (const rope of p.ropes) for (let j = 0; j < rope.nodes.length - 1; j++) {
    const a = rope.nodes[j], b = rope.nodes[j + 1], dx = b.x - a.x, dy = b.y - a.y
    const t = clamp(((probe[0] - a.x) * dx + (probe[1] - a.y) * dy) / (dx * dx + dy * dy || 1))
    const q: Point = [a.x + dx * t, a.y + dy * t], d = Math.hypot(q[0] - probe[0], q[1] - probe[1])
    if (d < gap) { gap = d; nearest = q }
  }
  if (!nearest) return pose
  const target: Point = [(nearest[0] - p.x) * p.facing, nearest[1] - p.y]
  // Only a rope ahead, from a little beyond the catch's reach until the hands close on it.
  const weight = smooth((55 - gap) / 30) * smooth((target[0] - 2) / 8)
  if (weight < .01 || (p.terrain && lineBlocked([p.x + pose.shoulder[0] * p.facing, p.y + pose.shoulder[1]], nearest, p.terrain))) return pose
  const reach = (arm: Limb, goal: Point): Limb => {
    const d: Point = [goal[0] - arm.root[0], goal[1] - arm.root[1]], length = Math.hypot(d[0], d[1]), most = UPPER_ARM + FOREARM - .3
    const end: Point = length > most ? [arm.root[0] + d[0] / length * most, arm.root[1] + d[1] / length * most] : goal
    const solved = solveRear(arm.root, end, UPPER_ARM, FOREARM, 1, 1, 3)
    // Each bone turns from the flight pose toward the reach, keeping its length.
    const bone = (from: number[], to: number[], size: number) => {
      const v = from.map((x, k) => x + (to[k] - x) * weight), length = Math.hypot(...v) || 1
      return v.map(x => x / length * size)
    }
    const upper = bone([arm.joint[0] - arm.root[0], arm.joint[1] - arm.root[1], arm.jointDepth ?? 0],
      [solved.joint[0] - arm.root[0], solved.joint[1] - arm.root[1], solved.jointDepth ?? 0], UPPER_ARM)
    const lower = bone([arm.end[0] - arm.joint[0], arm.end[1] - arm.joint[1], (arm.endDepth ?? 0) - (arm.jointDepth ?? 0)],
      [solved.end[0] - solved.joint[0], solved.end[1] - solved.joint[1], (solved.endDepth ?? 0) - (solved.jointDepth ?? 0)], FOREARM)
    const joint: Point = [arm.root[0] + upper[0], arm.root[1] + upper[1]], tip: Point = [joint[0] + lower[0], joint[1] + lower[1]]
    return { ...arm, joint, end: tip, jointDepth: upper[2], endDepth: upper[2] + lower[2], hand: arm.hand ? mix(arm.hand, tip, weight) : undefined }
  }
  return { ...pose, frontArm: reach(pose.frontArm, target), backArm: reach(pose.backArm, [target[0], target[1] + 5]) }
}

/** Final clearance and pose blends can change the shin after its first solve.
 * Keep support shoes fixed; free shoes follow that final shin instead of
 * folding back onto the calf. The established wall toe brace owns its pose. */
export function articulateAnkles(p: Player, source: AthletePose): AthletePose {
  if (p.hang?.braced || p.mantle?.braced && p.mantle.time < LEDGE_CLIMB_TIME * .24) return source
  let local: Player | undefined
  const clearancePlayer = () => local ??= p.inverted ? { ...p, y: -p.y, inverted: false, terrain: p.terrain?.map(mirrorPlatform) } : p
  let result = source
  for (const [i, name] of (['frontLeg', 'backLeg'] as const).entries()) {
    const leg = source[name]
    if ((leg.rear ?? 0) > .5) continue
    const facing = Math.sign(leg.footFacing) || 1
    const shin = Math.atan2(leg.end[1] - leg.joint[1], leg.end[0] - leg.joint[0]) - Math.PI / 2
    const delta = Math.atan2(Math.sin(leg.footAngle - shin), Math.cos(leg.footAngle - shin)) * facing
    if (Math.abs(leg.footFacing) === 1 && delta >= -(ANKLE_FLEX_LIMIT - .2)) continue
    let candidate: Leg | undefined
    const wallContact = (p.wallBrace?.feet[i] ?? 0) > 0
    const grounded = p.grounded && !p.waterMotion?.landing
    const supported = grounded || leg.planted || wallContact || leg.slideContact
    if (supported) {
      // Foot-facing passes continuously through zero during a turn. Use that
      // profile in the knee constraint as well, rather than flipping its side.
      const bend = openAnkle(leg, leg.footAngle, leg.footFacing)
      if (bend === leg) continue
      const bent = bend && { ...leg, ...bend }
      if (bent && limbClearance(clearancePlayer(), bent, { fullLeg: true }).clear(bent)) candidate = bent
    }
    if (!candidate && !leg.planted && !wallContact && !leg.slideContact) {
      if (delta >= -ANKLE_FLEX_LIMIT) continue
      candidate = { ...leg, footAngle: leg.footAngle + (Math.max(-ANKLE_FLEX_LIMIT, Math.min(Math.PI / 2, delta)) - delta) * facing }
      const edge = p.mantle ?? p.hang
      const clearShoe = (angle: number) => ankleSkin.every(({ point, toe }) => {
        const sole = footPoint(point, angle * leg.footFacing, leg.toeAngle * leg.footFacing, toe)
        const at: Point = [leg.end[0] + sole[0] * leg.footFacing * (1 - (leg.rear ?? 0)), leg.end[1] + sole[1]]
        // A known lip is still a support when inspecting a pose without a
        // terrain collection. Keep its corner and the actual terrain clear.
        return !(edge && at[0] > (edge.edgeX - p.x) * p.facing + .01
          && at[1] > (edge.edgeY - p.y) * (p.inverted ? -1 : 1) + .01) && !bodyIntrusion(clearancePlayer(), at, 0)
      })
      if (!clearShoe(candidate.footAngle)) {
        let low = 0, high = 1
        for (let pass = 0; pass < 10; pass++) {
          const t = (low + high) / 2
          if (clearShoe(mixAngle(leg.footAngle, candidate.footAngle, t))) low = t
          else high = t
        }
        candidate.footAngle = mixAngle(leg.footAngle, candidate.footAngle, low)
      }
      const bend = openAnkle(candidate, candidate.footAngle, facing)
      const bent = bend && { ...candidate, ...bend }
      if (grounded && bent && limbClearance(clearancePlayer(), bent, { fullLeg: true }).clear(bent)) candidate = bent
    }
    if (candidate) result = { ...result, [name]: candidate }
  }
  return result
}

/** Gather both palms, drive them forward, then return to the current moving pose. */
function shovingPose(p: Player, pose: AthletePose): AthletePose {
  const shove = p.shove
  if (!shove || p.climbing || p.hang || p.mantle || p.facing !== shove.direction) return pose
  const stroke = clamp(shove.time / shove.windup), drive = smooth((stroke - .35) / .65)
  const settle = 1 - smooth((shove.time - shove.windup - .04) / (SHOVE_RECOVERY - .04))
  const weight = smooth(shove.time / .035) * settle, gather = Math.sin(stroke * Math.PI)
  const clearance = p.inverted ? { ...p, y: -p.y, inverted: false, terrain: p.terrain?.map(mirrorPlatform) } : p
  const palms = shove.contact?.map(palm => ({ x: (palm.x - p.x) * p.facing,
    y: (palm.y - p.y) * (p.inverted ? -1 : 1), nx: palm.nx * p.facing, ny: palm.ny * (p.inverted ? -1 : 1) }))
  const dip = Math.min(9, Math.max(0, (palms?.[0].y ?? -43) + 38)) * drive
  const body = (fraction: number) => {
    const lean = (-4 * gather + 10 * drive) * fraction
    return { hip: add(pose.hip, [(-1.5 * gather + 2.5 * drive) * fraction, 3 * gather + dip]),
      waist: add(pose.waist, [lean * .55, 2 * gather + dip]), shoulder: add(pose.shoulder, [lean, gather + dip - drive]),
      head: add(pose.head, [lean, gather + dip - drive]) }
  }
  const clear = (candidate: ReturnType<typeof body>) => !bodyIntrusion(clearance, candidate.head, HEAD_RADIUS)
    && !bodyIntrusion(clearance, candidate.shoulder, 2.5) && !bodyIntrusion(clearance, candidate.waist, 2.8)
  let fraction = 1
  if (!clear(body(1))) {
    let low = 0, high = 1
    for (let i = 0; i < 7; i++) { const mid = (low + high) / 2; if (clear(body(mid))) low = mid; else high = mid }
    fraction = low
  }
  const trunk = body(fraction), arm = (index: number) => {
    const root = add(trunk.shoulder, [index ? -1.2 : 0, .7]), palm = palms?.[index]
    const gathered: Point = add(root, [5, 5 + index])
    const extended: Point = palm ? [palm.x + palm.nx * 2.8, palm.y + palm.ny * 2.8] : add(root, [18.8, 1 + index * 2])
    const wrist = mix(gathered, extended, drive), limb = solve(root, wrist, UPPER_ARM, FOREARM, 1)
    return { ...limb, hand: add(limb.end, palm ? [-palm.nx * 1.2, -palm.ny * 1.2] : [1.2, 0]),
      handAngle: palm ? Math.atan2(-palm.nx, palm.ny) : 0 }
  }
  const leg = (source: Leg) => ({ ...source, ...solveNear({ ...source, root: add(trunk.hip, [0, 1]) }, source.end, 15, 14.5) })
  const target = { ...pose, ...trunk, frontArm: arm(0), backArm: arm(1), frontLeg: leg(pose.frontLeg), backLeg: leg(pose.backLeg) }
  const result = transferPose(pose, target, [0, 0], weight, [0, 0], 0, true)
  result.frontArm = clearLimb(clearance, result.frontArm, UPPER_ARM, FOREARM, 1, true)
  result.backArm = clearLimb(clearance, result.backArm, UPPER_ARM, FOREARM, 1, true)
  return result
}

let solves = 0
/** Rig solves since the module loaded; tests count them instead of timing work. */
export const athletePoseSolves = () => solves

export function resolveAthletePose(p: Player, deferLooseClearance = false): AthletePose {
  solves++
  if (p.inverted) {
    mirrorPlayerState(p); p.inverted = false
    try { return resolveAthletePose(p, deferLooseClearance) }
    finally { mirrorPlayerState(p); p.inverted = true }
  }
  if (p.anim.ragdoll) return impactRagdollPose(p)
  if (p.releaseTurn) return releaseTurnPose(p)
  if (p.mantle?.step) return prepareReturningStepPose(p)
  if (p.hang || p.mantle) return ledgePose(p)
  if (p.climbing) return climbingPose(p)
  if (p.waterMotion && !p.jumpLift && !p.waterJump) return waterPose(p)
  if (p.anim.dryTurn) return capturedPose(p.anim.dryTurn, p.facing)
  if (p.anim.slideEntry) return capturedPose(p.anim.slideEntry, p.facing)
  if (p.anim.recovery) return p.anim.recovery.pose
  if ((p.freeFall?.amount ?? 0) > 0) return fallPose(p, deferLooseClearance)
  return locomotionPose(p)
}

/** A captured turn or slide-entry pose, reflected when the body faces the other way. */
function capturedPose(frame: { pose: AthletePose; facing: number }, facing: number): AthletePose {
  return frame.facing === facing ? frame.pose : reflectAthletePose(frame.pose)
}
/** A quiet head-and-shoulder recovery, with both feet held on the charging sill. */
export function awakeningPose(p: Player, progress: number): AthletePose {
  const target = athletePose(p)
  if (progress >= 1) return target
  const from = structuredClone(target)
  from.waist = [target.waist[0] + 2, target.waist[1] + 2]
  from.shoulder = [target.shoulder[0] + 6, target.shoulder[1] + 6]
  from.head = [target.head[0] + 12, target.head[1] + 12]
  from.headTilt = .95
  from.frontArm = armPose(from.shoulder, .1, .1)
  from.backArm = armPose(from.shoulder, -.12, .1)
  return transferPose(from, target, [0, 0], Math.max(0, progress))
}
