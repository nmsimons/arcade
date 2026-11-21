import type { NamedObject } from './objectNames.ts'
import { panelAt, panelFace, stainInk, type WallFinish, type WallPanel } from './wallFinish.ts'
import { dryLength, levelSalt, steps, wallWear, type StainSetting, type WallWear } from './wallWear.ts'
import { LEVEL_GRID_SIZE } from './level.ts'
import type { LevelEnvironment } from './environment.ts'

/**
 * Loose panels (docs/jumping-wall-wear.md): one panel of the back wall has come off all but one of its top bolts and
 * hangs from it, tilted, so a wedge of the room's services shows in its frame behind it. Artwork only: no
 * collision, grip, cover or light.
 *
 * The daylight renderer redraws a clipped patch around moving actors over a cached frame and must match it
 * exactly (jumpingExposureCorrection.dev.spec), and Chrome rounds slanted edges and thin marks a level differently
 * where that clip passes. So each panel is drawn whole on a canvas of its own and copied in at a whole-pixel offset,
 * as the L.A.B. stamps are (wallText.ts), and its services are rectangles cut to the frame by arithmetic.
 */
export type PanelContents = 'services' | 'pipes' | 'electrical' | 'empty'
export type PanelHang = 'left' | 'right'
export interface LoosePanel extends NamedObject {
  /** A point on the wall: the loose panel is the one under it, in the level's current finish. */
  x: number; y: number
  /** Which top corner's bolt it hangs from; left out, the panel chooses. */
  hang?: PanelHang
  /** What shows behind it; services (pipes and wiring), the default, is saved by leaving it out. */
  contents?: Exclude<PanelContents, 'services'>
  /** A long stain from under the panel down the wall below. */
  leak?: true
}
export const MAX_LOOSE_PANELS = 24
export const PANEL_HANGS: { id: PanelHang | 'either'; label: string }[] = [{ id: 'either', label: 'Either corner' }, { id: 'left', label: 'Left bolt' }, { id: 'right', label: 'Right bolt' }]
export const PANEL_CONTENTS: { id: PanelContents; label: string }[] = [
  { id: 'services', label: 'Pipes and wiring' }, { id: 'pipes', label: 'Pipes' }, { id: 'electrical', label: 'Wiring' }, { id: 'empty', label: 'Empty' },
]
export const isPanelHang = (value: unknown): value is PanelHang => value === 'left' || value === 'right'
export const isPanelContents = (value: unknown): value is PanelContents => PANEL_CONTENTS.some(c => c.id === value)

interface Rect { x: number; y: number; w: number; h: number }
interface WallOf { width: number; height: number; finish: WallFinish; id: string }

const noise = (x: number, y: number) => { const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n) }
const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
const intersect = (a: Rect, b: Rect): Rect | null => {
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y), r = Math.min(a.x + a.w, b.x + b.w), bottom = Math.min(a.y + a.h, b.y + b.h)
  return r > x && bottom > y ? { x, y, w: r - x, h: bottom - y } : null
}

/** The panel a loose panel is: the one under its point, in the level's finish, a double whole. */
export const loosePanelRect = (finish: WallFinish | undefined, point: Pick<LoosePanel, 'x' | 'y'>): WallPanel => panelAt(finish ?? 'course', point.x, point.y)

// The void's colours: a pale grey-green, lighter than any terrain and darker than the wall, so the gap reads as
// the wall's own recess, never as rock or an open doorway. Its services are drawn against it, darker and lighter.
const VOID = '#c6ccc7', SHADE = '#a7aea8', BOLT = '#3f4541'
const STEEL = { body: '#a7aea8', lit: '#d4d9d5', slot: '#737a74' }
const PIPE = { body: '#646d67', lit: '#8a938d', shade: '#4d5550', flange: '#58605a', strap: '#454c47' }
const TRAY = { rail: '#5f6661', rung: '#7d847f' }
const CONDUIT = { body: '#8a918b', lit: '#c4c9c5', coupling: '#737a74' }
const BOX = { body: '#8e958f', lid: '#6c736d', screw: '#d4d9d5' }
const CABLES = ['#585e5a', '#666c68', '#4c524e', '#727874']
const DULL = ['#8a5a4d', '#5c7489', '#5f7363']

