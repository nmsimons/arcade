
/**
 * How much water has stained a room (docs/jumping-wall-wear.md, Stain intensity). One setting per level, saved by
 * leaving it out for Normal. It scales the water marks only: stains on the wall panels and rust weeping from pipe
 * joints. Terrain wear is age and material, not water, and keeps its own look at every setting.
 */
export type StainSetting = 'none' | 'light' | 'heavy' | 'soaked'
export type StainLevel = StainSetting | 'normal'
export const STAIN_LEVELS: { id: StainLevel; label: string }[] = [
  { id: 'none', label: 'None' }, { id: 'light', label: 'Light' }, { id: 'normal', label: 'Normal' },
  { id: 'heavy', label: 'Heavy' }, { id: 'soaked', label: 'Soaked' },
]
export const stainSetting = (value: unknown): StainLevel | undefined =>
  typeof value === 'string' && STAIN_LEVELS.some(level => level.id === value) ? value as StainLevel : undefined

interface StainStyle {
  /** The share of panels stained, and how many streaks a stained panel carries. */
  share: number; least: number; most: number
  /** A streak's length, as a share of its panel's height. */
  shortest: number; longest: number
  /** Multiplies the stain fill's opacity. */
  opacity: number
  /** The share of long streaks (over half the panel) that run on past the joint below, and how far into that panel. */
  cross: number; past: [number, number]
  /** Long streaks get a darker, narrower core, its own fill. */
  core: boolean
  /** Pipe rust: the chance per joint, and its streak's length. */
  rust: number; rustLength: number
}
const STYLES: Record<StainLevel, StainStyle> = {
  none: { share: 0, least: 0, most: 0, shortest: 0, longest: 0, opacity: 0, cross: 0, past: [0, 0], core: false, rust: 0, rustLength: 0 },
  light: { share: 1 / 6, least: 1, most: 1, shortest: .15, longest: .4, opacity: .75, cross: 0, past: [0, 0], core: false, rust: .35, rustLength: .65 },
  normal: { share: 1 / 3, least: 1, most: 2, shortest: .18, longest: .68, opacity: 1, cross: 0, past: [0, 0], core: false, rust: .75, rustLength: 1 },
  heavy: { share: 3 / 5, least: 1, most: 3, shortest: .25, longest: .95, opacity: 1.25, cross: 1 / 3, past: [.2, .5], core: false, rust: .9, rustLength: 1.3 },
  soaked: { share: 4 / 5, least: 2, most: 4, shortest: .35, longest: 1, opacity: 1.45, cross: .5, past: [.2, .5], core: true, rust: 1, rustLength: 1.6 },
}

/** The room's water marks: its stain level, and its own offsets into the hashes, so each room has its own pattern. */
export interface WallWear { stains: StainLevel; style: StainStyle; salt: readonly [number, number] }
const NORMAL: WallWear = { stains: 'normal', style: STYLES.normal, salt: [0, 0] }
const wears = new Map<string, WallWear>()
/**
 * A level's wear. The level's ID joins the hash, so the panel at a given world position is stained differently
 * in each room, and the same on every visit and after studio edits. Changing the ID reshuffles it.
 */
