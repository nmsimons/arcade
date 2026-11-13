// Ledge hangs, mantles, step-ups and returning steps.
import { handGeometry } from '../androidHand.ts'
import { bodyIntrusion, clearAirborneFoot, clearBody, clearLimb, clearRiserLeg, limbClearance } from '../athleteClearance.ts'
import { athletePose, presentedAthletePose } from '../athletePose.ts'
import { FOREARM, MIN_KNEE_OPENING, UPPER_ARM, add, armPose, clamp, lerp, mix, mixAngle, reflectAthletePose, smooth, solve, solveLeg, solveNear, transferPose } from '../athleteRig.ts'
import type { AthletePose, Leg } from '../athleteRig.ts'
import { wallToeBrace } from '../footwork.ts'
import { BACK_GRIP, BACK_WRIST, FRONT_GRIP, FRONT_WRIST, LEDGE_CATCH_TIME, LEDGE_CLIMB_TIME, ROPE_LEDGE_CATCH_TIME, climbFrame, ladderMantleProgress } from '../ledge.ts'
import { limbOnBend, limbReach } from '../limbPose.ts'
import type { Limb, Point } from '../limbPose.ts'
import { stepFootOffsets } from '../stepUp.ts'
import { gaitPose } from '../gait.ts'
import type { Player } from '../characterTypes.ts'

/** The wrist reaches the corner; the palm rests on top instead of pointing through it.
 * `carry` limits how far the palm follows a contact that the solved wrist falls short of. */
export function grippingArm(root: Point, wrist: Point, grip: Point, free: Limb, contact: number, lift = 0, forward = false, carry = Infinity): Limb {
  const target = solve(root, wrist, UPPER_ARM, FOREARM, 1)
  const angles = (limb: Limb) => {
    const upper = Math.atan2(limb.joint[0] - limb.root[0], limb.joint[1] - limb.root[1])
    const lower = Math.atan2(limb.end[0] - limb.joint[0], limb.end[1] - limb.joint[1])
    return [upper, Math.atan2(Math.sin(lower - upper), Math.cos(lower - upper))]
  }
  const from = angles(free), to = angles(target)
  // An approaching push raises the arm forward, including high grips above a
  // crouched shoulder. The shortest arc changes sides at an opposed upper arm
  // and would flip the elbow midway through that otherwise continuous reach.
  const upper = forward && to[0] < 0 && target.joint[1] < root[1] ? to[0] + Math.PI * 2 : to[0]
  // Rotate through the reach; folding the elbow lifts a released hand clear of the top.
  // A departing surface can pass behind the shoulder while contact fades.
  // Blend wrapped angles along the short arc instead of spinning a whole turn
  // when atan2 crosses its branch cut.
  // A cleared free arm may already bend through depth beside the obstacle.
  // Retain that fold while reaching; rebuilding its projected angles at full
  // bone length would instantly extend it even with zero contact weight.
  const arm = armPose(root, forward ? lerp(from[0], upper, contact) : mixAngle(from[0], to[0], contact), mixAngle(from[1], to[1], contact) + Math.sin(contact * Math.PI) * lift,
    (free.jointDepth ?? 0) * (1 - contact), (free.endDepth ?? 0) * (1 - contact))
  const palm = handGeometry(free)
  const freePalm: Point = [palm.palm[0] - free.end[0], palm.palm[1] - free.end[1]]
  // The IK solver can tuck an out-of-reach wrist slightly inward. Keep the
  // loaded palm on its actual contact instead of carrying that shortfall, up
  // to `carry` units. Beyond that the palm keeps its place beside the wrist,
  // since the hand is drawn joined to the wrist wherever it lies.
  const dx = wrist[0] - target.end[0], dy = wrist[1] - target.end[1], shortfall = Math.hypot(dx, dy)
  const contactPalm: Point = shortfall <= carry ? [grip[0] - target.end[0], grip[1] - target.end[1]]
    : [grip[0] - wrist[0] + dx * carry / shortfall, grip[1] - wrist[1] + dy * carry / shortfall]
  return { ...arm, hand: add(arm.end, mix(freePalm, contactPalm, contact)), handAngle: mixAngle(palm.angle, 0, contact),
    handOpen: (free.handOpen ?? 0) * (1 - contact) }
}

