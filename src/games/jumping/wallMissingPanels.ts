import type { NamedObject } from './objectNames.ts'
import { panelAt, panelGrid, stainInk, type WallFinish, type WallPanel } from './wallFinish.ts'
import { levelSalt, steps, wallWear, type StainSetting, type WallWear } from './wallWear.ts'
import { pointInside } from './geometry.ts'
import type { LevelEnvironment } from './environment.ts'

/**
 * Missing panels (docs/jumping-wall-wear.md): one panel of the back wall taken out, or smashed through, so the
 * room's services show in the dark void behind the panelling. Artwork only: no collision, grip, cover or light.
 *
 * Everything here is drawn as opaque or translucent rectangles with `fillRect`, cut to the hole by arithmetic
 * rather than a clip. The daylight renderer redraws a clipped patch over a cached frame and must match it
 * exactly, and rectangles drawn that way match where paths do not (wallWear.ts, stainLayer). So the void's
 * services run level and upright, and a broken panel's jagged edge is a staircase of level strips.
 */
export type PanelDamage = 'removed' | 'broken'
export type PanelContents = 'services' | 'pipes' | 'electrical' | 'empty'
export interface MissingPanel extends NamedObject {
  /** A point on the wall: the hole is the panel under it, in the level's current finish. */
  x: number; y: number
  /** Removed (the default, saved by leaving it out) or broken. */
  damage?: 'broken'
  /** What shows in the void; services (pipes and wiring), the default, is saved by leaving it out. */
  contents?: Exclude<PanelContents, 'services'>
  /** A long stain from the hole's bottom joint down the wall below. */
  leak?: true
}
export const MAX_MISSING_PANELS = 24
export const PANEL_DAMAGES: { id: PanelDamage; label: string }[] = [{ id: 'removed', label: 'Removed' }, { id: 'broken', label: 'Broken' }]
export const PANEL_CONTENTS: { id: PanelContents; label: string }[] = [
  { id: 'services', label: 'Pipes and wiring' }, { id: 'pipes', label: 'Pipes' }, { id: 'electrical', label: 'Wiring' }, { id: 'empty', label: 'Empty' },
]
export const isPanelDamage = (value: unknown): value is PanelDamage => PANEL_DAMAGES.some(d => d.id === value)
export const isPanelContents = (value: unknown): value is PanelContents => PANEL_CONTENTS.some(c => c.id === value)

interface Rect { x: number; y: number; w: number; h: number }
interface WallOf { width: number; height: number; finish: WallFinish; id: string }

const noise = (x: number, y: number) => { const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n) }
const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
const intersect = (a: Rect, b: Rect): Rect | null => {
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y), r = Math.min(a.x + a.w, b.x + b.w), bottom = Math.min(a.y + a.h, b.y + b.h)
  return r > x && bottom > y ? { x, y, w: r - x, h: bottom - y } : null
}

/** The panel a missing panel removes: the one under its point, in the level's finish. */
export const missingPanelRect = (finish: WallFinish | undefined, panel: Pick<MissingPanel, 'x' | 'y'>): WallPanel => panelAt(finish ?? 'course', panel.x, panel.y)

/**
 * The hole: the panel, cut to the level, and the part of it that is gone as level strips. A removed panel is
 * gone whole. A broken one keeps about a third of itself as shards along its sides, with a jagged edge that
 * steps across each 5-unit strip, the same for this panel on every visit.
 */
