import { blob } from './stampWear.ts'
import { panelGrid, wallPanels } from './wallFinish.ts'
import { panelStains, stainLayer, stainOpacity, type WallWear } from './wallWear.ts'

/**
 * A building's outside wall under a blue sky: off-white paint on render, weathered. Broad patches where the paint
 * was touched up or has faded, chips and flakes where it has come away to the grey render beneath, a few scuffs
 * and hairline cracks, and water stains running down it at the room's stain level. Flat 2D like the rest of the
 * wall art: solid fills and hairlines, no gradients, no grid or panel joints.
 *
 * The paint is two tiles of unrelated sizes laid over each other as pattern fills, so it repeats only every few
 * screens, needs no per-frame generation and matches the daylight patch redraw. The stains are the course wall's
 * own stepped `fillRect` streaks (wallWear.ts), laid on its world grid though no joints are drawn, so they are
 * world-anchored and respect water and the Stains setting.
 */
export const PAINT_TILE = 1280, PAINT_DETAIL_TILE = 768
const PAINT_DENSITY = 1, DETAIL_DENSITY = 2
/** The paint: warmer than the course wall's #f1f1ed, so a building reads as painted rather than precast. */
export const PAINTED_WALL = '#efece4'

const patterns = new WeakMap<CanvasRenderingContext2D, { paint: CanvasPattern; detail: CanvasPattern }>()
let tiles: { paint: HTMLCanvasElement; detail: HTMLCanvasElement } | undefined

let seed = 4231
const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
/** Draws at a place and once more a tile over wherever it crosses an edge, so the tile wraps seamlessly. */
const wrapped = (size: number, draw: (dx: number, dy: number) => void) => {
  for (const dy of [-size, 0, size]) for (const dx of [-size, 0, size]) draw(dx, dy)
}
/** A closed curve through the midpoints of `points`, turning at each point: a rounded version of the outline. */
function smooth(paint: CanvasRenderingContext2D, points: readonly number[], dx: number, dy: number) {
  const n = points.length / 2, mid = (i: number) => [(points[2 * (i % n)] + points[2 * ((i + 1) % n)]) / 2 + dx, (points[2 * (i % n) + 1] + points[2 * ((i + 1) % n) + 1]) / 2 + dy]
  paint.beginPath(); const [sx, sy] = mid(n - 1); paint.moveTo(sx, sy)
  for (let i = 0; i < n; i++) { const [mx, my] = mid(i); paint.quadraticCurveTo(points[2 * i] + dx, points[2 * i + 1] + dy, mx, my) }
  paint.closePath()
}
function shape(paint: CanvasRenderingContext2D, points: readonly number[], dx: number, dy: number) {
  paint.beginPath(); paint.moveTo(points[0] + dx, points[1] + dy)
  for (let i = 2; i < points.length; i += 2) paint.lineTo(points[i] + dx, points[i + 1] + dy)
  paint.closePath()
}

/** The base coat and its broad patches: touched-up paint a shade fresher, and areas the weather has dulled. */
function paintCoat(paint: CanvasRenderingContext2D) {
  const size = PAINT_TILE
  paint.fillStyle = PAINTED_WALL; paint.fillRect(0, 0, size, size)
  for (let n = 0; n < 11; n++) {
    const patch = blob(random, random() * size, random() * size, 90 + random() * 170, .45 + random() * .4, (random() - .5) * .5)
    paint.fillStyle = random() < .55 ? `rgba(120,108,84,${(.016 + random() * .018).toFixed(3)})` : `rgba(255,255,255,${(.1 + random() * .12).toFixed(3)})`
    wrapped(size, (dx, dy) => { smooth(paint, patch.points, dx, dy); paint.fill() })
  }
}