/** An unloaded reach advances along its existing folded arc only while clear.
 * Re-solving a blocked elbow after the reach can abruptly change its bend plane. */
export function clearLedgeReach(p: Player, wrist: Point, grip: Point, free: Limb, amount: number): Limb {
  const at = (t: number) => grippingArm(free.root, wrist, grip, free, t)
  const x = p.x + free.root[0] * p.facing, y = p.y + free.root[1]
  // Both bones and the complete palm stay within 24 units of the shoulder.
  // Long levels must not scan every distant solid for each sampled reach.
  const nearby = p.terrain?.filter(b => b.x <= x + 24 && b.x + b.w >= x - 24
    && b.y <= y + 24 && b.y + b.h >= y - 24) ?? []
  if (!amount || !nearby.length) return at(amount)
  const local = { ...p, terrain: nearby }
  const { clear } = limbClearance(local, free, { hands: true, fullPalm: true })
  let previous = 0, arm = at(0)
  for (let i = 1; i <= 8; i++) {
    const t = amount * i / 8, candidate = at(t)
    if (!clear(candidate)) {
      let low = previous, high = t
      for (let pass = 0; pass < 10; pass++) {
        const mid = (low + high) / 2
        if (clear(at(mid))) low = mid; else high = mid
      }
      return at(low)
    }
    previous = t; arm = candidate
  }
  return arm
}

export function prepareReturningStepPose(p: Player): AthletePose {
  const raw = stepUpPose(p), preparation = p.mantle!.step!.returnPreparation
  // Initial reaching hands are unloaded. The established lip grips later in
  // the lift retain their exact contact; clearing those would detach them.
  const reaching = p.mantle!.time / p.mantle!.step!.duration < .18
  const source = reaching ? { ...raw,
    frontArm: clearLimb(p, raw.frontArm, UPPER_ARM, FOREARM, 1, true),
    backArm: clearLimb(p, raw.backArm, UPPER_ARM, FOREARM, 1, true) } : raw
  if (!preparation?.amount) return source
  const direction = preparation.direction, t = preparation.amount
  let target = athletePose({ ...p, mantle: null, hang: null, climbing: null,
    freeFall: null, sliding: null, wallBrace: null, grounded: false, landing: 0,
    anim: { ...p.anim, dryTurn: null, slideEntry: null, footwork: null, recovery: null, look: 0, gait: { ...(p.anim.gait ?? gaitPose(p.vx,true)), air: 1 } },
    facing: direction,
    // Forecast the incoming working stance. The returning step owns this
    // deliberate body repositioning; the live unloaded contact stays separate.
    pushing: { ...preparation.hands, direction, amount: 1, ready: 1, effort: 0, load: 0 } })
  if (direction !== p.facing) target = reflectAthletePose(target)
  let pose = transferPose(source, target, [0,0], t, [0,0], 0, true, 0,
    { depth: Math.sin(Math.PI * t) * 6, kneeOpening: MIN_KNEE_OPENING })
  // Turning a torso interpolates its pitches, not opposite joint positions.
  // This keeps a chest/waist from disappearing half way through the turn.
  const pitch = (a: Point,b: Point) => Math.atan2(b[0] - a[0], a[1] - b[1])
  const pelvis = mixAngle(pitch(source.hip,source.waist), pitch(target.hip,target.waist), t)
  const chest = mixAngle(pitch(source.waist,source.shoulder), pitch(target.waist,target.shoulder), t)
  const neck = mixAngle(pitch(source.shoulder,source.head), pitch(target.shoulder,target.head), t)
  const neckLength = lerp(Math.hypot(source.head[0] - source.shoulder[0], source.head[1] - source.shoulder[1]),
    Math.hypot(target.head[0] - target.shoulder[0], target.head[1] - target.shoulder[1]), t)
  pose.waist = add(pose.hip, [Math.sin(pelvis) * 6.5, -Math.cos(pelvis) * 6.5])
  pose.shoulder = add(pose.waist, [Math.sin(chest) * 10.1, -Math.cos(chest) * 10.1])
  pose.head = add(pose.shoulder, [Math.sin(neck) * neckLength, -Math.cos(neck) * neckLength])
  pose = clearBody(p, pose).pose
  for (const name of ['frontArm','backArm'] as const) {
    const arm = pose[name], root = add(pose.shoulder, [0,.7])
    const solved = solveNear({ ...arm,root }, arm.end, UPPER_ARM, FOREARM)
    const hand = arm.hand && add(arm.hand, [solved.end[0] - arm.end[0], solved.end[1] - arm.end[1]])
    pose[name] = clearLimb(p, { ...solved,hand }, UPPER_ARM, FOREARM, 1, true)
  }
  for (const name of ['frontLeg','backLeg'] as const) {
    const leg = pose[name]
    pose[name] = clearAirborneFoot(p, { ...leg, ...solveNear({ ...leg,root: add(pose.hip,[0,1]) }, leg.end, 15, 14.5, MIN_KNEE_OPENING) }, 16)
  }
  return pose
}

