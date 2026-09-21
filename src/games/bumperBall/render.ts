import { CENTER, FIELD } from './physics'
import type { Ball, Bumper, Goal, Vehicle } from './physics'
import { BOOST_COOLDOWN, BOOST_DURATION } from './boost'
import type { BoostState } from './boost'
import { bodyPlane } from './appearance'
import type { VehicleAppearance } from './appearance'

export type Vector3 = { x: number; y: number; z: number }

export const INK = '#070c0b'
export const COLORS = { red: '#f18e7d', blue: '#87bfff', brass: '#d8b674', cream: '#e9e7d4' } as const
const TAU = Math.PI * 2
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'

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

export function drawCourt(ctx: CanvasRenderingContext2D) {
  const { left, right, top, bottom } = FIELD
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(left + 30, top)
  ctx.lineTo(right - 30, top)
  ctx.arcTo(right, top, right, top + 30, 30)
  ctx.lineTo(right, bottom - 30)
  ctx.arcTo(right, bottom, right - 30, bottom, 30)
  ctx.lineTo(left + 30, bottom)
  ctx.arcTo(left, bottom, left, bottom - 30, 30)
  ctx.lineTo(left, top + 30)
  ctx.arcTo(left, top, left + 30, top, 30)
  ctx.closePath()

  // Layered strokes give the rail depth without a shaded, solid surface.
  ctx.shadowColor = '#86e5ad20'
  ctx.shadowBlur = 7
  ctx.strokeStyle = '#46645660'
  ctx.lineWidth = 7
  ctx.stroke()
  ctx.shadowBlur = 0
  ctx.fillStyle = '#0a1210'
  ctx.fill()
  ctx.strokeStyle = '#adcbb19a'
  ctx.lineWidth = 1.4
  ctx.stroke()
  ctx.clip()

  // Quiet registration dots and court lines give the camera motion a reference.
  ctx.fillStyle = '#b9cabc26'
  for (let x = 40; x < right; x += 80) {
    for (let y = 20; y < bottom; y += 80) ctx.fillRect(x, y, 1.5, 1.5)
  }
  ctx.strokeStyle = '#8ba39370'
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.roundRect(24, 24, right - 48, bottom - 48, 18)
  ctx.stroke()
  ctx.setLineDash([6, 14])
  line(ctx, CENTER.x, 24, CENTER.x, bottom - 24)
  ctx.setLineDash([])
  circle(ctx, CENTER.x, CENTER.y, 118)
  ctx.stroke()
  circle(ctx, CENTER.x, CENTER.y, 124)
  ctx.strokeStyle = '#8ba39332'
  ctx.stroke()
  ctx.strokeStyle = '#a7bead88'
  for (const sign of [-1, 1]) {
    line(ctx, CENTER.x + sign * 124, CENTER.y, CENTER.x + sign * 136, CENTER.y)
    line(ctx, CENTER.x, CENTER.y + sign * 124, CENTER.x, CENTER.y + sign * 136)
  }
  circle(ctx, CENTER.x, CENTER.y, 4)
  ctx.stroke()

  // Inlaid rail lights and small fasteners, with clear team ends.
  for (let x = 80; x < right; x += 160) {
    for (const y of [5, bottom - 5]) {
      ctx.fillStyle = x < CENTER.x ? '#f18e7d65' : '#87bfff65'
      ctx.fillRect(x - 12, y - 1, 24, 2)
      ctx.fillStyle = '#a6ba9d40'
      ctx.fillRect(x + 54, y - 1, 2, 2)
    }
  }
  ctx.restore()
}

export function drawGoal(
  ctx: CanvasRenderingContext2D, goal: Goal, time: number, scoring: boolean,
  ripples: readonly { goalSide: 'left' | 'right'; radius: number }[],
) {
  const { x, y } = goal.pos
  const color = goal.side === 'left' ? COLORS.red : COLORS.blue
  ctx.save()
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(FIELD.left + 2, FIELD.top + 2, FIELD.right - 4, FIELD.bottom - 4, 28)
  ctx.clip()
  circle(ctx, x, y, goal.gravityRadius)
  ctx.strokeStyle = `${color}55`
  ctx.lineWidth = 1
  ctx.setLineDash([2, 14])
  ctx.stroke()
  ctx.setLineDash([])
  for (const ripple of ripples) {
    if (ripple.goalSide !== goal.side) continue
    ctx.globalAlpha = 0.05 + (1 - ripple.radius / goal.gravityRadius) * 0.16
    ctx.strokeStyle = color
    circle(ctx, x, y, ripple.radius)
    ctx.stroke()
  }
  ctx.restore()

  // Nested contours recede into the goal like a wireframe funnel.
  circle(ctx, x, y, goal.radius + 5)
  ctx.fillStyle = '#050a08'
  ctx.fill()
  ctx.strokeStyle = `${color}40`
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.strokeStyle = color
  ctx.lineWidth = 1.5
  circle(ctx, x, y, goal.radius)
  ctx.stroke()
  for (let i = 1; i <= 3; i++) {
    ctx.strokeStyle = `${color}${['55', '30', '18'][i - 1]}`
    ctx.lineWidth = 0.8
    circle(ctx, x, y + i * 2, goal.radius - i * 14)
    ctx.stroke()
  }

  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(time * (scoring ? 2 : 0.16) * (goal.side === 'left' ? 1 : -1))
  ctx.strokeStyle = `${color}45`
  ctx.lineWidth = 1
  for (let i = 0; i < 6; i++) {
    ctx.rotate(TAU / 6)
    ctx.beginPath()
    ctx.moveTo(9, 2)
    ctx.bezierCurveTo(24, -21, 40, -16, 52, 0)
    ctx.stroke()
  }
  ctx.restore()
  for (let i = 0; i < 8; i++) {
    const a = i * TAU / 8
    ctx.strokeStyle = scoring ? COLORS.cream : `${color}b0`
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(x, y, goal.radius + 2, a + 0.07, a + 0.32)
    ctx.stroke()
  }
  ctx.restore()
}

