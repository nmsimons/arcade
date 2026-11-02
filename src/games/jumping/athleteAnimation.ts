// Animation state advanced by the movement step: turns, slide entry, recoveries, water presentation and the impact ragdoll.
import { clearAirborneFoot, clearBody, clearLimb, clearSlidingJoint } from './athleteClearance.ts'
import { articulateAnkles, athletePose } from './athletePose.ts'
import { physicsView } from './gameplayPose.ts'
import { FOREARM, HEAD_RADIUS, MIN_KNEE_OPENING, UPPER_ARM, add, clamp, lerp, reflectAthletePose, rotatePose, smooth, solveNear, transferPose } from './athleteRig.ts'
import type { AthletePose } from './athleteRig.ts'
import { FOOT_CONTACT, advanceFootwork, footPoint } from './footwork.ts'
import { canGrip } from './friction.ts'
import { lineBlocked, moveBody, nearestBoundary, platformOutline } from './geometry.ts'
import { mirrorPlayerState } from './gravityFrame.ts'
import { createImpactRagdoll, stepImpactRagdoll } from './impactRagdoll.ts'
import type { ImpactJoint, ImpactKind } from './impactRagdoll.ts'
import type { Point } from './limbPose.ts'
import { TUNING } from './movementTuning.ts'
import type { ContactWorld } from './playerContacts.ts'
import { fallRecoveryPose } from './poses/fallPose.ts'
import { transferPushTurn, transferReachingPushTurn } from './poses/turnPose.ts'
import { waterBodyPose, waterLandingPose, waterPose } from './poses/waterPose.ts'
import { propPushHands, smallSubmergedProp } from './propGeometry.ts'
import { groundAt } from './terrain.ts'
import { gaitPose } from './gait.ts'
import type { JumpInput, Player } from './characterTypes.ts'

export interface DryTurnFrame { pose: AthletePose; facing: number; grip: boolean; ledgeDrop?: boolean; slide?: boolean; pushing?: boolean; step?: NonNullable<Player['mantle']> }
export interface SlideEntryFrame { player: Player; facing: number; sliding: boolean }

/** A cancelled climb can prepare for a real incoming prop while its root
 * retraces the safe path. This query supplies no force or ground contact. */
export function advanceReturningStepPreparation(p: Player, input: JumpInput, dt: number, world: ContactWorld) {
  const step = p.mantle?.returning && p.mantle.step
  if (!step || step.climbing) return
  const direction = Math.sign(input.move), previous = step.returnPreparation
  const candidates = Math.abs(input.move) > .1 ? world.colliders.flatMap(collider => {
    if (!collider.prop) return []
    const hands = propPushHands(collider.prop, p.x, p.y, direction, 43 - p.crouch * 15, 72)
    if (!hands || hands.height! < -12 || hands.height! > 74) return []
    const gap = (hands.wallX - p.x) * direction
    const sweep = moveBody([p.x,p.y], [p.x + direction * gap,p.y], world.platforms, TUNING.height)
    const hit = sweep.contacts.find(hit => hit.normal[0] * direction < -.4)
    return hit?.platform === collider.platform ? [{ hands, direction, colliderId: collider.id, gap }] : []
  }) : []
  candidates.sort((a,b) => a.gap - b.gap)
  const contact = candidates[0], wanted = contact ? 1 : 0
  // Begin gently, then finish the incoming reach before the returning body
  // reaches the floor. A uniformly faster blend snaps the initial turn.
  const preparationTime = contact ? .05 - .02 * smooth((previous?.amount ?? 0) / .5) : .05
  const amount = (previous?.amount ?? 0) + (wanted - (previous?.amount ?? 0)) * (1 - Math.exp(-dt / preparationTime))
  if (contact) step.returnPreparation = { ...contact, amount }
  else if (previous && amount > .001) step.returnPreparation = { ...previous, amount }
  else delete step.returnPreparation
}

/** Carry the gathered rig off a turning rope before releasing into free flight. */
export function captureRopeTurnRelease(p: Player): NonNullable<Player['releaseTurn']> {
  const turn = p.climbing!.turn!
  return { angle: turn.angle, target: turn.target, time: 0, facing: p.facing,
    ...(p.anim.cadence === 'off' ? {} : { pose: rotatePose(athletePose(p), -turn.angle, p.facing) }) }
}

/** Retain the side of a prop corner already cleared by the falling body.
 * Relax the presentation offset as space opens; drawing never changes it. */
export function settleFallClearance(p: Player, dt: number, previousFacing: number) {
  const fall = p.freeFall
  if (!fall?.amount || p.waterMotion || p.anim.recovery) return
  const offset = fall.bodyOffset ?? [0, 0]
  if (p.facing !== previousFacing) offset[0] *= -1
  const relaxed = offset.map(v => v - Math.sign(v) * Math.min(Math.abs(v), dt * 240)) as Point
  fall.bodyOffset = clearBody(p, fallRecoveryPose(p), relaxed, true).offset
}

