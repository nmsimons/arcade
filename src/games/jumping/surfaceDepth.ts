import { levelHeight, type JumpLevel } from './level.ts'
import type { Platform } from './model.ts'
import { polygonPoints } from './geometry.ts'
import { bezierKey } from './terrainCurves.ts'
import { terrainBoundary } from './lightingBoundary.ts'
import { terrainDrawOrder } from './terrainOrder.ts'
import { ArtPath } from './webgl/artPath.ts'
import { STAIN_CORE_OPACITY, panelStains, stainLayer, stainOpacity, wallWear, type WallWear } from './wallWear.ts'
import { panelGrid, wallPanels } from './wallFinish.ts'

interface WallView { x: number; y: number; w: number; h: number }
const noise = (x: number, y: number) => {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return n - Math.floor(n)
}

/**
 * World-anchored precast panels, stained as the room's `wear` says. Decorative hardware belongs to authored art.
 * The panels are the course wall's grid (wallFinish.ts), which `panelAt` reads too.
 */
export function drawWallPanels(ctx: CanvasRenderingContext2D, view: WallView, wear: WallWear = wallWear()) {
  if (view.w <= 0 || view.h <= 0) return
  const grid = panelGrid('course'), { w, h } = grid
  ctx.save()
  // A cropped replay can use a larger scratch canvas. Translucent panels
  // must never accumulate beyond the part of the wall being repainted.
  ctx.beginPath(); ctx.rect(view.x, view.y, view.w, view.h); ctx.clip()
  // Each panel's tint differs, so tints are separate fills; the edge lines share
  // two strokes, one per colour, instead of two per panel. Fills never cover a
  // line, so only the few pixels where neighbouring panels' lines meet can differ.
  const shade = new ArtPath(), sheen = new ArtPath(), stains = stainLayer()
  // Stains start two rows above the view: a heavy room's long streaks run on past the joint into the next
  // row, and whether a streak gives way to one from the row above looks at that row too.
  for (const { x, y, col, row } of wallPanels(grid, { ...view, y: view.y - h * 2, h: view.h + h * 2 })) {
    if (y + h > view.y) {
      ctx.fillStyle = `rgba(91,111,94,${.012 + noise(col, row) * .022})`
      ctx.fillRect(x + 1, y + 1, w - 2, h - 2)
      shade.moveTo(x, y + h); shade.lineTo(x, y); shade.lineTo(x + w, y)
      sheen.moveTo(x + 1.4, y + h); sheen.lineTo(x + 1.4, y + 1.4); sheen.lineTo(x + w, y + 1.4)
    }
    panelStains(stains.streaks, x, y, w, h, col, row, wear)
  }
  stains.fill(ctx, wear, `rgba(74,78,62,${stainOpacity(wear, .075)})`, `rgba(74,78,62,${STAIN_CORE_OPACITY})`, { x0: view.x, y0: view.y, x1: view.x + view.w, y1: view.y + view.h })
  ctx.strokeStyle = '#52635421'; ctx.lineWidth = 1.1; ctx.stroke(shade)
  ctx.strokeStyle = '#ffffff91'; ctx.lineWidth = .8; ctx.stroke(sheen)
  ctx.restore()
}

type Point = readonly [number, number]
interface Box { x0: number; y0: number; x1: number; y1: number }
const boxOf = (points: readonly Point[]): Box => ({ x0: Math.min(...points.map(p => p[0])), y0: Math.min(...points.map(p => p[1])),
  x1: Math.max(...points.map(p => p[0])), y1: Math.max(...points.map(p => p[1])) })
const overlaps = (a: Box, b: Box) => a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1

