import { CENTER, FIELD } from './physics'
import type { Ball, Bumper, Goal, Vehicle } from './physics'
import { BOOST_COOLDOWN, BOOST_DURATION } from './boost'
import type { BoostState } from './boost'
import { bodyPlane } from './appearance'
import type { VehicleAppearance } from './appearance'

export type Vector3 = { x: number; y: number; z: number }

export const INK = '#243e43'
export const COLORS = { red: '#ef6250', blue: '#409eff', brass: '#f6c85b', cream: '#fff2d5' } as const
const TAU = Math.PI * 2
export const DISPLAY_FONT = '"Trebuchet MS", "Segoe UI", sans-serif'

function gradient(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, stops: readonly string[]) {
  const paint = ctx.createLinearGradient(x1, y1, x2, y2)
  stops.forEach((color, i) => paint.addColorStop(i / (stops.length - 1), color))
  return paint
}

function shadow(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(1, ry / rx)
  const shade = ctx.createRadialGradient(0, 0, 0, 0, 0, rx)
  shade.addColorStop(0, '#10282b65')
  shade.addColorStop(0.65, '#10282b30')
  shade.addColorStop(1, '#10282b00')
  ctx.fillStyle = shade
  circle(ctx, 0, 0, rx)
  ctx.fill()
  ctx.restore()
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, TAU)
}

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
}

export function drawCourt(ctx: CanvasRenderingContext2D, goals: readonly Goal[]) {
  const { left, right, top, bottom } = FIELD
  ctx.save()
  ctx.fillStyle = gradient(ctx, left, top, right, bottom, ['#60968b', '#507e78', '#3b6666'])
  ctx.beginPath()
  ctx.roundRect(left, top, right - left, bottom - top, 30)
  ctx.fill()
  const leftGoal = goals.find(goal => goal.side === 'left')
  const rightGoal = goals.find(goal => goal.side === 'right')
  ctx.beginPath()
  ctx.moveTo(left + 30, top)
  ctx.lineTo(right - 30, top)
  ctx.arcTo(right, top, right, top + 30, 30)
  if (rightGoal) {
    ctx.lineTo(right, rightGoal.pos.y - rightGoal.height / 2)
    ctx.moveTo(right, rightGoal.pos.y + rightGoal.height / 2)
  }
  ctx.lineTo(right, bottom - 30)
  ctx.arcTo(right, bottom, right - 30, bottom, 30)
  ctx.lineTo(left + 30, bottom)
  ctx.arcTo(left, bottom, left, bottom - 30, 30)
  if (leftGoal) {
    ctx.lineTo(left, leftGoal.pos.y + leftGoal.height / 2)
    ctx.moveTo(left, leftGoal.pos.y - leftGoal.height / 2)
  }
  ctx.lineTo(left, top + 30)
  ctx.arcTo(left, top, left + 30, top, 30)
  ctx.lineTo(left + 30, top)

  // A rounded, enamelled tray with a broad metal lip and a quiet satin court.
  ctx.strokeStyle = '#172c31'
  ctx.lineWidth = 24
  ctx.stroke()
  ctx.strokeStyle = gradient(ctx, 0, top, 0, bottom, ['#f9f1dc', '#a5b8b5', '#5e797d'])
  ctx.lineWidth = 18
  ctx.stroke()
  ctx.strokeStyle = '#294e50'
  ctx.lineWidth = 4
  ctx.stroke()
  ctx.beginPath()
  ctx.roundRect(left, top, right - left, bottom - top, 30)
  ctx.clip()

  ctx.fillStyle = '#e4eed708'
  for (let x = left; x < right; x += 320) ctx.fillRect(x, top, 160, bottom - top)
  ctx.strokeStyle = '#e8edce55'
  ctx.lineWidth = 3
  for (const goal of goals) {
    const inward = goal.side === 'left' ? 1 : -1
    ctx.beginPath()
    ctx.moveTo(goal.pos.x, goal.pos.y - goal.height / 2 - 55)
    ctx.lineTo(goal.pos.x + inward * 170, goal.pos.y - goal.height / 2 - 55)
    ctx.lineTo(goal.pos.x + inward * 170, goal.pos.y + goal.height / 2 + 55)
    ctx.lineTo(goal.pos.x, goal.pos.y + goal.height / 2 + 55)
    ctx.stroke()
  }
  ctx.setLineDash([12, 18])
  line(ctx, CENTER.x, 24, CENTER.x, bottom - 24)
  ctx.setLineDash([])
  circle(ctx, CENTER.x, CENTER.y, 118)
  ctx.fillStyle = '#e8edce08'
  ctx.fill()
  ctx.stroke()
  circle(ctx, CENTER.x, CENTER.y, 4)
  ctx.fillStyle = '#e8edce85'
  ctx.fill()

  // Solid team-colored rubber inserts on the inside edge of the rail.
  ctx.lineCap = 'round'
  ctx.lineWidth = 5
  for (let x = 80; x < right; x += 160) {
    for (const y of [6, bottom - 6]) {
      ctx.strokeStyle = x < CENTER.x ? COLORS.red : COLORS.blue
      line(ctx, x - 16, y, x + 16, y)
    }
  }
  ctx.restore()
}

