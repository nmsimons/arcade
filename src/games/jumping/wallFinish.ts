import { panelStains, stainLayer, stainOpacity, wallWear, type WallWear } from './wallWear.ts'

/**
 * A level's back-wall finish: wing identity in the course wall's own language
 * (docs/jumping-facility.md, Wing identity). The course wall is a test chamber's
 * precast panelling, a little worn: a hairline measurement grid, panels that each
 * carry a slightly different faint tint, and recessed joints drawn as a soft shade
 * with a light lip. Every finish is the same construction with a different panel
 * module, bond, tint family, joint weight and wear, set far enough apart that a
 * wing is recognisable at a glance. None adds hardware or any other kind of
 * mark: decorative hardware belongs to authored art. Artwork only: collision,
 * cover, lighting and movement are unchanged, as are the wall's base fill, its
 * fine grid and its camera report.
 */
interface PanelSystem {
  label: string
  /** Panel size in world units, in multiples of the 20-unit grid so joints land on it. */
  w: number; h: number
  /** How far each row shifts from the one above, as a fraction of a panel; 0 stacks the joints. */
  stagger: number
  /** Panels stand on end: columns shift instead of rows. */
  upright?: boolean
  /** Each panel's own tint: an RGB triple at `base` to `base + range` opacity. */
  tint: string; base: number; range: number
  /** A cast over the whole wall, for a wing's material: an RGB triple and its opacity. */
  wash?: [colour: string, opacity: number]
  /**
   * The joints: a soft shade along each panel's top and left with a light lip just inside it. `across` is the
   * shade's opacity on the joints that run along the wall and `down` on those that run up it, so long courses
   * can read as courses and panels on end as columns. The course wall's joints are .13 both ways.
   */
  ink: string; across: number; down: number
  /** Wear, as chances per panel: a newer, cleaner panel; an older, darker one; one cast as a double with its left neighbour. */
  replaced?: number; aged?: number; merged?: number
}
const SAGE = '91,111,94', INK = '82,99,84'
const SYSTEMS = {
  chamber: { label: 'Chamber squares', w: 240, h: 240, stagger: 0, tint: SAGE, base: .012, range: .05, wash: [SAGE, .03], ink: INK, across: .15, down: .15, replaced: .06, aged: .08, merged: .14 },
  plank: { label: 'Cladding', w: 360, h: 120, stagger: 1 / 3, tint: '124,104,78', base: .02, range: .04, wash: ['160,126,82', .075], ink: '96,88,72', across: .21, down: .07, replaced: .05, aged: .08, merged: .1 },
  upright: { label: 'Upright panels', w: 120, h: 360, stagger: .5, upright: true, tint: '92,96,98', base: .016, range: .042, wash: ['92,98,104', .04], ink: '78,86,88', across: .06, down: .21, replaced: .05, aged: .07 },
  tile: { label: 'Tiled', w: 120, h: 120, stagger: 0, tint: '58,122,142', base: .004, range: .06, wash: ['96,168,188', .1], ink: '70,104,112', across: .1, down: .1, replaced: .05, aged: .07 },
  plate: { label: 'Steel plate', w: 320, h: 160, stagger: 0, tint: '58,74,90', base: .03, range: .035, wash: ['58,76,94', .09], ink: '60,72,84', across: .21, down: .21 },
} satisfies Record<string, PanelSystem>

export const WALL_FINISHES = [{ id: 'course', label: 'Course wall' },
  ...(Object.keys(SYSTEMS) as (keyof typeof SYSTEMS)[]).map(id => ({ id, label: SYSTEMS[id].label }))] as { id: WallFinish; label: string }[]
export type WallFinish = 'course' | keyof typeof SYSTEMS
/** Finishes saved under earlier names. */
const RENAMED: Record<string, WallFinish> = { panels: 'plank', bulkhead: 'plate' }
export const wallFinish = (value: unknown): WallFinish | undefined =>
  typeof value !== 'string' ? undefined : value === 'course' || value in SYSTEMS ? value as WallFinish : RENAMED[value]

interface Area { x: number; y: number; w: number; h: number }
const noise = (x: number, y: number) => { const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n) }
/** A second, independent value per panel, for its wear. */
const chance = (col: number, row: number, salt: number) => noise(col * 1.37 + salt * 17.3, row * 1.91 - salt * 9.1)
const fraction = (n: number) => n - Math.floor(n)

/**
 * A wall's panel module: its size, how far each row (or column, when upright) shifts from the last, and how often a
 * panel is cast as a double with its left neighbour. The course wall's is 360 × 240, each row shifted half a panel.
 */
export interface PanelGrid { w: number; h: number; stagger: number; upright?: boolean; merged?: number }
const COURSE_GRID: PanelGrid = { w: 360, h: 240, stagger: .5 }
export const panelGrid = (finish: WallFinish = 'course'): PanelGrid => finish === 'course' ? COURSE_GRID : SYSTEMS[finish]

