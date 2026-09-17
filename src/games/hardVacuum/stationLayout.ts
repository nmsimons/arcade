import type { Vector2 } from './types'
import { pointInPolygon } from './worldGeometry.ts'
import { CAMPAIGN_CHAMBERS, CAMPAIGN_PASSAGES } from './campaignWorld.ts'

const polygon = (points: number[][]): Vector2[] => points.map(([x, y]) => ({ x, y }))

// Excavated chambers follow the fracture; equipment bays interrupt the rock.
// Bounds used for sector names/spawning do not define any physical walls.
export const CHAMBERS: Record<string, Vector2[]> = {
  ...CAMPAIGN_CHAMBERS,
  haven: polygon([[1170,1000],[1230,865],[1380,810],[1500,820],[1600,780],[1755,830],[1830,975],[1785,1110],[1810,1230],[1745,1375],[1590,1415],[1440,1360],[1270,1390],[1180,1270]]),
  salvage: polygon([[290,800],[500,785],[650,835],[735,940],[810,1040],[800,1220],[690,1350],[490,1430],[285,1355],[180,1260],[185,1170],[250,1130],[195,1030],[210,900]]),
  foundry: polygon([[220,285],[320,210],[465,185],[600,225],[700,210],[810,295],[785,445],[725,510],[625,610],[450,625],[315,565],[205,450]]),
  archive: polygon([[1210,330],[1300,220],[1430,195],[1520,230],[1680,205],[1805,315],[1810,400],[1720,565],[1570,610],[1440,565],[1280,580],[1170,470]]),
  reactor: polygon([[2220,980],[2250,865],[2400,785],[2530,830],[2700,825],[2810,980],[2795,1170],[2710,1335],[2590,1405],[2450,1385],[2280,1280],[2210,1150]]),
  engine: polygon([[2390,1590],[2580,1565],[2690,1625],[2805,1785],[2800,1905],[2740,1970],[2540,2035],[2350,2000],[2210,1870],[2175,1740],[2280,1650]]),
  vault: polygon([[1350,1595],[1510,1550],[1700,1620],[1830,1760],[1780,1905],[1620,1990],[1420,2020],[1220,1910],[1165,1780],[1220,1680]]),
}
export const PASSAGES = [
  ...CAMPAIGN_PASSAGES,
  { rooms: ['salvage', 'haven'], gate: 'rubble', shape: polygon([[760,1030],[870,1000],[950,1000],[1020,1000],[1120,975],[1250,1010],[1260,1160],[1130,1210],[1020,1200],[950,1200],[860,1160],[770,1180]]) },
  { rooms: ['foundry', 'salvage'], gate: 'foundry', shape: polygon([[405,580],[590,580],[600,660],[600,720],[645,775],[625,880],[475,875],[450,790],[400,720],[400,660]]) },
  { rooms: ['foundry', 'archive'], gate: 'archive', shape: polygon([[745,310],[880,285],[950,300],[1020,300],[1110,260],[1250,315],[1240,450],[1100,490],[1020,500],[950,500],[865,455],[750,475]]) },
  { rooms: ['archive', 'haven'], gate: 'shortcut', shape: polygon([[1400,540],[1590,550],[1600,640],[1600,720],[1660,800],[1600,905],[1400,915],[1360,795],[1400,720],[1400,640]]) },
  { rooms: ['haven', 'reactor'], gate: 'reactor', shape: polygon([[1750,1010],[1880,965],[1950,1000],[2020,1000],[2120,1040],[2270,1000],[2290,1160],[2125,1210],[2020,1200],[1950,1200],[1860,1150],[1770,1200]]) },
  { rooms: ['reactor', 'engine'], shape: polygon([[2440,1320],[2600,1330],[2620,1470],[2605,1585],[2550,1690],[2390,1650],[2400,1510],[2370,1440]]) },
  { rooms: ['haven', 'vault'], gate: 'blast', shape: polygon([[1420,1320],[1575,1370],[1600,1450],[1600,1520],[1660,1590],[1630,1685],[1440,1710],[1350,1600],[1400,1520],[1400,1450]]) },
  { rooms: ['vault', 'engine'], gate: 'drive', shape: polygon([[1740,1700],[1870,1660],[1950,1700],[2020,1700],[2130,1680],[2280,1720],[2280,1860],[2120,1920],[2020,1900],[1950,1900],[1840,1850],[1750,1890]]) },
]

