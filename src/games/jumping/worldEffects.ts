/**
 * Visible consequences of impacts: dust where a body lands hard, ticks where a
 * crate or ball strikes, and a splash where something enters water. The sound
 * observer (audioState.ts) reports them from the same solved contacts that make
 * its cues, so picture and sound always agree. Effects are presentation only:
 * they live beside a run, keyed by it, never on it, and nothing in the
 * simulation reads them. A restarted run is a new run and starts with none.
 * Each effect is drawn from gameplay time (`run.activeTime`), so pausing freezes
 * it and an identical run draws identical frames.
 */
export type WorldEffectKind = 'landing' | 'box-impact' | 'ball-impact' | 'splash'
export interface WorldEffect {
  kind: WorldEffectKind
  /** The contact point: the feet, the bottom of a prop, or the entry point on the waterline. */
  x: number; y: number
  /** 0 to 1: how hard the impact was, after each kind's own threshold. */
  strength: number
  /** The body's size in world units, which scales prop ticks and splashes. */
  size: number
  /** The supporting surface's angle, and -1 when the body stands on a ceiling. */
  angle: number; up: number
  /** `run.activeTime` when the impact happened. */
  time: number
}

/** Seconds each kind stays on screen. */
export const WORLD_EFFECT_LIFE: Readonly<Record<WorldEffectKind, number>> = { landing: .35, 'box-impact': .25, 'ball-impact': .25, splash: .6 }
/** A bounded list: a pile of crates landing together still draws a few dozen shapes. */
export const MAX_WORLD_EFFECTS = 24
/** Landings softer than this fall speed (units/s) leave no dust: a walk, a step down or a small hop. */
export const LANDING_DUST_SPEED = 450
/** Fall speed at which landing dust is at its fullest. */
export const LANDING_DUST_FULL_SPEED = 1000
/** Prop impacts quieter than this leave no ticks, so settling chatter stays still. */
export const PROP_TICK_STRENGTH = .3

const NONE: readonly WorldEffect[] = []
const effects = new WeakMap<object, WorldEffect[]>()

export function recordWorldEffect(run: object, effect: WorldEffect) {
  let list = effects.get(run)
  if (!list) { list = []; effects.set(run, list) }
  // Forget finished effects first; then the oldest live one makes room.
  let kept = 0
  for (const e of list) if (effect.time - e.time < WORLD_EFFECT_LIFE[e.kind]) list[kept++] = e
  list.length = kept
  if (list.length >= MAX_WORLD_EFFECTS) list.shift()
  list.push(effect)
}

/** The effects recorded for this run, oldest first; finished ones may remain until the next is recorded. */
export function worldEffects(run: object): readonly WorldEffect[] {
  return effects.get(run) ?? NONE
}

/** Dust strength for a landing at this fall speed, or 0 for none. */
export function landingDustStrength(fallSpeed: number) {
  return Math.max(0, Math.min(1, (fallSpeed - LANDING_DUST_SPEED) / (LANDING_DUST_FULL_SPEED - LANDING_DUST_SPEED)))
}
