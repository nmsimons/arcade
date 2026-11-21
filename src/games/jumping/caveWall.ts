const patterns = new WeakMap<CanvasRenderingContext2D, { facets: CanvasPattern; detail: CanvasPattern }>()
let tiles: { facets: HTMLCanvasElement; detail: HTMLCanvasElement } | undefined

/**
 * The rock is two tiles of unrelated sizes laid over each other, so together they repeat only every few
 * screens: broad facets, and the finer detail (bedding, cracks and grit) on a clear tile over them.
 */
export const CAVE_FACET_TILE = 1536, CAVE_DETAIL_TILE = 704
/** Tile pixels per world unit: facets are soft shapes; hairlines need more. */
const FACET_DENSITY = 1, DETAIL_DENSITY = 2
/** Facet cells across the facet tile: each cell's corner is jittered, so the rock breaks into irregular faces. */
const CELLS = 7

let seed = 719
const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
/** Draws at a place and once more a tile over wherever it crosses an edge, so the tile wraps seamlessly. */
const wrapped = (size: number, draw: (dx: number, dy: number) => void) => {
  for (const dy of [-size, 0, size]) for (const dx of [-size, 0, size]) draw(dx, dy)
}

/**
 * A rock face behind outdoor terrain: pale stone broken into broad irregular facets, each a shade lighter or
 * darker, crossed by bedding lines and a few cracks. Flat 2D like the terrain: solid fills and hairlines, no
 * gradients. The whole face stays within a narrow, pale range, so the day player's mid-tone shell still stands
 * out from it and night exposure still gives caves their depth. Fixed in world space, drawn as pattern fills
 * (so the daylight patch redraw matches), with no per-frame texture generation and no grid or panel joints.
 */
function paintFacets(paint: CanvasRenderingContext2D) {
  const size = CAVE_FACET_TILE
  paint.fillStyle = '#e5e7e2'; paint.fillRect(0, 0, size, size)
  // A jittered lattice that repeats every tile, each cell a quadrilateral with its own faint tint.
  const cell = size / CELLS
  const jitter = Array.from({ length: CELLS }, () => Array.from({ length: CELLS }, () => [(random() - .5) * cell * .75, (random() - .5) * cell * .75]))
  const corner = (i: number, j: number) => {
    const [jx, jy] = jitter[((i % CELLS) + CELLS) % CELLS][((j % CELLS) + CELLS) % CELLS]
    return [i * cell + jx, j * cell + jy] as const
  }
  for (let i = 0; i < CELLS; i++) for (let j = 0; j < CELLS; j++) {
    const quad = [corner(i, j), corner(i + 1, j), corner(i + 1, j + 1), corner(i, j + 1)]
    // Mostly near the base, some a little darker in shadow, a few catching light.
    const shade = random()
    paint.fillStyle = shade < .4 ? `rgba(92,104,94,${(.016 + random() * .018).toFixed(3)})` : shade < .75 ? 'rgba(0,0,0,0)' : `rgba(255,255,255,${(.07 + random() * .08).toFixed(3)})`
    wrapped(size, (dx, dy) => {
      paint.beginPath(); quad.forEach(([x, y], k) => k ? paint.lineTo(x + dx, y + dy) : paint.moveTo(x + dx, y + dy)); paint.closePath(); paint.fill()
    })
  }
  // Facet edges: a fine shaded line along some faces' tops and lefts, the way a fracture catches the light.
  paint.lineWidth = 1; paint.strokeStyle = 'rgba(88,100,90,.075)'; paint.lineJoin = 'round'
  for (let i = 0; i < CELLS; i++) for (let j = 0; j < CELLS; j++) {
    const [a, b, c] = [corner(i, j + 1), corner(i, j), corner(i + 1, j)]
    // Not every edge shows: a rock face is fractured, not tiled.
    const left = random() < .55, top = random() < .55
    wrapped(size, (dx, dy) => {
      paint.beginPath()
      if (left) { paint.moveTo(a[0] + dx, a[1] + dy); paint.lineTo(b[0] + dx, b[1] + dy) } else paint.moveTo(b[0] + dx, b[1] + dy)
      if (top) paint.lineTo(c[0] + dx, c[1] + dy)
      paint.stroke()
    })
  }
}