/** A low step starts in the walking pose: lead with a knee, transfer weight,
 * then bring the trailing foot up. It never passes through the hanging rig. */
function stepUpPose(p: Player): AthletePose {
  const m = p.mantle!, s = m.step!, t = clamp(m.time / s.duration), side = m.side
  const source = presentedAthletePose({ ...p, ...s.caught, anim: { ...p.anim, ...s.caught.anim }, climbing: s.climbing ?? null, mantle: null, pushing: s.caught.pushing ?? null, landing: 0, groundAngle: 0 })
  if (s.rise > 40.01 && !s.climbing) {
    // A head-height obstacle needs hands and a knee on the lip. Reuse the
    // established pull-up rig, starting above its hanging phase, at step timing.
    const start = (74 - s.rise) / 100
    const target = ledgePose({ ...p, mantle: { ...m, time: lerp(start, 1, t) * LEDGE_CLIMB_TIME } })
    return t < .18 ? transferPose(source, target, [(s.caught.x - p.x) * side, s.caught.y - p.y], smooth(t / .18)) : target
  }
  const weight = Math.sin(Math.PI * t), high = smooth((s.rise - 20) / 20)
  const hip = mix(source.hip, [0, -32.7], smooth(t))
  hip[0] += weight * 2; hip[1] += weight * (2 + high * 5)
  const waist = add(hip, [weight * 2, -6.5])
  const shoulder = add(waist, [weight * (3 + high * 4), -10.1 + weight * high * 2])
  const head = add(shoulder, [.45 + weight, -7.3])
  const foot = (leg: Leg, start: number, end: number, offset: number) => {
    const u = smooth((t - start) / (end - start))
    const fromX = (s.caught.x - m.edgeX) * side + leg.end[0], toX = (m.toX - m.edgeX) * side + offset
    const fromY = s.caught.y + leg.end[1] - m.edgeY
    // The toes clear the riser before moving across its vertical face.
    const crossing = clamp((-7 - fromX) / (toX - fromX))
    const toY = m.toY - m.edgeY + offset * side * Math.tan(s.landingAngle ?? 0) - 2.8
    const y = lerp(fromY, toY, smooth(u / Math.max(.15, crossing))) - Math.sin(Math.PI * u) * 7
    return { ankle: [(m.edgeX - p.x) * side + lerp(fromX, toX, u), m.edgeY - p.y + y] as Point, planted: t >= end || t <= start && leg.planted }
  }
  const offsets = stepFootOffsets(s)
  const [front, back] = [source.frontLeg, source.backLeg].map((leg, i) =>
    foot(leg, i === s.lead ? high * .12 : .12 + high * .1, i === s.lead ? .42 + high * .1 : 1, offsets[i]))
  for (const f of [front, back]) if (f.planted) {
    const dip = Math.max(0, f.ankle[1] - Math.sqrt(Math.max(0, 29 ** 2 - (f.ankle[0] - hip[0]) ** 2)) - hip[1] - 1)
    for (const point of [hip, waist, shoulder, head]) point[1] += dip
  }
  const root = add(hip, [0, 1]), armRoot = add(shoulder, [0, .7])
  const pose: AthletePose = { hip, waist, shoulder, head,
    frontArm: armPose(armRoot, -.03 - weight * .3, .1 + weight * .85),
    backArm: armPose(armRoot, -.03 + weight * .45, .1 + weight * .45),
    frontLeg: solveLeg(root, front.ankle, 0, false, front.planted),
    backLeg: solveLeg(root, back.ankle, 0, false, back.planted) }
  const brace = high * smooth(t / .18) * (1 - smooth((t - .32) / .16))
  const edge: Point = [(m.edgeX - p.x) * side, m.edgeY - p.y]
  pose.frontArm = grippingArm(armRoot, add(edge, FRONT_WRIST), add(edge, FRONT_GRIP), pose.frontArm, brace)
  pose.backArm = grippingArm(armRoot, add(edge, BACK_WRIST), add(edge, BACK_GRIP), pose.backArm, brace)
  // Preserve the exact entry silhouette while the first foot starts lifting.
  const result = t < .18 && !s.climbing ? transferPose(source, pose, [0, 0], smooth(t / .18)) : pose
  if (p.terrain) {
    result.frontLeg = clearRiserLeg(p, clearAirborneFoot(p, result.frontLeg, 16))
    result.backLeg = clearRiserLeg(p, clearAirborneFoot(p, result.backLeg, 16))
  }
  return s.climbing && t < .18 ? transferPose(source, result, [0, 0], smooth(t / .18)) : result
}

