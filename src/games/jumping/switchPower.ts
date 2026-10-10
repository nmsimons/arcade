import type { JumpLevel, Trigger } from './level.ts'
import { objectReference } from './objectLabels.ts'

export type PowerMode = 'always' | 'switched'
export type PlateBehavior = 'pressure' | 'switch' | 'toggle'
export type SwitchLogic = 'or' | 'and' | 'xor'
/** 40 mechanisms, 16 spotlights, 40 wall lights, 40 logic nodes, 16 gravity plates, 40 fields and an exit. */
export const MAX_SWITCH_TARGETS = 193
export interface SwitchSettings { switchLogic?: SwitchLogic; switchReversed?: boolean; relay?: boolean; targets?: string[] }
interface SwitchInputs { connected: number; active: number }

export function parseSwitchSettings(value: { switchLogic?: unknown; switchReversed?: unknown; relay?: unknown; targets?: unknown }, fail: () => never): SwitchSettings {
  const { switchLogic, switchReversed, relay, targets } = value
  if (switchLogic !== undefined && switchLogic !== 'or' && switchLogic !== 'and' && switchLogic !== 'xor') return fail()
  if (switchReversed !== undefined && typeof switchReversed !== 'boolean') return fail()
  if (relay !== undefined && typeof relay !== 'boolean') return fail()
  if (targets !== undefined && (!Array.isArray(targets) || targets.length > MAX_SWITCH_TARGETS
    || targets.some(id => typeof id !== 'string' || !id || id.length > 100) || new Set(targets).size !== targets.length)) return fail()
  return { ...(switchLogic === undefined ? {} : { switchLogic }), ...(switchReversed === undefined ? {} : { switchReversed }), ...(relay === undefined ? {} : { relay }),
    ...(targets === undefined ? {} : { targets: [...targets as string[]] }) }
}

export const switchTargets = (source: { targets?: readonly string[]; target?: string }): readonly string[] => source.targets ?? (source.target ? [source.target] : [])

/** Count each connected switch once, including inactive and legacy inputs. */
export function collectSwitchInputs(triggers: readonly Trigger[] = [], states: readonly { active: boolean }[] = []) {
  const inputs = new Map<string, SwitchInputs>()
  for (const [index, trigger] of triggers.entries()) {
    for (const id of switchTargets(trigger)) {
      const counts = inputs.get(id) ?? { connected: 0, active: 0 }
      counts.connected++
      if (states[index]?.active) counts.active++
      inputs.set(id, counts)
    }
  }
  return inputs
}

/** No connections means off before reversal. XOR means exactly one active input. */
export function switchTargetActive(target: SwitchSettings & { id?: string }, inputs: ReadonlyMap<string, SwitchInputs>) {
  const counts = inputs.get(target.id ?? '')
  const active = !!counts?.connected && (target.switchLogic === 'and' ? counts.active === counts.connected
    : target.switchLogic === 'xor' ? counts.active === 1 : counts.active > 0)
  return target.switchReversed ? !active : active
}

/** A shared target list keeps wiring, validation and the inspector in agreement. */
export function switchedItems(level: JumpLevel) {
  return [
    ...(level.logicRelays ?? []).map((definition, index) => ({ id: definition.id, kind: 'logic-relay' as const, index, definition })),
    ...(level.mechanisms ?? []).flatMap((m, index) => m.power === 'always' ? [] : [{ id: m.id, kind: 'mechanism' as const, index, definition: m }]),
    ...(level.lighting?.lights ?? []).flatMap((l, index) => l.power === 'switched' ? [{ id: l.id, kind: 'light' as const, index, definition: l }] : []),
    ...(level.gravityPlates ?? []).flatMap((definition, index) => definition.effect === 'water' || definition.power === 'always' ? [] : [{ id: definition.id, kind: 'gravity-plate' as const, index, definition }]),
    ...(level.forceFields ?? []).flatMap((definition, index) => definition.power === 'switched' ? [{ id: definition.id, kind: 'force-field' as const, index, definition }] : []),
    ...(level.wallLights ?? []).map((definition, index) => ({ id: definition.id, kind: 'wall-light' as const, index, definition })),
    ...(level.goal?.power === 'switched' && level.goal.id ? [{ id: level.goal.id, kind: 'goal' as const, index: 0, definition: level.goal }] : []),
  ]
}

/** Logic nodes always relay; physical items opt in. */
export const isSwitchRelay = (item: { kind: string; definition: SwitchSettings }) => item.kind === 'logic-relay' || !!item.definition.relay

/** Both wiring directions in the inspector edit these same source definitions. */
export function switchSources(level: JumpLevel) {
  return [...(level.triggers ?? []).map((definition, index) => ({ kind: 'trigger' as const, index, definition })), ...switchedItems(level).filter(isSwitchRelay)]
}

