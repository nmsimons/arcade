/**
 * A `Path2D` that also remembers its geometry, so a WebGL renderer can draw
 * artwork built from it. Canvas uses it exactly like any `Path2D`; a native
 * `Path2D` cannot be read back. Outside a browser (Node unit tests) it only
 * records.
 *
 * Commands are kept in the path's own coordinates as a flat list of numbers:
 * an opcode, then its arguments. `addPath` with a matrix stores transformed
 * points; an arc becomes a transformed arc (TARC), which keeps the matrix and
 * is turned into curves only when something draws it.
 */
export const MOVE = 0, LINE = 1, QUAD = 2, CUBIC = 3, CLOSE = 4, RECT = 5, ARC = 6, ELLIPSE = 7
/** An ellipse arc through a matrix: a, b, c, d, then its centre (e, f), rx, ry, rotation, start, end, anticlockwise. */
export const TARC = 8

/** Arguments after each opcode. */
export const ARGUMENTS = [2, 2, 4, 6, 0, 4, 6, 8, 12] as const

/** Commands with every transformed arc turned into a line to its start and cubic pieces (the same list when there are none). */
export function expandArcs(commands: readonly number[]): readonly number[] {
  let i = 0
  while (i < commands.length && commands[i] !== TARC) i += 1 + ARGUMENTS[commands[i]]
  if (i >= commands.length) return commands
  const out = commands.slice(0, i)
  while (i < commands.length) {
    const op = commands[i]
    if (op === TARC) {
      const k = i + 1
      appendArc(out, { a: commands[k], b: commands[k + 1], c: commands[k + 2], d: commands[k + 3], e: commands[k + 4], f: commands[k + 5] },
        0, 0, commands[k + 6], commands[k + 7], commands[k + 8], commands[k + 9], commands[k + 10], !!commands[k + 11])
    } else for (let k = i; k < i + 1 + ARGUMENTS[op]; k++) out.push(commands[k])
    i += 1 + ARGUMENTS[op]
  }
  return out
}

/** A transformed arc: `m` with the centre folded into its translation, so the arc moves with its centre alone. */
export function pushArc(out: number[], m: Matrix, x: number, y: number, rx: number, ry: number, rotation: number, start: number, end: number, ccw: boolean) {
  out.push(TARC, m.a, m.b, m.c, m.d, m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f, rx, ry, rotation, start, end, ccw ? 1 : 0)
}

export interface Matrix { a: number; b: number; c: number; d: number; e: number; f: number }
export const IDENTITY: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
export const multiply = (m: Matrix, n: Matrix): Matrix => ({
  a: m.a * n.a + m.c * n.b, b: m.b * n.a + m.d * n.b,
  c: m.a * n.c + m.c * n.d, d: m.b * n.c + m.d * n.d,
  e: m.a * n.e + m.c * n.f + m.e, f: m.b * n.e + m.d * n.f + m.f,
})

/** Anything that records path commands in the shared encoding. */
export interface RecordedGeometry { readonly commands: readonly number[]; readonly unsupported: boolean }

const Native: typeof Path2D = typeof Path2D === 'undefined' ? class {} as unknown as typeof Path2D : Path2D

