// Ladder and rope climbing.
import { handGeometry } from '../androidHand.ts'
import { athletePose, presentedAthletePose } from '../athletePose.ts'
import { FOREARM, UPPER_ARM, add, lerp, mix, mixAngle, reachingBend, rotatePose, smooth, solveRear, transferPose } from '../athleteRig.ts'
import type { AthletePose, Leg } from '../athleteRig.ts'
import { climbBody, climbGait, climbNormal, climbPoint, rappelFrame, rappelWeight, ropePoint, ropePump } from '../climbables.ts'
import { FOOT_CONTACT, footPoint } from '../footwork.ts'
import { nearestBoundary, pointInside } from '../geometry.ts'
import { limbOnBend, limbReach } from '../limbPose.ts'
import type { Limb, Point } from '../limbPose.ts'
import { ropeArmReach, ropeHangOffset } from '../ropeBodyMotion.ts'
import { keepRopeGrip } from '../ropeGravity.ts'
import type { Player } from '../characterTypes.ts'

export function climbingPose(p: Player, turnAngle = 0): AthletePose {
  const c = p.climbing!, blend = smooth(c.time / .16)
  const d = c.distance
  if (c.turn) {
    const base = { ...c, turn: undefined, time: .16, hangBlend: 1, wall: undefined, wallBlend: 0 }
    keepRopeGrip(base, c.turn.grip)
    const pivot = ropePoint(c.rope!, c.turn.grip), offset = ropeHangOffset(base, p.facing, c.turn.angle)
    const root: Point = [pivot[0] + offset[0], pivot[1] + offset[1]]
    const pose = climbingPose({ ...p, x: root[0], y: root[1], climbing: base }, c.turn.angle)
    const target = rotatePose(pose, c.turn.angle, p.facing, [(pivot[0] - root[0]) * p.facing, pivot[1] - root[1]],
      [(root[0] - p.x) * p.facing, root[1] - p.y])
    if (c.caught.releaseTurn && blend < 1) {
      const source = athletePose({ ...p, ...c.caught, anim: { ...p.anim, ...c.caught.anim }, climbing: null, hang: null, mantle: null })
      return transferPose(source, target, [(c.caught.x - p.x) * p.facing, c.caught.y - p.y], blend, [0, 0], 0, true)
    }
    return target
  }
  if (c.caught.hang && blend < 1) {
    const source = presentedAthletePose({ ...p, ...c.caught, anim: { ...p.anim, ...c.caught.anim }, climbing: null, hang: c.caught.hang, mantle: null, ledgeReach: null })
    const target = climbingPose({ ...p, climbing: { ...c, time: .16 } })
    return transferPose(source, target, [(c.caught.x - p.x) * p.facing, c.caught.y - p.y], blend)
  }
  const gait = climbGait(d, c.rope?.definition.length, c.ladder ? c.ladder.bottom - c.ladder.top : undefined)
  const boarding = !!c.ladder && c.caught.grounded && p.y - c.ladder.top < climbGait(0).root
  const local = (point: Point): Point => [(point[0] - p.x) * p.facing, point[1] - p.y]
  const body = (distance: number, away: number) => local(climbBody(c, distance, away, p.facing))
  const phase = d / 28 * Math.PI * 2, sway = Math.sin(phase) * 1.4
  const bracing = rappelWeight(c)
  const wallFrame = bracing ? rappelFrame(c) : null
  const sideView = lerp(smooth(Math.abs(c.lean) / .65), 1, bracing), facing = lerp(Math.sign(c.lean) * p.facing || 1, 1, bracing)
  const hanging = smooth(c.hangBlend), lean = c.lean * p.facing
  let hip = body(gait.hip, -sway + c.swing * 2 * p.facing)
  let waist = body(gait.waist, -sway * .65 + c.swing * p.facing)
  let shoulder = body(gait.shoulder, sway * .3 + c.swing * .4 * p.facing)
  let head = body(gait.head + Math.sin(phase - .7) * .35, -c.swing * .3 * p.facing)
  if (boarding) {
    // Reach down to the top rung from a gathered stance. The gait's negative
    // distances preserve continuous movement; they are not rungs in midair.
    const tuck = 14 * (1 - smooth((p.y - c.ladder!.top) / climbGait(0).root))
    for (const point of [hip, waist, shoulder, head]) point[1] += tuck
  }
  const contact = (step: ReturnType<typeof climbGait>['hands'][number], foot: boolean, side: number) => {
    const limit = c.rope?.definition.length ?? Infinity
    const supported = !foot || step.distance <= limit
    const distance = boarding ? Math.max(0, Math.min(step.distance, limit)) : Math.min(step.distance, limit)
    const point = supported ? climbPoint(c, distance) : climbBody(c, gait.hip + (side < 0 ? 29.4 : 27.5), -side * 2, p.facing)
    const normal = climbNormal(c, distance)
    if (supported) {
      const spread = ((c.rope ? foot ? 3 : 1 : 5.5) + step.lift * (foot ? .5 : 1)) * (foot ? 1 : 1 - sideView)
      point[0] += normal[0] * p.facing * side * spread
      point[1] += normal[1] * p.facing * side * spread
      if (foot && !c.rope) point[1] -= 2.8
    }
    return { point: local(point), supported, planted: supported && step.planted,
      angle: c.rope && supported ? -Math.PI / 2 - Math.atan2(normal[1], normal[0]) * p.facing : 0 }
  }
  // Bring the lower hand up beside the supporting hand before hanging from the grip.
  const grip = gait.grip
  const hands = gait.hands.map((hand, i) => contact({ ...hand, distance: lerp(hand.distance, grip, hanging), lift: hand.lift * (1 - hanging) }, false, i ? 1 : -1))
  const feet = [contact(gait.feet[0], true, -1), contact(gait.feet[1], true, 1)]
  if (hanging) {
    const mid = mix(hands[0].point, hands[1].point, .5)
    const out = -lean * 12, spread = 3.9 * blend * (1 - sideView)
    const reach = ropeArmReach(c)
    const chest = add(mid, [out, Math.sqrt(reach ** 2 - (Math.abs(out) + spread) ** 2) - .7])
    // Reach up and forward to the fixed grip, with the head behind the hands.
    // The pelvis and legs still lead the pump; this offset only changes the silhouette.
    for (let pass = 0; pass < 12; pass++) for (const [i, hand] of hands.entries()) {
      const offset = (i ? 1 : -1) * spread
      const dx = chest[0] + offset - hand.point[0], dy = chest[1] + .7 - hand.point[1], length = Math.hypot(dx, dy)
      if (length > reach) { chest[0] = hand.point[0] + dx * reach / length - offset; chest[1] = hand.point[1] + dy * reach / length - .7 }
    }
    const pump = ropePump(c, turnAngle, p.facing), offset = (point: Point): Point => [point[0] * p.facing, point[1]]
    const pelvis = add(chest, offset(pump.hip))
    hip = mix(hip, pelvis, hanging); waist = mix(waist, add(chest, offset(pump.waist)), hanging)
    shoulder = mix(shoulder, chest, hanging)
    const neck = lean - (c.bodyMotion?.angle ?? 0) * p.facing * .75 + pump.curl * p.facing
    head = mix(head, add(chest, [neck, -Math.sqrt(7.3 ** 2 - neck ** 2)]), hanging)
    feet[0].point = mix(feet[0].point, add(pelvis, offset(pump.frontFoot)), hanging)
    feet[1].point = mix(feet[1].point, add(pelvis, offset(pump.backFoot)), hanging)
  }
  if (wallFrame) {
    const frame = wallFrame
    hip = mix(hip, local(frame.hip), bracing); waist = mix(waist, local(frame.waist), bracing)
    shoulder = mix(shoulder, local(frame.shoulder), bracing); head = mix(head, local(frame.head), bracing)
    for (let i = 0; i < 2; i++) {
      hands[i].point = mix(hands[i].point, local(frame.hands[i]), bracing)
      feet[i].point = mix(feet[i].point, local(frame.feet[i]), bracing)
      feet[i].planted = !!c.wall && frame.steps[i].planted; feet[i].supported = !!c.wall
    }
  }
  let source: AthletePose | null = null
  if (blend < 1) {
    source = presentedAthletePose({ ...p, ...c.caught, anim: { ...p.anim, ...c.caught.anim }, climbing: null, hang: c.caught.hang ?? null, mantle: null, ledgeReach: null })
    const at = (point: Point): Point => [point[0] + (c.caught.x - p.x) * p.facing, point[1] + c.caught.y - p.y]
    hip = mix(at(source.hip), hip, blend); waist = mix(at(source.waist), waist, blend)
    shoulder = mix(at(source.shoulder), shoulder, blend); head = mix(at(source.head), head, blend)
    hands[0].point = mix(at(source.frontArm.end), hands[0].point, blend); hands[1].point = mix(at(source.backArm.end), hands[1].point, blend)
    feet[0].point = mix(at(source.frontLeg.end), feet[0].point, blend); feet[1].point = mix(at(source.backLeg.end), feet[1].point, blend)
  }
  const arms = hands.map((hand, i) => {
    const side = i ? 1 : -1, root = add(shoulder, [side * 3.9 * blend * (1 - sideView), .7])
    const solved = solveRear(root, hand.point, UPPER_ARM, FOREARM, 1, lerp(side * .6, facing, sideView), 3,
      bracing * smooth(c.rappelPull ?? 0))
    // Until the top rung is within reach, keep the palm on its wrist instead
    // of stretching the hand artwork to an unreachable support.
    return { ...solved, hand: boarding ? solved.end : hand.point }
  })
  const legs = feet.map((foot, i) => {
    const side = i ? 1 : -1
    const spread = lerp(-side * lerp(foot.supported ? .2 : .1, .5, hanging), -facing, sideView)
    const solved = solveRear(add(hip, [side * 2.7 * blend * (1 - sideView), 1]), foot.point, 15, 14.5, 1,
      spread)
    const wallAngle = -Math.PI / 2 + (wallFrame?.steps[i].lift ?? 0) * .4
    const leg: Leg = { ...solved, rear: 1 - sideView, footAngle: lerp(lerp(foot.angle, facing * .12, sideView), wallAngle, bracing), toeAngle: 0,
      footFacing: facing, planted: foot.planted && (hanging === 0 || bracing === 1) }
    if (source) leg.footAngle = lerp(i ? source.backLeg.footAngle : source.frontLeg.footAngle, leg.footAngle, blend)
    return c.rope && p.terrain ? clearClimbingLeg(p, leg, spread) : leg
  })
  return { hip, waist, shoulder, head, frontArm: arms[0], backArm: arms[1], frontLeg: legs[0], backLeg: legs[1], sideView, backView: blend * (1 - sideView) }
}

