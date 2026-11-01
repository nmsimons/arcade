// Pose clearance: keep the solved skin, limbs and hands outside terrain and props.
import { HAND_CLEARANCE_REACH, handGeometry, traceAndroidHand } from './androidHand.ts'
import { anticipateSlideLanding } from './athleteAnimation.ts'
import { FOREARM, HEAD_RADIUS, MIN_KNEE_OPENING, TAU, UPPER_ARM, add, clamp, lerp, mix, rotatePose, solve, solveNear, solveRear } from './athleteRig.ts'
import type { AthletePose, Leg } from './athleteRig.ts'
import { FOOT_CONTACT, footPoint } from './footwork.ts'
import { nearbyBoundary, nearestBoundary, platformOutline, pointInside } from './geometry.ts'
import { mirrorPlatform } from './gravityFrame.ts'
import type { Limb, Point } from './limbPose.ts'
import { TUNING } from './movementTuning.ts'
import { BOX_RESTING_ANGLE_TOLERANCE } from './propGeometry.ts'
import type { Platform, Player } from './characterTypes.ts'

export const footContours: [boolean, Point[][]][] = [
  [false, [[[-1.6, -1.6], [-2.4, .4]], [[-2.4, .4], [-3, 2.5], [-1.8, 2.8]],
    [[-1.8, 2.8], [2.2, 2.8]], [[2.2, 2.8], [2.2, -.6]], [[2.2, -.6], [1.3, -2], [-1.6, -1.6]]]],
  [true, [[[2.2, 2.8], [4.5, 2.8]], [[4.5, 2.8], [6.2, 2.6], [6, 1.5]],
    [[6, 1.5], [5.6, .2], [3.1, .2], [2.2, -.6]], [[2.2, -.6], [2.2, 2.8]]]],
]
// Rotating shoes can meet a crease with their upper contour, too. Share the
// drawn heel/forefoot curves instead of testing only the loaded sole samples.
const footSkin: { point: Point; toe: boolean }[] = []
const soleSkin = FOOT_CONTACT.map(point => ({ point, toe: point[0] > 2.2 }))
for (const [toe, contours] of footContours) for (const contour of contours) for (let i = 0; i <= 8; i++) {
  let points = contour
  while (points.length > 1) points = points.slice(1).map((b, k) => mix(points[k], b, i / 8))
  footSkin.push({ point: points[0], toe })
}
export const ankleSkin = [...footSkin, ...soleSkin]
// Shared tangent directions let clearance blend with finger articulation.
// Closed grips keep their narrower profile instead of inheriting a flat open
// palm that can cross a leaning ledge. Each curve fits its control-point hull;
// both profiles also contain the original contact oval and its 1.6-unit depth.
const handBoundary: [Point, Point][] = (() => {
  const directions = Array.from({ length: 64 }, (_, i): Point => [Math.cos(i * TAU / 64), Math.sin(i * TAU / 64)])
  const profiles = [0, 1].map(handOpen => {
    const points: Point[] = [], at = (x: number, y: number) => { points.push([x, y]) }
    traceAndroidHand({ moveTo: at, lineTo: at, quadraticCurveTo(cx, cy, x, y) { at(cx, cy); at(x, y) }, closePath() {} },
      { root: [0, 0], joint: [0, 0], end: [0, 0], hand: [0, 0], handAngle: 0, handOpen })
    const support = directions.map(([x, y]) => Math.max(Math.hypot(2.1 * x, 1.6 * y), ...points.map(p => p[0] * x + p[1] * y)))
    return directions.map(([x, y], i): Point => {
      const next = (i + 1) % directions.length, [nx, ny] = directions[next], divisor = x * ny - y * nx
      return [(support[i] * ny - support[next] * y) / divisor, (support[next] * x - support[i] * nx) / divisor]
    })
  })
  // Flat edges need interior samples too: their endpoints can straddle a prop
  // corner while appearing clear. Keep matching samples in both profiles.
  return profiles[0].flatMap((a, i) => {
    const next = (i + 1) % directions.length, b = profiles[0][next], c = profiles[1][i], d = profiles[1][next]
    const count = Math.max(1, Math.ceil(Math.max(Math.hypot(b[0] - a[0], b[1] - a[1]), Math.hypot(d[0] - c[0], d[1] - c[1])) / .25))
    return Array.from({ length: count }, (_, j): [Point, Point] => [mix(a, b, j / count), mix(c, d, j / count)])
  })
})()
/** Conservative hand skin shared by drawing-clearance checks and pose solves. */
export function handOutline(limb: Limb): Point[] {
  const { palm, angle } = handGeometry(limb), cos = Math.cos(angle), sin = Math.sin(angle)
  const open = clamp(limb.handOpen ?? 0)
  return handBoundary.map(([closed, opened]): Point => {
    const x = lerp(closed[0], opened[0], open), y = lerp(closed[1], opened[1], open)
    return [palm[0] + x * cos - y * sin, palm[1] + x * sin + y * cos]
  })
}

