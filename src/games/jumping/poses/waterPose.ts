// Swimming, floating, water landings and ceilings, and the swimming body outline.
import { handGeometry, pushPalmFrame } from '../androidHand.ts'
import { WATER_LANDING_RELEASE, WATER_LANDING_TIME } from '../athleteAnimation.ts'
import { clearAirborneFoot, clearBody, clearLimb } from '../athleteClearance.ts'
import { athletePose } from '../athletePose.ts'
import { FOREARM, MIN_KNEE_OPENING, TAU, UPPER_ARM, add, lerp, mix, mixAngle, reflectAthletePose, rotatePose, smooth, solve, solveNear, solveRear, transferPose } from '../athleteRig.ts'
import type { AthletePose, Leg } from '../athleteRig.ts'
import type { Prop } from '../challenge.ts'
import { bodyPolygon } from '../geometry.ts'
import { BACK_GRIP, BACK_WRIST, FRONT_GRIP, FRONT_WRIST } from '../ledge.ts'
import type { Limb, Point } from '../limbPose.ts'
import { TUNING } from '../movementTuning.ts'
import { propPushHands } from '../propGeometry.ts'
import { grippingArm } from './ledgePose.ts'
import { gaitPose } from '../gait.ts'
import type { Player } from '../characterTypes.ts'

/** Breaststroke coordinates the pull, recovery, kick and glide. Submerged
 * steering leads through the chest and neck while the hips and feet trail. */