/** A reaching foot meets the wall immediately while the torso eases into its brace. */
function clearClimbingLeg(p: Player, leg: Leg, spread: number): Leg {
  let current = leg
  for (const terrain of p.terrain!) {
    const rootX = p.x + leg.root[0] * p.facing, ankleY = p.y + current.end[1]
    const wall = nearestBoundary(terrain, rootX, ankleY)
    if (Math.abs(wall.ny) > .12 || wall.distance > 40 || pointInside(terrain, rootX, ankleY)) continue
    const side = -Math.sign(wall.nx), localSide = side * p.facing
    const gap = (wall.x - p.x - current.end[0] * p.facing) * side
    // Roll the sole onto the wall before loading it; never glue a distant foot to it.
    const turn = smooth((12 - gap) / 8)
    const angle = lerp(current.footAngle, -Math.PI / 2 * localSide, turn)
    const extent = Math.max(2.1 * (current.rear ?? 0), ...FOOT_CONTACT.map(point =>
      footPoint(point, angle * current.footFacing, current.toeAngle * current.footFacing)[0]
        * current.footFacing * (1 - (current.rear ?? 0)) * localSide))
    const target: Point = [...current.end]
    const intrusion = extent + .2 - gap
    if (intrusion > 0) target[0] -= intrusion * localSide
    const solved = solveRear(leg.root, target, 15, 14.5, 1, spread)
    // If the knee reaches the face first, fold in depth without changing bone lengths.
    const dx = solved.end[0] - leg.root[0], dy = solved.end[1] - leg.root[1], length2 = dx * dx + dy * dy
    const along = (15 ** 2 - 14.5 ** 2 + length2) / (2 * length2)
    const center: Point = [leg.root[0] + dx * along, leg.root[1] + dy * along]
    const kneeOut = (solved.joint[0] - center[0]) * localSide
    const room = (wall.x - p.x - center[0] * p.facing) * side - 1.8
    if (kneeOut > Math.max(0, room)) {
      const amount = Math.max(0, room) / kneeOut
      const offset = Math.hypot(solved.joint[0] - center[0], solved.joint[1] - center[1])
      solved.joint = mix(center, solved.joint, amount)
      solved.jointDepth = Math.sqrt((solved.jointDepth ?? 0) ** 2 + offset ** 2 * (1 - amount ** 2))
    }
    current = { ...current, ...solved, footAngle: angle }
  }
  return current
}

