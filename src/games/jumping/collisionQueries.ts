import Matter from 'matter-js'
import { collisionPenetration, roundCollision } from './roundCollision.ts'
import type { CollisionPenetration } from './roundCollision.ts'

interface Geometry {
  revision: number
  id: number
  parent: Matter.Body
  vertices: Matter.Vector[]
  values: Float64Array
}
interface CachedCollision { body: number; other: number; hit: Matter.Collision | null }
interface CachedPenetration { body: number; other: number; hit: CollisionPenetration | null }

interface Neighborhood { bounds: Matter.Bounds; neighbors?: Matter.Body[]; index: number }

/** Conservative, ordered broad phase for a synchronous correction solve.
 * Small translations stay inside a padded envelope. Only leaving it rebuilds
 * adjacency; every actual query still checks the current, unpadded bounds.
 */
class CorrectionNeighborhoods {
  private entries = new Map<Matter.Body, Neighborhood>()
  constructor(bodies: readonly Matter.Body[]) {
    // Only queried bodies need adjacency. Hundreds of static terrain pieces
    // must not trigger an all-pairs terrain/terrain solve every physics tick.
    bodies.forEach((body, index) => this.entries.set(body, { bounds: this.envelope(body), index }))
  }
  private envelope(body: Matter.Body): Matter.Bounds {
    return { min: { x: body.bounds.min.x - 1, y: body.bounds.min.y - 1 }, max: { x: body.bounds.max.x + 1, y: body.bounds.max.y + 1 } }
  }
  invalidate(body: Matter.Body) {
    const entry = this.entries.get(body)
    if (!entry) return
    const bounds = body.bounds, old = entry.bounds
    if (bounds.min.x >= old.min.x && bounds.min.y >= old.min.y && bounds.max.x <= old.max.x && bounds.max.y <= old.max.y) return
    entry.bounds = this.envelope(body)
    entry.neighbors = undefined
    for (const [other, candidate] of this.entries) {
      if (other === body || !candidate.neighbors) continue
      const index = candidate.neighbors.indexOf(body), nearby = Matter.Bounds.overlaps(entry.bounds, candidate.bounds)
      if (nearby) {
        if (index < 0) {
          const at = candidate.neighbors.findIndex(neighbor => this.entries.get(neighbor)!.index > entry.index)
          candidate.neighbors.splice(at < 0 ? candidate.neighbors.length : at, 0, body)
        }
      } else if (index >= 0) candidate.neighbors.splice(index, 1)
    }
  }
  forBody(body: Matter.Body) {
    const entry = this.entries.get(body)!
    return entry.neighbors ??= [...this.entries].flatMap(([other, candidate]) =>
      other !== body && Matter.Bounds.overlaps(entry.bounds, candidate.bounds) ? [other] : [])
  }
}

/** A cache for one synchronous correction step. Hulls often stop changing long
 * before the whole contact chain settles. Reuse only exactly equal geometry;
 * velocities, sleep and mass remain live in the caller's ordered corrections.
 * The caller reads collision records without mutating them. No approximate pose
 * keys, changed iteration counts, or cross-tick retention.
 */
export class CollisionQueries {
  private geometry = new Map<Matter.Body, Geometry>()
  private pairs = new Map<Matter.Body, Map<Matter.Body, CachedCollision>>()
  private penetrations = new Map<Matter.Body, Map<Matter.Body, CachedPenetration>>()
  private tracked: boolean
  private revisions = new Map<Matter.Body, number>()
  private neighborhoods?: CorrectionNeighborhoods
  /** A synchronous owner may opt in if it invalidates every geometry write. */
  constructor(trackChanges = false, bodies?: readonly Matter.Body[]) {
    this.tracked = trackChanges
    if (bodies) {
      if (!trackChanges) throw new Error('Correction neighborhoods require tracked hull edits')
      this.neighborhoods = new CorrectionNeighborhoods(bodies)
    }
  }
  invalidate(body: Matter.Body) {
    this.neighborhoods?.invalidate(body)
    if (this.tracked) this.revisions.set(body, (this.revisions.get(body) ?? 0) + 1)
    else { this.geometry.delete(body); this.pairs.clear(); this.penetrations.clear() }
  }