/** The part of `subject` inside the convex polygon `convex` (Sutherland–Hodgman). */
export function insideConvex(subject: readonly Point[], convex: readonly Point[]): Point[] {
  let area = 0
  for (let i = 0; i < convex.length; i++) { const a = convex[i], b = convex[(i + 1) % convex.length]; area += a[0] * b[1] - b[0] * a[1] }
  const turn = Math.sign(area)
  if (!turn) return []
  let output: Point[] = [...subject]
  for (let i = 0; i < convex.length && output.length; i++) {
    const a = convex[i], b = convex[(i + 1) % convex.length]
    const side = (p: Point) => turn * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]))
    const input = output; output = []
    for (let j = 0; j < input.length; j++) {
      const p = input[j], q = input[(j + 1) % input.length], sp = side(p), sq = side(q)
      if (sp >= 0) output.push(p)
      if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); output.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]) }
    }
  }
  return output
}

/** Wear marks, by what each material does with age. Each mark is its own fill (see `relief`). */
const WEAR = {
  crack: 'rgba(46,48,38,.3)', chalkCrack: 'rgba(78,84,72,.34)', pits: 'rgba(40,44,38,.3)',
  rust: 'rgba(150,84,44,.26)', rustCore: 'rgba(104,54,30,.42)',
  soilDark: 'rgba(96,76,54,.11)', soilLight: 'rgba(255,246,226,.13)', pebble: 'rgba(126,126,120,.6)',
} as const
type WearStyle = typeof WEAR[keyof typeof WEAR]
interface Mark { style: WearStyle; path: Path2D; box: Box }
interface Relief { key: string; light: Path2D; dark: Path2D; low: Mark[]; high: Mark[]; chips: Path2D }
const reliefs = new WeakMap<object, Relief>()
const inPolygon = (points: readonly Point[], x: number, y: number) => {
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [ax, ay] = points[i], [bx, by] = points[j]
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside
  }
  return inside
}
function relief(platforms: readonly Platform[], level: JumpLevel): Relief {
  // Editor geometry can be edited in place. Appearance caches never own or
  // change the platforms, and invalidate for local outline edits as well.
  const key = platforms.map(b => `${b.x},${b.y},${b.w},${b.h},${b.material ?? ''},${b.zIndex ?? ''}:${b.polygon?.flat() ?? b.profile?.flat() ?? ''}:${bezierKey(b)}`).join(';')
  const cached = reliefs.get(level)
  if (cached?.key === key) return cached
  // Marks under others (rust blooms, soil patches), then marks over them (cracks, pits, pebbles, rust cores).
  const light = new ArtPath(), dark = new ArtPath(), low: Mark[] = [], high: Mark[] = [], chips = new ArtPath()
  const shapes = platforms.map(shape => polygonPoints(shape) as Point[]), boxes = shapes.map(boxOf)
  const bottom = levelHeight(level)
  /** Add `piece` to `path`, trimmed to the terrain under it. */
  const inTerrain = (path: ArtPath, piece: Point[]) => {
    const bounds = boxOf(piece)
    shapes.forEach((shape, i) => {
      if (!overlaps(bounds, boxes[i])) return
      const part = insideConvex(shape, piece)
      if (part.length < 3) return
      part.forEach(([x, y], k) => k ? path.lineTo(x, y) : path.moveTo(x, y)); path.closePath()
    })
  }
  /** Each mark's bounds, so a frame can leave out the marks it cannot see. */
  const bounds = new Map<ArtPath, Box>()
  const rect = (path: ArtPath, x: number, y: number, w: number, h: number) => {
    inTerrain(path, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]])
    const box = bounds.get(path)
    if (box) { box.x0 = Math.min(box.x0, x); box.y0 = Math.min(box.y0, y); box.x1 = Math.max(box.x1, x + w); box.y1 = Math.max(box.y1, y + h) }
  }
  const mark = (list: Mark[], style: WearStyle) => {
    const path = new ArtPath(), box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
    bounds.set(path, box); list.push({ style, path, box }); return path
  }
  const within = (i: number, x: number, y: number) => x >= boxes[i].x0 && x <= boxes[i].x1 && y >= boxes[i].y0 && y <= boxes[i].y1 && inPolygon(shapes[i], x, y)
  // The authored pieces come first, in the order drawTerrain lays them; the enclosing rock after them.
  const order = terrainDrawOrder(level.platforms), front = [...order].reverse()
  for (let i = order.length; i < platforms.length; i++) front.push(i)
  /** The material showing at a point: the frontmost piece's there (stone if it names none), or none in the air. */
  const materialAt = (x: number, y: number) => {
    const i = front.find(i => within(i, x, y))
    return i === undefined ? undefined : platforms[i].material ?? 'stone'
  }
  /** Whether a box shows one material throughout, clear of any outline, so a mark there is never trimmed to
   * a slant or laid across another piece in front. */
  const solid = (material: string, x0: number, y0: number, x1: number, y1: number) =>
    [[x0, y0], [x1, y0], [x0, y1], [x1, y1], [(x0 + x1) / 2, (y0 + y1) / 2]].every(([x, y]) => materialAt(x, y) === material)

  /** A hairline crack: short upright and level steps, leaning one way, thinning as it goes, now and then a spur. */
  const crack = (style: WearStyle, x: number, y: number, reach: number, lean: number, weight: number, spurs: number) => {
    const path = mark(high, style)
    let cx = x, cy = y, k = 0
    while (cy < y + reach) {
      const t = weight * (.5 + .6 * (1 - (cy - y) / reach))
      const down = 1.4 + noise(cx * 1.7, cy) * 3, across = (noise(cy, cx * 2.3) - .25) * 2.4 * lean
      rect(path, cx - t / 2, cy, t, down + t / 2)
      cy += down
      if (Math.abs(across) > .3) rect(path, Math.min(cx, cx + across) - t / 2, cy - t / 2, Math.abs(across) + t, t)
      cx += across
      if (++k % 3 === 0 && noise(cx, cy * .7) < spurs) {
        // A spur splits off the other way and turns down.
        const spur = 3 + noise(cy, cx) * 5, end = lean > 0 ? cx - spur : cx + spur
        rect(path, Math.min(cx, end), cy, spur, t * .8)
        rect(path, end - t * .4, cy, t * .8, 2 + spur * .4)
      }
    }
  }
  /** A stepped blotch hanging from `y`: widest at the top, narrowing in two steps. */
  const blotch = (path: ArtPath, x: number, y: number, span: number, deep: number, seed: number) => {
    for (const [left, wide, depth] of [[-.5, 1, .3 + noise(x, y) * .2], [-.36 + noise(y, seed) * .2, .62, .6 + noise(x * 2, y) * .2], [-.2 + noise(seed, x) * .25, .3, 1]])
      rect(path, x + span * left, y, span * wide, deep * depth)
  }
  /** A few small specks scattered over a box, most near its top: pits, pebbles or rust cores. */
  const specks = (path: ArtPath, x: number, y: number, w: number, h: number, count: number, size: number) => {
    for (let i = 0; i < count; i++) {
      const u = noise(x + i * 3.7, y - i * 1.3), v = noise(y + i * 2.9, x + i), s = size * (.6 + noise(i, x + y) * .8)
      rect(path, x + u * Math.max(0, w - s), y + v * v * Math.max(0, h - s), s, s * (.6 + .5 * noise(x, i)))
    }
  }

  // The union boundary omits internal seams and retains real gaps and slopes.
  for (const [a, b] of terrainBoundary(platforms)) {
    const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy)
    if (!length) continue
    const nx = dy / length, ny = -dx / length
    const lit = nx * -.55 + ny * -.83 > 0, depth = lit ? 2 : 3
    // A strip running past an inner corner would show outside the rock. Trim it
    // to the terrain here, once, rather than clip to the whole silhouette every
    // frame: that clip cost a screen-sized mask. Terrain shapes all wind the same
    // way, so the trimmed pieces cover exactly what the clip let through.
    inTerrain(lit ? light : dark, [a, b, [b[0] - nx * depth, b[1] - ny * depth], [a[0] - nx * depth, a[1] - ny * depth]])
    // Wear along an exposed top, where feet land and loads bear, in the way the material ages: stone and
    // chalk crack and chip, steel rusts, and earth shows pebbles and crumbles. Wear, not water: nothing runs
    // straight down like a drip.
    // Only the part of an edge inside the level: the enclosing floor runs far past both sides of it, and
    // the enclosing ceiling's top lies far above it.
    // Daylight redraws only a clipped patch around moving actors over a cached frame, and the patch must
    // match the frame exactly (jumpingExposureCorrection.dev.spec). A clip changes how Chrome rounds a
    // translucent path's coverage: along a slanted edge it cuts, and across a long path of many marks.
    // So the marks have upright and level edges only (a crack wanders in steps), and each mark is its own
    // path. The chips, tiny notches, match only as one path, and only while they stay few: adding pits to
    // it broke the match. Check that spec after changing how any of them is split.
    const from = dx ? Math.max(0, (-a[0]) / dx * length) : 0, to = dx ? Math.min(length, (level.width - a[0]) / dx * length) : length
    const inside = Math.max(a[1], b[1]) >= 0 && Math.min(a[1], b[1]) <= bottom
    if (!(ny < -.6 && inside && to - from > 6)) continue
    for (let at = from + 4 + noise(a[0], a[1]) * 10; at < to - 3; at += 16 + noise(at, a[0]) * 22) {
      const x = a[0] + dx / length * at, y = a[1] + dy / length * at, seed = noise(x * .37, y * .53)
      const material = materialAt(x - nx * 2, y - ny * 2), lean = noise(y, x) < .5 ? -1 : 1
      /** The edge's lower end across a span around `x`, so a mark under it starts below the slope. */
      const below = (span: number) => Math.max(y + dy / dx * -span / 2, y + dy / dx * span / 2)
      /** A small notch knocked out under the edge. */
      const chip = (deep: number) => { const wide = 1.5 + noise(x, y * 2) * 3.5; rect(chips, x, Math.min(y, y + dy / length * wide), wide, deep) }
      if (material === 'steel') {
        // Rust gathers along the top where the coating wears through: a stepped bloom with darker cores.
        if (seed < .32) {
          const span = 6 + noise(x, y * 2) * 16, top = below(span) + .4, deep = 2.5 + noise(y * 2, x) * 7
          blotch(mark(low, WEAR.rust), x, top, span, deep, seed)
          specks(mark(high, WEAR.rustCore), x - span * .4, top + .3, span * .8, deep * .7, 2 + Math.floor(noise(x, x) * 4), 1.3)
        }
      } else if (material === 'earth') {
        // Earth shows what it is made of: pebbles near the surface, and an edge that crumbles.
        if (seed < .34) specks(mark(high, WEAR.pebble), x - 6, below(12) + 1.5, 12, 7, 1 + Math.floor(noise(x, y) * 3), 2.6)
        else if (seed > .78) chip(.8 + noise(y, x * 2) * 1.6)
      } else {
        // Stone and chalk crack from the edge and chip; chalk, softer, cracks finer and more often.
        const chalk = material === 'chalk'
        if (seed < (chalk ? .26 : .15)) {
          const reach = 9 + noise(x, y * 3) * 14 + (seed < .04 ? 18 + noise(x, x) * 24 : 0)
          crack(chalk ? WEAR.chalkCrack : WEAR.crack, x, below(2) + .5, reach, lean, chalk ? .8 : 1, chalk ? .55 : .35)
        } else if (!chalk && seed < .24) {
          const span = 6 + noise(x, y * 2) * 10
          specks(mark(high, WEAR.pits), x - span / 2, below(span) + 1, span, 9, 3 + Math.floor(noise(y * 2, x) * 5), 1.4)
        } else if (seed > (chalk ? .8 : .86)) chip(.8 + noise(y, x * 2) * 1.4)
      }
    }
  }

  // Wear across a face, on a world-anchored grid so a piece keeps its marks when another moves. Only inside
  // the level, and only where the whole mark clears the outline.
  const CELL = 100
  for (let row = 0; row * CELL < bottom; row++) for (let col = 0; col * CELL < level.width; col++) {
    const seed = noise(col * 1.93 + 7.1, row * 2.71 - 3.3)
    const x = (col + .15 + .7 * noise(col, row * 1.7)) * CELL, y = (row + .15 + .7 * noise(row * 1.3, col)) * CELL
    if (x > level.width || y > bottom) continue
    const material = materialAt(x, y), lean = noise(x, y) < .5 ? -1 : 1
    if (material === 'steel') {
      // Now and then a rust spot where the coating has failed.
      if (seed < .2) {
        const span = 5 + noise(y, x) * 10, deep = 3 + noise(x, y * 2) * 6
        if (!solid(material, x - span / 2, y, x + span / 2, y + deep)) continue
        blotch(mark(low, WEAR.rust), x, y, span, deep, seed)
        specks(mark(high, WEAR.rustCore), x - span * .35, y + .3, span * .7, deep * .6, 1 + Math.floor(noise(x, x) * 3), 1.2)
      }
    } else if (material === 'earth') {
      // Soil varies: darker and paler patches of it, and pebbles through it.
      if (seed < .32) {
        const span = 16 + noise(y, x) * 34, deep = 6 + noise(x, y * 2) * 14
        if (solid(material, x - span / 2, y, x + span / 2, y + deep)) blotch(mark(low, seed < .17 ? WEAR.soilDark : WEAR.soilLight), x, y, span, deep, seed)
      }
      const px = x + (noise(y, col) - .5) * 60, py = y + (noise(row, x) - .5) * 60
      if (noise(px, py) < .25 && solid(material, px - 8, py, px + 8, py + 8)) specks(mark(high, WEAR.pebble), px - 8, py, 16, 8, 1 + Math.floor(noise(py, px) * 3), 2.6)
    } else if (material) {
      // A long hairline crack across the face; chalk is crazed with more of them, branching more.
      const chalk = material === 'chalk'
      if (seed < (chalk ? .6 : .16)) {
        // A crack drifts about a fifth of its length sideways; a spur reaches 8 further.
        const reach = chalk ? 10 + noise(y, x) * 26 : 16 + noise(y, x) * 36
        if (solid(material, x - reach * .5 - 8, y, x + reach * .5 + 8, y + reach + 4)) crack(chalk ? WEAR.chalkCrack : WEAR.crack, x, y, reach, lean, chalk ? .8 : .9, chalk ? .6 : .3)
      }
    }
  }
  const result = { key, light, dark, low, high, chips }; reliefs.set(level, result); return result
}