/** All supports are authored relative to the corner, independent of the camera and player root. */
/**
 * Hanging free from a ledge, nothing under the feet, the body swings from its hands: a catch carries it on
 * the way it was going, toward the wall or away, settling over a second or so, and after that it sways a
 * little, the legs trailing the body, each foot now and then drawn up a little in turn. `time` runs from
 * when the swinging starts, after the catch; `vx` is the catch's speed toward the wall. The angles turn the
 * body about the shoulders, the feet forward (toward the wall) positive; the lifts raise each foot, in units.
 * Presentation only.
 */
export function hangSway(time: number, vx: number) {
  const at = (s: number) => s <= 0 ? 0 : Math.max(-1, Math.min(1, vx / 450)) * .27 * Math.exp(-s / 1.1) * Math.sin(2 * Math.PI * s / 1.15)
    + .06 * Math.sin(2 * Math.PI * s / 2.6) * smooth(s / .6)
  const lift = (phase: number) => time <= 0 ? 0 : 2.2 * (.5 - .5 * Math.cos(2 * Math.PI * (time / 3.4 + phase))) * smooth(time / 1.2)
  return { body: at(time), legs: at(time - .15) * 1.3, lifts: [lift(0), lift(.5)] }
}

/** The swing of a free hang now (see hangSway), or settling as the robot climbs on from one; null when braced. */
function freeHangSway(p: Player) {
  if (p.hang) {
    if (p.hang.braced) return null
    const catchTime = p.hang.caught.climbing?.rope ? ROPE_LEDGE_CATCH_TIME : LEDGE_CATCH_TIME
    return hangSway(p.hang.time - (p.hang.swayFrom ?? catchTime), p.hang.caught.vx * p.hang.side)
  }
  const m = p.mantle
  if (!m?.sway || m.braced || m.descending) return null
  const settle = 1 - smooth(m.time / .25), { body, legs, lifts } = hangSway(m.sway.time + m.time, m.sway.vx)
  return settle ? { body: body * settle, legs: legs * settle, lifts: lifts.map(v => v * settle) } : null
}