/** Advance a spring to the feet from the actual preceding rig. Limit joint
 * travel in three dimensions so gathering cannot flip a knee across its IK
 * axis. The gait retains all real anchors; they become visible support only
 * when this handoff is complete. */
export function advanceMovingRecovery(p: Player, dt: number, traveling: boolean, captured?: DryTurnFrame | null) {
  const fall = p.freeFall
  if (!p.grounded) { p.anim.recovery = null; return }
  if (!p.anim.recovery) {
    if (!fall || fall.recovery === null || !traveling) return
    // The first steering press may already have changed mechanical facing.
    // Seed from the actual preceding rig, expressed in the new local frame.
    const source = captured?.pose ?? athletePose(p)
    p.anim.ragdoll = null
    p.anim.recovery = { pose: captured && captured.facing !== p.facing ? reflectAthletePose(source) : source,
      time: 0, facing: p.facing }
  }
  const motion = p.anim.recovery
  if (motion.facing !== p.facing) {
    motion.pose = reflectAthletePose(motion.pose)
    motion.facing = p.facing
  }
  motion.time += dt
  const target = athletePose({ ...p, freeFall: null, anim: { ...p.anim, ragdoll: null, dryTurn: null, recovery: null }, landing: 0 })
  const fraction = Math.min(1, dt / Math.max(dt, .1 - motion.time + dt))
  const from = motion.pose
  const points = (pose: AthletePose) => [pose.hip, pose.waist, pose.shoulder, pose.head,
    ...[pose.frontArm, pose.backArm, pose.frontLeg, pose.backLeg].flatMap(limb =>
      [[...limb.joint, limb.jointDepth ?? 0], [...limb.end, limb.endDepth ?? 0]])]
  const before = points(from), limit = 600 * dt
  const gathering = Math.max(0, 1 - motion.time / .1)
  const sample = (t: number) => t === 1 ? target : transferPose(from, target, [0, 0], t, [0, 0], 0, gathering > .5, gathering * 4)
  const safe = (pose: AthletePose) => points(pose).every((point, i) =>
    Math.hypot(...point.map((v, j) => v - before[i][j])) <= limit)
  let t = fraction, next = sample(t)
  if (!safe(next)) {
    let low = 0, high = t
    for (let i = 0; i < 14; i++) {
      const mid = (low + high) / 2
      if (safe(sample(mid))) low = mid; else high = mid
    }
    t = low; next = sample(t)
  }
  motion.pose = next
  if (t === 1) p.anim.recovery = null
}

/** Seed from the actual outgoing rig; impulse and pose use the same local
 * gravity frame. This never changes the motor, contact hull or input rules. */
export function startImpactRagdoll(p: Player, velocity: Point, kind: ImpactKind) {
  // Presentation only: an unanimated actor has no rig to recoil.
  if (p.anim.cadence === 'off') return
  if (p.inverted) {
    mirrorPlayerState(p); p.inverted = false
    try { startImpactRagdoll(p, [velocity[0], -velocity[1]], kind) }
    finally { mirrorPlayerState(p); p.inverted = true }
    return
  }
  if (p.anim.ragdoll?.kind === kind) {
    // Closely spaced hits add momentum to the same joints. Repeatedly seeding
    // from an already displaced rig would accumulate permanent contortions.
    const kick = createImpactRagdoll(p.anim.ragdoll.source, p.anim.ragdoll.facing, kind, ...velocity)
    for (const name of Object.keys(kick.joints) as ImpactJoint[]) {
      const spring = p.anim.ragdoll.joints[name]
      spring.speed = Math.max(-24, Math.min(24, spring.speed + kick.joints[name].speed))
    }
    return
  }
  const source = kind === 'landing' ? athletePose({ ...p, grounded: true, anim: { ...p.anim, ragdoll: null } }) : athletePose(p)
  p.anim.ragdoll = createImpactRagdoll(source, p.facing, kind, ...velocity)
}

export function advanceImpactRagdoll(p: Player, dt: number) {
  const motion = p.anim.ragdoll
  if (!motion) return
  if (p.hang || p.climbing || p.mantle || p.waterMotion || p.releaseTurn || p.wallBrace?.active
    || p.sliding?.active || p.jumpLift || p.contacts?.push?.hands) { p.anim.ragdoll = null; return }
  if (motion.facing !== p.facing) {
    motion.source = reflectAthletePose(motion.source)
    for (const spring of Object.values(motion.joints)) { spring.angle *= -1; spring.speed *= -1 }
    motion.facing = p.facing
  }
  stepImpactRagdoll(motion, dt)
  if (motion.time >= motion.duration) p.anim.ragdoll = null
}

/** Capture requested turns and slides whose real wall brace can select facing.
 * Steering changes immediately; this snapshot belongs solely to the rig. */
