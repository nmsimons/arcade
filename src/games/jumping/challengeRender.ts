import { drawLevelBackdrop, drawMovementEffects } from './render.ts'
import { drawAthlete, drawClimbables, drawTerrain } from './render.ts'
import type { Prop, RobotState, Run } from './challenge.ts'
import type { Checkpoint } from './model.ts'

const ink = '#40554f', orange = '#ce6245', brass = '#a68146'
const rounded = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, radius) }
export function drawProp(ctx: CanvasRenderingContext2D, b: Prop) {
  const r = b.size / 2, x = b.x - r, y = b.y - b.size
  if (b.grounded) {
    ctx.fillStyle = '#243d3020'; ctx.beginPath(); ctx.ellipse(b.x, b.y + 2, r * 1.06, 3.5, 0, 0, Math.PI * 2); ctx.fill()
  }
  if (b.kind === 'box') {
    // A restrained industrial crate: inset panels, capped corners, and a readable bevel.
    const shell = ctx.createLinearGradient(x, y, x + b.size, b.y)
    shell.addColorStop(0, '#d8c5a5'); shell.addColorStop(.45, '#c2ac86'); shell.addColorStop(1, '#a78e65')
    ctx.fillStyle = shell; rounded(ctx, x + .8, y + .8, b.size - 1.6, b.size - 1.6, 4); ctx.fill()
    ctx.strokeStyle = '#776d56'; ctx.lineWidth = 1.5; ctx.stroke()
    const inset = b.size * .15
    ctx.fillStyle = '#8d82612e'; rounded(ctx, x + inset, y + inset, b.size - inset * 2, b.size - inset * 2, 2); ctx.fill()
    ctx.strokeStyle = '#8b7b593d'; ctx.lineWidth = 1; ctx.stroke()
    for (const fraction of [.36, .64]) {
      const line = y + b.size * fraction
      ctx.fillStyle = '#786e5140'; ctx.fillRect(x + inset + 3, line, b.size - inset * 2 - 6, 1)
      ctx.fillStyle = '#f6ead54d'; ctx.fillRect(x + inset + 3, line + 1, b.size - inset * 2 - 6, 1)
    }
    ctx.strokeStyle = '#f6ebd6'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x + 5, b.y - 6); ctx.lineTo(x + 5, y + 5); ctx.lineTo(x + b.size - 6, y + 5); ctx.stroke()
    const cap = Math.max(8, b.size * .13)
    for (const side of [-1, 1]) for (const vertical of [-1, 1]) {
      const cx = side === -1 ? x + 3 : x + b.size - 3, cy = vertical === -1 ? y + 3 : b.y - 3
      ctx.strokeStyle = '#64746a'; ctx.lineWidth = 4; ctx.lineJoin = 'round'
      ctx.beginPath(); ctx.moveTo(cx, cy - vertical * cap); ctx.lineTo(cx, cy); ctx.lineTo(cx - side * cap, cy); ctx.stroke()
      ctx.fillStyle = '#dae0d3'; ctx.beginPath(); ctx.arc(cx, cy, 1, 0, Math.PI * 2); ctx.fill()
    }
    ctx.fillStyle = '#686b5626'; rounded(ctx, b.x - b.size * .14, y + b.size * .21, b.size * .28, 5, 2); ctx.fill()
  } else {
    const cy = b.y - r
    const surface = ctx.createRadialGradient(b.x - r * .4, cy - r * .5, r * .06, b.x + r * .12, cy + r * .14, r * 1.12)
    surface.addColorStop(0, '#d8dfd5'); surface.addColorStop(.48, '#a2b0a5'); surface.addColorStop(.8, '#7a8f82'); surface.addColorStop(1, '#526e61')
    ctx.fillStyle = surface; ctx.beginPath(); ctx.arc(b.x, cy, r - .5, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = '#496456'; ctx.lineWidth = 1.5; ctx.stroke()
    ctx.save(); ctx.translate(b.x, cy); ctx.rotate(b.angle); ctx.beginPath(); ctx.arc(0, 0, r - 1.5, 0, Math.PI * 2); ctx.clip()
    ctx.strokeStyle = '#324c4052'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, 0, r * .42, r + 1, -.2, 0, Math.PI * 2); ctx.stroke()
    ctx.strokeStyle = '#e6e7d759'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(-1, 0, r * .42, r + 1, -.2, 0, Math.PI * 2); ctx.stroke()
    ctx.fillStyle = '#c69a57'; ctx.beginPath(); ctx.arc(r * .62, -r * .14, r * .095, 0, Math.PI * 2); ctx.fill()
    ctx.restore()
    ctx.strokeStyle = '#edf2e68c'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(b.x, cy, r - 2.8, Math.PI * 1.08, Math.PI * 1.62); ctx.stroke()
    ctx.fillStyle = '#ffffff28'; ctx.beginPath(); ctx.ellipse(b.x - r * .27, cy - r * .4, r * .19, r * .11, -.6, 0, Math.PI * 2); ctx.fill()
  }
}
export function drawRobot(ctx: CanvasRenderingContext2D, r: RobotState, elapsed: number) {
  const brace = r.phase === 'windup', charge = r.phase === 'charge', hunting = r.phase === 'chase'
  ctx.save(); ctx.translate(r.x, r.y); ctx.scale(r.facing, 1)
  ctx.fillStyle = '#263d3323'; ctx.beginPath(); ctx.ellipse(0, 1.5, 32, 3, 0, 0, Math.PI * 2); ctx.fill()
  if (brace) { ctx.fillStyle = '#ce62451f'; ctx.beginPath(); ctx.moveTo(24, -2); ctx.lineTo(150, -25); ctx.lineTo(150, 0); ctx.closePath(); ctx.fill() }
  for (const x of [-17, 17]) {
    ctx.fillStyle = '#3f5149'; ctx.beginPath(); ctx.arc(x, -9, 9, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = '#839188'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, -9, 4, 0, Math.PI * 2); ctx.stroke()
    const angle = r.x / 9
    ctx.strokeStyle = '#a9b2a5'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, -9); ctx.lineTo(x + Math.cos(angle) * 4, -9 + Math.sin(angle) * 4); ctx.stroke()
  }
  const top = brace ? -39 : -46, shell = ctx.createLinearGradient(0, top, 0, -10)
  shell.addColorStop(0, '#dcc3a2'); shell.addColorStop(1, '#ae8d63')
  ctx.fillStyle = shell; rounded(ctx, -26, top, 51, -12 - top, 7); ctx.fill(); ctx.strokeStyle = '#786e58'; ctx.lineWidth = 1.4; ctx.stroke()
  ctx.fillStyle = '#394e45'; rounded(ctx, -2, top + 8, 21, 9, 3); ctx.fill()
  ctx.fillStyle = brace || charge ? '#ec815f' : hunting ? '#ead0a5' : '#bac6b4'; ctx.fillRect(12, top + 10, 3, 5)
  ctx.strokeStyle = '#f2e3c8'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-19, top + 4); ctx.lineTo(14, top + 4); ctx.stroke()
  for (let y = top + 13; y <= top + 23; y += 5) { ctx.fillStyle = '#776c5666'; ctx.fillRect(-19, y, 9, 1.5) }
  const reach = charge ? 42 : brace ? 29 : 33
  ctx.strokeStyle = '#7e8b7e'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(20, -23); ctx.lineTo(reach, -23); ctx.stroke()
  ctx.fillStyle = '#41584c'; rounded(ctx, reach, -38, 8, 31, 3); ctx.fill()
  ctx.fillStyle = '#95a294'; ctx.fillRect(reach + 1, -35, 2, 23)
  if (r.phase === 'recover') { ctx.strokeStyle = '#859384'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, -55, 10, elapsed * 9, elapsed * 9 + 2); ctx.stroke() }
  ctx.restore()
}
export function drawFlag(ctx: CanvasRenderingContext2D, flag: Checkpoint, complete = false, time = 0) {
  ctx.strokeStyle = ink; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(flag.x, flag.y); ctx.lineTo(flag.x, flag.y - 107); ctx.stroke()
  ctx.fillStyle = '#e4d4b4'; ctx.beginPath(); ctx.arc(flag.x, flag.y - 108, 3.3, 0, Math.PI * 2); ctx.fill()
  const wave = Math.sin(time * 3) * 3
  ctx.fillStyle = complete ? '#ba994e' : orange; ctx.beginPath(); ctx.moveTo(flag.x + 2, flag.y - 102)
  ctx.bezierCurveTo(flag.x + 25, flag.y - 113 + wave, flag.x + 38, flag.y - 85, flag.x + 60, flag.y - 96 + wave)
  ctx.lineTo(flag.x + 60, flag.y - 61 + wave)
  ctx.bezierCurveTo(flag.x + 39, flag.y - 51, flag.x + 24, flag.y - 80 + wave, flag.x + 2, flag.y - 67); ctx.closePath(); ctx.fill()
  ctx.fillStyle = '#40554f'; rounded(ctx, flag.x - 11, flag.y - 4, 22, 4, 2); ctx.fill()
}
/** Shared world renderer for play, thumbnails, and editor previews. No labels are painted into the level. */
export function drawPuzzleWorld(ctx: CanvasRenderingContext2D, run: Run) {
  const { level, player: p } = run
  for (const [index, plate] of level.triggers.entries()) {
    const target = run.mechanisms.find(m => m.definition.id === plate.target)?.definition
    if (target) {
      ctx.strokeStyle = run.triggers[index].active ? '#709374' : '#9aa697'; ctx.lineWidth = 2; ctx.lineJoin = 'round'
      ctx.beginPath(); ctx.moveTo(plate.x + plate.w / 2, plate.y + 14); ctx.lineTo(target.x + target.w / 2, plate.y + 14)
      ctx.lineTo(target.x + target.w / 2, target.y - target.travel - 18); ctx.stroke()
    }
  }
  for (const m of run.mechanisms) {
    const d = m.definition
    ctx.strokeStyle = '#a6afa0'; ctx.lineWidth = 3
    for (const x of [d.x + 7, d.x + d.w - 7]) { ctx.beginPath(); ctx.moveTo(x, d.y - d.travel - 16); ctx.lineTo(x, d.y + d.h); ctx.stroke() }
    ctx.fillStyle = '#97a493'; ctx.fillRect(d.x - 4, d.y - d.travel - 23, d.w + 8, 8)
  }
  drawTerrain(ctx, run.terrain)
  for (const m of run.mechanisms) {
    const d = m.definition, skin = ctx.createLinearGradient(0, m.y, 0, m.y + d.h)
    skin.addColorStop(0, '#d9cdb0'); skin.addColorStop(1, '#aa9771')
    ctx.fillStyle = skin; rounded(ctx, d.x, m.y, d.w, d.h, 2); ctx.fill()
    ctx.strokeStyle = brass; ctx.lineWidth = 1.4; ctx.stroke()
    ctx.fillStyle = '#f2e5c7'; ctx.fillRect(d.x + 2, m.y + 1, d.w - 4, 2)
    for (let x = d.x + 12; x < d.x + d.w - 8; x += 16) { ctx.fillStyle = '#8f7e5859'; ctx.fillRect(x, m.y + 8, 3, d.h - 13) }
    ctx.fillStyle = m.active ? '#5e8a67' : '#a78143'; ctx.beginPath(); ctx.arc(d.x + d.w / 2, d.y - d.travel - 19, 3, 0, Math.PI * 2); ctx.fill()
  }
  for (const [i, plate] of level.triggers.entries()) {
    ctx.fillStyle = '#7b806b'; rounded(ctx, plate.x - 3, plate.y - 3, plate.w + 6, 6, 2); ctx.fill()
    ctx.fillStyle = run.triggers[i].active ? '#81a186' : '#c4a870'; rounded(ctx, plate.x, plate.y - (run.triggers[i].held ? 4 : 8), plate.w, 5, 2); ctx.fill()
    ctx.strokeStyle = brass; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(plate.x + plate.w / 2, plate.y + 16, 5, 0, Math.PI * 2); ctx.stroke()
  }
  for (const b of run.props) drawProp(ctx, b)
  drawClimbables(ctx, p, level.climbables)
  for (const r of run.robots) drawRobot(ctx, r, run.elapsed)
  drawFlag(ctx, level.flag, run.finished, run.elapsed)
  drawMovementEffects(ctx, p); drawAthlete(ctx, p)
}
export function drawChallenge(ctx: CanvasRenderingContext2D, width: number, height: number, run: Run) {
  const { level, player: p } = run
  ctx.fillStyle = '#f0efe8'; ctx.fillRect(0, 0, width, height)
  const zoom = Math.max(.42, Math.min(1.3, height / 850, width / Math.min(1800, level.width + 80)))
  const half = width / zoom / 2
  const cameraX = level.width < half * 2 - 80 ? level.width / 2 : Math.max(half - 40, Math.min(level.width - half + 40, p.x))
  const cameraY = p.y - 31
  ctx.save(); ctx.translate(width / 2 - cameraX * zoom, height / 2 - cameraY * zoom); ctx.scale(zoom, zoom)
  const left = cameraX - half, top = cameraY - height / zoom / 2
  drawLevelBackdrop(ctx, level, { x: left, y: top, w: width / zoom, h: height / zoom }, zoom)
  drawPuzzleWorld(ctx, run)
  ctx.restore()
}
