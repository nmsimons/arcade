import Matter from 'matter-js'
import { CollisionQueries } from './collisionQueries.ts'
import { countLabSolver } from './labSolver.ts'

/** One ordered correction epoch. Every mutation is reported with the bounds
 * from before and after it. A query can acquire or lose a collision only when
 * its own hull changes or a changed collider overlaps those bounds. Keep the
 * original sweep order; dirty membership avoids queries, not live corrections.
 */
export class ActivePropContacts {
  readonly queries = new CollisionQueries(true)
  private dirty: Set<Matter.Body>
  private props: Matter.Body[]
  constructor(props: Matter.Body[]) { this.props = props; this.dirty = new Set(props) }

  collides(body: Matter.Body, candidates: Matter.Body[]) {
    countLabSolver('propQueries')
    if (!this.dirty.delete(body)) { countLabSolver('propSkipped'); return [] }
    return this.queries.collides(body, candidates)
  }

  changed(body: Matter.Body, previous: Matter.Bounds) {
    countLabSolver('propMutations')
    this.queries.changed(body)
    for (const prop of this.props) if (prop === body || Matter.Bounds.overlaps(previous, prop.bounds)
      || Matter.Bounds.overlaps(body.bounds, prop.bounds)) this.dirty.add(prop)
  }
}
export function copyBounds(body: Matter.Body): Matter.Bounds {
  return { min: { ...body.bounds.min }, max: { ...body.bounds.max } }
}
