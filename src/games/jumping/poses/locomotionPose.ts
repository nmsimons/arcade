// Ground and air locomotion, crouching, landing, reaching and pushing.
import { handGeometry, pushPalmFrame } from '../androidHand.ts'
import { bodyIntrusion, clearAirborneFoot, clearLimb, clearRiserLeg, clearSlidingArm, clearSlidingJoint, pushBallSurface } from '../athleteClearance.ts'
import { FOREARM, HEAD_RADIUS, UPPER_ARM, add, armPose, clamp, lerp, mix, mixAngle, smooth, solveLeg } from '../athleteRig.ts'
import type { AthletePose } from '../athleteRig.ts'
import { sampleStride } from '../footwork.ts'
import { BACK_GRIP, BACK_WRIST, FRONT_GRIP, FRONT_WRIST } from '../ledge.ts'
import type { Limb, Point } from '../limbPose.ts'
import { groundAt } from '../terrain.ts'
import { landingPreparation } from './fallPose.ts'
import { clearLedgeReach, grippingArm } from './ledgePose.ts'
import { slidingPose, wallBraceSharesSlide } from './slidingPose.ts'
import { transferPushTurn } from './turnPose.ts'
import { wallBracePose } from './wallBracePose.ts'
import { gaitPose } from '../gait.ts'
import type { Player } from '../characterTypes.ts'

/** The most a prop push palm moves past its solved wrist to stay on the surface. */
const PUSH_PALM_CARRY = 2