type Rectangle = [colour: string, x: number, y: number, w: number, h: number]
/** A rectangle, or a polygon (a loose panel's tilted face and its shadow). */
/** The wall's fine measurement grid on a loose panel's face: the panel, the bolt it turns about, and the angle. */
type GridPiece = ['grid', panel: Rect, pivot: [number, number], angle: number]
type Piece = Rectangle | [colour: string, points: [number, number][]] | GridPiece
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
 * from the level's ID, and a loose panel's frame is a window onto it: neighbouring ones show the same pipe running through.
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
function pieces(service: Service, night: boolean): Rectangle[] {
  const out: Rectangle[] = []
  // A run along the wall at height `at` from `from` to `to`, or up it at x `at` when upright.
  const band = (upright: boolean | undefined, colour: string, from: number, to: number, at: number, offset: number, thick: number) =>
    out.push(upright ? [colour, at + offset, from, thick, to - from] : [colour, from, at + offset, to - from, thick])
  const lit = (colour: string) => night ? '#c7cec8' : colour
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

/** Whether a service shows in a frame: anything but a strut drawn over any of it. */
const shows = (service: Service, frame: Rect) => service.kind !== 'strut' && pieces(service, false).some(([, x, y, w, h]) => overlap({ x, y, w, h }, frame))

/**
 * The artwork for one loose panel, in drawing order. The panel has come off all but one of its top bolts and hangs
 * from it, tilted a few degrees, so its other corner has dropped: behind it, a wedge of the service void shows
 * in its frame, with the empty bolt holes, and its face casts a soft shadow onto the void and the wall below.
 */
export function loosePanelArt(wall: WallOf, loose: LoosePanel, wear: WallWear, night: boolean): Piece[] {
  const panel = panelAt(wall.finish, loose.x, loose.y), out: Piece[] = [], salt = levelSalt(wall.id)
  const frame = intersect(panel, { x: 0, y: 0, w: wall.width, h: wall.height })
  if (!frame) return out
  const n = (a: number, b: number) => noise(a + salt[0] + panel.col * 3.7, b + salt[1] + panel.row * 5.1)
  const contents: PanelContents = loose.contents ?? 'services'
  const cut = (piece: Rectangle) => { const part = intersect({ x: piece[1], y: piece[2], w: piece[3], h: piece[4] }, frame); if (part) out.push([piece[0], part.x, part.y, part.w, part.h]) }

  // The void in the frame, and its services.
  out.push([VOID, frame.x, frame.y, frame.w, frame.h])
  let laid = voidLayout(frame, contents, salt)
  if (contents !== 'empty' && !laid.some(svc => shows(svc, frame))) {
    const y = Math.round((frame.y + frame.h / 2 - LINE / 2) / LINE) * LINE + LINE / 2
    laid = [...laid, contents === 'electrical' ? { kind: 'tray', x0: frame.x, x1: frame.x + frame.w, y, seed: .5 } : { kind: 'pipe', size: 14, x0: frame.x, x1: frame.x + frame.w, y }]
  }
  for (const service of laid) for (const piece of pieces(service, night)) cut(piece)
  // The frame's depth: a shade inside its top and left, from the light at upper left.
  out.push([SHADE, frame.x, frame.y, frame.w, 4], [SHADE, frame.x, frame.y, 4, frame.h])
  // The empty bolt holes at the three corners it came off.
  const hangsLeft = loose.hang ? loose.hang === 'left' : n(1.3, 2.9) < .5
  const corners: [number, number][] = [[panel.x + 9, panel.y + 9], [panel.x + panel.w - 12, panel.y + 9], [panel.x + 9, panel.y + panel.h - 12], [panel.x + panel.w - 12, panel.y + panel.h - 12]]
  for (const [k, [x, y]] of corners.entries()) if (k !== (hangsLeft ? 0 : 1)) out.push([BOLT, x, y, 3, 3])

  // Stains: water from the void runs out under the panel, every time, a long one where it leaks. They are on the
  // wall, so the hanging panel and its shadow are drawn over them.
  const { ink, base } = stainInk(wall.finish, night), strength = wear.stains === 'none' ? 1 : wear.style.opacity
  const stain = `rgba(${ink},${Math.round(base * strength * 1000) / 1000})`, top = panel.y + panel.h + 1.5
  const at = panel.x + panel.w * (.25 + n(panel.row, 1.7) * .5), rects: number[] = []
  if (loose.leak) {
    const width = 16 + n(panel.col, 2) * 16
    const reach = dryLength(wear, at - width, at + width, top, Math.min(panel.h, wall.height - top))
    if (reach > 4) steps(rects, at, top, reach, width, .45, (n(3, 4) - .5) * width * .4 * reach / panel.h)
    for (let i = 0; i < rects.length; i += 4) out.push([stain, rects[i], rects[i + 1], rects[i + 2], rects[i + 3]])
    const core: number[] = []
    if (reach > 4) steps(core, at, top, reach * .9, width / 3, .4, 0)
    for (let i = 0; i < core.length; i += 4) out.push([`rgba(${ink},0.045)`, core[i], core[i + 1], core[i + 2], core[i + 3]])
  } else if (top < wall.height) {
    const width = 8 + n(panel.col * 2.1, 5) * 10
    const reach = dryLength(wear, at - width, at + width, top, Math.min(panel.h * (.3 + n(6, 7) * .3), wall.height - top))
    if (reach > 4) steps(rects, at, top, reach, width, .55, (n(8, 9) - .5) * width * .5)
    for (let i = 0; i < rects.length; i += 4) out.push([stain, rects[i], rects[i + 1], rects[i + 2], rects[i + 3]])
  }

  // The panel, turned about its last bolt: the far side drops.
  const pivot: [number, number] = hangsLeft ? [panel.x + 10.5, panel.y + 10.5] : [panel.x + panel.w - 10.5, panel.y + 10.5]
  const angle = (hangsLeft ? 1 : -1) * (4 + n(4.1, .7) * 4) * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle)
  const turn = ([x, y]: [number, number]): [number, number] => [pivot[0] + (x - pivot[0]) * cos - (y - pivot[1]) * sin, pivot[1] + (x - pivot[0]) * sin + (y - pivot[1]) * cos]
  const rect = (x: number, y: number, w: number, h: number) => ([[x, y], [x + w, y], [x + w, y + h], [x, y + h]] as [number, number][]).map(turn)
  const face = rect(panel.x, panel.y, panel.w, panel.h)
  // Its shadow, off it down and to the right, onto the void and the wall below.
  out.push(['rgba(30,36,32,0.22)', face.map(([x, y]) => [x + 4, y + 6] as [number, number])])
  // Its edge, where the panel's thickness shows along the side that dropped, then its face in the wall's colours.
  out.push([night ? '#5d645f' : '#7d847f', face.map(([x, y]) => [x, y + 3] as [number, number])])
  for (const colour of panelFace(wall.finish, night)) out.push([colour, face])
  // The wall's measurement grid, which turns with the panel.
  out.push(['grid', panel, pivot, angle])
  // Its joints' light lip and shade, which went with it, and the bolt it hangs from.
  const lip = night ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.57)', edge = 'rgba(82,99,84,0.2)'
  out.push([lip, rect(panel.x + 1, panel.y + 1, panel.w - 2, 1.2)], [lip, rect(panel.x + 1, panel.y + 1, 1.2, panel.h - 2)])
  out.push([edge, rect(panel.x, panel.y + panel.h - 1.2, panel.w, 1.2)], [edge, rect(panel.x + panel.w - 1.2, panel.y, 1.2, panel.h)])
  out.push(['#5c645e', rect(pivot[0] - 2.5, pivot[1] - 2.5, 5, 5)], ['#c4c9c5', rect(pivot[0] - 1.5, pivot[1] - 1.5, 1.6, 1.6)])

  return out
}

