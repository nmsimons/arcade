import type { Vec } from './geometry.ts'
import type { CasterGroup } from './lightingModel.ts'

const samePoints = (a?: readonly Vec[], b?: readonly Vec[]) => a === b || !!a && !!b
  && a.length === b.length && a.every((p, i) => p[0] === b[i][0] && p[1] === b[i][1])
const sameCaster = (a: CasterGroup, b: CasterGroup) => a === b || a.opacity === b.opacity && a.fadingShadow === b.fadingShadow
  && a.length === b.length && a.every((s, i) => {
    const t = b[i]
    return s.x === t.x && s.y === t.y && s.w === t.w && s.h === t.h
      && samePoints(s.polygon, t.polygon) && samePoints(s.profile, t.profile)
  }) && (a.boundary === b.boundary || !!a.boundary && !!b.boundary
    && a.boundary.length === b.boundary.length && a.boundary.every((edge, i) => samePoints(edge, b.boundary![i])))

/** Fold resting opaque silhouettes into the existing terrain light buffers.
 * Compare exact generated geometry, never rounded positions or intended motion.
 * Input groups are immutable snapshots produced by the lighting geometry code. */
export class RestingCasters {
  private previous: { group: CasterGroup; still: number }[] = []
  private fixed: readonly CasterGroup[] = []

  update(groups: readonly CasterGroup[]) {
    const fixed: CasterGroup[] = [], moving: CasterGroup[] = []
    this.previous = groups.filter(group => !group.player).map((group, i) => {
      const old = this.previous[i]
      const entry = old && sameCaster(old.group, group)
        ? { group: old.group, still: Math.min(2, old.still + 1) } : { group, still: 0 }
      // Two unchanged frames avoid repeatedly baking mechanisms during travel.
      // Any movement removes the old shadow before this frame is rendered.
      if (entry.still === 2 && (group.opacity ?? 1) === 1) fixed.push(entry.group)
      else moving.push(group)
      return entry
    })
    moving.push(...groups.filter(group => group.player))
    if (fixed.length !== this.fixed.length || fixed.some((group, i) => group !== this.fixed[i])) this.fixed = fixed
    return { fixed: this.fixed, moving }
  }

  reset() { this.previous = []; this.fixed = [] }
}