/** Settle a whole relay chain before mechanisms, exit and lights read the result. */
export function resolveSwitchStates(level: JumpLevel, triggers: readonly { active: boolean }[]) {
  const items = switchedItems(level), byId = new Map(items.map(item => [item.id, item]))
  const inputs = collectSwitchInputs(level.triggers, triggers), pending = new Map(items.map(item => [item.id, 0]))
  for (const item of items) if (isSwitchRelay(item)) for (const id of item.definition.targets ?? []) {
    if (byId.has(id)) pending.set(id, pending.get(id)! + 1)
  }
  const ready = items.filter(item => pending.get(item.id) === 0), states = new Map<string, boolean>()
  for (let index = 0; index < ready.length; index++) {
    const item = ready[index], active = switchTargetActive({ ...item.definition, id: item.id }, inputs)
    states.set(item.id, active)
    if (!isSwitchRelay(item)) continue
    for (const id of item.definition.targets ?? []) {
      if (!byId.has(id)) continue
      const counts = inputs.get(id) ?? { connected: 0, active: 0 }
      counts.connected++; if (active) counts.active++
      inputs.set(id, counts)
      const remaining = pending.get(id)! - 1
      pending.set(id, remaining)
      if (remaining === 0) ready.push(byId.get(id)!)
    }
  }
  // Invalid wiring remains editable in previews. Validation blocks saving/play;
  // nodes in a feedback loop and their dependents stay off until it is repaired.
  return states
}

export function switchWiringProblems(level: JumpLevel, validateTriggers = true): string[] {
  const items = switchedItems(level), byId = new Map(items.map(item => [item.id, item])), issues: string[] = []
  for (const source of switchSources(level)) if ((validateTriggers || source.kind !== 'trigger') && switchTargets(source.definition).some(id => !byId.has(id))) {
    issues.push(`Connect ${objectReference(level, source.kind, source.index)} only to existing switched items.`)
  }
  const definitions = [...(level.logicRelays ?? []).map((definition, index) => ({ definition, kind: 'logic-relay' as const, index })),
    ...(level.mechanisms ?? []).map((definition, index) => ({ definition, kind: 'mechanism' as const, index })),
    ...(level.lighting?.lights ?? []).map((definition, index) => ({ definition, kind: 'light' as const, index })),
    ...(level.forceFields ?? []).map((definition, index) => ({ definition, kind: 'force-field' as const, index })),
    ...(level.gravityPlates ?? []).flatMap((definition, index) => definition.effect === 'water' ? [] : [{ definition, kind: 'gravity-plate' as const, index }]),
    ...(level.wallLights ?? []).map((definition, index) => ({ definition, kind: 'wall-light' as const, index })),
    ...(level.goal ? [{ definition: level.goal, kind: 'goal' as const, index: 0 }] : [])]
  for (const item of definitions) {
    if (item.definition.relay && !byId.has(item.definition.id ?? '')) issues.push(`Set ${objectReference(level, item.kind, item.index)} to Switched before enabling Relay.`)
    if (item.definition.targets?.length && !isSwitchRelay(item)) issues.push(`Enable Relay on ${objectReference(level, item.kind, item.index)} before connecting its outputs.`)
  }
  const visited = new Set<string>(), visiting = new Set<string>(), path: typeof items = []
  function visit(item: typeof items[number]): string | null {
    if (visiting.has(item.id)) {
      const loop = [...path.slice(path.findIndex(node => node.id === item.id)), item]
      return `Relay wiring loop: ${loop.map(node => objectReference(level, node.kind, node.index)).join(' → ')}. Remove a connection to break the loop.`
    }
    if (visited.has(item.id)) return null
    visiting.add(item.id); path.push(item)
    if (isSwitchRelay(item)) for (const id of item.definition.targets ?? []) {
      const target = byId.get(id), issue = target ? visit(target) : null
      if (issue) return issue
    }
    path.pop(); visiting.delete(item.id); visited.add(item.id)
    return null
  }
  for (const item of items) {
    const issue = visit(item)
    if (issue) { issues.push(issue); break }
  }
  return issues
}

/** Called only on an editor copy, after deleting an item or changing its power. */
export function removeSwitchTarget(level: JumpLevel, id: string) {
  for (const item of [...level.triggers ?? [], ...level.logicRelays ?? [], ...level.mechanisms ?? [], ...level.lighting?.lights ?? [], ...level.wallLights ?? [], ...level.gravityPlates ?? [], ...level.forceFields ?? [], ...(level.goal ? [level.goal] : [])]) {
    if (item.targets) item.targets = item.targets.filter(target => target !== id)
    else if ('target' in item && item.target === id) item.target = ''
  }
}
