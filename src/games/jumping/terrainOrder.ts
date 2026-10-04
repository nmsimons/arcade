import type { Platform } from './model.ts'

const orders = new WeakMap<readonly Platform[], { indices: number[]; depths: number[] }>()

/** Back to front, with saved array order breaking ties. Never reorder physics indices. */
export function terrainDrawOrder(platforms: readonly Platform[]): readonly number[] {
  const cached = orders.get(platforms)
  if (cached && cached.depths.length === platforms.length
    && platforms.every((p, i) => (p.zIndex ?? 0) === cached.depths[i])) return cached.indices
  const depths = platforms.map(p => p.zIndex ?? 0)
  const indices = platforms.map((_, i) => i).sort((a, b) => depths[a] - depths[b] || a - b)
  orders.set(platforms, { indices, depths })
  return indices
}
