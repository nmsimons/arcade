import type { WorldPaint } from './worldPaint.ts'
import { paintNormally } from './worldPaint.ts'
import { WORLD_EFFECT_LIFE, worldEffects } from './worldEffects.ts'
import type { WorldEffect } from './worldEffects.ts'
import { TUNING } from './movementTuning.ts'

/** The slide grit's colour (render.ts), shared by landing dust and impact ticks. */
export const IMPACT_DUST_COLOR = '#777b7e'
/** Between the water's tint and its waterline highlight, so spray reads against a pale wall. */
export const SPLASH_COLOR = '#7fbde4'

interface Run { activeTime: number; waterEffectsEnabled?: boolean; waterSurface?: { enabled: boolean } }
type View = { left: number; right: number; top: number; bottom: number; scale: number }

const random = (seed: number) => {
  seed = Math.imul(seed ^ seed >>> 16, 0x21f0aaad)
  seed = Math.imul(seed ^ seed >>> 15, 0x735a2d97)
  return ((seed ^ seed >>> 15) >>> 0) / 4294967296
}
/** Every effect scatters its pieces the same way each time it is drawn. */
const effectSeed = (e: WorldEffect) => Math.imul(Math.round(e.x * 4), 73856093) ^ Math.imul(Math.round(e.y * 4), 19349663) ^ Math.imul(Math.round(e.time * 240), 83492791)

/** The world rectangle on screen, or null when the context cannot say (then nothing is culled). */
function viewOf(ctx: CanvasRenderingContext2D): View | null {
  if (!ctx.canvas || !ctx.getTransform) return null
  const t = ctx.getTransform()
  if (!t.a || !t.d) return null
  const x0 = -t.e / t.a, x1 = (ctx.canvas.width - t.e) / t.a, y0 = -t.f / t.d, y1 = (ctx.canvas.height - t.f) / t.d
  return { left: Math.min(x0, x1), right: Math.max(x0, x1), top: Math.min(y0, y1), bottom: Math.max(y0, y1), scale: Math.abs(t.a) }
}
const onScreen = (view: View | null, x: number, y: number, reach: number) =>
  !view || x + reach >= view.left && x - reach <= view.right && y + reach >= view.top && y - reach <= view.bottom

function live(run: Run, kinds: (kind: WorldEffect['kind']) => boolean) {
  const now = run.activeTime, out: { e: WorldEffect; age: number }[] = []
  for (const e of worldEffects(run)) {
    const age = now - e.time
    if (kinds(e.kind) && age >= 0 && age < WORLD_EFFECT_LIFE[e.kind]) out.push({ e, age })
  }
  return out
}

/**
 * Landing dust and impact ticks, between the props and the robot player. Flat
 * specks and short strokes in the slide grit's colour: they receive light,
 * cast nothing and emit nothing (docs/jumping-lighting.md, section 4).
 */
export function drawImpactEffects(ctx: CanvasRenderingContext2D, run: Run, paint: WorldPaint = paintNormally) {
  const effects = live(run, kind => kind !== 'splash')
  if (!effects.length) return
  const view = viewOf(ctx)
  const visible = effects.filter(({ e }) => onScreen(view, e.x, e.y, 80 + e.size))
  if (!visible.length) return
  paint(ctx, 0, () => {
    ctx.save()
    const alpha = ctx.globalAlpha, floor = view ? 1.5 / view.scale : 0
    for (const { e, age } of visible) {
      if (e.kind === 'landing') drawLandingDust(ctx, e, age / WORLD_EFFECT_LIFE.landing, alpha, floor)
      else drawImpactTicks(ctx, e, age / WORLD_EFFECT_LIFE[e.kind], alpha)
    }
    ctx.restore()
  })
}

/** Two low puffs of flat specks run out along the ground from the feet, rise a little and settle. */
function drawLandingDust(ctx: CanvasRenderingContext2D, e: WorldEffect, t: number, alpha: number, floor: number) {
  const s = e.strength, seed = effectSeed(e)
  const reach = 18 + 34 * s, rise = 4 + 6 * s, out = 1 - (1 - t) ** 3
  const lift = Math.sin(Math.PI * Math.min(1, t * 1.25))
  const count = 5 + Math.round(2 * s)
  ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.angle); ctx.scale(1, e.up < 0 ? -1 : 1)
  ctx.fillStyle = IMPACT_DUST_COLOR
  ctx.globalAlpha = alpha * .5 * (.55 + .45 * s) * (1 - t) ** 1.2
  for (const side of [-1, 1]) for (let i = 0; i < count; i++) {
    const r = seed ^ Math.imul(i + 1, 104395301) ^ Math.imul(side + 2, 668265263)
    const distance = 5 + reach * out * (.3 + .7 * random(r))
    const height = rise * (.25 + .75 * random(r + 1)) * lift
    // Flat specks, wider than tall, smaller as they spread.
    const w = Math.max(floor, (3 + 3 * random(r + 2) * (.5 + s)) * (1 - .4 * t)), h = Math.max(floor, 2 + random(r + 3))
    ctx.fillRect(side * distance - w / 2, -height - h, w, h)
  }
  ctx.restore()
}

