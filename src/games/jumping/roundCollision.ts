import Matter from 'matter-js'

// Balls use ordered regular polygons, with the first vertex half a segment
// past +X. Keep their exact vertices and axes, but project only the vertices
// adjacent to each analytic extremum instead of rescanning the entire circle.
const roundBodies = new WeakSet<Matter.Body>()
interface ProjectionPlan { angle: number; n: number; values: Float64Array; indices: number[] }
// Matter's runtime record is mutable; its typings omit supportCount.
type QueryCollision = Omit<Matter.Collision, 'depth'> & { depth: number; supportCount: number }
const extrema = new WeakMap<Matter.Vector[], ProjectionPlan>()
const findSupports = (Matter.Collision as unknown as {
  _findSupports(a: Matter.Body, b: Matter.Body, normal: Matter.Vector, direction: number): Matter.Vector[]
})._findSupports
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
      indices.push(Math.floor((Math.atan2(axis.y, axis.x) - angle) * n / (2 * Math.PI) - .5) % n)
    }
    cached = { angle, n, values, indices }; extrema.set(axes, cached)
  }
  return cached!.indices
}

function projection(body: Matter.Body, axis: Matter.Vector, index: number | undefined, result: { min: number; max: number }) {
  const vertices = body.vertices
  if (index === undefined) {
    let min = vertices[0].x * axis.x + vertices[0].y * axis.y, max = min
    for (let i = 1; i < vertices.length; i++) {
      const dot = vertices[i].x * axis.x + vertices[i].y * axis.y
      if (dot > max) max = dot
      else if (dot < min) min = dot
    }
    result.min = min; result.max = max
    return
  }
  const n = vertices.length, mask = n - 1
  let min = Infinity, max = -Infinity
  // The direction lies between these two ordered vertices. Evaluate both to
  // retain projection ties and floating point drift after translation. Use
  // world coordinates for the dot products, just as Matter does.
  for (let offset = 0; offset <= 1; offset++) {
    const high = vertices[(index + offset) & mask]
    const low = vertices[(index + n / 2 + offset) & mask]
    max = Math.max(max, high.x * axis.x + high.y * axis.y)
    min = Math.min(min, low.x * axis.x + low.y * axis.y)
  }
  result.min = min; result.max = max
}

function minimumAxis(a: Matter.Body, b: Matter.Body, axes: Matter.Vector[]) {
  const indicesA = roundBodies.has(a) ? projectionPlan(axes, a.angle, a.vertices.length) : undefined
  let indicesB: number[] | undefined
  if (roundBodies.has(b)) indicesB = indicesA && a.angle === b.angle && a.vertices.length === b.vertices.length
    ? indicesA : projectionPlan(axes, b.angle, b.vertices.length)
  let depth = Number.MAX_VALUE, chosen = axes[0]
  const pa = { min: 0, max: 0 }, pb = { min: 0, max: 0 }
  for (let i = 0; i < axes.length; i++) {
    const axis = axes[i]
    projection(a, axis, indicesA?.[i], pa); projection(b, axis, indicesB?.[i], pb)
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
  // Contact assembly follows Matter.js 0.20's Collision.collides (MIT).
  // Keep its axis tie, ID ordering and support finder, while reusing the exact
  // projections above instead of scanning every vertex again on the winners.
  const collision = Matter.Collision.create(a, b) as QueryCollision
  collision.collided = true
  collision.bodyA = a.id < b.id ? a : b; collision.bodyB = a.id < b.id ? b : a
  a = collision.bodyA; b = collision.bodyB
  collision.parentA = a.parent; collision.parentB = b.parent
  const minimum = ab.depth < bb.depth ? ab : bb
  let nx = minimum.chosen.x, ny = minimum.chosen.y
  if (nx * (b.position.x - a.position.x) + ny * (b.position.y - a.position.y) >= 0) { nx = -nx; ny = -ny }
  collision.normal.x = nx; collision.normal.y = ny
  collision.tangent.x = -ny; collision.tangent.y = nx
  collision.penetration.x = nx * minimum.depth; collision.penetration.y = ny * minimum.depth
  collision.depth = minimum.depth
  const supportsB = findSupports(a, b, collision.normal, 1)
  let count = 0
  if (Matter.Vertices.contains(a.vertices, supportsB[0])) collision.supports[count++] = supportsB[0]
  if (Matter.Vertices.contains(a.vertices, supportsB[1])) collision.supports[count++] = supportsB[1]
  if (count < 2) {
    const supportsA = findSupports(b, a, collision.normal, -1)
    if (Matter.Vertices.contains(b.vertices, supportsA[0])) collision.supports[count++] = supportsA[0]
    if (count < 2 && Matter.Vertices.contains(b.vertices, supportsA[1])) collision.supports[count++] = supportsA[1]
  }
  if (count === 0) collision.supports[count++] = supportsB[0]
  collision.supportCount = count
  return collision
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
