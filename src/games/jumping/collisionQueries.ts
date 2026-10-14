import Matter from 'matter-js'
import { roundCollision } from './roundCollision.ts'

interface Geometry {
  revision: number
  id: number
  parent: Matter.Body
  vertices: Matter.Vector[]
  values: Float64Array
}
interface CachedCollision { body: number; other: number; hit: Matter.Collision | null }

/** A cache for one synchronous correction step. Hulls often stop changing long
 * before the whole contact chain settles. Reuse only exactly equal geometry;
 * velocities, sleep and mass remain live in the caller's ordered corrections.
 * The caller reads collision records without mutating them. No approximate pose
 * keys, changed iteration counts, or cross-tick retention.
 */
export class CollisionQueries {
  private geometry = new Map<Matter.Body, Geometry>()
  private pairs = new Map<Matter.Body, Map<Matter.Body, CachedCollision>>()
  private tracked: boolean
  private revisions = new Map<Matter.Body, number>()
  /** A synchronous owner may opt in if it invalidates every geometry write. */
  constructor(trackChanges = false) { this.tracked = trackChanges }
  invalidate(body: Matter.Body) {
    if (this.tracked) this.revisions.set(body, (this.revisions.get(body) ?? 0) + 1)
    else { this.geometry.delete(body); this.pairs.clear() }
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
