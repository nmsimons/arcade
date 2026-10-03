import { traceAthlete } from './athlete.ts'
import type { AthleteOutline } from './athlete.ts'
import type { Player, Platform } from './model.ts'
import type { Vec } from './geometry.ts'

const TOLERANCE = .2
const middle = (a: Vec, b: Vec): Vec => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]

/** Flatten the artwork's curves, not the player's rectangular collision body. */
export function athleteCasters(player: Player): Platform[] {
  const shapes: Platform[] = []
  let points: Vec[] = []
  const close = () => {
    if (points.length > 2) {
      const world = points.map(([x, y]): Vec => [player.x + x * player.facing, player.y + y * (player.inverted ? -1 : 1)])
      const x = Math.min(...world.map(p => p[0])), y = Math.min(...world.map(p => p[1]))
      shapes.push({ x, y, w: Math.max(...world.map(p => p[0])) - x, h: Math.max(...world.map(p => p[1])) - y,
        polygon: world.map(p => [p[0] - x, p[1] - y]) })
    }
    points = []
  }
  const curve = (control: Vec[], depth = 0) => {
    const a = control[0], b = control[control.length - 1], dx = b[0] - a[0], dy = b[1] - a[1]
    const length = Math.hypot(dx, dy)
    const flat = control.slice(1, -1).every(p => (length > .001
      ? Math.abs(dy * (p[0] - a[0]) - dx * (p[1] - a[1])) / length
      : Math.hypot(p[0] - a[0], p[1] - a[1])) <= TOLERANCE)
    if (flat || depth >= 8) { points.push(b); return }
    const left = [a], right = [b]
    let row = control
    while (row.length > 1) {
      row = row.slice(1).map((p, i) => middle(row[i], p))
      left.push(row[0]); right.unshift(row[row.length - 1])
    }
    curve(left, depth + 1); curve(right, depth + 1)
  }
  const path: AthleteOutline = {
    moveTo(x, y) { close(); points.push([x, y]) },
    lineTo(x, y) { points.push([x, y]) },
    quadraticCurveTo(cx, cy, x, y) { curve([points[points.length - 1], [cx, cy], [x, y]]) },
    bezierCurveTo(ax, ay, bx, by, x, y) { curve([points[points.length - 1], [ax, ay], [bx, by], [x, y]]) },
    // The shared outline uses complete ellipses for joints, palms and head.
    ellipse(x, y, rx, ry, angle) {
      close()
      const steps = Math.max(8, Math.ceil(Math.PI / Math.acos(1 - Math.min(1, TOLERANCE / Math.max(rx, ry)))))
      const c = Math.cos(angle), s = Math.sin(angle)
      for (let i = 0; i < steps; i++) {
        const t = -i * Math.PI * 2 / steps, u = rx * Math.cos(t), v = ry * Math.sin(t)
        points.push([x + u * c - v * s, y + u * s + v * c])
      }
    },
    closePath: close,
  }
  traceAthlete(path, player); close()
  return shapes
}