/** Wear on a clear tile over the coat: flaking paint showing render, scuffs, hairline cracks and grit. */
function paintWear(paint: CanvasRenderingContext2D) {
  const size = PAINT_DETAIL_TILE
  // Flaking: clusters of chips where the paint has lifted, the grey render showing through with a thin shaded
  // rim along the paint's broken edge.
  for (let n = 0; n < 9; n++) {
    const cx = random() * size, cy = random() * size, count = 2 + Math.floor(random() * 5)
    for (let k = 0; k < count; k++) {
      const chip = blob(random, cx + (random() - .5) * 46, cy + (random() - .5) * 30, 2.5 + random() * 7, .5 + random() * .45, random() * Math.PI)
      wrapped(size, (dx, dy) => {
        shape(paint, chip.points, dx, dy)
        paint.fillStyle = '#d6d2c6'; paint.fill()
        paint.strokeStyle = 'rgba(104,96,78,.28)'; paint.lineWidth = .6; paint.stroke()
      })
    }
  }
  // Scuffs: faint smears where something rubbed along the wall.
  for (let n = 0; n < 6; n++) {
    const x = random() * size, y = random() * size, length = 30 + random() * 60, thick = 2 + random() * 3, turn = (random() - .5) * .15
    paint.fillStyle = `rgba(96,90,76,${(.035 + random() * .03).toFixed(3)})`
    wrapped(size, (dx, dy) => {
      paint.beginPath(); paint.ellipse(x + dx, y + dy, length / 2, thick / 2, turn, 0, Math.PI * 2); paint.fill()
    })
  }
  // Hairline cracks in the render, mostly running down.
  paint.strokeStyle = 'rgba(100,92,76,.16)'; paint.lineWidth = .6
  for (let n = 0; n < 6; n++) {
    let x = random() * size, y = random() * size
    const points: [number, number][] = [[x, y]], steps = 3 + Math.floor(random() * 4), lean = (random() - .5) * .8
    for (let s = 0; s < steps; s++) { x += (lean + (random() - .5) * .9) * 7; y += 5 + random() * 7; points.push([x, y]) }
    wrapped(size, (dx, dy) => { paint.beginPath(); points.forEach(([px, py], k) => k ? paint.lineTo(px + dx, py + dy) : paint.moveTo(px + dx, py + dy)); paint.stroke() })
  }
  // Grit in the paint's texture.
  for (let i = 0; i < 900; i++) {
    const x = random() * size, y = random() * size
    paint.fillStyle = i % 3 ? 'rgba(110,100,80,.05)' : 'rgba(255,255,255,.12)'
    paint.fillRect(x, y, .5 + random() * 1.2, .5)
  }
}

function tile(size: number, density: number, draw: (paint: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = Math.round(size * density)
  const paint = canvas.getContext('2d')!
  paint.scale(density, density); draw(paint)
  return canvas
}
function paintPatterns(ctx: CanvasRenderingContext2D) {
  const cached = patterns.get(ctx)
  if (cached) return cached
  // The same wall on every visit: one seeded sequence, painted once.
  if (!tiles) { seed = 4231; tiles = { paint: tile(PAINT_TILE, PAINT_DENSITY, paintCoat), detail: tile(PAINT_DETAIL_TILE, DETAIL_DENSITY, paintWear) } }
  const paint = ctx.createPattern(tiles.paint, 'repeat')!, detail = ctx.createPattern(tiles.detail, 'repeat')!
  paint.setTransform(new DOMMatrix().scale(1 / PAINT_DENSITY)); detail.setTransform(new DOMMatrix().scale(1 / DETAIL_DENSITY))
  const made = { paint, detail }
  patterns.set(ctx, made); return made
}

/** Draws the painted wall over `view`, inside whatever clip the caller set (the back wall's outline). */
export function drawPaintedWall(ctx: CanvasRenderingContext2D, view: { x: number; y: number; w: number; h: number }, wear: WallWear) {
  const { paint, detail } = paintPatterns(ctx)
  ctx.fillStyle = paint; ctx.fillRect(view.x, view.y, view.w, view.h)
  ctx.fillStyle = detail; ctx.fillRect(view.x, view.y, view.w, view.h)
  const stains = stainLayer(), grid = panelGrid('course')
  for (const { x, y, col, row } of wallPanels(grid, view)) panelStains(stains.streaks, x, y, grid.w, grid.h, col, row, wear)
  // Grime rather than the course wall's grey-green: a painted outside wall stains brown where water runs.
  stains.fill(ctx, wear, `rgba(104,88,60,${stainOpacity(wear, .1)})`, { x0: view.x, y0: view.y, x1: view.x + view.w, y1: view.y + view.h })
}
