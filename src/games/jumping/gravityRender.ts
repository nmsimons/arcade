import type { GravityPlate, GravityField } from './gravity.ts'
import { gravityAtPoint } from './gravity.ts'
import { TUNING } from './movementTuning.ts'
import type { WorldPaint } from './worldPaint.ts'
import { paintNormally } from './worldPaint.ts'

export const MAX_GRAVITY_DUST = 96
const MAX_DUST_PER_PLATE = 64, CELL_W = 80, CELL_H = 120
const seeds = new WeakMap<GravityPlate, number>()
function plateSeed(plate: GravityPlate) {
  const cached = seeds.get(plate)
  if (cached !== undefined) return cached
  let seed = 2166136261
  for (let i = 0; i < plate.id.length; i++) seed = Math.imul(seed ^ plate.id.charCodeAt(i), 16777619)
  seeds.set(plate, seed)
  return seed
}
const random = (seed: number) => {
  seed = Math.imul(seed ^ seed >>> 16, 0x21f0aaad)
  seed = Math.imul(seed ^ seed >>> 15, 0x735a2d97)
  return ((seed ^ seed >>> 15) >>> 0) / 4294967296
}

/** Gravity itself has no artwork. The studio keeps only an authoring guide. */
export function drawGravityRegion(ctx: CanvasRenderingContext2D, plate: GravityPlate, active: boolean, editor = false, paint: WorldPaint = paintNormally) {
  if (!editor) return
  paint(ctx, 0, () => {
    ctx.save(); ctx.strokeStyle = active ? '#9b7ac6' : '#948a9e'
    ctx.globalAlpha *= .4; ctx.lineWidth = 1; ctx.setLineDash([3, 8])
    ctx.strokeRect(plate.x, plate.y, plate.w, plate.h); ctx.restore()
  })
}

/** World-anchored dust is evaluated from gameplay time, with no particle solver,
 * spawning allocations, lights or image buffers. Only visible cells are visited. */
export function drawGravityDust(ctx: CanvasRenderingContext2D, plates: readonly GravityPlate[], field: GravityField, time: number, paint: WorldPaint = paintNormally, night = false) {
  if (!field.strips.length) return
  const transform = ctx.getTransform()
  const left = -transform.e / transform.a, right = (ctx.canvas.width - transform.e) / transform.a
  const top = -transform.f / transform.d, bottom = (ctx.canvas.height - transform.f) / transform.d
  const visible = (p: GravityPlate, i: number) => !!(field.mask & (1 << i)) && p.x < right && p.x + p.w > left && p.y < bottom && p.y + p.h > top
  let count = 0
  for (let i = 0; i < plates.length; i++) if (visible(plates[i], i)) count++
  if (!count) return
  const quota = Math.min(MAX_DUST_PER_PLATE, Math.floor(MAX_GRAVITY_DUST / count))
  for (let index = 0; index < plates.length; index++) {
    const plate = plates[index]
    if (!visible(plate, index)) continue
    const firstCol = Math.max(0, Math.floor((left - plate.x) / CELL_W)), lastCol = Math.ceil((Math.min(right, plate.x + plate.w) - plate.x) / CELL_W)
    const firstRow = Math.max(0, Math.floor((top - plate.y) / CELL_H)), lastRow = Math.ceil((Math.min(bottom, plate.y + plate.h) - plate.y) / CELL_H)
    const columns = lastCol - firstCol, samples = columns * (lastRow - firstRow) * 2, stride = Math.max(1, Math.ceil(samples / quota))
    const seed = plateSeed(plate)
    // Existing readability exposure keeps pale dust visible in night rooms;
    // these motes never add a light source or illuminate nearby objects.
    paint(ctx, .65, () => {
      ctx.save(); ctx.fillStyle = night ? '#e4c6ff' : '#8050aa'
      const alpha = ctx.globalAlpha
      for (let sample = 0; sample < samples; sample += stride) {
        const cell = Math.floor(sample / 2), slot = sample % 2
        const col = firstCol + cell % columns, row = firstRow + Math.floor(cell / columns)
        const base = seed ^ Math.imul(col, 73856093) ^ Math.imul(row, 19349663), hash = base ^ Math.imul(slot, 104395301)
        const cellX = plate.x + col * CELL_W, cellY = plate.y + row * CELL_H
        const width = Math.min(CELL_W, plate.x + plate.w - cellX), height = Math.min(CELL_H, plate.y + plate.h - cellY)
        // Opposite phases leave a visible mote even in a single-cell field.
        const offset = random(base), phase = (random(base + 1) + slot * .5 + time * (48 + offset * 24) / CELL_H) % 1
        const x = cellX + (.12 + slot * .5 + random(hash + 2) * .25) * width + Math.sin(time * .7 + offset * 6.28) * Math.min(4, width * .06)
        const gravity = gravityAtPoint(field, x, cellY + height / 2) / TUNING.gravity
        if (Math.abs(gravity - 1) < 1e-7) continue
        const y = gravity === 0 ? cellY + (.2 + random(hash + 3) * .6) * height + Math.sin(time * .5 + offset * 6.28) * 5
          : cellY + (gravity < 0 ? 1 - phase : phase) * height
        // A mote must not advertise a different direction across an overlap seam.
        const local = gravityAtPoint(field, x, y) / TUNING.gravity
        if (Math.abs(local - 1) < 1e-7 || Math.sign(local) !== Math.sign(gravity)) continue
        const edge = Math.min(1, (x - plate.x) / 16, (plate.x + plate.w - x) / 16, (y - plate.y) / 16, (plate.y + plate.h - y) / 16)
        const fade = Math.min(1, phase / .18, (1 - phase) / .18) * Math.max(0, edge)
        if (fade <= .02) continue
        // Keep dust from becoming subpixel specks when the camera zooms out.
        const size = Math.max(2, 2.5 / Math.abs(transform.a)) * (1 + random(hash + 4) * .25)
        const length = size * (gravity === 0 ? 1 : 1 + Math.max(.75, Math.min(3, Math.abs(gravity))))
        ctx.globalAlpha = alpha * .85 * fade
        ctx.fillRect(x - size / 2, y - length / 2, size, length)
      }
      ctx.restore()
    })
  }
}
export function drawGravityPlate(ctx: CanvasRenderingContext2D, plate: GravityPlate, active: boolean, paint: WorldPaint = paintNormally) {
  const { x, w } = plate, y = plate.y + plate.h
  // The pressure plate's shallow metal foot and raised insert, kept inside
  // the field footprint. Only the violet emitter receives power exposure.
  paint(ctx, 0, () => {
    ctx.fillStyle = '#738575'; ctx.fillRect(x, y - 3, w, 3)
  })
  paint(ctx, active ? .65 : 0, () => {
    ctx.fillStyle = active ? '#bda0e5' : '#958b9f'; ctx.fillRect(x + 3, y - 7, w - 6, 3)
  })
}