export function waterPose(p: Player): AthletePose {
  const motion = p.waterMotion!
  const clearancePlayer = p.terrain ? { ...p, terrain: p.terrain.filter(b => !b.looseProp) } : p
  if (motion.landing) return waterLandingPose(p)
  const pushing = !p.grounded ? smooth(p.pushing?.amount ?? 0) : 0
  const floatHip: Point = [0, -31.4], floatWaist: Point = [.2, -38], floatShoulder: Point = [.5, -48], floatHead: Point = [2.8, -55.3]
  const baseScull = motion.scull ?? motion.phase, bob = p.waterBob?.amount ?? 0
  const scull = (Math.sin(baseScull) * (1 - bob) + Math.sin(baseScull + (p.waterBob?.phase ?? 0)) * bob) * .8
  const quietFloat = (1 - smooth(motion.amount)) * (1 - (motion.bottom ?? 0)) * (1 - pushing)
    * (1 - smooth(Math.hypot(p.vx, p.vy) / 25))
  const floatingLeg = (back: boolean): Leg => {
    const drift = Math.sin(baseScull + (back ? Math.PI : .6)) * .65 * quietFloat
    return { ...solve(add(floatHip, [back ? -1 : 0, 0]), [(back ? -2 : 2) + drift, back ? -2.5 : -2], 15, 14.5, -1),
      footAngle: Math.PI / 2 + (back ? .05 : -.15) + drift * .06, toeAngle: 0, footFacing: 1, planted: false }
  }
  const floatingArm = (back: boolean): Limb => ({ ...solve(add(floatShoulder, [back ? -1.2 : 0, .5]),
    [back ? 3 - scull : 10 + scull, back ? -42.5 : -40], UPPER_ARM, FOREARM, 1), handAngle: (back ? -scull : scull) * .12 })
  const floating = rotatePose({ hip: floatHip, waist: floatWaist, shoulder: floatShoulder, head: floatHead,
    frontArm: floatingArm(false), backArm: floatingArm(true),
    frontLeg: floatingLeg(false), backLeg: floatingLeg(true) }, 0, p.facing)
  // A quiet float breathes through a small sway and drifting ankles. Rotate the
  // intact rig around the hips; the physical depth and clearance solve stay live.
  const upright = rotatePose(floating, Math.sin(baseScull) * .04 * quietFloat, 1, floatHip)
  const cycle = (motion.phase / TAU % 1 + 1) % 1
  const strokeWeight = smooth((motion.amount - .65) / .35) * Math.max(smooth(motion.effort ?? Math.hypot(p.vx, p.vy) / 70), pushing * (p.pushing?.effort ?? 0))
  const steering = smooth(motion.steering ?? Number(motion.underwater ?? false))
  const breath = smooth((cycle - .22) / .2) * (1 - smooth((cycle - .55) / .17)) * strokeWeight * (1 - steering)
  const resting = steering * (1 - smooth(Math.hypot(p.vx, p.vy) / 35))
  const hip: Point = [-7, -9], waist: Point = [-.5, -8.6], shoulder: Point = [9.6, -8 - breath * 2], head: Point = [17.6, -7.8 - breath * 5]
  const out = smooth((cycle - .18) / .2) * strokeWeight, inward = smooth((cycle - .38) / .17) * strokeWeight, forward = smooth((cycle - .55) / .17) * strokeWeight
  const dx = 18.7 - out * 11.7 - inward * 5 + forward * 16.7 - resting * (2 + scull), dy = out * 6 + inward * 2 - forward * 8 + resting * (1.5 + scull)
  const arm = (back: boolean): Limb => {
    const sweep = Math.sin(Math.PI * smooth((cycle - .18) / .37))
    const root = add(shoulder, [back ? -.5 : 0, back ? -.6 : .6])
    return solveRear(root, add(root, [dx, dy]), UPPER_ARM, FOREARM, 1, 1 - sweep * .5)
  }
  const tuck = smooth((cycle - .28) / .24), kick = smooth((cycle - .55) / .23), folded = tuck * (1 - kick) * strokeWeight + resting * (.15 + scull * .025)
  const leg = (back: boolean): Leg => ({ ...solveRear(add(hip, [back ? -.4 : 0, back ? .4 : 1]),
    [-36.3 + folded * 16, (back ? -8.6 : -8) + folded * 5], 15, 14.5, -1, 1 - folded * .65),
    footAngle: Math.PI - folded * .65, toeAngle: 0, footFacing: 1, planted: false })
  let stroke: AthletePose = { hip, waist, shoulder, head, frontArm: arm(false), backArm: arm(true),
    frontLeg: leg(false), backLeg: leg(true), headTilt: Math.PI / 2 }
  const bend = (motion.bend ?? 0) * smooth(motion.amount) * (1 - (motion.bottom ?? 0)) * (1 - pushing)
  if (bend) {
    const around = (point: Point, root: Point, angle: number): Point => {
      const x = point[0] - root[0], y = point[1] - root[1], c = Math.cos(angle), s = Math.sin(angle)
      return [root[0] + x * c - y * s, root[1] + x * s + y * c]
    }
    const waist = around(stroke.waist, stroke.hip, bend * .3)
    const chestShift: Point = [waist[0] - stroke.waist[0], waist[1] - stroke.waist[1]]
    const shoulder = add(around(stroke.shoulder, stroke.waist, bend * 1.1), chestShift)
    const head = add(around(stroke.head, stroke.shoulder, bend * 1.2), [shoulder[0] - stroke.shoulder[0], shoulder[1] - stroke.shoulder[1]])
    const steerArm = (limb: Limb): Limb => {
      const root = add(around(limb.root, stroke.shoulder, bend * 1.1), [shoulder[0] - stroke.shoulder[0], shoulder[1] - stroke.shoulder[1]])
      const shift: Point = [root[0] - limb.root[0], root[1] - limb.root[1]]
      return { ...limb, root, joint: add(around(limb.joint, limb.root, bend * 1.2), shift), end: add(around(limb.end, limb.root, bend * 1.2), shift) }
    }
    const trailLeg = (leg: Leg): Leg => ({ ...leg, joint: around(leg.joint, leg.root, -bend * .12),
      end: around(leg.end, leg.root, -bend * .12), footAngle: leg.footAngle - bend * .12 })
    stroke = { ...stroke, waist, shoulder, head, frontArm: steerArm(stroke.frontArm), backArm: steerArm(stroke.backArm),
      frontLeg: trailLeg(stroke.frontLeg), backLeg: trailLeg(stroke.backLeg), headTilt: Math.PI / 2 + bend }
  }
  const angle = motion.dive * Math.PI / 2, cos = Math.cos(angle), sin = Math.sin(angle)
  const point = ([x, y]: Point): Point => [x * cos - (y + 8) * sin, -8 - Math.abs(motion.dive) * 21 + x * sin + (y + 8) * cos]
  const limb = (value: Limb): Limb => ({ ...value, root: point(value.root), joint: point(value.joint), end: point(value.end) })
  stroke = { hip: point(stroke.hip), waist: point(stroke.waist), shoulder: point(stroke.shoulder), head: point(stroke.head),
    frontArm: limb(stroke.frontArm), backArm: limb(stroke.backArm),
    frontLeg: { ...stroke.frontLeg, ...limb(stroke.frontLeg), footAngle: stroke.frontLeg.footAngle + angle },
    backLeg: { ...stroke.backLeg, ...limb(stroke.backLeg), footAngle: stroke.backLeg.footAngle + angle }, headTilt: (stroke.headTilt ?? Math.PI / 2) + angle }
  // Rotate the spine into the heading; the deliberate tuck below gathers the
  // limbs without collapsing the torso or changing their segment lengths.
  const transitionHip = mix(floatHip, stroke.hip, motion.amount)
  const extended = rotatePose(upright, (Math.PI / 2 + angle) * motion.amount, 1, floatHip,
    [transitionHip[0] - floatHip[0], transitionHip[1] - floatHip[1]])
  const alignedStroke = rotatePose(stroke, -(Math.PI / 2 + angle) * (1 - motion.amount), 1, stroke.hip,
    [transitionHip[0] - stroke.hip[0], transitionHip[1] - stroke.hip[1]])
  let pose = motion.amount ? transferPose(extended, alignedStroke, [0, 0], motion.amount, [0, 0], 0, true) : upright
  const gather = (motion.gather ?? 0) * (1 - (motion.bottom ?? 0)) * (1 - pushing)
  if (gather) {
    const dx = pose.shoulder[0] - pose.hip[0], dy = pose.shoulder[1] - pose.hip[1], length = Math.hypot(dx, dy)
    const u: Point = [dx / length, dy / length], normal: Point = [-u[1], u[0]]
    const at = (root: Point, forward: number, below: number): Point => add(root, [u[0] * forward + normal[0] * below, u[1] * forward + normal[1] * below])
    const waist = at(pose.hip, Math.cos(.35) * 6.5, Math.sin(.35) * 6.5)
    const shoulder = at(waist, Math.cos(.9) * 10.1, Math.sin(.9) * 10.1)
    const leg = (back: boolean): Leg => {
      const source = back ? pose.backLeg : pose.frontLeg
      return { ...source, ...solveRear(source.root, at(pose.hip, -4, back ? 9 : 11), 15, 14.5, -1, back ? .75 : .95),
        footAngle: Math.atan2(u[1], u[0]) + 1.5, planted: false }
    }
    const arm = (back: boolean): Limb => {
      const source = back ? pose.backArm : pose.frontArm
      const root = add(shoulder, [source.root[0] - pose.shoulder[0], source.root[1] - pose.shoulder[1]])
      return solveRear(root, at(root, back ? -3 : -2, back ? 6 : 8), UPPER_ARM, FOREARM, 1, back ? .75 : .95)
    }
    const curled = { ...pose, waist, shoulder, head: at(shoulder, 5, 4),
      frontArm: arm(false), backArm: arm(true), frontLeg: leg(false), backLeg: leg(true) }
    // Fold the hands through depth instead of letting a wrist cross directly
    // through its shoulder and flip the elbow's bend axis during the dive.
    pose = transferPose(pose, curled, [0, 0], gather, [0, 0], 0, true, 0,
      { depth: Math.sin(Math.PI * gather) * 8, kneeOpening: 0, armOpening: Math.PI / 4 * gather })
  }
  if (motion.bottom) {
    // Neutral buoyancy lets the whole planted rig rest naturally on the floor.
    const planted = athletePose({ ...p, waterMotion: undefined, freeFall: null, landing: 0,
      // This is the water floor-contact endpoint, including its release blend.
      // A buoyant lift must not make that endpoint adopt dry apex balance.
      gait: { ...(p.gait ?? gaitPose(p.vx)), air: 0 } })
    pose = motion.bottom >= 1 ? planted : transferPose(pose, planted, [0, 0], motion.bottom, [0, 0], 0, true)
  }
  const propLean = motion.propLean ?? 0
  if (propLean || pushing && p.pushing?.palms) {
    // Aim down toward a small floor prop, or lift the face during an ordinary
    // prone push. Rotate the whole fixed-length rig around the hips.
    const tilt = propLean * (1 + 2 * (1 - smooth(motion.amount / .75)))
    pose = rotatePose(pose, tilt - .22 * pushing * (1 - smooth(propLean / .2)), 1, pose.hip)
  }
  if (!p.grounded) {
    // Turn through depth while gathered instead of mirroring the extended body
    // in one frame. Every projected limb retains its actual bone lengths.
    const cos = (motion.heading ?? p.facing) * p.facing
    const lead = cos + ((motion.leadHeading ?? motion.heading ?? p.facing) * p.facing - cos) * steering
    const point = ([x, y]: Point, turn = cos): Point => [x * turn, y]
    const limb = (value: Limb, turn = cos, root = point(value.root)): Limb => {
      // Keep the turn's depth axis in world space when mechanical facing flips.
      // Otherwise a bent elbow changes sides in one frame halfway through yaw.
      const sin = Math.sqrt(Math.max(0, 1 - turn ** 2)) * p.facing
      const at = (position: Point, depth: number): Point => [root[0] + (position[0] - value.root[0]) * turn - depth * sin, position[1]]
      return { ...value, root, joint: at(value.joint, value.jointDepth ?? 0), end: at(value.end, value.endDepth ?? 0),
        ...(value.hand ? { hand: at(value.hand, value.endDepth ?? 0) } : {}),
        ...(value.handAngle === undefined ? {} : { handAngle: Math.atan2(Math.sin(value.handAngle), Math.cos(value.handAngle) * turn) }),
        jointDepth: (value.joint[0] - value.root[0]) * sin + (value.jointDepth ?? 0) * turn,
        endDepth: (value.end[0] - value.root[0]) * sin + (value.endDepth ?? 0) * turn }
    }
    const shoulder = point(pose.shoulder, cos * .25 + lead * .75)
    const arm = (value: Limb): Limb => limb(value, lead, [shoulder[0] + (value.root[0] - pose.shoulder[0]) * lead, value.root[1]])
    const leg = (value: Leg): Leg => ({ ...value, ...limb(value), footAngle: Math.atan2(Math.sin(value.footAngle), Math.cos(value.footAngle) * cos) })
    pose = { ...pose, hip: point(pose.hip), waist: point(pose.waist, cos * .65 + lead * .35), shoulder, head: point(pose.head, lead),
      frontArm: arm(pose.frontArm), backArm: arm(pose.backArm), frontLeg: leg(pose.frontLeg), backLeg: leg(pose.backLeg) }
  }
  if (p.terrain && !p.grounded) {
    if (motion.ceiling?.amount) pose = waterCeilingPose(p, pose)
    const cleared = clearBody(p, pose, motion.bodyOffset)
    pose = { ...cleared.pose, waterOffset: cleared.offset }
  }
  if (pushing && p.pushing?.palms) {
    const press = (arm: Limb, index: number) => {
      const palm = p.pushing!.palms![index]
      const point: Point = [(palm.x - p.x) * p.facing, palm.y - p.y], normal: Point = [palm.nx * p.facing, palm.ny]
      const frame = pushPalmFrame(point, normal)
      const pressed = solve(arm.root, frame.wrist, UPPER_ARM, FOREARM, 1)
      const grip = { ...pressed, hand: add(pressed.end, [frame.palm[0] - frame.wrist[0], frame.palm[1] - frame.wrist[1]]),
        handAngle: frame.angle, handOpen: 1 }
      const free = { ...arm, hand: handGeometry(arm).palm }
      // Keep the stroke's depth bend as contact fades. Flattening a 3D arm
      // before blending used to make the wrist snap on its last contact frame.
      return transferPose({ ...pose, frontArm: free }, { ...pose, frontArm: grip }, [0, 0], pushing,
        [0, 0], 0, true).frontArm
    }
    pose.frontArm = press(pose.frontArm, 0); pose.backArm = press(pose.backArm, 1)
  }
  if (motion.wall && !pushing) {
    const gap = (motion.wall.x - p.x) * p.facing
    const brace = (arm: Limb, back: boolean) => {
      const palm: Point = [gap - 1.5, arm.root[1] + (back ? 3 : 6)]
      const wrist: Point = [gap - 2.8, palm[1]]
      const reach = smooth((27 - Math.hypot(wrist[0] - arm.root[0], wrist[1] - arm.root[1])) / 10)
      const contact = motion.wall!.amount * reach
      return contact ? grippingArm(arm.root, wrist, palm, arm, contact) : arm
    }
    pose.frontArm = brace(pose.frontArm, false); pose.backArm = brace(pose.backArm, true)
  }
  if (motion.floor && !pushing && motion.amount > .65) {
    // The arm's fixed bones limit this late reach without turning the torso.
    const x = p.x + pose.frontArm.root[0] * p.facing
    const y = motion.floor.y + (x - p.x) * Math.tan(motion.floor.angle)
    const point: Point = [pose.frontArm.root[0], y - p.y]
    const normal: Point = [Math.sin(motion.floor.angle) * p.facing, -Math.cos(motion.floor.angle)]
    pose.frontArm = grippingArm(pose.frontArm.root, add(point, [normal[0] * 2.8, normal[1] * 2.8]),
      add(point, [normal[0] * 1.6, normal[1] * 1.6]), pose.frontArm, motion.floor.reach)
  }
  if (motion.ceiling?.amount && !p.grounded) pose = waterCeilingHands(p, pose)
  if (p.ledgeReach) {
    const origin: Point = [(p.ledgeReach.x - p.x) * p.facing, p.ledgeReach.y - p.y]
    pose.frontArm = grippingArm(pose.frontArm.root, add(origin, FRONT_WRIST), add(origin, FRONT_GRIP), pose.frontArm, p.ledgeReach.amount)
    pose.backArm = grippingArm(pose.backArm.root, add(origin, BACK_WRIST), add(origin, BACK_GRIP), pose.backArm, p.ledgeReach.amount)
  }
  if (p.terrain && !p.grounded) {
    // Loose floats occlude free strokes instead of folding each knee/palm
    // around a moving polygon. Working hands still fit their actual surface.
    const leg = (source: Leg) => {
      let current = source
      for (let i = 0; i < 4; i++) {
        const foot = clearAirborneFoot(clearancePlayer, current, 16)
        const limb = clearLimb(clearancePlayer, foot, 15, 14.5, -1)
        if (foot === current && limb === foot) break
        current = { ...current, ...limb }
      }
      return current
    }
    pose.frontLeg = leg(pose.frontLeg); pose.backLeg = leg(pose.backLeg)
    const handsPlayer = p.pushing?.amount ? p : clearancePlayer
    pose.frontArm = clearLimb(handsPlayer, pose.frontArm, UPPER_ARM, FOREARM, 1, true)
    pose.backArm = clearLimb(handsPlayer, pose.backArm, UPPER_ARM, FOREARM, 1, true)
  }
  return pose
}