  /** Every participant is a single convex body in the supplied scene order. */
  collidesNearby(body: Matter.Body): Matter.Collision[] {
    return this.collidesConvex(body, this.neighborhoods!.forBody(body))
  }

  /** Scratch records for this correction query, valid until its next call.
   * Final support/friction queries still build the complete contact manifold. */
  penetrationsNearby(body: Matter.Body): CollisionPenetration[] {
    const revision = this.revision(body), hits: CollisionPenetration[] = []
    let pairs = this.penetrations.get(body)
    if (!pairs) { pairs = new Map(); this.penetrations.set(body, pairs) }
    for (const other of this.neighborhoods!.forBody(body)) {
      if (!Matter.Bounds.overlaps(other.bounds, body.bounds)) continue
      const otherRevision = this.revision(other)
      let cached = pairs.get(other)
      if (!cached) { cached = { body: -1, other: -1, hit: null }; pairs.set(other, cached) }
      if (cached.body !== revision || cached.other !== otherRevision) {
        cached.hit = collisionPenetration(other, body, cached.hit)
        cached.body = revision; cached.other = otherRevision
      }
      if (cached.hit) hits.push(cached.hit)
    }
    return hits
  }
  private revision(body: Matter.Body) {
    if (this.tracked) return this.revisions.get(body) ?? 0
    let g = this.geometry.get(body)
    const size = 2 + body.vertices.length * 2 + body.axes.length * 2
    let changed = !g || g.id !== body.id || g.parent !== body.parent
      || g.values.length !== size || g.vertices.length !== body.vertices.length
    if (g && !changed) {
      let at = 2
      changed = !Object.is(g.values[0], body.position.x) || !Object.is(g.values[1], body.position.y)
      for (let i = 0; !changed && i < body.vertices.length; i++) {
        const v = body.vertices[i]
        changed = g.vertices[i] !== v || !Object.is(g.values[at++], v.x) || !Object.is(g.values[at++], v.y)
      }
      for (let i = 0; !changed && i < body.axes.length; i++) {
        const v = body.axes[i]
        changed = !Object.is(g.values[at++], v.x) || !Object.is(g.values[at++], v.y)
      }
    }
    if (changed) {
      const values = g?.values.length === size ? g.values : new Float64Array(size)
      values[0] = body.position.x; values[1] = body.position.y
      let at = 2
      for (const v of body.vertices) { values[at++] = v.x; values[at++] = v.y }
      for (const v of body.axes) { values[at++] = v.x; values[at++] = v.y }
      g = { revision: (g?.revision ?? 0) + 1, id: body.id, parent: body.parent, vertices: body.vertices.slice(), values }
      this.geometry.set(body, g)
    }
    return g!.revision
  }

  collides(body: Matter.Body, others: Matter.Body[]): Matter.Collision[] {
    // Query's compound traversal and probe objects retain the original path.
    if (body.parts.length !== 1 || body.parts[0] !== body
      || others.some(other => other.parts.length !== 1 || other.parts[0] !== other)) return Matter.Query.collides(body, others)
    return this.collidesConvex(body, others)
  }

  /** The prop correction owner creates every participant as one convex body.
   * It can skip rechecking the entire candidate list on every solver pass. */
  collidesConvex(body: Matter.Body, others: Matter.Body[]): Matter.Collision[] {
    const revision = this.revision(body), hits: Matter.Collision[] = []
    let pairs = this.pairs.get(body)
    if (!pairs) { pairs = new Map(); this.pairs.set(body, pairs) }
    for (const other of others) {
      if (!Matter.Bounds.overlaps(other.bounds, body.bounds)) continue
      const otherRevision = this.revision(other), previous = pairs.get(other)
      let hit
      if (previous?.body === revision && previous.other === otherRevision) hit = previous.hit
      else {
        // Match Query.collides' argument order. SAT ties can depend on it, so
        // reversed queries have separate entries even for the same two hulls.
        hit = roundCollision(other, body)
        pairs.set(other, { body: revision, other: otherRevision, hit })
      }
      if (hit) hits.push(hit)
    }
    return hits
  }
}