export class ArtPath extends Native implements RecordedGeometry {
  commands: number[] = []
  /** Set when a call this recorder cannot reproduce was made; a WebGL renderer then leaves the artwork to Canvas. */
  unsupported = false
  /** As `Path2D`: empty, a copy of another path, or SVG path data. */
  constructor(source?: Path2D | string) {
    super(source as string)
    if (source instanceof ArtPath) { this.commands = [...source.commands]; this.unsupported = source.unsupported }
    else if (typeof source === 'string') {
      const commands = svgPathCommands(source)
      if (commands) this.commands = commands; else this.unsupported = true
    } else if (source !== undefined) this.unsupported = true
  }
  moveTo(x: number, y: number) { super.moveTo?.(x, y); this.commands.push(MOVE, x, y) }
  lineTo(x: number, y: number) { super.lineTo?.(x, y); this.commands.push(LINE, x, y) }
  quadraticCurveTo(cx: number, cy: number, x: number, y: number) {
    super.quadraticCurveTo?.(cx, cy, x, y); this.commands.push(QUAD, cx, cy, x, y)
  }
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number) {
    super.bezierCurveTo?.(c1x, c1y, c2x, c2y, x, y); this.commands.push(CUBIC, c1x, c1y, c2x, c2y, x, y)
  }
  closePath() { super.closePath?.(); this.commands.push(CLOSE) }
  rect(x: number, y: number, w: number, h: number) { super.rect?.(x, y, w, h); this.commands.push(RECT, x, y, w, h) }
  arc(x: number, y: number, radius: number, start: number, end: number, counterclockwise = false) {
    super.arc?.(x, y, radius, start, end, counterclockwise); this.commands.push(ARC, x, y, radius, start, end, counterclockwise ? 1 : 0)
  }
  ellipse(x: number, y: number, rx: number, ry: number, rotation: number, start: number, end: number, counterclockwise = false) {
    super.ellipse?.(x, y, rx, ry, rotation, start, end, counterclockwise)
    this.commands.push(ELLIPSE, x, y, rx, ry, rotation, start, end, counterclockwise ? 1 : 0)
  }
  arcTo(...args: [number, number, number, number, number]) { super.arcTo?.(...args); this.unsupported = true }
  roundRect(x: number, y: number, w: number, h: number, radii?: Radii) {
    super.roundRect?.(x, y, w, h, radii)
    roundRectCommands(this.commands, x, y, w, h, radii)
  }
  addPath(path: Path2D, transform?: DOMMatrix2DInit) {
    super.addPath?.(path, transform)
    if (!(path instanceof ArtPath)) { this.unsupported = true; return }
    if (path.unsupported) this.unsupported = true
    const m = transform ? { a: transform.a ?? 1, b: transform.b ?? 0, c: transform.c ?? 0, d: transform.d ?? 1, e: transform.e ?? 0, f: transform.f ?? 0 } : IDENTITY
    appendTransformed(this.commands, path.commands, m)
  }
}

/**
 * Commands in `source`, transformed by `m`, appended to `target`. Rectangles
 * become their four sides, and arcs a line to their start then cubic pieces,
 * so any affine matrix applies. Canvas's rules for a missing current point (a
 * line or curve then starts a subpath) are left to the flattener, which applies
 * them to every path alike.
 */
export function appendTransformed(target: number[], source: readonly number[], m: Matrix) {
  const { a, b, c, d, e, f } = m
  // Every frame's paths pass through here: index the source directly, with no intermediate lists.
  for (let i = 0; i < source.length;) {
    const op = source[i]
    if (op === CLOSE) { target.push(CLOSE); i++; continue }
    if (op === MOVE || op === LINE || op === QUAD || op === CUBIC) {
      target.push(op)
      const end = i + 1 + ARGUMENTS[op]
      for (let k = i + 1; k < end; k += 2) target.push(a * source[k] + c * source[k + 1] + e, b * source[k] + d * source[k + 1] + f)
      i = end
    } else if (op === RECT) {
      // Canvas: a closed rectangle, then a new subpath at its corner.
      const rx = source[i + 1], ry = source[i + 2], rw = source[i + 3], rh = source[i + 4]
      const ax = a * rx + c * ry + e, ay = b * rx + d * ry + f, ux = a * rw, uy = b * rw, vx = c * rh, vy = d * rh
      target.push(MOVE, ax, ay, LINE, ax + ux, ay + uy, LINE, ax + ux + vx, ay + uy + vy, LINE, ax + vx, ay + vy, CLOSE, MOVE, ax, ay)
      i += 5
    } else if (op === ARC) {
      pushArc(target, m, source[i + 1], source[i + 2], source[i + 3], source[i + 3], 0, source[i + 4], source[i + 5], !!source[i + 6]); i += 7
    } else if (op === ELLIPSE) {
      pushArc(target, m, source[i + 1], source[i + 2], source[i + 3], source[i + 4], source[i + 5], source[i + 6], source[i + 7], !!source[i + 8]); i += 9
    } else {
      // A transformed arc through m: the matrices compose.
      const sa = source[i + 1], sb = source[i + 2], sc = source[i + 3], sd = source[i + 4], se = source[i + 5], sf = source[i + 6]
      target.push(TARC, a * sa + c * sb, b * sa + d * sb, a * sc + c * sd, b * sc + d * sd, a * se + c * sf + e, b * se + d * sf + f)
      for (let k = i + 7; k < i + 13; k++) target.push(source[k])
      i += 13
    }
  }
}

