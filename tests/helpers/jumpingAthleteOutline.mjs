import { traceAthlete } from '../../src/games/jumping/athlete.ts'

/** Sample the actual rendered paths, including rounded belly, elbows and palms,
 * rather than assuming that a spine or bone center represents the silhouette. */
export function athleteOutlinePoints(player) {
  const points = []
  let last = [0, 0], start = last
  const point = (x, y) => { last = [x, y]; points.push(last) }
  const curve = (controls, end) => {
    const from = last
    for (let i = 1; i <= 24; i++) {
      const t = i / 24, u = 1 - t
      const weights = controls.length === 0 ? [u, t] : controls.length === 1 ? [u * u, 2 * u * t, t * t]
        : [u ** 3, 3 * u * u * t, 3 * u * t * t, t ** 3]
      const vertices = [from, ...controls, end]
      point(...[0, 1].map(axis => vertices.reduce((sum, vertex, j) => sum + vertex[axis] * weights[j], 0)))
    }
  }
  traceAthlete({
    moveTo(x, y) { point(x, y); start = last },
    lineTo(x, y) { curve([], [x, y]) },
    quadraticCurveTo(x, y, endX, endY) { curve([[x, y]], [endX, endY]) },
    bezierCurveTo(x, y, x2, y2, endX, endY) { curve([[x, y], [x2, y2]], [endX, endY]) },
    ellipse(x, y, rx, ry, angle, from, to) {
      const cos = Math.cos(angle), sin = Math.sin(angle)
      for (let i = 0; i <= 64; i++) {
        const t = from + (to - from) * i / 64, dx = Math.cos(t) * rx, dy = Math.sin(t) * ry
        point(x + dx * cos - dy * sin, y + dx * sin + dy * cos)
        if (!i) start = last
      }
    },
    closePath() { curve([], start) },
  }, player)
  return points
}