export function drawBumper(ctx: CanvasRenderingContext2D, bumper: Bumper) {
  const { x, y } = bumper.pos
  const hit = Math.max(0, bumper.hitTimer / 200)
  ctx.save()
  ctx.strokeStyle = COLORS.brass
  ctx.lineWidth = 1.5
  circle(ctx, x, y, bumper.radius)
  ctx.fillStyle = '#0d1510'
  ctx.fill()
  ctx.shadowColor = `${COLORS.brass}60`
  ctx.shadowBlur = hit * 10
  ctx.stroke()
  ctx.shadowBlur = 0
  // Compress around the shared center so the face stays inside the concentric rings.
  ctx.translate(x, y)
  ctx.scale(1 + hit * 0.08, 1 - hit * 0.12)
  ctx.strokeStyle = '#e9d8a658'
  ctx.lineWidth = 1
  circle(ctx, 0, 0, 14)
  ctx.stroke()
  ctx.fillStyle = `${COLORS.brass}b0`
  for (const eye of [-5, 5]) {
    ctx.beginPath()
    ctx.ellipse(eye, -4, 1.7, hit ? 1 : 2.5, 0, 0, TAU)
    ctx.fill()
  }
  ctx.strokeStyle = `${COLORS.brass}b0`
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(0, -1, 7, 0.2 * Math.PI, 0.8 * Math.PI)
  ctx.stroke()
  ctx.restore()

  if (hit > 0) {
    ctx.save()
    ctx.globalAlpha = hit * 0.7
    ctx.strokeStyle = COLORS.brass
    ctx.lineWidth = 1
    circle(ctx, x, y, bumper.radius + (1 - hit) * 24)
    ctx.stroke()
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

export function drawBall(ctx: CanvasRenderingContext2D, ball: Ball, axis: Vector3, spin: number) {
  const { x, y } = ball.pos
  const r = ball.radius
  if (r <= 0) return
  ctx.save()
  circle(ctx, x, y, r)
  ctx.fillStyle = INK
  ctx.fill()
  ctx.strokeStyle = COLORS.cream
  ctx.lineWidth = Math.max(0.6, r * 0.055)
  ctx.shadowColor = '#e9e7d438'
  ctx.shadowBlur = 6
  ctx.stroke()
  ctx.shadowBlur = 0
  ctx.clip()

  // Orthographic sphere seams stay inside the silhouette as the ball rolls.
  const k = normalize(axis)
  const cos = Math.cos(spin), sin = Math.sin(spin)
  ctx.strokeStyle = '#e9e7d490'
  ctx.lineWidth = Math.max(0.5, r * 0.035)
  for (const normal of [{ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, normalize({ x: 0.6, y: 0.3, z: 1 })]) {
    const dot = k.x * normal.x + k.y * normal.y + k.z * normal.z
    const c = cross(k, normal)
    const n = {
      x: normal.x * cos + c.x * sin + k.x * dot * (1 - cos),
      y: normal.y * cos + c.y * sin + k.y * dot * (1 - cos),
      z: normal.z * cos + c.z * sin + k.z * dot * (1 - cos),
    }
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
    ctx.stroke()
  }
  ctx.restore()
}

export function drawVehicle(ctx: CanvasRenderingContext2D, vehicle: Vehicle, time: number, appearance: VehicleAppearance, boosting = false) {
  const color = vehicle.side === 'left' ? COLORS.red : COLORS.blue
  ctx.save()
  ctx.translate(vehicle.pos.x, vehicle.pos.y)
  ctx.rotate(vehicle.angle)
  ctx.lineJoin = 'round'
  const body = bodyPlane(appearance, 5)
  const canopy = bodyPlane(appearance, 9)
  if (boosting) {
    // Hard Vacuum's warm, flickering jets, with irregular edges and pale cores.
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
      ctx.fillStyle = '#ffb45c18'
      ctx.fill()
      ctx.strokeStyle = '#ffb86b'
      ctx.lineWidth = 1.1
      ctx.shadowColor = '#ffad6540'
      ctx.shadowBlur = 4
      ctx.stroke()
      ctx.shadowBlur = 0
      ctx.strokeStyle = '#fff0cd'
      ctx.lineWidth = 1.1
      line(ctx, -14, y, -14 - length * 0.58, y + curl * 0.3)
    }
    ctx.restore()
  }
  ctx.strokeStyle = color
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
      ctx.fillStyle = '#030806'
      ctx.fill()
      ctx.stroke()
      ctx.save()
      ctx.clip()
      ctx.strokeStyle = '#a4b8a4b0'
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
  ctx.beginPath()
  ctx.roundRect(-14, -8, 29, 16, 6)
  ctx.fillStyle = INK
  ctx.fill()
  ctx.strokeStyle = `${color}60`
  ctx.lineWidth = 1
  ctx.stroke()
  for (const [x, y] of [[-10, -5], [-10, 5], [10, -5], [10, 5]]) {
    line(ctx, x * 1.2, y * 1.4, body[0] * x + body[2] * y + body[4], body[3] * y + body[5])
  }
  ctx.save()
  ctx.transform(...body)
  ctx.beginPath()
  ctx.roundRect(-11, -6, 23, 12, 5)
  ctx.fillStyle = INK
  ctx.fill()
  ctx.strokeStyle = color
  ctx.lineWidth = 1.25
  ctx.stroke()
  ctx.strokeStyle = `${color}70`
  line(ctx, 5, 0, 9, 0)

  // Two warm headlamps and a broad spring bumper read as a small friendly face.
  for (const y of [-4, 4]) {
    ctx.fillStyle = '#ffedbe'
    circle(ctx, 11, y, 1.4)
    ctx.fill()
  }
  ctx.strokeStyle = COLORS.cream
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(13, -7)
  ctx.quadraticCurveTo(18, 0, 13, 7)
  ctx.stroke()
  ctx.fillStyle = '#f18e7d'
  ctx.fillRect(-13, -4, 1.5, 2)
  ctx.fillRect(-13, 2, 1.5, 2)

  const speed = Math.min(1, Math.hypot(vehicle.vel.x, vehicle.vel.y) / 220)
  const wobble = Math.sin(time * 19) * speed * 2
  ctx.strokeStyle = '#98ada0'
  ctx.lineWidth = 0.8
  ctx.beginPath()
  ctx.moveTo(-8, -3)
  ctx.quadraticCurveTo(-12 - speed * 2, -9, -11 - speed * 4 + wobble, -14)
  ctx.stroke()
  circle(ctx, -11 - speed * 4 + wobble, -14, 1.7)
  ctx.fillStyle = color
  ctx.fill()
  ctx.restore()

  // Raised cockpit shifts a little farther than the body, keeping the tilt legible.
  ctx.save()
  ctx.transform(...canopy)
  ctx.beginPath()
  ctx.roundRect(-6, -4.5, 9, 9, 3)
  ctx.fillStyle = INK
  ctx.fill()
  ctx.strokeStyle = `${color}a0`
  ctx.lineWidth = 0.8
  ctx.stroke()
  ctx.strokeStyle = '#dbeee090'
  ctx.lineWidth = 1
  line(ctx, -3, -3.5, 0, -3.5)
  ctx.restore()
  ctx.restore()
}

export function drawScoreboard(ctx: CanvasRenderingContext2D, width: number, red: number, blue: number, timeLeft: number) {
  const center = width / 2
  const half = Math.min(174, (width - 24) / 2)
  const side = half * 0.69
  ctx.save()
  ctx.fillStyle = '#0a1512eb'
  ctx.strokeStyle = '#53695d75'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect(center - half, 16, half * 2, 66, 9)
  ctx.fill()
  ctx.stroke()
  ctx.strokeStyle = '#7b928530'
  for (const sign of [-1, 1]) line(ctx, center + sign * half * 0.35, 31, center + sign * half * 0.35, 65)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.font = `10px ${MONO}`
  ctx.fillStyle = COLORS.red
  ctx.fillText('CPU', center - side, 34)
  ctx.fillStyle = COLORS.blue
  ctx.fillText('YOU', center + side, 34)
  ctx.font = `26px ${MONO}`
  ctx.fillText(String(blue), center + side, 66)
  ctx.fillStyle = COLORS.red
  ctx.fillText(String(red), center - side, 66)
  const seconds = Math.ceil(timeLeft / 1000)
  ctx.font = `21px ${MONO}`
  ctx.fillStyle = seconds <= 30 ? COLORS.brass : COLORS.cream
  ctx.fillText(`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`, center, 52)
  ctx.fillStyle = '#80988a'
  ctx.font = `8px ${MONO}`
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
  ctx.fillStyle = active ? COLORS.brass : ready ? COLORS.blue : '#a5b8a8'
  ctx.font = `10px ${MONO}`
  ctx.textAlign = 'center'
  ctx.fillText(label, width / 2, y - 9)
  ctx.strokeStyle = '#87bfff30'
  ctx.lineWidth = 2
  line(ctx, x, y, x + barWidth, y)
  ctx.strokeStyle = active ? COLORS.brass : COLORS.blue
  line(ctx, x, y, x + barWidth * progress, y)
  ctx.restore()
}