export function drawGoal(ctx: CanvasRenderingContext2D, goal: Goal) {
  const { x, y } = goal.pos
  const sign = goal.side === 'left' ? -1 : 1
  const top = y - goal.height / 2, bottom = y + goal.height / 2
  const back = x + sign * goal.depth, left = Math.min(x, back)
  const color = goal.side === 'left' ? COLORS.red : COLORS.blue
  ctx.save()
  ctx.fillStyle = '#172f384d'
  ctx.beginPath()
  ctx.roundRect(left + 4, top + 6, goal.depth, goal.height, 6)
  ctx.fill()
  // A shallow pocket of woven netting continues past the open end wall.
  ctx.fillStyle = gradient(ctx, x, y, back, y, ['#527d76', '#2e5055'])
  ctx.beginPath()
  ctx.roundRect(left, top, goal.depth, goal.height, 6)
  ctx.fill()
  // The back and side supports are rounded painted metal; the mouth stays open.
  ctx.beginPath()
  ctx.moveTo(x, top)
  ctx.lineTo(back, top)
  ctx.lineTo(back, bottom)
  ctx.lineTo(x, bottom)
  ctx.lineJoin = 'round'
  ctx.strokeStyle = '#203e48'
  ctx.lineWidth = 10
  ctx.stroke()
  ctx.strokeStyle = color
  ctx.lineWidth = 6
  ctx.stroke()
  ctx.strokeStyle = '#fff2d5c0'
  ctx.lineWidth = 2
  line(ctx, x, top - 1, back, top - 1)
  // The painted line is the scoring plane, directly beneath the crossbar.
  ctx.strokeStyle = '#fff2d5a0'
  ctx.lineWidth = 3
  line(ctx, x, top, x, bottom)
  ctx.restore()
}

