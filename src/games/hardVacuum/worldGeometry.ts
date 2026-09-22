import type { Vector2 } from './types'

// Retained prototype arenas are menu demonstrations and geometry test fixtures.
// Campaign dimensions/topology live in campaignWorld.ts and stationLayout.ts.
export const DEMO_WIDTH = 3000
export const DEMO_HEIGHT = 2200
export const DEMO_CENTER: Vector2 = { x: DEMO_WIDTH / 2, y: DEMO_HEIGHT / 2 }

export interface CavernMap {
  containedRadiation?: readonly string[]
  id: number
  name: string
  boundary: readonly Vector2[]
  obstacles: readonly (readonly Vector2[])[]
}

// The outer shell stays broad and predictable while the internal formations
// create each map's routes. Keeping formations isolated means every asteroid
// remains reachable from the central mining base.
export const CAVERN_POINTS: readonly Vector2[] = [
  { x: 610, y: 150 },
  { x: 1450, y: 70 },
  { x: 2310, y: 155 },
  { x: 2800, y: 500 },
  { x: 2930, y: 1070 },
  { x: 2800, y: 1660 },
  { x: 2310, y: 2040 },
  { x: 1490, y: 2140 },
  { x: 670, y: 2040 },
  { x: 200, y: 1680 },
  { x: 70, y: 1090 },
  { x: 190, y: 500 },
]

const barrier = (cx: number, cy: number, width: number, height: number, rotation = 0): readonly Vector2[] => {
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)
  const halfWidth = width / 2
  const halfHeight = height / 2
  return [
    { x: -halfWidth, y: -halfHeight },
    { x: halfWidth, y: -halfHeight },
    { x: halfWidth, y: halfHeight },
    { x: -halfWidth, y: halfHeight },
  ].map((point) => ({
    x: cx + point.x * cos - point.y * sin,
    y: cy + point.x * sin + point.y * cos,
  }))
}

const pillar = (
  cx: number,
  cy: number,
  radiusX: number,
  radiusY: number,
  rotation = 0,
  vertices = 8,
): readonly Vector2[] =>
  Array.from({ length: vertices }, (_, index) => {
    const angle = rotation + (index / vertices) * Math.PI * 2
    return {
      x: cx + Math.cos(angle) * radiusX,
      y: cy + Math.sin(angle) * radiusY,
    }
  })

const ringBarrier = (angle: number): readonly Vector2[] => {
  const radius = 660
  return barrier(
    DEMO_CENTER.x + Math.cos(angle) * radius,
    DEMO_CENTER.y + Math.sin(angle) * radius,
    350,
    130,
    angle + Math.PI / 2,
  )
}

