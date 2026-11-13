import { ArtPath } from './webgl/artPath.ts'
import { pointInside, polygonArea, validPolygon } from './geometry.ts'
import type { Vec } from './geometry.ts'
import { parseObjectName } from './objectNames.ts'
import { nightModeEnabled } from './ambientLight.ts'
import type { JumpLevel } from './level.ts'

export interface BackWall {
  x: number; y: number; w: number; h: number
  kind: 'facility' | 'cave'
  polygon?: Vec[]
  name?: string
  lighting?: 'day' | 'night'
}
/** Background and lighting regions are independent of collision geometry. */
interface EnvironmentSettings {
  walls: BackWall[]
  lighting?: 'uniform' | 'regions'
  baseLighting?: 'day' | 'night'
  groundCover?: { x: number; y: number; w: number }[]
}
export type LevelEnvironment = EnvironmentSettings & ({ kind: 'landscape'; horizon: number } | { kind: 'interior'; horizon?: number })
export const openAirAt = (environment: LevelEnvironment, x: number, y: number) => !environment.walls.some(wall => pointInside(wall, x, y))
export const regionLighting = (environment: LevelEnvironment, x: number, y: number): 'day' | 'night' => {
  for (let i = environment.walls.length - 1; i >= 0; i--) if (pointInside(environment.walls[i], x, y)) return environment.walls[i].lighting ?? 'night'
  return environment.baseLighting ?? 'day'
}
export const hasRegionLighting = (environment: LevelEnvironment | undefined) => !!environment && environment.lighting !== 'uniform'
export const usesRegionLighting = (level: Pick<JumpLevel, 'environment' | 'lighting'>) => hasRegionLighting(level.environment) && nightModeEnabled(level.lighting)

export function parseEnvironment(value: unknown, width: number, height: number): LevelEnvironment {
  const fail = (): never => { throw new Error('Invalid environment: keep background settings, back walls and ground cover inside the level.') }
  const object = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : fail()
  const num = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : fail()
  const list = (v: unknown, max: number) => Array.isArray(v) && v.length <= max ? v : fail()
  const v = object(value)
  if (v.kind !== 'landscape' && v.kind !== 'interior') fail()
  if (v.lighting !== undefined && v.lighting !== 'uniform' && v.lighting !== 'regions') fail()
  if (v.baseLighting !== undefined && v.baseLighting !== 'day' && v.baseLighting !== 'night') fail()
  const background = v.kind === 'landscape' ? { kind: 'landscape' as const, horizon: num(v.horizon, 0, height) }
    : { kind: 'interior' as const, ...(v.horizon === undefined ? {} : { horizon: num(v.horizon, 0, height) }) }
  return { ...background,
    ...(v.lighting === undefined ? {} : { lighting: v.lighting as 'uniform' | 'regions' }),
    ...(v.baseLighting === undefined ? {} : { baseLighting: v.baseLighting as 'day' | 'night' }),
    walls: list(v.walls, 40).map(value => {
    const wall = object(value), w = num(wall.w, 10, width), h = num(wall.h, 10, height)
    if (wall.kind !== 'facility' && wall.kind !== 'cave') fail()
    if (wall.lighting !== undefined && wall.lighting !== 'day' && wall.lighting !== 'night') fail()
    const result: BackWall = { x: num(wall.x, 0, width - w), y: num(wall.y, 0, height - h), w, h, kind: wall.kind as BackWall['kind'],
      ...parseObjectName(wall.name, fail), ...(wall.lighting === undefined ? {} : { lighting: wall.lighting as 'day' | 'night' }) }
    if (wall.polygon !== undefined) {
      const polygon: Vec[] = list(wall.polygon, 64).map(value => {
        if (!Array.isArray(value) || value.length !== 2) return fail()
        return [num(value[0], 0, w), num(value[1], 0, h)]
      })
      if (polygon.length < 3 || !validPolygon(polygon)) fail()
      result.polygon = polygon
    }
    return result
  }), ...(v.groundCover === undefined ? {} : { groundCover: list(v.groundCover, 80).map(value => {
    const cover = object(value), w = num(cover.w, 10, 600)
    return { x: num(cover.x, 0, width - w), y: num(cover.y, 8, height), w }
  }) }) }
}

