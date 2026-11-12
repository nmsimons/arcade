/**
 * Path geometry for the WebGL renderer, in world units: flattening Canvas path
 * commands into polylines, and the triangles that fill and stroke them. Pure
 * functions, so Node unit tests can check them without a GPU.
 *
 * Vertices are written as [x, y, mode, across, half] floats per vertex:
 * mode 0 is solid; mode 1 is a thin stroke whose coverage the fragment shader
 * computes from `across` (signed distance from the centre line) and `half`
 * (half the line width), both in world units.
 */
import { MOVE, LINE, QUAD, CUBIC, CLOSE, TARC, ARGUMENTS, arcSweep } from './artPath.ts'

export interface Contour { points: number[]; closed: boolean }
export const FLOATS_PER_VERTEX = 5
export const SOLID = 0, THIN = 1

/**
 * Polylines for normalised commands (moves, lines, curves and closes, already
 * in world space). Follows Canvas: a line or curve with no current point starts
 * a subpath, a new subpath after a close starts where the closed one did, and
 * repeated points are dropped. Curves are split until no piece strays more than
 * `tolerance` from its chord.
 */
export function flatten(commands: readonly number[], tolerance: number): Contour[] {
  const contours: Contour[] = []
  let current: Contour | undefined, startX = 0, startY = 0, x = 0, y = 0, hasPoint = false
  const begin = (px: number, py: number) => {
    current = { points: [px, py], closed: false }; contours.push(current)
    startX = x = px; startY = y = py; hasPoint = true
  }
  const add = (px: number, py: number) => {
    if (!current) { begin(px, py); return }
    const n = current.points.length
    if (current.points[n - 2] !== px || current.points[n - 1] !== py) current.points.push(px, py)
    x = px; y = py
  }
  // A drawing command after a close continues from the closed subpath's start.
  const ensure = (px: number, py: number) => {
    if (!hasPoint) begin(px, py)
    else if (!current) begin(x, y)
  }
  let i = 0
  while (i < commands.length) {
    const op = commands[i], a = i + 1; i += 1 + ARGUMENTS[op]
    if (op === MOVE) begin(commands[a], commands[a + 1])
    else if (op === LINE) { ensure(commands[a], commands[a + 1]); add(commands[a], commands[a + 1]) }
    else if (op === TARC) {
      // Points straight off the ellipse, as Canvas draws arcs exactly: a line to its start, then
      // pieces whose sagitta at the larger radius, through the matrix, stays within the tolerance.
      const ma = commands[a], mb = commands[a + 1], mc = commands[a + 2], md = commands[a + 3], cx = commands[a + 4], cy = commands[a + 5]
      const rx = commands[a + 6], ry = commands[a + 7], rotation = commands[a + 8], start = commands[a + 9]
      const sweep = arcSweep(start, commands[a + 10], !!commands[a + 11])
      const cos = Math.cos(rotation), sin = Math.sin(rotation)
      const pa = ma * rx * cos + mc * rx * sin, pb = mb * rx * cos + md * rx * sin, qa = -ma * ry * sin + mc * ry * cos, qb = -mb * ry * sin + md * ry * cos
      const radius = Math.max(Math.hypot(pa, pb), Math.hypot(qa, qb))
      const step = radius > tolerance ? 2 * Math.acos(1 - tolerance / radius) : Math.PI / 2
      const n = Math.min(256, Math.max(1, Math.ceil(Math.abs(sweep) / step)))
      const sx = cx + pa * Math.cos(start) + qa * Math.sin(start), sy = cy + pb * Math.cos(start) + qb * Math.sin(start)
      ensure(sx, sy); add(sx, sy)
      for (let k = 1; k <= n; k++) {
        const t = start + sweep * k / n, c = Math.cos(t), s = Math.sin(t)
        add(cx + pa * c + qa * s, cy + pb * c + qb * s)
      }
    }
    else if (op === QUAD) {
      ensure(commands[a], commands[a + 1])
      const [x0, y0, cx, cy, x1, y1] = [x, y, commands[a], commands[a + 1], commands[a + 2], commands[a + 3]]
      const deviation = Math.hypot(x0 - 2 * cx + x1, y0 - 2 * cy + y1)
      const n = Math.min(128, Math.max(1, Math.ceil(Math.sqrt(deviation / (4 * tolerance)))))
      for (let k = 1; k <= n; k++) {
        const t = k / n, u = 1 - t
        add(u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1)
      }
    } else if (op === CUBIC) {
      ensure(commands[a], commands[a + 1])
      const [x0, y0, c1x, c1y, c2x, c2y, x1, y1] = [x, y, ...commands.slice(a, a + 6)]
      const deviation = Math.max(Math.hypot(x0 - 2 * c1x + c2x, y0 - 2 * c1y + c2y), Math.hypot(c1x - 2 * c2x + x1, c1y - 2 * c2y + y1))
      const n = Math.min(128, Math.max(1, Math.ceil(Math.sqrt(3 * deviation / (4 * tolerance)))))
      for (let k = 1; k <= n; k++) {
        const t = k / n, u = 1 - t
        add(u * u * u * x0 + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * x1,
          u * u * u * y0 + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * y1)
      }
    } else if (op === CLOSE) {
      if (current) {
        current.closed = true
        // A closing point equal to the start adds nothing.
        const p = current.points, n = p.length
        if (n > 2 && p[n - 2] === p[0] && p[n - 1] === p[1]) p.length = n - 2
      }
      current = undefined; x = startX; y = startY
    }
  }
  // A lone point draws nothing, as in Canvas (rect() leaves one behind).
  return contours.filter(c => c.points.length >= 4)
}