/** Extended silhouettes reach beyond the standing controller hull. Keep
 * the head and spine outside nearby solids before solving the reaching limbs. */
function clearanceBoundary(p: Player, solid: Platform, x: number, y: number, origin?: Point) {
  const edge = nearestBoundary(solid, x, y)
  // Both callers already established that this sample is inside the solid.
  if (origin) {
    const ox = p.x + origin[0] * p.facing, oy = p.y + origin[1]
    // A free limb belongs to its clear shoulder/hip. The nearest exit from a
    // thin solid can be its far face, leaving the connecting bone through it.
    if ((ox - edge.x) * edge.nx + (oy - edge.y) * edge.ny < -1e-7 && !pointInside(solid, ox, oy)) {
      return nearestBoundary(solid, x, y, [ox - x, oy - y])
    }
  }
  return edge
}
export function bodyIntrusion(p: Player, point: Point, radius: number, visibleBall?: Platform, origin?: Point) {
  const x = p.x + point[0] * p.facing, y = p.y + point[1]
  for (const b of p.terrain ?? []) {
    if (x < b.x - radius || x > b.x + b.w + radius || y < b.y - radius || y > b.y + b.h + radius) continue
    if (b === visibleBall) {
      // A loaded ball palm touches the drawn circle; its circumscribed motor
      // polygon's narrow outer rim must not dislodge that visible contact.
      const dx = x - b.x - b.w / 2, dy = y - b.y - b.h / 2, distance = Math.hypot(dx,dy), depth = radius + b.w / 2 - distance
      if (depth > .01) return { x: dx / (distance || 1) * (depth + .05) * p.facing, y: dy / (distance || 1) * (depth + .05) }
      continue
    }
    const inside = pointInside(b, x, y)
    if (!inside && radius <= .01) continue
    const edge = inside ? clearanceBoundary(p, b, x, y, origin) : nearbyBoundary(b, x, y, radius)
    if (!edge) continue
    const depth = radius + (inside ? edge.distance : -edge.distance)
    if (depth > .01) {
      // Outside a corner, a circle separates radially from the closest point.
      // Choosing either adjacent edge's normal can jump between X and Y.
      const nx = !inside && edge.distance > .001 ? (x - edge.x) / edge.distance : edge.nx
      const ny = !inside && edge.distance > .001 ? (y - edge.y) / edge.distance : edge.ny
      return { x: nx * (depth + .05) * p.facing, y: ny * (depth + .05) }
    }
  }
  return null
}
export function clearBody(p: Player, source: AthletePose, initial: Point = [0, 0], retainSide = false) {
  const offset: Point = [...initial]
  let pose = rotatePose(source, 0, 1, [0, 0], offset)
  for (let pass = 0; pass < 8; pass++) {
    let point = pose.head, radius = HEAD_RADIUS, shift = bodyIntrusion(p, point, radius)
    for (const [a, b] of [[pose.hip, pose.waist], [pose.waist, pose.shoulder]]) for (let i = 0; !shift && i <= 4; i++) {
      point = mix(a, b, i / 4); radius = 2.8; shift = bodyIntrusion(p, point, radius)
    }
    if (retainSide && !p.grounded) for (const arm of [pose.frontArm, pose.backArm]) {
      for (const [a, b] of [[arm.root, arm.joint], [arm.joint, arm.end]]) for (let i = 0; !shift && i <= 4; i++) {
        point = mix(a, b, i / 4); radius = 1.65; shift = bodyIntrusion(p, point, radius)
      }
      for (const sample of handOutline(arm)) if (!shift) {
        point = sample; radius = .03; shift = bodyIntrusion(p, point, radius)
      }
    }
    if (!shift) break
    if (retainSide && Math.hypot(...initial) > 1) {
      const axis = Math.abs(initial[0]) > Math.abs(initial[1]) ? 0 : 1, other = 1 - axis
      // Crossing a convex corner must not replace the preceding top clearance
      // with a sudden sideways jump. Continue along that clear side when a
      // nearby escape exists, then relax the retained offset in the motor step.
      if (Math.abs([shift.x, shift.y][other]) > Math.abs([shift.x, shift.y][axis])) {
        const direction = Math.sign(initial[axis]), retreat: Point = [0, 0]
        retreat[axis] = direction * 32
        if (!bodyIntrusion(p, add(point, retreat), radius)) {
          let low = 0, high = 32
          for (let i = 0; i < 10; i++) {
            const distance = (low + high) / 2; retreat[axis] = direction * distance
            if (bodyIntrusion(p, add(point, retreat), radius)) low = distance
            else high = distance
          }
          retreat[axis] = direction * high; shift = { x: retreat[0], y: retreat[1] }
        }
      }
    }
    offset[0] += shift.x; offset[1] += shift.y
    pose = rotatePose(pose, 0, 1, [0, 0], [shift.x, shift.y])
  }
  return { pose, offset }
}
/** Find the loaded ball in the current, possibly reflected, pose frame. */
export function pushBallSurface(p: Player) {
  const collider = p.contacts?.push?.collider
  if (collider?.prop?.kind !== 'ball') return undefined
  const surface = collider.platform
  // Pose reflection normalizes terrain and palms while contacts retain their
  // world frame. Use the circle in the current pose's collision frame.
  if (p.terrain?.includes(surface)) return surface
  const reflected = mirrorPlatform(surface)
  return p.terrain?.includes(reflected) ? reflected : surface
}
/** Reaches and bend searches use the same bone radii, palm contour and anchor
 * rules. Cache only within this read-only query of the current terrain. */
