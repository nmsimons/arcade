import { TUNING } from './model.ts'
import type { Platform, Player } from './model.ts'
import { DEFAULT_LEVEL } from './level.ts'
import type { JumpLevel } from './level.ts'
import { CLIMBABLES } from './climbables.ts'
import type { ClimbableWorld } from './climbables.ts'
import { groundAt } from './terrain.ts'

import { drawAthlete } from './athlete.ts'
export { drawAthlete } from './athlete.ts'

const ACCENT = '#df633f'

export function drawClimbables(ctx: CanvasRenderingContext2D, p: Player, world: ClimbableWorld = CLIMBABLES) {
  for (const ladder of world.ladders) {
    ctx.fillStyle = '#87958b'
    ctx.fillRect(ladder.x - 8, ladder.top, 2.5, ladder.bottom - ladder.top)
    ctx.fillRect(ladder.x + 5.5, ladder.top, 2.5, ladder.bottom - ladder.top)
    for (let y = ladder.top; y <= ladder.bottom; y += 14) ctx.fillRect(ladder.x - 8, y, 16, 2)
  }
  for (const [i, rope] of world.ropes.entries()) {
    ctx.fillStyle = '#697d72'; ctx.fillRect(rope.x - 11, rope.y - 5, 22, 5)
    ctx.strokeStyle = '#998263'; ctx.lineWidth = 2.8; ctx.lineJoin = 'round'; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(rope.x, rope.y)
    if (p.ropes?.[i]) for (const n of p.ropes[i].nodes) ctx.lineTo(n.x, n.y)
    else ctx.lineTo(rope.x, rope.y + rope.length)
    ctx.stroke()
    ctx.fillStyle = '#697d72'; ctx.beginPath(); ctx.arc(rope.x, rope.y, 3.5, 0, Math.PI * 2); ctx.fill()
  }
}

export function drawTerrain(ctx: CanvasRenderingContext2D, platforms: readonly Platform[]) {
  for (const b of platforms) {
    if (b.profile) {
      ctx.beginPath(); ctx.moveTo(b.x, b.y + b.h)
      for (const [x, y] of b.profile) ctx.lineTo(b.x + x, b.y + y)
      ctx.lineTo(b.x + b.w, b.y + b.h); ctx.closePath()
      ctx.fillStyle = '#c7cfc4'; ctx.fill()
      ctx.save(); ctx.clip()
      for (const [offset, color, lineWidth] of [[5, '#d6dbd2', 10], [3, '#697d72', 2], [0, '#faf9f3', 3]] as const) {
        ctx.beginPath()
        b.profile.forEach(([x, y], i) => i ? ctx.lineTo(b.x + x, b.y + y + offset) : ctx.moveTo(b.x + x, b.y + y + offset))
        ctx.strokeStyle = color; ctx.lineWidth = lineWidth; ctx.lineJoin = 'round'; ctx.stroke()
      }
      ctx.restore()
      continue
    }
    ctx.fillStyle = '#d6dbd2'; ctx.fillRect(b.x, b.y, b.w, b.h)
    ctx.fillStyle = '#c7cfc4'; ctx.fillRect(b.x, b.y + 8, b.w, b.h - 8)
    ctx.fillStyle = '#faf9f3'; ctx.fillRect(b.x, b.y, b.w, 3)
    ctx.fillStyle = '#697d72'; ctx.fillRect(b.x, b.y + 3, b.w, 2)
    if (b.y < 620) {
      ctx.fillStyle = ACCENT; ctx.fillRect(b.x, b.y, 22, 4); ctx.fillRect(b.x + b.w - 22, b.y, 22, 4)
    }
  }
}

export function drawPlayground(ctx: CanvasRenderingContext2D, width: number, height: number, p: Player, level: JumpLevel = DEFAULT_LEVEL) {
  ctx.fillStyle = '#f1f0e9'; ctx.fillRect(0, 0, width, height)
  const zoom = Math.max(.45, Math.min(1.6, height / 760))
  // Keep the character's standing body center fixed while the world moves around it.
  ctx.save(); ctx.translate(width / 2 - p.x * zoom, height / 2 - (p.y - TUNING.height / 2) * zoom); ctx.scale(zoom, zoom)
  ctx.lineWidth = 1; ctx.strokeStyle = '#25363809'; ctx.beginPath()
  for (let x = 0; x <= level.width; x += 80) { ctx.moveTo(x, -500); ctx.lineTo(x, 1000) }
  for (let y = -500; y <= 1000; y += 80) { ctx.moveTo(0, y); ctx.lineTo(level.width, y) }
  ctx.stroke()
  // A soft recovery zone under the gap, without a lethal obstacle or score penalty.
  if (level.id === 'playground') { ctx.fillStyle = '#e5e3d9'; ctx.fillRect(1670, 850, 250, 200) }
  drawTerrain(ctx, level.platforms)
  drawClimbables(ctx, p, level.climbables)
  // Small ground marks give movement scale without putting text into the level.
  for (let x = 80; x < level.width; x += 40) {
    const surface = groundAt(level.platforms, x, 620, 150)
    if (surface) { ctx.fillStyle = '#8b9b8e'; ctx.fillRect(x, surface.y + 18, 1, x % 200 === 0 ? 15 : 5) }
  }
  for (const [index, { x, y }] of [level.spawn, ...level.checkpoints].entries()) {
    ctx.fillStyle = p.checkpoint >= index ? ACCENT : '#95a397'
    ctx.beginPath(); ctx.moveTo(x, y + 46); ctx.lineTo(x - 5, y + 54); ctx.lineTo(x + 5, y + 54); ctx.fill()
  }
  drawAthlete(ctx, p)
  ctx.restore()
}