export function holeOf(wall: WallOf, missing: MissingPanel) {
  const panel = missingPanelRect(wall.finish, missing), level = { x: 0, y: 0, w: wall.width, h: wall.height }
  const strips: Rect[] = []
  if (missing.damage !== 'broken') {
    const gone = intersect(panel, level)
    if (gone) strips.push(gone)
  } else {
    const [sx, sy] = levelSalt(wall.id), n = (a: number, b: number) => noise(a + sx + panel.col * 3.7, b + sy + panel.row * 5.1)
    // What stays: chunks still fixed along the panel's sides, each a bulge that swells and narrows down the
    // side, and a strip along the top or bottom where the blow did not reach. The edge wanders between them.
    const bumps = (side: number) => Array.from({ length: 1 + Math.floor(n(side, 1.7) * 2) }, (_, k) =>
      ({ at: n(side * 3.1 + k, 2.9), half: .18 + n(side + k * 1.3, 5.3) * .3, size: .12 + n(k * 2.3, side * 1.9) * .32 }))
    const sides = [bumps(1), bumps(2)], top = n(3.3, 8.1) < .5 ? .04 + n(8.1, 3.3) * .12 : 0, bottom = top ? 0 : .04 + n(6.7, 2.2) * .12
    const reach = (side: number, v: number) => sides[side].reduce((most, b) => Math.max(most, b.size * Math.max(0, 1 - ((v - b.at) / b.half) ** 2)), 0)
    const rows = Math.max(4, Math.round(panel.h / 5))
    // About two thirds goes: the shards are scaled until they keep about a third of the panel.
    const kept = (scale: number) => Array.from({ length: rows }, (_, i) => { const v = (i + .5) / rows; return v < top || v > 1 - bottom ? 1 : Math.min(1, (reach(0, v) + reach(1, v)) * scale) })
      .reduce((sum, k) => sum + k, 0) / rows
    let scale = 1
    for (let k = 0; k < 12 && Math.abs(kept(scale) - .34) > .02; k++) scale *= kept(scale) > .34 ? .85 : 1.15
    let wander = 0
    for (let i = 0; i < rows; i++) {
      const v = (i + .5) / rows, y = panel.y + panel.h * i / rows, h = panel.h / rows
      if (v < top || v > 1 - bottom) continue
      // A small random walk on each edge, so it steps irregularly from strip to strip.
      wander = Math.max(-.05, Math.min(.05, wander + (n(i * 1.9, 3.1) - .5) * .05))
      const left = Math.max(0, reach(0, v) * scale + wander), right = Math.max(0, reach(1, v) * scale - wander * .7)
      const l = panel.x + panel.w * left, r = panel.x + panel.w * (1 - right)
      if (r - l < 6) continue
      const gone = intersect({ x: l, y, w: r - l, h }, level)
      if (gone) strips.push(gone)
    }
  }
  return { panel, strips }
}

// The void's colours: darker than the wall but never black, so a hole never reads as an open doorway.
const VOID = '#3a403c', SHADE = '#2b302d', BOLT = '#2f3431'
const STEEL = { body: '#4c534e', lit: '#646c66', slot: '#2b302d' }
const PIPE = { body: '#474f4a', lit: '#5f6862', shade: '#333a36', flange: '#3b423e', strap: '#2c322f' }
const TRAY = { rail: '#5a615c', rung: '#4b524d' }
const CONDUIT = { body: '#6a716c', lit: '#858c86', coupling: '#5a615c' }
const BOX = { body: '#5c645e', lid: '#464d48', screw: '#8b928c' }
const CABLES = ['#6e7470', '#5a605c', '#80857f', '#666c68']
const DULL = ['#7a4b3f', '#4d6378', '#5f6f62']

type Piece = [colour: string, x: number, y: number, w: number, h: number]
export type Service = { kind: 'pipe'; size: number; x0: number; x1: number; y: number; upright?: boolean }
  | { kind: 'tray'; x0: number; x1: number; y: number; upright?: boolean; seed: number }
  | { kind: 'conduit'; x0: number; x1: number; y: number; upright?: boolean; seed: number }
  | { kind: 'strut'; x0: number; x1: number; y: number }
  | { kind: 'box'; x: number; y: number; size: number }

const LINE = 60, LENGTH = 480, STRUT = 240
/** The weighted choice for a service line's length: about half empty, so a void never reads as texture. */
const lineKind = (value: number): 'pipe' | 'tray' | 'conduit' | null => value < .2 ? 'pipe' : value < .35 ? 'tray' : value < .5 ? 'conduit' : null
const allowed = (contents: PanelContents, kind: 'pipe' | 'tray' | 'conduit' | 'box') =>
  contents === 'services' || (contents === 'pipes' ? kind === 'pipe' : contents === 'electrical' && kind !== 'pipe')

