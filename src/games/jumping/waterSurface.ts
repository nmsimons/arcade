import type { Platform, Player } from './model.ts'
import type { Prop } from './challenge.ts'
import type { GravityField, GravityPlate } from './gravity.ts'
import { playerSwimStrength, playerWaterCenterOffset, propWaterStrength } from './gravity.ts'
import { platformOutline } from './geometry.ts'
import type { Vec } from './geometry.ts'

export const MAX_WATER_POINTS = 128
export const WATER_STEP = 1 / 30
export const MAX_WAVE_HEIGHT = 6
const MAX_SURFACES = 32, STRIDE = 5
const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n))

export interface WaterSurface {
  left: number; right: number; y: number; spacing: number; active: boolean
  height: Float64Array; previous: Float64Array; velocity: Float64Array; next: Float64Array; ceiling: Float64Array
}
export interface WaterSpan { surface: WaterSurface; left: number; right: number }
export interface WaterSurfaceState {
  surfaces: WaterSurface[]; regions: Map<GravityPlate, WaterSpan[]>
  bodies: Float64Array; wet: Uint8Array; dry: Float64Array
  propHeight: Float64Array; propSlope: Float64Array; propRock: Uint8Array; propRestAngle: Float64Array; propIndex: Map<Prop, number>
  outlines: readonly (readonly Vec[])[]; accumulator: number; active: boolean; enabled: boolean; ticks: number
}

function subtract(spans: number[][], left: number, right: number) {
  return spans.flatMap(([a, b]) => right <= a || left >= b ? [[a, b]]
    : [[a, Math.min(b, left)], [Math.max(a, right), b]]).filter(([a, b]) => b - a >= 1)
}
function solidIntervals(points: readonly Vec[], y: number) {
  const crossings: number[] = []
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length]
    if ((a[1] > y) !== (b[1] > y)) crossings.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]))
  }
  crossings.sort((a, b) => a - b)
  return crossings.flatMap((x, i) => i % 2 === 0 ? [[x, crossings[i + 1]]] : [])
}

/** Compile exposed horizontal air/water boundaries once, including concave
 * terrain and overlapping rectangles. Solid dividers split independent springs. */
export function createWaterSurface(plates: readonly GravityPlate[], terrain: readonly Platform[], player: Player, props: readonly Prop[], field: GravityField, previous?: WaterSurfaceState): WaterSurfaceState | undefined {
  const reservoirs = plates.filter(p => p.effect === 'water'), water = reservoirs.filter(p => p.h > 0)
  if (!water.length) return undefined
  const outlines = previous?.outlines ?? terrain.filter(b => reservoirs.some(p => b.x < p.x + p.w && b.x + b.w > p.x)).map(platformOutline), raw: { left: number; right: number; y: number }[] = []
  for (const plate of water) {
    let spans = [[plate.x, plate.x + plate.w]]
    for (const other of water) if (other.y < plate.y && other.y + other.h >= plate.y) spans = subtract(spans, other.x, other.x + other.w)
    // Reject a roof touching the waterline as well as solids immediately below.
    for (const points of outlines) for (const y of [plate.y - .5, plate.y + .5])
      for (const [left, right] of solidIntervals(points, y)) spans = subtract(spans, left, right)
    for (const [left, right] of spans) if (right - left >= 16) raw.push({ left, right, y: plate.y })
  }
  raw.sort((a, b) => a.y - b.y || a.left - b.left)
  const merged: typeof raw = []
  for (const span of raw) {
    const last = merged.at(-1)
    if (last && last.y === span.y && span.left <= last.right + .01) last.right = Math.max(last.right, span.right)
    else merged.push({ ...span })
  }
  const selected = merged.sort((a, b) => b.right - b.left - (a.right - a.left)).slice(0, MAX_SURFACES)
  if (!selected.length) return undefined
  const counts = selected.map(() => 3)
  let available = MAX_WATER_POINTS - counts.length * 3
  while (available > 0) {
    const index = selected.reduce((best, span, i) => counts[i] < Math.min(32, Math.ceil((span.right - span.left) / 24) + 1)
      && (best < 0 || (span.right - span.left) / counts[i] > (selected[best].right - selected[best].left) / counts[best]) ? i : best, -1)
    if (index < 0) break
    counts[index]++; available--
  }
  const surfaces = selected.map((s, i): WaterSurface => {
    const old = previous?.surfaces[i]
    if (old && old.height.length === counts[i] && Math.abs(old.y - s.y) < 30 && old.left < s.right && old.right > s.left) {
      return Object.assign(old, s, { spacing: (s.right - s.left) / (counts[i] - 1) })
    }
    return { ...s, spacing: (s.right - s.left) / (counts[i] - 1), active: false,
      height: new Float64Array(counts[i]), previous: new Float64Array(counts[i]), velocity: new Float64Array(counts[i]), next: new Float64Array(counts[i]), ceiling: new Float64Array(counts[i]) }
  })
  const regions = new Map(water.map(plate => [plate, surfaces.filter(s => s.y === plate.y && s.left < plate.x + plate.w && s.right > plate.x)
    .map(surface => ({ surface, left: Math.max(surface.left, plate.x), right: Math.min(surface.right, plate.x + plate.w) })).sort((a, b) => a.left - b.left)]))
  const state: WaterSurfaceState = previous ? Object.assign(previous, { surfaces, regions, outlines, active: surfaces.some(s => s.active) }) : { surfaces, regions, outlines,
    bodies: new Float64Array((props.length + 1) * STRIDE), wet: new Uint8Array(props.length + 1), dry: new Float64Array(props.length + 1),
    propHeight: new Float64Array(props.length), propSlope: new Float64Array(props.length), propRock: new Uint8Array(props.length),
    propRestAngle: new Float64Array(props.length), propIndex: new Map(props.map((p, i) => [p, i])),
    accumulator: 0, active: false, enabled: true, ticks: 0 }
  for (const s of surfaces) for (let i = 0; i < s.height.length; i++)
    s.ceiling[i] = clamp(surfaceCeiling(state, s.left + i * s.spacing, s.y, Math.max(32, s.spacing)) - s.y, -MAX_WAVE_HEIGHT, 0)
  if (!previous) seedWaterEntries(state, player, props, field)
  return state
}