/** A single closed contour that turns one way only, once: its fan needs no stencil. */
export function isConvex(contours: readonly Contour[]) {
  return contours.length === 1 && convexOutline(contours[0].points)
}

/** Twice the signed area an outline encloses (positive turning from +x towards +y), closing it. */
export function signedArea(p: readonly number[]) {
  let area = 0
  const n = p.length / 2
  for (let k = 0; k < n; k++) {
    const j = k + 1 === n ? 0 : k + 1
    area += p[2 * k] * p[2 * j + 1] - p[2 * j] * p[2 * k + 1]
  }
  return area
}

/** An outline that turns one way only, once. */
export function convexOutline(p: readonly number[]) {
  const n = p.length / 2
  if (n < 3) return false
  // Every turn the same way, and the edges' vertical direction changes at most twice around:
  // a polygon that turns one way but winds twice (a star) changes it four times or more.
  let sign = 0, flips = 0, first = 0, last = 0
  for (let k = 0; k < n; k++) {
    const ax = p[2 * k], ay = p[2 * k + 1], k1 = k + 1 === n ? 0 : k + 1, k2 = k1 + 1 === n ? 0 : k1 + 1
    const bx = p[2 * k1], by = p[2 * k1 + 1], cx = p[2 * k2], cy = p[2 * k2 + 1]
    const cross = (bx - ax) * (cy - by) - (by - ay) * (cx - bx)
    if (Math.abs(cross) > 1e-9) {
      const s = cross > 0 ? 1 : -1
      if (sign && s !== sign) return false
      sign = s
    }
    const dy = by - ay
    if (dy !== 0) {
      const d = dy > 0 ? 1 : -1
      if (!first) first = d
      else if (d !== last) flips++
      last = d
    }
  }
  if (first && last !== first) flips++
  return sign !== 0 && flips <= 2
}

const vertex = (out: number[], x: number, y: number, mode = SOLID, across = 0, half = 0) => { out.push(x, y, mode, across, half) }

/** Fan triangles from each contour's first point. Every contour counts, open or not: fills close them. */
export function fanTriangles(contours: readonly Contour[], out: number[]) {
  for (const { points: p } of contours) {
    for (let k = 2; k + 3 < p.length; k += 2) {
      vertex(out, p[0], p[1]); vertex(out, p[k], p[k + 1]); vertex(out, p[k + 2], p[k + 3])
    }
  }
}

export interface StrokeStyle { width: number; cap: CanvasLineCap; join: CanvasLineJoin; miterLimit: number }

/**
 * Triangles covering a stroke of at least about two device pixels; overlaps
 * are allowed (the renderer draws each sample once). `step` bounds the length
 * of each piece of a round cap or join's arc.
 */
