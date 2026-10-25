import type { JumpLevel, Trigger } from './level.ts'
import { OBJECT_NAME_MAX_LENGTH } from './objectNames.ts'

export interface ToggleGroup { id: string; name: string; startsOn?: boolean }
export const MAX_TOGGLE_GROUPS = 40

export function parseToggleGroups(value: unknown, fail: () => never): ToggleGroup[] {
  if (!Array.isArray(value) || value.length > MAX_TOGGLE_GROUPS) return fail()
  const ids = new Set<string>()
  return value.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return fail()
    const { id, name, startsOn } = item as Record<string, unknown>
    if (typeof id !== 'string' || !id.trim() || id.length > 100 || ids.has(id)
      || typeof name !== 'string' || !name.trim() || name.length > OBJECT_NAME_MAX_LENGTH
      || startsOn !== undefined && typeof startsOn !== 'boolean') return fail()
    ids.add(id)
    return { id, name: name.trim(), ...(startsOn === undefined ? {} : { startsOn: startsOn as boolean }) }
  })
}

export const triggerToggleGroup = (trigger: Trigger) => trigger.mode !== 'coins' && trigger.behavior === 'toggle' ? trigger.toggleGroup : undefined
export function triggerStartsOn(level: JumpLevel, trigger: Trigger): boolean {
  if (trigger.mode === 'coins' || trigger.behavior !== 'switch' && trigger.behavior !== 'toggle') return false
  const group = triggerToggleGroup(trigger)
  return group ? !!level.toggleGroups?.find(g => g.id === group)?.startsOn : !!trigger.startsOn
}

/** Predict the whole shared signal when a bot considers pressing one member. */
export function withTriggerActive(level: JumpLevel, states: readonly { active: boolean }[], index: number, active: boolean) {
  const group = triggerToggleGroup(level.triggers![index])
  return states.map((state, i) => i === index || group && triggerToggleGroup(level.triggers![i]) === group ? { active } : state)
}
