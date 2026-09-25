import type { RopeState } from './climbables.ts'
import type { Platform } from './model.ts'
import { lineBlocked } from './geometry.ts'

interface ShapeSnapshot { x: number; y: number; w: number; h: number; polygon: number[]; profile: number[] }
interface SleepState { sleeping: boolean; quiet: number; positions: Float64Array; geometry: ShapeSnapshot[] | null }
const states = new WeakMap<RopeState, SleepState>()
const points = (value: Platform['polygon']) => value?.flatMap(p => [p[0], p[1]]) ?? []
const snapshot = (terrain: readonly Platform[]) => terrain.map(b => ({ x: b.x, y: b.y, w: b.w, h: b.h, polygon: points(b.polygon), profile: points(b.profile) }))
function samePoints(current: Platform['polygon'], before: number[]) {
  if ((current?.length ?? 0) * 2 !== before.length) return false
  return !current || current.every((p, i) => p[0] === before[i * 2] && p[1] === before[i * 2 + 1])
}
function sameGeometry(terrain: readonly Platform[], before: ShapeSnapshot[]) {
  return terrain.length === before.length && terrain.every((b, i) => b.x === before[i].x && b.y === before[i].y
    && b.w === before[i].w && b.h === before[i].h && samePoints(b.polygon, before[i].polygon) && samePoints(b.profile, before[i].profile))
}

export function initRopeSleep(rope: RopeState, prepared = false) {
  states.set(rope, { sleeping: prepared, quiet: 0, positions: Float64Array.from(rope.nodes.flatMap(n => [n.x, n.y])), geometry: null })
}

/** Saved ropes are already at rest. Validate them once against the live world,
 * including gates and props that were not present during authoring. */
export function ropeCanSleep(rope: RopeState, terrain: readonly Platform[], loaded: boolean) {
  if (!states.has(rope)) initRopeSleep(rope)
  const state = states.get(rope)!
  if (!loaded && state.sleeping && rope.nodes[0].x === rope.definition.x && rope.nodes[0].y === rope.definition.y
    && rope.nodes.every((n, i) => n.x === state.positions[i * 2] && n.y === state.positions[i * 2 + 1]
    && n.x === n.oldX && n.y === n.oldY)) {
    if (state.geometry && sameGeometry(terrain, state.geometry)) return true
    if (!state.geometry) {
      let clear = true
      for (let i = 1; clear && i < rope.nodes.length; i++) {
        const a = rope.nodes[i - 1], b = rope.nodes[i], bend = rope.bends[i - 1]
        clear = bend ? !lineBlocked([a.x, a.y], bend, terrain) && !lineBlocked(bend, [b.x, b.y], terrain)
          : !lineBlocked([a.x, a.y], [b.x, b.y], terrain)
      }
      if (clear) { state.geometry = snapshot(terrain); return true }
    }
  }
  state.sleeping = false; state.geometry = null
  if (loaded) state.quiet = 0
  return false
}

/** Only an unloaded, settled rope can sleep. Inputs, impulses and changes to
 * nearby geometry wake it; camera visibility never affects the simulation. */
export function settleRopeSleep(rope: RopeState, terrain: readonly Platform[], loaded: boolean, dt: number) {
  const state = states.get(rope)!
  let quiet = !loaded
  for (const [i, n] of rope.nodes.entries()) {
    quiet &&= Math.abs(n.x - n.oldX) < .0005 && Math.abs(n.y - n.oldY) < .0005
      && Math.abs(n.x - state.positions[i * 2]) < .0005 && Math.abs(n.y - state.positions[i * 2 + 1]) < .0005
    state.positions[i * 2] = n.x; state.positions[i * 2 + 1] = n.y
  }
  state.quiet = quiet ? state.quiet + dt : 0
  if (state.quiet < .5) return
  state.sleeping = true; state.geometry = snapshot(terrain); rope.pumpInput = 0
  for (const n of rope.nodes) { n.oldX = n.x; n.oldY = n.y }
}