/** A small convex core follows the visible head and torso through pitch/yaw.
 * Free strokes provide its construction; limb clearance never changes physics. */
export function swimmingBodyOutline(p: Player): Point[] {
  const motion = p.waterMotion!
  const pose = waterPose({ ...p, terrain: undefined, ledgeReach: null,
    waterMotion: { ...motion, ceiling: undefined, wall: undefined, floor: undefined } })
  const points: Point[] = []
  for (const [center, radius] of [[pose.hip, 3.7], [pose.waist, 2.8], [pose.shoulder, 2.4], [pose.head, 6.25]] as const) {
    const r = radius / Math.cos(Math.PI / 8)
    for (let i = 0; i < 8; i++) {
      const angle = (i + .5) * TAU / 8
      points.push([(center[0] + Math.cos(angle) * r + (motion.bodyOffset?.[0] ?? 0)) * p.facing, center[1] + Math.sin(angle) * r + (motion.bodyOffset?.[1] ?? 0)])
    }
  }
  const compact = smooth(motion.amount / .4)
  // The upright float retains the standing contact envelope used by buoyancy
  // and bank catches. Blend convex hulls so this handoff has no size threshold.
  if (compact < 1) {
    const standing = bodyPolygon(0, 0, p.crouching ? TUNING.crouchHeight : TUNING.height)
    const core = points.splice(0)
    for (const [x, y] of core) for (const [sx, sy] of standing) points.push([x * compact + sx * (1 - compact), y * compact + sy * (1 - compact)])
  }
  return swimmingHull(points)
}

