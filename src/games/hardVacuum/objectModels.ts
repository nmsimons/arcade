import { bevel, drawModel } from '../model3d.ts'
import type { Outline, Part } from '../model3d'
export { bevel, drawModel } from '../model3d.ts'
export type { Outline, Part } from '../model3d'
import type { V3, Vector2 } from './types'
import { RECEIVER_HALF_GAP, RECEIVER_HALF_HEIGHT, RECEIVER_PLATE_WIDTH } from './receivers.ts'

const STEEL = '#a7c3c3'
const GREEN = '#65efb2'
const BLUE = '#6bcaff'
const AMBER = '#ffc77e'
const VIOLET = '#c1adff'
const TAU = Math.PI * 2

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