export function captureDryTurn(p: Player, input: JumpInput, frameDirection = 1): DryTurnFrame | null {
  if (p.waterMotion || p.releaseTurn) return null
  const grip = !!(p.hang || p.climbing)
  const screenDown = !!(input.descend ?? (input.drop && !input.detach))
  const dropping = (frameDirection > 0 ? screenDown : input.climb) || input.drop && !screenDown
  const departing = grip && ((input.jump && !p.jumpHeld) || input.detach || dropping)
  const ledgeDrop = !!p.hang && (input.detach || dropping && !p.hang.dropLocked)
  if (p.mantle) {
    if (!p.mantle.step || p.mantle.step.climbing) return null
    const step = p.mantle, source = snapshotDryPlayer(p)
    return { get pose() { return athletePose(source) }, facing: p.facing, grip: false, step }
  }
  if (grip && !departing) return null
  const reversing = Math.abs(input.move) > .01 && Math.sign(input.move) !== p.facing
    && (Math.abs(p.vx) > 5 || (p.anim.gait?.moving ?? 0) > .2 || p.freeFall?.recovery != null || !!p.contacts?.push?.hands && !!p.pushing?.palms)
  const slide = !!(p.sliding || p.anim.slideEntry)
  if (p.anim.dryTurn || departing || reversing) return { pose: athletePose(p), facing: p.facing, grip, ledgeDrop, slide, pushing: !!p.contacts?.push?.hands && !!p.pushing?.palms }
  if (p.grounded) return null
  // A new canted contact can choose direction after a tick with no slide or
  // brace. Capture cheaply now, and only solve if that direction changes.
  const source = snapshotDryPlayer(p)
  return { get pose() { return athletePose(source) }, facing: p.facing, grip, slide }
}

/** Prop transport can interrupt a step after the controller's turn handoff.
 * Retain its actual outgoing rig before the physical root is transported. */
export function retainInterruptedStepPose(p: Player) {
  if (!p.mantle?.step || p.mantle.step.climbing || p.anim.cadence === 'off') return
  p.anim.dryTurn = { pose: athletePose(p), facing: p.facing, target: p.facing, time: 0, departure: false, step: true }
}

export function dryTurnDirection(p: Player, input: JumpInput, before?: DryTurnFrame | null) {
  if (p.hang || p.mantle || p.climbing || p.waterMotion || p.releaseTurn || p.freeFall?.recovery != null) return p.facing
  // A neutral ledge drop's small clearance impulse must not select a turn.
  if (before?.ledgeDrop && Math.abs(input.move) <= .01) return before.facing
  if (p.anim.slideEntry?.landing && input.move * p.vx < -1 && Math.abs(p.vx) > 20) return Math.sign(p.vx)
  const changing = before && (before.grip || before.facing !== p.facing)
  if (!p.anim.dryTurn && !changing) return p.facing
  if ((before?.grip || input.move * p.vx < -1) && Math.abs(p.vx) > 20) return Math.sign(p.vx)
  if (p.anim.dryTurn?.departure && Math.abs(input.move) <= .01) return p.anim.dryTurn.target
  return p.facing
}

/** Transfer weight before changing the visible direction. Fixed shoes keep
 * their actual rolling contact while elbows/knees turn through depth. */
