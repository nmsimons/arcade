import { TUNING } from './model.ts'
import type { Platform, Player } from './model.ts'
import { LEVEL_GRID_SIZE, levelHeight, levelTerrain } from './level.ts'
import type { JumpLevel } from './level.ts'
import { ropePath } from './climbables.ts'
import type { ClimbableWorld } from './climbables.ts'
import { polygonPoints } from './geometry.ts'
import { drawWallTexts } from './wallText.ts'
import { terrainFill, terrainMaterial } from './terrainMaterials.ts'

import { drawAthlete } from './athlete.ts'
export { drawAthlete } from './athlete.ts'

const ACCENT = '#df633f'
export const LEVEL_BOTTOM_PADDING = 32

export function drawClimbables(ctx: CanvasRenderingContext2D, p: Player, world: ClimbableWorld) {
  for (const ladder of world.ladders) {
    ctx.fillStyle = '#87958b'
    ctx.fillRect(ladder.x - 8, ladder.top, 2.5, ladder.bottom - ladder.top)
    ctx.fillRect(ladder.x + 5.5, ladder.top, 2.5, ladder.bottom - ladder.top)
    for (let y = ladder.top; y <= ladder.bottom; y += 14) ctx.fillRect(ladder.x - 8, y, 16, 2)
  }
  for (const [i, rope] of world.ropes.entries()) {
    ctx.strokeStyle = '#998263'; ctx.lineWidth = 2.8; ctx.lineJoin = 'round'; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(rope.x, rope.y)
    for (const [x, y] of ropePath(rope, p.ropes?.[i])) ctx.lineTo(x, y)
    ctx.stroke()
    ctx.fillStyle = '#697d72'; ctx.beginPath(); ctx.arc(rope.x, rope.y, 5, 0, Math.PI * 2); ctx.fill()
  }
}

export const TERRAIN_COLOR = terrainMaterial().color
export function drawLevelBackdrop(ctx: CanvasRenderingContext2D, level: JumpLevel, view: { x: number; y: number; w: number; h: number }, zoom = 1) {
  ctx.fillStyle = TERRAIN_COLOR; ctx.fillRect(view.x, view.y, view.w, view.h)
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, level.width, levelHeight(level)); ctx.clip()
  ctx.fillStyle = '#f1f1ed'; ctx.fillRect(0, 0, level.width, levelHeight(level))
  ctx.lineWidth = 1 / zoom; ctx.strokeStyle = '#353f4810'; ctx.beginPath()
  // Zoomed-out views omit minor lines, but every line remains on the same snap lattice.
  const grid = LEVEL_GRID_SIZE * 2 ** Math.max(0, Math.ceil(Math.log2(8 / (LEVEL_GRID_SIZE * zoom))))
  for (let x = Math.max(0, Math.floor(view.x / grid) * grid); x <= Math.min(level.width, view.x + view.w); x += grid) { ctx.moveTo(x, view.y); ctx.lineTo(x, view.y + view.h) }
  const bottom = levelHeight(level), firstY = bottom - Math.floor((bottom - Math.max(0, view.y)) / grid) * grid
  for (let y = firstY; y <= Math.min(bottom, view.y + view.h); y += grid) { ctx.moveTo(view.x, y); ctx.lineTo(view.x + view.w, y) }
  ctx.stroke(); ctx.restore()
  drawWallTexts(ctx, level.texts ?? [])
}
export function drawTerrain(ctx: CanvasRenderingContext2D, platforms: readonly Platform[]) {
  for (const b of platforms) {
    ctx.fillStyle = terrainFill(ctx, b.material)
    ctx.beginPath(); polygonPoints(b).forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.fill()
  }
}
export function drawMovementEffects(ctx: CanvasRenderingContext2D, p: Player) {
  if (!p.sliding) return
  const { angle, amount, time, x, y } = p.sliding
  const speed = p.vx * Math.cos(angle) + p.vy * Math.sin(angle), direction = Math.sign(speed) || p.facing
  const intensity = amount * Math.min(1, Math.abs(speed) / 180)
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.fillStyle = '#777b7e'
  for (let i = 0; i < 7; i++) {
    const age = (time * 3 + i / 7) % 1
    ctx.globalAlpha = intensity * (1 - age) * .5
    ctx.fillRect(-direction * (3 + age * 24), -2 - Math.sin(age * Math.PI) * (3 + i % 3), 1.5 + i % 2, 1.5)
  }
  ctx.restore()
}
export function drawPlayground(ctx: CanvasRenderingContext2D, width: number, height: number, p: Player, level: JumpLevel) {
  const zoom = Math.max(.45, Math.min(1.6, height / 760))
  const x = p.x - width / zoom / 2
  const y = Math.min(p.y - TUNING.height / 2 - height / zoom / 2, levelHeight(level) - (height - LEVEL_BOTTOM_PADDING) / zoom)
  ctx.save(); ctx.scale(zoom, zoom); ctx.translate(-x, -y)
  drawLevelBackdrop(ctx, level, { x, y, w: width / zoom, h: height / zoom }, zoom)
  drawTerrain(ctx, levelTerrain(level)); drawClimbables(ctx, p, level.climbables)
  for (const [index, point] of [level.spawn, ...level.checkpoints].entries()) {
    ctx.fillStyle = p.checkpoint >= index ? ACCENT : '#a0a3a4'; ctx.fillRect(point.x - 4, point.y - 2, 8, 2)
  }
  drawMovementEffects(ctx, p); drawAthlete(ctx, p); ctx.restore()
}