/** Ground and air locomotion: gait, crouch, landing, flight, reach and pushing. */
export function locomotionPose(p: Player): AthletePose {
  // Sliding blends from the same locomotion pose on contact and release. A
  // momentary slip must not replace the airborne gait before its blend begins.
  const pose = p.anim.gait ?? gaitPose(p.vx, !p.grounded)
  const { speed, moving, run } = pose, air = p.hang || p.mantle ? 0 : pose.air
  const walk = 1 - smooth(run / .2)
  const cycle = p.anim.stride * p.facing
  const pushing = smooth(Math.max(p.pushing?.amount ?? 0, p.pushing?.ready ?? 0))
  // Gather the supported body with the hands before contact. Otherwise the
  // first force-bearing frame moves the shoulders and both wrists at once.
  const bodyPush = p.grounded ? pushing : smooth(p.pushing?.amount ?? 0)
  // Preparation aims at the incoming working stance, not the distant surface.
  // Keep the real palm coordinates for contact, but cap unloaded reach so a
  // faster, earlier anticipation cannot pull the pelvis toward the object.
  const preparationOffset = p.grounded && !p.contacts?.push?.hands && !p.pushing?.effort && p.pushing
    ? Math.max(0, (p.pushing.wallX - p.x) * p.pushing.direction - 38) : 0
  const gait = moving * (1 - p.crouch) * (1 - air) * (1 - bodyPush)
  const squat = p.crouch
  // Walking loads the knee after heel contact, passes over the foot, then
  // rises before the next contact. Carry the walking chest and head with
  // that knee compression so the weight transfer reads at gameplay scale.
  const bodyWave = (lag: number) => lerp(
    lerp(Math.cos(cycle * 2 - lag) * 1.7, Math.cos(cycle * 2 - .9 - lag) * 3.4, run),
    Math.sin(cycle * 2 - lag) * 1.8, walk) * gait
  const hipBob = bodyWave(0), chestBob = bodyWave(lerp(.32, .08, walk)) * lerp(.92, 1, walk)
  const headBob = bodyWave(lerp(.55, .12, walk)) * lerp(.72, 1, walk)
  // Contact sets motor vy to zero. Keep the descending balance while its air
  // amount fades; interpreting that zero as a new apex would curl on impact.
  const flightVy = p.grounded && p.landing > 0 ? Math.max(250, 150 + p.landingImpact * 850) : p.vy
  const rising = smooth(-flightVy / 180), extension = smooth((-flightVy - 260) / 400)
  // A contact can remove falling speed without creating a jump apex. Curl
  // near zero vy only above the actual takeoff height, then relax in descent.
  const apex = (1 - smooth(Math.abs(flightVy) / 220)) * smooth((p.jumpStart - p.y) / 12)
  const tuck = Math.max(rising * (1 - extension), apex)
  const descent = smooth(flightVy / 250), preparation = air > 0 ? landingPreparation(p) : 0
  const lift = clamp(p.airBoost.lift), steering = p.airBoost.x * p.facing
  const landingTime = 1 - p.landing
  // A quick, eased compression absorbs the impact, followed by a longer recovery.
  const landing = (landingTime < .28 ? smooth(landingTime / .28) : 1 - smooth((landingTime - .28) / .72)) * (1 - air * .7)
  const landingDepth = landing * lerp(2.5, 16, p.landingImpact) * (1 - squat)
  // The idle crouch must fit the same 40-unit opening as its walking pose.
  const dip = squat * (13.4 + 1.8 * (1 - moving)) + landingDepth
  const slopeLean = -p.groundAngle * p.facing * (1 - air) * .3
  const hipHeight = lerp(lerp(-33.2, lerp(-31.4, -28.3, run), moving), -31.5 + tuck * 2.5, air)
  // A walk still carries the chest ahead of the supported pelvis. Keep the
  // running pitch while giving the slower gait a small, sustained forward lean.
  const pelvicPitch = (lerp(.065, .225, run) + Math.sin(cycle * 2 + .4) * lerp(.035, .1, run)) * gait + squat * .65 + air * (.08 + tuck * .28) + landingDepth * .014
  const chestPitch = (lerp(.16, .435, run) + Math.sin(cycle * 2 - .55) * lerp(.035, .1, run)
    + Math.sin(cycle - .3) * run * .035) * gait + squat * 1.25 + air * (.12 + speed * .18 + tuck * .18 - descent * .06 + preparation * .12 + steering * .025) + landingDepth * .035 + slopeLean
  const hip: Point = [-squat * 3 - landingDepth * .24 + gait * (run * .8 + Math.sin(cycle * 2) * .4), hipHeight + dip + hipBob]
  const waist: Point = [hip[0] + Math.sin(pelvicPitch) * 6.5, hip[1] - Math.cos(pelvicPitch) * 6.5]
  const shoulder: Point = [waist[0] + Math.sin(chestPitch) * 10.1, waist[1] - Math.cos(chestPitch) * 10.1 + chestBob - hipBob]
  // The head leads the run while its vertical motion lags behind the shoulders.
  const head: Point = [shoulder[0] + .45 + Math.sin(chestPitch) * 2.2, shoulder[1] - 7.3 + headBob - chestBob]
  // The round head reads as looking by leaning at the neck, without moving the body.
  head[0] -= p.anim.look * 2
  head[1] -= p.anim.look * (p.anim.look > 0 ? .45 : .8)
  const frontStep = sampleStride(cycle, run, moving, pose.jog), backStep = sampleStride(cycle + Math.PI, run, moving, pose.jog)
  if (bodyPush) {
    // Crouching already lowers the body; do not add a second squat when pushing.
    const pushDip = bodyPush * (1 - squat)
    const load = p.pushing!.palms ? p.pushing!.load ?? p.pushing!.effort : .5
    hip[0] -= bodyPush * 3; hip[1] += pushDip * 4
    waist[0] += bodyPush; waist[1] += pushDip * 3
    shoulder[0] += bodyPush * 4; shoulder[1] += pushDip * 3
    head[0] += bodyPush * 5; head[1] += pushDip * 3
    const compression = pushDip * (load - .5) * 4
    hip[1] += compression; waist[1] += compression; shoulder[1] += compression; head[1] += compression
    const lean = bodyPush * (load - .5) * 2.8
    waist[0] += lean * .35; shoulder[0] += lean; head[0] += lean
    // Weight rises over the planted leg while the other foot clears the floor.
    // This follows the actual short step; blocked feet produce no body cycle.
    const balance = p.anim.footwork?.pushBalance
    if (balance) {
      for (let axis = 0; axis < 2; axis++) {
        hip[axis] += balance[0][axis] * bodyPush
        waist[axis] += lerp(balance[0][axis], balance[1][axis], .4) * bodyPush
        shoulder[axis] += balance[1][axis] * bodyPush; head[axis] += balance[2][axis] * bodyPush
      }
    }
    // Lower the hips and hinge at the waist to reach short objects. Keep the
    // planted feet and limb lengths, and retain the tall-box stance at height 43.
    const low = smooth((43 - (p.pushing!.height ?? 43)) / 28)
    if (low) {
      hip[1] += pushDip * low * 3
      const pelvis = .25 + low * .4
      const lowWaist = add(hip, [Math.sin(pelvis) * 6.5, -Math.cos(pelvis) * 6.5])
      // Grounded downhill work can put a palm below the usual short-prop
      // reach. Continue hinging the chest toward the real wrist while keeping
      // the supported pelvis. Airborne preparation retains its own torso.
      const wristY = Math.max(...(p.grounded ? p.pushing!.palms ?? [] : []).map(palm =>
        pushPalmFrame([(palm.x - p.x) * p.facing, palm.y - p.y], [palm.nx * p.facing, palm.ny]).wrist[1]))
      const shoulderY = wristY - .7 - 18.4
      const chest = Math.max(.35 + low * .9,
        Number.isFinite(shoulderY) ? Math.acos(Math.max(-1, Math.min(1, (lowWaist[1] - shoulderY) / 10.1))) : 0)
      const lowShoulder = add(lowWaist, [Math.sin(chest) * 10.1, -Math.cos(chest) * 10.1])
      const lowHead = add(lowShoulder, [.45 + Math.sin(chest) * 2.2, -7.3])
      const blend = bodyPush * low
      for (const [point, target] of [[waist, lowWaist], [shoulder, lowShoulder], [head, lowHead]]) {
        point[0] = lerp(point[0], target[0], blend); point[1] = lerp(point[1], target[1], blend)
      }
    }
  }
  let frontAnkle = moving ? frontStep.ankle : [2, -2.8] as Point
  let backAnkle = moving ? backStep.ankle : [-2, -2.8] as Point
  frontAnkle = mix(frontAnkle, [4 + Math.sin(cycle) * speed * 3, -2.8], squat)
  backAnkle = mix(backAnkle, [-5 - Math.sin(cycle) * speed * 3, -2.8], squat)

  const armOffset = p.anim.footwork?.armOffset
  const armCycle = cycle + (armOffset ? armOffset.angle * (1 - smooth(armOffset.time / .2)) : 0)
  const swing = Math.cos(armCycle - run * .12) * moving * lerp(.52, 1.18, run)
  const relaxed = (1 - moving) * (1 - air) * (1 - squat)
  const armCarry = lerp(.03, .07, moving) + run * .13
  let frontAngle = lerp(-swing - armCarry + relaxed * .24, -.65, squat), backAngle = lerp(swing - armCarry - relaxed * .24, -.75, squat)
  // The backward arm opens; the forward arm folds up toward the chest.
  let frontFlex = lerp(.1 + relaxed * .16 * (1 - pushing) + moving * lerp(.12 + (1 - Math.cos(armCycle)) * .14 * walk, 1.2 - Math.cos(armCycle - .12) * .5, run), 2.1, squat)
  // Keep both forearms gently raised in a crouch. A small difference in bend
  // separates the resting hands without dropping the far hand between the legs.
  const crouchRest = (1 - moving) * (1 - air) * (1 - pushing)
  let backFlex = lerp(.1 + relaxed * .24 * (1 - pushing) + moving * lerp(.12 + (1 + Math.cos(armCycle)) * .14 * walk, 1.2 + Math.cos(armCycle - .12) * .5, run), 2.2 - .15 * crouchRest, squat)
  if (air > 0) {
    // Stretch off the ground, gather through the apex, then open the arms for
    // balance. A real approaching support sweeps them back for the contact.
    const airborneFront = mix(mix([2, -7], [2, -3], descent), mix([9, -15], [11, -8], extension), rising)
    const airborneBack = mix(mix([-2, -7.5], [-2, -3.5], descent), mix([-6, -12], [-10, -1], extension), rising)
    frontAnkle = mix(frontAnkle, airborneFront, air)
    backAnkle = mix(backAnkle, airborneBack, air)
    const armRise = smooth(-flightVy / 260)
    const frontFlight = lerp(lerp(.18, .7, descent), 1.1 + extension * .35, armRise)
    const backFlight = lerp(lerp(-.75, -.6, descent), .65 + extension * .35, armRise)
    // Arms follow the hips slightly later during push-off. On contact retain
    // the descending pose while the motor's eased air amount settles.
    const armAir = p.grounded ? air : 1 - (1 - air) ** .55
    frontAngle = lerp(frontAngle, lerp(frontFlight + lift * .06, -.6, preparation), armAir)
    backAngle = lerp(backAngle, lerp(backFlight + lift * .04, -.85, preparation), armAir)
    frontFlex = lerp(frontFlex, lerp(lerp(lerp(1.4, .55, descent), 1, armRise), .65, preparation), armAir)
    backFlex = lerp(backFlex, lerp(lerp(lerp(.85, .7, descent), .8, armRise), .25, preparation), armAir)
  }
  frontAngle = lerp(frontAngle, Math.PI - .08, p.reach)
  backAngle = lerp(backAngle, Math.PI + .06, p.reach)
  frontFlex = lerp(frontFlex, .03, p.reach); backFlex = lerp(backFlex, .03, p.reach)
  const contacts = p.grounded && !p.hang && !p.mantle ? p.anim.footwork?.feet : undefined
  const frontPlanted = contacts ? contacts[0].planted : p.grounded && !p.mantle && (frontStep.planted || !moving)
  const backPlanted = contacts ? contacts[1].planted : p.grounded && !p.mantle && (backStep.planted || !moving)
  if (contacts) {
    frontAnkle = [(contacts[0].x - p.x) * p.facing, contacts[0].y - p.y]
    backAnkle = [(contacts[1].x - p.x) * p.facing, contacts[1].y - p.y]
  }
  if (bodyPush && p.pushing!.palms) {
    // Meet the farther palm before applying a load. A long approach reach
    // advances the pelvis with the chest, rather than stretching the spine.
    let reach = 0
    for (const palm of p.pushing!.palms) {
      const wrist = pushPalmFrame([(palm.x - p.x) * p.facing, palm.y - p.y], [palm.nx * p.facing, palm.ny]).wrist
      const x = wrist[0] - preparationOffset, y = wrist[1]
      const dy = y - shoulder[1] - .7
      reach = Math.max(reach, x - shoulder[0] - Math.sqrt(Math.max(0, 18.7 ** 2 - dy * dy)))
    }
    const lean = reach * bodyPush, shift = Math.max(0, lean - 5)
    hip[0] += shift; waist[0] += shift + Math.min(5, lean) * .35
    shoulder[0] += lean; head[0] += lean
  }
  // Lower the pelvis when necessary; a planted foot must never be pulled off its anchor by IK.
  let supportDip = 0
  for (const [index, [ankle, planted]] of ([[frontAnkle, frontPlanted], [backAnkle, backPlanted]] as const).entries()) if (p.grounded && !p.mantle) {
    const rise = Math.sqrt(Math.max(0, 29 ** 2 - (ankle[0] - hip[0]) ** 2))
    const groundY = contacts ? contacts[index].groundY - p.y : 0
    const weight = planted ? 1 : smooth((ankle[1] - groundY + 8) / 5.2)
    supportDip = Math.max(supportDip, (ankle[1] - rise - (hip[1] + 1)) * weight)
  }
  if (supportDip) { hip[1] += supportDip; waist[1] += supportDip; shoulder[1] += supportDip; head[1] += supportDip }
  if (bodyPush) {
    // Clear the final pose after reach and balance adjustments; an earlier
    // clamp was undone by the subsequent lean toward the palms. The head stays
    // behind the pushed face and out of anything else at head height (a crate
    // riding the pushed one, a low ceiling, a crate caught in front). Each fix
    // turns the whole trunk at the hip, just far enough, so the torso and neck
    // stay whole: straightening back from something in front, ducking forward
    // under something above. Moving the head alone folded the neck (#106).
    const trunk = [waist, shoulder, head].map(point => [...point] as Point)
    const bend = (angle: number) => trunk.map(([x, y]) => {
      const dx = x - hip[0], dy = y - hip[1], c = Math.cos(angle), s = Math.sin(angle)
      return [hip[0] + dx * c - dy * s, hip[1] + dx * s + dy * c] as Point
    })
    const faceX = (p.pushing!.wallX - p.x) * p.facing - HEAD_RADIUS - .1
    const blocked = (angle: number) => bend(angle)[2][0] > faceX || !!bodyIntrusion(p, bend(angle)[2], HEAD_RADIUS)
    const clearAt = (limit: number) => {
      if (blocked(limit)) return null
      let low = 0, high = limit
      for (let i = 0; i < 12; i++) { const mid = (low + high) / 2; if (blocked(mid)) low = mid; else high = mid }
      return high
    }
    if (blocked(0)) {
      const intrusion = bodyIntrusion(p, head, HEAD_RADIUS)
      // Held back by the face, or pushed back (local -x) more than down: straighten first; otherwise duck first.
      const back = head[0] > faceX || !!intrusion && -intrusion.x > Math.abs(intrusion.y), duck = 1.1, straighten = -.8
      const angle = back ? clearAt(straighten) ?? clearAt(duck) : clearAt(duck) ?? clearAt(straighten)
      if (angle !== null) {
        const [bentWaist, bentShoulder, bentHead] = bend(angle)
        waist[0] = bentWaist[0]; waist[1] = bentWaist[1]; shoulder[0] = bentShoulder[0]; shoulder[1] = bentShoulder[1]; head[0] = bentHead[0]; head[1] = bentHead[1]
      }
    }
  }
  // Near and far joints coincide in profile; depth comes only from overlap.
  const frontRoot = () => add(shoulder, [0, .7]), backRoot = frontRoot
  let frontArm = armPose(frontRoot(), frontAngle, frontFlex), backArm = armPose(backRoot(), backAngle, backFlex)
  const relaxedHands = squat * (1 - air)
  if (relaxedHands) for (const arm of [frontArm, backArm]) {
    arm.handAngle = handGeometry(arm).angle + relaxedHands * .28
    arm.handOpen = relaxedHands * .45
  }
  if (!p.grounded && p.terrain) {
    frontArm = clearLimb(p, frontArm, UPPER_ARM, FOREARM, 1, true)
    backArm = clearLimb(p, backArm, UPPER_ARM, FOREARM, 1, true)
  }
  if (pushing) {
    const wall = (p.pushing!.wallX - p.x) * p.facing
    const press = (arm: Limb, y: number, index: number) => {
      const palm = p.pushing!.palms?.[index]
      if (palm) {
        const point: Point = [(palm.x - p.x) * p.facing - preparationOffset, palm.y - p.y], normal: Point = [palm.nx * p.facing, palm.ny]
        const frame = pushPalmFrame(point, normal)
        // Anticipation starts a quarter second out, often far beyond arm's
        // reach, and a released push fades while the body leaves. The arm
        // rises toward the prop; the palm must not stretch out to it.
        const result = grippingArm(arm.root, frame.wrist, frame.palm, arm, pushing, 0, preparationOffset > 0, PUSH_PALM_CARRY)
        result.handAngle = mixAngle(handGeometry(arm).angle, frame.angle, pushing)
        result.handOpen = lerp(arm.handOpen ?? 0, 1, pushing)
        return result
      }
      const contactX = wall + (y + 43) * (p.pushing!.slope ?? 0) * p.facing
      const slope = (p.pushing!.slope ?? 0) * p.facing, length = Math.hypot(1, slope)
      const frame = pushPalmFrame([contactX, y], [-1 / length, slope / length])
      const result = grippingArm(arm.root, frame.wrist, frame.palm, arm, pushing)
      result.handAngle = mixAngle(handGeometry(arm).angle, frame.angle, pushing)
      result.handOpen = lerp(arm.handOpen ?? 0, 1, pushing)
      return result
    }
    frontArm = press(frontArm, -43, 0); backArm = press(backArm, -46, 1)
    // Loaded prop elbows clear a rotating face without moving either palm.
    // Unloaded reaches and blending wall palms retain their free clearance.
    const contact = !!p.contacts?.push?.hands, anchored = contact && !!p.pushing!.palms
    frontArm = clearLimb(p,frontArm,UPPER_ARM,FOREARM,1,true,contact,anchored)
    backArm = clearLimb(p,backArm,UPPER_ARM,FOREARM,1,true,contact,anchored)
  }
  if (p.ledgeReach && !p.grounded) {
    const origin: Point = [(p.ledgeReach.x - p.x) * p.facing, p.ledgeReach.y - p.y]
    frontArm = clearLedgeReach(p, add(origin, FRONT_WRIST), add(origin, FRONT_GRIP), frontArm, p.ledgeReach.amount)
    backArm = clearLedgeReach(p, add(origin, BACK_WRIST), add(origin, BACK_GRIP), backArm, p.ledgeReach.amount)
  }
  const frontFacing = (contacts?.[0].facing ?? p.facing) * p.facing, backFacing = (contacts?.[1].facing ?? p.facing) * p.facing
  const terrainHeight = p.anim.footwork ? (x: number) => {
    const ground = groundAt(p.anim.footwork!.terrain, p.x + x * p.facing, p.y)
    return ground ? ground.y - p.y : null
  } : undefined
  // Let the walking foot recover independently of the folding shin. The
  // tighter airborne limit pointed its toes down even on this low swing.
  const ankleFlex = .35 + .25 * gait * walk
  // Curl only the free toes toward the ground during the forward swing.
  // Loaded soles retain their forefoot contact as the heel lifts.
  const frontLeg = solveLeg(add(hip, [0, 1]), frontAnkle, contacts ? contacts[0].angle * frontFacing : lerp(frontStep.angle * (1 - squat) * moving, -.15, air), p.grounded, frontPlanted, frontFacing, 1 - air, -1,
    contacts ? contacts[0].groundY - p.y : 0, (contacts?.[0].groundAngle ?? 0) * p.facing, terrainHeight, squat, ankleFlex, frontStep.toeCurl * gait)
  const backLeg = solveLeg(add(hip, [0, 1]), backAnkle, contacts ? contacts[1].angle * backFacing : lerp(backStep.angle * (1 - squat) * moving, .12, air), p.grounded, backPlanted, backFacing, 1 - air, -1,
    contacts ? contacts[1].groundY - p.y : 0, (contacts?.[1].groundAngle ?? 0) * p.facing, terrainHeight, squat, ankleFlex, backStep.toeCurl * gait)
  const result: AthletePose = { hip, waist, shoulder, head, frontArm, backArm, frontLeg, backLeg }
  return settleLocomotionContacts(p, p.grounded && p.contacts?.push?.hands && p.pushing?.palms ? fitLoadedPushTrunk(p, result) : result)
}

