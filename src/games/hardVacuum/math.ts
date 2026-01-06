import type { V3 } from './types'

export const rotX = (p: V3, a: number): V3 => {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c]
}

export const rotY = (p: V3, a: number): V3 => {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c]
}

export const rotZ = (p: V3, a: number): V3 => {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]]
}

export const normalize3 = (v: V3): V3 => {
  const m = Math.hypot(v[0], v[1], v[2])
  if (m < 1e-8) return [0, 0, 0]
  return [v[0] / m, v[1] / m, v[2] / m]
}

export const cross3 = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

export const makeRockMesh = (radius: number, seed: number) => {
  // Regular icosahedron: 12 vertices, 20 triangular faces.
  // Add a small deterministic radial jitter per vertex to make each rock
  // feel a bit less perfectly regular while staying convex and stable.
  const rand01 = (n: number) => {
    const x = Math.sin(n) * 43758.5453123
    return x - Math.floor(x)
  }

  const irregularity = 0.1

  const phi = (1 + Math.sqrt(5)) / 2

  const baseVerts: V3[] = [
    // (0, ±1, ±φ)
    [0, -1, -phi],
    [0, -1, phi],
    [0, 1, -phi],
    [0, 1, phi],
    // (±1, ±φ, 0)
    [-1, -phi, 0],
    [-1, phi, 0],
    [1, -phi, 0],
    [1, phi, 0],
    // (±φ, 0, ±1)
    [-phi, 0, -1],
    [-phi, 0, 1],
    [phi, 0, -1],
    [phi, 0, 1],
  ]

  const verts: V3[] = baseVerts.map((v, i) => {
    const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2])
    const ux = v[0] / len
    const uy = v[1] / len
    const uz = v[2] / len

    // Symmetric jitter keeps average radius about the same.
    const n = rand01(seed * 12.9898 + i * 78.233)
    const jitter = (n * 2 - 1) * irregularity
    const r = radius * (1 + jitter)
    return [ux * r, uy * r, uz * r]
  })

  const polys: number[][] = [
    [0, 2, 8],
    [0, 8, 4],
    [0, 4, 6],
    [0, 6, 10],
    [0, 10, 2],

    [3, 9, 1],
    [3, 1, 11],
    [3, 11, 7],
    [3, 7, 5],
    [3, 5, 9],

    [2, 10, 7],
    [2, 7, 5],
    [2, 5, 8],
    [8, 5, 9],
    [8, 9, 4],

    [10, 6, 11],
    [10, 11, 7],
    [6, 4, 1],
    [6, 1, 11],
    [4, 9, 1],
  ]

  return { verts, polys }
}
