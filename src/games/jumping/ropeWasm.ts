import type { Platform } from './model.ts'
import type { RopeState } from './climbables.ts'
import { platformOutline } from './geometry.ts'
import { labSolverEnabled } from './labSolver.ts'

interface Kernel {
  memory: WebAssembly.Memory
  abi_version(): number
  hypot2(x: number, y: number): number
  reserve(nodes: number, terrainSize: number): number
  solve(x: number, y: number, length: number, dt: number, damping: number, shapes: number): number
  set_active_solver?(value: number): void
  active_stats?(index: number): number
}
let kernel: Kernel | null = null
let enabled = false
let wasmSteps = 0
let failures = 0
let activeConfigured = false

/** Explicit installation is shared by the browser, Node parity tests and benchmarks. */
export async function installRopeWasm(bytes: BufferSource) {
  const module = await WebAssembly.compile(bytes)
  const instance = await WebAssembly.instantiate(module)
  const candidate = instance.exports as unknown as Kernel
  if (!(candidate.memory instanceof WebAssembly.Memory) || typeof candidate.abi_version !== 'function'
    || candidate.abi_version() !== 2 || typeof candidate.hypot2 !== 'function'
    || typeof candidate.reserve !== 'function' || typeof candidate.solve !== 'function') {
    throw new Error('Unsupported LAB rope Wasm interface')
  }
  // Other JS engines may round norms differently. Keep their established
  // contact behavior by declining the experimental kernel on a mismatch.
  let seed = 713
  for (let i = 0; i < 128; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    const x = (seed / 2 ** 32 - .5) * 10 ** (i % 12 - 4)
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    const y = (seed / 2 ** 32 - .5) * 10 ** ((i + 3) % 12 - 4)
    if (!Object.is(candidate.hypot2(x, y), Math.hypot(x, y))) throw new Error('LAB rope Wasm arithmetic differs from this JavaScript runtime')
  }
  kernel = candidate
  activeConfigured = false
  kernel.set_active_solver?.(0)
}
export function setRopeWasmEnabled(value: boolean) { enabled = value }
export function ropeWasmStatus() { return { installed: !!kernel, enabled, wasmSteps, failures, memoryBytes: kernel?.memory.buffer.byteLength ?? 0,
  active: activeConfigured, activeStats: Array.from({ length: 4 }, (_, i) => kernel?.active_stats?.(i) ?? 0) } }

/** The gameplay solver calls this only for unattached, awake ropes. All copies,
 * packet packing and geometry preparation are included in end-to-end benchmarks.
 * Reuse Wasm storage across calls; importing no functions prevents reentrancy.
 */
export function stepUnattachedRopeWasm(rope: RopeState, dt: number, terrain: readonly Platform[], gravity: (x: number, y: number) => number): boolean {
  if (!enabled || !kernel) return false
  const count = rope.nodes.length
  if (count < 2 || count > 4096 || terrain.length > 4096) return false
  const outlines = terrain.map(platformOutline)
  if (outlines.some(points => points.length < 3 || points.length > 4096)) return false
  const terrainSize = outlines.reduce((sum, points) => sum + 5 + points.length * 2, 0)
  if (terrainSize > 262144) return false
  try {
    if (activeConfigured !== labSolverEnabled()) {
      if (!kernel.set_active_solver) throw new Error('LAB active solver unavailable in this kernel')
      activeConfigured = labSolverEnabled(); kernel.set_active_solver(Number(activeConfigured))
    }
    const ptr = kernel.reserve(count, terrainSize)
    if (!ptr) return false
    // reserve may grow memory: acquire the view only afterwards, on every call.
    const packet = new Float64Array(kernel.memory.buffer, ptr, count * 5 + (count - 1) * 3 + terrainSize)
    for (let i = 0; i < count; i++) {
      const n = rope.nodes[i], at = i * 5
      packet[at] = n.x; packet[at + 1] = n.y; packet[at + 2] = n.oldX; packet[at + 3] = n.oldY
      packet[at + 4] = gravity(n.x, n.y)
    }
    let at = count * 5
    for (const bend of rope.bends) {
      packet[at++] = Number(!!bend); packet[at++] = bend?.[0] ?? 0; packet[at++] = bend?.[1] ?? 0
    }
    for (let i = 0; i < terrain.length; i++) {
      const shape = terrain[i], points = outlines[i]
      packet[at++] = shape.x; packet[at++] = shape.y; packet[at++] = shape.w; packet[at++] = shape.h
      packet[at++] = points.length
      for (const [x, y] of points) { packet[at++] = x; packet[at++] = y }
    }
    const { x, y, length } = rope.definition
    if (!kernel.solve(x, y, length, dt, Math.exp(-.12 * dt), terrain.length)) return false
    // Internal workspaces may also grow memory while solving.
    const output = new Float64Array(kernel.memory.buffer, ptr, count * 5 + (count - 1) * 3)
    // Validate the whole result before mutating the JS state, so a trap or invalid
    // result can take the original TypeScript path for this very same tick.
    if (!output.every(Number.isFinite)) throw new Error('Invalid LAB rope Wasm result')
    for (let i = 0; i < count; i++) {
      const n = rope.nodes[i], at = i * 5
      n.x = output[at]; n.y = output[at + 1]; n.oldX = output[at + 2]; n.oldY = output[at + 3]
    }
    for (let i = 0; i < count - 1; i++) {
      const at = count * 5 + i * 3
      if (output[at]) {
        const bend = rope.bends[i] ?? [0, 0]
        bend[0] = output[at + 1]; bend[1] = output[at + 2]; rope.bends[i] = bend
      } else rope.bends[i] = null
    }
    rope.pumpInput = 0
    wasmSteps++
    return true
  } catch {
    failures++; enabled = false
    return false
  }
}