export const CAVERN_MAPS: readonly CavernMap[] = [
  {
    id: 1,
    name: 'The Expanse',
    boundary: CAVERN_POINTS,
    obstacles: [],
  },
  {
    id: 2,
    name: 'Twin Teeth',
    boundary: CAVERN_POINTS,
    obstacles: [
      pillar(850, 820, 145, 260, 0.18),
      pillar(2150, 1380, 145, 260, -0.16),
    ],
  },
  {
    id: 3,
    name: 'The Triad',
    boundary: CAVERN_POINTS,
    obstacles: [
      pillar(910, 690, 170, 215, 0.12),
      pillar(2090, 690, 170, 215, -0.12),
      pillar(1500, 1710, 225, 135, 0.08),
    ],
  },
  {
    id: 4,
    name: 'Broken Halo',
    boundary: CAVERN_POINTS,
    obstacles: [
      barrier(1500, 500, 520, 150),
      barrier(2280, 1100, 150, 520),
      barrier(1500, 1700, 520, 150),
      barrier(720, 1100, 150, 520),
    ],
  },
  {
    id: 5,
    name: 'The Narrows',
    boundary: CAVERN_POINTS,
    obstacles: [
      barrier(790, 535, 720, 150, 0.08),
      barrier(2210, 720, 720, 150, -0.08),
      barrier(790, 1350, 720, 155, -0.07),
      barrier(2210, 1550, 720, 150, 0.07),
      pillar(1500, 1870, 185, 105, 0.1),
    ],
  },
  {
    id: 6,
    name: 'Crossroads',
    boundary: CAVERN_POINTS,
    obstacles: [
      barrier(880, 640, 480, 140, 0.55),
      barrier(2120, 640, 480, 140, -0.55),
      barrier(780, 1470, 520, 145, -0.45),
      barrier(2220, 1470, 520, 145, 0.45),
      pillar(1500, 390, 180, 105),
      pillar(1500, 1840, 180, 105, 0.18),
    ],
  },
  {
    id: 7,
    name: 'Switchback',
    boundary: CAVERN_POINTS,
    obstacles: [
      barrier(800, 470, 760, 145, 0.05),
      barrier(2200, 700, 760, 145, -0.05),
      barrier(760, 965, 680, 135, 0.04),
      barrier(2240, 1235, 680, 135, -0.04),
      barrier(800, 1505, 760, 145, -0.05),
      barrier(2070, 1715, 500, 145, 0.05),
      pillar(1500, 1880, 145, 90, 0.16),
    ],
  },
  {
    id: 8,
    name: 'Archipelago',
    boundary: CAVERN_POINTS,
    obstacles: [
      pillar(620, 540, 120, 170, 0.12),
      pillar(1040, 760, 145, 105, 0.22),
      pillar(2010, 540, 145, 185, -0.1),
      pillar(2460, 920, 120, 170, 0.2),
      pillar(650, 1590, 145, 185, -0.18),
      pillar(1110, 1770, 155, 105, 0.08),
      pillar(1960, 1650, 150, 120, -0.12),
      pillar(2450, 1530, 120, 180, 0.14),
    ],
  },
  {
    id: 9,
    name: 'The Gauntlet',
    boundary: CAVERN_POINTS,
    obstacles: [
      barrier(720, 590, 165, 630, 0.03),
      barrier(720, 1640, 165, 630, -0.03),
      barrier(2280, 590, 165, 630, -0.03),
      barrier(2280, 1640, 165, 630, 0.03),
      barrier(1130, 410, 430, 125, 0.08),
      barrier(1870, 1790, 430, 125, 0.08),
      pillar(1010, 1160, 115, 165, 0.14),
      pillar(1990, 1040, 115, 165, -0.14),
      pillar(1500, 1850, 135, 90, 0.1),
    ],
  },
  {
    id: 10,
    name: 'Deep Core',
    boundary: CAVERN_POINTS,
    obstacles: [
      ...Array.from({ length: 6 }, (_, index) => ringBarrier((index / 6) * Math.PI * 2)),
      pillar(600, 500, 125, 175, 0.15),
      pillar(2400, 500, 125, 175, -0.15),
      pillar(600, 1700, 125, 175, -0.15),
      pillar(2400, 1700, 125, 175, 0.15),
    ],
  },
]

export const getDemoCavernMap = (level: number) => {
  const index = Math.min(CAVERN_MAPS.length - 1, Math.max(0, Math.floor(level) - 1))
  return CAVERN_MAPS[index]
}

export const worldDelta = (ax: number, ay: number, bx: number, by: number) => ({
  dx: bx - ax,
  dy: by - ay,
})

export const pointInPolygon = (point: Vector2, polygon: readonly Vector2[]) => {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]
    const b = polygon[j]
    const intersects =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    if (intersects) inside = !inside
  }
  return inside
}

const polygonBounds = new WeakMap<readonly Vector2[], { x:number; y:number; right:number; bottom:number }>()
const boundsOf = (polygon: readonly Vector2[]) => {
  let bounds = polygonBounds.get(polygon)
  if (!bounds) {
    bounds = { x:Math.min(...polygon.map(p => p.x)),y:Math.min(...polygon.map(p => p.y)),right:Math.max(...polygon.map(p => p.x)),bottom:Math.max(...polygon.map(p => p.y)) }
    polygonBounds.set(polygon,bounds)
  }
  return bounds
}
const boundsDistanceSquared = (p: Vector2, polygon: readonly Vector2[]) => {
  return distanceToBoundsSquared(p,boundsOf(polygon))
}
type Bounds = {x:number;y:number;right:number;bottom:number}
const distanceToBoundsSquared = (p:Vector2,b:Bounds) => {
  const dx = Math.max(0,b.x-p.x,p.x-b.right), dy = Math.max(0,b.y-p.y,p.y-b.bottom)
  return dx*dx+dy*dy
}
type EdgeNode = Bounds & {edges?:number[]; left?:EdgeNode; rightNode?:EdgeNode}
const edgeTrees = new WeakMap<readonly Vector2[],EdgeNode>()
/** Large immutable station contours share a small edge hierarchy. Door leaves
 * and other short polygons keep the straight scan. No collision is approximated. */
