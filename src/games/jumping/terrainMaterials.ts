/** Appearance only. All terrain materials share the same collision and grip. */
export const TERRAIN_MATERIALS = [
  { id: 'stone', label: 'Stone', color: '#999c9e', ink: '#8d9193', marks: [[12, 10, 8, 1.5], [52, 30, 8, 1.5]] },
  { id: 'earth', label: 'Earth', color: '#b2a18c', ink: '#9e8e7a', marks: [[14, 10, 3, 2], [54, 29, 3, 2], [35, 23, 1.5, 1.5], [73, 7, 1.5, 1.5]] },
  { id: 'chalk', label: 'Chalk', color: '#bdc4b5', ink: '#bdc4b5', marks: [] },
  { id: 'steel', label: 'Steel', color: '#9aa8b1', ink: '#8c9ca6', marks: [[8, 6, 28, 1], [48, 15, 19, 1], [20, 31, 33, 1]] },
] as const
export type TerrainMaterial = typeof TERRAIN_MATERIALS[number]['id']
export const isTerrainMaterial = (value: unknown): value is TerrainMaterial => TERRAIN_MATERIALS.some(m => m.id === value)
export const terrainMaterial = (id: TerrainMaterial = 'stone') => TERRAIN_MATERIALS.find(m => m.id === id)!

const patterns = new WeakMap<CanvasRenderingContext2D, Map<TerrainMaterial, CanvasPattern>>()
/** Small cached tiles repeat in world space, so joins and camera motion never move the grain. */
export function terrainFill(ctx: CanvasRenderingContext2D, id: TerrainMaterial = 'stone'): string | CanvasPattern {
  const material = terrainMaterial(id)
  if (!material.marks.length) return material.color
  let cache = patterns.get(ctx)
  if (!cache) { cache = new Map(); patterns.set(ctx, cache) }
  const existing = cache.get(id)
  if (existing) return existing
  const tile = document.createElement('canvas'); tile.width = 160; tile.height = 80
  const paint = tile.getContext('2d')!
  paint.scale(2, 2)
  paint.fillStyle = material.color; paint.fillRect(0, 0, 80, 40)
  paint.fillStyle = material.ink
  for (const [x, y, w, h] of material.marks) paint.fillRect(x, y, w, h)
  const pattern = ctx.createPattern(tile, 'repeat')!
  pattern.setTransform(new DOMMatrix().scale(.5))
  cache.set(id, pattern)
  return pattern
}