/** Keep the foot root as the floor contact while the head and torso determine
 * clearance above it. A horizontal swimmer has no standing cap overhead. */
export function swimmingTerrainOutline(core: readonly (readonly [number, number])[], ceiling?: NonNullable<Player['waterMotion']>['ceiling']): Point[] {
  const points: Point[] = [...core.map(([x, y]): Point => [x, y]), [0, 0]]
  // Leave a little room for the planted palms to lead an ascending head.
  if (ceiling?.amount) {
    const reach = 3 * smooth(ceiling.amount)
    points.push(...core.map(([x, y]): Point => [x - ceiling.nx * reach, y - ceiling.ny * reach]))
  }
  return swimmingHull(points)
}

function swimmingHull(points: Point[]): Point[] {
  points.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const cross = (a: Point, b: Point, c: Point) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
  const half = (input: Point[]) => {
    const hull: Point[] = []
    for (const point of input) {
      while (hull.length > 1 && cross(hull[hull.length - 2], hull[hull.length - 1], point) <= 0) hull.pop()
      hull.push(point)
    }
    return hull.slice(0, -1)
  }
  return [...half(points), ...half([...points].reverse())]
}

/** Prepare only nearby lips the swimming shoulders can actually reach. The
 * standing foot-to-hand window is much taller than a neck-depth float. */