/**
 * The services behind a stretch of wall. They belong to one void behind the whole wall, laid out on a world grid
 * from the level's ID, and a hole is a window onto it: neighbouring holes show the same pipe running through.
 */
export function voidLayout(area: Rect, contents: PanelContents, salt: readonly [number, number]): Service[] {
  const out: Service[] = [], n = (a: number, b: number) => noise(a + salt[0], b + salt[1])
  for (let k = Math.floor(area.y / STRUT); k * STRUT <= area.y + area.h; k++) out.push({ kind: 'strut', x0: area.x, x1: area.x + area.w, y: k * STRUT + STRUT / 2 })
  if (contents === 'empty') return out
  for (let line = Math.floor(area.y / LINE); line * LINE <= area.y + area.h; line++) {
    const y = line * LINE + LINE / 2
    if (Math.abs(y % STRUT - STRUT / 2) < 12) continue
    for (let s = Math.floor(area.x / LENGTH); s * LENGTH <= area.x + area.w; s++) {
      const kind = lineKind(n(line * 2.17, s * 3.91))
      if (!kind || !allowed(contents, kind)) continue
      const x0 = s * LENGTH, x1 = x0 + LENGTH
      if (kind === 'pipe') out.push({ kind, size: n(s, line) < .5 ? 8 : 14, x0, x1, y })
      else out.push(kind === 'tray' ? { kind, x0, x1, y, seed: n(line, s * 1.3) } : { kind, x0, x1, y, seed: n(line, s * 1.3) })
      // One conduit length in three carries a junction box.
      if (kind === 'conduit' && n(s * .7, line * 1.1) < 1 / 3) out.push({ kind: 'box', x: x0 + 60 + n(line, s) * 360, y, size: 16 + n(s, line * 2) * 8 })
    }
  }
  for (let c = Math.floor(area.x / LENGTH); c * LENGTH <= area.x + area.w; c++) {
    if (n(c * 5.3, 1.7) >= 1 / 3) continue
    const kind = n(c, 9.1) < .5 ? 'pipe' : 'conduit', x = c * LENGTH + 60 + n(c * 1.9, 4.4) * 360
    if (!allowed(contents, kind)) continue
    out.push(kind === 'pipe' ? { kind, size: 8, x0: area.y, x1: area.y + area.h, y: x, upright: true } : { kind, x0: area.y, x1: area.y + area.h, y: x, upright: true, seed: n(c, 2) })
    // A riser conduit meeting a level conduit gets a junction box where they cross.
    if (kind === 'conduit') for (const line of out) if (line.kind === 'conduit' && !line.upright && x > line.x0 && x < line.x1) out.push({ kind: 'box', x, y: line.y, size: 18 })
  }
  return out
}

