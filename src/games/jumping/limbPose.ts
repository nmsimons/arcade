export type Point = [number, number]
export type Limb = { root: Point; joint: Point; end: Point; hand?: Point; handAngle?: number; jointDepth?: number; endDepth?: number }

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