export function swimmingLedgeReach(p: Player, edgeX: number, edgeY: number) {
  const motion = p.waterMotion!
  if ((motion.leadHeading ?? motion.heading ?? p.facing) * p.facing < .35) return 0
  const pose = waterPose({ ...p, terrain: undefined, ledgeReach: null,
    waterMotion: { ...motion, wall: undefined } })
  const offset = motion.bodyOffset ?? [0, 0]
  const edge: Point = [(edgeX - p.x) * p.facing, edgeY - p.y]
  let distance = 0
  for (const [arm, wrist] of [[pose.frontArm, FRONT_WRIST], [pose.backArm, BACK_WRIST]] as const) {
    const dx = edge[0] + wrist[0] - arm.root[0] - offset[0]
    const dy = edge[1] + wrist[1] - arm.root[1] - offset[1]
    // A horizontal approach cannot make an unreachable high lip usable.
    if (Math.abs(dy) > UPPER_ARM + FOREARM - .02) return 0
    distance = Math.max(distance, Math.hypot(dx, dy))
  }
  return smooth((26 - distance) / 8)
}

/** Fit swimming palms to the visible shoulder, rather than the standing hull.
 * Passing below a float leaves the stroke free until its side is within reach. */
export function swimmingPushHands(p: Player, prop: Prop, direction: number) {
  const motion = p.waterMotion
  if (!motion || (motion.leadHeading ?? motion.heading ?? p.facing) * direction < .35) return null
  const pose = waterPose({ ...p, terrain: undefined, pushing: null, waterMotion: { ...motion, ceiling: undefined } })
  const offset = motion.bodyOffset ?? [0, 0]
  pose.shoulder = add(pose.shoulder, offset)
  pose.waist = add(pose.waist, offset)
  pose.frontArm.root = add(pose.frontArm.root, offset); pose.backArm.root = add(pose.backArm.root, offset)
  const hands = propPushHands(prop, p.x, p.y, direction, -pose.shoulder[1])
  if (!hands?.palms) return null
  let distance = 0
  for (const [i, arm] of [pose.frontArm, pose.backArm].entries()) {
    const palm = hands.palms[i], dx = (palm.x - p.x) * p.facing - arm.root[0], dy = palm.y - p.y - arm.root[1]
    const forward: Point = [pose.shoulder[0] - pose.waist[0], pose.shoulder[1] - pose.waist[1]]
    if (dx * forward[0] + dy * forward[1] < 0) return null
    distance = Math.max(distance, Math.hypot(dx, dy))
  }
  if (distance >= 22) return null
  const shoulders = [pose.frontArm, pose.backArm].map(arm => [p.x + arm.root[0] * p.facing, p.y + arm.root[1]] as Point)
  return { hands, shoulders, reach: smooth((22 - distance) / 2) }
}