/** A service as rectangles, level or upright. */
function pieces(service: Service, night: boolean): Piece[] {
  const out: Piece[] = []
  // A run along the wall at height `at` from `from` to `to`, or up it at x `at` when upright.
  const band = (upright: boolean | undefined, colour: string, from: number, to: number, at: number, offset: number, thick: number) =>
    out.push(upright ? [colour, at + offset, from, thick, to - from] : [colour, from, at + offset, to - from, thick])
  const lit = (colour: string) => night ? '#7d867f' : colour
  if (service.kind === 'strut') {
    band(false, STEEL.body, service.x0, service.x1, service.y, -5, 10); band(false, lit(STEEL.lit), service.x0, service.x1, service.y, -5, 1.2)
    for (let x = Math.floor(service.x0 / 40) * 40 + 20; x < service.x1; x += 40) out.push([STEEL.slot, x - 3, service.y - .6, 6, 1.2])
  } else if (service.kind === 'pipe') {
    const d = service.size, { upright } = service
    band(upright, PIPE.body, service.x0, service.x1, service.y, -d / 2, d)
    band(upright, lit(PIPE.lit), service.x0, service.x1, service.y, -d / 2 + d * .18, d * .16)
    band(upright, PIPE.shade, service.x0, service.x1, service.y, d / 2 - d * .3, d * .22)
    for (let at = Math.floor(service.x0 / 160) * 160 + 40; at < service.x1; at += 160) {
      band(upright, PIPE.flange, at - d * .18, at + d * .18, service.y, -d * .71, d * 1.42)
      band(upright, PIPE.strap, at + 80 - d * .1, at + 80 + d * .1, service.y, -d * .56, d * 1.12)
    }
  } else if (service.kind === 'tray') {
    band(false, TRAY.rail, service.x0, service.x1, service.y, -9, 1.5); band(false, TRAY.rail, service.x0, service.x1, service.y, 7.5, 1.5)
    for (let x = Math.floor(service.x0 / 12) * 12; x < service.x1; x += 12) out.push([TRAY.rung, x, service.y - 9, 1.2, 18])
    // Three to five cables lying in the tray, sagging a little between the rungs; one in a dull colour.
    const count = 3 + Math.floor(service.seed * 3), dull = Math.floor(service.seed * 7) % count
    for (let k = 0; k < count; k++) {
      const y = service.y - 6 + k * 12 / count, w = 1.5 + noise(service.seed * 9, k) * 1, colour = k === dull ? DULL[Math.floor(service.seed * 5) % 3] : CABLES[k % 4]
      band(false, colour, service.x0, service.x1, y, 0, w)
      for (let x = Math.floor(service.x0 / 12) * 12 + 3; x < service.x1; x += 12) out.push([colour, x, y + .8, 6, w])
    }
  } else if (service.kind === 'conduit') {
    const { upright } = service
    band(upright, CONDUIT.body, service.x0, service.x1, service.y, -2, 4); band(upright, lit(CONDUIT.lit), service.x0, service.x1, service.y, -2, 1)
    for (let at = Math.floor(service.x0 / 60) * 60 + 30; at < service.x1; at += 60) band(upright, CONDUIT.coupling, at - 3, at + 3, service.y, -3, 6)
  } else {
    const { x, y, size } = service
    out.push([BOX.body, x - size / 2, y - size / 2, size, size], [BOX.lid, x - size / 2 + 2, y - size / 2 + 3, size - 4, .8],
      [lit(BOX.screw), x - size / 2 + 2.5, y + size / 2 - 4, 1.6, 1.6], [lit(BOX.screw), x + size / 2 - 4.1, y + size / 2 - 4, 1.6, 1.6])
  }
  return out
}

/** Whether a service shows in the hole: anything but a strut drawn over any of it. */
const shows = (service: Service, hole: Rect) => service.kind !== 'strut' && pieces(service, false).some(([, x, y, w, h]) => overlap({ x, y, w, h }, hole))

/**
 * The artwork for one missing panel, as rectangles in drawing order: the void and what is in it, cut to the hole;
 * the cut edge; bolt holes or shard cracks; and the stains it leaves on the wall below.
 */