function seedWaterEntries(state: WaterSurfaceState, player: Player, props: readonly Prop[], field: GravityField) {
  state.dry.fill(0)
  for (let i = 0; i <= props.length; i++) {
    const body = i === 0 ? player : props[i - 1], offset = i * STRIDE
    const wet = i === 0 ? playerSwimStrength(field, player) : propWaterStrength(field, props[i - 1])
    state.bodies[offset] = body.x; state.bodies[offset + 1] = body.y
    state.bodies[offset + 2] = body.vx; state.bodies[offset + 3] = body.vy
    state.bodies[offset + 4] = wet; state.wet[i] = Number(wet > .001)
  }
}

/** Switching quality discards the old ripple without changing body position or
 * velocity. Resuming seeds current immersion so skipped entries cannot replay. */
export function setWaterSurfaceEnabled(state: WaterSurfaceState, player: Player, props: readonly Prop[], field: GravityField, enabled: boolean) {
  if (state.enabled === enabled) return
  state.enabled = enabled; state.active = false; state.accumulator = 0
  state.propHeight.fill(0); state.propSlope.fill(0); state.propRock.fill(0)
  for (const s of state.surfaces) {
    s.active = false; s.height.fill(0); s.previous.fill(0); s.velocity.fill(0); s.next.fill(0)
  }
  if (enabled) {
    seedWaterEntries(state, player, props, field)
    for (const prop of props) prop.waterImmersion = propWaterStrength(field, prop)
  }
}

/** Query a precompiled surface only; no terrain or field integration in a wave tick. */
export function sampleWaterSurface(surface: WaterSurface, x: number, interpolated = false, blend = 1) {
  const at = clamp((x - surface.left) / surface.spacing, 0, surface.height.length - 1)
  const i = Math.min(surface.height.length - 2, Math.floor(at)), fraction = at - i
  const height = surface.height[i] + (surface.height[i + 1] - surface.height[i]) * fraction
  if (!interpolated) return height
  const old = surface.previous[i] + (surface.previous[i + 1] - surface.previous[i]) * fraction
  return old + (height - old) * blend
}

function surfaceCeiling(state: WaterSurfaceState, x: number, y: number, radius: number) {
  let ceiling = y - MAX_WAVE_HEIGHT - 2
  for (const points of state.outlines) for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length], dx = b[0] - a[0]
    if (dx >= 0 || a[0] < x - radius || b[0] > x + radius) continue
    const left = Math.max(b[0], x - radius), right = Math.min(a[0], x + radius)
    const ay = a[1] + (left - a[0]) * (b[1] - a[1]) / dx, by = a[1] + (right - a[0]) * (b[1] - a[1]) / dx
    if (Math.max(ay, by) <= y) ceiling = Math.max(ceiling, ay, by)
  }
  return ceiling + 2
}