interface Level { id: string; width: number; wallFinish?: Exclude<WallFinish, 'course'>; stains?: StainSetting; loosePanels?: LoosePanel[]; environment?: LevelEnvironment; gravityPlates?: readonly (Rect & { effect?: string })[] }

/**
 * Whether the level's back wall is panelled, so a loose panel can hang on it: everywhere indoors, nowhere against
 * the sky, where cave walls are rock, building walls painted render (paintedWall.ts), and the sky is open.
 */
export function panelledAt(level: Pick<Level, 'environment'>) {
  return level.environment?.kind !== 'landscape'
}
const arts = new Map<string, Piece[]>()
/** Each loose panel's artwork, built once for its point, hang, contents, leak, and the level's finish, stains, ID and night. */
function artFor(wall: WallOf, loose: LoosePanel, wear: WallWear, night: boolean) {
  const key = `${wall.id}:${wall.width}x${wall.height}:${wall.finish}:${wear.stains}:${wear.wet.map(r => `${r.x},${r.y},${r.w},${r.h}`).join(';')}:${night}:${loose.x},${loose.y}:${loose.hang ?? ''}:${loose.contents ?? ''}:${loose.leak ?? ''}`
  let art = arts.get(key)
  if (!art) { if (arts.size > 512) arts.clear(); art = loosePanelArt(wall, loose, wear, night); arts.set(key, art) }
  return art
}

