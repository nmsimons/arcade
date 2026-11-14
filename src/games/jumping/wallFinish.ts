import { ArtPath } from './webgl/artPath.ts'

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

/** The panels that touch the area: rows of panels, each shifted from the last, or columns of them when upright. */
function panels(system: PanelSystem, area: Area) {
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

/**
 * Night darkens the whole wall to about a third, which shrinks every difference between finishes with it. A
 * dark level therefore draws its finish stronger: the colour by NIGHT_COLOUR, and the joints by NIGHT_JOINT,
 * since structure is what reads in the dark. Lamp pools show the stronger finish at nearer its drawn strength.
 */
const NIGHT_COLOUR = 1.8, NIGHT_JOINT = 2.1

/** Draws a finish over the wall's base fill and fine grid, within `area` (the visible part of the level). */
export function drawWallFinish(ctx: CanvasRenderingContext2D, finish: Exclude<WallFinish, 'course'>, area: Area, night = false) {
  if (area.w <= 0 || area.h <= 0) return
  const system: PanelSystem = SYSTEMS[finish], { w, h } = system, pieces = panels(system, area)
  ctx.save(); ctx.beginPath(); ctx.rect(area.x, area.y, area.w, area.h); ctx.clip()
  const colour = night ? NIGHT_COLOUR : 1, joint = night ? NIGHT_JOINT : 1
  // Opacities are rounded so a style string never carries floating-point noise.
  const opacity = (value: number) => Math.round(value * 1000) / 1000
  if (system.wash) { ctx.fillStyle = `rgba(${system.wash[0]},${opacity(system.wash[1] * colour)})`; ctx.fillRect(area.x, area.y, area.w, area.h) }
  // Joints are four paths at most: the shade and its light lip, along the wall and up it.
  const across = { shade: new ArtPath(), lip: new ArtPath() }, down = { shade: new ArtPath(), lip: new ArtPath() }
  // A double panel was cast as one piece with its left neighbour: no joint between them, and one tint and wear.
  const double = (col: number, row: number) => !system.upright && !!system.merged
    && chance(col, row, 1) < system.merged && chance(col - 1, row, 1) >= system.merged
  for (const p of pieces) {
    const joined = double(p.col, p.row), col = joined ? p.col - 1 : p.col, wear = chance(col, p.row, 2)
    // A replaced panel is cleaner than its neighbours; an aged one has darkened.
    const replaced = wear < (system.replaced ?? 0), aged = !replaced && wear > 1 - (system.aged ?? 0)
    ctx.fillStyle = replaced ? `rgba(255,255,255,${night ? .24 : .16})` : `rgba(${system.tint},${opacity((system.base + noise(col, p.row) * system.range + (aged ? .03 : 0)) * colour)})`
    // Fills never overlap, so no tint accumulates: a double's second half starts where the first half ended.
    ctx.fillRect(p.x + (joined ? -1 : 1), p.y + 1, w - (joined ? 0 : 2), h - 2)
    if (!joined) {
      down.shade.moveTo(p.x, p.y + h); down.shade.lineTo(p.x, p.y)
      down.lip.moveTo(p.x + 1.4, p.y + h); down.lip.lineTo(p.x + 1.4, p.y + 1.4)
    }
    across.shade.moveTo(p.x, p.y); across.shade.lineTo(p.x + w, p.y)
    across.lip.moveTo(p.x + (joined ? 0 : 1.4), p.y + 1.4); across.lip.lineTo(p.x + w, p.y + 1.4)
  }
  for (const [paths, weight] of [[across, system.across], [down, system.down]] as const) {
    ctx.strokeStyle = `rgba(${system.ink},${opacity(weight * joint)})`; ctx.lineWidth = 1.1; ctx.stroke(paths.shade)
    // The course wall's lip is 4.4 times its shade's opacity.
    ctx.strokeStyle = `rgba(255,255,255,${opacity(Math.min(night ? .9 : .7, weight * joint * 4.4))})`; ctx.lineWidth = .8; ctx.stroke(paths.lip)
  }
  ctx.restore()
}
