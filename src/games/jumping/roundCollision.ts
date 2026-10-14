import Matter from 'matter-js'

// Balls use ordered regular polygons, with the first vertex half a segment
// past +X. Keep their exact vertices and axes, but project only the vertices
// adjacent to each analytic extremum instead of rescanning the entire circle.
const roundBodies = new WeakSet<Matter.Body>()
interface ProjectionPlan { angle: number; n: number; values: Float64Array; indices: number[] }
const extrema = new WeakMap<Matter.Vector[], ProjectionPlan>()
/** Register only a ballHull outline (or its rigid/uniformly scaled image). */
export function registerRoundBody(body: Matter.Body) {
  if (body.vertices.length === 32 || body.vertices.length === 64) roundBodies.add(body)
}
export function registerRoundProbe(body: Matter.Body, probe: Matter.Body) {
  if (roundBodies.has(body)) roundBodies.add(probe)
}

function projectionPlan(axes: Matter.Vector[], angle: number, n: number) {
  let cached = extrema.get(axes)
  let changed = !cached || cached.angle !== angle || cached.n !== n || cached.indices.length !== axes.length
  if (cached && !changed) for (let i = 0; i < axes.length; i++) {
    if (cached.values[i * 2] !== axes[i].x || cached.values[i * 2 + 1] !== axes[i].y) { changed = true; break }
  }
  if (changed) {
    const values = new Float64Array(axes.length * 2), indices: number[] = []
    for (const [i, axis] of axes.entries()) {
      values[i * 2] = axis.x; values[i * 2 + 1] = axis.y
      indices.push(Math.round((Math.atan2(axis.y, axis.x) - angle) * n / (2 * Math.PI) - .5) % n)
    }
    cached = { angle, n, values, indices }; extrema.set(axes, cached)
  }
  return cached!.indices
}

function projection(body: Matter.Body, axis: Matter.Vector, index?: number) {
  const vertices = body.vertices
  if (index === undefined) {
    let min = vertices[0].x * axis.x + vertices[0].y * axis.y, max = min
    for (let i = 1; i < vertices.length; i++) {
      const dot = vertices[i].x * axis.x + vertices[i].y * axis.y
      if (dot > max) max = dot
      else if (dot < min) min = dot
    }
    return { min, max }
  }
  const n = vertices.length, mask = n - 1
  let min = Infinity, max = -Infinity
  // Both possible edge endpoints plus a neighbour cover exact projection ties
  // and floating point drift after repeated translation. Use world coordinates
  // for the dot products, just as Matter does, rather than center + radius.
  for (let offset = -1; offset <= 1; offset++) {
    const high = vertices[(index + offset) & mask]
    const low = vertices[(index + n / 2 + offset) & mask]
    max = Math.max(max, high.x * axis.x + high.y * axis.y)
    min = Math.min(min, low.x * axis.x + low.y * axis.y)
  }
  return { min, max }
}

function minimumAxis(a: Matter.Body, b: Matter.Body, axes: Matter.Vector[]) {
  const indicesA = roundBodies.has(a) ? projectionPlan(axes, a.angle, a.vertices.length) : undefined
  let indicesB: number[] | undefined
  if (roundBodies.has(b)) indicesB = indicesA && a.angle === b.angle && a.vertices.length === b.vertices.length
    ? indicesA : projectionPlan(axes, b.angle, b.vertices.length)
  let depth = Number.MAX_VALUE, chosen = axes[0]
  for (let i = 0; i < axes.length; i++) {
    const axis = axes[i], pa = projection(a, axis, indicesA?.[i]), pb = projection(b, axis, indicesB?.[i])
    const overlap = Math.min(pa.max - pb.min, pb.max - pa.min)
    if (overlap < depth) {
      depth = overlap; chosen = axis
      if (overlap <= 0) break
    }
  }
  return { depth, chosen }
}

/** Preserve Matter's SAT axis order, floating point projections, normals and
 * support records. Only registered regular ball hulls use the shortcut. */
export function roundCollision(a: Matter.Body, b: Matter.Body): Matter.Collision | null {
  if (!roundBodies.has(a) && !roundBodies.has(b)) return Matter.Collision.collides(a, b)
  const aa = a.axes, ba = b.axes
  const ab = minimumAxis(a, b, aa)
  if (ab.depth <= 0) return null
  const bb = minimumAxis(b, a, ba)
  if (bb.depth <= 0) return null
  // Let Matter generate the original contact record on the two winning axes.
  // The call is synchronous; restore both full axis arrays before returning.
  a.axes = [ab.chosen]; b.axes = [bb.chosen]
  try { return Matter.Collision.collides(a, b) }
  finally { a.axes = aa; b.axes = ba }
}

/** Matter.Query's bounds, compound traversal and first-hit ordering. */
export function roundQuery(body: Matter.Body, others: Matter.Body[]): Matter.Collision[] {
  const hits: Matter.Collision[] = []
  for (const other of others) {
    if (!Matter.Bounds.overlaps(other.bounds, body.bounds)) continue
    for (let i = other.parts.length === 1 ? 0 : 1; i < other.parts.length; i++) {
      const part = other.parts[i]
      if (!Matter.Bounds.overlaps(part.bounds, body.bounds)) continue
      const hit = roundCollision(part, body)
      if (hit) { hits.push(hit); break }
    }
  }
  return hits
}