export function limbClearance(p: Player, source: Limb,
  { hands = false, handContact = false, holdContact = false, fullPalm = false, fullLeg = false } = {}) {
  const visibleBall = handContact ? pushBallSurface(p) : undefined
  let lastHand: { x: number; y: number; angle: number; hit: ReturnType<typeof bodyIntrusion> } | undefined
  const handIntrusion = (limb: Limb) => {
    const { palm, angle } = handGeometry(limb)
    // Changing an elbow's bend plane can leave the entire palm unchanged.
    // Clearance owns no world writes, so reuse that exact contour query while
    // searching the other bends of the same wrist target.
    if (lastHand?.x === palm[0] && lastHand.y === palm[1] && lastHand.angle === angle) return lastHand.hit
    let deepest: ReturnType<typeof bodyIntrusion> = null
    // An unanchored swimming palm uses one enclosing circle. Full contour
    // queries remain for planted/working hands that must touch a surface.
    if (!fullPalm && p.waterMotion && !p.pushing?.amount && !p.waterMotion.landing && !p.waterMotion.ceiling?.amount && !p.waterMotion.floor) {
      deepest = bodyIntrusion(p, palm, HAND_CLEARANCE_REACH)
    } else for (const point of handOutline(limb)) {
      const hit = bodyIntrusion(p, point, handContact ? 0 : .03, visibleBall)
      if (hit && (!deepest || Math.hypot(hit.x, hit.y) > Math.hypot(deepest.x, deepest.y))) deepest = hit
    }
    lastHand = { x: palm[0], y: palm[1], angle, hit: deepest }
    return deepest
  }
  const clear = (limb: Limb) => {
    const samples = hands || fullLeg ? 10 : 4
    for (const [index, [a, b]] of [[limb.root, limb.joint], [limb.joint, limb.end]].entries()) for (let i = 0; i <= samples; i++) {
      const radius = hands ? 1.65 : 'footAngle' in source ? index ? 1.8 : 2.2 : 1.6
      if (bodyIntrusion(p, mix(a, b, i / samples), radius, holdContact ? visibleBall : undefined, source.root)) return false
    }
    return !hands || !handIntrusion(limb)
  }
  return { clear, handIntrusion, visibleBall }
}

/** Fold through depth around a blocked corner. The projected bend can change
 * without stretching bones or sending a shin/elbow through the solid. */