/** Entry impulses have a fixed height/velocity bound, independent of body mass. */
export function disturbWaterSurface(state: WaterSurfaceState, x: number, y: number, speed: number, size: number) {
  if (state.enabled === false) return
  for (const s of state.surfaces) {
    if (x < s.left || x > s.right || Math.abs(y - s.y) > size / 2 + 25) continue
    const width = Math.max(s.spacing * .8, Math.min(80, size * .6)), impulse = clamp(15 + speed * .12, 15, 100)
    for (let i = 1; i < s.height.length - 1; i++) {
      const distance = Math.abs(s.left + i * s.spacing - x) / width
      if (distance < 2) s.velocity[i] = clamp(s.velocity[i] + impulse * Math.exp(-distance * distance * 2), -120, 120)
    }
    s.active = true; state.active = true
    return
  }
}

function observe(state: WaterSurfaceState, index: number, x: number, y: number, vx: number, vy: number, immersion: number, size: number, centerY: number, dt: number) {
  const at = index * STRIDE, old = state.bodies
  const continuous = Math.hypot(x - old[at], y - old[at + 1]) < 80
  if (!continuous) { state.wet[index] = Number(immersion > .001); state.dry[index] = 0 }
  else {
    state.dry[index] = immersion <= .001 ? state.dry[index] + dt : 0
    if (state.dry[index] >= .12) state.wet[index] = 0
    if (!state.wet[index] && immersion >= .02) {
      state.wet[index] = 1
      disturbWaterSurface(state, x, centerY, Math.max(Math.hypot(vx, vy), Math.hypot(old[at + 2], old[at + 3])), size)
    }
  }
  old[at] = x; old[at + 1] = y; old[at + 2] = vx; old[at + 3] = vy; old[at + 4] = immersion
}

function tick(state: WaterSurfaceState) {
  let active = false
  for (const s of state.surfaces) {
    if (!s.active) continue
    s.previous.set(s.height)
    const coupling = Math.min(260, (240 / s.spacing) ** 2)
    let energy = 0
    for (let i = 1; i < s.height.length - 1; i++) {
      s.next[i] = clamp(s.velocity[i] + WATER_STEP * (-22 * s.height[i] - 3.8 * s.velocity[i]
        + coupling * (s.height[i - 1] + s.height[i + 1] - 2 * s.height[i])), -120, 120)
    }
    for (let i = 1; i < s.height.length - 1; i++) {
      s.velocity[i] = s.next[i]
      s.height[i] = clamp(s.height[i] + s.velocity[i] * WATER_STEP, s.ceiling[i], MAX_WAVE_HEIGHT)
      if (s.height[i] === MAX_WAVE_HEIGHT || s.height[i] === s.ceiling[i]) s.velocity[i] *= .5
      energy = Math.max(energy, Math.abs(s.height[i]), Math.abs(s.velocity[i]) * .1)
    }
    s.active = energy > .015
    if (!s.active) { s.height.fill(0); s.previous.fill(0); s.velocity.fill(0) }
    active ||= s.active
  }
  state.active = active; state.ticks++
}

/** Reuse the immersion already calculated for buoyancy. Waves have their own
 * 30 Hz clock; a settled pool does no spring or prop-sampling work. */
export function advanceWaterSurface(state: WaterSurfaceState, player: Player, props: readonly Prop[], playerImmersion: number, dt: number) {
  if (state.enabled === false) return
  const centerY = player.y + (!state.wet[0] && playerImmersion >= .02 ? playerWaterCenterOffset(player) : 0)
  observe(state, 0, player.x, player.y, player.vx, player.vy, playerImmersion, 60, centerY, dt)
  for (let i = 0; i < props.length; i++) {
    const b = props[i]
    observe(state, i + 1, b.x, b.y, b.vx, b.vy, b.waterImmersion ?? 0, b.size, b.y - b.size / 2, dt)
  }
  if (!state.active) return
  state.accumulator += dt
  if (state.accumulator + 1e-9 < WATER_STEP) return
  // The game's bounded fixed step cannot accumulate an unbounded catch-up queue.
  while (state.accumulator + 1e-9 >= WATER_STEP) { tick(state); state.accumulator = Math.max(0, state.accumulator - WATER_STEP) }
  state.propHeight.fill(0); state.propSlope.fill(0)
  for (let i = 0; i < props.length; i++) {
    const b = props[i]
    if (b.grounded || (b.waterImmersion ?? 0) <= .1 || (b.waterImmersion ?? 0) >= .9) continue
    for (const s of state.surfaces) {
      if (!s.active || b.x < s.left || b.x > s.right || Math.abs(b.y - b.size / 2 - s.y) > b.size / 2 + 12) continue
      const left = sampleWaterSurface(s, b.x - b.size * .3), right = sampleWaterSurface(s, b.x + b.size * .3)
      state.propHeight[i] = (left + right) / 2; state.propSlope[i] = (right - left) / b.size
      if (b.kind === 'box' && Math.abs(state.propSlope[i]) > .0001 && !state.propRock[i]) {
        state.propRock[i] = 1; state.propRestAngle[i] = b.angle
      }
      break
    }
  }
}