function edgeTree(polygon:readonly Vector2[]):EdgeNode | undefined {
  if(polygon.length<24)return undefined
  let tree=edgeTrees.get(polygon)
  if(!tree){
    const edges=polygon.map((a,i)=>{
      const b=polygon[(i+1)%polygon.length]
      return {x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),right:Math.max(a.x,b.x),bottom:Math.max(a.y,b.y)}
    })
    const build=(indices:number[]):EdgeNode=>{
      const node:EdgeNode={x:Infinity,y:Infinity,right:-Infinity,bottom:-Infinity}
      for(const i of indices){const b=edges[i];node.x=Math.min(node.x,b.x);node.y=Math.min(node.y,b.y);node.right=Math.max(node.right,b.right);node.bottom=Math.max(node.bottom,b.bottom)}
      if(indices.length<=8)node.edges=indices
      else{
        const wide=node.right-node.x>=node.bottom-node.y
        indices.sort((a,b)=>wide ? (edges[a].x+edges[a].right)-(edges[b].x+edges[b].right) : (edges[a].y+edges[a].bottom)-(edges[b].y+edges[b].bottom))
        const middle=Math.floor(indices.length/2)
        node.left=build(indices.slice(0,middle));node.rightNode=build(indices.slice(middle))
      }
      return node
    }
    tree=build(polygon.map((_,i)=>i));edgeTrees.set(polygon,tree)
  }
  return tree
}
const nearestPolygonPoint = (point: Vector2, polygon: readonly Vector2[]) => {
  let nearestX = polygon[0].x, nearestY = polygon[0].y
  let distance = Infinity
  let edgeIndex = 0
  const visitEdge = (i:number) => {
    // Keep the exact projection and original edge tie-break, allocating only the winner.
    // This query runs several times per body per tick on the station contour.
    const a=polygon[i], b=polygon[(i+1)%polygon.length], dx=b.x-a.x, dy=b.y-a.y
    const lengthSquared=dx*dx+dy*dy
    const t=lengthSquared<1e-9 ? 0 : Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/lengthSquared))
    const x=a.x+dx*t, y=a.y+dy*t
    const candidateDistance = (point.x - x)**2 + (point.y - y)**2
    if (candidateDistance < distance || candidateDistance === distance && i < edgeIndex) {
      nearestX = x; nearestY = y
      distance = candidateDistance
      edgeIndex = i
    }
  }
  const tree=edgeTree(polygon)
  if(tree){
    const visit=(node:EdgeNode)=>{
      if(distanceToBoundsSquared(point,node)>distance+1e-7)return
      if(node.edges){for(const i of node.edges)visitEdge(i);return}
      const left=node.left!,right=node.rightNode!
      if(distanceToBoundsSquared(point,left)<=distanceToBoundsSquared(point,right)){visit(left);visit(right)}
      else{visit(right);visit(left)}
    }
    visit(tree)
  }else for(let i=0;i<polygon.length;i++)visitEdge(i)
  return { point: {x:nearestX,y:nearestY}, distance:Math.sqrt(distance), edgeIndex }
}

const distanceToOuterBoundary = (point: Vector2, map: CavernMap) => {
  const nearest = nearestPolygonPoint(point, map.boundary).distance
  return pointInPolygon(point, map.boundary) ? nearest : -nearest
}

export const distanceToCavernWall = (point: Vector2, map: CavernMap = CAVERN_MAPS[0]) => {
  let nearest = distanceToOuterBoundary(point, map)
  if (nearest < 0) return nearest

  for (const obstacle of map.obstacles) {
    if (boundsDistanceSquared(point,obstacle) > nearest*nearest) continue
    const obstacleDistance = nearestPolygonPoint(point, obstacle).distance
    if (pointInPolygon(point, obstacle)) return -obstacleDistance
    nearest = Math.min(nearest, obstacleDistance)
  }
  return nearest
}

export const isInsideCavern = (point: Vector2, clearance = 0, map: CavernMap = CAVERN_MAPS[0]) =>
  distanceToCavernWall(point, map) >= clearance

const applyCollisionResponse = (
  pos: Vector2,
  vel: Vector2,
  normalX: number,
  normalY: number,
  correction: number,
  restitution: number,
) => {
  pos.x += normalX * correction
  pos.y += normalY * correction
  const normalVelocity = vel.x * normalX + vel.y * normalY
  if (normalVelocity >= 0) return 0
  vel.x -= (1 + restitution) * normalVelocity * normalX
  vel.y -= (1 + restitution) * normalVelocity * normalY
  return -normalVelocity
}

