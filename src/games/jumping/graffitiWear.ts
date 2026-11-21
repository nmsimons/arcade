import { ArtPath } from './webgl/artPath.ts'
import { blob, generator, hash, outline, overlaps, sliver, type Box } from './stampWear.ts'
import { wallWear, type StainLevel, type WallWear } from './wallWear.ts'

/**
 * How painted graffiti has aged (docs/jumping-wall-wear.md, Graffiti). Drips are how the paint went on, so every
 * piece has them; wear is the room's water and grime, so it follows the stain level as L.A.B. stamps do. `chipped`
 * is the share of the lettering's ink that has flaked away as chips, specks and scuffs; `fades` the faded patches
 * per character.
 */
interface GraffitiWearStyle { chipped: number; fades: number }
const STYLES: Record<StainLevel, GraffitiWearStyle | null> = {
  none: null,
  light: { chipped: .03, fades: 0 },
  heavy: { chipped: .065, fades: .06 },
}
/** Drips per character of lettering, before spacing and room below thin them out. */
const DRIPS_PER_CHARACTER = .5
const MOST_MARKS = 240
/** Thinned paint keeps these shares of its opacity: at a faded patch's edge, and in its core. */
export const GRAFFITI_FADED = .78, GRAFFITI_THINNEST = .55

export interface GraffitiMarks {
  /** Runs of paint below the lettering, in its colour, filled once (nonzero). */
  drips: ArtPath | null
  /** The area's rectangle with each flaked mark cut out, for an even-odd clip; null when the paint is fresh. */
  gone: ArtPath | null
  /**
   * Faded patches, thinning in two steps so their edge is soft without a gradient: `faded` is each patch's outer
   * ring (even-odd), `thinnest` its core, and `unfaded` the rectangle less the patches (even-odd). The three share
   * only their edges.
   */
  faded: ArtPath | null
  thinnest: ArtPath | null
  unfaded: ArtPath | null
}

/** Where the lettering's paint is, on a grid of `res` cells per world unit: 1 for ink. */
export interface InkGrid { width: number; height: number; res: number; ink: Uint8Array }
interface Lettering { w: number; h: number; fontSize: number; align: 'left' | 'center' | 'right'; lines: readonly string[]; baseline: number; font: string }

/** The scan is a few hundred thousand cells at most; small lettering is scanned finer, so thin strokes still register. */
const MOST_SCAN_CELLS = 1_200_000
/**
 * The lettering's ink, drawn once at its own resolution on a scratch canvas, read back and dropped: never the game
 * canvas. Null outside a browser (unit tests), where graffiti gets wear but no drips.
 */
export function scanInk(lettering: Lettering, lineHeight: number): InkGrid | null {
  if (typeof document === 'undefined') return null
  let res = Math.min(4, Math.max(.5, 48 / lettering.fontSize))
  res = Math.min(res, Math.sqrt(MOST_SCAN_CELLS / Math.max(1, lettering.w * lettering.h)))
  const width = Math.ceil(lettering.w * res), height = Math.ceil(lettering.h * res)
  if (!(width > 0 && height > 0)) return null
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.font = `400 ${lettering.fontSize * res}px ${lettering.font}`
  ctx.textAlign = lettering.align; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#000'
  const x = lettering.align === 'center' ? lettering.w / 2 : lettering.align === 'right' ? lettering.w : 0
  for (let i = 0; i < lettering.lines.length && i * lineHeight < lettering.h; i++)
    ctx.fillText(lettering.lines[i], x * res, (i * lineHeight + lettering.baseline) * res)
  const pixels = ctx.getImageData(0, 0, width, height).data, ink = new Uint8Array(width * height)
  for (let i = 0; i < ink.length; i++) ink[i] = pixels[i * 4 + 3] > 110 ? 1 : 0
  canvas.width = canvas.height = 0
  return { width, height, res, ink }
}

const cache = new Map<string, GraffitiMarks>()
export function clearGraffitiMarks() { cache.clear() }