/** Netting, raised posts and crossbar sit above cars and the ball in the pocket. */
export function drawGoalFrame(ctx: CanvasRenderingContext2D, goal: Goal, time: number, scoring: boolean) {
  const { x, y } = goal.pos
  const sign = goal.side === 'left' ? -1 : 1
  const raisedX = x - sign * 8, top = y - goal.height / 2, bottom = y + goal.height / 2
  ctx.save()
  const back = x + sign * goal.depth
  ctx.save()
  ctx.beginPath()
  ctx.rect(Math.min(x, back), top, goal.depth, goal.height)
  ctx.clip()
  ctx.strokeStyle = scoring ? '#fff6dcbf' : '#e4eee090'
  ctx.lineWidth = 1.2
  const flex = scoring ? Math.sin(time * 24) * 4 : 0
  for (let offset = 0; offset <= goal.depth; offset += 15) {
    const netX = x + sign * offset
    ctx.beginPath()
    ctx.moveTo(netX, top)
    ctx.quadraticCurveTo(netX + sign * flex * offset / goal.depth, y, netX, bottom)
    ctx.stroke()
  }
  for (let netY = top + 10; netY < bottom; netY += 16) line(ctx, x, netY, back, netY)
  ctx.restore()
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x, top)
  ctx.lineTo(raisedX, top - 10)
  ctx.lineTo(raisedX, bottom - 10)
  ctx.lineTo(x, bottom)
  ctx.strokeStyle = '#253e4655'
  ctx.lineWidth = 17
  ctx.stroke()
  ctx.strokeStyle = gradient(ctx, raisedX - 7, 0, raisedX + 7, 0, ['#849d9f', '#fffdf0', '#c8d8d2'])
  ctx.lineWidth = goal.postRadius * 2
  ctx.stroke()
  ctx.strokeStyle = goal.side === 'left' ? COLORS.red : COLORS.blue
  ctx.lineWidth = 8
  for (const end of [top, bottom]) {
    line(ctx, raisedX, end - 10, raisedX, end - 10 + (end === top ? 18 : -18))
    circle(ctx, x, end, goal.postRadius)
    ctx.fillStyle = '#e9efdf'
    ctx.fill()
  }
  ctx.restore()
}
export function drawBumper(ctx: CanvasRenderingContext2D, bumper: Bumper) {
  const { x, y } = bumper.pos
  const hit = Math.max(0, bumper.hitTimer / 200)
  ctx.save()
  shadow(ctx, x + 3, y + 5, bumper.radius + 7, bumper.radius + 3)
  ctx.strokeStyle = '#596e75'
  ctx.lineWidth = 1.5
  circle(ctx, x, y, bumper.radius)
  ctx.fillStyle = gradient(ctx, x - 15, y - 20, x + 15, y + 20,
    ['#f5fbef', '#b6c9c9', '#657e89', '#e1ebe2', '#637b83'])
  ctx.fill()
  ctx.stroke()
  // Compress around the shared center so the face stays inside the concentric rings.
  ctx.translate(x, y)
  ctx.scale(1 + hit * 0.08, 1 - hit * 0.12)
  circle(ctx, 0, 0, 16)
  ctx.fillStyle = '#76542e'
  ctx.fill()
  const plastic = ctx.createRadialGradient(-6, -8, 1, 0, 0, 17)
  plastic.addColorStop(0, hit ? '#fffad9' : '#fff1a0')
  plastic.addColorStop(0.45, '#ffd65d')
  plastic.addColorStop(0.78, '#efb435')
  plastic.addColorStop(1, '#c88726')
  circle(ctx, 0, -1, 15)
  ctx.fillStyle = plastic
  ctx.fill()
  ctx.strokeStyle = '#fff9cfbf'
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.arc(0, -1, 12, Math.PI * 1.1, Math.PI * 1.6)
  ctx.stroke()
  ctx.fillStyle = '#684123'
  for (const eye of [-5, 5]) {
    ctx.beginPath()
    ctx.ellipse(eye, -4, 1.7, hit ? 1 : 2.5, 0, 0, TAU)
    ctx.fill()
  }
  ctx.strokeStyle = '#684123'
  ctx.lineWidth = 1.7
  ctx.beginPath()
  ctx.arc(0, -1, 7, 0.2 * Math.PI, 0.8 * Math.PI)
  ctx.stroke()
  ctx.restore()

  if (hit > 0) {
    ctx.save()
    ctx.globalAlpha = hit * 0.7
    ctx.strokeStyle = COLORS.brass
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    for (let i = 0; i < 6; i++) {
      const angle = i * TAU / 6
      const reach = bumper.radius + 5 + (1 - hit) * 15
      line(ctx, x + Math.cos(angle) * reach, y + Math.sin(angle) * reach,
        x + Math.cos(angle) * (reach + 5), y + Math.sin(angle) * (reach + 5))
    }
    ctx.restore()
  }
}

