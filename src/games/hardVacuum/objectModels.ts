import { normalize3, rotX, rotY, rotZ } from './math.ts'
import type { V3, Vector2 } from './types'
import { RECEIVER_HALF_GAP, RECEIVER_HALF_HEIGHT, RECEIVER_PLATE_WIDTH } from './receivers.ts'

export type Outline = readonly (readonly [number, number])[]
export interface Part {
  verts: V3[]
  faces: number[][]
  color: string
  at: V3
  rotation?: V3
  spin?: number
  glow?: boolean
  // Optional interior seams: vertex pair and opacity. Silhouette edges stay crisp.
  edges?: readonly (readonly [number, number, number])[]
  // Coplanar details belong to a specific hull face, not the assembly's
  // average-depth sort. They inherit that face's projection and visibility.
  markings?: { face: number; verts: V3[]; color: string; glow?: boolean }[]
}
const STEEL = '#a7c3c3'
const GREEN = '#65efb2'
const BLUE = '#6bcaff'
const AMBER = '#ffc77e'
const VIOLET = '#c1adff'
const TAU = Math.PI * 2

/** Sculpted hull plating shared by the pilot ship and station craft. */
export function bevel(lower: Outline, upper: Outline, color: string, bottom = 3, top = -3, glow = false): Part {
  const n = lower.length
  return {
    verts: [...lower.map(([x, y]): V3 => [x, y, bottom]), ...upper.map(([x, y]): V3 => [x, y, top])],
    faces: [Array.from({ length: n }, (_, i) => i), Array.from({ length: n }, (_, i) => 2 * n - i - 1),
      ...lower.map((_, i) => [i, n + i, n + (i + 1) % n, (i + 1) % n])],
    color, at: [0, 0, 0], glow,
    // Crisp silhouette, quiet inset rim: shading describes the bevel instead
    // of outlining every small corner and glass facet.
    edges: lower.flatMap((_, i): [number, number, number][] => [
      [i, (i + 1) % n, 1], [n + i, n + (i + 1) % n, glow ? 0 : .25],
    ]),
  }
}

export function prism(outline: Outline, depth: number, color: string, at: V3 = [0, 0, 0], glow = false): Part {
  const n = outline.length
  const verts: V3[] = [-depth / 2, depth / 2].flatMap(z => outline.map(([x, y]): V3 => [x, y, z]))
  const faces = [Array.from({ length: n }, (_, i) => n - i - 1), Array.from({ length: n }, (_, i) => n + i)]
  for (let i = 0; i < n; i++) faces.push([i, (i + 1) % n, (i + 1) % n + n, i + n])
  return { verts, faces, color, at, glow }
}
export function box(w: number, h: number, d: number, at: V3 = [0, 0, 0], color = STEEL, glow = false): Part {
  const x = w / 2, y = h / 2
  return prism([[-x, -y], [x, -y], [x, y], [-x, y]], d, color, at, glow)
}
function ring(radius: number, thickness: number, depth: number, color: string, at: V3 = [0, 0, 0], sides = 12): Part {
  const verts: V3[] = []
  for (const z of [-depth / 2, depth / 2]) {
    for (const r of [radius, radius - thickness]) {
      for (let i = 0; i < sides; i++) verts.push([Math.cos(i * TAU / sides) * r, Math.sin(i * TAU / sides) * r, z])
    }
  }
  const faces: number[][] = []
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides, n = sides
    faces.push([j, i, i + n, j + n], [i, j, j + 2 * n, i + 2 * n], [i + n, i + 3 * n, j + 3 * n, j + n], [i + 2 * n, j + 2 * n, j + 3 * n, i + 3 * n])
  }
  return { verts, faces, color, at }
}
function crystal(radius: number, color: string, at: V3 = [0, 0, 0]): Part {
  return {
    verts: [[-radius, 0, 0], [0, -radius * 1.35, 0], [radius, 0, 0], [0, radius * 1.35, 0], [0, 0, -radius], [0, 0, radius]],
    faces: [[0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4], [1, 0, 5], [2, 1, 5], [3, 2, 5], [0, 3, 5]].map(face => face.reverse()),
    color, at, glow: true,
  }
}
const rotate = (p: V3, angles: V3) => rotZ(rotY(rotX(p, angles[0]), angles[1]), angles[2])
const colorCache = new Map<string, V3>()
const rgb = (color: string): V3 => {
  if (!colorCache.has(color)) colorCache.set(color, [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16)) as V3)
  return colorCache.get(color)!
}

/** The same perspective, tumbling facets and lit edges as the ship and rocks.
 * Sort faces across the whole assembly, so struts and inset machinery occlude
 * one another correctly instead of looking like stacked flat icons. */