/** A loaded grounded push fits the supported trunk to both force-bearing wrists. */
function fitLoadedPushTrunk(p: Player, result: AthletePose): AthletePose {
  const arms = [result.frontArm, result.backArm].map((arm, index) => {
    const palm = p.pushing!.palms![index]
    const point: Point = [(palm.x - p.x) * p.facing, palm.y - p.y]
    const normal: Point = [palm.nx * p.facing, palm.ny]
    const frame = pushPalmFrame(point, normal)
    return { ...arm, end: frame.wrist, hand: frame.palm, handAngle: frame.angle, handOpen: 1 }
  })
  if (arms.some(arm => Math.hypot(arm.end[0] - arm.root[0], arm.end[1] - arm.root[1]) > 18.98 + .001)) {
    // A canted face can expose only a high grip to a crouching body. Fit
    // the supported trunk to those wrists before folding the arms around
    // the face; a clamped wrist cannot represent a force-bearing palm.
    result = transferPushTurn(p, result, result, { ...result, frontArm: arms[0], backArm: arms[1] }, 1, 17.5)
    for (let pass = 0; pass < 8; pass++) {
      result.frontArm = clearLimb(p, result.frontArm, UPPER_ARM, FOREARM, 1, true, true, true)
      result.backArm = clearLimb(p, result.backArm, UPPER_ARM, FOREARM, 1, true, true, true)
      const visibleBall = pushBallSurface(p)
      let intrusion = bodyIntrusion(p, result.shoulder, 2.8, visibleBall)
      for (const arm of [result.frontArm, result.backArm]) {
        for (const [a, b] of [[arm.root, arm.joint], [arm.joint, arm.end]]) {
          for (let i = 0; !intrusion && i <= 10; i++) intrusion = bodyIntrusion(p, mix(a, b, i / 10), 1.65, visibleBall)
        }
      }
      if (!intrusion) break
      const shift: Point = [-Math.max(.2, Math.abs(intrusion.x)), 0]
      result.shoulder = add(result.shoulder, shift); result.head = add(result.head, shift)
      result = transferPushTurn(p, result, result, { ...result, frontArm: arms[0], backArm: arms[1] }, 1, 17.5)
    }
    result.frontArm = clearLimb(p, result.frontArm, UPPER_ARM, FOREARM, 1, true, true, true)
    result.backArm = clearLimb(p, result.backArm, UPPER_ARM, FOREARM, 1, true, true, true)
  }
  return result
}