function waterCeilingPose(p: Player, source: AthletePose): AthletePose {
  const ceiling = p.waterMotion!.ceiling!, weight = smooth(ceiling.amount), load = ceiling.load * weight
  const lead = (p.waterMotion!.leadHeading ?? p.facing) * p.facing
  const chest = rotatePose(source, .12 * load * lead, 1, source.waist)
  let pose: AthletePose = { ...source, shoulder: chest.shoulder, head: chest.head, headTilt: chest.headTilt,
    frontArm: chest.frontArm, backArm: chest.backArm }
  const palm = ceiling.hands[0], normal: Point = [ceiling.nx * p.facing, ceiling.ny]
  const gap = (p.x + pose.frontArm.root[0] * p.facing - palm.x) * ceiling.nx
    + (p.y + pose.frontArm.root[1] - palm.y) * ceiling.ny - 2.8
  const lift = Math.max(0, Math.min(24, gap - 18 + load * 2)) * weight * smooth(p.waterMotion!.amount)
  pose = rotatePose(pose, 0, 1, [0, 0], [-normal[0] * lift, -normal[1] * lift])
  for (const name of ['frontLeg', 'backLeg'] as const) {
    const leg = pose[name], target = add(leg.root, [(leg.end[0] - leg.root[0]) * .8, (leg.end[1] - leg.root[1]) * .8 + 4])
    pose[name] = { ...leg, ...solveNear(leg, mix(leg.end, target, load * .2), 15, 14.5), planted: false }
  }
  return pose
}