export function ledgePose(p: Player): AthletePose {
  if (p.mantle?.ladder) return rearLedgePose(p)
  if (p.hang && p.hang.time < LEDGE_CATCH_TIME && !p.hang.caught.climbing) {
    const h = p.hang, source = presentedAthletePose({ ...p, ...h.caught, anim: { ...p.anim, ...h.caught.anim }, hang: null, mantle: null, climbing: null, landing: 0 })
    const target = ledgePose({ ...p, hang: { ...h, time: LEDGE_CATCH_TIME } })
    const shift: Point = [(h.caught.x - p.x) * p.facing, h.caught.y - p.y]
    // An incoming arm can already be folded through depth beside the wall.
    // Transfer that full rig; rebuilding projected angles unfolds it into
    // the wall and can flip its elbow during the catch.
    const blend = smooth(h.time / LEDGE_CATCH_TIME)
    let pose = transferPose(source, target, shift, blend, [0, 0], 6, true, 0,
      { depth: Math.sin(Math.PI * blend) * 8, kneeOpening: 0, stableReach: !h.caught.waterMotion })
    // Preserve the palms' approach to their support when a nearly extended
    // wrist is tucked by IK. That small shortfall must not drop the fingers
    // into the lip and force a last-frame clearance fold.
    const palmBlend = blend < .8 ? blend : .8 + .2 * smooth((blend - .8) / .2)
    for (const name of ['frontArm', 'backArm'] as const) pose[name].hand = mix(
      add(handGeometry(source[name]).palm, shift), handGeometry(target[name]).palm, palmBlend)
    pose = clearBody(p, pose).pose
    pose.frontArm = clearLimb(p, pose.frontArm, UPPER_ARM, FOREARM, 1, true, true)
    pose.backArm = clearLimb(p, pose.backArm, UPPER_ARM, FOREARM, 1, true, true)
    for (const name of ['frontLeg', 'backLeg'] as const) {
      pose[name] = clearAirborneFoot(p, { ...pose[name], ...clearLimb(p, pose[name], 15, 14.5, -1) })
    }
    return pose
  }
  const descent = p.mantle?.crouched && p.mantle.descending
  if (descent && p.mantle!.time < LEDGE_CATCH_TIME) {
    const caught = descent.caught, turn = (caught.facing ?? p.facing) * p.facing
    const source = presentedAthletePose({ ...p, ...caught, anim: { ...p.anim, ...caught.anim }, mantle: null, hang: null, climbing: null, pushing: null, landing: 0 })
    const mirror = (point: Point): Point => [point[0] * turn, point[1]]
    const limb = <T extends Limb>(part: T): T => ({ ...part, root: mirror(part.root), joint: mirror(part.joint), end: mirror(part.end), hand: part.hand && mirror(part.hand) })
    const from = { ...source, hip: mirror(source.hip), waist: mirror(source.waist), shoulder: mirror(source.shoulder), head: mirror(source.head),
      frontArm: limb(source.frontArm), backArm: limb(source.backArm), frontLeg: limb(source.frontLeg), backLeg: limb(source.backLeg) }
    const target = ledgePose({ ...p, mantle: { ...p.mantle!, time: LEDGE_CATCH_TIME } })
    return transferPose(from, target, [(caught.x - p.x) * p.facing, caught.y - p.y], smooth(p.mantle!.time / LEDGE_CATCH_TIME), [0, 0], 0, turn < 0)
  }
  const catchTime = p.hang?.caught.climbing?.rope ? ROPE_LEDGE_CATCH_TIME : LEDGE_CATCH_TIME
  if (p.hang?.caught.climbing && p.hang.time < catchTime) {
    const h = p.hang, source = presentedAthletePose({ ...p, ...h.caught, anim: { ...p.anim, ...h.caught.anim }, hang: null, mantle: null, landing: 0 })
    const target = ledgePose({ ...p, hang: { ...h, time: catchTime } })
    const blend = smooth(h.time / catchTime)
    // The body follows the collision-safe outward arc when the rope is directly under the lip.
    const root = climbFrame(0, h.braced, h.slope, false, 20, h.outwardSlope).root
    const offset: Point = [(p.x - lerp(h.caught.x, h.edgeX + h.side * root[0], blend)) * p.facing,
      p.y - lerp(h.caught.y, h.edgeY + root[1], blend)]
    return transferPose(source, target, [(h.caught.x - p.x) * p.facing, h.caught.y - p.y], blend, offset, h.caught.climbing?.rope ? 6 : 0)
  }
  const edge = p.mantle ?? p.hang!
  const t = p.mantle ? p.mantle.descending ? 1 - clamp((p.mantle.time - LEDGE_CATCH_TIME) / LEDGE_CLIMB_TIME) : clamp(p.mantle.time / LEDGE_CLIMB_TIME) : 0
  const crouched = !!p.mantle?.crouched, frame = climbFrame(t, edge.braced, edge.slope, crouched, p.mantle?.inset, edge.outwardSlope)
  const origin: Point = [(edge.edgeX - p.x) * p.facing, edge.edgeY - p.y]
  const at = (point: Point) => add(origin, point)
  let hip = at(frame.hip), waist = at(frame.waist), shoulder = at(frame.shoulder), head = at(frame.head)
  let frontFoot = at(frame.frontFoot), backFoot = at(frame.backFoot)
  const balance = smooth((t - .48) / .09) * (1 - smooth((t - .8) / .2))
  const rest = smooth((t - .8) / .2) * Number(!crouched), relaxed = rest * .24
  let frontFree = armPose(add(shoulder, [0, .7]), -.03 + balance * 1.1 + relaxed, .1 + balance * 1.1 + rest * .16)
  let backFree = armPose(add(shoulder, [0, .7]), -.03 - balance * .8 - relaxed, .1 + balance * 1.7 + rest * .24)
  if (crouched) {
    const fold = smooth((t - .73) / .23)
    frontFree = armPose(add(shoulder, [0, .7]), lerp(-.03 + balance * 1.1, -.65, fold), lerp(.1 + balance * 1.1, 2.1, fold))
    backFree = armPose(add(shoulder, [0, .7]), lerp(-.03 - balance * .8, -.75, fold), lerp(.1 + balance * 1.7, 2.2, fold))
  }
  let catchWeight = 1, catchFeet: [Leg, Leg] | null = null
  const catching = p.hang && p.hang.time < LEDGE_CATCH_TIME ? { caught: p.hang.caught, time: p.hang.time }
    : p.mantle?.descending && p.mantle.time < LEDGE_CATCH_TIME ? { caught: p.mantle.descending.caught, time: p.mantle.time } : null
  if (catching) {
    const h = catching, source = athletePose({ ...p, climbing: null, ...h.caught, anim: { ...p.anim, ...h.caught.anim }, hang: null, mantle: null, landing: 0 })
    const shift: Point = [(h.caught.x - p.x) * p.facing, h.caught.y - p.y]
    const from = (point: Point) => add(shift, point)
    catchWeight = smooth(h.time / LEDGE_CATCH_TIME)
    catchFeet = [source.frontLeg, source.backLeg]
    hip = mix(from(source.hip), hip, catchWeight); waist = mix(from(source.waist), waist, catchWeight)
    shoulder = mix(from(source.shoulder), shoulder, catchWeight); head = mix(from(source.head), head, catchWeight)
    frontFoot = mix(from(source.frontLeg.end), frontFoot, catchWeight); backFoot = mix(from(source.backLeg.end), backFoot, catchWeight)
    frontFree = { root: add(shoulder, [0, .7]), joint: from(source.frontArm.joint), end: from(source.frontArm.end) }
    backFree = { root: add(shoulder, [0, .7]), joint: from(source.backArm.joint), end: from(source.backArm.end) }
  }
  const root = add(shoulder, [0, .7])
  const grip = (point: Point) => at([point[0], point[1] + Math.max(0, point[0]) * (edge.slope ?? 0)])
  // Keep the rounded forearm above the lip while its palm stays on top.
  // A distant first catch has no spare reach: raise only within the arm's
  // reachable sphere, then tuck the wrist as the shoulder approaches it.
  const wrist = grip(FRONT_WRIST), reach = UPPER_ARM + FOREARM - .02
  const available = wrist[1] - root[1] + Math.sqrt(Math.max(0, reach ** 2 - (wrist[0] - root[0]) ** 2))
  // The tip's 1.05-unit radius plus the usual .05-unit skin separation.
  const wristLift = Math.max(0, Math.min(1.1, available - .001))
  // When the arm cannot spare the full vertical lift, tuck the wrist around
  // the corner horizontally. The palm retains its existing top-surface grip.
  const cornerX = (edge.edgeX - p.x) * p.facing
  const wristInset = Math.max(0, Math.sqrt(Math.max(0, 1.1 ** 2 - wristLift ** 2)) - Math.abs(wrist[0] - cornerX))
  const frontWrist = add(wrist, [-wristInset, -wristLift])
  const sway = freeHangSway(p)
  if (sway) {
    // Hanging free, the body swings from its shoulders under arms locked to the grip (see hangSway), so the arms,
    // wrists and head stay exactly as the resting hang places them.
    const turn = (point: Point, pivot: Point, angle: number): Point => {
      const x = point[0] - pivot[0], y = point[1] - pivot[1]
      return [pivot[0] + x * Math.cos(angle) + y * Math.sin(angle), pivot[1] - x * Math.sin(angle) + y * Math.cos(angle)]
    }
    const pivot = shoulder, swung = (angle: number) => [hip, waist].map(point => turn(point, pivot, angle))
    // Swinging toward the wall, the trunk stops short of any face below the lip rather than entering it.
    const blocked = ([h, w]: Point[]) => [[h, w], [w, shoulder]].some(([a, b]) => [0, .25, .5, .75].some(f => !!bodyIntrusion(p, mix(a, b, f), 2.8)))
    let angle = sway.body
    if (angle > 0 && p.terrain && blocked(swung(angle))) {
      let low = 0, high = angle
      for (let i = 0; i < 10; i++) { const mid = (low + high) / 2; if (blocked(swung(mid))) high = mid; else low = mid }
      angle = low
    }
    ;[hip, waist] = swung(angle)
    frontFoot = turn(turn(frontFoot, pivot, angle), hip, sway.legs - sway.body); backFoot = turn(turn(backFoot, pivot, angle), hip, sway.legs - sway.body)
    // A foot drawn up bends its knee forward a little, as dangling legs do.
    frontFoot = add(frontFoot, [sway.lifts[0] * .6, -sway.lifts[0]]); backFoot = add(backFoot, [sway.lifts[1] * .6, -sway.lifts[1]])
  }
  const frontArm = grippingArm(root, frontWrist, grip(FRONT_GRIP), frontFree, catchWeight * (1 - frame.frontRelease), .9)
  const backArm = grippingArm(root, grip(BACK_WRIST), grip(BACK_GRIP), backFree, catchWeight * (1 - frame.backRelease), .9)
  // The loaded palm rests along the top face, including an inclined bank.
  // Keeping it horizontal lets the enlarged fingertips cut into uphill rock.
  const palmAngle = Math.atan(edge.slope ?? 0)
  frontArm.handAngle = mixAngle(handGeometry(frontFree).angle, palmAngle, catchWeight * (1 - frame.frontRelease))
  backArm.handAngle = mixAngle(handGeometry(backFree).angle, palmAngle, catchWeight * (1 - frame.backRelease))
  const legRoot = add(hip, [0, 1])
  const folded = crouched && t > .73 || (p.mantle?.inset ?? 20) < 20 && t > .54
  let frontLeg = solveLeg(legRoot, frontFoot, .15 * (1 - smooth(t / .45)), folded, frame.frontPlanted)
  // The lifted free shoe can pass close to the hip before it plants. Allow
  // that knee to gather instead of pushing the ankle back down toward the lip.
  let backLeg = solveLeg(legRoot, backFoot, .25 * (1 - smooth(t / .65)), folded || t > .6 && t < .73, frame.backPlanted)
  // Soften ankle flex before contact; the support foot then remains exactly flat.
  const flatten = (leg: Leg, weight: number) => { leg.footAngle = mixAngle(leg.footAngle, Math.atan(edge.slope ?? 0), weight); leg.toeAngle *= 1 - weight }
  flatten(frontLeg, smooth((t - .86) / .1)); flatten(backLeg, smooth((t - .56) / .07))
  const toeBrace = edge.braced ? wallToeBrace(edge.outwardSlope) : null
  for (const [i, leg] of [frontLeg, backLeg].entries()) {
    if (toeBrace) {
      const release = smooth((t - .04) / .2)
      leg.footAngle = lerp(toeBrace.footAngle, leg.footAngle, release)
      leg.toeAngle = lerp(toeBrace.toeAngle, leg.toeAngle, release)
    }
    if (catchFeet) {
      leg.footAngle = lerp(catchFeet[i].footAngle, leg.footAngle, catchWeight)
      leg.toeAngle = lerp(catchFeet[i].toeAngle, leg.toeAngle, catchWeight)
    }
  }
  // A swinging free hang keeps its feet out of a face that retreats only a little way below the lip.
  if (sway && p.terrain) { frontLeg = clearAirborneFoot(p, frontLeg); backLeg = clearAirborneFoot(p, backLeg) }
  return { hip, waist, shoulder, head, frontArm, backArm, frontLeg, backLeg }
}