export function advanceDryTurn(p: Player, input: JumpInput, dt: number, before?: DryTurnFrame | null) {
  // The landing transfer already retains the outgoing orientation. A second
  // owner would discard it when steering reverses against the remaining slip.
  if (p.anim.slideEntry?.landing) { p.anim.dryTurn = null; return }
  const push = p.contacts?.push
  const contactTurn = !!(push?.hands && (p.anim.dryTurn?.pushing || p.anim.dryTurn?.step || before?.step && !p.mantle || before?.pushing && before.facing !== p.facing))
  // A first shove owns its reachable brace. An interrupted step can transfer
  // only with the incoming force's palms and real shoes held fixed.
  if (p.hang || p.mantle || p.climbing || p.waterMotion || p.releaseTurn || p.freeFall?.recovery != null || p.contacts?.push?.hands && !contactTurn) {
    p.anim.dryTurn = null; return
  }
  const interruptedStep = !!(before?.step && !p.mantle && before.step.time > 0 && before.step.time < before.step.step!.duration)
  const departure = !!before?.grip, changed = before && (before.facing !== p.facing || departure || interruptedStep)
  if (!p.anim.dryTurn && !changed) return
  const previousFacing = before?.facing ?? p.anim.dryTurn!.facing
  let from = before?.pose ?? p.anim.dryTurn!.pose
  if (previousFacing !== p.facing) from = reflectAthletePose(from)
  const motion = p.anim.dryTurn ??= { pose: from, facing: p.facing, target: previousFacing, time: 0, departure,
    slide: !!(before?.slide || p.sliding || p.anim.slideEntry), pushing: contactTurn, step: !!interruptedStep, recoil: !!p.anim.ragdoll }
  // The turn already owns the outgoing loose pose. Return toward the active
  // rig once, rather than layering recoil onto its own captured deformation.
  p.anim.ragdoll = null
  motion.pushing ||= contactTurn
  const braking = input.move * p.vx < -1
  const approach = !p.grounded && (p.pushing?.ready ?? 0) > 0 && p.pushing?.effort === 0
  const direction = contactTurn ? push!.direction : approach ? p.pushing!.direction : dryTurnDirection(p, input, before)
  if (motion.target !== direction) { motion.target = direction; motion.time = 0 }
  motion.time += dt
  const gait = p.anim.gait && { ...p.anim.gait, run: braking ? 0 : p.anim.gait.run }
  const incoming = motion.step && p.pushing ? { ...p.pushing, amount: Math.max(p.pushing.amount, p.pushing.ready ?? 0) } : p.pushing
  let target = athletePose({ ...p, anim: { ...p.anim, dryTurn: null, slideEntry: null, gait }, facing: direction, pushing: incoming })
  if (direction !== p.facing) target = reflectAthletePose(target)
  // A planted shoe uses the current motor contact, including heel/toe roll.
  // Blending its angle independently of its ankle would drag material points.
  for (const name of ['frontLeg','backLeg'] as const) if (target[name].planted && !motion.recoil) {
    from = { ...from, [name]: { ...from[name], end: target[name].end, footAngle: target[name].footAngle,
      toeAngle: target[name].toeAngle, footFacing: target[name].footFacing, planted: true } }
  }
  // The old pelvis follows the motor root immediately. Bend the loaded leg
  // enough for its unchanged contact before interpolating the two valid rigs.
  let dip = 0
  for (const name of ['frontLeg','backLeg'] as const) if (target[name].planted && !motion.recoil) {
    const end = target[name].end, dx = end[0] - from.hip[0]
    dip = Math.max(dip, end[1] - Math.sqrt(Math.max(0, 29 ** 2 - dx ** 2)) - from.hip[1] - 1)
  }
  if (dip) {
    from = rotatePose(from, 0, 1, [0,0], [0,dip])
    for (const name of ['frontLeg','backLeg'] as const) if (target[name].planted) from[name].end = target[name].end
  }
  const duration = motion.step ? .1 : motion.slide ? .16 : .14
  const fraction = Math.min(1, dt / Math.max(dt, duration - motion.time + dt))
  const depth = Math.sin(Math.PI * smooth(motion.time / duration))
  const prop = push?.collider.prop
  // A blocked reversal can release the old hands and reach to the new brace.
  // The motor's pressure still responds immediately, but no visible object
  // travel is attributed to hands in transit. Moving contacts retain their
  // exact palms, and the returning-step handoff keeps its separate anchors.
  const reaching = !!(motion.pushing && !motion.step && (!prop || Math.hypot(prop.vx, prop.vy) < 1))
  const sample = (t: number) => {
    // A slowed slide turn also slows its added bend through depth. At zero
    // progress the outgoing bend is retained, rather than adding a full fold.
    const bend = motion.slide || reaching || motion.departure || motion.recoil ? depth * t / fraction : depth
    let pose = t === 1 ? target : transferPose(from, target, [0,0], t, [0,0], 0, true, 0,
      { depth: bend * (motion.slide ? 6 : 8), kneeOpening: motion.slide ? MIN_KNEE_OPENING : 0,
        legDepth: motion.slide ? bend * 6 : undefined })
    if (reaching && t < 1) pose = transferReachingPushTurn(p, pose, from, target, t)
    else if (contactTurn && t < 1) pose = transferPushTurn(p, pose, from, target, t)
    if (!p.grounded || motion.recoil) {
      pose = clearBody(p, pose).pose
      for (const name of ['frontLeg','backLeg'] as const) {
        pose[name] = motion.slide
          ? clearSlidingJoint(p, clearAirborneFoot(p, pose[name], 16), 15, 14.5, 2.2)
          : clearAirborneFoot(p, { ...pose[name], ...clearLimb(p, pose[name], 15, 14.5, -1) })
      }
    } else if (contactTurn) {
      // A swinging shoe can retain its outgoing pitch at the first grounded
      // shove. Clear its skin without moving either real planted ankle.
      for (const name of ['frontLeg','backLeg'] as const) if (!pose[name].planted) {
        pose[name] = clearAirborneFoot(p,pose[name],16)
      }
    }
    pose.frontArm = clearLimb(p, pose.frontArm, UPPER_ARM, FOREARM, 1, true, contactTurn && !reaching)
    pose.backArm = clearLimb(p, pose.backArm, UPPER_ARM, FOREARM, 1, true, contactTurn && !reaching)
    return articulateAnkles(p, pose)
  }
  let t = fraction, pose = sample(t)
  if (motion.slide || reaching || motion.departure || motion.recoil) {
    // Reacquired slopes and crowded reaches can require more clearance than
    // the raw transfer predicts. Budget the final cleared joints, preserving
    // fixed bones and safe skin instead of blending corrected coordinates.
    const points = (rig: AthletePose) => [rig.hip, rig.waist, rig.shoulder, rig.head,
      ...[rig.frontArm, rig.backArm, rig.frontLeg, rig.backLeg].flatMap(limb =>
        [[...limb.joint, limb.jointDepth ?? 0], [...limb.end, limb.endDepth ?? 0]])]
    const previous = points(from), limit = 600 * dt
    const safe = (rig: AthletePose) => points(rig).every((point, i) =>
      Math.hypot(...point.map((value, axis) => value - (previous[i][axis] ?? 0))) <= limit)
    if (!safe(pose)) {
      let low = 0, high = t
      for (let i = 0; i < 14; i++) {
        const mid = (low + high) / 2
        if (safe(sample(mid))) low = mid; else high = mid
      }
      t = low; pose = sample(t)
    }
  }
  motion.pose = pose
  motion.reaching = reaching && t < 1
  motion.facing = p.facing
  // A returning step owns its incoming stance until the real contact takes
  // over or preparation fades. Grounding alone is not a handoff: dropping the
  // owner there retracts the rig just before the same palms load on the prop.
  const preparingStep = motion.step && (p.pushing?.ready ?? 0) > 0 && !p.contacts?.push?.hands
  if (t === 1 && direction === p.facing && !braking && !preparingStep) p.anim.dryTurn = null
}