/**
 * The wall's fine measurement grid on a loose panel's face, as the course wall draws it (render.ts): the same
 * ink and hairline at this zoom, the same spacing (minor lines left out when zoomed out), on the wall's own lattice
 * (upright lines from the level's left, level ones from its bottom), turned with the panel about its bolt.
 */
function drawFaceGrid(target: CanvasRenderingContext2D, [, panel, pivot, angle]: GridPiece, zoom: number, bottom: number) {
  const grid = LEVEL_GRID_SIZE * 2 ** Math.max(0, Math.ceil(Math.log2(8 / (LEVEL_GRID_SIZE * zoom))))
  target.save()
  target.translate(pivot[0], pivot[1]); target.rotate(angle); target.translate(-pivot[0], -pivot[1])
  target.lineWidth = 1 / zoom; target.strokeStyle = '#353f4810'; target.beginPath()
  for (let x = Math.ceil(panel.x / grid) * grid; x < panel.x + panel.w; x += grid) if (x > panel.x) { target.moveTo(x, panel.y); target.lineTo(x, panel.y + panel.h) }
  for (let y = bottom - Math.floor((bottom - panel.y) / grid) * grid; y < panel.y + panel.h; y += grid) if (y > panel.y) { target.moveTo(panel.x, y); target.lineTo(panel.x + panel.w, y) }
  target.stroke()
  target.restore()
}

/** A loose panel's raster, kept while it is drawn with the same transform and artwork (a still camera). */
const rasters = new WeakMap<LoosePanel, { key: string; art: Piece[]; cpu: boolean; canvas: HTMLCanvasElement }>()
/** Larger panels on screen (in device pixels) are drawn directly. */
const MOST_PANEL_PIXELS = 4_000_000

/**
 * One loose panel's artwork. On an HTML canvas it is rasterized whole on its own canvas, with the frame's own
 * transform shifted by whole pixels, then copied in: a copied raster is the same under the daylight patch's clip,
 * where the panel's tilted edges and thin service lines drawn directly were not. A WebGL recording and the tests'
 * contexts take the pieces directly.
 */