export function wallWear(level?: { id?: string; stains?: StainSetting } | null): WallWear {
  if (!level) return NORMAL
  const stains = level.stains ?? 'normal', key = `${stains}:${level.id ?? ''}`
  let wear = wears.get(key)
  if (!wear) {
    if (wears.size > 256) wears.clear()
    wear = { stains, style: STYLES[stains], salt: levelSalt(level.id ?? '') }
    wears.set(key, wear)
  }
  return wear
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
/**
 * A long streak's core, at Soaked. Kept faint enough that a core over its streak stays at or under .16 in daylight
 * on the course wall and every finish (1 - (1 - .116) × (1 - .045) ≈ .156).
 */
export const STAIN_CORE_OPACITY = .045

interface Box { x0: number; y0: number; x1: number; y1: number }
/** One water streak: its bounds, and the level rectangles it is drawn with, with its core's at Soaked. */
export interface Streak { box: Box; stains: number[]; cores: number[] }

/**
 * A streak narrows and leans as it runs down, in level steps: enough that its width and lean change by no more
 * than two units a step, so it reads as a taper rather than stacked blocks, and at least three. Each step is a rectangle `[x, y, w, h]` appended to `out`, drawn with `fillRect` (see `stainLayer`).
 */
function steps(out: number[], at: number, top: number, length: number, width: number, taper: number, lean: number) {
  const count = Math.max(3, Math.min(12, Math.max(Math.ceil(width * taper / 2), Math.ceil(Math.abs(lean) / 2))))
  for (let s = 0; s < count; s++) {
    const from = top + length * s / count, to = top + length * (s + 1) / count, along = (s + .5) / count
    const wide = width * (1 - taper * along), centre = at + lean * along - width * .025 * along
    out.push(centre - wide / 2, from, wide, to - from)
  }
}

/**
 * Stains on a wall panel, where water has run down from its top joint: deterministic per panel, room and level,
 * so the wall is the same on every visit. Streaks are appended to `out`. Each takes its own slot across the
 * panel, inside it, so a panel's streaks never touch one another or a neighbour's; a heavy room's long ones run
 * on past the joint into the panel below, so a caller laying out a view's stains starts two panels above it.
 */
export function panelStains(out: Streak[], x: number, y: number, w: number, h: number, col: number, row: number, wear: WallWear = NORMAL) {
  const { style, salt: [sx, sy] } = wear
  if (!style.share) return
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
    const crosses = share > .5 && n(col * 1.7 + i, row * .3 - i) < style.cross
    const length = h * (share + (crosses ? style.past[0] + (style.past[1] - style.past[0]) * n(row + i * 2.1, col) : 0))
    const lean = (n(row, col + i) - .5) * width * .6, top = y + 1.5
    const box = { x0: at - width / 2 + Math.min(0, lean) - width * .03 - .5, y0: top, x1: at + width / 2 + Math.max(0, lean) + .5, y1: y + length }
    const streak: Streak = { box, stains: [], cores: [] }
    steps(streak.stains, at, top, length - 1.5, width, .55, lean)
    // The wettest line down the middle of a long streak, at Soaked: a third of its width, most of its length.
    if (style.core && share > .5) steps(streak.cores, at, top, (length - 1.5) * .9, width / 3, .5, lean * .9)
    out.push(streak)
  }
}

/**
 * A view's stains, each step of each streak a `fillRect`, as the panels' own tints are. Daylight redraws a
 * clipped patch over a cached frame and must match it exactly (jumpingExposureCorrection.dev.spec). Chrome
 * rounds translucent paths differently under that clip: one fill of every streak, slanted streaks, clusters of
 * streaks in one path and even single stepped paths all came out a level off somewhere, while rectangles
 * drawn with `fillRect` match. Separate rectangles add where they overlap, so streaks never overlap: a panel's
 * own take separate slots, and a streak that a longer one from the row above runs into is left out. That choice
 * looks only at streaks as laid, one row up, so it is the same from every view. A step meets the next edge to
 * edge; a core lies over its own streak, which the core's opacity allows for.
 */
export function stainLayer() {
  const streaks: Streak[] = []
  return {
    streaks,
    /** Draws the streaks that reach `view`; the rest were laid only for the choice of which give way. */
    fill(ctx: CanvasRenderingContext2D, wear: WallWear, stain: string, core: string, view: Box) {
      if (!wear.style.share || !streaks.length) return
      const left = new Set<Streak>()
      const order = [...streaks].sort((a, b) => a.box.x0 - b.box.x0)
      for (let k = 0; k < order.length; k++) {
        const a = order[k].box
        for (let j = k + 1; j < order.length && order[j].box.x0 <= a.x1; j++) {
          const b = order[j].box
          if (b.y0 > a.y1 || a.y0 > b.y1 || a.y0 === b.y0) continue
          left.add(a.y0 > b.y0 ? order[k] : order[j])
        }
      }
      const draw = (rects: readonly number[]) => { for (let i = 0; i < rects.length; i += 4) ctx.fillRect(rects[i], rects[i + 1], rects[i + 2], rects[i + 3]) }
      const kept = streaks.filter(streak => !left.has(streak) && streak.box.x1 > view.x0 && streak.box.x0 < view.x1 && streak.box.y1 > view.y0 && streak.box.y0 < view.y1)
      ctx.fillStyle = stain
      for (const streak of kept) draw(streak.stains)
      if (wear.style.core) { ctx.fillStyle = core; for (const streak of kept) draw(streak.cores) }
    },
  }
}

/** Pipe rust at this level: whether a joint weeps (from its own hash value) and how long its streak is. */
export const pipeRust = (wear: WallWear, value: number) => ({ weeps: value > 1 - wear.style.rust, length: wear.style.rustLength })
