import { LAB_LOGO_HEIGHT, LAB_LOGO_WIDTH, drawLabLogo } from '../../branding/lab.ts'
import { DIGITAL_GREEN } from './digitalDisplay.ts'
import { generator, hash } from './stampWear.ts'
import { MESSAGE_SCREEN_FONT } from './wallText.ts'
import { dryLength, stainOpacity, steps, type StainLevel, type WallWear } from './wallWear.ts'
import type { WorldPaint } from './worldPaint.ts'

/**
 * The facility's screens (docs/jumping-facility.md, The evaluation board and Course doors): steel cabinets bolted
 * to the wall, each with a recessed screen and status lamps in its frame. The evaluation board is the big one, with
 * an L.A.B. plate on its top rail, ears and a conduit up to a junction box, and a lamp beside each wing's row; a
 * level door's placard is a small one with a single lamp. They are old: paint chipped and scuffed, bolts that rust
 * and weep down the wall below, and an older layout burnt into the phosphor. How worn follows the room's stains.
 */
export interface BoardBox { x: number; y: number; w: number; h: number }

/** A line on the board: the heading (its label and value), a wing (its name and passes or SEALED), or a note. */
export type BoardRow =
  | { kind: 'heading'; label: string; value: string }
  | { kind: 'wing'; name: string; status: string; lamp: 'sealed' | 'open' | 'complete' }
  | { kind: 'note'; text: string }

/**
 * The board's rows, read from the lines the facility writes for it (`evaluationLines`): the heading first, then
 * a wing per line, `NAME n/m` or `NAME SEALED`. Any other line, such as the release notice or the studio's name
 * for the board, is a note.
 */
export function boardRows(lines: readonly string[]): BoardRow[] {
  return lines.map((line, i): BoardRow => {
    const heading = i === 0 && /^(EVALUATION) (.+)$/.exec(line)
    if (heading) return { kind: 'heading', label: heading[1], value: heading[2] }
    const wing = /^(.+) (SEALED|(\d+)\/(\d+))$/.exec(line)
    if (wing) return { kind: 'wing', name: wing[1], status: wing[2],
      lamp: wing[2] === 'SEALED' ? 'sealed' : +wing[3] >= +wing[4] ? 'complete' : 'open' }
    return { kind: 'note', text: line }
  })
}

const STEEL = { face: '#69746d', lit: '#86918a', shade: '#4c5550', edge: '#3d4540', bare: '#9aa39d', chipShade: '#525b56', grime: '#58625c' }
const BEZEL = '#262d29', GLASS = '#0a100d', SHEEN = '#0e1511', BURN = '#14231a', RULE = '#2c5a36'
const DIM = '#5d9a62'
const PLATE = { face: '#b8a383', shade: '#8f7c60', ink: '#4a3f30' }
const LAMP = { ring: '#2b322e', sealed: '#3b3328', open: '#e3ad48', complete: DIGITAL_GREEN }
const RUST = 'rgba(104,66,36,.3)', RUST_SOLID = '#6d5039', RUST_TEAR = '#6c6150'

/**
 * A cabinet's frame, in world units: its top rail, sides and bottom rail, the left side (wider where it holds a
 * column of lamps), the bezel around the glass, and its corner bolts' inset and radius.
 */
export interface Frame { top: number; side: number; bottom: number; lamps: number; bezel: number; inset: number; bolt: number }
/** The evaluation board's: the top rail carries the plate, the left side the wings' lamps. */
export const BOARD_FRAME: Frame = { top: 24, side: 10, bottom: 13, lamps: 24, bezel: 3, inset: 7, bolt: 2 }
/** A door placard's: its one lamp sits in the top rail. */
export const PLACARD_FRAME: Frame = { top: 10, side: 5, bottom: 7, lamps: 5, bezel: 2, inset: 4, bolt: 1.4 }
/** How much the cabinet has aged at each stain level: paint chips, scuffs and rusted bolts. */
const AGE: Record<StainLevel, { chips: number; scuffs: number; rust: number }> = {
  none: { chips: .35, scuffs: 1, rust: 0 },
  light: { chips: .7, scuffs: 2, rust: .4 },
  heavy: { chips: 1, scuffs: 3, rust: .75 },
}

