import type { Platform } from './model.ts'
import type { CasterGroup } from './lightingModel.ts'
import { edgeTouchesShape, exposedBoundary, terrainBoundary } from './lightingBoundary.ts'
import type { TerrainEdge } from './lightingBoundary.ts'

const overlaps = (a: Platform, b: Platform) => a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y

/** Join only structural solids. Loose props, bots and the player remain distinct
 * casters. Unaffected terrain retains its cached light field while mechanisms
 * clip a small set of nearby edges at their actual (not intended) positions. */
export class MechanismLighting {
  private terrain?: readonly CasterGroup[]
  private shapes: readonly Platform[] = []
  private edges: readonly TerrainEdge[] = []
  private affected = new Set<TerrainEdge>()
  private pose = ''
  private result: { fixed: readonly CasterGroup[]; moving: readonly CasterGroup[] } = { fixed: [], moving: [] }

  update(terrain: readonly CasterGroup[], mechanisms: readonly CasterGroup[]) {
    const shapes = mechanisms.flat()
    // Mechanisms are axis-aligned rounded rectangles with a fixed corner radius.
    const pose = shapes.map(shape => `${shape.x},${shape.y},${shape.w},${shape.h}`).join(';')
    const changedTerrain = this.terrain !== terrain
    if (!changedTerrain && this.pose === pose) return this.result
    if (changedTerrain) {
      this.terrain = terrain; this.shapes = terrain.flat(); this.edges = terrain.flatMap(group => group.boundary ?? [])
    }
    const affected = new Set(this.edges.filter(edge => shapes.some(shape => edgeTouchesShape(edge, shape))))
    // Cache identity changes only when the affected edge set changes, not for
    // every pixel of movement along an edge. Opening a gap restores that edge.
    const changedEdges = changedTerrain || affected.size !== this.affected.size || [...affected].some(edge => !this.affected.has(edge))
    const fixed = changedEdges ? affected.size ? terrain.map(group =>
      Object.assign([...group], { boundary: group.boundary?.filter(edge => !affected.has(edge)) })) : terrain : this.result.fixed
    const nearby = this.shapes.filter(shape => shapes.some(moving => overlaps(shape, moving)))
    const boundary = [...exposedBoundary([...affected], shapes), ...exposedBoundary(terrainBoundary(shapes), nearby)]
    this.affected = affected; this.pose = pose
    this.result = { fixed, moving: boundary.length ? [Object.assign(shapes, { boundary })] : [] }
    return this.result
  }

  reset() {
    this.terrain = undefined; this.shapes = []; this.edges = []; this.affected.clear(); this.pose = ''
    this.result = { fixed: [], moving: [] }
  }
}
