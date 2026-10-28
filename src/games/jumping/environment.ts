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

// A few quiet silhouettes, with rounded ends and uneven lobes. Retain the
// native paths across paints; clouds have no shading or animation to resolve.
const cloudContours = [
  'M -24 28 C -24 13 -9 2 9 5 C 13 -13 29 -25 49 -23 C 60 -23 70 -18 77 -11 '
    + 'C 88 -40 113 -51 139 -45 C 166 -41 184 -22 188 -2 C 202 -15 223 -15 238 -4 '
    + 'C 249 4 254 15 254 24 C 275 21 295 29 297 40 C 300 52 277 57 249 56 '
    + 'C 188 55 89 59 26 54 C -3 52 -24 45 -24 28 Z',
  'M -22 28 C -10 10 11 8 34 13 C 44 -7 68 -16 91 -7 C 102 -27 126 -34 149 -22 '
    + 'C 163 -14 171 -4 175 7 C 204 -3 235 6 246 22 C 274 16 307 23 322 37 '
    + 'C 315 47 273 48 232 46 C 168 49 88 46 35 48 C 7 48 -29 42 -22 28 Z',
  'M -18 29 C -20 15 -7 4 9 5 C 11 -18 31 -34 55 -31 C 73 -29 84 -18 89 -4 '
    + 'C 99 -13 112 -16 124 -10 C 137 -30 161 -34 180 -22 C 194 -13 199 0 198 13 '
    + 'C 218 9 238 19 239 33 C 241 47 223 52 202 51 C 148 54 80 51 29 51 '
    + 'C 1 50 -17 44 -18 29 Z',
]
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
  cloudPaths ??= cloudContours.map(contour => new Path2D(contour))
  // Cull in the cloud layer's frame, then translate into the existing world
  // transform. The sky and cave clips above stay in the terrain's frame.
  const cloudX = view.x * CLOUD_SCROLL, offsetX = view.x - cloudX
  const first = Math.floor((cloudX - 500) / CLOUD_SPAN), last = Math.floor((cloudX + view.w + 40) / CLOUD_SPAN)
  for (let span = first; span <= last; span++) for (const [offset, y, scale, shape] of cloudLayout) {
    const x = span * CLOUD_SPAN + offset, top = horizon + y
    if (x + 325 * scale < cloudX || x - 40 * scale > cloudX + view.w
      || top + 60 * scale < view.y || top - 55 * scale > view.y + view.h) continue
    ctx.save(); ctx.translate(x + offsetX, top); ctx.scale(scale, scale)
    ctx.fill(cloudPaths[shape]); ctx.restore()
  }
  ctx.restore()
}