export function clearLimb(p: Player, source: Limb, upper: number, lower: number, bend: number, hands = false, handContact = false, holdContact = false): Limb {
  const { clear, handIntrusion, visibleBall } = limbClearance(p, source, { hands, handContact, holdContact })
  // A contact palm is relative to its wrist. Retargeting the wrist must carry
  // that palm too; otherwise the hand stays embedded after the arm clears.
  const retarget = (limb: Limb): Limb => source.hand ? { ...limb,
    hand: add(source.hand, [limb.end[0] - source.end[0], limb.end[1] - source.end[1]]) } : limb
  if (clear(source)) return source
  // Folding an elbow through depth must not spin its palm in the image plane.
  // Keep the incoming wrist orientation while finding a clear bend/target.
  if (hands && source.handAngle === undefined) source = { ...source, handAngle: handGeometry(source).angle }
  const fold = (end: Point, previous: Limb) => {
    const dx = end[0] - source.root[0], dy = end[1] - source.root[1], length = Math.hypot(dx, dy)
    if (length < Math.abs(upper - lower) || length > upper + lower) return undefined
    // Every bend shares its shoulder/hip and wrist/ankle. A blocked fixed cap
    // (or a palm with a fixed angle) cannot be repaired by trying 33 elbows.
    // Reject that target once before searching its bend planes.
    const target = retarget({ ...source, end })
    const leg = 'footAngle' in source, solid = holdContact ? visibleBall : undefined
    if (bodyIntrusion(p, source.root, hands ? 1.65 : leg ? 2.2 : 1.6, solid, source.root)
      || bodyIntrusion(p, end, hands ? 1.65 : leg ? 1.8 : 1.6, solid, source.root)
      || hands && source.handAngle !== undefined && handIntrusion(target)) return undefined
    const along = (upper ** 2 - lower ** 2 + length ** 2) / (2 * length)
    const center: Point = [source.root[0] + dx / length * along, source.root[1] + dy / length * along]
    const radius = Math.sqrt(Math.max(0, upper ** 2 - along ** 2)), normal: Point = [-dy / length, dx / length]
    const before = Math.max(-1, Math.min(1, ((previous.joint[0] - center[0]) * normal[0] + (previous.joint[1] - center[1]) * normal[1]) / Math.max(radius, .001)))
    const candidates = Array.from({ length: 33 }, (_, i) => i / 16 - 1).sort((a, b) => Math.abs(a - before) - Math.abs(b - before))
    for (const amount of candidates) {
      const candidate = retarget({ ...source, root: source.root, end,
        joint: add(center, [normal[0] * radius * amount, normal[1] * radius * amount]), jointDepth: radius * Math.sqrt(1 - amount ** 2), endDepth: 0 })
      if (clear(candidate)) return candidate
    }
    return undefined
  }
  // A force-bearing wrist/palm is an anchor. Only its bend plane may change;
  // a free-arm fallback must never retract or shift that physical contact.
  if (holdContact) return fold(source.end, source) ?? source
  let current = source, target: Point = [...source.end]
  for (let pass = 0; pass < 12; pass++) {
    const intrusion = bodyIntrusion(p, target, 1.8, undefined, source.root) ?? (hands ? handIntrusion(retarget({ ...current, end: target })) : null)
    if (intrusion) {
      const separated = add(target, [intrusion.x, intrusion.y])
      // A covered seam can separate out of a wall straight into its floor.
      // Fold toward the clear limb root instead of oscillating between solids.
      const blocked = p.terrain?.some(b => pointInside(b, p.x + separated[0] * p.facing, p.y + separated[1]))
      target = blocked ? mix(target, source.root, .12) : separated
    }
    const solved = solveRear(source.root, target, upper, lower, bend, .6)
    const folded = fold(solved.end, current)
    if (folded) return folded
    // If the straight chord crosses a corner, recover the hand/foot toward the
    // body until there is room, then extend again as normal travel clears it.
    const blocked = bodyIntrusion(p, solved.joint, 1.8, undefined, source.root)
      ?? bodyIntrusion(p, mix(solved.root, solved.joint, .5), 1.8, undefined, source.root)
      ?? bodyIntrusion(p, mix(solved.joint, solved.end, .5), 1.8, undefined, source.root)
    target = blocked ? add(target, [blocked.x, blocked.y]) : mix(target, source.root, .12)
    current = retarget({ ...source, ...solved })
  }
  return retarget({ ...source, ...current, jointDepth: current.jointDepth ?? 0, endDepth: 0 })
}