/** Whether the panel at `col`, `row` was cast as one piece with its left neighbour, the double's right half. */
export const isDouble = (grid: PanelGrid, col: number, row: number) => !grid.upright && !!grid.merged
  && chance(col, row, 1) < grid.merged && chance(col - 1, row, 1) >= grid.merged

/** The panels that touch the area: rows of panels, each shifted from the last, or columns of them when upright. */
export function wallPanels(system: PanelGrid, area: Area) {
  const { w, h, stagger, upright } = system, out: { x: number; y: number; col: number; row: number }[] = []
  if (upright) {
    for (let col = Math.floor(area.x / w); col * w < area.x + area.w; col++) {
      const offset = fraction(col * stagger) * h
      for (let row = Math.floor((area.y - offset) / h); row * h + offset < area.y + area.h; row++) out.push({ x: col * w, y: row * h + offset, col, row })
    }
  } else for (let row = Math.floor(area.y / h); row * h < area.y + area.h; row++) {
    const offset = fraction(row * stagger) * w
    for (let col = Math.floor((area.x - offset) / w); col * w + offset < area.x + area.w; col++) out.push({ x: col * w + offset, y: row * h, col, row })
  }
  return out
}

/** The ink a wall's stains are drawn in, and their opacity at Normal: the course wall's, or a finish's own. */
export function stainInk(finish: WallFinish, night = false): { ink: string; base: number } {
  return finish === 'course' ? { ink: '74,78,62', base: .075 } : { ink: SYSTEMS[finish].ink, base: .08 * (night ? NIGHT_COLOUR : 1) }
}

/**
 * The layers a panel's face is painted in, back to front, so a panel drawn on its own (a loose one, hanging off
 * the wall) matches the panels around it: the wall's base, the finish's wash, and a middling panel tint.
 */
export function panelFace(finish: WallFinish, night = false): string[] {
  if (finish === 'course') return ['#f1f1ed', 'rgba(91,111,94,0.023)']
  const system: PanelSystem = SYSTEMS[finish], colour = night ? NIGHT_COLOUR : 1
  const round = (v: number) => Math.round(v * 1000) / 1000
  return ['#f1f1ed', ...(system.wash ? [`rgba(${system.wash[0]},${round(system.wash[1] * colour)})`] : []), `rgba(${system.tint},${round((system.base + system.range / 2) * colour)})`]
}

/** One panel of the back wall, a double as a whole: where it is, and its column and row (a double's left half's). */
export interface WallPanel { x: number; y: number; w: number; h: number; col: number; row: number }
/**
 * The panel of a finish under a point, exactly as the wall draws it, joints and doubles included: what a missing
 * panel removes (docs/jumping-wall-wear.md). A point on either half of a double gives the whole double.
 */
export function panelAt(finish: WallFinish, x: number, y: number): WallPanel {
  const grid = panelGrid(finish), { w, h } = grid
  let col: number, row: number, left: number, top: number
  if (grid.upright) {
    col = Math.floor(x / w); const offset = fraction(col * grid.stagger) * h
    row = Math.floor((y - offset) / h); left = col * w; top = row * h + offset
  } else {
    row = Math.floor(y / h); const offset = fraction(row * grid.stagger) * w
    col = Math.floor((x - offset) / w); left = col * w + offset; top = row * h
  }
  if (isDouble(grid, col, row)) return { x: left - w, y: top, w: w * 2, h, col: col - 1, row }
  if (isDouble(grid, col + 1, row)) return { x: left, y: top, w: w * 2, h, col, row }
  return { x: left, y: top, w, h, col, row }
}

/**
 * A wall's joint lines as rectangles drawn with `fillRect`: level and upright bands, each line's segments merged
 * where they continue one another. The daylight renderer redraws a clipped patch over a cached frame and must
 * match it exactly (jumpingExposureCorrection.dev.spec); long translucent stroked paths, as the joints were, came
 * out a level off where the patch passes (the Tiled finish's upright joints did), while rectangles match.
 */
export class JointLines {
  private readonly level = new Map<number, [number, number, number][]>()
  private readonly upright = new Map<number, [number, number, number][]>()
  private static add(lines: Map<number, [number, number, number][]>, at: number, from: number, to: number) {
    if (!(to > from)) return
    const key = Math.round(at * 1000) / 1000, list = lines.get(key)
    if (list) list.push([at, from, to]); else lines.set(key, [[at, from, to]])
  }
  /** A band `width` wide centred on height `y`, from `x0` to `x1`. */
  along(y: number, x0: number, x1: number) { JointLines.add(this.level, y, x0, x1) }
  /** A band `width` wide centred on `x`, from `y0` down to `y1`. */
  down(x: number, y0: number, y1: number) { JointLines.add(this.upright, x, y0, y1) }
  fill(ctx: CanvasRenderingContext2D, style: string, width: number) {
    ctx.fillStyle = style
    for (const [lines, levelLine] of [[this.level, true], [this.upright, false]] as const) for (const list of lines.values()) {
      list.sort((a, b) => a[1] - b[1])
      let [at, from, to] = list[0]
      const draw = () => { if (levelLine) ctx.fillRect(from, at - width / 2, to - from, width); else ctx.fillRect(at - width / 2, from, width, to - from) }
      for (const [, a, b] of list.slice(1)) {
        if (a <= to + 1e-6) to = Math.max(to, b)
        else { draw(); from = a; to = b }
      }
      draw()
    }
  }
}