/**
 * A graffiti area's drips and wear, w × h with its top-left at the origin, in the area's own (rotated) frame.
 * Random per piece, from the level's ID and the piece's place, size and words, so it is the same on every visit;
 * moving, resizing or rewording it reshuffles them.
 *
 * Drips hang from the lowest points of strokes, wherever open wall lies below, and run down the wall, not down
 * the lettering: a tilted piece's drips stay upright. A drip stops short of the next stroke below it, so it
 * never runs into another line. Worn marks are laid on the ink and clear of one another, so the even-odd clip
 * removes each exactly once.
 */
export function graffitiMarks(text: { x: number; y: number; w: number; h: number; text: string; rotation?: number }, lettering: Lettering,
  lineHeight: number, wear: WallWear = wallWear(), scan: (lettering: Lettering, lineHeight: number) => InkGrid | null = scanInk): GraffitiMarks {
  const { w, h, fontSize: fs } = lettering
  const key = [wear.stains, wear.salt[0], wear.salt[1], Math.round(text.x), Math.round(text.y), Math.round(w), Math.round(h),
    fs, lettering.align, Math.round(lettering.baseline * 4) / 4, text.rotation ?? 0, lettering.font, lettering.lines.join('\n')].join(':')
  const cached = cache.get(key)
  if (cached) return cached
  const random = generator(hash(key))
  const grid = scan(lettering, lineHeight)
  const characters = Math.max(1, lettering.lines.join('').replace(/\s/g, '').length)
  // Down the wall, in the area's frame: a piece turned clockwise by θ sees the wall's down at (sin θ, cos θ).
  const angle = (text.rotation ?? 0) * Math.PI / 180, down = { x: Math.sin(angle), y: Math.cos(angle) }
  const drips = grid ? hangDrips(grid, random, fs, characters, down) : null

  const style = STYLES[wear.stains]
  let gone: ArtPath | null = null, faded: ArtPath | null = null, thinnest: ArtPath | null = null, unfaded: ArtPath | null = null
  if (style) {
    // A point on the paint: a random inked cell, or, with no scan, somewhere along a line of lettering.
    const inked: number[] = []
    if (grid) for (let i = 0; i < grid.ink.length; i++) if (grid.ink[i]) inked.push(i)
    const place = () => {
      if (grid) {
        if (!inked.length) return null
        const i = inked[Math.floor(random() * inked.length)]
        return { x: (i % grid.width + random()) / grid.res, y: (Math.floor(i / grid.width) + random()) / grid.res }
      }
      const rows = Math.max(1, Math.min(lettering.lines.length, Math.floor(h / lineHeight)))
      const row = Math.floor(random() * rows)
      return { x: w * (.1 + .8 * random()), y: Math.min(h, row * lineHeight + lettering.baseline - fs * .55 * random()) }
    }
    const inkArea = grid ? inked.length / grid.res ** 2 : characters * fs * fs * .12
    const marks: { points: number[]; box: Box }[] = [], taken: Box[] = []
    // Flaking gathers where the wall was knocked or wiped most: one or two places on the piece.
    const centres = Array.from({ length: 1 + Math.floor(random() * 2) }, () => place() ?? { x: w / 2, y: h / 2 })
    const spread = Math.max(w, h) * .4
    const likely = (x: number, y: number) => .25 + .75 * Math.max(...centres.map(c => Math.exp(-((x - c.x) ** 2 + (y - c.y) ** 2) / (2 * spread ** 2))))
    let budget = inkArea * style.chipped
    for (let attempt = 0; budget > 0 && attempt < MOST_MARKS * 6 && marks.length < MOST_MARKS; attempt++) {
      const at = place()
      if (!at || random() > likely(at.x, at.y)) continue
      const kind = random()
      // Chips and specks about as often, now and then a scuff rubbed along the line. Even small lettering keeps
      // marks big enough to see; the budget keeps them few there.
      const mark = kind < .15 ? sliver(random, at.x, at.y, fs * (.45 + .5 * random()), Math.max(.7, fs * (.025 + .02 * random())), (random() - .5) * .4)
        : kind < .55 ? blob(random, at.x, at.y, Math.max(1.1, fs * (.035 + .05 * random())), .5 + .5 * random(), random() * Math.PI)
          : blob(random, at.x, at.y, Math.max(.6, fs * (.012 + .018 * random())), .6 + .4 * random(), random() * Math.PI)
      if (overlaps(mark.box, taken, Math.max(.4, fs * .01))) continue
      marks.push(mark); taken.push(mark.box)
      budget -= (mark.box.x1 - mark.box.x0) * (mark.box.y1 - mark.box.y0) * .55
    }
    if (marks.length) {
      gone = new ArtPath(); gone.rect(0, 0, w, h)
      for (const mark of marks) outline(gone, mark.points)
    }
    const patches: { points: number[]; core: number[] }[] = [], patchBoxes: Box[] = []
    const wanted = style.fades ? Math.max(1, Math.round(characters * style.fades)) : 0
    for (let attempt = 0; patches.length < wanted && attempt < wanted * 6 + 10; attempt++) {
      const at = place()
      if (!at) break
      const patch = blob(random, at.x, at.y, fs * (.4 + .45 * random()), .45 + .35 * random(), (random() - .5) * .6)
      if (overlaps(patch.box, patchBoxes, fs * .3)) continue
      // Its core: the same outline drawn in toward its centre, which it surrounds, so the core lies inside it.
      const core = patch.points.map((v, i) => i % 2 ? at.y + (v - at.y) * .55 : at.x + (v - at.x) * .55)
      patches.push({ points: patch.points, core }); patchBoxes.push(patch.box)
    }
    if (patches.length) {
      faded = new ArtPath(); thinnest = new ArtPath(); unfaded = new ArtPath(); unfaded.rect(0, 0, w, h)
      for (const { points, core } of patches) { outline(faded, points); outline(faded, core); outline(thinnest, core); outline(unfaded, points) }
    }
  }
  const marks = { drips, gone, faded, thinnest, unfaded }
  if (cache.size > 256) cache.clear()
  cache.set(key, marks)
  return marks
}

