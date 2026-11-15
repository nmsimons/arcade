/**
 * Visible consequences of impacts: dust where a body lands hard or a crate or
 * ball strikes, and a splash where something enters water. The sound
 * observer (audioState.ts) reports them from the same solved contacts that make
 * its cues, so picture and sound always agree. Effects are presentation only:
 * they live beside a run, keyed by it, never on it, and nothing in the
 * simulation reads them. A restarted run is a new run and starts with none.
 * Each effect is drawn from gameplay time (`run.activeTime`), so pausing freezes
 * it and an identical run draws identical frames.
 */
import { TUNING } from './movementTuning.ts'

export type WorldEffectKind = 'landing' | 'box-impact' | 'ball-impact' | 'splash'
export interface WorldEffect {
  kind: WorldEffectKind
  /** The contact point: the feet, the bottom of a prop, or the entry point on the waterline. */
  x: number; y: number
  /** 0 to 1: how hard the impact was, after each kind's own threshold. A splash's keeps growing past 1 with the
   * entry speed, to about 3 for a long fall (splashEnergy). */
  strength: number
  /** The body's size in world units, which scales prop dust and splashes. */
  size: number
  /** The supporting surface's angle, and -1 when the body stands on a ceiling. */
  angle: number; up: number
  /** `run.activeTime` when the impact happened. */
  time: number
}

/** Seconds each kind stays on screen, at the least (worldEffectLife). */
export const WORLD_EFFECT_LIFE: Readonly<Record<WorldEffectKind, number>> = { landing: .5, 'box-impact': .4, 'ball-impact': .4, splash: .6 }
/** A bounded list: a pile of crates landing together still draws a few dozen shapes. */
export const MAX_WORLD_EFFECTS = 24
/** Landings softer than this fall speed (units/s) leave no dust: a walk, a step down or a small hop. */
export const LANDING_DUST_SPEED = 450
/** Fall speed at which landing dust is at its fullest. */
export const LANDING_DUST_FULL_SPEED = 1000
/** Prop impacts quieter than this leave no dust, so settling chatter stays still. */
export const PROP_TICK_STRENGTH = .3

/** Entry speed (units/s, splashEntrySpeed) at or below which a body slips into the water without a splash or a
 * sound: walking or running down a beach, or a step off a low edge at a walk. */
export const SPLASH_MIN_SPEED = 160
/** Entry speed of a short drop, about 140 units: a splash from it has strength 1. */
export const SPLASH_FULL_SPEED = 650
/** Entry speed of a long fall: the player's falling limit (model.ts), with a run behind it. A faster entry throws
 * no bigger a splash. */
export const SPLASH_MAX_SPEED = 1200

/** How fast a body moving at vx, vy meets the water: dropping in throws water up, moving along the surface far less. */
export const splashEntrySpeed = (vx: number, vy: number) => Math.hypot(vx / 2, vy)
/**
 * How hard a body of this size enters the water at this entry speed: nothing at all for a gentle entry, rising from
 * nothing past SPLASH_MIN_SPEED to 1 for a short drop, and on, faster, to 3 for a long fall, so a jump down from a
 * deck throws a visibly bigger splash than a hop in. The splash grows with it all the way (impactRender.ts), and the
 * entry sound with it up to 1 (audioState.ts).
 */
export function splashEnergy(speed: number, size: number) {
  const v = Math.min(Math.max(0, speed), SPLASH_MAX_SPEED)
  if (v <= SPLASH_MIN_SPEED) return 0
  const pace = v <= SPLASH_FULL_SPEED ? (v - SPLASH_MIN_SPEED) / (SPLASH_FULL_SPEED - SPLASH_MIN_SPEED)
    : 1 + 2 * (v - SPLASH_FULL_SPEED) / (SPLASH_MAX_SPEED - SPLASH_FULL_SPEED)
  return pace * Math.min(1.3, Math.max(.65, Math.sqrt(size / 60)))
}
/** How a body's size (world units) scales its splash's sheets and drops. */
export const splashScale = (size: number) => Math.min(1.5, Math.max(.7, Math.sqrt(size / 60)))
/** The faintest splashes grow in from nothing: below this strength the whole splash shrinks with it. */
export const splashOnset = (strength: number) => Math.min(1, strength / .2)
/**
 * How fast a splash throws its fastest drops, units/s. Up to strength 1 it grows in proportion; a harder entry
 * throws them higher still, though less than in proportion, so a long fall's spray rises about twice a short drop's.
 */
export function splashDropSpeed(strength: number, size: number) {
  return (160 + 240 * (strength <= 1 ? strength : strength ** .6)) * splashOnset(strength) * Math.sqrt(splashScale(size))
}
/** Seconds this effect stays on screen: a harder entry's drops fly higher and take longer to fall back in. */
export function worldEffectLife(e: WorldEffect) {
  if (e.kind !== 'splash') return WORLD_EFFECT_LIFE[e.kind]
  // The fastest drop, thrown nearly straight up, is back in the water at twice its rise time.
  return Math.max(WORLD_EFFECT_LIFE.splash, 2 * splashDropSpeed(e.strength, e.size) / TUNING.gravity + .05)
}

const NONE: readonly WorldEffect[] = []
const effects = new WeakMap<object, WorldEffect[]>()

export function recordWorldEffect(run: object, effect: WorldEffect) {
  let list = effects.get(run)
  if (!list) { list = []; effects.set(run, list) }
  // Forget finished effects first; then the oldest live one makes room.
  let kept = 0
  for (const e of list) if (effect.time - e.time < worldEffectLife(e)) list[kept++] = e
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
