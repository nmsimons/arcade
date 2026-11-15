import type { WorldPaint } from './worldPaint.ts'
import { paintNormally } from './worldPaint.ts'
import { WORLD_EFFECT_LIFE, splashDropSpeed, splashOnset, splashScale, worldEffectLife, worldEffects } from './worldEffects.ts'
import type { WorldEffect } from './worldEffects.ts'
import { TUNING } from './movementTuning.ts'

/** A warm grey a little darker than the course wall, so dust reads as a thin haze rather than grit or spray. */
export const IMPACT_DUST_COLOR = '#a8a195'
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
    if (kinds(e.kind) && age >= 0 && age < worldEffectLife(e)) out.push({ e, age })
  }
  return out
}

/**
 * Landing dust and prop impact dust, between the props and the robot player:
 * soft puffs that roll out along the ground, swell and thin away. They receive
 * light, cast nothing and emit nothing (docs/jumping-lighting.md, section 4).
 */
export function drawImpactEffects(ctx: CanvasRenderingContext2D, run: Run, paint: WorldPaint = paintNormally) {
  const effects = live(run, kind => kind !== 'splash')
  if (!effects.length) return
  const view = viewOf(ctx)
  const visible = effects.filter(({ e }) => onScreen(view, e.x, e.y, 80 + e.size))
  if (!visible.length) return
  paint(ctx, 0, () => {
    ctx.save()
    const alpha = ctx.globalAlpha
    ctx.fillStyle = IMPACT_DUST_COLOR
    for (const { e, age } of visible) {
      if (e.kind === 'landing') drawLandingDust(ctx, e, age / WORLD_EFFECT_LIFE.landing, alpha)
      else drawPropDust(ctx, e, age / WORLD_EFFECT_LIFE[e.kind], alpha)
    }
    ctx.restore()
  })
}

type Puff = readonly [x: number, y: number, radius: number]
/** Each puff's nested layers, as fractions of its radius. */
const PUFF_LAYERS = [1, .7, .42]
/** Puffs are flatter than round, as dust hugs the ground. */
const PUFF_HEIGHT = .6
/**
 * Puffs as nested ellipses, each layer faint, so a puff thickens toward its middle and thins at its edge
 * without a gradient (the WebGL world draws none). Each layer is one fill, so puffs that overlap merge
 * into one haze rather than darkening where they cross.
 */
function fillPuffs(ctx: CanvasRenderingContext2D, puffs: readonly Puff[], alpha: number) {
  if (alpha <= .002) return
  ctx.globalAlpha = alpha
  for (const layer of PUFF_LAYERS) {
    ctx.beginPath()
    for (const [x, y, radius] of puffs) {
      const rx = radius * layer
      ctx.moveTo(x + rx, y); ctx.ellipse(x, y, rx, rx * PUFF_HEIGHT, 0, 0, Math.PI * 2)
    }
    ctx.fill()
  }
}
/** Fades in over the first moment, then thins away slowly. */
const dustFade = (t: number) => Math.min(1, t / .08) * (1 - t) ** 1.6
/** A puff resting on the ground, its lowest layer just over the contact line. */
const resting = (radius: number) => -radius * PUFF_HEIGHT * .8

/** Three puffs each way roll out along the ground from the feet, swelling and rising a little as they slow. */
function drawLandingDust(ctx: CanvasRenderingContext2D, e: WorldEffect, t: number, alpha: number) {
  const s = e.strength, seed = effectSeed(e)
  const reach = 16 + 30 * s, out = 1 - (1 - t) ** 2.5, puffs: Puff[] = []
  for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
    const r = seed ^ Math.imul(i + 1, 104395301) ^ Math.imul(side + 2, 668265263), lead = (i + 1) / 3
    const distance = 3 + reach * out * (.3 + .7 * lead) * (.85 + .3 * random(r))
    const radius = (3.5 + 3.5 * s) * (.85 + .3 * random(r + 1)) * (1.2 - .35 * lead) * (1 + 1.2 * out)
    puffs.push([side * distance, resting(radius) - (2 + 5 * s) * out * (.4 + .6 * random(r + 2)), radius])
  }
  ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.angle); ctx.scale(1, e.up < 0 ? -1 : 1)
  fillPuffs(ctx, puffs, alpha * (.08 + .06 * s) * dustFade(t))
  ctx.restore()
}

