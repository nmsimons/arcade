import { cross3, normalize3, rotX, rotY, rotZ } from './math.ts'
import type { V3, Vector2 } from './types'
import { doorTravel } from './doors.ts'
import type { GATES } from './expedition'

type Outline = readonly (readonly [number, number])[]
interface Part {
  verts: V3[]
  faces: number[][]
  color: string
  at: V3
  rotation?: V3
  spin?: number
  glow?: boolean
}
const STEEL = '#a7c3c3'
const GREEN = '#65efb2'
const BLUE = '#6bcaff'
const AMBER = '#ffc77e'
const VIOLET = '#c1adff'
const TAU = Math.PI * 2

function prism(outline: Outline, depth: number, color: string, at: V3 = [0, 0, 0], glow = false): Part {
  const n = outline.length
  const verts: V3[] = [-depth / 2, depth / 2].flatMap(z => outline.map(([x, y]): V3 => [x, y, z]))
  const faces = [Array.from({ length: n }, (_, i) => n - i - 1), Array.from({ length: n }, (_, i) => n + i)]
  for (let i = 0; i < n; i++) faces.push([i, (i + 1) % n, (i + 1) % n + n, i + n])
  return { verts, faces, color, at, glow }
}
function box(w: number, h: number, d: number, at: V3 = [0, 0, 0], color = STEEL, glow = false): Part {
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
function drawModel(ctx: CanvasRenderingContext2D, pos: Vector2, parts: readonly Part[], angles: V3, time: number, scale = 1, illumination = 0) {
  const faces: { points: Vector2[]; z: number; color: V3; shade: number; glow: boolean }[] = []
  const light: V3 = [0.25, -0.45, -0.86]
  for (const part of parts) {
    const local = part.rotation ?? [0, 0, 0]
    const vertices = part.verts.map(v => {
      const p = rotate(v, [local[0], local[1], local[2] + time * (part.spin ?? 0)])
      return rotate([p[0] + part.at[0], p[1] + part.at[1], p[2] + part.at[2]], angles)
    })
    for (const face of part.faces) {
      const [a, b, c] = face.map(i => vertices[i])
      const normal = normalize3(cross3([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [c[0] - a[0], c[1] - a[1], c[2] - a[2]]))
      if (normal[2] > 0.02) continue
      const points = face.map(i => {
        const p = vertices[i], perspective = 420 / (420 + p[2])
        return { x: p[0] * perspective * scale, y: p[1] * perspective * scale }
      })
      faces.push({ points, z: face.reduce((sum, i) => sum + vertices[i][2], 0) / face.length, color: rgb(part.color), shade: Math.max(0, normal[0] * light[0] + normal[1] * light[1] + normal[2] * light[2]), glow: !!part.glow })
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
    ctx.stroke()
  }
  ctx.restore()
}

const CHECKPOINT: Part[] = [
  box(100, 12, 18, [0, -34, 0], GREEN),
  prism([[-9, -36], [9, -31], [7, 31], [-7, 41]], 18, STEEL, [-46, 0, 0]),
  prism([[-9, -31], [9, -36], [7, 41], [-7, 31]], 18, STEEL, [46, 0, 0]),
]
const SOCKET: Part[] = [
  prism([[-6, -24], [6, -18], [6, 18], [-6, 24]], 12, BLUE, [-72, 0, 0]),
  prism([[-6, -18], [6, -24], [6, 24], [-6, 18]], 12, BLUE, [72, 0, 0]),
]
const DISPENSER: Part[] = [
  prism([[-23, -24], [23, -24], [23, 8], [0, 23], [-23, 8]], 20, STEEL),
  box(19, 6, 5, [0, 4, -13], BLUE, true),
]
const CELL: Part[] = [
  prism([[-10, -22], [10, -22], [15, -14], [15, 14], [10, 22], [-10, 22], [-15, 14], [-15, -14]], 18, BLUE),
  box(5, 27, 3, [0, 0, -11], BLUE, true),
]
const RADIATION: Part[] = [
  prism([[0, -32], [27, -16], [21, 15], [0, 33], [-21, 15], [-27, -16]], 10, VIOLET),
  prism([[0, -23], [15, -11], [0, 22], [-15, -11]], 5, STEEL, [0, 0, -9]),
]
const EMITTER: Part[] = [
  prism([[-24, -18], [-12, -27], [18, -23], [27, -10], [23, 22], [-20, 25], [-28, 9]], 12, STEEL, [0, 0, 8]),
  box(7, 34, 22, [-20, 0, -4], STEEL),
  prism([[-4, -18], [5, -14], [3, 5], [-4, 10]], 18, STEEL, [19, -6, -3]),
  { ...crystal(11, VIOLET, [0, 0, -10]), rotation: [0.3, 0.1, 0], spin: 0.15 },
]
const CACHES: Part[][] = [0, 1, 2, 3].map(i => [
  box(35 + i * 3, 28, 26, [0, 0, 0], '#9dd8ca'),
  box(5, 30, 28, [0, 0, 0], '#79e2d0'),
])
const CORE: Part[] = [
  { ...ring(35, 2, 3, AMBER, [0, 0, 0], 8), rotation: [0.8, 0.4, 0], spin: 0.5 },
  { ...crystal(19, '#ffe7ad'), rotation: [0.3, 0.5, 0], spin: -0.45 },
]

export type ObjectKind = 'checkpoint' | 'socket' | 'dispenser' | 'radiation' | 'emitter' | 'cache' | 'core'
export function drawExpeditionObject(ctx: CanvasRenderingContext2D, kind: ObjectKind, pos: Vector2, options: { active?: boolean; variant?: number; scale?: number; time?: number; latch?: number } = {}) {
  const t = options.time ?? performance.now() / 1000
  const floating = ['radiation', 'cache', 'core'].includes(kind)
  // Seed the gentle tumble from stable object identity, never world position.
  // Using moving coordinates as phase made towed cargo twitch with every pixel.
  const phase = { checkpoint: 0, socket: 0.5, dispenser: 1, radiation: 1.5, cache: 2, core: 2.5, emitter: 3 }[kind] + (options.variant ?? 0) * 1.7
  const at = pos
  const models = { checkpoint: CHECKPOINT, socket: SOCKET, dispenser: DISPENSER, radiation: RADIATION, emitter: EMITTER, cache: CACHES[(options.variant ?? 0) % 4], core: CORE }
  let parts = models[kind]
  if (kind === 'socket' && options.active) parts = [...SOCKET.map(p => ({ ...p, color: GREEN })), ...CELL.map(p => ({ ...p, verts: p.verts.map(v => v.map(n => n * 0.64) as V3), color: GREEN }))]
  if (kind === 'checkpoint' && options.latch) {
    const reach = 32 * options.latch
    parts = [...CHECKPOINT, ...[-1, 1].map(sign => box(reach, 5, 5, [sign * (42 - reach / 2), 4, -9], GREEN))]
  }
  if (kind === 'core' && !options.active) parts = CORE.map(p => ({ ...p, color: '#8f8065', glow: false, spin: 0 }))
  drawModel(ctx, at, parts, floating ? [0.32 + Math.sin(t * 0.4 + phase) * 0.22, -0.32 + Math.sin(t * 0.28 + phase) * 0.42, Math.sin(t * 0.3 + phase) * 0.16] : [0.2 + Math.sin(t * 0.7 + phase) * 0.025, -0.16, 0], t, options.scale ?? 1)
}
export function drawPowerCell(ctx: CanvasRenderingContext2D, pos: Vector2, rotation: V3, laserGlow = 0) {
  drawModel(ctx, pos, CELL, rotation, 0, 0.64, laserGlow)
}

const gateModels = new Map<string, Part[]>()
function buildGate(kind: typeof GATES[number]['kind']): Part[] {
  const frame = [box(16, 42, 26, [-98, 0, 0]), box(16, 42, 26, [98, 0, 0])]
  if (kind === 'rubble') {
    return Array.from({ length: 6 }, (_, i) => prism([[-19, -16], [5, -19 - i % 2 * 5], [20, -10], [18, 18], [-5, 21], [-21, 7]], 20 + i % 3 * 8, '#bbcab7', [-83 + i * 33, Math.sin(i * 8) * 3, 0]))
  }
  if (kind === 'blast') return [...frame,
    // Two buckled plates leave a torn, uneven seam. The exposed interior is
    // the material cue, rather than a symbol painted over an intact door.
    prism([[-88,-15],[-7,-15],[4,-8],[-6,1],[3,7],[-9,15],[-88,15]], 24, '#b9aaa1'),
    prism([[0,-15],[88,-15],[88,15],[-1,15],[11,6],[2,0],[12,-9]], 20, '#b9aaa1', [0,0,3]),
    box(9, 24, 4, [1, 0, 9], '#ac6651'),
  ]
  const color = BLUE
  return [...frame, ...[-48, 48].flatMap(x => [box(92, 31, 21, [x, 0, 2]), box(5, 27, 5, [x > 0 ? 5 : -5, 0, -14], color, true)])]
}
export function drawGateObject(ctx: CanvasRenderingContext2D, gate: typeof GATES[number], progress = 0) {
  if (!gateModels.has(gate.kind)) gateModels.set(gate.kind, buildGate(gate.kind))
  const center = { x: gate.x + gate.w / 2, y: gate.y + gate.h / 2 }
  const vertical = gate.h > gate.w
  const angles: V3 = [0.28, -0.04, vertical ? Math.PI / 2 : 0]
  const model = gateModels.get(gate.kind)!
  if (gate.kind === 'socket') {
    // Separate leaves slide into wall pockets. Keep the frame after opening.
    drawModel(ctx, center, model.slice(0, 2), angles, 0)
    ctx.save(); ctx.translate(center.x, center.y)
    if (vertical) ctx.rotate(Math.PI / 2)
    ctx.beginPath(); ctx.rect(-100, -24, 200, 48); ctx.clip()
    const travel = doorTravel(progress) * 100
    const leaves = model.slice(2).map((part, i) => ({ ...part, color: progress > 0 && part.glow ? GREEN : part.color, at: [part.at[0] + (i < 2 ? -travel : travel), part.at[1], part.at[2]] as V3 }))
    drawModel(ctx, { x: 0, y: 0 }, leaves, [0.28, -0.04, 0], 0)
    ctx.restore()
  } else drawModel(ctx, center, model, angles, 0)
}