/**
 * Drips from the lowest points of strokes. A site is an inked cell with open wall just below it (along `down`),
 * at least as low as any edge of the same stroke beside it, with paint enough above it to have run. Sites are
 * taken in a random order, spaced apart, each drip as long as a skewed draw allows and stopping short of the
 * next ink or the area's edge below.
 */
function hangDrips(grid: InkGrid, random: () => number, fs: number, characters: number, down: { x: number; y: number }) {
  const { width, height, res, ink } = grid
  const inkAt = (x: number, y: number) => {
    const cx = Math.floor(x), cy = Math.floor(y)
    return cx >= 0 && cy >= 0 && cx < width && cy < height && ink[cy * width + cx] === 1
  }
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height
  const across = { x: down.y, y: -down.x }
  // How far open wall runs below a point, in cells, up to `most`.
  const open = (x: number, y: number, most: number) => {
    let d = 1
    while (d <= most && inside(x + down.x * d, y + down.y * d) && !inkAt(x + down.x * d, y + down.y * d)) d++
    return d - 1
  }
  const minimumOpen = fs * .2 * res, minimumPaint = Math.max(2, fs * .05 * res)
  interface Site { x: number; y: number; u: number; v: number; room: number }
  const edges: Site[] = []
  for (let cy = 0; cy < height; cy++) for (let cx = 0; cx < width; cx++) {
    if (!ink[cy * width + cx]) continue
    const x = cx + .5, y = cy + .5
    if (inkAt(x + down.x * 1.2, y + down.y * 1.2)) continue
    let paint = 1
    while (paint < minimumPaint && inkAt(x - down.x * paint, y - down.y * paint)) paint++
    if (paint < minimumPaint) continue
    const room = open(x, y, Math.ceil(fs * 1.4 * res))
    if (room < minimumOpen) continue
    edges.push({ x, y, u: x * across.x + y * across.y, v: x * down.x + y * down.y, room })
  }
  // The lowest edge of its stroke: nothing near it, beside it on the same stroke, hangs lower.
  const reach = fs * .2 * res, rise = fs * .5 * res
  const buckets = new Map<number, Site[]>()
  for (const e of edges) { const b = Math.floor(e.u / reach); (buckets.get(b) ?? buckets.set(b, []).get(b)!).push(e) }
  const lowest = edges.filter(e => {
    const b = Math.floor(e.u / reach)
    for (let k = b - 1; k <= b + 1; k++) for (const o of buckets.get(k) ?? [])
      if (Math.abs(o.u - e.u) < reach && o.v > e.v + .5 && o.v - e.v < rise) return false
    return true
  })
  // Random order, spaced along the line, at most about one per few characters.
  for (let i = lowest.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [lowest[i], lowest[j]] = [lowest[j], lowest[i]] }
  const wanted = Math.max(1, Math.round(characters * DRIPS_PER_CHARACTER)), spacing = fs * .45 * res
  const chosen: Site[] = []
  for (const site of lowest) {
    if (chosen.length >= wanted) break
    if (chosen.some(c => Math.abs(c.u - site.u) < spacing && Math.abs(c.v - site.v) < fs * .8 * res)) continue
    chosen.push(site)
  }
  if (!chosen.length) return null
  const path = new ArtPath()
  for (const site of chosen) {
    // Into world units, in the area's frame.
    const x = site.x / res, y = site.y / res, room = site.room / res
    const thin = Math.max(1, fs * (.045 + .035 * random()))
    const length = Math.min(room - fs * .06, fs * (.16 + .95 * random() ** 1.7))
    if (length < fs * .1) continue
    drip(path, x, y, thin, length, down, fs)
  }
  return path.commands.length ? path : null
}

