import type { Platform } from './model.ts'
import { pointInside } from './geometry.ts'

export type CornerRadii = [number, number, number, number]
type MechanismWorld = { terrain?: readonly Platform[]; mechanisms: readonly { x: number; y: number; definition: { w: number; h: number } }[] }
const cache = new WeakMap<MechanismWorld, { terrain: MechanismWorld['terrain']; pose: string; radii: CornerRadii[] }>()

/** Cosmetic rounding belongs on exposed corners. At a structural join it would
 * create a pinhole between otherwise continuous faces and a long thin shadow.
 * Return the same radii to the artwork and shadow silhouette; physics is unchanged. */
export function mechanismCornerRadii(world: MechanismWorld): readonly CornerRadii[] {
  const pose = world.mechanisms.map(m => `${m.x},${m.y},${m.definition.w},${m.definition.h}`).join(';')
  const previous = cache.get(world)
  if (previous && previous.terrain === world.terrain && previous.pose === pose) return previous.radii
  const shapes = world.mechanisms.map(m => ({ x: m.x, y: m.y, w: m.definition.w, h: m.definition.h }))
  const radii = shapes.map((shape, index): CornerRadii => {
    const radius = Math.min(2, shape.w / 2, shape.h / 2)
    const neighbors = [...(world.terrain ?? []), ...shapes.filter((_, i) => i !== index)]
      .filter(n => n.x <= shape.x + shape.w && n.x + n.w >= shape.x && n.y <= shape.y + shape.h && n.y + n.h >= shape.y)
    const at = (right: boolean, bottom: boolean) => {
      const x = shape.x + (right ? shape.w : 0), y = shape.y + (bottom ? shape.h : 0)
      const dx = right ? -1 : 1, dy = bottom ? -1 : 1
      // Require contact along a side, not just two corners touching at a point.
      const joined = neighbors.some(n => pointInside(n, x, y) && (
        pointInside(n, x + dx * radius, y - dy * .0001)
        || pointInside(n, x - dx * .0001, y + dy * radius)))
      return joined ? 0 : radius
    }
    return [at(false, false), at(true, false), at(true, true), at(false, true)]
  })
  cache.set(world, { terrain: world.terrain, pose, radii })
  return radii
}