type Edge = [Vector2, Vector2]
const cross = (a: Vector2, b: Vector2) => a.x * b.y - a.y * b.x
const subtract = (a: Vector2, b: Vector2) => ({ x: a.x - b.x, y: a.y - b.y })
const vertexKey = (p: Vector2) => `${Math.round(p.x * 10000)},${Math.round(p.y * 10000)}`
const area = (p: Vector2[]) => p.reduce((sum, a, i) => sum + cross(a, p[(i + 1) % p.length]), 0) / 2

/** Union the authored spaces once. Shared room/passage edges disappear, so
 * drawing, collision and raycasts all use the very same continuous contours. */
function outline(spaces: Vector2[][]) {
  const edges: Edge[] = spaces.flatMap(shape => shape.map((p, i): Edge => [p, shape[(i + 1) % shape.length]]))
  const open = (p: Vector2) => spaces.some(shape => pointInPolygon(p, shape))
  const exposed = new Map<string, Edge>()
  for (const [a, b] of edges) {
    const d = subtract(b, a), length = Math.hypot(d.x, d.y), cuts = [0, 1]
    for (const [c, e] of edges) {
      const v = subtract(e, c), offset = subtract(c, a), denom = cross(d, v)
      if (Math.abs(denom) < 1e-8) {
        if (Math.abs(cross(offset, d)) < 1e-8) for (const p of [c, e]) cuts.push(((p.x - a.x) * d.x + (p.y - a.y) * d.y) / (length * length))
        continue
      }
      const t = cross(offset, v) / denom, u = cross(offset, d) / denom
      if (u >= 0 && u <= 1) cuts.push(t)
    }
    const sorted = [...new Set(cuts.filter(t => t >= 0 && t <= 1))].sort((x, y) => x - y)
    for (let i = 1; i < sorted.length; i++) {
      const lo = sorted[i - 1], hi = sorted[i]
      if ((hi - lo) * length < 0.001) continue
      const mid = { x: a.x + d.x * (lo + hi) / 2, y: a.y + d.y * (lo + hi) / 2 }
      const normal = { x: -d.y / length * 0.01, y: d.x / length * 0.01 }
      const left = open({ x: mid.x + normal.x, y: mid.y + normal.y })
      const right = open({ x: mid.x - normal.x, y: mid.y - normal.y })
      if (left === right) continue
      const p = { x: a.x + d.x * lo, y: a.y + d.y * lo }, q = { x: a.x + d.x * hi, y: a.y + d.y * hi }
      const edge: Edge = left ? [p, q] : [q, p]
      exposed.set(vertexKey(edge[0]), edge)
    }
  }
  const loops: Vector2[][] = []
  while (exposed.size) {
    const first = exposed.values().next().value!
    const loop: Vector2[] = [], start = vertexKey(first[0])
    let key = start
    do {
      const edge = exposed.get(key)
      if (!edge) throw new Error('Station contour is not closed')
      loop.push(edge[0]); exposed.delete(key); key = vertexKey(edge[1])
    } while (key !== start)
    loops.push(loop)
  }
  loops.sort((a, b) => Math.abs(area(b)) - Math.abs(area(a)))
  return { boundary: loops[0], islands: loops.slice(1), walls: loops.flatMap(shape => shape.map((p, i): Edge => [p, shape[(i + 1) % shape.length]])) }
}
export const STATION_TERRAIN = outline([...Object.values(CHAMBERS), ...PASSAGES.map(p => p.shape)])