/** A free climbing hand can point between grips, but must leave and return
 * along its normal reach instead of snapping between a grip and a gun pose. */
export function climbingAimArm(p: Player, from: Limb, to: Limb): Limb {
  const c = p.climbing!, hand = p.facing < 0 ? 1 : 0
  const step = climbGait(c.distance, c.rope?.definition.length, c.ladder ? c.ladder.bottom - c.ladder.top : undefined).hands[hand]
  const weight = Math.min(p.heldTool?.presentation?.climbAim ?? 0, smooth(step.lift ** 2))
  if (weight < .001) return from
  if (weight > .999) return to
  const root = mix(from.root, to.root, weight), wrist = mix(from.end, to.end, weight)
  const reach = limbReach(root, wrist, UPPER_ARM, FOREARM, lerp(from.endDepth ?? 0, to.endDepth ?? 0, weight))
  const arm = limbOnBend(reach, reachingBend(from, to, weight, reach.axis, 0))
  const a = handGeometry(from), b = handGeometry(to)
  return { ...arm, hand: add(arm.end, mix([a.palm[0] - from.end[0], a.palm[1] - from.end[1]],
    [b.palm[0] - to.end[0], b.palm[1] - to.end[1]], weight)), handAngle: mixAngle(a.angle, b.angle, weight) }
}
