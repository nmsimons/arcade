import { layerSkipped } from './measureLayers.ts'
/** Appearance only. All terrain materials share the same collision and grip.
 * `marks` draw the studio's 80-by-40 swatch; `grain` is the world texture, a
 * 240-by-160 tile whose marks are scattered so no row or column of them lines
 * up across a large mass. No mark crosses the tile's edge. */
export const TERRAIN_MATERIALS = [
  { id: 'stone', label: 'Stone', color: '#999c9e', ink: '#8d9193', marks: [[12, 10, 8, 1.5], [52, 30, 8, 1.5]],
    grain: [[29, 14.5, 8, 1.5], [86, 47, 8, 1.5], [152, 25.5, 8, 1.5], [214, 8, 8, 1.5], [31, 101, 8, 1.5],
      [97, 72.5, 8, 1.5], [195, 56, 8, 1.5], [222, 118, 8, 1.5], [3, 139, 8, 1.5], [134, 145.5, 8, 1.5]] },
  { id: 'earth', label: 'Earth', color: '#b2a18c', ink: '#9e8e7a', marks: [[14, 10, 3, 2], [54, 29, 3, 2], [35, 23, 1.5, 1.5], [73, 7, 1.5, 1.5]],
    grain: [[11, 42, 3, 2], [64, 38.5, 1.5, 1.5], [128, 2, 3, 2], [219, 35.5, 1.5, 1.5], [73, 92, 3, 2], [133, 89, 1.5, 1.5],
      [149, 69.5, 3, 2], [215, 85, 1.5, 1.5], [20, 121, 3, 2], [103, 121.5, 1.5, 1.5], [166, 133, 3, 2], [191, 149, 1.5, 1.5]] },
  { id: 'chalk', label: 'Chalk', color: '#bdc4b5', ink: '#bdc4b5', marks: [], grain: [] },
  { id: 'steel', label: 'Steel', color: '#9aa8b1', ink: '#8c9ca6', marks: [[8, 6, 28, 1], [48, 15, 19, 1], [20, 31, 33, 1]],
    grain: [[28, 20, 28, 1], [97, 40.5, 19, 1], [186, 17, 33, 1], [70, 81.5, 28, 1], [139, 81, 19, 1],
      [205, 57.5, 33, 1], [28, 132, 28, 1], [106, 121, 19, 1], [179, 110.5, 33, 1]] },
] as const
/** The world texture tile, in world units. */
export const TERRAIN_GRAIN_TILE = { w: 240, h: 160 } as const
export type TerrainMaterial = typeof TERRAIN_MATERIALS[number]['id']
export const isTerrainMaterial = (value: unknown): value is TerrainMaterial => TERRAIN_MATERIALS.some(m => m.id === value)
export const terrainMaterial = (id: TerrainMaterial = 'stone') => TERRAIN_MATERIALS.find(m => m.id === id)!

const patterns = new WeakMap<CanvasRenderingContext2D, Map<TerrainMaterial, CanvasPattern>>()
/** Small cached tiles repeat in world space, so joins and camera motion never move the grain. */
export function terrainFill(ctx: CanvasRenderingContext2D, id: TerrainMaterial = 'stone'): string | CanvasPattern {
  const material = terrainMaterial(id)
  if (!material.grain.length || layerSkipped('terrain-texture')) return material.color
  let cache = patterns.get(ctx)
  if (!cache) { cache = new Map(); patterns.set(ctx, cache) }
  const existing = cache.get(id)
  if (existing) return existing
  const { w: tileW, h: tileH } = TERRAIN_GRAIN_TILE
  const tile = document.createElement('canvas'); tile.width = tileW * 2; tile.height = tileH * 2
  const paint = tile.getContext('2d')!
  paint.scale(2, 2)
  paint.fillStyle = material.color; paint.fillRect(0, 0, tileW, tileH)
  paint.fillStyle = material.ink
  for (const [x, y, w, h] of material.grain) paint.fillRect(x, y, w, h)
  const pattern = ctx.createPattern(tile, 'repeat')!
  pattern.setTransform(new DOMMatrix().scale(.5))
  cache.set(id, pattern)
  return pattern
}
