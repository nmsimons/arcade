import { FIELD, viewportScale } from './types.ts'
import type { Bullet, Debris, Helicopter, Jeep, RepairKit, Tank, Wall } from './types'

export const INK = '#080d10'
const PLAYER = '#a6d7ce', ENEMY = '#d3917d', GOLD = '#d4b783'
const line = (ctx: CanvasRenderingContext2D, x: number, y: number, x2: number, y2: number) => {
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke()
}
function polygon(ctx: CanvasRenderingContext2D, points: number[][]) {
  ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.fill(); ctx.stroke()
}
function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke()
}

/** Static city detail is cached, leaving the frame budget for combat and AI. */
export function drawCity(ctx: CanvasRenderingContext2D, walls: Wall[]) {
  ctx.fillStyle = '#0d1519'; ctx.fillRect(0, 0, FIELD.width, FIELD.height)
  ctx.lineWidth = 1; ctx.strokeStyle = '#78918b16'
  for (let x = 40; x < FIELD.width; x += 80) for (let y = 40; y < FIELD.height; y += 80) {
    line(ctx, x - 2, y, x + 2, y); line(ctx, x, y - 2, x, y + 2)
  }
  ctx.strokeStyle = '#7c8b7935'; ctx.setLineDash([12, 20])
  for (const x of [FIELD.width * .18, FIELD.width * .38, FIELD.width * .62, FIELD.width * .82]) line(ctx, x, 15, x, FIELD.height - 15)
  for (const y of [FIELD.height * .18, FIELD.height * .5, FIELD.height * .82]) line(ctx, 15, y, FIELD.width - 15, y)
  ctx.setLineDash([])
  walls.forEach((wall, i) => {
    const { x, y, width: w, height: h } = wall
    ctx.fillStyle = '#111c21'; ctx.fillRect(x, y, w, h)
    ctx.strokeStyle = '#52696b'; ctx.lineWidth = 1.2; ctx.strokeRect(x, y, w, h)
    ctx.strokeStyle = '#81928b45'; ctx.lineWidth = 1; ctx.strokeRect(x + 5, y + 5, w - 10, h - 10)
    ctx.save(); ctx.beginPath(); ctx.rect(x + 8, y + 8, w - 16, h - 16); ctx.clip()
    ctx.strokeStyle = '#6c858047'
    // Roof seams, ventilation housings and reinforced service hatches.
    for (let seam = 18; seam < w; seam += 24) line(ctx, x + seam, y + 8, x + seam, y + h - 8)
    ctx.fillStyle = '#111c21'; ctx.fillRect(x + w * .3, y + h * .3, 19, 14)
    ctx.strokeStyle = '#83978b85'; ctx.strokeRect(x + w * .3, y + h * .3, 19, 14)
    for (let j = 3; j < 17; j += 4) line(ctx, x + w * .3 + j, y + h * .3 + 3, x + w * .3 + j, y + h * .3 + 11)
    if (w > 65 && h > 55) { ctx.strokeRect(x + w - 31, y + h - 28, 17, 14); line(ctx, x + w - 31, y + h - 28, x + w - 14, y + h - 14) }
    ctx.fillStyle = '#a2b3a36b'; ctx.font = '8px monospace'; ctx.fillText(`B${String(i + 1).padStart(2, '0')}`, x + 11, y + 18)
    ctx.restore()
    ctx.strokeStyle = '#a8ab8660'
    for (let j = 0; j < 3; j++) line(ctx, x + w / 2 - 8 + j * 6, y + h, x + w / 2 - 11 + j * 6, y + h + 5)
  })
  ctx.strokeStyle = '#778878'; ctx.lineWidth = 2; ctx.strokeRect(1, 1, FIELD.width - 2, FIELD.height - 2)
  ctx.strokeStyle = '#b5b59280'; ctx.lineWidth = 1
  for (let x = 20; x < FIELD.width; x += 40) { line(ctx, x, 2, x + 8, 10); line(ctx, x, FIELD.height - 2, x + 8, FIELD.height - 10) }
  ctx.font = '10px monospace'; ctx.fillStyle = '#9aaa9b80'; ctx.fillText('NORTH PERIMETER // 01', 620, 24)
  ctx.fillText('SOUTH PERIMETER // 03', 620, FIELD.height - 18)
}