function cross(a: Vector3, b: Vector3): Vector3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }
}

function normalize(v: Vector3): Vector3 {
  const length = Math.hypot(v.x, v.y, v.z) || 1
  return { x: v.x / length, y: v.y / length, z: v.z / length }
}

// Fixed points on the hide rotate with the seams, without random noise per frame.
const LEATHER_GRAIN = Array.from({ length: 520 }, (_, i) => {
  const z = 1 - 2 * (i + 0.5) / 520
  const radius = Math.sqrt(1 - z * z)
  const angle = i * 2.399963229728653
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, z }
})

export function drawBall(ctx: CanvasRenderingContext2D, ball: Ball, axis: Vector3, spin: number) {
  const { x, y } = ball.pos
  const r = ball.radius
  if (r <= 0) return
  ctx.save()
  shadow(ctx, x + r * 0.14, y + r * 0.22, r * 1.17, r * 1.02)
  const leather = ctx.createRadialGradient(x - r * 0.36, y - r * 0.42, r * 0.04, x, y, r * 1.1)
  leather.addColorStop(0, '#f5d69b')
  leather.addColorStop(0.38, '#dbab6a')
  leather.addColorStop(0.72, '#b67a42')
  leather.addColorStop(0.94, '#85512f')
  leather.addColorStop(1, '#6b412c')
  circle(ctx, x, y, r)
  ctx.fillStyle = leather
  ctx.fill()
  ctx.strokeStyle = '#70492f'
  ctx.lineWidth = Math.max(0.5, r * 0.025)
  ctx.stroke()
  ctx.clip()

  const k = normalize(axis)
  const cos = Math.cos(spin), sin = Math.sin(spin)
  const rotate = (point: Vector3): Vector3 => {
    const dot = k.x * point.x + k.y * point.y + k.z * point.z
    const c = cross(k, point)
    return {
      x: point.x * cos + c.x * sin + k.x * dot * (1 - cos),
      y: point.y * cos + c.y * sin + k.y * dot * (1 - cos),
      z: point.z * cos + c.z * sin + k.z * dot * (1 - cos),
    }
  }
  ctx.fillStyle = '#633c242c'
  ctx.beginPath()
  for (const point of LEATHER_GRAIN) {
    const p = rotate(point)
    if (p.z <= 0.08) continue
    const size = r * 0.014 * Math.sqrt(p.z)
    ctx.moveTo(x + p.x * r + size, y + p.y * r)
    ctx.ellipse(x + p.x * r, y + p.y * r, size, size * 0.7, 0, 0, TAU)
  }
  ctx.fill()

  // Recessed panel seams and pale thread stay on the visible face of the sphere.
  for (const normal of [{ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, normalize({ x: 0.6, y: 0.3, z: 1 })]) {
    const n = rotate(normal)
    const a = normalize(cross(n, Math.abs(n.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 }))
    const b = cross(n, a)
    ctx.beginPath()
    let started = false
    for (let i = 0; i <= 64; i++) {
      const t = i * TAU / 64
      const px = a.x * Math.cos(t) + b.x * Math.sin(t)
      const py = a.y * Math.cos(t) + b.y * Math.sin(t)
      const pz = a.z * Math.cos(t) + b.z * Math.sin(t)
      if (pz < 0.02) { started = false; continue }
      if (started) ctx.lineTo(x + px * r, y + py * r)
      else ctx.moveTo(x + px * r, y + py * r)
      started = true
    }
    ctx.strokeStyle = '#714327b0'
    ctx.lineWidth = Math.max(0.5, r * 0.055)
    ctx.stroke()
    ctx.strokeStyle = '#ffe0abac'
    ctx.lineWidth = Math.max(0.3, r * 0.018)
    ctx.setLineDash([r * 0.035, r * 0.055])
    ctx.stroke()
    ctx.setLineDash([])
  }
  ctx.restore()
}

export function drawVehicle(ctx: CanvasRenderingContext2D, vehicle: Vehicle, time: number, appearance: VehicleAppearance, boosting = false) {
  const color = vehicle.side === 'left' ? COLORS.red : COLORS.blue
  const red = vehicle.side === 'left'
  ctx.save()
  ctx.translate(vehicle.pos.x, vehicle.pos.y)
  shadow(ctx, 3, 5, 23, 17)
  ctx.rotate(vehicle.angle)
  ctx.lineJoin = 'round'
  const body = bodyPlane(appearance, 5)
  const canopy = bodyPlane(appearance, 9)
  if (boosting) {
    // Rounded, filled flame tongues keep the boost bright and playful.
    ctx.save()
    ctx.transform(...body)
    ctx.lineCap = 'round'
    for (const side of [-1, 1]) {
      const y = side * 4
      const phase = side * 1.7
      const flicker = 1 + Math.sin(time * 43 + phase) * 0.12 + Math.sin(time * 67 + phase) * 0.07
      const length = 18 * flicker
      const curl = Math.sin(time * 31 + phase) * 1.1
      ctx.beginPath()
      ctx.moveTo(-14, y - 1.6)
      ctx.quadraticCurveTo(-20, y - 3, -14 - length * 0.55, y - 0.8)
      ctx.lineTo(-14 - length, y + curl)
      ctx.lineTo(-14 - length * 0.55, y + 1)
      ctx.quadraticCurveTo(-19, y + 2.5, -14, y + 1.6)
      ctx.closePath()
      ctx.fillStyle = gradient(ctx, -14 - length, y, -14, y, ['#f16f35', '#ffc754', '#fff3b5'])
      ctx.fill()
      ctx.strokeStyle = '#fff0cd'
      ctx.lineWidth = 2
      line(ctx, -14, y, -14 - length * 0.58, y + curl * 0.3)
    }
    ctx.restore()
  }
  ctx.strokeStyle = '#172b34'
  ctx.lineWidth = 1
  const tireLength = 10
  const tireWidth = 7
  const spin = Math.max(0, Math.min(1, (Math.hypot(vehicle.vel.x, vehicle.vel.y) - 60) / 300))
  for (const tx of [-7, 7]) {
    for (const ty of [-10, 10]) {
      ctx.save()
      ctx.translate(tx, ty)
      if (tx > 0) ctx.rotate(appearance.steer)
      const flex = Math.sin(vehicle.wheelAngle * 0.45 + tx * 0.1 + ty * 0.1)
      const bulge = spin * (0.7 + flex * 0.15)
      const length = tireLength / 2 + spin * 0.3
      const width = tireWidth / 2
      const corner = 1.3
      // Soft shoulders remain rounded at rest; rolling adds a little sidewall flex.
      ctx.beginPath()
      ctx.moveTo(-length + corner, -width)
      ctx.quadraticCurveTo(0, -width - bulge * 2, length - corner, -width)
      ctx.quadraticCurveTo(length, -width, length, -width + corner)
      ctx.quadraticCurveTo(length + spin * .3, 0, length, width - corner)
      ctx.quadraticCurveTo(length, width, length - corner, width)
      ctx.quadraticCurveTo(0, width + bulge * 2, -length + corner, width)
      ctx.quadraticCurveTo(-length, width, -length, width - corner)
      ctx.quadraticCurveTo(-length - spin * .3, 0, -length, -width + corner)
      ctx.quadraticCurveTo(-length, -width, -length + corner, -width)
      ctx.closePath()
      ctx.fillStyle = gradient(ctx, 0, -width, 0, width, ['#54616a', '#27333e', '#131f29'])
      ctx.fill()
      ctx.stroke()
      ctx.save()
      ctx.clip()
      ctx.strokeStyle = '#66737a90'
      ctx.lineWidth = 0.7
      for (let i = -2; i <= 2; i++) {
        const offset = i * 3 + (vehicle.wheelAngle * 3) % 3
        ctx.beginPath()
        ctx.moveTo(offset, -width - bulge)
        ctx.quadraticCurveTo(offset + spin * 0.4, 0, offset, width + bulge)
        ctx.stroke()
      }
      ctx.restore()
      ctx.restore()
    }
  }
  // The rubber skirt and tires stay planted. The upper body rides on suspension.
  ctx.strokeStyle = color
  ctx.beginPath()
  ctx.roundRect(-14, -8, 29, 16, 6)
  ctx.fillStyle = '#23333c'
  ctx.fill()
  ctx.strokeStyle = '#7d9298'
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.strokeStyle = '#a6b9ba'
  ctx.lineWidth = 1
  for (const [x, y] of [[-10, -5], [-10, 5], [10, -5], [10, 5]]) {
    line(ctx, x * 1.2, y * 1.4, body[0] * x + body[2] * y + body[4], body[3] * y + body[5])
  }
  ctx.save()
  ctx.transform(...body)
  ctx.beginPath()
  ctx.roundRect(-11, -6, 23, 12, 5)
  // A fixed overhead light sweeps across the lacquer as the car turns.
  const lightX = -Math.cos(vehicle.angle) * 0.6 - Math.sin(vehicle.angle) * 0.8
  const lightY = Math.sin(vehicle.angle) * 0.6 - Math.cos(vehicle.angle) * 0.8
  ctx.fillStyle = gradient(ctx, lightX * 12, lightY * 9, -lightX * 12, -lightY * 9,
    red ? ['#ffd0a4', '#ff7760', '#e6483e', '#98343b'] : ['#bcefff', '#53baff', '#2688e9', '#245296'])
  ctx.fill()
  ctx.strokeStyle = red ? '#8b3a3a' : '#255384'
  ctx.lineWidth = 0.8
  ctx.stroke()
  ctx.save()
  ctx.clip()
  ctx.fillStyle = '#fff0cddd'
  ctx.fillRect(-12, -1.25, 25, 2.5)
  ctx.restore()
  ctx.lineCap = 'round'
  ctx.strokeStyle = '#fff9e4a0'
  ctx.lineWidth = 1.1
  line(ctx, -6, -4.6, 5, -4.6)

  // Two warm headlamps and a broad spring bumper read as a small friendly face.
  for (const y of [-4, 4]) {
    ctx.fillStyle = '#384752'
    circle(ctx, 10, y, 2)
    ctx.fill()
    ctx.fillStyle = '#fff3c7'
    circle(ctx, 10.5, y - 0.3, 1.35)
    ctx.fill()
  }
  ctx.strokeStyle = '#203540'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(13, -7)
  ctx.quadraticCurveTo(18, 0, 13, 7)
  ctx.stroke()
  ctx.strokeStyle = gradient(ctx, 12, -7, 16, 7, ['#f4faef', '#d0dede', '#819ba4'])
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.fillStyle = '#ffbd98'
  ctx.fillRect(-13, -4, 1.5, 2)
  ctx.fillRect(-13, 2, 1.5, 2)

  const speed = Math.min(1, Math.hypot(vehicle.vel.x, vehicle.vel.y) / 220)
  const wobble = Math.sin(time * 19) * speed * 2
  ctx.strokeStyle = '#d1ded7'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(-8, -3)
  ctx.quadraticCurveTo(-12 - speed * 2, -9, -11 - speed * 4 + wobble, -14)
  ctx.stroke()
  circle(ctx, -11 - speed * 4 + wobble, -14, 1.7)
  ctx.fillStyle = COLORS.brass
  ctx.fill()
  ctx.restore()

  // Raised cockpit shifts a little farther than the body, keeping the tilt legible.
  ctx.save()
  ctx.transform(...canopy)
  ctx.beginPath()
  ctx.roundRect(-6, -4.5, 9, 9, 3)
  ctx.fillStyle = gradient(ctx, -4, -5, 2, 5, ['#b5e7ea', '#487986', '#233e57'])
  ctx.fill()
  ctx.strokeStyle = red ? '#923e3b' : '#235d9b'
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.save()
  ctx.clip()
  ctx.strokeStyle = '#eefcfa8f'
  ctx.lineWidth = 1.8
  line(ctx, -6, -1, 0, -5)
  ctx.restore()
  ctx.restore()
  ctx.restore()
}

export function drawScoreboard(ctx: CanvasRenderingContext2D, width: number, red: number, blue: number, timeLeft: number) {
  const center = width / 2
  const half = Math.min(174, (width - 24) / 2)
  const side = half * 0.69
  ctx.save()
  ctx.fillStyle = '#18353b45'
  ctx.beginPath()
  ctx.roundRect(center - half, 21, half * 2, 66, 17)
  ctx.fill()
  ctx.fillStyle = gradient(ctx, 0, 16, 0, 82, ['#fff8e8', '#e7dfc9'])
  ctx.strokeStyle = '#fff9e9'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect(center - half, 16, half * 2, 66, 17)
  ctx.fill()
  ctx.stroke()
  ctx.strokeStyle = '#75898640'
  for (const sign of [-1, 1]) line(ctx, center + sign * half * 0.35, 31, center + sign * half * 0.35, 65)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.font = `bold 10px ${DISPLAY_FONT}`
  ctx.fillStyle = '#b44136'
  ctx.fillText('CPU', center - side, 34)
  ctx.fillStyle = '#2469ab'
  ctx.fillText('YOU', center + side, 34)
  ctx.font = `bold 28px ${DISPLAY_FONT}`
  ctx.fillText(String(blue), center + side, 66)
  ctx.fillStyle = '#b44136'
  ctx.fillText(String(red), center - side, 66)
  const seconds = Math.ceil(timeLeft / 1000)
  ctx.font = `bold 23px ${DISPLAY_FONT}`
  ctx.fillStyle = seconds <= 30 ? '#b44136' : '#344e55'
  ctx.fillText(`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`, center, 52)
  ctx.fillStyle = '#60746f'
  ctx.font = `bold 8px ${DISPLAY_FONT}`
  ctx.fillText('REMAINING', center, 67)
  ctx.restore()
}

export function drawBoostMeter(ctx: CanvasRenderingContext2D, width: number, height: number, boost: BoostState, button: string) {
  const active = boost.activeRemaining > 0
  const ready = !active && boost.cooldownRemaining <= 0
  const progress = active ? boost.activeRemaining / BOOST_DURATION : 1 - boost.cooldownRemaining / BOOST_COOLDOWN
  const barWidth = Math.min(156, width - 32)
  const x = (width - barWidth) / 2
  const y = height - 22
  const label = active ? 'BOOSTING' : ready ? `BOOST READY · ${button}` : `BOOST · ${boost.cooldownRemaining.toFixed(1)}s`
  ctx.save()
  ctx.fillStyle = '#203b45ed'
  ctx.beginPath()
  ctx.roundRect(x - 17, y - 32, barWidth + 34, 46, 14)
  ctx.fill()
  ctx.fillStyle = active ? COLORS.brass : COLORS.cream
  ctx.font = `bold 10px ${DISPLAY_FONT}`
  ctx.textAlign = 'center'
  ctx.fillText(label, width / 2, y - 9)
  ctx.strokeStyle = '#101f2b'
  ctx.lineWidth = 6
  ctx.lineCap = 'round'
  line(ctx, x, y, x + barWidth, y)
  ctx.strokeStyle = gradient(ctx, 0, y - 3, 0, y + 3,
    active ? ['#ffefb6', '#edb246'] : ['#a1e0ff', '#429ded'])
  if (progress > 0) line(ctx, x, y, x + barWidth * progress, y)
  ctx.restore()
}