function waterCeilingHands(p: Player, pose: AthletePose): AthletePose {
  const ceiling = p.waterMotion!.ceiling!, contact = smooth(ceiling.amount)
  for (const [i, name] of (['frontArm', 'backArm'] as const).entries()) {
    const free = pose[name], palm = ceiling.hands[i]
    const point: Point = [(palm.x - p.x) * p.facing, palm.y - p.y], normal: Point = [palm.nx * p.facing, palm.ny]
    const wrist = add(point, [normal[0] * 2.8, normal[1] * 2.8])
    const heading = (p.waterMotion!.leadHeading ?? p.facing) * p.facing
    const pressed = solveRear(free.root, wrist, UPPER_ARM, FOREARM, (i ? -1 : 1) * (Math.sign(heading) || 1), Math.abs(heading))
    const grip = { ...pressed, hand: add(pressed.end, [-normal[0] * 1.2, -normal[1] * 1.2]), handAngle: Math.atan2(-normal[0], normal[1]) }
    const angle = free.handAngle ?? Math.atan2(free.end[1] - free.joint[1], free.end[0] - free.joint[0])
    const withPalm = { ...free, hand: free.hand ?? add(free.end, [Math.cos(angle) * 1.4, Math.sin(angle) * 1.4]) }
    pose[name] = transferPose({ ...pose, [name]: withPalm }, { ...pose, [name]: grip }, [0, 0], contact, [0, 0], 6,
      false, 0, { depth: Math.sin(Math.PI * contact) * 8, kneeOpening: 0, armOpening: Math.PI / 3 })[name]
  }
  return pose
}

