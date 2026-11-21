import type { LabStampWear } from '../../branding/lab.ts'
import { ArtPath } from './webgl/artPath.ts'
import { wallWear, type StainLevel, type WallWear } from './wallWear.ts'

/**
 * How worn an L.A.B. wall stamp's ink is, by the room's stain level (docs/jumping-wall-wear.md, What the setting
 * covers). Counts are for a stamp of the default size; a bigger stamp gets proportionally more. `size` scales
 * every mark. A spotless room keeps the stamp crisp.
 */
interface StampWearStyle { chips: number; specks: number; scuffs: number; fades: number; size: number }
const STYLES: Record<StainLevel, StampWearStyle | null> = {
  none: null,
  light: { chips: 4, specks: 10, scuffs: 1, fades: 0, size: .8 },
  heavy: { chips: 8, specks: 22, scuffs: 2, fades: 1, size: 1 },
}
/** A default 240 × 110 stamp, in logo units (a hundredth of the logo's width). */
const REFERENCE_AREA = 6800
const MOST_MARKS = 240

export interface Box { x0: number; y0: number; x1: number; y1: number }
export const overlaps = (a: Box, list: readonly Box[], gap: number) =>
  list.some(b => a.x0 < b.x1 + gap && b.x0 < a.x1 + gap && a.y0 < b.y1 + gap && b.y0 < a.y1 + gap)

/** A small seeded generator (mulberry32), so a stamp wears the same on every visit. */
export function generator(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
export function hash(text: string) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

/** An irregular blob's outline: a rough, squashed polygon around its centre, and its bounds. */
export function blob(random: () => number, cx: number, cy: number, r: number, aspect: number, turn: number) {
  const corners = 7 + Math.floor(random() * 4), points: number[] = []
  const c = Math.cos(turn), s = Math.sin(turn)
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (let i = 0; i < corners; i++) {
    const angle = (i + (random() - .5) * .6) / corners * Math.PI * 2, reach = r * (.55 + .45 * random())
    const lx = Math.cos(angle) * reach, ly = Math.sin(angle) * reach * aspect
    const x = cx + lx * c - ly * s, y = cy + lx * s + ly * c
    points.push(x, y)
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y)
  }
  return { points, box: { x0, y0, x1, y1 } }
}
/** A scuff: a thin sliver rubbed off across the ink, tapering at both ends. */
export function sliver(random: () => number, cx: number, cy: number, length: number, thickness: number, turn: number) {
  const c = Math.cos(turn), s = Math.sin(turn), steps = 6, top: number[] = [], bottom: number[] = []
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  const at = (along: number, across: number, out: number[]) => {
    const x = cx + along * c - across * s, y = cy + along * s + across * c
    out.push(x, y)
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y)
  }
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, half = Math.sin(Math.PI * t) * thickness / 2 * (.7 + .3 * random())
    at((t - .5) * length, -half, top)
    at((t - .5) * length, half, bottom)
  }
  const points = [...top]
  for (let i = bottom.length - 2; i >= 0; i -= 2) points.push(bottom[i], bottom[i + 1])
  return { points, box: { x0, y0, x1, y1 } }
}
export function outline(path: ArtPath, points: readonly number[]) {
  path.moveTo(points[0], points[1])
  for (let i = 2; i < points.length; i += 2) path.lineTo(points[i], points[i + 1])
  path.closePath()
}

const cache = new Map<string, LabStampWear | null>()
/**
 * Worn ink on an L.A.B. wall stamp, w × h with its top-left at the origin: chips and specks of paint gone, a few
 * scuffs rubbed across it and, from Normal up, faded patches where the ink has thinned. Random per stamp, from
 * the level's ID and the stamp's place and size, so it is the same on every visit; heavier stain levels wear it
 * more. None at stain level None.
 *
 * Every mark is laid clear of the others, so the even-odd clip `gone` (the stamp's rectangle with each mark cut
 * out) removes each one exactly once; `unfaded` is the rectangle less the faded patches, and `faded` the
 * patches alone.
 */