/** Toes can meet a slope just before the body hull. Keep them on the air side. */
export function clearAirborneFoot(p: Player, leg: Leg, passes = 6): Leg {
  if (!p.terrain?.length) return leg
  let current = leg
  const target: Point = [...leg.end]
  const landing = !!p.slideEntry?.landing || !!p.sliding && !!anticipateSlideLanding(p)
    || p.grounded && !!p.dryTurn?.pushing
  if (landing) passes = Math.max(passes, 16)
  const boundary = p.slideEntry || p.dryTurn || landing || p.freeFall?.amount ? footSkin : soleSkin
  for (let pass = 0; pass < passes; pass++) {
    let deepest: { x: number; y: number; nx: number; ny: number; distance: number } | null = null
    for (const { point, toe } of boundary) {
      const sole = footPoint(point, current.footAngle * current.footFacing, current.toeAngle * current.footFacing, toe)
      const x = p.x + (current.end[0] + sole[0] * current.footFacing * (1 - (current.rear ?? 0))) * p.facing, y = p.y + current.end[1] + sole[1]
      for (const b of p.terrain!) if (pointInside(b, x, y)) {
        const edge = clearanceBoundary(p, b, x, y, leg.root)
        if (edge.distance >= .01 && (!deepest || edge.distance > deepest.distance)) {
          deepest = { ...edge, x: edge.x - x, y: edge.y - y }
        }
      }
    }
    if (!deepest) break
    target[0] += (deepest.x + deepest.nx * .1) * p.facing; target[1] += deepest.y + deepest.ny * .1
    current = { ...current, ...solveNear(current, target, 15, 14.5, landing && p.grounded ? Math.PI / 12 : MIN_KNEE_OPENING) }
  }
  return current
}

/** A stair riser blocks the visible toe and knee before the body starts climbing.
 * Fold the knee in depth, keeping bone lengths and the rest of the pose intact. */
export function clearRiserLeg(p: Player, leg: Leg, cornerOnly = false): Leg {
  let current = leg
  const rootX = p.x + leg.root[0] * p.facing
  for (const b of p.terrain!) {
    if (rootX + 36 < b.x || rootX - 36 > b.x + b.w || p.y < b.y || p.y - 62 > b.y + b.h) continue
    const points = platformOutline(b)
    for (let i = 0; i < points.length; i++) {
      const a = points[i], end = points[(i + 1) % points.length]
      const tolerance = b.looseProp ? b.h * BOX_RESTING_ANGLE_TOLERANCE : 1e-7
      if (Math.abs(a[0] - end[0]) > tolerance) continue
      const normal = Math.sign(end[1] - a[1]), gap = (rootX - a[0]) * normal
      if (gap < 0 || gap > 36) continue
      const side = -normal * p.facing, wall = (a[0] - p.x) * p.facing
      const top = Math.min(a[1], end[1]), bottom = Math.max(a[1], end[1])
      // An established wall brace owns its feet and knee bend. Only a lip
      // within the body needs the additional airborne corner clearance.
      if (cornerOnly && top < p.y - TUNING.height) continue
      let intrusion = 0
      for (const point of FOOT_CONTACT) {
        const sole = footPoint(point, current.footAngle * current.footFacing, current.toeAngle * current.footFacing)
        const y = p.y + current.end[1] + sole[1]
        if (y > top + .01 && y < bottom - .01) intrusion = Math.max(intrusion,
          (current.end[0] + sole[0] * current.footFacing - wall) * side + .05)
      }
      if (intrusion > 0) current = clearAirborneFoot(p, { ...current, ...solve(current.root,
        [current.end[0] - intrusion * side, current.end[1]], 15, 14.5, -1, p.grounded ? Math.PI / 12 : MIN_KNEE_OPENING), jointDepth: 0, endDepth: 0 }, 16)
      const kneeY = p.y + current.joint[1]
      // A shin can cross a bank corner even with its knee above the bank and
      // its sole outside the wall. Check the joining segment as well.
      const crosses = (a: Point, b: Point) => {
        const t = (wall - side * 1.8 - a[0]) / (b[0] - a[0])
        const y = p.y + a[1] + (b[1] - a[1]) * t
        return t >= 0 && t <= 1 && y > top - 1.8 && y < bottom + 1.8
      }
      if ((kneeY < top || kneeY > bottom) && !crosses(current.root, current.joint) && !crosses(current.joint, current.end)
        || (current.joint[0] - wall) * side < -1.8) continue
      const dx = current.end[0] - current.root[0], dy = current.end[1] - current.root[1], length2 = dx * dx + dy * dy
      const along = (15 ** 2 - 14.5 ** 2 + length2) / (2 * length2)
      const center: Point = [current.root[0] + dx * along, current.root[1] + dy * along]
      const out = (current.joint[0] - center[0]) * side
      if (out <= 0) continue
      const amount = clamp(((wall - center[0]) * side - 1.8) / out)
      current = { ...current, joint: mix(center, current.joint, amount),
        jointDepth: Math.sqrt((current.jointDepth ?? 0) ** 2
          + Math.hypot(current.joint[0] - center[0], current.joint[1] - center[1]) ** 2 * (1 - amount ** 2)) }
    }
  }
  return current
}