export function backWallPath(ctx: CanvasRenderingContext2D, wall: BackWall) {
  if (!wall.polygon) { ctx.rect(wall.x, wall.y, wall.w, wall.h); return }
  const points = polygonArea(wall.polygon) < 0 ? [...wall.polygon].reverse() : wall.polygon
  points.forEach(([x, y], i) => i ? ctx.lineTo(wall.x + x, wall.y + y) : ctx.moveTo(wall.x + x, wall.y + y))
  ctx.closePath()
}

/** Successive inverse clips give a union of walls, even when they overlap. */
export function clipOpenAir(ctx: CanvasRenderingContext2D, environment: LevelEnvironment, view: { x: number; y: number; w: number; h: number }) {
  for (const wall of environment.walls) {
    ctx.beginPath(); ctx.rect(view.x, view.y, view.w, view.h); backWallPath(ctx, wall); ctx.clip('evenodd')
  }
}

// A few quiet silhouettes: long, flat bases with low, uneven lobes, as distant
// stratus rather than cartoon cumulus. Retain the native paths across paints;
// clouds have no shading or animation to resolve.
const cloudContours = [
  'M -20 26 C -20 16 -6 10 10 12 C 22 -2 46 -8 68 -2 C 86 -16 120 -20 146 -10 '
    + 'C 168 -18 198 -16 214 -4 C 238 -10 266 -6 280 6 C 312 2 352 8 372 16 '
    + 'C 396 18 404 28 392 32 C 330 36 120 36 20 34 C -4 33 -20 31 -20 26 Z',
  'M -16 24 C -10 14 6 10 24 12 C 40 2 70 0 92 8 C 116 -4 152 -6 176 4 '
    + 'C 204 -2 240 0 262 10 C 300 6 352 10 380 18 C 410 20 428 26 420 30 '
    + 'C 352 34 140 33 22 32 C -6 31 -20 28 -16 24 Z',
  'M -14 26 C -12 14 4 8 20 10 C 30 -8 60 -14 84 -4 C 100 -12 128 -12 144 0 '
    + 'C 170 -6 204 -2 220 10 C 252 8 286 14 300 22 C 312 30 300 34 280 34 '
    + 'C 210 36 90 35 18 33 C -4 32 -16 30 -14 26 Z',
]
/** The longest contour's reach to the right of its origin, for culling. */
const CLOUD_LENGTH = 430
let cloudPaths: Path2D[] | undefined
const CLOUD_SPAN = 8000
const CLOUD_SCROLL = .9
const cloudLayout = [[800, -480, 1, 0], [2550, -510, 1.5, 1], [3900, -350, .9, 2],
  [5250, -610, 1.25, 0], [7000, -440, 1.4, 2]] as const

export function drawLandscape(ctx: CanvasRenderingContext2D, environment: LevelEnvironment, view: { x: number; y: number; w: number; h: number }) {
  if (environment.kind !== 'landscape') return
  ctx.save(); ctx.beginPath(); ctx.rect(view.x, view.y, view.w, view.h); ctx.clip(); clipOpenAir(ctx, environment, view)
  const horizon = environment.horizon
  ctx.fillStyle = '#bddbea'; ctx.fillRect(view.x, view.y, view.w, view.h)
  // Sparse flat silhouettes share one subtle horizontal parallax layer. Their
  // height follows the authored baseline; motion depends only on the camera.
  ctx.fillStyle = '#e8f1f3'
  cloudPaths ??= cloudContours.map(contour => new ArtPath(contour))
  // Cull in the cloud layer's frame, then translate into the existing world
  // transform. The sky and cave clips above stay in the terrain's frame.
  const cloudX = view.x * CLOUD_SCROLL, offsetX = view.x - cloudX
  const first = Math.floor((cloudX - CLOUD_LENGTH * 1.5 - 20) / CLOUD_SPAN), last = Math.floor((cloudX + view.w + 40) / CLOUD_SPAN)
  for (let span = first; span <= last; span++) for (const [offset, y, scale, shape] of cloudLayout) {
    const x = span * CLOUD_SPAN + offset, top = horizon + y
    if (x + CLOUD_LENGTH * scale < cloudX || x - 40 * scale > cloudX + view.w
      || top + 60 * scale < view.y || top - 55 * scale > view.y + view.h) continue
    ctx.save(); ctx.translate(x + offsetX, top); ctx.scale(scale, scale)
    ctx.fill(cloudPaths[shape]); ctx.restore()
  }
  ctx.restore()
}