/** Delay solving the outgoing support or approaching reach until a slip. */
export function captureSlideEntry(p: Player): SlideEntryFrame | null {
  if (!p.anim.slideEntry && (!p.grounded && !p.sliding && !p.pushing?.ready && !(p.freeFall?.amount ?? 0) || p.hang || p.mantle || p.climbing || p.waterMotion)) return null
  // Snapshots keep their own animation fields; later updates replace the live ones.
  if (p.anim.slideEntry) return { player: { ...p, anim: { ...p.anim } }, facing: p.facing, sliding: !!p.sliding }
  return { player: snapshotDryPlayer(p), facing: p.facing, sliding: !!p.sliding }
}

function snapshotDryPlayer(p: Player): Player {
  const feet = p.anim.footwork
  const footwork = feet && { ...feet, feet: feet.feet.map(foot => ({ ...foot,
    release: foot.release && { ...foot.release }, settle: foot.settle && { ...foot.settle } })) as typeof feet.feet }
  const preparation = p.mantle?.step?.returnPreparation
  const returnPreparation = preparation && { ...preparation, hands: { ...preparation.hands,
    palms: preparation.hands.palms?.map(palm => ({ ...palm })) as typeof preparation.hands.palms } }
  const mantle = p.mantle && { ...p.mantle, step: p.mantle.step && { ...p.mantle.step, returnPreparation } }
  return { ...p, mantle, anim: { ...p.anim, footwork }, sliding: p.sliding && { ...p.sliding }, freeFall: p.freeFall && { ...p.freeFall },
    wallBrace: p.wallBrace && { ...p.wallBrace, hands: [...p.wallBrace.hands], feet: [...p.wallBrace.feet],
      ...(p.wallBrace.normal ? { normal: [...p.wallBrace.normal] } : {}) } }
}

/** A connected grippable face gives the athlete time to gather for landing.
 * Use resolved slip momentum through braking; the motor's contact stays exact. */
export function anticipateSlideLanding(p: Player) {
  const s = p.sliding!, velocity = s.balanceSpeed ?? p.vx * Math.cos(s.angle) + p.vy * Math.sin(s.angle)
  if (velocity * Math.sin(s.angle) <= 0 || canGrip(s.angle) || !p.terrain) return null
  const direction = Math.sign(s.angle)
  for (const platform of p.terrain) {
    const points = platformOutline(platform)
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length], dx = b[0] - a[0], dy = b[1] - a[1]
      if (dx <= 0 || Math.abs(Math.atan2(dy, dx) - s.angle) > .01) continue
      // An unrelated parallel slope at the same X cannot advertise support.
      if (Math.abs((s.x - a[0]) * dy - (s.y - a[1]) * dx) / Math.hypot(dx, dy) > TUNING.width / 2) continue
      const end = direction > 0 ? b : a
      const seconds = p.grounded ? 0 : (end[0] - p.x) / (velocity * Math.cos(s.angle))
      if (seconds > .1 || (p.x - end[0]) * direction > TUNING.width) continue
      const floor = groundAt(p.terrain, end[0] + direction * .1, end[1], .15, surface => canGrip(surface.angle))
      if (!floor) continue
      const amount = smooth(1 - seconds / .1)
      return { angle: lerp(s.angle, floor.angle, amount), x: lerp(s.x, p.x, amount), y: lerp(s.y, p.y, amount) }
    }
  }
  return null
}

/** A loaded landing shoe meets the real face after the rig transfer. Swing
 * feet retain the running stride's brief flight phase. */