/** Clear the uphill palm continuously before selecting an elbow bend plane. */
export function clearSlidingArm(p: Player, arm: Limb): Limb {
  if (!p.terrain?.length) return arm
  const intrusion = bodyIntrusion(p, arm.end, 3.5)
  const target = intrusion ? solve(arm.root, add(arm.end, [intrusion.x, intrusion.y]), UPPER_ARM, FOREARM, 1) : arm
  return clearSlidingJoint(p, target, UPPER_ARM, FOREARM, 1.65)
}

/** Keep sliding endpoints fixed while a knee/elbow folds away from actual terrain. */
export function clearSlidingJoint<T extends Limb>(p: Player, limb: T, upper: number, lower: number, radius: number): T {
  if (!p.terrain?.length) return limb
  // Use the knee/elbow's actual nearest face. The motor's slip angle and
  // nearest root contact can temporarily belong to different faces at a
  // landing corner; extending that tangent would over-fold a clear knee.
  const intrusion = bodyIntrusion(p, limb.joint, radius)
  if (!intrusion) return limb
  if (limb.endDepth) {
    // A gathered foot can reach through depth to retain safe knee opening.
    // Rotate its bend on the full 3D reach circle; a planar fold would change
    // the lower bone's length when that endpoint has depth.
    const vector = [limb.end[0] - limb.root[0], limb.end[1] - limb.root[1], limb.endDepth]
    const length = Math.hypot(...vector), axis = vector.map(v => v / length)
    const along = (upper ** 2 - lower ** 2 + length ** 2) / (2 * length)
    const center = axis.map(v => v * along)
    const bend = [limb.joint[0] - limb.root[0] - center[0], limb.joint[1] - limb.root[1] - center[1], (limb.jointDepth ?? 0) - center[2]]
    const depth = Math.hypot(intrusion.x, intrusion.y), normal = [intrusion.x / depth, intrusion.y / depth, 0]
    const parallel = normal.reduce((sum, v, i) => sum + v * axis[i], 0)
    const projected = normal.map((v, i) => v - axis[i] * parallel), span = Math.hypot(...projected)
    if (span < 1e-6) return limb
    const across = projected.map(v => v / span)
    const sideways = [axis[1] * across[2] - axis[2] * across[1], axis[2] * across[0] - axis[0] * across[2], axis[0] * across[1] - axis[1] * across[0]]
    const reach = Math.sqrt(Math.max(0, upper ** 2 - along ** 2))
    const amount = Math.max(-reach, Math.min(reach, bend.reduce((sum, v, i) => sum + v * across[i], 0) + depth / span))
    const side = Math.sign(bend.reduce((sum, v, i) => sum + v * sideways[i], 0)) || Math.sign(sideways[2]) || 1
    const offset = Math.sqrt(Math.max(0, reach ** 2 - amount ** 2)) * side
    const joint = center.map((v, i) => v + across[i] * amount + sideways[i] * offset)
    return { ...limb, joint: add(limb.root, [joint[0], joint[1]]), jointDepth: joint[2] }
  }
  const dx = limb.end[0] - limb.root[0], dy = limb.end[1] - limb.root[1], squared = dx * dx + dy * dy
  if (squared < .001) return limb
  const along = (upper ** 2 - lower ** 2 + squared) / (2 * squared)
  const center: Point = [limb.root[0] + dx * along, limb.root[1] + dy * along]
  const depth = Math.hypot(intrusion.x, intrusion.y)
  const out = ((center[0] - limb.joint[0]) * intrusion.x + (center[1] - limb.joint[1]) * intrusion.y) / depth
  if (out < depth) return limb
  const amount = clamp(1 - depth / out), offset = Math.hypot(limb.joint[0] - center[0], limb.joint[1] - center[1])
  return { ...limb, joint: mix(center, limb.joint, amount),
    jointDepth: Math.sqrt((limb.jointDepth ?? 0) ** 2 + offset ** 2 * (1 - amount ** 2)) }
}