/** Bedding, cracks and grit, on a clear tile laid over the facets. */
function paintDetail(paint: CanvasRenderingContext2D) {
  const size = CAVE_DETAIL_TILE
  // Bedding: two wavy strata across the tile, each wave a whole number of times across it so it joins. They
  // undulate enough never to run level for long, so they read as rock, not as a ruled line.
  for (const [y, waves, amplitude, alpha] of [[size * .3, 3, 20, .075], [size * .74, 4, 14, .06]] as const) {
    const phase = random() * Math.PI * 2
    paint.strokeStyle = `rgba(88,100,90,${alpha})`; paint.lineWidth = 1.1
    wrapped(size, (dx, dy) => {
      paint.beginPath()
      for (let x = 0; x <= size; x += 8) {
        const yy = y + Math.sin(x / size * Math.PI * 2 * waves + phase) * amplitude
        if (x) paint.lineTo(x + dx, yy + dy); else paint.moveTo(x + dx, yy + dy)
      }
      paint.stroke()
    })
    // A pale lip under each bed, as on the terrain's lit edges.
    paint.strokeStyle = 'rgba(255,255,255,.25)'; paint.lineWidth = .8
    wrapped(size, (dx, dy) => {
      paint.beginPath()
      for (let x = 0; x <= size; x += 8) {
        const yy = y + 1.4 + Math.sin(x / size * Math.PI * 2 * waves + phase) * amplitude
        if (x) paint.lineTo(x + dx, yy + dy); else paint.moveTo(x + dx, yy + dy)
      }
      paint.stroke()
    })
  }

  // Cracks: short forked hairlines, mostly running down the face.
  paint.strokeStyle = 'rgba(88,100,90,.1)'; paint.lineWidth = .8
  for (let n = 0; n < 8; n++) {
    let x = random() * size, y = random() * size
    const points: [number, number][] = [[x, y]]
    const steps = 3 + Math.floor(random() * 3), lean = (random() - .5) * .9
    for (let s = 0; s < steps; s++) { x += (lean + (random() - .5) * .8) * 9; y += 6 + random() * 8; points.push([x, y]) }
    const fork = points[1 + Math.floor(random() * (points.length - 1))], forkTo = [fork[0] + (random() < .5 ? -1 : 1) * (5 + random() * 7), fork[1] + 4 + random() * 6]
    wrapped(size, (dx, dy) => {
      paint.beginPath(); points.forEach(([px, py], k) => k ? paint.lineTo(px + dx, py + dy) : paint.moveTo(px + dx, py + dy))
      paint.moveTo(fork[0] + dx, fork[1] + dy); paint.lineTo(forkTo[0] + dx, forkTo[1] + dy); paint.stroke()
    })
  }

  // Grit: fine specks, darker and lighter, as before.
  for (let i = 0; i < 1400; i++) {
    const x = random() * size, y = random() * size
    paint.fillStyle = i % 3 ? 'rgba(105,121,104,.05)' : 'rgba(255,255,255,.1)'
    paint.fillRect(x, y, .5 + random() * 1.5, .5)
  }
}

function tile(size: number, density: number, draw: (paint: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = Math.round(size * density)
  const paint = canvas.getContext('2d')!
  paint.scale(density, density); draw(paint)
  return canvas
}
function stonePatterns(ctx: CanvasRenderingContext2D) {
  const cached = patterns.get(ctx)
  if (cached) return cached
  // The same rock on every visit: one seeded sequence, painted once.
  if (!tiles) { seed = 719; tiles = { facets: tile(CAVE_FACET_TILE, FACET_DENSITY, paintFacets), detail: tile(CAVE_DETAIL_TILE, DETAIL_DENSITY, paintDetail) } }
  const facets = ctx.createPattern(tiles.facets, 'repeat')!, detail = ctx.createPattern(tiles.detail, 'repeat')!
  facets.setTransform(new DOMMatrix().scale(1 / FACET_DENSITY)); detail.setTransform(new DOMMatrix().scale(1 / DETAIL_DENSITY))
  const made = { facets, detail }
  patterns.set(ctx, made); return made
}

export function drawCaveWall(ctx: CanvasRenderingContext2D, view: { x: number; y: number; w: number; h: number }) {
  const { facets, detail } = stonePatterns(ctx)
  ctx.fillStyle = facets; ctx.fillRect(view.x, view.y, view.w, view.h)
  ctx.fillStyle = detail; ctx.fillRect(view.x, view.y, view.w, view.h)
}
