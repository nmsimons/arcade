import type { Prop, Run } from './challenge.ts'
import { settleRun } from './challenge.ts'
import { releaseRopeAnchor } from './climbables.ts'
import type { JumpLevel } from './level.ts'

/**
 * The facility resets its timed courses after every run. Every other place is
 * an ordinary place: an untimed level keeps its state between visits, saved
 * here by level ID. Robots return to their posts and the player's robot
 * resumes at its door, so only the world it acted on is saved: where props
 * lie, mechanisms, switches and toggle groups, float switches, water levels
 * and tied ropes that have let go of an anchor.
 */
export const AREA_STATE_KEY = 'arcade.jumping.areas.v1'
export interface AreaState {
  /** The level as authored when saved. Editing its file starts it afresh. */
  level: string
  props: { x: number; y: number; angle: number }[]
  mechanisms: { x: number; y: number; direction: number; wait: number }[]
  triggers: { held: number; pressed: boolean; active: boolean; depression: number }[]
  toggles: Record<string, boolean>
  /** Whether each float switch's arm is raised. */
  floats: boolean[]
  /** Each water pool's level, in percent. */
  water: number[]
  /** Tied ropes, by index, that have let go of their switched anchor. */
  ropes: number[]
}

/** Every untimed level keeps its state; the facility resets timed courses. */
export const keepsState = (level: Pick<JumpLevel, 'timing'>) => level.timing === 'untimed'

const fingerprints = new WeakMap<JumpLevel, string>()
/** A short hash of the level's whole file: any edit makes earlier saved states for it stale. */
export function levelFingerprint(level: JumpLevel) {
  let cached = fingerprints.get(level)
  if (cached) return cached
  const text = JSON.stringify(level)
  // cyrb53: a fast 53-bit string hash. It detects edits; it is not a security check.
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  cached = (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
  fingerprints.set(level, cached)
  return cached
}

// Carrying a tool takes it out of `run.props` and dropping it puts it back at the end,
// so a run's props are remembered in their authored order while it is fresh.
const authoredProps = new WeakMap<Run, Prop[]>()
/** Call on a fresh, unstepped run that keeps its state, before restoring or saving it. */
export function trackAreaProps(run: Run) { authoredProps.set(run, [...run.props]) }

export function captureAreaState(run: Run, fingerprint: string): AreaState {
  const props = authoredProps.get(run) ?? run.props, held = run.gadgets.held, ropes = run.player.ropes ?? []
  return {
    level: fingerprint,
    // A tool still in hand stays behind at the robot's feet, as it does at a door.
    props: props.map(prop => prop === held ? { x: run.player.x, y: run.player.y, angle: 0 } : { x: prop.x, y: prop.y, angle: prop.angle }),
    mechanisms: run.mechanisms.map(({ x, y, direction, wait }) => ({ x, y, direction, wait })),
    triggers: run.triggers.map(({ held, pressed, active, depression }) => ({ held, pressed, active, depression })),
    toggles: Object.fromEntries(run.toggleGroupStates),
    floats: run.floatSwitches.map(state => state.raised),
    water: run.water.pools.map(pool => pool.level),
    ropes: run.level.climbables.ropes.flatMap((rope, i) => rope.end && ropes[i] && !ropes[i].definition.end ? [i] : []),
  }
}

/**
 * Write a saved state into a fresh, unstepped run of the same level. Returns
 * false, changing nothing, when the state does not fit the run.
 */
export function restoreAreaState(run: Run, state: AreaState): boolean {
  const props = authoredProps.get(run) ?? run.props, ropes = run.player.ropes ?? []
  if (state.props.length !== props.length || state.mechanisms.length !== run.mechanisms.length || state.triggers.length !== run.triggers.length
    || state.floats.length !== run.floatSwitches.length || state.water.length !== run.water.pools.length
    || state.ropes.some(i => !run.level.climbables.ropes[i]?.release || !ropes[i])) return false
  // Saved props start at rest; the solver settles any that were moving.
  props.forEach((prop, i) => Object.assign(prop, state.props[i], { vx: 0, vy: 0, angularVelocity: 0 }))
  run.mechanisms.forEach((mechanism, i) => Object.assign(mechanism, state.mechanisms[i], { safetyHold: null }))
  run.triggers.forEach((trigger, i) => Object.assign(trigger, state.triggers[i]))
  for (const id of run.toggleGroupStates.keys()) if (typeof state.toggles[id] === 'boolean') run.toggleGroupStates.set(id, state.toggles[id])
  run.floatSwitches.forEach((float, i) => { float.raised = state.floats[i] })
  run.water.pools.forEach((pool, i) => {
    pool.level = Math.max(pool.definition.waterMinLevel ?? 0, Math.min(100, state.water[i]))
    pool.region.h = pool.definition.h * pool.level / 100
    pool.region.y = pool.definition.y + pool.definition.h - pool.region.h
    pool.previousY = pool.region.y; pool.pending = 0; pool.rise = 0
  })
  run.water.revision++
  for (const i of state.ropes) if (ropes[i].definition.end) releaseRopeAnchor(ropes[i], run.level.climbables.ropes[i].release!.anchor)
  settleRun(run)
  return true
}

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const list = (value: unknown, item: (entry: Record<string, unknown>) => boolean) => Array.isArray(value) && value.length <= 2000 && value.every(entry => record(entry) && item(entry))
function isAreaState(value: unknown): value is AreaState {
  if (!record(value) || typeof value.level !== 'string') return false
  return list(value.props, p => finite(p.x) && finite(p.y) && finite(p.angle))
    && list(value.mechanisms, m => finite(m.x) && finite(m.y) && finite(m.direction) && finite(m.wait))
    && list(value.triggers, t => finite(t.held) && typeof t.pressed === 'boolean' && typeof t.active === 'boolean' && finite(t.depression))
    && record(value.toggles) && Object.values(value.toggles).every(on => typeof on === 'boolean')
    && Array.isArray(value.floats) && value.floats.every(raised => typeof raised === 'boolean')
    && Array.isArray(value.water) && value.water.every(finite)
    && Array.isArray(value.ropes) && value.ropes.every(i => Number.isInteger(i) && i >= 0)
}
/** Every saved place, by level ID. Unreadable entries are dropped: their places start afresh. */
export function readAreaStates(storage: Pick<Storage, 'getItem'>): Record<string, AreaState> {
  try {
    const value: unknown = JSON.parse(storage.getItem(AREA_STATE_KEY) ?? '{}')
    if (!record(value)) return {}
    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, AreaState] => isAreaState(entry[1])))
  } catch { return {} }
}
/** A level's saved state, if it was saved from the same version of the level. */
export function readAreaState(storage: Pick<Storage, 'getItem'>, level: JumpLevel): AreaState | null {
  const state = readAreaStates(storage)[level.id]
  return state?.level === levelFingerprint(level) ? state : null
}
/** Save a level's state, or forget it with `null`. */
export function writeAreaState(storage: Pick<Storage, 'getItem' | 'setItem'>, id: string, state: AreaState | null) {
  const states = readAreaStates(storage)
  if (state) states[id] = state
  else if (id in states) delete states[id]
  else return
  storage.setItem(AREA_STATE_KEY, JSON.stringify(states))
}