function loadSlideLanding(p: Player, pose: AthletePose): AthletePose {
  if (!p.grounded || !p.terrain || !p.anim.footwork) return pose
  const names = ['frontLeg', 'backLeg'] as const
  const contacts = names.flatMap((name, index) => {
    if (!p.anim.footwork!.feet[index].planted) return []
    const leg = pose[name], profile = 1 - (leg.rear ?? 0)
    let gap = Infinity
    for (const point of FOOT_CONTACT) {
      const sole = footPoint(point, leg.footAngle * leg.footFacing, leg.toeAngle * leg.footFacing, point[0] > 2.2)
      const surface = groundAt(p.terrain!, p.x + (leg.end[0] + sole[0] * leg.footFacing * profile) * p.facing, p.y)
      if (surface) gap = Math.min(gap, surface.y - p.y - leg.end[1] - sole[1])
    }
    return Number.isFinite(gap) ? [{ name, end: add(leg.end, [0, gap - .02]) }] : []
  })
  let dip = 0
  for (const { name, end } of contacts) {
    const leg = pose[name], dx = end[0] - leg.root[0], depth = leg.endDepth ?? 0
    dip = Math.max(dip, end[1] - Math.sqrt(Math.max(0, 29 ** 2 - dx ** 2 - depth ** 2)) - leg.root[1])
  }
  if (dip) pose = rotatePose(pose, 0, 1, [0, 0], [0, dip])
  for (const { name, end } of contacts) pose[name] = { ...pose[name], ...solveNear(pose[name], end, 15, 14.5, Math.PI / 12), planted: true }
  return pose
}

/** Preserve the rig through entry and landing, including a one-tick slip. */
export function advanceSlideEntry(p: Player, dt: number, before?: SlideEntryFrame | null, input?: JumpInput) {
  const landing = !!p.sliding && !!anticipateSlideLanding(p)
  if (p.hang || p.mantle || p.climbing || p.waterMotion || p.releaseTurn || (p.freeFall?.amount ?? 0) > 0 || p.freeFall?.recovery != null
    || p.anim.dryTurn && !landing && !p.anim.slideEntry?.landing || p.contacts?.push?.hands) {
    p.anim.slideEntry = null; return
  }
  if (!p.anim.slideEntry && !(before && ((!before.sliding || before.player.freeFall?.amount) && p.sliding || landing))) return
  const source = p.anim.slideEntry?.pose ?? athletePose(before!.player)
  const facing = p.anim.slideEntry?.facing ?? before!.facing
  const from = facing === p.facing ? source : reflectAthletePose(source)
  const motion = p.anim.slideEntry ??= { pose: from, facing: p.facing, time: 0, landing }
  motion.landing ||= landing
  motion.time += dt
  if (motion.landing) p.anim.dryTurn = null
  const braking = motion.landing && !!input && input.move * p.vx < -1
  const direction = braking && Math.abs(p.vx) > 20 ? Math.sign(p.vx) : p.facing
  const gait = braking && p.anim.gait ? { ...p.anim.gait, run: 0 } : p.anim.gait
  let target = athletePose({ ...p, anim: { ...p.anim, slideEntry: null, gait }, facing: direction })
  if (direction !== p.facing) target = reflectAthletePose(target)
  const fraction = Math.min(1, dt / Math.max(dt, .12 - motion.time + dt))
  const sample = (t: number) => {
    let pose = t === 1 ? target : transferPose(from, target, [0, 0], t, [0, 0], 0, true, 0,
      { depth: motion.landing ? Math.sin(Math.PI * t) * 6 : Math.sin(Math.PI * smooth(motion.time / .12)) * 2 * t / fraction,
        kneeOpening: motion.landing && p.grounded ? Math.PI / 12 : MIN_KNEE_OPENING, footTurn: motion.landing })
    pose = clearBody(p, pose).pose
    if (motion.landing) pose = loadSlideLanding(p, pose)
    for (const name of ['frontLeg', 'backLeg'] as const) {
      pose[name] = clearSlidingJoint(p, clearAirborneFoot(p, pose[name], motion.landing ? 32 : 16), 15, 14.5, 2.2)
    }
    pose.frontArm = clearLimb(p, pose.frontArm, UPPER_ARM, FOREARM, 1, true)
    pose.backArm = clearLimb(p, pose.backArm, UPPER_ARM, FOREARM, 1, true)
    // The continuity budget includes the final ankle correction as well.
    return articulateAnkles(p, pose)
  }
  const points = (pose: AthletePose) => [pose.hip, pose.waist, pose.shoulder, pose.head,
    ...[pose.frontArm, pose.backArm, pose.frontLeg, pose.backLeg].flatMap(limb =>
      [[...limb.joint, limb.jointDepth ?? 0], [...limb.end, limb.endDepth ?? 0]]),
    ...[pose.frontLeg, pose.backLeg].flatMap(leg => FOOT_CONTACT.map(point => {
      const sole = footPoint(point, leg.footAngle * leg.footFacing, leg.toeAngle * leg.footFacing, point[0] > 2.2)
      const profile = 1 - (leg.rear ?? 0)
      return [leg.end[0] + sole[0] * leg.footFacing * profile, leg.end[1] + sole[1],
        (leg.endDepth ?? 0) + sole[0] * Math.sqrt(Math.max(0, 1 - profile ** 2))]
    }))]
  const previous = points(from), limit = 600 * dt
  const safe = (pose: AthletePose) => points(pose).every((point, i) =>
    Math.hypot(...point.map((value, axis) => value - (previous[i][axis] ?? 0))) <= limit)
  let t = fraction, pose = sample(t)
  if (!safe(pose)) {
    let low = 0, high = t
    for (let i = 0; i < 14; i++) {
      const mid = (low + high) / 2
      if (safe(sample(mid))) low = mid; else high = mid
    }
    t = low; pose = sample(t)
  }
  motion.pose = pose; motion.facing = p.facing
  // A grounded gait can keep changing while the old slip fades. Finish only
  // when that contact is gone and the cleared rig has actually caught up.
  if (t === 1 && (!motion.landing || !p.sliding)) {
    if (motion.landing && (direction !== p.facing || braking)) {
      p.anim.dryTurn = { pose, facing: p.facing, target: direction, time: .16, departure: false, slide: true }
    }
    p.anim.slideEntry = null
  }
}

