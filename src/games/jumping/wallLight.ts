import type { NamedObject } from './objectNames.ts'
import type { SwitchSettings } from './switchPower.ts'
import { paintNormally } from './worldPaint.ts'
import type { WorldPaint } from './worldPaint.ts'

export interface WallLight extends NamedObject, SwitchSettings { id: string; x: number; y: number }
export const WALL_LIGHT_RADIUS = 14, MAX_WALL_LIGHTS = 40
export const wallLightBounds = (light: Pick<WallLight, 'x' | 'y'>) => ({ x: light.x - WALL_LIGHT_RADIUS, y: light.y - WALL_LIGHT_RADIUS, w: WALL_LIGHT_RADIUS * 2, h: WALL_LIGHT_RADIUS * 2 })

/** The goal's indicator face, with its post color forming a circular wall rim. */
export function drawWallLight(ctx: CanvasRenderingContext2D, light: Pick<WallLight, 'x' | 'y'>, active: boolean, paint: WorldPaint = paintNormally) {
  paint(ctx, 0, () => {
    ctx.fillStyle = '#738575'; ctx.beginPath(); ctx.arc(light.x, light.y, WALL_LIGHT_RADIUS, 0, Math.PI * 2); ctx.fill()
  })
  paint(ctx, active ? 1 : 0, () => {
    ctx.fillStyle = active ? '#a9d56b' : '#9aa38e'; ctx.beginPath(); ctx.arc(light.x, light.y, 11, 0, Math.PI * 2); ctx.fill()
  })
}
