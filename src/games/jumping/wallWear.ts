
/**
 * How much water has stained a room (docs/jumping-wall-wear.md, Stain intensity). One setting per level: None,
 * Light, or Heavy, the default, saved by leaving it out. It scales the water marks only: stains on the wall panels
 * and rust weeping from pipe joints. Terrain wear is age and material, not water, and keeps its own look.
 */
export type StainSetting = 'none' | 'light'
export type StainLevel = StainSetting | 'heavy'
export const STAIN_LEVELS: { id: StainLevel; label: string }[] = [{ id: 'none', label: 'None' }, { id: 'light', label: 'Light' }, { id: 'heavy', label: 'Heavy' }]
/**
 * A saved stain level. Files from before there were three levels may say "normal", "soaked" or "heavy" (all saved
 * as the default now) and read as Heavy.
 */
export const stainSetting = (value: unknown): StainLevel | undefined =>
  value === 'none' || value === 'light' || value === 'heavy' ? value : value === 'normal' || value === 'soaked' ? 'heavy' : undefined

interface StainStyle {
  /** The share of panels stained, and how many streaks a stained panel carries. */
  share: number; least: number; most: number
  /** A streak's length, as a share of its panel's height. */
  shortest: number; longest: number
  /** Multiplies the stain fill's opacity. */
  opacity: number
  /** Pipe rust: the chance per joint, and its streak's length. */
  rust: number; rustLength: number
}
const STYLES: Record<StainLevel, StainStyle> = {
  none: { share: 0, least: 0, most: 0, shortest: 0, longest: 0, opacity: 0, rust: 0, rustLength: 0 },
  light: { share: 1 / 6, least: 1, most: 1, shortest: .15, longest: .4, opacity: .75, rust: .35, rustLength: .65 },
  heavy: { share: 1 / 4, least: 1, most: 2, shortest: .16, longest: .55, opacity: .85, rust: .6, rustLength: .85 },
}

interface Rect { x: number; y: number; w: number; h: number }
/**
 * The room's water marks: its stain level, its own offsets into the hashes, so each room has its own pattern, and
 * where its water stands. Water washes the wall it covers, so a stain stops where it would run into it.
 */
export interface WallWear { stains: StainLevel; style: StainStyle; salt: readonly [number, number]; wet: readonly Rect[] }
const HEAVY: WallWear = { stains: 'heavy', style: STYLES.heavy, salt: [0, 0], wet: [] }
const wears = new Map<string, WallWear>()
interface WornLevel { id?: string; stains?: StainSetting; gravityPlates?: readonly (Rect & { effect?: string })[] }
/**
 * A level's wear. The level's ID joins the hash, so the panel at a given world position is stained differently
 * in each room, and the same on every visit and after studio edits. Changing the ID reshuffles it. The wet areas
 * are the level's water zones, at their fullest: a wall that water reaches stays washed when it drains.
 */
export function wallWear(level?: WornLevel | null): WallWear {
  if (!level) return HEAVY
  const stains = level.stains ?? 'heavy', wet = (level.gravityPlates ?? []).filter(p => p.effect === 'water').map(({ x, y, w, h }) => ({ x, y, w, h }))
  const key = `${stains}:${level.id ?? ''}:${wet.map(r => `${r.x},${r.y},${r.w},${r.h}`).join(';')}`
  let wear = wears.get(key)
  if (!wear) {
    if (wears.size > 256) wears.clear()
    wear = { stains, style: STYLES[stains], salt: levelSalt(level.id ?? ''), wet }
    wears.set(key, wear)
  }
  return wear
}
/**
 * How far a stain starting at `top` and `length` long, across `x0` to `x1`, runs before water stops it: 0 if it
 * would start in water, and the whole length if no water lies below it.
 */
export function dryLength(wear: WallWear, x0: number, x1: number, top: number, length: number) {
  let reach = length
  for (const w of wear.wet) {
    if (w.x >= x1 || w.x + w.w <= x0 || w.y + w.h <= top || w.y >= top + reach) continue
    reach = Math.max(0, w.y - top)
  }
  return reach
}
/** Two offsets from a level ID (FNV-1a), small enough that the sine hash keeps its precision. */
export function levelSalt(id: string): readonly [number, number] {
  if (!id) return [0, 0]
  let hash = 2166136261
  for (let i = 0; i < id.length; i++) { hash ^= id.charCodeAt(i); hash = Math.imul(hash, 16777619) }
  hash >>>= 0
  return [(hash & 1023) * .7313, ((hash >>> 10) & 1023) * .6187]
}

const noise = (x: number, y: number) => {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return n - Math.floor(n)
}