export function strokeTriangles(contours: readonly Contour[], style: StrokeStyle, step: number, out: number[]) {
  const h = style.width / 2
  const quad = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number) => {
    vertex(out, ax, ay); vertex(out, bx, by); vertex(out, cx, cy)
    vertex(out, ax, ay); vertex(out, cx, cy); vertex(out, dx, dy)
  }
  const fan = (x: number, y: number, from: number, sweep: number) => {
    const n = Math.max(1, Math.ceil(Math.abs(sweep) * h / step))
    for (let k = 0; k < n; k++) {
      const t0 = from + sweep * k / n, t1 = from + sweep * (k + 1) / n
      vertex(out, x, y); vertex(out, x + Math.cos(t0) * h, y + Math.sin(t0) * h); vertex(out, x + Math.cos(t1) * h, y + Math.sin(t1) * h)
    }
  }
  for (const { points: p, closed } of contours) {
    const n = p.length / 2
    if (n < 2) continue
    const segments = closed ? n : n - 1
    const normal = (k: number) => {
      const ax = p[2 * k], ay = p[2 * k + 1], bx = p[2 * ((k + 1) % n)], by = p[2 * ((k + 1) % n) + 1]
      const length = Math.hypot(bx - ax, by - ay) || 1
      return [-(by - ay) / length, (bx - ax) / length] as const
    }
    for (let k = 0; k < segments; k++) {
      const ax = p[2 * k], ay = p[2 * k + 1], bx = p[2 * ((k + 1) % n)], by = p[2 * ((k + 1) % n) + 1]
      const [nx, ny] = normal(k)
      quad(ax + nx * h, ay + ny * h, bx + nx * h, by + ny * h, bx - nx * h, by - ny * h, ax - nx * h, ay - ny * h)
    }
    // Joins at every interior vertex, and at the start of a closed contour.
    for (let k = closed ? 0 : 1; k < (closed ? n : n - 1); k++) {
      const previous = (k - 1 + segments) % segments, [n0x, n0y] = normal(previous), [n1x, n1y] = normal(k)
      const x = p[2 * k], y = p[2 * k + 1]
      const cross = n0x * n1y - n0y * n1x, dot = n0x * n1x + n0y * n1y
      if (Math.abs(cross) < 1e-9 && dot > 0) continue
      // The outer side of the turn is opposite the direction it turns.
      const side = cross > 0 ? -1 : 1
      const ax = n0x * side, ay = n0y * side, bx = n1x * side, by = n1y * side
      if (style.join === 'round') {
        const from = Math.atan2(ay, ax), sweep = Math.atan2(ax * by - ay * bx, ax * bx + ay * by)
        fan(x, y, from, sweep)
      } else {
        vertex(out, x, y); vertex(out, x + ax * h, y + ay * h); vertex(out, x + bx * h, y + by * h)
        if (style.join === 'miter') {
          // The miter tip lies along the bisector; Canvas bevels when it is longer than miterLimit times half the width.
          const mx = ax + bx, my = ay + by, m = Math.hypot(mx, my)
          const length = m > 1e-9 ? 2 / m : Infinity
          if (length <= style.miterLimit) {
            const tx = x + mx / m * h * length, ty = y + my / m * h * length
            vertex(out, x + ax * h, y + ay * h); vertex(out, tx, ty); vertex(out, x + bx * h, y + by * h)
          }
        }
      }
    }
    if (!closed && style.cap !== 'butt') {
      // The start cap faces back along the first segment, the end cap on along the last.
      for (const [end, k, outward] of [[0, 0, -1], [n - 1, n - 2, 1]] as const) {
        const x = p[2 * end], y = p[2 * end + 1], [nx, ny] = normal(k)
        // The normal is the direction turned a quarter: (ux, uy) = (ny, -nx).
        const ox = ny * outward, oy = -nx * outward
        // A half turn from the normal passes through the outward direction.
        if (style.cap === 'round') fan(x, y, Math.atan2(ny, nx), -Math.PI * outward)
        else quad(x + nx * h, y + ny * h, x + nx * h + ox * h, y + ny * h + oy * h, x - nx * h + ox * h, y - ny * h + oy * h, x - nx * h, y - ny * h)
      }
    }
  }
}