export function waterLandingPose(p: Player): AthletePose {
  const motion = p.waterMotion!, landing = motion.landing!
  const captured = landing.facing === p.facing ? landing.pose : reflectAthletePose(landing.pose)
  const from = rotatePose(captured, 0, 1,
    [0, 0], [0, landing.y - p.y])
  const t = landing.leaving ? smooth(landing.time / WATER_LANDING_RELEASE)
    : smooth(landing.time / WATER_LANDING_TIME)
  const target = landing.leaving
    ? waterPose({ ...p, waterMotion: { ...motion, landing: undefined, bottom: 0 } })
    : athletePose({ ...p, waterMotion: undefined, freeFall: null, dryTurn: null, slideEntry: null, landing: 0,
      footwork: null, gait: gaitPose(0) })
  const angle = (pose: AthletePose) => Math.atan2(pose.shoulder[1] - pose.hip[1], pose.shoulder[0] - pose.hip[0])
  let delta = Math.atan2(Math.sin(angle(target) - angle(from)), Math.cos(angle(target) - angle(from)))
  // A nearly vertical dive has two similar half-turns available. Continue
  // through the swimmer's forward side instead of changing sides at pi.
  const turnSide = landing.facing * p.facing
  if (!landing.leaving && from.shoulder[1] > from.hip[1]) {
    if (turnSide > 0 && delta > Math.PI / 2) delta -= TAU
    if (turnSide < 0 && delta < -Math.PI / 2) delta += TAU
  }
  const hip = mix(from.hip, target.hip, t)
  const outgoing = rotatePose(from, delta * t, 1, from.hip, [hip[0] - from.hip[0], hip[1] - from.hip[1]])
  const incoming = rotatePose(target, -delta * (1 - t), 1, target.hip, [hip[0] - target.hip[0], hip[1] - target.hip[1]])
  let pose = t === 1 ? target : transferPose(outgoing, incoming, [0, 0], t, [0, 0], Math.sin(Math.PI * t) * 6, true, 0,
    { depth: Math.sin(Math.PI * t) * 12, kneeOpening: MIN_KNEE_OPENING, armOpening: Math.PI / 2, legDepth: Math.sin(Math.PI * t) * 6 })
  const fold = landing.leaving ? 0 : Math.sin(Math.PI * t) ** 2 * .75
  if (t < 1) {
    const upperAngle = (s: AthletePose) => Math.atan2(s.shoulder[1] - s.waist[1], s.shoulder[0] - s.waist[0])
    const spineBend = (s: AthletePose) => {
      const lower = Math.atan2(s.waist[1] - s.hip[1], s.waist[0] - s.hip[0])
      return Math.atan2(Math.sin(upperAngle(s) - lower), Math.cos(upperAngle(s) - lower))
    }
    // Curl forward through the two spine segments. Shortening their endpoints
    // and choosing an IK side can arch the back the wrong way, then reverse it
    // as the standing rig arrives. A modest bend unwinds without that kink.
    const curl = fold * .47 * Math.min(1, Math.abs(delta) / Math.PI) * turnSide
    const bend = mixAngle(spineBend(from), spineBend(target), t) + curl
    const lowerLength = lerp(Math.hypot(from.waist[0] - from.hip[0], from.waist[1] - from.hip[1]),
      Math.hypot(target.waist[0] - target.hip[0], target.waist[1] - target.hip[1]), t)
    const upperLength = lerp(Math.hypot(from.shoulder[0] - from.waist[0], from.shoulder[1] - from.waist[1]),
      Math.hypot(target.shoulder[0] - target.waist[0], target.shoulder[1] - target.waist[1]), t)
    const lower = angle(from) + delta * t - Math.atan2(upperLength * Math.sin(bend), lowerLength + upperLength * Math.cos(bend))
    const waist = add(pose.hip, [Math.cos(lower) * lowerLength, Math.sin(lower) * lowerLength])
    const shoulder = add(waist, [Math.cos(lower + bend) * upperLength, Math.sin(lower + bend) * upperLength])
    const chestTurn = mixAngle(upperAngle(pose), lower + bend, 1) - upperAngle(pose)
    const chest = rotatePose(pose, chestTurn, 1, pose.shoulder,
      [shoulder[0] - pose.shoulder[0], shoulder[1] - pose.shoulder[1]])
    pose = { ...pose, waist, shoulder, head: chest.head, headTilt: chest.headTilt, frontArm: chest.frontArm, backArm: chest.backArm }
  }
  if (fold) {
    const dx = pose.shoulder[0] - pose.hip[0], dy = pose.shoulder[1] - pose.hip[1], span = Math.hypot(dx, dy)
    const u: Point = [dx / span, dy / span], normal: Point = [-u[1] * turnSide, u[0] * turnSide]
    for (const name of ['frontLeg', 'backLeg'] as const) {
      const leg = pose[name], tucked = add(pose.hip, [-u[0] * 4 + normal[0] * 11, -u[1] * 4 + normal[1] * 11])
      pose[name] = { ...leg, ...solveNear(leg, mix(leg.end, tucked, fold), 15, 14.5), planted: false }
    }
  }
  const point: Point = [(landing.hand.x - p.x) * p.facing, landing.hand.y - p.y]
  const normal: Point = [Math.sin(landing.hand.angle) * p.facing, -Math.cos(landing.hand.angle)]
  const tangent: Point = [-normal[1], normal[0]], wrist = add(point, [normal[0] * 2.8, normal[1] * 2.8])
  const contact = landing.leaving ? 0 : 1 - smooth((landing.time - .275) / .265)
  if (contact) {
    // Load the planted palm with a soft elbow, then extend it to lift and
    // redirect the chest. Moving the body with this reach makes the hand a
    // real support for the turn, rather than a brief touch during a rotation.
    const palm = captured.frontArm.hand ?? captured.frontArm.end
    const initial: Point = [captured.frontArm.root[0] - palm[0] - normal[0] * 2.8,
      captured.frontArm.root[1] + landing.y - landing.hand.y - normal[1] * 2.8]
    const absorb = smooth(landing.time / .095), push = smooth((landing.time - .075) / .2)
    const initialReach = Math.min(UPPER_ARM + FOREARM - .1, Math.hypot(...initial))
    const reach = lerp(lerp(initialReach, initialReach - 3 - 3.3 * landing.load, absorb), 18.6, push)
    const across = initial[0] * tangent[0] + initial[1] * tangent[1] + push * (3 + 3 * landing.load) * turnSide
    const height = Math.sqrt(Math.max(0, reach * reach - across * across))
    const root = add(wrist, [normal[0] * height + tangent[0] * across, normal[1] * height + tangent[1] * across])
    pose = rotatePose(pose, 0, 1, [0, 0], [(root[0] - pose.frontArm.root[0]) * contact, (root[1] - pose.frontArm.root[1]) * contact])
  }
  if (p.terrain) pose = clearBody(p, pose).pose
  if (contact) {
    const free = pose.frontArm, angle = free.handAngle ?? Math.atan2(free.end[1] - free.joint[1], free.end[0] - free.joint[0])
    const withPalm = { ...free, hand: free.hand ?? add(free.end, [Math.cos(angle) * 1.4, Math.sin(angle) * 1.4]) }
    const pressed = solve(free.root, wrist, UPPER_ARM, FOREARM, turnSide)
    const grip = { ...pressed, hand: add(pressed.end, [-normal[0] * 1.2, -normal[1] * 1.2]), handAngle: landing.hand.angle * p.facing }
    pose.frontArm = transferPose({ ...pose, frontArm: withPalm }, { ...pose, frontArm: grip }, [0, 0], contact, [0, 0], 6,
      false, 0, { depth: Math.sin(Math.PI * contact) * 8, kneeOpening: 0, armOpening: Math.PI / 3 }).frontArm
  }
  for (const name of ['frontArm', 'backArm'] as const) pose[name] = clearLimb(p, pose[name], UPPER_ARM, FOREARM, 1, true)
  if (t < 1) for (const name of ['frontLeg', 'backLeg'] as const) {
    const leg = clearAirborneFoot(p, pose[name], 16)
    pose[name] = { ...leg, ...clearLimb(p, leg, 15, 14.5, -1), planted: false }
  }
  return pose
}