/** The stain fill's opacity at this level, from the wall's own base opacity. */
export const stainOpacity = (wear: WallWear, base: number) => Math.round(base * wear.style.opacity * 1000) / 1000
interface Box { x0: number; y0: number; x1: number; y1: number }
/** One water streak: its bounds, and the level rectangles it is drawn with. */
export interface Streak { box: Box; stains: number[] }

/**
 * A streak narrows and leans as it runs down, in level steps: enough that its width and lean change by no more
 * than two units a step, so it reads as a taper rather than stacked blocks, and at least three. Each step is a rectangle `[x, y, w, h]` appended to `out`, drawn with `fillRect` (see `stainLayer`).
 */
export function steps(out: number[], at: number, top: number, length: number, width: number, taper: number, lean: number) {
  const count = Math.max(3, Math.min(12, Math.max(Math.ceil(width * taper / 2), Math.ceil(Math.abs(lean) / 2))))
  for (let s = 0; s < count; s++) {
    const from = top + length * s / count, to = top + length * (s + 1) / count, along = (s + .5) / count
    const wide = width * (1 - taper * along), centre = at + lean * along - width * .025 * along
    out.push(centre - wide / 2, from, wide, to - from)
  }
}

/**
 * Stains on a wall panel, where water has run out of the joint at its top, the bottom of the tile above, and down
 * it: deterministic per panel, room and level, so the wall is the same on every visit. A panel at the top of the
 * room has no tile above it, and no stain. Streaks are appended to `out`. Each takes its own slot across the panel,
 * inside it, so they never touch one another or a neighbour's, and stays within its panel, stopping short of any
 * water below.
 */
export function panelStains(out: Streak[], x: number, y: number, w: number, h: number, col: number, row: number, wear: WallWear = HEAVY) {
  const { style, salt: [sx, sy] } = wear
  if (!style.share || y <= 0) return
  const n = (a: number, b: number) => noise(a + sx, b + sy)
  const seed = n(col * 3.1 + 11.7, row * 2.3 - 4.1)
  if (seed >= style.share) return
  const count = style.least + Math.min(style.most - style.least, Math.floor(n(col * .77, row * 1.9 + 3.3) * (style.most - style.least + 1)))
  // The slots: the middle three quarters of the panel, divided evenly, each taken in a hashed order.
  const slot = w * .76 / count, first = Math.floor(n(row * .41, col * 2.9) * count)
  for (let i = 0; i < count; i++) {
    const k = (first + i) % count, width = Math.min(8 + 20 * n(row + i, col * .7), (slot - 2) / 1.35)
    const at = x + w * .12 + slot * (k + .5) + (n(col + i * 5.3, row - i * 1.7) - .5) * Math.max(0, slot - 2 - width * 1.35)
    const share = style.shortest + (style.longest - style.shortest) * n(col * .9 - i, row * 1.3 + i)
    const lean = (n(row, col + i) - .5) * width * .6, top = y + 1.5
    const x0 = at - width / 2 + Math.min(0, lean) - width * .03 - .5, x1 = at + width / 2 + Math.max(0, lean) + .5
    const length = dryLength(wear, x0, x1, top, h * share - 1.5)
    if (length < 4) continue
    const streak: Streak = { box: { x0, y0: top, x1, y1: top + length }, stains: [] }
    steps(streak.stains, at, top, length, width, .55, lean * length / (h * share - 1.5))
    out.push(streak)
  }
}

/**
 * A view's stains, each step of each streak a `fillRect`, as the panels' own tints are. Daylight redraws a
 * clipped patch over a cached frame and must match it exactly (jumpingExposureCorrection.dev.spec). Chrome
 * rounds translucent paths differently under that clip: one fill of every streak, slanted streaks, clusters of
 * streaks in one path and even single stepped paths all came out a level off somewhere, while rectangles
 * drawn with `fillRect` match. Separate rectangles add where they overlap, so streaks never overlap: each takes
 * its own slot across its panel and stays within it. A step meets the next edge to edge.
 */
export function stainLayer() {
  const streaks: Streak[] = []
  return {
    streaks,
    /** Draws the streaks that reach `view`. */
    fill(ctx: CanvasRenderingContext2D, wear: WallWear, stain: string, view: Box) {
      if (!wear.style.share || !streaks.length) return
      ctx.fillStyle = stain
      for (const { box, stains } of streaks) if (box.x1 > view.x0 && box.x0 < view.x1 && box.y1 > view.y0 && box.y0 < view.y1)
        for (let i = 0; i < stains.length; i += 4) ctx.fillRect(stains[i], stains[i + 1], stains[i + 2], stains[i + 3])
    },
  }
}

/** Pipe rust at this level: whether a joint weeps (from its own hash value) and how long its streak is. */
export const pipeRust = (wear: WallWear, value: number) => ({ weeps: value > 1 - wear.style.rust, length: wear.style.rustLength })