/**
 * Quads for a stroke thinner than about two device pixels. Each segment is
 * widened by `fringe` past its edges, and the fragment shader computes the
 * exact box-filtered coverage across the line, as Canvas does, so a hairline
 * keeps a steady brightness as the camera moves. Segments run on past interior
 * joins and square or round caps by half the width; ends are cut square.
 */
export function thinStrokeQuads(contours: readonly Contour[], style: StrokeStyle, fringe: number, out: number[]) {
  const h = style.width / 2, reach = h + fringe
  for (const { points: p, closed } of contours) {
    const n = p.length / 2
    if (n < 2) continue
    const segments = closed ? n : n - 1
    for (let k = 0; k < segments; k++) {
      const ax = p[2 * k], ay = p[2 * k + 1], bx = p[2 * ((k + 1) % n)], by = p[2 * ((k + 1) % n) + 1]
      const length = Math.hypot(bx - ax, by - ay)
      if (!length) continue
      const ux = (bx - ax) / length, uy = (by - ay) / length, nx = -uy, ny = ux
      const startOpen = !closed && k === 0, endOpen = !closed && k === segments - 1
      const before = startOpen ? (style.cap === 'butt' ? 0 : h) : h, after = endOpen ? (style.cap === 'butt' ? 0 : h) : h
      const sx = ax - ux * before, sy = ay - uy * before, ex = bx + ux * after, ey = by + uy * after
      const corners = [[sx + nx * reach, sy + ny * reach, reach], [ex + nx * reach, ey + ny * reach, reach],
        [ex - nx * reach, ey - ny * reach, -reach], [sx - nx * reach, sy - ny * reach, -reach]]
      for (const c of [0, 1, 2, 0, 2, 3]) vertex(out, corners[c][0], corners[c][1], THIN, corners[c][2], h)
    }
  }
}

/**
 * Triangles for one simple outline by ear clipping, or false when the outline
 * crosses itself or is too long to clip quickly; the stencil then draws it.
 * Collinear and repeated points are dropped without triangles. The outline is
 * a linked ring; only reflex vertices can lie inside an ear, so only they are
 * tested, and the search goes on from the last ear rather than starting over.
 */
export function earClip(points: readonly number[], out: number[], limit = 600): boolean {
  const n = points.length / 2
  if (n < 3) return true
  if (n > limit) return false
  let area = 0
  for (let k = 0; k < n; k++) {
    const j = k + 1 === n ? 0 : k + 1
    area += points[2 * k] * points[2 * j + 1] - points[2 * j] * points[2 * k + 1]
  }
  const x = (k: number) => points[2 * k], y = (k: number) => points[2 * k + 1]
  const cross = (a: number, b: number, c: number) => (x(b) - x(a)) * (y(c) - y(a)) - (y(b) - y(a)) * (x(c) - x(a))
  if (Math.abs(area) < 1e-12) {
    // No net area: a line draws nothing, but lobes that cancel (a bowtie) crossed.
    let far = -1
    for (let k = 0; k < n && far < 0; k++) if (x(k) !== x(0) || y(k) !== y(0)) far = k
    if (far < 0) return true
    for (let k = 0; k < n; k++) if (Math.abs(cross(0, far, k)) >= 1e-12) return false
    return true
  }
  const orientation = area > 0 ? 1 : -1
  const next = new Int32Array(n), previous = new Int32Array(n), reflex = new Uint8Array(n)
  for (let k = 0; k < n; k++) { next[k] = k + 1 === n ? 0 : k + 1; previous[k] = k === 0 ? n - 1 : k - 1 }
  const turn = (b: number) => cross(previous[b], b, next[b]) * orientation
  for (let k = 0; k < n; k++) reflex[k] = turn(k) < 0 ? 1 : 0
  const triangles: number[] = []
  let remaining = n, at = 0, guard = 0
  while (remaining > 3) {
    if (++guard > 4 * n * n) return false
    const a = previous[at], b = at, c = next[at], t = turn(b)
    let ear = false, drop = false
    if (Math.abs(t) < 1e-12) drop = true
    else if (t > 0) {
      // An ear holds no reflex vertex of the remaining ring, on its edges included.
      ear = true
      for (let p = next[c]; p !== a; p = next[p]) {
        if (!reflex[p] || (x(p) === x(a) && y(p) === y(a)) || (x(p) === x(b) && y(p) === y(b)) || (x(p) === x(c) && y(p) === y(c))) continue
        if (cross(a, b, p) * orientation >= 0 && cross(b, c, p) * orientation >= 0 && cross(c, a, p) * orientation >= 0) { ear = false; break }
      }
    }
    if (ear || drop) {
      if (ear) triangles.push(a, b, c)
      next[a] = c; previous[c] = a; remaining--
      reflex[a] = turn(a) < 0 ? 1 : 0; reflex[c] = turn(c) < 0 ? 1 : 0
      guard = 0
      at = a
    } else {
      at = c
      // A full lap without an ear: give the outline to the stencil.
      if (guard > remaining) return false
    }
  }
  if (Math.abs(cross(previous[at], at, next[at])) > 1e-12) triangles.push(previous[at], at, next[at])
  // A simple outline's triangles cover exactly its area; anything else crossed itself.
  let covered = 0
  for (let t = 0; t < triangles.length; t += 3) covered += Math.abs(cross(triangles[t], triangles[t + 1], triangles[t + 2]))
  if (Math.abs(covered - Math.abs(area)) > 1e-6 * Math.abs(area) + 1e-9) return false
  for (const k of triangles) vertex(out, x(k), y(k))
  return true
}