function tires(ctx: CanvasRenderingContext2D, offset: number, length: number, y: number, width: number) {
  ctx.fillStyle = INK; ctx.fillRect(-length / 2, y - width / 2, length, width)
  ctx.strokeRect(-length / 2, y - width / 2, length, width)
  ctx.save(); ctx.beginPath(); ctx.rect(-length / 2, y - width / 2, length, width); ctx.clip()
  ctx.globalAlpha = .65
  for (let x = -length; x < length; x += 4) line(ctx, x + offset % 4, y - width / 2, x + offset % 4, y + width / 2)
  ctx.restore()
}
function blast(ctx: CanvasRenderingContext2D, pos: { x: number; y: number }, remaining: number) {
  const age = 1 - Math.min(1, remaining / 1000)
  ctx.save(); ctx.globalAlpha = (1 - age) * .65; ctx.strokeStyle = GOLD; ctx.lineWidth = 1
  circle(ctx, pos.x, pos.y, 10 + age * 38); ctx.restore()
}
function flash(ctx: CanvasRenderingContext2D, x: number, strength: number) {
  if (strength <= .55) return
  ctx.save(); ctx.globalAlpha = strength; ctx.strokeStyle = '#f6dfaa'; ctx.lineWidth = 1
  polygon(ctx, [[x, -2], [x + 10, -4], [x + 6, 0], [x + 10, 4], [x, 2]])
  ctx.restore()
}
export function drawJeep(ctx: CanvasRenderingContext2D, jeep: Jeep) {
  if (jeep.state !== 'active') { blast(ctx, jeep.pos, jeep.explodeTime); return }
  ctx.save(); ctx.translate(jeep.pos.x, jeep.pos.y); ctx.rotate(jeep.angle)
  ctx.strokeStyle = jeep.hitFlash > 0 ? '#fff1d8' : jeep.health === 1 ? ENEMY : PLAYER; ctx.lineWidth = 1.2
  for (const x of [-7, 7]) { ctx.save(); ctx.translate(x, 0); for (const y of [-9, 9]) tires(ctx, jeep.wheelAngle * 3, 9, y, 5.5); ctx.restore() }
  ctx.fillStyle = INK
  polygon(ctx, [[-13, -5], [-10, -7], [11, -7], [13, -4], [13, 4], [11, 7], [-10, 7], [-13, 5]])
  line(ctx, 5, -6, 5, 6); line(ctx, 2, -5, 2, 5); line(ctx, 5, 0, 11, 0)
  ctx.strokeRect(-9, -4, 6, 8); circle(ctx, -1, 0, 2.8); line(ctx, 0, 0, 17, 0)
  ctx.lineWidth = 1; ctx.strokeStyle = '#ced6c090'; line(ctx, 13, -5, 13, -3); line(ctx, 13, 3, 13, 5)
  line(ctx, -8, -5, -15, -14); circle(ctx, -15, -14, .8)
  ctx.restore()
}
export function drawTank(ctx: CanvasRenderingContext2D, tank: Tank) {
  if (tank.state !== 'active') { blast(ctx, tank.pos, tank.explodeTime); return }
  ctx.save(); ctx.translate(tank.pos.x, tank.pos.y); ctx.rotate(tank.angle)
  ctx.strokeStyle = tank.health > 1 ? ENEMY : GOLD; ctx.lineWidth = 1.1
  for (const y of [-13, 13]) tires(ctx, tank.trackOffset, 40, y, 7)
  ctx.fillStyle = INK
  polygon(ctx, [[-18, -8], [10, -8], [16, -4], [16, 4], [10, 8], [-18, 8]])
  for (let i = -14; i < -5; i += 3) line(ctx, i, -6, i, 6)
  line(ctx, 10, -6, 13, 0); line(ctx, 13, 0, 10, 6)
  ctx.rotate(tank.turretAngle - tank.angle)
  polygon(ctx, [[-11, -7], [5, -7], [10, -3], [10, 3], [5, 7], [-11, 7], [-15, 3], [-15, -3]])
  ctx.strokeRect(-8, -4, 8, 8); circle(ctx, -5, 0, 2.4)
  ctx.lineWidth = 2; line(ctx, 7, 0, 26 - tank.recoil * 4, 0)
  ctx.lineWidth = 1; ctx.strokeRect(24 - tank.recoil * 4, -2.5, 4, 5)
  flash(ctx, 29, tank.recoil)
  if (tank.losTimeMs > 0 && tank.shootCooldown < 800) { ctx.strokeStyle = '#f2b28a'; line(ctx, -10, -10, -10 + Math.min(1, tank.losTimeMs / 450) * 12, -10) }
  ctx.restore()
}
export function drawHelicopter(ctx: CanvasRenderingContext2D, heli: Helicopter) {
  if (heli.state !== 'active') { blast(ctx, heli.pos, heli.explodeTime); return }
  ctx.save(); ctx.translate(heli.pos.x, heli.pos.y); ctx.rotate(heli.angle)
  ctx.fillStyle = INK; ctx.strokeStyle = GOLD; ctx.lineWidth = 1.1
  polygon(ctx, [[-8, -3], [-26, -2], [-28, -6], [-30, -6], [-28, 3], [-8, 3]])
  polygon(ctx, [[-11, -5], [4, -7], [13, -3], [15, 0], [13, 3], [4, 7], [-11, 5]])
  line(ctx, 4, -6, 7, 0); line(ctx, 7, 0, 4, 6); line(ctx, 7, 0, 14, 0)
  for (const side of [-1, 1]) { line(ctx, -9, side * 10, 7, side * 10); line(ctx, -5, side * 5, -5, side * 10); line(ctx, 5, side * 6, 5, side * 10) }
  flash(ctx, 16, heli.recoil)
  ctx.save(); ctx.rotate(heli.rotorAngle); ctx.strokeStyle = '#e8d7b9'; ctx.lineWidth = 1
  for (const a of [0, Math.PI / 2]) { ctx.rotate(a); line(ctx, -25, 0, 25, 0) }
  ctx.restore(); ctx.globalAlpha = .13; circle(ctx, 0, 0, 25); ctx.restore()
}