/** A cabinet's glass, inside its frame and bezel, from its top-left. */
export function screenOf(b: BoardBox, f: Frame = BOARD_FRAME): BoardBox {
  const x = f.lamps + f.bezel, y = f.top + f.bezel
  return { x, y, w: Math.max(0, b.w - f.side - f.bezel - x), h: Math.max(0, b.h - f.bottom - f.bezel - y) }
}

interface Layout { size: number; pad: number; heading: number; rule: number; rows: { row: BoardRow; y: number }[] }
/** Where each row sits on the glass: the heading, a rule under it, then a row per wing, shrinking to fit. */
export function boardLayout(b: BoardBox, rows: readonly BoardRow[], fontSize = 14): Layout {
  const glass = screenOf(b), pad = Math.min(10, glass.w / 10, glass.h / 6)
  const body = rows.filter(row => row.kind !== 'heading').length, headed = rows[0]?.kind === 'heading'
  // The heading takes a line and a half (its rule between); each other row a line.
  const lines = body + (headed ? 1.6 : 0), size = Math.max(6, Math.min(fontSize, (glass.h - pad * 2) / Math.max(1, lines) / 1.3))
  const line = size * 1.3, top = glass.y + pad
  let y = top
  const placed: Layout['rows'] = []
  let rule = -1
  for (const row of rows) {
    placed.push({ row, y })
    if (row.kind === 'heading') { rule = y + line + size * .15; y += line * 1.6 } else y += line
  }
  return { size, pad, heading: top, rule, rows: placed }
}

/** A seeded generator for this board in this room, so it ages the same on every visit. */
const cabinetRandom = (b: BoardBox, id: string, wear: WallWear) => generator(hash(`${id}:${wear.salt.join(',')}:${Math.round(b.w)}x${Math.round(b.h)}`))

/** The board's mounting ears either side of its cabinet, and the conduit up to its junction box, from its top-left. */
export function boardMounts(b: BoardBox) {
  const ear = Math.min(16, b.h * .2), conduit = b.w - Math.min(62, b.w * .26)
  return { ears: [{ x: -7, y: b.h / 2 - ear / 2, w: 8, h: ear }, { x: b.w - 1, y: b.h / 2 - ear / 2, w: 8, h: ear }],
    conduit: { x: conduit - 3, y: -46, w: 6, h: 48 }, box: { x: conduit - 10, y: -64, w: 20, h: 20 } }
}

/** Everything the board draws outside its own box, for paint bounds. */
export const boardArtBounds = (b: BoardBox): BoardBox => ({ x: -8, y: -66, w: b.w + 16, h: b.h + 66 })
/** How far below the cabinet its rust and run-off can reach. */
const WEEP_REACH = 100

/**
 * Rust weeping from the cabinet's bottom bolts and water run off its sill, on the wall below it: rectangles
 * (`steps`), as the wall's own stains are, stopping short of water.
 */
function drawWeeping(ctx: CanvasRenderingContext2D, b: BoardBox, f: Frame, wear: WallWear, random: () => number) {
  const age = AGE[wear.stains], rects: number[] = [], sill: number[] = [], scale = Math.min(1, b.w / 300)
  // Rust weeps from under a bottom bolt, rarely both: a broad mark that narrows and wanders as it runs.
  let weeps = 0
  for (const x of [f.inset + 1, b.w - f.inset - 1]) {
    if (random() >= age.rust * (weeps ? .35 : .7)) continue
    weeps++
    const width = (5 + random() * 4) * Math.max(.6, scale), top = b.y + b.h - 1, at = b.x + x + (random() - .5) * 4
    const length = dryLength(wear, at - width, at + width, top, (10 + random() * 30) * Math.max(.5, scale) * wear.style.rustLength)
    if (length >= 4) steps(rects, at, top, length, width, .85, (random() - .5) * 8)
  }
  if (wear.style.share) {
    // Water collects on the sill and runs off it at a low point, away from the bolts.
    const at = b.x + b.w * (.3 + random() * .4), width = (10 + random() * 16) * scale, top = b.y + b.h
    const length = dryLength(wear, at - width, at + width, top, (24 + random() * 50) * scale * wear.style.longest / .55)
    if (length >= 4) steps(sill, at, top, length, width, .55, (random() - .5) * width * .4)
  }
  ctx.fillStyle = RUST
  for (let i = 0; i < rects.length; i += 4) ctx.fillRect(rects[i], rects[i + 1], rects[i + 2], rects[i + 3])
  ctx.fillStyle = `rgba(74,78,62,${stainOpacity(wear, .075)})`
  for (let i = 0; i < sill.length; i += 4) ctx.fillRect(sill[i], sill[i + 1], sill[i + 2], sill[i + 3])
}