/** A quarter ellipse as one cubic: 4/3·tan(π/8). */
const KAPPA = .5522847498307936

/**
 * Canvas's `roundRect`, appended to `out` as moves, lines, cubic corners and a
 * close, then a new subpath at (x, y). Radii follow Canvas: one to four, each a
 * number or an {x, y} pair, scaled down together when they would overlap.
 * Negative radii throw, as Canvas does; non-finite input adds nothing.
 */
export type Radii = Parameters<Path2D['roundRect']>[4]
export function roundRectCommands(out: number[], x: number, y: number, w: number, h: number, radii: Radii = 0) {
  if (![x, y, w, h].every(Number.isFinite)) return
  const list: (number | DOMPointInit)[] = typeof radii === 'number' || !(Symbol.iterator in Object(radii)) ? [radii as number | DOMPointInit] : [...radii as Iterable<number | DOMPointInit>]
  if (list.length < 1 || list.length > 4) throw new RangeError(`${list.length} radii provided. Between one and four radii are necessary.`)
  const corners = list.map(r => typeof r === 'number' ? { x: r, y: r } : { x: r.x ?? 0, y: r.y ?? 0 })
  for (const r of corners) {
    if (!Number.isFinite(r.x) || !Number.isFinite(r.y)) return
    if (r.x < 0 || r.y < 0) throw new RangeError('Radius value is negative.')
  }
  const [c0, c1 = c0, c2 = c0, c3 = c1] = corners
  // Canvas's order: upper left, upper right, lower right, lower left; two radii pair diagonally.
  let [ul, ur, lr, ll] = (corners.length === 1 ? [c0, c0, c0, c0] : corners.length === 2 ? [c0, c1, c0, c1] : corners.length === 3 ? [c0, c1, c2, c1] : [c0, c1, c2, c3]).map(r => ({ ...r }))
  // A negative width or height mirrors the rectangle; its corners swap sides.
  const sx = w < 0 ? -1 : 1, sy = h < 0 ? -1 : 1
  if (sx < 0) [ul, ur, lr, ll] = [ur, ul, ll, lr]
  if (sy < 0) [ul, ur, lr, ll] = [ll, lr, ur, ul]
  const aw = Math.abs(w), ah = Math.abs(h)
  const scale = Math.min(aw / (ul.x + ur.x), ah / (ur.y + lr.y), aw / (lr.x + ll.x), ah / (ul.y + ll.y))
  if (scale < 1) for (const r of [ul, ur, lr, ll]) { r.x *= scale; r.y *= scale }
  const left = Math.min(x, x + w), top = Math.min(y, y + h), right = left + aw, bottom = top + ah
  // Built on the normalised rectangle, then mirrored back so the path runs as Canvas's does.
  const px = (u: number) => sx < 0 ? left + right - u : u, py = (v: number) => sy < 0 ? top + bottom - v : v
  const point = (op: number, ...c: number[]) => { out.push(op); for (let k = 0; k < c.length; k += 2) out.push(px(c[k]), py(c[k + 1])) }
  const corner = (ax: number, ay: number, cx: number, cy: number, bx: number, by: number) =>
    point(CUBIC, ax + (cx - ax) * KAPPA, ay + (cy - ay) * KAPPA, bx + (cx - bx) * KAPPA, by + (cy - by) * KAPPA, bx, by)
  point(MOVE, left + ul.x, top)
  point(LINE, right - ur.x, top); corner(right - ur.x, top, right, top, right, top + ur.y)
  point(LINE, right, bottom - lr.y); corner(right, bottom - lr.y, right, bottom, right - lr.x, bottom)
  point(LINE, left + ll.x, bottom); corner(left + ll.x, bottom, left, bottom, left, bottom - ll.y)
  point(LINE, left, top + ul.y); corner(left, top + ul.y, left, top, left + ul.x, top)
  out.push(CLOSE, MOVE, x, y)
}

/**
 * SVG path data as commands in the shared encoding (arcs as ellipse pieces),
 * or null for data this parser does not read. Covers M L H V C S Q T A Z in
 * both cases, with SVG's implicit repetition.
 */