/** Short strokes spring out and up from where a crate's corners or a ball's base strike. */
function drawImpactTicks(ctx: CanvasRenderingContext2D, e: WorldEffect, t: number, alpha: number) {
  const s = e.strength, seed = effectSeed(e), scale = Math.min(1.6, Math.max(.6, Math.sqrt(e.size / 60)))
  const contacts = e.kind === 'box-impact' ? [-.45, .45] : [0]
  const out = 1 - (1 - t) ** 2, length = (6 + 8 * s) * scale * (1 - .5 * t)
  ctx.save()
  ctx.strokeStyle = IMPACT_DUST_COLOR; ctx.lineWidth = 2; ctx.lineCap = 'round'
  ctx.globalAlpha = alpha * (.45 + .25 * s) * (1 - t)
  ctx.beginPath()
  for (const contact of contacts) for (const side of contact ? [Math.sign(contact)] : [-1, 1]) for (let i = 0; i < 3; i++) {
    const r = seed ^ Math.imul(i + 1, 104395301) ^ Math.imul(side + 2, 668265263)
    const angle = (8 + 24 * i + 8 * random(r)) * Math.PI / 180, c = Math.cos(angle) * side, sn = Math.sin(angle)
    const start = (2 + 16 * out) * scale, x = e.x + contact * e.size + c * start, y = e.y - sn * start
    ctx.moveTo(x, y); ctx.lineTo(x + c * length, y - sn * length)
  }
  ctx.stroke()
  ctx.restore()
}

/**
 * Splashes, over the water's tint: two lobes rise from the waterline and fall
 * back, and a few drops arc up and fall in again. Drops below the waterline are
 * not drawn. A run with its water effects reduced draws none.
 */
export function drawSplashes(ctx: CanvasRenderingContext2D, run: Run, paint: WorldPaint = paintNormally) {
  if (run.waterEffectsEnabled === false || run.waterSurface?.enabled === false) return
  const effects = live(run, kind => kind === 'splash')
  if (!effects.length) return
  const view = viewOf(ctx)
  const visible = effects.filter(({ e }) => onScreen(view, e.x, e.y, 120 + e.size))
  if (!visible.length) return
  paint(ctx, 0, () => {
    ctx.save()
    const alpha = ctx.globalAlpha, floor = view ? 1.5 / view.scale : 0
    ctx.fillStyle = SPLASH_COLOR
    for (const { e, age } of visible) drawSplash(ctx, e, age, alpha, floor)
    ctx.restore()
  })
}

const LOBE_LIFE = .45
function drawSplash(ctx: CanvasRenderingContext2D, e: WorldEffect, age: number, alpha: number, floor: number) {
  const s = e.strength, seed = effectSeed(e), scale = Math.min(1.5, Math.max(.7, Math.sqrt(e.size / 60)))
  if (age < LOBE_LIFE) {
    // Two thin sheets of water flare up and out from the entry, then fall back.
    const p = age / LOBE_LIFE, height = (8 + 20 * s) * scale * Math.sin(Math.PI * p)
    const flare = (6 + 12 * s) * scale * (.6 + .6 * p), thickness = (3 + 3 * s) * scale * (1 - .5 * p)
    if (height > .5) {
      ctx.globalAlpha = alpha * .85 * (1 - .5 * p)
      ctx.beginPath()
      for (const side of [-1, 1]) {
        const base = e.x + side * (3 + 4 * p) * scale, tip = base + side * flare
        ctx.moveTo(base, e.y)
        ctx.quadraticCurveTo(base, e.y - height * .8, tip, e.y - height)
        ctx.quadraticCurveTo(base + side * (thickness + flare * .25), e.y - height * .45, base + side * thickness, e.y)
        ctx.closePath()
      }
      ctx.fill()
    }
  }
  const count = 6 + Math.round(4 * s), life = WORLD_EFFECT_LIFE.splash
  ctx.globalAlpha = alpha * .9 * (1 - (age / life) ** 2)
  for (let i = 0; i < count; i++) {
    const r = seed ^ Math.imul(i + 1, 104395301), side = i % 2 ? 1 : -1
    const angle = (8 + 50 * random(r)) * Math.PI / 180, speed = (160 + 240 * s) * (.6 + .4 * random(r + 1)) * Math.sqrt(scale)
    const x = e.x + side * ((2 + 5 * random(r + 2)) * scale + Math.sin(angle) * speed * age)
    const y = e.y - Math.cos(angle) * speed * age + TUNING.gravity * age * age / 2
    if (y > e.y) continue
    const size = Math.max(floor, 2 + 1.5 * random(r + 3) * (.5 + s))
    ctx.fillRect(x - size / 2, y - size / 2, size, size)
  }
}
