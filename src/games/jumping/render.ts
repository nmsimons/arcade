import { PLATFORMS, TUNING, WORLD_WIDTH } from './model.ts'
import type { Player } from './model.ts'
import { CLIMBABLES } from './climbables.ts'
import type { ClimbableWorld } from './climbables.ts'

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

export function drawPlayground(ctx: CanvasRenderingContext2D, width: number, height: number, p: Player) {
  ctx.fillStyle = '#f1f0e9'; ctx.fillRect(0, 0, width, height)
  const zoom = Math.max(.45, Math.min(1.6, height / 760))
  // Keep the character's standing body center fixed while the world moves around it.
  ctx.save(); ctx.translate(width / 2 - p.x * zoom, height / 2 - (p.y - TUNING.height / 2) * zoom); ctx.scale(zoom, zoom)
  ctx.lineWidth = 1; ctx.strokeStyle = '#25363809'; ctx.beginPath()
  for (let x = 0; x <= WORLD_WIDTH; x += 80) { ctx.moveTo(x, -500); ctx.lineTo(x, 1000) }
  for (let y = -500; y <= 1000; y += 80) { ctx.moveTo(0, y); ctx.lineTo(WORLD_WIDTH, y) }
  ctx.stroke()
  const labels = [
    [140, 440, '01', 'FIND YOUR STRIDE', 'A little pressure. A little more pace.'],
    [630, 365, '02', 'TAKE THE STEPS', 'Tap to hop. Hold to go higher.'],
    [1110, 265, '03', 'REACH & RECOVER', 'Catch the edge. Pull yourself up.'],
    [1450, 140, '↑ ↓', 'CLIMB & SWING', 'Jump to catch a rope. Move to build momentum.'],
    [1640, 365, '04', 'MAKE THE GAP', 'Carry your speed into the jump.'],
    [2160, 335, '05', 'ONE MORE TIME', 'Room to experiment. Nothing to lose.'],
  ] as const
  for (const [x, y, number, title, detail] of labels) {
    ctx.fillStyle = '#a5afa9'; ctx.font = '14px monospace'; ctx.fillText(number, x, y)
    ctx.fillStyle = '#596b66'; ctx.font = '600 12px "Segoe UI", sans-serif'; ctx.fillText(title, x, y + 24)
    ctx.fillStyle = '#7d8981'; ctx.font = '12px "Segoe UI", sans-serif'; ctx.fillText(detail, x, y + 46)
  }
  // A soft recovery zone under the gap, without a lethal obstacle or score penalty.
  ctx.fillStyle = '#e5e3d9'; ctx.fillRect(1670, 850, 250, 200)
  ctx.fillStyle = '#8b938b'; ctx.font = '11px monospace'; ctx.fillText('FALL. RESET. REPEAT.', 1702, 885)
  for (const b of PLATFORMS) {
    ctx.fillStyle = '#d6dbd2'; ctx.fillRect(b.x, b.y, b.w, b.h)
    ctx.fillStyle = '#c7cfc4'; ctx.fillRect(b.x, b.y + 8, b.w, b.h - 8)
    ctx.fillStyle = '#faf9f3'; ctx.fillRect(b.x, b.y, b.w, 3)
    ctx.fillStyle = '#697d72'; ctx.fillRect(b.x, b.y + 3, b.w, 2)
    if (b.y < 620) {
      ctx.fillStyle = ACCENT; ctx.fillRect(b.x, b.y, 22, 4); ctx.fillRect(b.x + b.w - 22, b.y, 22, 4)
      ctx.fillStyle = '#77897c'; ctx.font = '11px monospace'; ctx.fillText(`${620 - b.y}`, b.x + 14, b.h < 40 ? b.y - 10 : b.y + 30)
    }
  }
  drawClimbables(ctx, p)
  // Runway marks make acceleration easy to read against the otherwise quiet space.
  for (let x = 80; x < 2600; x += 40) if (x < 1670 || x > 1920) {
    ctx.fillStyle = '#8b9b8e'; ctx.fillRect(x, 638, 1, x % 200 === 0 ? 15 : 5)
  }
  for (const [x, index] of [[200, 0], [1500, 1], [2050, 2]]) {
    ctx.fillStyle = p.checkpoint >= index ? ACCENT : '#95a397'
    ctx.beginPath(); ctx.moveTo(x, 666); ctx.lineTo(x - 5, 674); ctx.lineTo(x + 5, 674); ctx.fill()
    ctx.font = '10px monospace'; ctx.textAlign = 'center'; ctx.fillText(index ? 'RESET POINT' : 'START', x, 693); ctx.textAlign = 'left'
  }
  drawAthlete(ctx, p)
  if (p.hang) {
    ctx.fillStyle = ACCENT; ctx.font = '600 11px "Segoe UI", sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('UP TO CLIMB', p.x, p.y + 28); ctx.textAlign = 'left'
  }
  ctx.restore()
}