/** Fine relief stays inside the real collision silhouette. */
export function drawTerrainEdges(ctx: CanvasRenderingContext2D, platforms: readonly Platform[], level: JumpLevel) {
  const r = relief(platforms, level)
  // A frame leaves out marks wholly outside its canvas: a large earth level has thousands. A retained
  // layer, recorded without a canvas, keeps them all.
  let seen = (_: Box) => true
  if (ctx.canvas && ctx.getTransform) {
    const t = ctx.getTransform(), x0 = -t.e / t.a, x1 = (ctx.canvas.width - t.e) / t.a, y0 = -t.f / t.d, y1 = (ctx.canvas.height - t.f) / t.d
    const view = { x0: Math.min(x0, x1) - 2, x1: Math.max(x0, x1) + 2, y0: Math.min(y0, y1) - 2, y1: Math.max(y0, y1) + 2 }
    if (!t.b && !t.c && Number.isFinite(view.x0 + view.x1 + view.y0 + view.y1)) seen = box => overlaps(box, view)
  }
  ctx.save()
  for (const { style, path, box } of r.low) if (seen(box)) { ctx.fillStyle = style; ctx.fill(path) }
  for (const { style, path, box } of r.high) if (seen(box)) { ctx.fillStyle = style; ctx.fill(path) }
  ctx.fillStyle = '#ffffff35'; ctx.fill(r.light)
  ctx.fillStyle = '#26382d25'; ctx.fill(r.dark)
  ctx.fillStyle = 'rgba(40,44,38,.3)'; ctx.fill(r.chips)
  ctx.restore()
}