export function svgPathCommands(data: string): number[] | null {
  const tokens = data.match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g)
  if (!tokens) return []
  const out: number[] = []
  let i = 0, command = '', x = 0, y = 0, startX = 0, startY = 0, lastCubic: [number, number] | null = null, lastQuad: [number, number] | null = null
  const number = () => {
    const token = tokens[i]
    if (token === undefined || /[A-Za-z]/.test(token)) throw new Error('number expected')
    i++; return parseFloat(token)
  }
  // Arc flags may run together ("1 0" or "10"); read one digit when they do.
  const flag = () => {
    const token = tokens[i]
    if (token === undefined) throw new Error('flag expected')
    if (token === '0' || token === '1') { i++; return Number(token) }
    if (/^[01]/.test(token)) { tokens[i] = token.slice(1); return Number(token[0]) }
    throw new Error('flag expected')
  }
  try {
    while (i < tokens.length) {
      if (/[A-Za-z]/.test(tokens[i])) command = tokens[i++]
      else if (!command) return null
      const relative = command === command.toLowerCase(), ox = relative ? x : 0, oy = relative ? y : 0
      const upper = command.toUpperCase()
      if (upper === 'Z') { out.push(CLOSE); x = startX; y = startY; lastCubic = lastQuad = null; continue }
      if (upper === 'M') {
        x = ox + number(); y = oy + number(); startX = x; startY = y; out.push(MOVE, x, y)
        // Further pairs after a move are lines.
        command = relative ? 'l' : 'L'; lastCubic = lastQuad = null; continue
      }
      if (upper === 'L') { x = ox + number(); y = oy + number(); out.push(LINE, x, y); lastCubic = lastQuad = null }
      else if (upper === 'H') { x = ox + number(); out.push(LINE, x, y); lastCubic = lastQuad = null }
      else if (upper === 'V') { y = oy + number(); out.push(LINE, x, y); lastCubic = lastQuad = null }
      else if (upper === 'C' || upper === 'S') {
        let c1x: number, c1y: number
        if (upper === 'C') { c1x = ox + number(); c1y = oy + number() }
        else [c1x, c1y] = lastCubic ? [2 * x - lastCubic[0], 2 * y - lastCubic[1]] : [x, y]
        const c2x = ox + number(), c2y = oy + number(), ex = ox + number(), ey = oy + number()
        out.push(CUBIC, c1x, c1y, c2x, c2y, ex, ey); lastCubic = [c2x, c2y]; lastQuad = null; x = ex; y = ey
      } else if (upper === 'Q' || upper === 'T') {
        let cx: number, cy: number
        if (upper === 'Q') { cx = ox + number(); cy = oy + number() }
        else [cx, cy] = lastQuad ? [2 * x - lastQuad[0], 2 * y - lastQuad[1]] : [x, y]
        const ex = ox + number(), ey = oy + number()
        out.push(QUAD, cx, cy, ex, ey); lastQuad = [cx, cy]; lastCubic = null; x = ex; y = ey
      } else if (upper === 'A') {
        const rx0 = Math.abs(number()), ry0 = Math.abs(number()), rotation = number() * Math.PI / 180
        const large = flag(), sweep = flag(), ex = ox + number(), ey = oy + number()
        svgArc(out, x, y, rx0, ry0, rotation, !!large, !!sweep, ex, ey)
        x = ex; y = ey; lastCubic = lastQuad = null
      } else return null
    }
  } catch { return null }
  return out
}

/** An SVG endpoint arc as Canvas ellipse commands (SVG implementation notes, F.6). */
function svgArc(out: number[], x1: number, y1: number, rx: number, ry: number, phi: number, large: boolean, sweep: boolean, x2: number, y2: number) {
  if (x1 === x2 && y1 === y2) return
  if (!rx || !ry) { out.push(LINE, x2, y2); return }
  const cos = Math.cos(phi), sin = Math.sin(phi)
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2
  const xp = cos * dx + sin * dy, yp = -sin * dx + cos * dy
  const lambda = xp * xp / (rx * rx) + yp * yp / (ry * ry)
  if (lambda > 1) { const s = Math.sqrt(lambda); rx *= s; ry *= s }
  const numerator = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp
  const root = Math.sqrt(Math.max(0, numerator / (rx * rx * yp * yp + ry * ry * xp * xp))) * (large === sweep ? -1 : 1)
  const cxp = root * rx * yp / ry, cyp = -root * ry * xp / rx
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2, cy = sin * cxp + cos * cyp + (y1 + y2) / 2
  const angle = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)
  const start = angle(1, 0, (xp - cxp) / rx, (yp - cyp) / ry)
  let delta = angle((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry)
  if (!sweep && delta > 0) delta -= Math.PI * 2
  else if (sweep && delta < 0) delta += Math.PI * 2
  out.push(ELLIPSE, cx, cy, rx, ry, phi, start, start + delta, sweep ? 0 : 1)
}