/** Blend wall and slope contacts, then clear limbs against the terrain. */
function settleLocomotionContacts(p: Player, result: AthletePose): AthletePose {
  // Wall and slope contacts can coexist in a narrow gap. Blend each contact
  // instead of switching the entire rig when a brief slide starts or ends.
  const braced = p.wallBrace ? wallBracePose(p, result) : result
  const resolved = p.sliding ? slidingPose(p, braced) : braced
  if (!p.grounded && p.terrain && !p.sliding && !p.anim.slideEntry) for (const name of ['frontLeg', 'backLeg'] as const) {
    // A raised knee can cross a crate before the beveled motor hull does.
    // Apply the existing riser clearance to free legs in flight too; planted
    // shoes retain their actual support anchors.
    const leg = resolved[name]
    if (!leg.planted) resolved[name] = clearRiserLeg(p, leg, !!p.wallBrace)
  }
  if ((!p.grounded || p.sliding) && p.terrain) {
    resolved.frontLeg = clearAirborneFoot(p, resolved.frontLeg); resolved.backLeg = clearAirborneFoot(p, resolved.backLeg)
  } else if (p.terrain) {
    resolved.frontLeg = clearRiserLeg(p, resolved.frontLeg); resolved.backLeg = clearRiserLeg(p, resolved.backLeg)
  }
  if (p.sliding) {
    // Protect the final balance arms without moving a loaded wall palm away
    // from its own face. Knees still clear the actual sliding surface.
    for (const [i, name] of (['frontArm', 'backArm'] as const).entries()) {
      const bracing = wallBraceSharesSlide(p) && p.wallBrace!.hands[i] > 0
      resolved[name] = clearLimb(p, bracing ? resolved[name] : clearSlidingArm(p, resolved[name]), UPPER_ARM, FOREARM, 1, true,
        bracing, bracing && p.wallBrace!.hands[i] === 1)
    }
  }
  // A running shoe can already reach down a slope before the root starts
  // slipping. Clear its knee in both states so slide entry retains that bend.
  if (p.sliding || p.grounded) {
    resolved.frontLeg = clearSlidingJoint(p, resolved.frontLeg, 15, 14.5, 2.2)
    resolved.backLeg = clearSlidingJoint(p, resolved.backLeg, 15, 14.5, 2.2)
  }
  return resolved
}