/** A rust tear on the frame's paint below a bolt: a few narrowing steps, cut off at `floor`. */
const tear = (ctx: CanvasRenderingContext2D, x: number, y: number, length: number, floor: number, width = 2.6) => {
  const run = Math.min(length, floor - y)
  if (run < 3) return
  ctx.fillStyle = RUST_TEAR
  for (let s = 0; s < 4; s++) { const wide = width * (1 - s * .2); ctx.fillRect(x - wide / 2 + s * .15, y + run * s / 4, wide, run / 4) }
}
const bolt = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rusty: boolean) => {
  if (rusty) { ctx.fillStyle = RUST_SOLID; ctx.beginPath(); ctx.arc(x + .4, y + .6, r * 1.7, 0, Math.PI * 2); ctx.fill() }
  ctx.fillStyle = STEEL.edge; ctx.beginPath(); ctx.arc(x + .35, y + .45, r, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = STEEL.bare; ctx.beginPath(); ctx.arc(x, y, r * .9, 0, Math.PI * 2); ctx.fill()
}

/** The board's ears bolted to the wall either side, and its conduit up to a junction box, in board-local units. */
function drawMounts(ctx: CanvasRenderingContext2D, b: BoardBox, wear: WallWear, random: () => number) {
  const age = AGE[wear.stains], mounts = boardMounts(b)
  for (const m of mounts.ears) {
    ctx.fillStyle = STEEL.edge; ctx.fillRect(m.x, m.y, m.w, m.h)
    ctx.fillStyle = STEEL.shade; ctx.fillRect(m.x + .5, m.y + .5, m.w - 1, m.h - 1)
    ctx.fillStyle = STEEL.lit; ctx.fillRect(m.x + .5, m.y + .5, m.w - 1, 1.5)
    const rusty = random() < age.rust * .6
    bolt(ctx, m.x + m.w / 2, m.y + m.h / 2, 1.6, rusty)
    if (rusty) tear(ctx, m.x + m.w / 2, m.y + m.h / 2 + 2, 6 + random() * 10, m.y + m.h - .5)
  }
  const c = mounts.conduit, box = mounts.box
  ctx.fillStyle = STEEL.shade; ctx.fillRect(c.x, c.y, c.w, c.h)
  ctx.fillStyle = STEEL.lit; ctx.fillRect(c.x + 1, c.y, 1.5, c.h)
  ctx.fillStyle = STEEL.edge; ctx.fillRect(c.x - 1, c.y + c.h * .45, c.w + 2, 3)
  ctx.fillStyle = STEEL.face; ctx.fillRect(box.x, box.y, box.w, box.h)
  ctx.fillStyle = STEEL.lit; ctx.fillRect(box.x, box.y, box.w, 2)
  ctx.fillStyle = STEEL.shade; ctx.fillRect(box.x, box.y + box.h - 2, box.w, 2); ctx.fillRect(box.x + 2, box.y + 5, box.w - 4, 1)
  bolt(ctx, box.x + 3.5, box.y + box.h - 5, 1.3, false); bolt(ctx, box.x + box.w - 3.5, box.y + box.h - 5, 1.3, random() < age.rust)
}

/** The board's L.A.B. plate, riveted to the middle of its top rail. */
function drawPlate(ctx: CanvasRenderingContext2D, b: BoardBox, f: Frame) {
  const plateH = Math.min(15, f.top - 8), logoW = plateH * .78 * LAB_LOGO_WIDTH / LAB_LOGO_HEIGHT, plateW = logoW + 18
  const px = Math.round(b.w / 2 - plateW / 2), py = Math.round((f.top - 3 - plateH) / 2) + 1
  ctx.fillStyle = PLATE.shade; ctx.fillRect(px + 1, py + 1, plateW, plateH)
  ctx.fillStyle = PLATE.face; ctx.fillRect(px, py, plateW, plateH)
  drawLabLogo(ctx, px + 9, py + (plateH - logoW * LAB_LOGO_HEIGHT / LAB_LOGO_WIDTH) / 2, logoW, PLATE.ink)
  ctx.fillStyle = PLATE.ink; for (const x of [px + 3.5, px + plateW - 3.5]) { ctx.beginPath(); ctx.arc(x, py + plateH / 2, 1.1, 0, Math.PI * 2); ctx.fill() }
}

/**
 * A cabinet and its screen's dark glass, in cabinet-local units: an edge, its face, lit and shaded bands, then
 * its wear (grime, a corroded bottom edge, chips and scuffs) on the frame, its corner bolts and the bezel.
 * `fittings` draws what this cabinet carries on its frame (the board's plate), over the wear and under the bolts.
 */
function drawCabinet(ctx: CanvasRenderingContext2D, b: BoardBox, f: Frame, wear: WallWear, random: () => number, fittings?: () => void) {
  const { w, h } = b, age = AGE[wear.stains]
  // The cabinet: an edge, its face, a lit top and left, a shaded bottom and right.
  ctx.fillStyle = STEEL.edge; ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = STEEL.face; ctx.fillRect(1, 1, w - 2, h - 2)
  ctx.fillStyle = STEEL.lit; ctx.fillRect(1, 1, w - 2, 3); ctx.fillRect(1, 1, 2, h - 2)
  ctx.fillStyle = STEEL.shade; ctx.fillRect(1, h - 4, w - 2, 3); ctx.fillRect(w - 3, 1, 2, h - 2)
  // A seam under the top rail, and a lamp column's own panel.
  ctx.fillStyle = STEEL.shade; ctx.fillRect(3, f.top - 3, w - 6, 1)
  if (f.lamps > f.side) { ctx.fillStyle = STEEL.edge; ctx.fillRect(f.lamps - 1, f.top, 1, h - f.top - f.bottom + 3) }

  // Grime where water has sat: darker patches along the bottom rail and low on the sides.
  const screen = screenOf(b, f), perimeter = (w + h) * 2, chips = Math.round(perimeter / 46 * age.chips), small = Math.min(1, w / 300)
  ctx.fillStyle = STEEL.grime
  for (let i = 0; i < Math.round(chips * .4); i++) {
    const gw = (8 + random() * 30) * Math.max(.5, small), gh = 2 + random() * 4, x = 3 + random() * (w - 6 - gw)
    const y = random() < .7 ? h - f.bottom + 1 + random() * (f.bottom - 4 - gh) : h * (.6 + random() * .3)
    if (x + gw > screen.x - 4 && x < screen.x + screen.w + 4 && y + gh > screen.y - 4 && y < screen.y + screen.h + 4) continue
    ctx.fillRect(x, y, gw, gh); ctx.fillRect(x + gw * .2, y + gh, gw * .5, 1.2)
  }
  // The bottom edge, where water sits, has corroded in patches.
  for (let x = 2; x < w - 4;) {
    const run = (4 + random() * 26) * Math.max(.5, small)
    if (random() < age.rust) {
      const deep = (1.5 + random() * 2.5) * Math.max(.6, small)
      ctx.fillStyle = RUST_SOLID; ctx.fillRect(x, h - 1 - deep, Math.min(run, w - 2 - x), deep)
      ctx.fillStyle = RUST_TEAR; ctx.fillRect(x + run * .15, h - 1 - deep - 1.2, Math.min(run * .6, w - 2 - x), 1.2)
    }
    x += run + random() * 30 * Math.max(.5, small)
  }
  // Paint chips on the frame only: some to bare steel, more to the dark primer and rust under the paint.
  for (let i = 0; i < chips; i++) {
    const cw = (1.5 + random() * 4) * Math.max(.6, small), ch = (1 + random() * 2.5) * Math.max(.6, small)
    // Pick a frame band by its length, then a point along it.
    const band = random(), along = random()
    let x: number, y: number
    const room = (span: number) => Math.max(0, span)
    if (band < .38) { x = 3 + along * room(w - 6 - cw); y = 3 + random() * room(f.top - 6 - ch) }
    else if (band < .7) { x = 3 + along * room(w - 6 - cw); y = h - f.bottom + 1 + random() * room(f.bottom - 4 - ch) }
    else if (band < .85) { x = 3 + random() * room(f.lamps - 6 - cw); y = f.top + along * room(h - f.top - f.bottom - ch) }
    else { x = w - f.side + 1 + random() * room(f.side - 4 - cw); y = f.top + along * room(h - f.top - f.bottom - ch) }
    if (x + cw > screen.x - 3 && x < screen.x + screen.w + 3 && y + ch > screen.y - 3 && y < screen.y + screen.h + 3) continue
    const bare = random() < .4
    if (bare) { ctx.fillStyle = STEEL.chipShade; ctx.fillRect(x, y + ch, cw, .8) }
    ctx.fillStyle = bare ? STEEL.bare : random() < age.rust * .65 ? RUST_SOLID : STEEL.edge; ctx.fillRect(x, y, cw, ch)
    if (random() < .5) ctx.fillRect(x + cw * .3, y - .8, cw * .5, .8)
  }
  // Scuffs along the bottom rail, where things have knocked it.
  for (let i = 0; i < Math.ceil(age.scuffs * small); i++) {
    const sw = (10 + random() * 26) * Math.max(.4, small), x = 6 + random() * (w - 12 - sw), y = h - f.bottom + 3 + random() * Math.max(0, f.bottom - 8)
    ctx.fillStyle = STEEL.lit; ctx.fillRect(x, y, sw, .8); ctx.fillRect(x + sw * .2, y + 1.6, sw * .5, .6)
  }

  fittings?.()

  // Corner bolts; the lower ones rust first. A rusted top bolt weeps down the frame beside the screen.
  const i = f.inset, r = f.bolt
  for (const x of [i, w - i]) {
    const rusty = random() < age.rust * .4
    if (rusty) tear(ctx, x, i + r, (10 + random() * 40) * small, h - f.bottom, r * 1.3)
    bolt(ctx, x, i, r, rusty)
  }
  bolt(ctx, i + 1, h - i, r, random() < age.rust); bolt(ctx, w - i - 1, h - i, r, random() < age.rust)

  // The recessed screen: a dark bezel, deeper at the top, then the glass with a faint sheen across its top.
  const z = f.bezel
  ctx.fillStyle = STEEL.shade; ctx.fillRect(screen.x - z - 1, screen.y - z - 1, screen.w + z * 2 + 2, screen.h + z * 2 + 2)
  ctx.fillStyle = BEZEL; ctx.fillRect(screen.x - z, screen.y - z, screen.w + z * 2, screen.h + z * 2 - 1)
  ctx.fillStyle = GLASS; ctx.fillRect(screen.x, screen.y, screen.w, screen.h)
  ctx.fillStyle = SHEEN; ctx.fillRect(screen.x, screen.y, screen.w, Math.min(3, screen.h * .06))
}

const text = (ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size: number, align: CanvasTextAlign, ink: string) => {
  // Draw the pixel-sized font, as wall text does, so hinting matches at every zoom.
  const transform = ctx.getTransform(), scale = Math.hypot(transform.c, transform.d) || 1
  ctx.save(); ctx.scale(1 / scale, 1 / scale)
  ctx.font = `500 ${size * scale}px ${MESSAGE_SCREEN_FONT}`; ctx.textAlign = align; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = ink
  ctx.fillText(value, x * scale, y * scale)
  ctx.restore()
}

/** An older layout burnt into the phosphor: a ruled box and a column divider, faint under whatever it shows now. */
function drawBurnIn(ctx: CanvasRenderingContext2D, b: BoardBox, f: Frame = BOARD_FRAME, columns = true) {
  const glass = screenOf(b, f), inset = Math.min(5, glass.h / 8), x0 = glass.x + inset, y0 = glass.y + inset, x1 = glass.x + glass.w - inset, y1 = glass.y + glass.h - inset
  if (x1 - x0 < 20 || y1 - y0 < 20) return
  ctx.fillStyle = BURN
  ctx.fillRect(x0, y0, x1 - x0, 1); ctx.fillRect(x0, y1 - 1, x1 - x0, 1); ctx.fillRect(x0, y0, 1, y1 - y0); ctx.fillRect(x1 - 1, y0, 1, y1 - y0)
  if (columns) { ctx.fillRect(Math.round(glass.x + glass.w * .62), y0, 1, y1 - y0); ctx.fillRect(x0, Math.round(y0 + (y1 - y0) * .16), x1 - x0, 1) }
}

/** The lit parts: each row's phosphor and each wing's lamp. */
function drawReadout(ctx: CanvasRenderingContext2D, b: BoardBox, layout: Layout) {
  const glass = screenOf(b), left = glass.x + layout.pad, right = glass.x + glass.w - layout.pad, size = layout.size
  ctx.save(); ctx.beginPath(); ctx.rect(glass.x, glass.y, glass.w, glass.h); ctx.clip()
  ctx.shadowColor = DIGITAL_GREEN; ctx.shadowBlur = 2
  for (const { row, y } of layout.rows) {
    const base = y + size
    if (row.kind === 'heading') { text(ctx, row.label, left, base, size, 'left', DIGITAL_GREEN); text(ctx, row.value, right, base, size, 'right', DIGITAL_GREEN) }
    else if (row.kind === 'wing') {
      const ink = row.lamp === 'sealed' ? DIM : DIGITAL_GREEN
      text(ctx, row.name, left, base, size, 'left', ink); text(ctx, row.status, right, base, size, 'right', ink)
    } else text(ctx, row.text, left, base, size, 'left', DIGITAL_GREEN)
  }
  ctx.shadowBlur = 0
  if (layout.rule >= 0) { ctx.fillStyle = RULE; ctx.fillRect(left, layout.rule, right - left, 1) }
  ctx.restore()
}

/** A lamp: a dark ring and an unlit lens, then lit amber while its wing or course is open, and green once complete. */
type LampState = 'sealed' | 'open' | 'complete'
interface Lamp { x: number; y: number; r: number }
const lampHousing = (ctx: CanvasRenderingContext2D, lamp: Lamp) => {
  ctx.fillStyle = LAMP.ring; ctx.beginPath(); ctx.arc(lamp.x, lamp.y, lamp.r + Math.min(1.6, lamp.r * .45), 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = LAMP.sealed; ctx.beginPath(); ctx.arc(lamp.x, lamp.y, lamp.r, 0, Math.PI * 2); ctx.fill()
}
const litLamp = (ctx: CanvasRenderingContext2D, lamp: Lamp, state: LampState) => {
  if (state === 'sealed') return
  ctx.fillStyle = LAMP[state]; ctx.beginPath(); ctx.arc(lamp.x, lamp.y, lamp.r, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#ffffff99'; ctx.fillRect(lamp.x - lamp.r * .5, lamp.y - lamp.r * .55, lamp.r * .45, lamp.r * .35)
}
function lampAt(layout: Layout, y: number) {
  return { x: BOARD_FRAME.lamps / 2 + .5, y: y + layout.size * .62, r: Math.min(4, layout.size * .3) }
}
function drawLampHousings(ctx: CanvasRenderingContext2D, layout: Layout) {
  for (const { row, y } of layout.rows) if (row.kind === 'wing') lampHousing(ctx, lampAt(layout, y))
}
function drawLitLamps(ctx: CanvasRenderingContext2D, layout: Layout) {
  for (const { row, y } of layout.rows) if (row.kind === 'wing') litLamp(ctx, lampAt(layout, y), row.lamp)
}

/**
 * One evaluation board: `lines` from the facility (`evaluationLines`), none while it has nothing to show. The
 * cabinet and the wall under it receive the room's light; the screen's phosphor and lit lamps are emissive.
 */
export function drawEvaluationBoard(ctx: CanvasRenderingContext2D, board: BoardBox & { id: string }, lines: readonly string[], wear: WallWear, paint: WorldPaint, fontSize = 14) {
  const b = { x: board.x, y: board.y, w: board.w, h: board.h }, layout = boardLayout(b, boardRows(lines), fontSize)
  const art = boardArtBounds(b)
  paint(ctx, 0, () => drawWeeping(ctx, b, BOARD_FRAME, wear, cabinetRandom(b, board.id + ':wall', wear)), true, { x: b.x - 4, y: b.y + b.h - 1, w: b.w + 8, h: WEEP_REACH })
  ctx.save(); ctx.translate(b.x, b.y)
  paint(ctx, 0, () => {
    const random = cabinetRandom(b, board.id, wear)
    drawMounts(ctx, b, wear, random)
    drawCabinet(ctx, b, BOARD_FRAME, wear, random, () => drawPlate(ctx, b, BOARD_FRAME))
    drawLampHousings(ctx, layout)
    drawBurnIn(ctx, b)
  }, true, art)
  if (lines.length) paint(ctx, .65, () => { drawReadout(ctx, b, layout); drawLitLamps(ctx, layout) }, true, { x: 0, y: 0, w: b.w, h: b.h })
  ctx.restore()
}

/** Where a placard's lamp sits: in its top rail, toward the door's side. */
export const placardLamp = (b: BoardBox): Lamp => ({ x: Math.round(b.w * .5), y: PLACARD_FRAME.top / 2 + .5, r: 2.4 })
/**
 * A level door's placard: a small cabinet, aged with its room, whose screen shows its course's data (`lines`, none
 * while the door is dark) and whose lamp is dark while the door is dark, amber while its course is open, and green
 * once it is passed.
 */
export function drawPlacard(ctx: CanvasRenderingContext2D, placard: BoardBox & { id: string }, lines: readonly string[], passed: boolean, wear: WallWear, paint: WorldPaint, fontSize = 12) {
  const b = { x: placard.x, y: placard.y, w: placard.w, h: placard.h }, f = PLACARD_FRAME, glass = screenOf(b, f), lamp = placardLamp(b)
  const pad = Math.min(5, glass.w / 10, glass.h / 6), size = Math.max(6, Math.min(fontSize, (glass.h - pad * 2) / Math.max(1, lines.length) / 1.3))
  paint(ctx, 0, () => drawWeeping(ctx, b, f, wear, cabinetRandom(b, placard.id + ':wall', wear)), true, { x: b.x - 4, y: b.y + b.h - 1, w: b.w + 8, h: WEEP_REACH })
  ctx.save(); ctx.translate(b.x, b.y)
  paint(ctx, 0, () => {
    drawCabinet(ctx, b, f, wear, cabinetRandom(b, placard.id, wear))
    lampHousing(ctx, lamp)
    drawBurnIn(ctx, b, f, false)
  }, true, { x: 0, y: 0, w: b.w, h: b.h })
  if (lines.length) paint(ctx, .65, () => {
    ctx.save(); ctx.beginPath(); ctx.rect(glass.x, glass.y, glass.w, glass.h); ctx.clip()
    ctx.shadowColor = DIGITAL_GREEN; ctx.shadowBlur = 2
    lines.forEach((line, i) => text(ctx, line, glass.x + pad, glass.y + pad + i * size * 1.3 + size, size, 'left', DIGITAL_GREEN))
    ctx.restore()
    litLamp(ctx, lamp, passed ? 'complete' : 'open')
  }, true, { x: 0, y: 0, w: b.w, h: b.h })
  ctx.restore()
}