export function drawModel(ctx: CanvasRenderingContext2D, pos: Vector2, parts: readonly Part[], angles: V3, time: number, scale = 1, illumination = 0) {
  type Marking = { points: Vector2[]; color: V3; glow: boolean }
  const faces: { points: Vector2[]; z: number; color: V3; shade: number; glow: boolean; edges?: number[]; markings: Marking[] }[] = []
  const light: V3 = [0.25, -0.45, -0.86]
  const project = (p: V3): Vector2 => {
    const perspective=420/(420+p[2])
    return {x:p[0]*perspective*scale,y:p[1]*perspective*scale}
  }
  for (const part of parts) {
    const edgeKey = (a:number,b:number) => `${Math.min(a,b)}:${Math.max(a,b)}`
    const edges = part.edges && new Map(part.edges.map(([a,b,opacity])=>[edgeKey(a,b),opacity]))
    const local = part.rotation ?? [0, 0, 0]
    const transform = (v: V3) => {
      const p = rotate(v, [local[0], local[1], local[2] + time * (part.spin ?? 0)])
      return rotate([p[0] + part.at[0], p[1] + part.at[1], p[2] + part.at[2]], angles)
    }
    const vertices = part.verts.map(transform)
    const visibleFaces = part.faces.flatMap((face, index) => {
      // Newell's normal uses the whole polygon. Beveled quads can be slightly
      // twisted; using their first triangle makes mirrored faces disagree.
      const normal = normalize3(face.reduce<V3>((sum, index, i) => {
        const a = vertices[index], b = vertices[face[(i + 1) % face.length]]
        return [sum[0] + (a[1] - b[1]) * (a[2] + b[2]),
          sum[1] + (a[2] - b[2]) * (a[0] + b[0]),
          sum[2] + (a[0] - b[0]) * (a[1] + b[1])]
      }, [0, 0, 0]))
      return normal[2] > 0.02 ? [] : [{ face, normal, index }]
    })
    const visibleEdges = new Map<string, number>()
    if (edges) {
      for (const { face } of visibleFaces) for (let i = 0; i < face.length; i++) {
        const key = edgeKey(face[i], face[(i + 1) % face.length])
        visibleEdges.set(key, (visibleEdges.get(key) ?? 0) + 1)
      }
    }
    for (const { face, normal, index } of visibleFaces) {
      const points = face.map(i => project(vertices[i]))
      faces.push({ points, z: face.reduce((sum, i) => sum + vertices[i][2], 0) / face.length, color: rgb(part.color), shade: Math.max(0, normal[0] * light[0] + normal[1] * light[1] + normal[2] * light[2]), glow: !!part.glow,
        markings:(part.markings ?? []).filter(marking=>marking.face===index).map(marking=>({points:marking.verts.map(v=>project(transform(v))),color:rgb(marking.color),glow:!!marking.glow})),
        // An edge shared by two visible faces is a seam; with only one it is
        // the silhouette, even when banking exposes the quieter upper rim.
        edges:edges && face.map((a,i)=>{
          const key=edgeKey(a,face[(i+1)%face.length])
          return visibleEdges.get(key)===1 ? 1 : edges.get(key) ?? 0
        }) })
    }
  }
  faces.sort((a, b) => b.z - a.z)
  ctx.save()
  ctx.translate(pos.x, pos.y)
  ctx.lineJoin = 'round'
  for (const face of faces) {
    ctx.beginPath()
    face.points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y))
    ctx.closePath()
    const brightness = (face.glow ? 0.4 + face.shade * 0.35 : 0.025 + face.shade * 0.055) + illumination * 0.25
    const [r, g, b] = face.color
    ctx.shadowBlur = 0
    ctx.fillStyle = `rgb(${Math.round(r * brightness)},${Math.round(g * brightness)},${Math.round(b * brightness)})`
    ctx.fill()
    ctx.strokeStyle = `rgba(${r},${g},${b},${0.5 + face.shade * 0.45})`
    ctx.lineWidth = face.glow ? 1.6 : 1.4
    ctx.shadowBlur = (face.glow ? 4 : 0) + illumination * 16
    ctx.shadowColor = `rgba(${r},${g},${b},${0.25 + illumination * 0.5})`
    if (face.edges) {
      face.edges.forEach((opacity,i)=>{
        if (!opacity) return
        const start=face.points[i],end=face.points[(i+1)%face.points.length]
        ctx.strokeStyle=`rgba(${r},${g},${b},${(.5+face.shade*.45)*opacity})`
        ctx.beginPath();ctx.moveTo(start.x,start.y);ctx.lineTo(end.x,end.y);ctx.stroke()
      })
    } else ctx.stroke()
    for (const marking of face.markings) {
      ctx.beginPath()
      marking.points.forEach((p,i)=>i ? ctx.lineTo(p.x,p.y) : ctx.moveTo(p.x,p.y))
      ctx.closePath()
      const brightness=(marking.glow ? .55+face.shade*.25 : .08+face.shade*.12)+illumination*.25
      const [r,g,b]=marking.color
      ctx.fillStyle=`rgb(${Math.round(r*brightness)},${Math.round(g*brightness)},${Math.round(b*brightness)})`
      ctx.shadowBlur=marking.glow ? 2 : 0
      ctx.shadowColor=`rgba(${r},${g},${b},.3)`
      ctx.fill()
      ctx.strokeStyle=`rgba(${r},${g},${b},.8)`;ctx.lineWidth=.8;ctx.stroke()
    }
  }
  ctx.restore()
}