export function labStampWear(stamp: { x: number; y: number; w: number; h: number }, wear: WallWear = wallWear()): LabStampWear | null {
  const style = STYLES[wear.stains]
  if (!style) return null
  const { w, h } = stamp
  const key = `${wear.stains}:${wear.salt[0]}:${wear.salt[1]}:${Math.round(stamp.x)}:${Math.round(stamp.y)}:${Math.round(w)}:${Math.round(h)}`
  if (cache.has(key)) return cache.get(key)!
  const random = generator(hash(key))
  // The logo's own size, as drawLabStamp fits it: marks scale with the lettering, not the area around it.
  const logo = Math.min(w * .82, h * .72 * 876 / 318), unit = logo / 100 * style.size
  const logoBox = { x0: (w - logo) / 2, y0: (h - logo * 318 / 876) / 2, x1: (w + logo) / 2, y1: (h + logo * 318 / 876) / 2 }
  const scale = Math.min(4, w * h / (logo / 100) ** 2 / REFERENCE_AREA)
  // Wear gathers: where the stamp was knocked or wiped most, around one or two places on it.
  const centres = Array.from({ length: 1 + Math.floor(random() * 2) }, () => ({ x: w * random(), y: h * random() }))
  const spread = Math.max(w, h) * .35
  const likely = (x: number, y: number) => .3 + .7 * Math.max(...centres.map(c => Math.exp(-((x - c.x) ** 2 + (y - c.y) ** 2) / (2 * spread ** 2))))
  // Most marks land on the lettering; the rest on the border, where the ink is too.
  const place = () => {
    if (random() < .75) return { x: logoBox.x0 + random() * (logoBox.x1 - logoBox.x0), y: logoBox.y0 + random() * (logoBox.y1 - logoBox.y0) }
    const edge = Math.min(w, h) * .035, side = Math.floor(random() * 4), along = random()
    return side === 0 ? { x: along * w, y: edge / 2 } : side === 1 ? { x: along * w, y: h - edge / 2 }
      : side === 2 ? { x: edge / 2, y: along * h } : { x: w - edge / 2, y: along * h }
  }

  const marks: { points: number[]; box: Box }[] = [], taken: Box[] = []
  const lay = (count: number, make: (x: number, y: number) => { points: number[]; box: Box }) => {
    let laid = 0
    for (let attempt = 0; laid < count && attempt < count * 8 && marks.length < MOST_MARKS; attempt++) {
      const { x, y } = place()
      if (random() > likely(x, y)) continue
      const mark = make(x, y)
      if (overlaps(mark.box, taken, unit * .3)) continue
      marks.push(mark); taken.push(mark.box); laid++
    }
  }
  const count = (n: number) => Math.round(n * scale)
  lay(count(style.chips), (x, y) => blob(random, x, y, unit * (1.6 + 2.6 * random()), .55 + .45 * random(), random() * Math.PI))
  lay(count(style.scuffs), (x, y) => sliver(random, x, y, unit * (10 + 14 * random()), unit * (.5 + .7 * random()), (random() - .5) * .5))
  lay(count(style.specks), (x, y) => blob(random, x, y, unit * (.45 + .8 * random()), .6 + .4 * random(), random() * Math.PI))

  const gone = new ArtPath()
  gone.rect(0, 0, w, h)
  for (const mark of marks) outline(gone, mark.points)

  // Faded patches: large, soft-edged shapes where the ink has thinned rather than gone, clear of one another.
  const patches: number[][] = [], patchBoxes: Box[] = []
  for (let attempt = 0; patches.length < count(style.fades) && attempt < 20; attempt++) {
    const { x, y } = place()
    const patch = blob(random, x, y, unit * (9 + 9 * random()), .45 + .4 * random(), (random() - .5) * .8)
    if (overlaps(patch.box, patchBoxes, unit)) continue
    patches.push(patch.points); patchBoxes.push(patch.box)
  }
  let faded: ArtPath | null = null, unfaded: ArtPath | null = null
  if (patches.length) {
    faded = new ArtPath(); unfaded = new ArtPath()
    unfaded.rect(0, 0, w, h)
    for (const points of patches) { outline(faded, points); outline(unfaded, points) }
  }
  const result = { gone, faded, unfaded }
  if (cache.size > 256) cache.clear()
  cache.set(key, result)
  return result
}