export function missingPanelArt(wall: WallOf, missing: MissingPanel, wear: WallWear, night: boolean): Piece[] {
  const { panel, strips } = holeOf(wall, missing), out: Piece[] = []
  if (!strips.length) return out
  const contents: PanelContents = missing.contents ?? 'services', salt = levelSalt(wall.id)
  const bounds = strips.reduce((b, s) => ({ x: Math.min(b.x, s.x), y: Math.min(b.y, s.y), r: Math.max(b.r, s.x + s.w), bottom: Math.max(b.bottom, s.y + s.h) }), { x: Infinity, y: Infinity, r: -Infinity, bottom: -Infinity })
  const hole = { x: bounds.x, y: bounds.y, w: bounds.r - bounds.x, h: bounds.bottom - bounds.y }
  // Each strip reaches a unit down into the next, so the strips' antialiased edges never meet at a seam that
  // lets the wall show through. Opaque pieces drawn twice there look the same. (A thin band laid over each seam
  // instead came out a level off under the daylight patch's clip, as thin marks there do.)
  const cover = strips.map((strip, i) => strips[i + 1] && Math.abs(strip.y + strip.h - strips[i + 1].y) < 1e-6 ? { ...strip, h: strip.h + 1 } : strip)
  const cut = (piece: Piece) => { for (const strip of cover) { const part = intersect({ x: piece[1], y: piece[2], w: piece[3], h: piece[4] }, strip); if (part) out.push([piece[0], part.x, part.y, part.w, part.h]) } }

  // The void, and its services.
  for (const strip of cover) out.push([VOID, strip.x, strip.y, strip.w, strip.h])
  let laid = voidLayout(hole, contents, salt)
  if (contents !== 'empty' && !laid.some(s => shows(s, hole))) {
    // At least one service per hole: the line nearest its middle takes the first kind allowed, in this hole only.
    const y = Math.round((hole.y + hole.h / 2 - LINE / 2) / LINE) * LINE + LINE / 2
    laid = [...laid, contents === 'electrical' ? { kind: 'tray', x0: hole.x, x1: hole.x + hole.w, y, seed: .5 } : { kind: 'pipe', size: 14, x0: hole.x, x1: hole.x + hole.w, y }]
  }
  for (const service of laid) for (const piece of pieces(service, night)) cut(piece)
  // A broken panel's loose cable: one end hanging out of a tray, with a short bare tip.
  if (missing.damage === 'broken') {
    const tray = laid.find((s): s is Extract<Service, { kind: 'tray' }> => s.kind === 'tray' && !s.upright && s.y > hole.y && s.y < hole.y + hole.h)
    if (tray) {
      const x = hole.x + hole.w * (.3 + noise(panel.col + salt[0], panel.row) * .4), length = 18 + noise(panel.row, panel.col + salt[1]) * 18
      cut([DULL[0], x, tray.y, 2, length]); cut(['#b07a4a', x - .2, tray.y + length - 3, 2.4, 3])
    }
  }

  // The cut edge, the wall's thickness: a shade inside the top and left from the light at upper left, and a
  // thin lit lip inside the bottom and right where the panel's edge faces it.
  const lip = night ? '#a8afa9' : '#8d948e'
  for (const [i, strip] of strips.entries()) {
    const above = strips[i - 1], below = strips[i + 1], first = i === 0, last = i === strips.length - 1
    out.push([SHADE, strip.x, strip.y, Math.min(5, strip.w), strip.h], [lip, strip.x + strip.w - 1.5, strip.y, 1.5, strip.h])
    // Along the top and bottom, only where this strip reaches past its neighbour.
    for (const [x0, x1] of uncovered(strip, first ? null : above)) out.push([SHADE, x0, strip.y, x1 - x0, Math.min(strip.h, first ? 5 : 3)])
    for (const [x0, x1] of uncovered(strip, last ? null : below)) out.push([lip, x0, strip.y + strip.h - 1.5, x1 - x0, 1.5])
  }
  if (missing.damage !== 'broken') {
    // Where it was fixed: a dark bolt hole in the neighbouring joints at each corner.
    for (const [x, y] of [[panel.x - 4.5, panel.y + 7], [panel.x + panel.w + 1.5, panel.y + 7], [panel.x - 4.5, panel.y + panel.h - 10], [panel.x + panel.w + 1.5, panel.y + panel.h - 10]])
      if (x >= 0 && x + 3 <= wall.width && y >= 0 && y + 3 <= wall.height) out.push([BOLT, x, y, 3, 3])
  } else {
    // Short cracks run from the jagged edge into the shards.
    for (const [k, strip] of strips.entries()) {
      if (k % 5 !== 2) continue
      const side = noise(k + salt[0], panel.col) < .5 ? -1 : 1, x = side < 0 ? strip.x : strip.x + strip.w
      for (let s = 0; s < 3; s++) out.push(['rgba(40,44,38,0.45)', side < 0 ? x - 4 * (s + 1) : x + 4 * s, strip.y + s * 2.2, 4, .9])
    }
  }

  // Stains: water from the void runs out of the hole's bottom joint, every time, a long one where it leaks.
  const { ink, base } = stainInk(wall.finish, night), strength = wear.stains === 'none' ? 1 : wear.style.opacity
  const stain = `rgba(${ink},${Math.round(base * strength * 1000) / 1000})`, top = panel.y + panel.h + 1.5
  const grid = panelGrid(wall.finish), at = hole.x + hole.w * (.25 + noise(panel.row + salt[1], panel.col * 1.7) * .5)
  const rects: number[] = []
  if (missing.leak) {
    const width = 16 + noise(panel.col, salt[0]) * 20
    steps(rects, at, top, Math.min(grid.h, wall.height - top), width, .45, (noise(panel.row, panel.col) - .5) * width * .4)
    for (let i = 0; i < rects.length; i += 4) out.push([stain, rects[i], rects[i + 1], rects[i + 2], rects[i + 3]])
    // A darker, narrower core, and a damp band along the void's bottom edge.
    const core: number[] = []
    steps(core, at, top, Math.min(grid.h, wall.height - top) * .9, width / 3, .4, 0)
    for (let i = 0; i < core.length; i += 4) out.push([`rgba(${ink},0.045)`, core[i], core[i + 1], core[i + 2], core[i + 3]])
    for (const strip of strips) if (strip.y + strip.h >= panel.y + panel.h - 8) out.push(['rgba(20,24,22,0.22)', strip.x, Math.max(strip.y, panel.y + panel.h - 8), strip.w, Math.min(strip.h, 8)])
  } else if (top < wall.height) {
    const width = 8 + noise(panel.col * 2.1, salt[1]) * 12
    steps(rects, at, top, Math.min(grid.h * (.3 + noise(panel.col, panel.row) * .3), wall.height - top), width, .55, (noise(panel.row * 3, panel.col) - .5) * width * .5)
    for (let i = 0; i < rects.length; i += 4) out.push([stain, rects[i], rects[i + 1], rects[i + 2], rects[i + 3]])
  }
  return out
}
/** The parts of a strip's width that its neighbour (above or below) does not cover. */
function uncovered(strip: Rect, neighbour: Rect | null): [number, number][] {
  if (!neighbour) return [[strip.x, strip.x + strip.w]]
  const out: [number, number][] = []
  if (neighbour.x > strip.x) out.push([strip.x, Math.min(strip.x + strip.w, neighbour.x)])
  if (neighbour.x + neighbour.w < strip.x + strip.w) out.push([Math.max(strip.x, neighbour.x + neighbour.w), strip.x + strip.w])
  // A sliver of edge too short to see is left out: tiny marks round differently under the daylight patch's clip.
  return out.filter(([a, b]) => b - a >= 3)
}