const CHECKPOINT: Part[] = [
  box(100, 12, 18, [0, -34, 0], GREEN),
  prism([[-9, -36], [9, -31], [7, 31], [-7, 41]], 18, STEEL, [-46, 0, 0]),
  prism([[-9, -31], [9, -36], [7, 41], [-7, 31]], 18, STEEL, [46, 0, 0]),
]
const SOCKET: Part[] = [
  ...[-1,1].map(side => {
    const half=RECEIVER_PLATE_WIDTH/2, height=RECEIVER_HALF_HEIGHT
    return prism(side<0 ? [[-half,-height],[half,-height+6],[half,height-6],[-half,height]] : [[-half,-height+6],[half,-height],[half,height],[-half,height-6]],
      12, BLUE, [side*(RECEIVER_HALF_GAP+half),0,0])
  }),
]
const CELL: Part[] = [
  prism([[-10, -22], [10, -22], [15, -14], [15, 14], [10, 22], [-10, 22], [-15, 14], [-15, -14]], 18, BLUE),
  box(5, 27, 3, [0, 0, -11], BLUE, true),
]
const RADIATION: Part[] = [
  prism([[0, -32], [27, -16], [21, 15], [0, 33], [-21, 15], [-27, -16]], 10, VIOLET),
  prism([[0, -23], [15, -11], [0, 22], [-15, -11]], 5, STEEL, [0, 0, -9]),
]
const IMPACT: Part[] = [
  prism([[0,-28],[25,-16],[21,12],[0,29],[-21,12],[-25,-16]],14,GREEN),
  prism([[0,-18],[14,-10],[11,7],[0,18],[-11,7],[-14,-10]],5,STEEL,[0,0,-10]),
  box(5,20,3,[0,-1,-14],GREEN,true),
]
const EMITTER: Part[] = [
  prism([[-24, -18], [-12, -27], [18, -23], [27, -10], [23, 22], [-20, 25], [-28, 9]], 12, STEEL, [0, 0, 8]),
  box(7, 34, 22, [-20, 0, -4], STEEL),
  prism([[-4, -18], [5, -14], [3, 5], [-4, 10]], 18, STEEL, [19, -6, -3]),
  { ...crystal(11, VIOLET, [0, 0, -10]), rotation: [0.3, 0.1, 0], spin: 0.15 },
]
const BLASTER: Part[] = [
  box(22, 30, 16, [0, 4, 0], STEEL),
  box(10, 30, 10, [0, -14, 0], '#ff8278', true),
  box(30, 7, 20, [0, 13, 0], '#ff8278'),
]
const TELEPORTER: Part[] = [
  ring(25, 6, 12, BLUE),
  { ...crystal(10, BLUE), spin: -.4 },
]
const CACHES: Part[][] = [0, 1, 2, 3].map(i => [
  box(35 + i * 3, 28, 26, [0, 0, 0], '#9dd8ca'),
  box(5, 30, 28, [0, 0, 0], '#79e2d0'),
])
const CORE: Part[] = [
  { ...ring(35, 2, 3, AMBER, [0, 0, 0], 8), rotation: [0.8, 0.4, 0], spin: 0.5 },
  { ...crystal(19, '#ffe7ad'), rotation: [0.3, 0.5, 0], spin: -0.45 },
]

