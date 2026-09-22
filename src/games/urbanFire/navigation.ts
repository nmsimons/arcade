import { FIELD } from './types.ts'
import type { Vector2, Wall } from './types'

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
export const distance = (a: Vector2, b: Vector2) => Math.hypot(a.x - b.x, a.y - b.y)
export const angleDelta = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b))

/** Slab intersection includes grazes and segments beginning inside a building. */
export function segmentEntry(a: Vector2, b: Vector2, wall: Wall, pad = 0): number | null {
  if (wall.angle) {
    const cx=wall.x+wall.width/2,cy=wall.y+wall.height/2,c=Math.cos(wall.angle),s=Math.sin(wall.angle)
    const local=(p:Vector2)=>({x:cx+(p.x-cx)*c+(p.y-cy)*s,y:cy-(p.x-cx)*s+(p.y-cy)*c})
    a=local(a);b=local(b)
  }
  let near = 0, far = 1
  for (const [start, delta, low, high] of [
    [a.x, b.x - a.x, wall.x - pad, wall.x + wall.width + pad],
    [a.y, b.y - a.y, wall.y - pad, wall.y + wall.height + pad],
  ]) {
    if (Math.abs(delta) < 1e-9) { if (start < low || start > high) return null; continue }
    const t0 = (low - start) / delta, t1 = (high - start) / delta
    near = Math.max(near, Math.min(t0, t1)); far = Math.min(far, Math.max(t0, t1))
    if (near > far) return null
  }
  return near
}
export const intersects = (a: Vector2,b: Vector2,wall: Wall,pad=0) => segmentEntry(a,b,wall,pad)!==null
export const clear = (a: Vector2, b: Vector2, walls: Wall[], pad = 0) => !walls.some(w => intersects(a, b, w, pad))
export const openPoint = (p: Vector2, walls: Wall[], pad = 30) => p.x >= pad && p.y >= pad &&
  p.x <= FIELD.width - pad && p.y <= FIELD.height - pad && clear(p, p, walls, pad)

// The graph is built once for this fixed battlefield. Corners use real hull
// clearance, avoiding coarse-grid gaps and blocked final waypoints.
export function createNavigator(walls: Wall[]) {
  const pad = 30
  const nodes: Vector2[] = []
  for (const w of walls) for (const x of [w.x - pad - 1, w.x + w.width + pad + 1]) {
    for (const y of [w.y - pad - 1, w.y + w.height + pad + 1]) {
      const p = { x, y }
      if (openPoint(p, walls, pad)) nodes.push(p)
    }
  }
  const links = nodes.map(() => [] as { index: number; cost: number }[])
  nodes.forEach((a, i) => nodes.forEach((b, j) => {
    if (j <= i || !clear(a, b, walls, pad)) return
    const cost = distance(a, b)
    links[i].push({ index: j, cost }); links[j].push({ index: i, cost })
  }))
  return (start: Vector2, goal: Vector2): Vector2[] => {
    if (!openPoint(goal, walls, pad)) return []
    if (clear(start, goal, walls, pad)) return [{ ...goal }]
    const points = [...nodes, start, goal], n = points.length, end = n - 1
    const edges = links.map(list => [...list]).concat([[], []])
    for (const i of [n - 2, end]) for (let j = 0; j < i; j++) {
      if (!clear(points[i], points[j], walls, pad)) continue
      const cost = distance(points[i], points[j])
      edges[i].push({ index: j, cost }); edges[j].push({ index: i, cost })
    }
    const costs = Array(n).fill(Infinity), previous = Array(n).fill(-1), visited = new Set<number>()
    costs[n - 2] = 0
    for (let step = 0; step < n; step++) {
      let best = -1
      for (let i = 0; i < n; i++) if (!visited.has(i) && (best < 0 || costs[i] < costs[best])) best = i
      if (best < 0 || costs[best] === Infinity) return []
      if (best === end) {
        const path: Vector2[] = []
        for (let i = end; i !== n - 2; i = previous[i]) path.unshift({ ...points[i] })
        return path
      }
      visited.add(best)
      for (const edge of edges[best]) if (costs[best] + edge.cost < costs[edge.index]) {
        costs[edge.index] = costs[best] + edge.cost; previous[edge.index] = best
      }
    }
    return []
  }
}