type Scene = { jeep: Jeep; tanks: Tank[]; helicopters: Helicopter[]; bullets: Bullet[]; debris: Debris[]; kits: RepairKit[]; walls: Wall[] }
export function drawBattle(ctx: CanvasRenderingContext2D, city: HTMLCanvasElement, scene: Scene, width: number, height: number, score: number, wave: number) {
  const { jeep, tanks, helicopters, bullets, debris, kits, walls } = scene
  const scale = viewportScale(width, height)
  ctx.fillStyle = INK; ctx.fillRect(0, 0, width, height)
  ctx.save(); ctx.translate(width / 2, height / 2); ctx.scale(scale, scale); ctx.translate(-jeep.pos.x, -jeep.pos.y)
  ctx.drawImage(city, -12, -12)
  for (const kit of kits) {
    ctx.save(); ctx.translate(kit.pos.x, kit.pos.y); ctx.fillStyle = INK; ctx.fillRect(-10, -10, 20, 20)
    ctx.strokeStyle = PLAYER; ctx.lineWidth = 1; ctx.strokeRect(-10, -10, 20, 20)
    ctx.lineWidth = 3; line(ctx, -5, 0, 5, 0); line(ctx, 0, -5, 0, 5); ctx.restore()
  }
  tanks.forEach(t => drawTank(ctx, t)); drawJeep(ctx, jeep); helicopters.forEach(h => drawHelicopter(ctx, h))
  for (const bullet of bullets) {
    const a = Math.atan2(bullet.vel.y, bullet.vel.x)
    ctx.strokeStyle = bullet.isEnemy ? '#f3b38a' : '#d8f2df'; ctx.lineWidth = 1.8
    line(ctx, bullet.pos.x, bullet.pos.y, bullet.pos.x - Math.cos(a) * 9, bullet.pos.y - Math.sin(a) * 9)
  }
  for (const d of debris) {
    ctx.save(); ctx.translate(d.pos.x, d.pos.y); ctx.rotate(d.angle); ctx.globalAlpha = Math.min(1, d.life / 1000)
    ctx.strokeStyle = GOLD; ctx.lineWidth = 1; line(ctx, -d.length / 2, 0, d.length / 2, 0); ctx.restore()
  }
  ctx.restore()
  // HUD is drawn in screen coordinates and never drifts with the camera.
  ctx.save(); ctx.font = '11px monospace'; ctx.textBaseline = 'top'; ctx.fillStyle = '#b8c9c0'
  ctx.fillText('URBAN FIRE / OPERATIONS', 20, 18)
  ctx.fillStyle = '#81948f'; ctx.fillText(`WAVE ${String(wave).padStart(2, '0')}   ${String(score).padStart(6, '0')} PTS`, 20, 36)
  ctx.textAlign = 'right'; ctx.fillStyle = '#a8b9ac'; ctx.fillText('ARMOR', width - 20, 18)
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = i < jeep.health ? jeep.health === 1 ? ENEMY : PLAYER : '#25332f'
    ctx.fillRect(width - 80 + i * 22, 37, 17, 4)
  }
  ctx.textAlign = 'left'
  const mapWidth = Math.min(160, width * .28), mapHeight = mapWidth * FIELD.height / FIELD.width
  const mx = width - mapWidth - 20, my = height - mapHeight - 30, ratio = mapWidth / FIELD.width
  ctx.fillStyle = '#080d10ee'; ctx.fillRect(mx - 6, my - 16, mapWidth + 12, mapHeight + 23)
  ctx.strokeStyle = '#6d817c80'; ctx.lineWidth = 1; ctx.strokeRect(mx, my, mapWidth, mapHeight)
  ctx.fillStyle = '#81948f'; ctx.font = '9px monospace'; ctx.fillText('TACTICAL / N ↑', mx, my - 12)
  ctx.fillStyle = '#34474a'
  for (const wall of walls) ctx.fillRect(mx + wall.x * ratio, my + wall.y * ratio, wall.width * ratio, wall.height * ratio)
  ctx.save(); ctx.beginPath(); ctx.rect(mx, my, mapWidth, mapHeight); ctx.clip()
  ctx.strokeStyle = '#a6d7ce55'; ctx.strokeRect(mx + (jeep.pos.x - width / scale / 2) * ratio, my + (jeep.pos.y - height / scale / 2) * ratio, width / scale * ratio, height / scale * ratio)
  for (const e of [...tanks, ...helicopters]) if (e.state === 'active') { ctx.fillStyle = ENEMY; ctx.fillRect(mx + e.pos.x * ratio - 1.5, my + e.pos.y * ratio - 1.5, 3, 3) }
  for (const kit of kits) { ctx.strokeStyle = PLAYER; ctx.strokeRect(mx + kit.pos.x * ratio - 2, my + kit.pos.y * ratio - 2, 4, 4) }
  ctx.fillStyle = '#e1f4e4'; ctx.fillRect(mx + jeep.pos.x * ratio - 2, my + jeep.pos.y * ratio - 2, 4, 4)
  ctx.restore(); ctx.fillStyle = '#81948f'; ctx.font = '10px monospace'
  ctx.fillText(`${tanks.filter(t => t.state === 'active').length + helicopters.filter(h => h.state === 'active').length} HOSTILES`, 20, height - 40)
  ctx.fillText('P / MENU · PAUSE', 20, height - 24)
  ctx.restore()
}