export const resolveCircleInCavern = (
  pos: Vector2,
  vel: Vector2,
  radius: number,
  restitution = 0.55,
  map: CavernMap = CAVERN_MAPS[0],
) => {
  let collided = false
  let maxImpactSpeed = 0

  // Multiple passes settle corner and multi-surface contacts.
  for (let pass = 0; pass < 6; pass++) {
    let adjusted = false

    const boundary = nearestPolygonPoint(pos, map.boundary)
    const insideBoundary = pointInPolygon(pos, map.boundary)
    if (!insideBoundary || boundary.distance < radius) {
      const sign = insideBoundary ? 1 : -1
      let nx = (pos.x - boundary.point.x) * sign, ny = (pos.y - boundary.point.y) * sign
      let length = Math.hypot(nx, ny)
      if (length < 1e-9) {
        // A body exactly on an edge still needs an inward collision normal.
        const a = map.boundary[boundary.edgeIndex], b = map.boundary[(boundary.edgeIndex + 1) % map.boundary.length]
        nx = a.y - b.y; ny = b.x - a.x; length = Math.hypot(nx, ny)
        if (!pointInPolygon({ x: pos.x + nx / length * 0.01, y: pos.y + ny / length * 0.01 }, map.boundary)) { nx = -nx; ny = -ny }
      }
      maxImpactSpeed = Math.max(maxImpactSpeed, applyCollisionResponse(pos, vel, nx / length, ny / length, insideBoundary ? radius - boundary.distance : radius + boundary.distance, restitution))
      collided = true; adjusted = true
    }

    for (const obstacle of map.obstacles) {
      if (boundsDistanceSquared(pos,obstacle) > radius*radius) continue
      const nearest = nearestPolygonPoint(pos, obstacle)
      const inside = pointInPolygon(pos, obstacle)
      if (!inside && nearest.distance >= radius) continue

      let nx = 0
      let ny = 0
      let correction = 0
      if (inside) {
        nx = nearest.point.x - pos.x
        ny = nearest.point.y - pos.y
        correction = nearest.distance + radius
      } else {
        nx = pos.x - nearest.point.x
        ny = pos.y - nearest.point.y
        correction = radius - nearest.distance
      }

      const normalLength = Math.hypot(nx, ny)
      if (normalLength < 1e-9) continue
      nx /= normalLength
      ny /= normalLength
      maxImpactSpeed = Math.max(
        maxImpactSpeed,
        applyCollisionResponse(pos, vel, nx, ny, correction, restitution),
      )
      collided = true
      adjusted = true
    }

    if (!adjusted) break
  }

  return { collided, maxImpactSpeed }
}

const cross = (ax: number, ay: number, bx: number, by: number) => ax * by - ay * bx

const raycastPolygon = (
  origin: Vector2,
  direction: Vector2,
  polygon: readonly Vector2[],
  maxDistance: number,
) => {
  let nearest = maxDistance
  let nearestEdge = -1
  const visitEdge = (i:number) => {
    const a = polygon[i]
    const b = polygon[(i + 1) % polygon.length]
    const ex = b.x - a.x
    const ey = b.y - a.y
    const denominator = cross(direction.x, direction.y, ex, ey)
    if (Math.abs(denominator) < 1e-9) return

    const ox = a.x - origin.x
    const oy = a.y - origin.y
    const distance = cross(ox, oy, ex, ey) / denominator
    const edgeT = cross(ox, oy, direction.x, direction.y) / denominator
    if (distance >= 0 && distance <= nearest && edgeT >= 0 && edgeT <= 1 && (distance < nearest || i > nearestEdge)) {
      nearest = distance; nearestEdge = i
    }
  }
  const tree=edgeTree(polygon)
  if(tree){
    const visit=(node:EdgeNode)=>{
      if(distanceToBoundsSquared(origin,node)>(nearest+1e-7)**2)return
      if(node.edges){for(const i of node.edges)visitEdge(i)}
      else{visit(node.left!);visit(node.rightNode!)}
    }
    visit(tree)
  }else for(let i=0;i<polygon.length;i++)visitEdge(i)
  return nearest
}

/** Returns the first distance from a ray origin to an outer wall or solid formation. */
export const raycastCavern = (
  origin: Vector2,
  direction: Vector2,
  maxDistance: number,
  map: CavernMap = CAVERN_MAPS[0],
) => {
  const magnitude = Math.hypot(direction.x, direction.y)
  if (magnitude < 1e-9 || maxDistance <= 0) return 0
  const normalized = { x: direction.x / magnitude, y: direction.y / magnitude }
  let nearest = raycastPolygon(origin, normalized, map.boundary, maxDistance)
  for (const obstacle of map.obstacles) {
    // Conservative reach rejection includes long edges with distant vertices.
    // Geometry snapshots are immutable, so their bounds are shared with contacts.
    if (boundsDistanceSquared(origin,obstacle) > (nearest+1e-7)**2) continue
    nearest = raycastPolygon(origin, normalized, obstacle, nearest)
  }
  return nearest
}