/**
 * A dashed stroke's pieces, as open contours: Canvas restarts the pattern on
 * every subpath at `offset`, runs it on around a closed one's closing side, and
 * caps every dash. `pattern` has an even length and a positive sum.
 */
export function dashContours(contours: readonly Contour[], pattern: readonly number[], offset: number): Contour[] {
  const total = pattern.reduce((sum, d) => sum + d, 0), out: Contour[] = []
  for (const { points: p, closed } of contours) {
    const n = p.length / 2, segments = closed ? n : n - 1
    // Where in the pattern the subpath starts.
    let phase = ((offset % total) + total) % total, index = 0
    while (phase >= pattern[index]) { phase -= pattern[index]; index = (index + 1) % pattern.length }
    let remaining = pattern[index] - phase, on = index % 2 === 0
    let current: number[] | null = on ? [p[0], p[1]] : null
    for (let k = 0; k < segments; k++) {
      const ax = p[2 * k], ay = p[2 * k + 1], bx = p[2 * ((k + 1) % n)], by = p[2 * ((k + 1) % n) + 1]
      const length = Math.hypot(bx - ax, by - ay)
      let at = 0
      while (length - at > remaining) {
        at += remaining
        const t = at / length, x = ax + (bx - ax) * t, y = ay + (by - ay) * t
        if (on) { current!.push(x, y); if (current!.length >= 4) out.push({ points: current!, closed: false }); current = null }
        else current = [x, y]
        index = (index + 1) % pattern.length; on = !on; remaining = pattern[index]
      }
      remaining -= length - at
      if (on) current!.push(bx, by)
    }
    if (on && current && current.length >= 4) out.push({ points: current, closed: false })
  }
  return out
}

/** World-space bounds of contours, or null when empty. */
export function bounds(contours: readonly Contour[], pad = 0) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const { points: p } of contours) for (let k = 0; k < p.length; k += 2) {
    x0 = Math.min(x0, p[k]); x1 = Math.max(x1, p[k]); y0 = Math.min(y0, p[k + 1]); y1 = Math.max(y1, p[k + 1])
  }
  return x0 > x1 ? null : { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad }
}

/** Two triangles over a rectangle. */
export function rectTriangles(r: { x0: number; y0: number; x1: number; y1: number }, out: number[]) {
  vertex(out, r.x0, r.y0); vertex(out, r.x1, r.y0); vertex(out, r.x1, r.y1)
  vertex(out, r.x0, r.y0); vertex(out, r.x1, r.y1); vertex(out, r.x0, r.y1)
}
