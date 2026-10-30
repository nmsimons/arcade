export type Point = [number, number]
export type Limb = { root: Point; joint: Point; end: Point; hand?: Point; handAngle?: number; handOpen?: number; jointDepth?: number; endDepth?: number }
export const ANKLE_FLEX_LIMIT = .95

/** Limit an added hinge rotation to the limb's existing bend side. Bounds on
 * the added angle alone cannot stop an almost straight knee bending backward.
 * Depth and both bone lengths are unaffected by the projected rotation. */
export function limitLimbBend(limb: Limb, rotation: number): number {
  const ux = limb.joint[0] - limb.root[0], uy = limb.joint[1] - limb.root[1]
  const vx = limb.end[0] - limb.joint[0], vy = limb.end[1] - limb.joint[1]
  const bend = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)
  const side = Math.sign(bend) || 1
  return side * Math.max(0, Math.min(Math.PI, (bend + rotation) * side)) - bend
}

interface LimbReach {
  root: Point; axis: number[]; length: number; center: number[]; radius: number
}

/** One fixed-length, two-bone frame for retargeting and pose transfers.
 * A wrist/ankle close to its root folds through depth instead of stretching. */
export function limbReach(root: Point, target: Point, upper: number, lower: number, depth = 0, minOpening = 0): LimbReach {
  const vector = [target[0] - root[0], target[1] - root[1], depth]
  const minimum = Math.sqrt(upper ** 2 + lower ** 2 - 2 * upper * lower * Math.cos(minOpening)) + .02
  if (Math.hypot(...vector) < minimum) vector[2] = Math.sqrt(Math.max(0, minimum ** 2 - vector[0] ** 2 - vector[1] ** 2))
  const actual = Math.hypot(...vector), length = Math.max(minimum, Math.min(upper + lower - .02, actual))
  const axis = actual > .001 ? vector.map(v => v / actual) : [0, 1, 0]
  const along = (upper ** 2 - lower ** 2 + length ** 2) / (2 * length)
  return { root, axis, length, center: axis.map(v => v * along), radius: Math.sqrt(Math.max(0, upper ** 2 - along ** 2)) }
}

/** Choreography supplies a preferred bend; the shared frame enforces lengths. */
export function limbOnBend(reach: LimbReach, bend: number[], fallback = [reach.axis[1], -reach.axis[0], 0]): Limb {
  const { root, axis, length, center, radius } = reach
  const parallel = bend.reduce((sum, v, i) => sum + v * axis[i], 0)
  let perpendicular = bend.map((v, i) => v - axis[i] * parallel)
  if (Math.hypot(...perpendicular) < .001) perpendicular = fallback
  // A fully depth-facing reach has no projected normal in the image plane.
  if (Math.hypot(...perpendicular) < 1e-8) perpendicular = [1, 0, 0]
  const scale = radius / (Math.hypot(...perpendicular) || 1)
  const joint = center.map((v, i) => v + perpendicular[i] * scale)
  return { root, joint: [root[0] + joint[0], root[1] + joint[1]],
    end: [root[0] + axis[0] * length, root[1] + axis[1] * length], jointDepth: joint[2], endDepth: axis[2] * length }
}

/** Open a folded ankle by turning the knee's bend plane, keeping the hip,
 * ankle and both bone lengths. A planted shoe need not rotate or slide.
 * A tight reach uses its best available bend instead of switching back to
 * the original knee when the full limit becomes unreachable. */
export function openAnkle(limb: Limb, footAngle: number, facing = 1, flex = ANKLE_FLEX_LIMIT): Limb | undefined {
  const dot = (a: number[], b: number[]) => a.reduce((sum, value, i) => sum + value * b[i], 0)
  const calf = [limb.joint[0] - limb.end[0], limb.joint[1] - limb.end[1], (limb.jointDepth ?? 0) - (limb.endDepth ?? 0)]
  const forward = [Math.cos(footAngle) * facing, Math.sin(footAngle) * facing, 0], up = [Math.sin(footAngle), -Math.cos(footAngle), 0]
  const strain = Math.atan2(dot(forward, calf), dot(up, calf)), start = flex - .2
  if (strain <= start) return limb
  // Ease into the limit before contact with it. A hard projected clamp creates
  // a square-root jump in knee depth at the first constrained frame.
  const softened = start + .2 * (1 - Math.exp(-(strain - start) / .2))
  const normal = forward.map((v, i) => v * Math.cos(softened) - up[i] * Math.sin(softened))
  if (dot(normal, calf) <= 1e-8) return limb
  const reach = limbReach(limb.root, limb.end, 15, 14.5, limb.endDepth ?? 0)
  const center = [limb.root[0] + reach.center[0] - limb.end[0], limb.root[1] + reach.center[1] - limb.end[1],
    reach.center[2] - (limb.endDepth ?? 0)]
  const along = dot(normal, reach.axis), projected = normal.map((v, i) => v - along * reach.axis[i])
  const span = Math.hypot(...projected)
  if (span * reach.radius < 1e-8) return undefined
  const amount = -dot(normal, center) / (reach.radius * span)
  const n = projected.map(v => v / span), k = Math.max(-1, Math.min(1, amount))
  const bend = [limb.joint[0] - limb.root[0] - reach.center[0], limb.joint[1] - limb.root[1] - reach.center[1],
    (limb.jointDepth ?? 0) - reach.center[2]]
  const component = dot(bend, n)
  let tangent = bend.map((v, i) => v - component * n[i])
  if (Math.hypot(...tangent) < 1e-8) {
    const a = reach.axis
    tangent = [a[1] * n[2] - a[2] * n[1], a[2] * n[0] - a[0] * n[2], a[0] * n[1] - a[1] * n[0]]
    if (tangent[2] < 0) tangent = tangent.map(v => -v)
  }
  const scale = Math.sqrt(Math.max(0, 1 - k * k)) / Math.hypot(...tangent)
  const result = limbOnBend(reach, n.map((v, i) => v * k + tangent[i] * scale))
  return { ...result, root: limb.root, end: limb.end }
}