/** The existing pull/knee/trailing-foot choreography, looking toward the wall.
 * Its forward reach becomes depth; anatomical shoulder/hip width stays visible. */
function rearLedgePose(p: Player): AthletePose {
  const m = p.mantle!, entry = m.ladder!, t = ladderMantleProgress(m.time, entry.entry), frame = climbFrame(t)
  const source = ledgePose({ ...p, x: m.edgeX + frame.root[0] * p.facing, terrain: undefined,
    mantle: { ...m, ladder: undefined, time: t * LEDGE_CLIMB_TIME } })
  const rear = 1 - smooth((t - .84) / .16), angle = rear * Math.PI / 2, cos = Math.cos(angle), sin = Math.sin(angle)
  const point = ([x, y]: Point): Point => [x * cos, y]
  const limb = (part: Limb, side: number, upper: number, lower: number, rootSpread: number, endSpread: number): Limb => {
    const root: Point = [part.root[0] * cos + side * rootSpread * rear, part.root[1]]
    const end: Point = [part.end[0] * cos - (part.endDepth ?? 0) * sin + side * endSpread * rear, part.end[1]]
    const depth = (part.end[0] - part.root[0]) * sin + (part.endDepth ?? 0) * cos
    const reach = limbReach(root, end, upper, lower, depth)
    const joint = [part.joint[0] * cos - (part.jointDepth ?? 0) * sin + side * (rootSpread + endSpread) / 2 * rear,
      part.joint[1], (part.joint[0] - part.root[0]) * sin + (part.jointDepth ?? 0) * cos]
    const bend = [joint[0] - root[0] - reach.center[0], joint[1] - root[1] - reach.center[1], joint[2] - reach.center[2]]
    const solved = limbOnBend(reach, bend, [side * rear, -reach.axis[0], 1 - rear])
    const hand = part.hand && add(solved.end, [(part.hand[0] - part.end[0]) * cos, part.hand[1] - part.end[1]])
    return { ...part, ...solved, hand }
  }
  const leg = (part: Leg, side: number): Leg => ({ ...part, ...limb(part, side, 15, 14.5, 2.7, 3.5),
    rear, footAngle: part.footAngle * (1 - rear), toeAngle: part.toeAngle * (1 - rear) })
  const pose: AthletePose = { hip: point(source.hip), waist: point(source.waist), shoulder: point(source.shoulder), head: point(source.head),
    frontArm: limb(source.frontArm, -1, UPPER_ARM, FOREARM, 3.9, 5.5), backArm: limb(source.backArm, 1, UPPER_ARM, FOREARM, 3.9, 5.5),
    frontLeg: leg(source.frontLeg, -1), backLeg: leg(source.backLeg, 1), sideView: 1 - rear, backView: rear }
  if (m.time < 0) {
    const caught = presentedAthletePose({ ...p, x: entry.x, y: entry.y, climbing: entry.climb, mantle: null, hang: null })
    return transferPose(caught, pose, [(entry.x - p.x) * p.facing, entry.y - p.y], smooth((m.time + LEDGE_CATCH_TIME) / LEDGE_CATCH_TIME),
      [0, 0], 0, false, 0, { depth: 3, kneeOpening: 0, stableReach: true })
  }
  return pose
}