interface Level { id: string; width: number; wallFinish?: Exclude<WallFinish, 'course'>; stains?: StainSetting; missingPanels?: MissingPanel[]; environment?: LevelEnvironment }

/**
 * Whether a point lies on a panelled back wall: anywhere indoors, and against the sky only on a facility wall
 * (the frontmost wall there), which is drawn with the course wall. Cave walls and sky have no panels.
 */
export function panelledAt(level: Pick<Level, 'environment'>, x: number, y: number) {
  const environment = level.environment
  if (environment?.kind !== 'landscape') return true
  for (let i = environment.walls.length - 1; i >= 0; i--) if (pointInside(environment.walls[i], x, y)) return environment.walls[i].kind === 'facility'
  return false
}
const arts = new Map<string, Piece[]>()
/** Each missing panel's artwork, built once for its point, damage, contents, leak, and the level's finish, stains, ID and night. */
function artFor(wall: WallOf, missing: MissingPanel, wear: WallWear, night: boolean) {
  const key = `${wall.id}:${wall.width}x${wall.height}:${wall.finish}:${wear.stains}:${night}:${missing.x},${missing.y}:${missing.damage ?? ''}:${missing.contents ?? ''}:${missing.leak ?? ''}`
  let art = arts.get(key)
  if (!art) { if (arts.size > 512) arts.clear(); art = missingPanelArt(wall, missing, wear, night); arts.set(key, art) }
  return art
}

/** A hole's raster, kept while it is drawn with the same transform and artwork (a still camera). */
const rasters = new WeakMap<MissingPanel, { key: string; art: Piece[]; cpu: boolean; canvas: HTMLCanvasElement }>()
/** Larger holes on screen (in device pixels) are drawn directly. */
const MOST_HOLE_PIXELS = 4_000_000

