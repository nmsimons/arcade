import type { JumpLevel } from './level.ts'
import type { Selection } from './editor.ts'
import type { NamedObject } from './objectNames.ts'
import { mechanismLabel } from './mechanisms.ts'
import { pickupLabel } from './pickups.ts'

/** Resolve authored data rather than the bounds derived for editor handles. */
export function itemDefinition(level: JumpLevel, selection: Selection): NamedObject | undefined {
  if (selection.kind === 'spawn') return level.spawn
  if (selection.kind === 'goal') return level.goal
  const collections = {
    platform: level.platforms, rope: level.climbables.ropes, ladder: level.climbables.ladders,
    checkpoint: level.checkpoints, prop: level.props, robot: level.robots, mechanism: level.mechanisms,
    trigger: level.triggers, timer: level.timers, text: level.texts, pickup: level.pickups, light: level.lighting?.lights, 'wall-light': level.wallLights, 'logic-relay': level.logicRelays, 'gravity-plate': level.gravityPlates, 'force-field': level.forceFields,
  }
  return collections[selection.kind]?.[selection.index]
}

export function defaultObjectLabel(level: JumpLevel, s: Selection): string {
  if (s.kind === 'logic-relay') return `Logic relay ${s.index + 1}`
  const name = s.kind === 'spawn' ? 'Start' : s.kind === 'goal' ? 'Goal light' : s.kind === 'prop' ? level.props?.[s.index]?.kind === 'ball' ? 'Ball' : 'Box'
    : s.kind === 'pickup' ? pickupLabel(level.pickups![s.index].kind) : s.kind === 'light' ? 'Spotlight' : s.kind === 'force-field' ? level.forceFields![s.index].orientation === 'horizontal' ? 'Horizontal force field' : 'Vertical force field' : s.kind === 'gravity-plate' ? level.gravityPlates?.[s.index]?.effect === 'water' ? 'Water' : 'Gravity plate' : s.kind === 'wall-light' ? 'Wall light' : s.kind === 'timer' ? 'Wall timer' : s.kind === 'text' ? 'Wall text' : s.kind === 'robot' ? 'Shovebot' : s.kind === 'trigger' ? level.triggers?.[s.index]?.mode === 'coins' ? 'Coin switch' : 'Pressure plate' : s.kind === 'mechanism' ? mechanismLabel(level.mechanisms![s.index]) : s.kind === 'platform' ? 'Terrain' : s.kind[0].toUpperCase() + s.kind.slice(1)
  return `${name}${s.kind === 'spawn' || s.kind === 'goal' ? '' : ` ${s.index + 1}`}`
}

/** Keep the type and number visible to distinguish duplicate or missing names. */
export function objectLabel(level: JumpLevel, selection: Selection): string {
  const fallback = defaultObjectLabel(level, selection), name = itemDefinition(level, selection)?.name?.trim()
  return name ? `${name} · ${fallback}` : fallback
}

export const objectReference = (level: JumpLevel, kind: Selection['kind'], index = 0) => `“${objectLabel(level, { kind, index })}”`
