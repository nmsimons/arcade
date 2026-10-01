import type { JumpLevel } from './level.ts'

export type PowerMode = 'always' | 'switched'
export type PlateBehavior = 'pressure' | 'switch' | 'toggle'

/** A shared target list keeps wiring, validation and the inspector in agreement. */
export function switchedItems(level: JumpLevel) {
  return [
    ...(level.mechanisms ?? []).flatMap((m, index) => m.power === 'always' ? [] : [{ id: m.id, kind: 'mechanism' as const, index }]),
    ...(level.lighting?.lights ?? []).flatMap((l, index) => l.power === 'switched' ? [{ id: l.id, kind: 'light' as const, index }] : []),
    ...(level.goal?.power === 'switched' && level.goal.id ? [{ id: level.goal.id, kind: 'goal' as const, index: 0 }] : []),
  ]
}