/** Prepare a shallow downward reach before swimming past a small floor prop. */
export function advanceWaterPropReach(p: Player, input: JumpInput, dt: number, world: ContactWorld) {
  const motion = p.waterMotion
  if (!motion) return
  const direction = Math.sign(input.move)
  let wanted = 0
  if (motion.underwater && !p.grounded && direction && !input.jump && !input.climb && !input.descend && !input.drop
    && Math.abs(input.swimVertical ?? 0) < .01 && (motion.leadHeading ?? motion.heading ?? p.facing) * direction > .5) {
    const candidates = world.colliders.filter(c => c.prop && smallSubmergedProp(c.prop)
      && (c.prop.x - p.x) * direction > 8 && (c.prop.x - p.x) * direction < 90 && Math.abs(c.prop.y - p.y) < 80)
    if (candidates.length) {
      // The lean changes the swimming push hands, so it is solved from the physics rig.
      const pose = waterPose({ ...physicsView(p), terrain: undefined, pushing: null, waterMotion: { ...motion, propLean: 0 } })
      const shoulder: Point = [p.x + pose.shoulder[0] * p.facing, p.y + pose.shoulder[1]]
      for (const c of candidates) {
        const hands = propPushHands(c.prop!, p.x, p.y, direction, -pose.shoulder[1], 70)
        if (!hands?.palms || hands.palms.some(palm => lineBlocked(shoulder, [palm.x, palm.y], world.platforms.filter(b => b !== c.platform)))) continue
        const below = hands.palms[0].y - shoulder[1], gap = (hands.wallX - shoulder[0]) * direction
        if (below < 0 || below > 34) continue
        wanted = Math.max(wanted, .45 * smooth((below - 10) / 14) * smooth((60 - gap) / 25))
      }
    }
  }
  motion.propLean = (motion.propLean ?? 0) + Math.max(-dt * 3, Math.min(dt * 3, wanted - (motion.propLean ?? 0)))
  if (!motion.propLean) delete motion.propLean
}

/** Terrain ceilings receive a hand brace. Loose floats use ordinary bumps,
 * avoiding competing hand anchors when swimming beneath a moving cluster. */
export function advanceWaterCeiling(p: Player, input: JumpInput, dt: number, world: ContactWorld) {
  const motion = p.waterMotion
  if (!motion) return
  const previous = motion.ceiling
  const ascending = input.climb || (input.swimVertical ?? 0) < -.01 || p.vy < -6
  let target: NonNullable<Player['waterMotion']>['ceiling'], wanted = 0, load = 0
  if (!p.grounded && !motion.landing && (ascending || previous?.amount)) {
    const view = physicsView(p), source = waterBodyPose({ ...view, waterMotion: { ...view.waterMotion!, ceiling: undefined } })
    const x = p.x + source.head[0] * p.facing + p.vx * .04, y = p.y + source.head[1] - HEAD_RADIUS
    let nearest = Infinity
    for (const collider of world.colliders) {
      if (collider.prop) continue
      const b = collider.platform
      if (x < b.x - 32 || x > b.x + b.w + 32 || y < b.y - 32 || y > b.y + b.h + 32) continue
      const face = nearestBoundary(b, x, y, [0, 1])
      const dx = x - face.x, dy = y - face.y, gap = dx * face.nx + dy * face.ny
      if (face.ny < .35 || gap < -.2 || face.distance > 32 || face.distance >= nearest) continue
      nearest = face.distance
      const overrun = Math.abs(dx * face.ny - dy * face.nx)
      wanted = ascending ? smooth((32 - face.distance) / 24) * (1 - smooth(overrun / 16)) : 0
      load = ascending ? smooth((8 - gap) / 8) : 0
      const shoulder = p.x + source.shoulder[0] * p.facing
      target = { collider: collider.id, amount: 0, load: 0, nx: face.nx, ny: face.ny,
        hands: [8, -7].map(offset => {
          const point = nearestBoundary(b, shoulder + offset * (motion.leadHeading ?? p.facing), p.y + source.shoulder[1], [0, 1])
          return { x: point.x, y: point.y, nx: point.nx, ny: point.ny }
        }) }
    }
  }
  // Release a loaded underside before reaching to another ceiling face.
  if (previous && target && previous.collider !== target.collider && previous.amount > 0) {
    target = previous; wanted = 0; load = 0
  }
  const amount = (previous?.amount ?? 0) + Math.max(-dt / .22, Math.min(dt / .14, wanted - (previous?.amount ?? 0)))
  if (amount <= 0 || !target && !previous) { delete motion.ceiling; return }
  motion.ceiling = { ...(target ?? previous!), amount,
    load: (previous?.load ?? 0) + Math.max(-dt / .18, Math.min(dt / .15, load - (previous?.load ?? 0))) }
}