/**
 * Night darkens the whole wall to about a third, which shrinks every difference between finishes with it. A
 * dark level therefore draws its finish stronger: the colour by NIGHT_COLOUR, and the joints by NIGHT_JOINT,
 * since structure is what reads in the dark. Lamp pools show the stronger finish at nearer its drawn strength.
 */
const NIGHT_COLOUR = 1.8, NIGHT_JOINT = 2.1

/** Draws a finish over the wall's base fill and fine grid, within `area` (the visible part of the level), stained as `wear` says. */
export function drawWallFinish(ctx: CanvasRenderingContext2D, finish: Exclude<WallFinish, 'course'>, area: Area, night = false, wear: WallWear = wallWear()) {
  if (area.w <= 0 || area.h <= 0) return
  const system: PanelSystem = SYSTEMS[finish], { w, h } = system, pieces = wallPanels(system, area)
  ctx.save(); ctx.beginPath(); ctx.rect(area.x, area.y, area.w, area.h); ctx.clip()
  const colour = night ? NIGHT_COLOUR : 1, joint = night ? NIGHT_JOINT : 1
  // Opacities are rounded so a style string never carries floating-point noise.
  const opacity = (value: number) => Math.round(value * 1000) / 1000
  if (system.wash) { ctx.fillStyle = `rgba(${system.wash[0]},${opacity(system.wash[1] * colour)})`; ctx.fillRect(area.x, area.y, area.w, area.h) }
  // Joints are four sets of bands: the shade and its light lip, along the wall and up it.
  const across = { shade: new JointLines(), lip: new JointLines() }, down = { shade: new JointLines(), lip: new JointLines() }, stains = stainLayer()
  // A double panel was cast as one piece with its left neighbour: no joint between them, and one tint and wear.
  const double = (col: number, row: number) => isDouble(system, col, row)
  /** A panel's wear: a replaced panel is cleaner than its neighbours; an aged one has darkened. */
  const condition = (col: number, row: number) => {
    const value = chance(col, row, 2), replaced = value < (system.replaced ?? 0)
    return { replaced, aged: !replaced && value > 1 - (system.aged ?? 0) }
  }
  for (const p of pieces) {
    const joined = double(p.col, p.row), col = joined ? p.col - 1 : p.col, { replaced, aged } = condition(col, p.row)
    ctx.fillStyle = replaced ? `rgba(255,255,255,${night ? .24 : .16})` : `rgba(${system.tint},${opacity((system.base + noise(col, p.row) * system.range + (aged ? .03 : 0)) * colour)})`
    // Fills never overlap, so no tint accumulates: a double's second half starts where the first half ended.
    ctx.fillRect(p.x + (joined ? -1 : 1), p.y + 1, w - (joined ? 0 : 2), h - 2)
    if (!joined) { down.shade.down(p.x, p.y, p.y + h); down.lip.down(p.x + 1.4, p.y + 1.4, p.y + h) }
    across.shade.along(p.y, p.x, p.x + w)
    across.lip.along(p.y + 1.4, p.x + (joined ? 0 : 1.4), p.x + w)
  }
  // Grit: faint stains run down from the joints, in the finish's own ink. A replaced panel is clean.
  for (const p of pieces) {
    const joined = double(p.col, p.row), col = joined ? p.col - 1 : p.col
    if (!joined && !condition(col, p.row).replaced) panelStains(stains.streaks, p.x, p.y, w, h, col, p.row, wear)
  }
  stains.fill(ctx, wear, `rgba(${system.ink},${opacity(stainOpacity(wear, .08) * colour)})`, { x0: area.x, y0: area.y, x1: area.x + area.w, y1: area.y + area.h })
  for (const [paths, weight] of [[across, system.across], [down, system.down]] as const) {
    paths.shade.fill(ctx, `rgba(${system.ink},${opacity(weight * joint)})`, 1.1)
    // The course wall's lip is 4.4 times its shade's opacity.
    paths.lip.fill(ctx, `rgba(255,255,255,${opacity(Math.min(night ? .9 : .7, weight * joint * 4.4))})`, .8)
  }
  ctx.restore()
}
