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

export function drawLandscape(ctx: CanvasRenderingContext2D, environment: LevelEnvironment, view: { x: number; y: number; w: number; h: number }) {
  if (environment.kind !== 'landscape') return
  ctx.save(); ctx.beginPath(); ctx.rect(view.x, view.y, view.w, view.h); ctx.clip(); clipOpenAir(ctx, environment, view)
  const horizon = environment.horizon
  ctx.fillStyle = '#bddbea'; ctx.fillRect(view.x, view.y, view.w, view.h)
  // Keep the same flat, simple treatment as the rest of the game. Clouds are
  // sparse world-anchored shapes, with no distant scenery or parallax layers.
  ctx.fillStyle = '#f6f8f6'
  for (const [x, y, scale] of [[800, -480, 1], [2550, -510, 1.5], [3900, -350, .9], [5250, -610, 1.25], [7000, -440, 1.4]]) {
    ctx.save(); ctx.translate(x, horizon + y); ctx.scale(scale, scale); ctx.beginPath()
    ctx.moveTo(0, 24); ctx.bezierCurveTo(48, 11, 98, 11, 130, 15)
    ctx.bezierCurveTo(157, -9, 208, -10, 241, 4); ctx.bezierCurveTo(261, 11, 273, 20, 275, 27)
    ctx.bezierCurveTo(332, 23, 383, 28, 425, 38); ctx.lineTo(-30, 36); ctx.closePath(); ctx.fill(); ctx.restore()
  }
  ctx.restore()
}