export const WATER_LANDING_TIME = .75, WATER_LANDING_RELEASE = .25

/** A captured hand contact owns the rig until the feet settle, so becoming
 * grounded cannot replace an extended dive with a standing pose in one frame. */
export function advanceWaterLanding(p: Player, input: JumpInput, dt: number, incomingVy: number) {
  const motion = p.waterMotion
  if (!motion) return
  const landing = motion.landing
  if (landing) {
    if ((input.climb || (input.swimVertical ?? 0) < -.01) && !landing.leaving) {
      landing.pose = waterLandingPose(p); landing.y = p.y; landing.facing = p.facing
      landing.time = 0; landing.leaving = true
    }
    landing.time += dt
    motion.bottom = landing.leaving ? 0 : smooth(landing.time / WATER_LANDING_TIME)
    if (landing.time >= (landing.leaving ? WATER_LANDING_RELEASE : WATER_LANDING_TIME)) {
      delete motion.landing; motion.bottom = p.grounded ? 1 : 0
      if (p.grounded && !landing.leaving) {
        // Begin walking from the stance that just received the feet, rather
        // than inheriting a gait cycle advanced while they were still tucked.
        p.anim.gait = gaitPose(0); p.anim.footwork = null
        advanceFootwork(p, 0, p.x, p.terrain ?? [])
      }
    }
    return
  }
  if (motion.amount < .65 || motion.dive < .25 || incomingVy <= 0 || p.pushRig?.amount || input.climb || (input.swimVertical ?? 0) < -.01) return
  // The landing changes contacts, so the floor hand comes from the physics rig;
  // the animated pose is kept only as the presentation's outgoing source.
  const arm = waterPose(physicsView(p)).frontArm
  const point = arm.hand ?? arm.end, x = p.x + point[0] * p.facing, y = p.y + point[1]
  const surface = groundAt(p.terrain ?? [], x, y, p.grounded ? 12 : 2, s => s.y >= y - .2 && canGrip(s.angle))
  if (!surface) return
  const approach = Math.max(0, incomingVy * Math.cos(surface.angle) - p.vx * Math.sin(surface.angle))
  motion.landing = { pose: waterPose(p), y: p.y, facing: p.facing, time: 0, load: clamp(approach / TUNING.diveSpeed), hand: { x, y: surface.y, angle: surface.angle } }
  motion.bottom = 0; delete motion.floor
}
/** Retain the side of a corner that already cleared the body, then relax that
 * balance adjustment gradually. Drawing the pose itself remains read-only. */
export function settleWaterClearance(p: Player, dt: number) {
  const motion = p.waterMotion
  if (!motion) return
  if (p.grounded) { delete motion.bodyOffset; return }
  const relax = (v: number) => v - Math.sign(v) * Math.min(Math.abs(v), dt * 40)
  motion.bodyOffset = (motion.bodyOffset ?? [0, 0]).map(relax) as Point
  // The offset moves the swimming hull, so it is solved from the physics rig.
  motion.bodyOffset = waterBodyPose(physicsView(p)).waterOffset ?? [0, 0]
}

/** The presented swimmer clears its own animated rig, starting from the last
 * presented offset, independently of the hull's physics clearance. */
export function settlePresentedWaterClearance(p: Player, dt: number) {
  if (!p.waterMotion || p.grounded) { p.anim.waterClearance = null; return }
  const relax = (v: number) => v - Math.sign(v) * Math.min(Math.abs(v), dt * 40)
  const previous = p.anim.waterClearance
  const offset: Point = previous ? [previous.offset[0] * (previous.facing === p.facing ? 1 : -1), previous.offset[1]] : [0, 0]
  p.anim.waterClearance = { offset: offset.map(relax) as Point, facing: p.facing }
  p.anim.waterClearance = { offset: waterBodyPose(p).waterOffset ?? [0, 0], facing: p.facing }
}
