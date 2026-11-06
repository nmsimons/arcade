// Ladder and rope climbing.
import { handGeometry } from '../androidHand.ts'
import { athletePose, presentedAthletePose } from '../athletePose.ts'
import { FOREARM, HEAD_RADIUS, UPPER_ARM, add, lerp, mix, mixAngle, reachingBend, rotatePose, smooth, solveRear, transferPose } from '../athleteRig.ts'
import type { AthletePose, Leg } from '../athleteRig.ts'
import { climbBody, climbGait, climbNormal, climbPoint, holdLoad, rappelFrame, rappelWeight, ropePoint, ropePump } from '../climbables.ts'
import { FOOT_CONTACT, footPoint } from '../footwork.ts'
import { nearestBoundary, pointInside } from '../geometry.ts'
import { limbOnBend, limbReach } from '../limbPose.ts'
import type { Limb, Point } from '../limbPose.ts'
import { ropeArmReach, ropeHangOffset } from '../ropeBodyMotion.ts'
import { keepRopeGrip } from '../ropeGravity.ts'
import type { Player } from '../characterTypes.ts'
/**
 * Climbing a steep rope, the body sets off side-on and turns its back to the
 * camera once per this length of climbing, midway, before turning side-on again.
 */
const ROPE_SPIN = 420

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
  // Traveling a rope is seen side-on, facing the way the robot goes. Climbing a steep rope, now and then
  // the body turns slowly on the rope until its back is to the camera, then back again.
  // Swinging on a rope, the robot stays side-on the whole swing, facing the one way, rather than turning
  // toward each pump.
  const swinging = c.rope ? Math.max(Math.abs(c.lean), Math.abs(c.swingVelocity) * 1.5) : Math.abs(c.lean)
  const shimmying = smooth(c.shimmyBlend ?? 0), leaning = lerp(smooth(swinging / .65), 1, bracing)
  const turnedAway = smooth((.5 - .5 * Math.cos((c.climbed ?? 0) * Math.PI * 2 / ROPE_SPIN) - .7) / .3)
  const twist = c.rope ? 1 - turnedAway * smooth(((c.ropeVertical ?? 0) - .6) / .3) : 1
  const travelView = c.rope ? shimmying * twist * smooth(c.pivot ?? 1) : 0
  // How far into a swinging run along a level rope the robot is, from 0 to 1.
  const run = c.rope ? smooth(c.pace ?? 0) * (1 - (c.ropeVertical ?? 1)) * shimmying : 0
  const sideView = c.rope ? Math.max(leaning, travelView) : leaning
  const facing = lerp(c.rope ? 1 : Math.sign(c.lean) * p.facing || 1, 1, bracing)
  // Catching a rope in flight, the legs keep their side-on stride through the catch, then turn into the hang.
  const legView = c.rope ? lerp(1, sideView, blend) : sideView
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
      // A reaching hand arcs off the rope and back onto it, on the side away from the body, which hangs
      // below and just behind the grip: up over a level rope, out in front of a steep one. The arc fades
      // where the rope runs straight away from the body, so the side never flips during a reach.
      // Seen from behind, it travels close along the rope instead of flapping out to the side.
      if (!foot && c.rope && step.lift) {
        const away = (normal[0] * p.facing * 6 - normal[1] * 14) / 15.2
        // Running, the free hand lifts higher, clear over the rope to the next hold. Climbing a steep rope, the
        // hand stays close along it, so it never flicks out in front of the chest.
        const amount = step.lift * lerp(4.5 * lerp(.6, 1, shimmying), 10.5, run) * lerp(sideView, 1, normal[1] ** 2) * smooth(Math.abs(away) / .25)
          * lerp(1, .35, smooth(((c.ropeVertical ?? 0) - .5) / .4))
        point[0] += normal[0] * Math.sign(away) * amount; point[1] += normal[1] * Math.sign(away) * amount
      }
    }
    return { point: local(point), supported, planted: supported && step.planted,
      angle: c.rope && supported ? -Math.PI / 2 - Math.atan2(normal[1], normal[0]) * p.facing : 0 }
  }
  // Bring the lower hand up beside the supporting hand before hanging from the grip.
  // On a rope each hand is where it holds, or on its way to a new hold: hand over hand while traveling,
  // together at the grip at rest.
  const grip = c.rope ? d : gait.grip, handHolds = c.rope ? c.holds : null
  const hands = gait.hands.map((hand, i) => {
    const hold = handHolds?.[i]
    // Running, the free hand peels straight up off the rope, carries over the top and settles down onto the
    // next hold from above, so the let-go and the catch both read.
    const t = hold && hold.reach < 1 ? hold.reach : 0, peel = smooth(t / .18) * smooth((1 - t) / .22)
    return contact(c.rope ? { ...hand, distance: hold?.at ?? d, lift: hold && hold.reach < 1 ? lerp(Math.sin(t * Math.PI), peel, run) : 0, planted: !hold || hold.reach >= 1 }
      : { ...hand, distance: lerp(hand.distance, grip, hanging), lift: hand.lift * (1 - hanging) }, false, i ? 1 : -1)
  })
  const feet = [contact(gait.feet[0], true, -1), contact(gait.feet[1], true, 1)]
  if (hanging) {
    // A rope's body hangs from its grip while the hands take turns, just behind the rope while traveling,
    // swinging toward whichever hand bears its weight.
    const sway = c.sway ?? { x: 0, y: 0 }
    const mid = c.rope ? add(local(climbPoint(c, d)), [((c.setback ?? 0) * twist * smooth(c.pivot ?? 1) + sway.x) * p.facing, sway.y]) : mix(hands[0].point, hands[1].point, .5)
    // Swinging, the chest hangs back behind the rope whichever way the robot pumps, the rope in front of its
    // face; pumping back, the hips and legs carry the arch.
    const out = -(c.rope ? Math.abs(lean) : lean) * 12, spread = 3.9 * blend * (1 - sideView)
    // Traveling, the chest rides closer to the grip than an arm's length; each hand may reach to full stretch.
    const reach = ropeArmReach(c), holdReach = c.rope ? lerp(reach, UPPER_ARM + FOREARM + 2.6, shimmying) : reach
    const chest = add(mid, [out, Math.sqrt(reach ** 2 - (Math.abs(out) + spread) ** 2) - .7])
    // Reach up and forward to the fixed grip, with the head behind the hands.
    // The pelvis and legs still lead the pump; this offset only changes the silhouette.
    // A hand reaching through the air bears almost none of the weight, so the body hangs from the other.
    const load = hands.map((_, i) => { const h = c.holds?.[i]; return h ? holdLoad(h) : 1 })
    const pull = load.map(w => 1 - (1 - w) ** (1 / 12))
    for (let pass = 0; pass < 12; pass++) for (const [i, hand] of hands.entries()) {
      const offset = (i ? 1 : -1) * spread
      const dx = chest[0] + offset - hand.point[0], dy = chest[1] + .7 - hand.point[1], length = Math.hypot(dx, dy)
      if (length > holdReach) {
        chest[0] += (hand.point[0] + dx * holdReach / length - offset - chest[0]) * pull[i]
        chest[1] += (hand.point[1] + dy * holdReach / length - .7 - chest[1]) * pull[i]
      }
    }
    // Traveling hand over hand, as one hand lets go and reaches ahead the holding arm bends at the elbow and
    // pulls the body forward and up toward its hand, then lets it down again as the reaching hand takes hold.
    // Running, the swing does more of the work; on a steep rope the arms are already bent.
    // It never draws the head up into the rope, as up a steep stretch toward a higher hand.
    if (c.rope && c.holds) for (const [i, hold] of c.holds.entries()) {
      const other = c.holds[1 - i]
      if (hold.reach < 1 || other.reach >= 1 || !other.toward) continue
      let amount = 6 * Math.sin(other.reach * Math.PI) * shimmying * (1 - .4 * run) * (1 - .7 * (c.ropeVertical ?? 0))
      const dx = hands[i].point[0] - chest[0], dy = hands[i].point[1] - chest[1], length = Math.hypot(dx, dy)
      if (amount < .01 || length < amount + 8) continue
      const rope = Array.from({ length: 31 }, (_, k) => local(climbPoint(c, Math.max(0, Math.min(c.rope!.definition.length, d - 30 + k * 2)))))
      const headGap = (at: Point) => Math.min(...rope.map(q => Math.hypot(at[0] - q[0], at[1] - 7.3 - q[1])))
      const before = headGap(chest), after = headGap([chest[0] + dx / length * amount, chest[1] + dy / length * amount]), limit = HEAD_RADIUS + 4
      if (after < limit) amount *= Math.max(0, Math.min(1, (before - limit) / Math.max(1e-6, before - after)))
      chest[0] += dx / length * amount; chest[1] += dy / length * amount
    }
    // Running along a level rope, the body swings like a pendulum from the hand it hangs by, carrying on
    // along the line of that arm, trailing behind it, then swinging out ahead. It swings loosely, not as one
    // board: the chest follows the arm, the hips follow the legs, which swing through a beat later, and the
    // waist flexes between them. As the legs swing forward the waist pikes, drawing them through; swinging
    // back, it opens into an arch. A little of each holds at the ends of the swing: piked out in front, arched
    // behind.
    const bodySwing = c.swingAngle?.angle ?? 0, legSwingAngle = c.swingAngle?.legs ?? 0, legVelocity = c.swingAngle?.legVelocity ?? 0
    const forward = smooth(Math.max(0, legVelocity * p.facing) / 8), backward = smooth(Math.max(0, -legVelocity * p.facing) / 8)
    const legsAhead = Math.max(-1, Math.min(1, legSwingAngle * p.facing / .5))
    const tap = (-.4 * forward + .28 * backward - .15 * legsAhead) * run
    const turn = (v: Point, angle: number): Point => [v[0] * Math.cos(angle) - v[1] * Math.sin(angle), v[0] * Math.sin(angle) + v[1] * Math.cos(angle)]
    const swingAngle = -bodySwing * p.facing * .7, hipSwing = -lerp(bodySwing, legSwingAngle, .7) * p.facing * .7 + tap * .7
    const swung = (v: Point): Point => turn(v, swingAngle)
    const pump = ropePump(c, turnAngle, p.facing), offset = (point: Point): Point => swung([point[0] * p.facing, point[1]])
    // Traveling hand over hand, the body rocks with the strokes: the hips and legs swing one way as one
    // hand reaches and back the other way as the next one does. Running, a little of it carries on.
    const reachOf = (i: number) => { const h = c.holds?.[i]; return h && h.reach < 1 && h.toward ? Math.sin(h.reach * Math.PI) : 0 }
    const rock = (reachOf(0) - reachOf(1)) * shimmying * (1 - .6 * smooth(c.pace ?? 0) * (1 - (c.ropeVertical ?? 1)))
    const waistPoint = add(chest, offset(pump.waist))
    const pelvis = add(add(waistPoint, turn([(pump.hip[0] - pump.waist[0]) * p.facing, pump.hip[1] - pump.waist[1]], hipSwing)), [rock * 3, 0])
    hip = mix(hip, pelvis, hanging); waist = mix(waist, waistPoint, hanging)
    shoulder = mix(shoulder, chest, hanging)
    const neck = lean - (c.bodyMotion?.angle ?? 0) * p.facing * .75 + pump.curl * p.facing
    head = mix(head, add(chest, [neck, -Math.sqrt(7.3 ** 2 - neck ** 2)]), hanging)
    // Traveling hand over hand, the legs hang relaxed and nearly straight, trailing a little behind and
    // swinging together after the body as it swings from hand to hand. As a hand lets go and reaches, the
    // leg on its side flexes a little, its foot drawn back under the hips, so the knee never punches
    // forward into the rope; lowering, that leg reaches down instead. In a front or back view the feet
    // hang apart under the hips.
    const trail = Math.sin(c.bodyMotion?.legs ?? 0) * 20
    const lowering = smooth(c.lowering ?? 0)
    // Running, the legs swing loosely after the body, through nearly its whole arc but a beat behind it, so
    // the body bends at the hips through each catch instead of flipping over stiffly. The trailing leg hangs
    // a few degrees further back with a little more bend, the two in a gentle scissor. The knees stay soft,
    // never locked; only while the legs swing forward do the shins trail behind them, the knees bending
    // further, then they lengthen again toward each end of the swing. The waist's pike and arch carry the legs.
    const through = forward * run
    const legTurn = (i: number) => lerp(swingAngle, -.85 * legSwingAngle * p.facing + (i ? .1 : 0) + through * .08, run) + tap * .7
    // Hip to ankle, for a knee bent by the given angle.
    const bentLength = (bend: number) => Math.sqrt(15 ** 2 + 14.5 ** 2 + 2 * 15 * 14.5 * Math.cos(bend)) + 1
    const straight = smooth(Math.min(1, run * 2.5))
    const relaxed = (i: number): Point => {
      const lift = c.holds?.[i] && c.holds[i].reach < 1 && c.holds[i].toward ? Math.sin(c.holds[i].reach * Math.PI) * (1 - .6 * run) : 0
      const x = (-2.5 + (i ? 0 : 1.5) * (1 - run) + lift * lerp(-2, .5, lowering)) * sideView + (i ? 3.4 : -3.4) * (1 - sideView)
        + trail * (i ? .85 : 1) * p.facing * (1 - .7 * run) + rock * 3
      const y = lerp(i ? 29.5 : 29.1, 30.3, straight) + lift * lerp(-2.5, 1, lowering)
      const length = Math.hypot(x, y), running = bentLength(.17 + .26 * through + (i ? .15 : 0))
      const scale = lerp(length, running, run) / (length || 1)
      return [x * scale, y * scale]
    }
    feet[0].point = mix(feet[0].point, add(pelvis, offset(pump.frontFoot)), hanging)
    feet[1].point = mix(feet[1].point, add(pelvis, offset(pump.backFoot)), hanging)
    if (shimmying) for (const [i, foot] of feet.entries()) foot.point = mix(foot.point, add(pelvis, turn(relaxed(i), legTurn(i))), shimmying * hanging)
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
    // Catching, the hands close on the rope well before the body settles into the hang.
    const grab = smooth(c.time / .1)
    hands[0].point = mix(at(source.frontArm.end), hands[0].point, grab); hands[1].point = mix(at(source.backArm.end), hands[1].point, grab)
    feet[0].point = mix(at(source.frontLeg.end), feet[0].point, blend); feet[1].point = mix(at(source.backLeg.end), feet[1].point, blend)
  }
  // Swinging, the rope is held right in front of the face, and braced the wall pose places the head;
  // clearance applies while traveling.
  // A hanging body swung along by the rope, without pumping, keeps its head clear too.
  const clearing = c.rope ? sideView * Math.max(shimmying, smooth(Math.abs(c.swingVelocity) * 2)) * (1 - bracing) * (1 - smooth(Math.abs(c.lean) / .3)) : 0
  if (c.rope && clearing > .01) {
    // Seen side-on, the head stays clear of the rope where it runs close by: on a slope the rope behind the
    // head can sit lower than the hands, and a leaning rope can pass over it. The nearby rope pushes the
    // head straight off it, toward the side the body hangs on, far enough to clear it, and the shoulders
    // and hips move with it as one. Points along the rope fade in as they come near, so the push never jumps.
    const clear = HEAD_RADIUS + 1.2
    // A steep rope hangs on down past the body below the hands, in front of it; only rope that runs over or
    // behind the head counts.
    const grip = local(climbPoint(c, d))
    const points: { q: Point, n: Point, keep: number }[] = []
    for (let s = Math.max(0, d - 36); s <= Math.min(c.rope.definition.length, d + 36); s += 1) {
      // The rope's direction over a short chord, so a kink where a hand loads it cannot swing the push about.
      const q = local(climbPoint(c, s)), a = local(climbPoint(c, Math.max(0, s - 6))), r = local(climbPoint(c, Math.min(c.rope.definition.length, s + 6)))
      const t: Point = [r[0] - a[0], r[1] - a[1]], tl = Math.hypot(t[0], t[1])
      // Below the hands, steep rope fades out of the reckoning rather than dropping out at once.
      const keep = q[1] > grip[1] ? smooth((.8 - Math.abs(t[1]) / (tl || 1)) / .2) : 1
      if (tl < 1e-6 || !keep) continue
      points.push({ q, n: [-t[1] / tl, t[0] / tl], keep })
    }
    // The body's side of the rope, decided once from the stretch nearest the head: the chest's side.
    const nearest = points.reduce<{ q: Point, n: Point, keep: number } | null>((a, b) => !a || Math.hypot(head[0] - b.q[0], head[1] - b.q[1]) < Math.hypot(head[0] - a.q[0], head[1] - a.q[1]) ? b : a, null)
    const across = nearest ? (shoulder[0] - nearest.q[0]) * nearest.n[0] + (shoulder[1] - nearest.q[1]) * nearest.n[1] : 1
    const flip = across < 0 ? -1 : 1
    const side: Point = nearest ? [nearest.n[0] * flip, nearest.n[1] * flip] : [0, 1]
    // As the shoulders cross the rope line, as they do settling into a brace, the side is in doubt: the push
    // fades out there, so it turns about at nothing rather than jumping across.
    const sure = smooth(Math.abs(across) / 4)
    const away: Point = [0, 0]; let needed = 0
    for (const { q, n: normal, keep } of points) {
      const near = smooth((clear + 3 - Math.hypot(head[0] - q[0], head[1] - q[1])) / 3) * keep
      if (!near) continue
      const n: Point = side[0] * normal[0] + side[1] * normal[1] < 0 ? [-normal[0], -normal[1]] : normal
      const depth = Math.max(0, clear - ((head[0] - q[0]) * n[0] + (head[1] - q[1]) * n[1]))
      away[0] += n[0] * depth * near; away[1] += n[1] * depth * near; needed = Math.max(needed, depth * near)
    }
    const length = Math.hypot(away[0], away[1])
    if (length > 1e-6 && needed > 0) {
      // The body hangs below the rope, so the head never rises into the hands, even where the rope curves
      // up on both sides of it at the bottom of a sag. The hanging legs go with the hips, so dropping clear
      // of the rope never folds the knees into a seat.
      const move = Math.min(12, needed) * clearing * sure, shift: Point = [away[0] / length * move, Math.max(0, away[1] / length * move)]
      head = add(head, shift); shoulder = add(shoulder, shift); waist = add(waist, shift); hip = add(hip, shift)
      const hung = hanging * (1 - bracing)
      for (const foot of feet) foot.point = add(foot.point, [shift[0] * hung, shift[1] * hung])
    }
  }
  if (c.rope && wallFrame && sideView * bracing > .01) {
    // Braced at a wall below a rope that runs off at a slant, such as one tied partway up the wall, the
    // head and shoulders settle down and away beneath the rope instead of passing through it.
    const clear = HEAD_RADIUS + 1.2, grip = local(climbPoint(c, d))
    const away: Point = [0, 0]; let needed = 0
    for (let s = Math.max(0, d - 36); s <= Math.min(c.rope.definition.length, d + 36); s += 1) {
      const q = local(climbPoint(c, s)), a = local(climbPoint(c, Math.max(0, s - 6))), r = local(climbPoint(c, Math.min(c.rope.definition.length, s + 6)))
      const t: Point = [r[0] - a[0], r[1] - a[1]], tl = Math.hypot(t[0], t[1])
      // The rope hanging on down the wall below the hands runs beside the body, not over the head.
      const keep = q[1] > grip[1] ? smooth((.8 - Math.abs(t[1]) / (tl || 1)) / .2) : 1
      if (tl < 1e-6 || !keep) continue
      const near = smooth((clear + 3 - Math.hypot(head[0] - q[0], head[1] - q[1])) / 3) * keep
      if (!near) continue
      // Always beneath the rope: the side of it that faces down.
      let n: Point = [-t[1] / tl, t[0] / tl]
      if (n[1] < 0) n = [-n[0], -n[1]]
      // Only a clearly slanting rope: one running down the wall face passes beside the head.
      const depth = Math.max(0, clear - ((head[0] - q[0]) * n[0] + (head[1] - q[1]) * n[1])) * smooth((n[1] - .35) / .3)
      away[0] += n[0] * depth * near; away[1] += n[1] * depth * near; needed = Math.max(needed, depth * near)
    }
    const length = Math.hypot(away[0], away[1])
    if (length > 1e-6 && needed > 0) {
      const move = Math.min(9, needed) * sideView * bracing, shift: Point = [away[0] / length * move, away[1] / length * move]
      head = add(head, shift); shoulder = add(shoulder, shift); waist = add(waist, shift); hip = add(hip, shift)
    }
  }
  const arms = hands.map((hand, i) => {
    const side = i ? 1 : -1, socket = add(shoulder, [side * 3.9 * blend * (1 - sideView), .7])
    // Reaching overhead, the shoulder rises a little toward the hand; a running reach leads with the shoulder.
    const leads = c.rope && (c.holds?.[i]?.reach ?? 1) < 1 ? 3 + 3 * run : 3
    const gap = Math.hypot(hand.point[0] - socket[0], hand.point[1] - socket[1]), lift = c.rope ? Math.min(leads, Math.max(0, gap - (UPPER_ARM + FOREARM))) : 0
    const root: Point = lift ? [socket[0] + (hand.point[0] - socket[0]) / gap * lift, socket[1] + (hand.point[1] - socket[1]) / gap * lift] : socket
    const solved = solveRear(root, hand.point, UPPER_ARM, FOREARM, 1, lerp(side * .6, facing, sideView), 3,
      bracing * smooth(c.rappelPull ?? 0))
    // Until the top rung is within reach, keep the palm on its wrist instead
    // of stretching the hand artwork to an unreachable support.
    // A hand reaching through the air stays on its wrist, even at full stretch.
    const reaching = !!c.rope && (c.holds?.[i]?.reach ?? 1) < 1
    return { ...solved, hand: boarding || reaching ? solved.end : hand.point }
  })
  const legs = feet.map((foot, i) => {
    const side = i ? 1 : -1
    const spread = lerp(-side * lerp(foot.supported ? .2 : .1, .5, hanging), -facing, legView)
    const solved = solveRear(add(hip, [side * 2.7 * blend * (1 - legView), 1]), foot.point, 15, 14.5, 1,
      spread)
    const wallAngle = -Math.PI / 2 + (wallFrame?.steps[i].lift ?? 0) * .4
    const leg: Leg = { ...solved, rear: 1 - legView, footAngle: lerp(lerp(foot.angle, facing * .12, legView), wallAngle, bracing), toeAngle: 0,
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