/**
 * An arc or ellipse appended to `out` through `m` exactly as `appendTransformed`
 * would (a line to its start, then cubic pieces), without the intermediate lists.
 */
/** Canvas's sweep for an arc from `start` to `end`: a full turn or more draws the whole ellipse; otherwise it wraps into (0, 2π) in the drawing direction. */
export function arcSweep(start: number, end: number, ccw: boolean) {
  const tau = Math.PI * 2
  let sweep = end - start
  if (!ccw && sweep >= tau) return tau
  if (ccw && -sweep >= tau) return -tau
  sweep = ((sweep % tau) + tau) % tau
  return ccw && sweep !== 0 ? sweep - tau : sweep
}

export function appendArc(out: number[], m: Matrix, x: number, y: number, rx: number, ry: number, rotation: number, start: number, end: number, ccw: boolean) {
  const sweep = arcSweep(start, end, ccw)
  const cos = Math.cos(rotation), sin = Math.sin(rotation)
  // Ellipse parameter to local point, then through m.
  const ax = rx * cos, ay = rx * sin, bx = -ry * sin, by = ry * cos
  const pa = m.a * ax + m.c * ay, pb = m.b * ax + m.d * ay, qa = m.a * bx + m.c * by, qb = m.b * bx + m.d * by
  const ox = m.a * x + m.c * y + m.e, oy = m.b * x + m.d * y + m.f
  const count = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 2) - 1e-9)), step = sweep / count, k = 4 / 3 * Math.tan(step / 4)
  let c0 = Math.cos(start), s0 = Math.sin(start)
  out.push(LINE, ox + pa * c0 + qa * s0, oy + pb * c0 + qb * s0)
  for (let n = 0; n < count; n++) {
    const t1 = start + step * (n + 1), c1 = Math.cos(t1), s1 = Math.sin(t1)
    // Control points along the tangents (-sin, cos) at each end.
    const u0 = c0 - k * s0, v0 = s0 + k * c0, u1 = c1 + k * s1, v1 = s1 - k * c1
    out.push(CUBIC, ox + pa * u0 + qa * v0, oy + pb * u0 + qb * v0, ox + pa * u1 + qa * v1, oy + pb * u1 + qb * v1, ox + pa * c1 + qa * s1, oy + pb * c1 + qb * s1)
    c0 = c1; s0 = s1
  }
}

/** Canvas's arc sweep rules, as cubic Bézier pieces of at most a quarter turn. */
export function arcCubics(x: number, y: number, rx: number, ry: number, rotation: number, start: number, end: number, ccw: boolean) {
  const tau = Math.PI * 2
  let sweep = end - start
  // Canvas: a sweep of a full turn or more draws the whole ellipse; otherwise it wraps into (0, 2π) in the drawing direction.
  if (!ccw && sweep >= tau) sweep = tau
  else if (ccw && -sweep >= tau) sweep = -tau
  else {
    sweep = ((sweep % tau) + tau) % tau
    if (ccw && sweep !== 0) sweep -= tau
  }
  const cos = Math.cos(rotation), sin = Math.sin(rotation)
  const at = (t: number) => {
    const px = rx * Math.cos(t), py = ry * Math.sin(t)
    return [x + px * cos - py * sin, y + px * sin + py * cos] as const
  }
  const tangent = (t: number) => {
    const px = -rx * Math.sin(t), py = ry * Math.cos(t)
    return [px * cos - py * sin, px * sin + py * cos] as const
  }
  const count = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 2) - 1e-9)), step = sweep / count
  const k = 4 / 3 * Math.tan(step / 4), curves: number[][] = []
  for (let n = 0; n < count; n++) {
    const t0 = start + step * n, t1 = t0 + step, p0 = at(t0), p1 = at(t1), d0 = tangent(t0), d1 = tangent(t1)
    curves.push([p0[0] + d0[0] * k, p0[1] + d0[1] * k, p1[0] - d1[0] * k, p1[1] - d1[1] * k, p1[0], p1[1]])
  }
  return { start: at(start), curves }
}