// A quiet pressure shell. Glass and badge are attached to its front face;
// separate shallow meshes can sort behind their own hull as the pod rocks.
const podMarking = (outline: Outline, color: string, glow=false) => ({face:1,verts:outline.map(([x,y]): V3=>[x,y,-5]),color,glow})
const SURVIVAL_POD: Part[] = [
  { ...bevel([[-10,-22],[10,-22],[15,-14],[15,14],[9,22],[-9,22],[-15,14],[-15,-14]],
    [[-8,-19],[8,-19],[12,-12],[12,12],[7,19],[-7,19],[-12,12],[-12,-12]], '#bbd8ca', 5, -5),
    markings:[
      podMarking([[-6,-15],[6,-15],[8,-10],[8,1],[5,5],[-5,5],[-8,1],[-8,-10]],'#50786f'),
      podMarking([[-4,-13],[4,-13],[6,-9],[6,0],[4,3],[-4,3],[-6,0],[-6,-9]],'#80d8c2',true),
      podMarking([[-1.5,7.5],[1.5,7.5],[1.5,10.5],[4.5,10.5],[4.5,13.5],[1.5,13.5],[1.5,16.5],[-1.5,16.5],[-1.5,13.5],[-4.5,13.5],[-4.5,10.5],[-1.5,10.5]],GREEN,true),
    ],
  },
]

export type ObjectKind = 'checkpoint' | 'socket' | 'impact' | 'radiation' | 'blaster' | 'teleporter' | 'emitter' | 'cache' | 'pod' | 'core'
export function drawExpeditionObject(ctx: CanvasRenderingContext2D, kind: ObjectKind, pos: Vector2, options: { active?: boolean; variant?: number; scale?: number; time?: number; latch?: number; medical?: boolean; laserGlow?: number } = {}) {
  const t = options.time ?? performance.now() / 1000
  const floating = ['impact', 'radiation', 'blaster', 'teleporter', 'cache', 'pod', 'core'].includes(kind)
  // Seed the gentle tumble from stable object identity, never world position.
  // Using moving coordinates as phase made towed cargo twitch with every pixel.
  const phase = { checkpoint: 0, socket: 0.5, impact: .75, radiation: 1.5, blaster: 1, teleporter: 3.5, cache: 2, pod: 1, core: 2.5, emitter: 3 }[kind] + (options.variant ?? 0) * 1.7
  const at = pos
  const models = { checkpoint: CHECKPOINT, socket: SOCKET, impact: IMPACT, radiation: RADIATION, blaster: BLASTER, teleporter: TELEPORTER, emitter: EMITTER, cache: CACHES[(options.variant ?? 0) % 4], pod:SURVIVAL_POD, core: CORE }
  let parts = models[kind]
  if (kind === 'socket' && options.active) parts = [...SOCKET.map(p => ({ ...p, color: GREEN })), ...CELL.map(p => ({ ...p, verts: p.verts.map(v => v.map(n => n * 0.64) as V3), color: GREEN }))]
  if (kind === 'checkpoint' && options.latch) {
    const reach = 32 * options.latch
    parts = [...CHECKPOINT, ...[-1, 1].map(sign => box(reach, 5, 5, [sign * (42 - reach / 2), 4, -9], GREEN))]
  }
  if (kind === 'core' && !options.active) parts = CORE.map(p => ({ ...p, color: '#8f8065', glow: false, spin: 0 }))
  if (kind === 'cache' && options.medical) parts = [
    box(34,28,3,[0,0,4],'#8eaa9d'),
    ...[-9,0,9].flatMap(y=>[
      prism([[-17,-2],[-13,-4],[13,-4],[17,-2],[17,2],[13,4],[-13,4],[-17,2]],6,'#b9d4c4',[0,y,0]),
      box(3,7,7,[-8,y,0],'#6b9383'),box(3,7,7,[8,y,0],'#6b9383'),
    ]),box(5,4,2,[0,0,-4],'#96d6b5',true),
  ]
  if (kind === 'emitter' && options.active === false) parts = EMITTER.map(p => ({ ...p, color: '#77988a', glow: false, spin: 0 }))
  const angles: V3 = kind === 'pod'
    ? [.16 + Math.sin(t*.4+phase)*.08, -.28 + Math.sin(t*.28+phase)*.16, Math.sin(t*.3+phase)*.12]
    : floating ? [0.32 + Math.sin(t * 0.4 + phase) * 0.22, -0.32 + Math.sin(t * 0.28 + phase) * 0.42, Math.sin(t * 0.3 + phase) * 0.16] : [0.2 + Math.sin(t * 0.7 + phase) * 0.025, -0.16, 0]
  drawModel(ctx, at, parts, angles, t, options.scale ?? 1, options.laserGlow ?? 0)
}
export function drawPowerCell(ctx: CanvasRenderingContext2D, pos: Vector2, rotation: V3, laserGlow = 0) {
  drawModel(ctx, pos, CELL, rotation, 0, 0.64, laserGlow)
}