function drawPanel(ctx: CanvasRenderingContext2D, loose: LoosePanel, art: Piece[], zoom: number, bottom: number) {
  const paint = (target: CanvasRenderingContext2D) => {
    for (const piece of art) {
      if (piece[0] === 'grid') { drawFaceGrid(target, piece as GridPiece, zoom, bottom); continue }
      target.fillStyle = piece[0]
      if (piece.length === 5) target.fillRect(piece[1], piece[2], piece[3], piece[4])
      else { const points = piece[1] as [number, number][]; target.beginPath(); points.forEach(([x, y], i) => i ? target.lineTo(x, y) : target.moveTo(x, y)); target.closePath(); target.fill() }
    }
  }
  if (!art.length) return
  if (typeof HTMLCanvasElement === 'undefined' || !(ctx.canvas instanceof HTMLCanvasElement)) { paint(ctx); return }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const piece of art) {
    if (piece[0] === 'grid') continue
    const points: [number, number][] = piece.length === 5 ? [[piece[1], piece[2]], [piece[1] + piece[3], piece[2] + piece[4]]] : piece[1] as [number, number][]
    for (const [x, y] of points) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
  }
  const m = ctx.getTransform()
  const xs = [m.a * x0 + m.c * y0, m.a * x1 + m.c * y0, m.a * x0 + m.c * y1, m.a * x1 + m.c * y1].map(v => v + m.e)
  const ys = [m.b * x0 + m.d * y0, m.b * x1 + m.d * y0, m.b * x0 + m.d * y1, m.b * x1 + m.d * y1].map(v => v + m.f)
  // A pixel of margin keeps every edge's antialiasing inside the raster.
  const left = Math.floor(Math.min(...xs)) - 1, top = Math.floor(Math.min(...ys)) - 1
  const w = Math.ceil(Math.max(...xs)) + 1 - left, h = Math.ceil(Math.max(...ys)) + 1 - top
  if (!(w > 0 && h > 0) || w * h > MOST_PANEL_PIXELS) { paint(ctx); return }
  // A context read back on the CPU gets a CPU raster, so the copy never crosses between CPU and GPU memory.
  const cpu = !!ctx.getContextAttributes?.().willReadFrequently
  const key = `${m.a}:${m.b}:${m.c}:${m.d}:${m.e - left}:${m.f - top}:${w}:${h}:${zoom}`
  let raster = rasters.get(loose)
  if (raster?.key !== key || raster.art !== art || raster.cpu !== cpu) {
    const canvas = raster?.cpu === cpu ? raster.canvas : ctx.canvas.ownerDocument.createElement('canvas')
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h }
    const target = canvas.getContext('2d', { willReadFrequently: cpu })!
    target.save(); target.resetTransform(); target.clearRect(0, 0, w, h)
    target.setTransform(m.a, m.b, m.c, m.d, m.e - left, m.f - top)
    paint(target)
    target.restore()
    raster = { key, art, cpu, canvas }
    rasters.set(loose, raster)
  }
  ctx.save(); ctx.resetTransform(); ctx.drawImage(raster.canvas, 0, 0, w, h, left, top, w, h); ctx.restore()
}

/** Draws a level's loose panels over the wall's paint (its panels and hazard stripes), under its hardware. */
export function drawLoosePanels(ctx: CanvasRenderingContext2D, level: Level, height: number, night: boolean, zoom = 1) {
  const panels = level.loosePanels
  if (!panels?.length) return
  const wall: WallOf = { width: level.width, height, finish: level.wallFinish ?? 'course', id: level.id }, wear = wallWear(level)
  for (const loose of panels) if (panelledAt(level)) drawPanel(ctx, loose, artFor(wall, loose, wear, night), zoom, height)
}

