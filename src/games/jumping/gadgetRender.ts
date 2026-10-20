import { drawSleeve } from './sleeveArtwork.ts'
import type { Prop, Run } from './challenge.ts'
import { propHeight } from './propGeometry.ts'
import { EMP_DISABLE_SECONDS, REPULSOR_BEAM_SECONDS, REPULSOR_IMPACT_SECONDS } from './gadgets.ts'
import { paintNormally } from './worldPaint.ts'
import type { Exposure, WorldPaint } from './worldPaint.ts'
import { robotTop } from './robotPhysics.ts'

/** Three short arcs, redrawn at 14 Hz: no particles, blur, or lighting pass. */
export function drawEmpCrackle(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, age: number) {
  const frame = Math.floor(age * 14)
  const noise = (seed: number) => { const n = Math.sin(seed * 127.1 + x * .13 + y * .17) * 43758.5453; return n - Math.floor(n) }
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  for (let arc = 0; arc < 3; arc++) {
    const seed = frame * 23 + arc * 71, edge = Math.floor(noise(seed) * 4), horizontal = edge % 2 === 0
    const span = Math.min(42, Math.max(12, (horizontal ? w : h) * .7))
    const along = noise(seed + 1), startX = x + (horizontal ? along * w : edge === 1 ? w : 0)
    const startY = y + (horizontal ? edge === 0 ? 0 : h : along * h)
    ctx.strokeStyle = arc === frame % 3 ? '#e9ffff' : '#69aebd'; ctx.lineWidth = arc === frame % 3 ? 1.8 : 1.3
    ctx.beginPath()
    for (let point = 0; point <= 5; point++) {
      const offset = (point / 5 - .5) * span, jag = point === 0 || point === 5 ? 0 : (noise(seed + point + 2) - .5) * 15
      const px = startX + (horizontal ? offset : jag), py = startY + (horizontal ? jag : offset)
      if (point === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
    }
    ctx.stroke()
  }
  ctx.restore()
}

export function drawLooseGadget(ctx: CanvasRenderingContext2D, prop: Prop) {
  ctx.save(); ctx.translate(prop.x, prop.y - propHeight(prop) / 2); ctx.rotate(prop.angle)
  drawSleeve(ctx, prop.gadget!, prop.size); ctx.restore()
}
function drawEmpEffects(ctx: CanvasRenderingContext2D, run: Run) {
  for (const bolt of run.gadgets.bolts) {
    const [x, y] = bolt.position, [dx, dy] = bolt.direction
    ctx.save(); ctx.strokeStyle = '#82cbd1'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(x - dx * 20, y - dy * 20)
    ctx.lineTo(x - dx * 10 - dy * 3, y - dy * 10 + dx * 3); ctx.lineTo(x, y); ctx.stroke()
    ctx.fillStyle = '#efffff'; ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill(); ctx.restore()
  }
  const disabled = (device: object, x: number, y: number, w: number, h: number) => {
    const remaining = run.gadgets.disabled.get(device)
    if (!remaining) return
    drawEmpCrackle(ctx, x, y, w, h, EMP_DISABLE_SECONDS - remaining)
  }
  for (const m of run.mechanisms) disabled(m, m.x, m.y, m.definition.w, m.definition.h)
  for (const r of run.robots) disabled(r, r.x - 26, r.y + robotTop(r), 52, -12 - robotTop(r))
  for (const f of run.forceFields) {
    const { x, y, w, h, orientation } = f.definition
    for (const end of [0, 1]) {
      if (orientation === 'vertical') disabled(f, x - 2, y + h * end - 4, w + 4, 8)
      else disabled(f, x + w * end - 4, y - 2, 8, h + 4)
    }
  }
  for (const p of run.water.plates) if (p.effect !== 'water') disabled(p, p.x, p.ceiling ? p.y : p.y + p.h - 7, p.w, 7)
}
export function drawGadgets(ctx: CanvasRenderingContext2D, run: Run, paint: WorldPaint = paintNormally, playerExposure: Exposure = 0) {
  // Emissive strokes use the existing compositing path, never a new light source.
  paint(ctx, 1, () => drawEmpEffects(ctx, run))
  if (run.gadgets.nearby && !run.gadgets.held) {
    const prop = run.gadgets.nearby
    ctx.strokeStyle = '#9a8654'; ctx.lineWidth = 1.5
    const x = prop.x, y = prop.y - propHeight(prop) - 9
    paint(ctx, playerExposure, () => { ctx.beginPath(); ctx.moveTo(x - 4, y - 3); ctx.lineTo(x, y); ctx.lineTo(x + 4, y - 3); ctx.stroke() })
  }
  for (const pulse of run.gadgets.pulses) paint(ctx, 1, () => {
    if (pulse.kind !== 'emp' && pulse.age < REPULSOR_BEAM_SECONDS) {
      ctx.save(); ctx.globalAlpha *= Math.max(0, 1 - pulse.age / REPULSOR_BEAM_SECONDS)
      ctx.strokeStyle = '#d6b86e'; ctx.lineWidth = 3
      ctx.beginPath(); ctx.moveTo(...pulse.from); ctx.lineTo(...pulse.to); ctx.stroke(); ctx.restore()
    }
    ctx.save(); ctx.globalAlpha *= Math.max(0, 1 - pulse.age / REPULSOR_IMPACT_SECONDS)
    ctx.strokeStyle = pulse.kind === 'emp' ? '#82cbd1' : '#d6b86e'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(pulse.to[0], pulse.to[1], 4 + pulse.age * 45, 0, Math.PI * 2); ctx.stroke(); ctx.restore()
  })
}