/** A little dust squeezes out from under a crate's corners or either side of a ball's base. */
function drawPropDust(ctx: CanvasRenderingContext2D, e: WorldEffect, t: number, alpha: number) {
  const s = e.strength, seed = effectSeed(e), scale = Math.min(1.6, Math.max(.6, Math.sqrt(e.size / 60)))
  const contacts = e.kind === 'box-impact' ? [-.45, .45] : [0]
  const out = 1 - (1 - t) ** 2.5, puffs: Puff[] = []
  for (const contact of contacts) for (const side of contact ? [Math.sign(contact)] : [-1, 1]) for (let i = 0; i < 2; i++) {
    const r = seed ^ Math.imul(i + 1, 104395301) ^ Math.imul(side + 2, 668265263) ^ Math.imul(Math.round(contact * 4) + 3, 374761393)
    const distance = (1 + (8 + 14 * s) * out * (.5 + .5 * i) * (.85 + .3 * random(r))) * scale
    const radius = (3 + 3 * s) * scale * (.85 + .3 * random(r + 1)) * (1 + out)
    puffs.push([e.x + contact * e.size + side * distance, e.y + resting(radius), radius])
  }
  fillPuffs(ctx, puffs, alpha * (.07 + .06 * s) * dustFade(t))
}

/**
 * Splashes, over the water's tint: two lobes rise from the waterline and fall
 * back, and a few drops arc up and fall in again. Drops below the waterline are
 * not drawn. A run with its water effects reduced draws none. The harder the
 * entry (splashEnergy), the taller and wider the lobes, and the more drops,
 * thrown higher: a hop in barely ruffles the surface; a long fall throws a crown.
 * Walking in makes none at all.
 */
export function drawSplashes(ctx: CanvasRenderingContext2D, run: Run, paint: WorldPaint = paintNormally) {
  if (run.waterEffectsEnabled === false || run.waterSurface?.enabled === false) return
  const effects = live(run, kind => kind === 'splash')
  if (!effects.length) return
  const view = viewOf(ctx)
  // A hard entry's spray reaches further out and up.
  const visible = effects.filter(({ e }) => onScreen(view, e.x, e.y, 120 + e.size + 140 * Math.max(0, e.strength - 1)))
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
  const s = e.strength, seed = effectSeed(e), scale = splashScale(e.size), onset = splashOnset(s)
  // A taller sheet takes longer to rise and fall back, as a thrown body would.
  const peak = (8 + 20 * s) * onset, lobeLife = LOBE_LIFE * Math.sqrt(Math.max(1, peak / 28))
  if (age < lobeLife) {
    // Two thin sheets of water flare up and out from the entry, then fall back.
    const p = age / lobeLife, height = peak * scale * Math.sin(Math.PI * p)
    const flare = (6 + 12 * s) * onset * scale * (.6 + .6 * p), thickness = (3 + 3 * Math.min(s, 2)) * scale * (1 - .5 * p)
    if (height > .5) {
      // A tall sheet thins away as it falls back, rather than flattening into a wide blade on the water.
      ctx.globalAlpha = alpha * .85 * (1 - .5 * p) * (1 - Math.min(1, Math.max(0, s - 1)) * p ** 3)
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
  const count = Math.round((6 + 4 * s + Math.max(0, s - 1)) * onset), life = worldEffectLife(e), fastest = splashDropSpeed(s, e.size)
  ctx.globalAlpha = alpha * .9 * (1 - (age / life) ** 2)
  for (let i = 0; i < count; i++) {
    const r = seed ^ Math.imul(i + 1, 104395301), side = i % 2 ? 1 : -1
    const angle = (8 + 50 * random(r)) * Math.PI / 180, speed = fastest * (.6 + .4 * random(r + 1))
    const x = e.x + side * ((2 + 5 * random(r + 2)) * scale + Math.sin(angle) * speed * age)
    const y = e.y - Math.cos(angle) * speed * age + TUNING.gravity * age * age / 2
    if (y > e.y) continue
    const size = Math.max(floor, 2 + 1.5 * random(r + 3) * (.5 + Math.min(s, 1.5)))
    ctx.fillRect(x - size / 2, y - size / 2, size, size)
  }
}