/**
 * One hole's artwork. On an HTML canvas it is rasterized whole on its own canvas, with the frame's own
 * transform shifted by whole pixels, then copied in. The daylight cache redraws a clipped patch around moving
 * actors over a frame drawn whole (jumpingExposureCorrection.dev.spec), and Chrome rounds thin marks (a cable,
 * a rail's light edge, a broken edge's lip) a level differently where that clip passes; a copied raster is the
 * same under any clip, as the L.A.B. stamps found (wallText.ts). A WebGL recording and the tests' contexts take
 * the rectangles directly.
 */
function drawHole(ctx: CanvasRenderingContext2D, missing: MissingPanel, art: Piece[]) {
  const paint = (target: CanvasRenderingContext2D) => { for (const [colour, x, y, w, h] of art) { target.fillStyle = colour; target.fillRect(x, y, w, h) } }
  if (!art.length) return
  if (typeof HTMLCanvasElement === 'undefined' || !(ctx.canvas instanceof HTMLCanvasElement)) { paint(ctx); return }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const [, x, y, w, h] of art) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + w); y1 = Math.max(y1, y + h) }
  const m = ctx.getTransform()
  const xs = [m.a * x0 + m.c * y0, m.a * x1 + m.c * y0, m.a * x0 + m.c * y1, m.a * x1 + m.c * y1].map(v => v + m.e)
  const ys = [m.b * x0 + m.d * y0, m.b * x1 + m.d * y0, m.b * x0 + m.d * y1, m.b * x1 + m.d * y1].map(v => v + m.f)
  // A pixel of margin keeps every edge's antialiasing inside the raster.
  const left = Math.floor(Math.min(...xs)) - 1, top = Math.floor(Math.min(...ys)) - 1
  const w = Math.ceil(Math.max(...xs)) + 1 - left, h = Math.ceil(Math.max(...ys)) + 1 - top
  if (!(w > 0 && h > 0) || w * h > MOST_HOLE_PIXELS) { paint(ctx); return }
  // A context read back on the CPU gets a CPU raster, so the copy never crosses between CPU and GPU memory.
  const cpu = !!ctx.getContextAttributes?.().willReadFrequently
  const key = `${m.a}:${m.b}:${m.c}:${m.d}:${m.e - left}:${m.f - top}:${w}:${h}`
  let raster = rasters.get(missing)
  if (raster?.key !== key || raster.art !== art || raster.cpu !== cpu) {
    const canvas = raster?.cpu === cpu ? raster.canvas : ctx.canvas.ownerDocument.createElement('canvas')
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h }
    const target = canvas.getContext('2d', { willReadFrequently: cpu })!
    target.save(); target.resetTransform(); target.clearRect(0, 0, w, h)
    target.setTransform(m.a, m.b, m.c, m.d, m.e - left, m.f - top)
    paint(target)
    target.restore()
    raster = { key, art, cpu, canvas }
    rasters.set(missing, raster)
  }
  ctx.save(); ctx.resetTransform(); ctx.drawImage(raster.canvas, 0, 0, w, h, left, top, w, h); ctx.restore()
}

/** Draws a level's missing panels over the wall's paint (its panels and hazard stripes), under its hardware. */
export function drawMissingPanels(ctx: CanvasRenderingContext2D, level: Level, height: number, night: boolean) {
  const panels = level.missingPanels
  if (!panels?.length) return
  const wall: WallOf = { width: level.width, height, finish: level.wallFinish ?? 'course', id: level.id }, wear = wallWear(level)
  for (const missing of panels) if (panelledAt(level, missing.x, missing.y)) drawHole(ctx, missing, artFor(wall, missing, wear, night))
}

/** The holes' gone areas, for clipping paint (wall text) out of them. */
export function missingPanelHoles(level: Level, height: number): Rect[] {
  const wall: WallOf = { width: level.width, height, finish: level.wallFinish ?? 'course', id: level.id }, seen = new Set<string>()
  return (level.missingPanels ?? []).filter(m => panelledAt(level, m.x, m.y)).flatMap(m => {
    // Two holes on one panel are one hole: an even-odd clip would put the paint back.
    const { panel, strips } = holeOf(wall, m), key = `${panel.x},${panel.y}`
    if (seen.has(key)) return []
    seen.add(key); return strips
  })
}