/**
 * One drip: a neck where it leaves the stroke, a run narrowing a little down the wall, and a bead where the paint
 * gathered at its end. Its top sits inside the stroke, so it always joins the lettering. Drawn as one outline and
 * the bead, both turning the same way, so a single nonzero fill covers their overlap once.
 */
function drip(path: ArtPath, x: number, y: number, thin: number, length: number, down: { x: number; y: number }, fs: number) {
  const across = { x: down.y, y: -down.x }
  // u across the drip, v down the wall from the stroke's lower edge.
  const at = (u: number, v: number) => [x - across.x * u + down.x * v, y - across.y * u + down.y * v] as const
  const top = -Math.min(fs * .06, thin * 1.6), neck = thin * 1.8, bead = thin * .72
  const end = length - bead, waist = thin * .4
  path.moveTo(...at(-thin * 1.25, top))
  path.lineTo(...at(-thin * 1.25, 0))
  path.quadraticCurveTo(...at(-thin / 2, 0), ...at(-thin / 2, neck))
  path.lineTo(...at(-waist, end))
  path.lineTo(...at(waist, end))
  path.lineTo(...at(thin / 2, neck))
  path.quadraticCurveTo(...at(thin / 2, 0), ...at(thin * 1.25, 0))
  path.lineTo(...at(thin * 1.25, top))
  path.closePath()
  const [bx, by] = at(0, end)
  path.moveTo(bx + bead, by)
  path.arc(bx, by, bead, 0, Math.PI * 2, outlineTurnsAnticlockwise(at))
  path.closePath()
}
/** Whether the drip's outline, mapped through `at`, turns anticlockwise on screen (y down), so its bead can match. */
function outlineTurnsAnticlockwise(at: (u: number, v: number) => readonly [number, number]) {
  const square = [at(-1, 0), at(-1, 1), at(1, 1), at(1, 0)]
  let area = 0
  for (let i = 0; i < 4; i++) { const [x0, y0] = square[i], [x1, y1] = square[(i + 1) % 4]; area += x0 * y1 - x1 * y0 }
  return area < 0
}
