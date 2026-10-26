import { pointInside, validPolygon } from './geometry.ts'
import type { Vec } from './geometry.ts'

export interface BackWall {
  x: number; y: number; w: number; h: number
  kind: 'facility' | 'cave'
  polygon?: Vec[]
}
/** Empty wall coverage is open air. Walls are artwork, never collision geometry. */
export interface LevelEnvironment {
  kind: 'landscape'
  horizon: number
  walls: BackWall[]
  groundCover?: { x: number; y: number; w: number }[]
}
export const openAirAt = (environment: LevelEnvironment, x: number, y: number) => !environment.walls.some(wall => pointInside(wall, x, y))

export function parseEnvironment(value: unknown, width: number, height: number): LevelEnvironment {
  const fail = (): never => { throw new Error('Invalid landscape: keep the horizon, back walls and ground cover inside the level.') }
  const object = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : fail()
  const num = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : fail()
  const list = (v: unknown, max: number) => Array.isArray(v) && v.length <= max ? v : fail()
  const v = object(value)
  if (v.kind !== 'landscape') fail()
  return { kind: 'landscape', horizon: num(v.horizon, 0, height), walls: list(v.walls, 40).map(value => {
    const wall = object(value), w = num(wall.w, 10, width), h = num(wall.h, 10, height)
    if (wall.kind !== 'facility' && wall.kind !== 'cave') fail()
    const result: BackWall = { x: num(wall.x, 0, width - w), y: num(wall.y, 0, height - h), w, h, kind: wall.kind as BackWall['kind'] }
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
  wall.polygon.forEach(([x, y], i) => i ? ctx.lineTo(wall.x + x, wall.y + y) : ctx.moveTo(wall.x + x, wall.y + y))
  ctx.closePath()
}

/** Successive inverse clips give a union of walls, even when they overlap. */
export function clipOpenAir(ctx: CanvasRenderingContext2D, environment: LevelEnvironment, view: { x: number; y: number; w: number; h: number }) {
  for (const wall of environment.walls) {
    ctx.beginPath(); ctx.rect(view.x, view.y, view.w, view.h); backWallPath(ctx, wall); ctx.clip('evenodd')
  }
}

export function drawLandscape(ctx: CanvasRenderingContext2D, environment: LevelEnvironment, view: { x: number; y: number; w: number; h: number }) {
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

export function drawGroundCover(ctx: CanvasRenderingContext2D, environment: LevelEnvironment, terrain: readonly import('./model.ts').Platform[] = []) {
  ctx.strokeStyle = '#879579'; ctx.lineWidth = 1.4; ctx.lineCap = 'round'
  for (const cover of environment.groundCover ?? []) {
    ctx.beginPath()
    for (let x = cover.x; x < cover.x + cover.w; x += 19) {
      if (terrain.some(p => pointInside(p, x, cover.y - 1))) continue
      const height = 3 + (Math.floor(x * 7) % 5)
      ctx.moveTo(x - 2, cover.y - height); ctx.lineTo(x, cover.y); ctx.lineTo(x + 3, cover.y - height - 1)
      if (Math.floor((x - cover.x) / 19) % 3 === 0) {
        ctx.moveTo(x - 7, cover.y - 7); ctx.quadraticCurveTo(x - 2, cover.y - 6, x, cover.y)
        ctx.moveTo(x, cover.y); ctx.quadraticCurveTo(x + 2, cover.y - 12, x + 5, cover.y - 15)
        ctx.moveTo(x, cover.y); ctx.quadraticCurveTo(x + 7, cover.y - 5, x + 11, cover.y - 6)
      }
    }
    ctx.stroke()
  }
  ctx.lineCap = 'butt'
}
