import type { Selection } from './editor.ts'
import type { JumpLevel } from './level.ts'
import { copyLevel, newLevelId } from './level.ts'
import { itemDefinition } from './objectLabels.ts'

/** Flat, editor-only groups. Object references follow their collection indices. */
export interface EditorGroup { id: string; members: Selection[] }
const key = (s: Selection) => `${s.kind}:${s.index}`
const kinds = new Set<Selection['kind']>(['back-wall', 'platform', 'rope', 'ladder', 'entrance', 'checkpoint', 'goal', 'prop', 'robot',
  'mechanism', 'trigger', 'timer', 'text', 'pickup', 'light', 'wall-light', 'logic-relay', 'float-switch', 'gravity-plate', 'force-field'])

export function parseEditorGroups(value: unknown, level: JumpLevel): EditorGroup[] {
  const fail = (): never => { throw new Error('Invalid editor groups. Each group needs at least two existing objects, and an object can belong to only one group.') }
  if (!Array.isArray(value) || value.length > 512) return fail()
  const ids = new Set<string>(), used = new Set<string>()
  return value.map(raw => {
    if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !raw.id.trim() || raw.id.length > 100
      || ids.has(raw.id) || !Array.isArray(raw.members) || raw.members.length < 2 || raw.members.length > 1000) return fail()
    ids.add(raw.id)
    const members = raw.members.map((s: unknown): Selection => {
      if (!s || typeof s !== 'object' || !('kind' in s) || !('index' in s) || !kinds.has(s.kind as Selection['kind'])
        || !Number.isInteger(s.index) || (s.index as number) < 0) return fail()
      const member = { kind: s.kind, index: s.index } as Selection
      if (((member.kind === 'entrance' || member.kind === 'goal') && member.index !== 0)
        || !itemDefinition(level, member) || used.has(key(member))) return fail()
      used.add(key(member)); return member
    })
    return { id: raw.id, members }
  })
}

export function expandEditorGroups(level: JumpLevel, selections: readonly Selection[]): Selection[] {
  const members = new Map((level.editorGroups ?? []).flatMap(group => group.members.map(s => [key(s), group.members] as const)))
  const unique = new Map<string, Selection>()
  for (const selection of selections) for (const s of members.get(key(selection)) ?? [selection]) unique.set(key(s), s)
  return [...unique.values()]
}

export function selectedEditorGroup(level: JumpLevel, selections: readonly Selection[]): EditorGroup | undefined {
  const selected = new Set(selections.map(key))
  return level.editorGroups?.find(g => g.members.length === selected.size && g.members.every(s => selected.has(key(s))))
}

export function groupSelections(level: JumpLevel, selections: readonly Selection[]): JumpLevel {
  const members = expandEditorGroups(level, selections).filter(s => itemDefinition(level, s))
  if (members.length < 2 || selectedEditorGroup(level, members)) return level
  const next = ungroupSelections(level, members), grouped = next === level ? copyLevel(level) : next
  const groups = grouped.editorGroups ??= []
  groups.push({ id: newLevelId(), members: structuredClone(members) })
  return grouped
}

export function ungroupSelections(level: JumpLevel, selections: readonly Selection[]): JumpLevel {
  const selected = new Set(selections.map(key)), groups = level.editorGroups ?? []
  const kept = groups.filter(g => !g.members.some(s => selected.has(key(s))))
  if (kept.length === groups.length) return level
  const next = copyLevel(level)
  if (kept.length) next.editorGroups = structuredClone(kept); else delete next.editorGroups
  return next
}

/** Keep editor references attached to their objects when collections change. */
export function remapEditorGroups(level: JumpLevel, remap: (member: Selection) => Selection[]) {
  if (!level.editorGroups) return
  level.editorGroups = level.editorGroups.map(g => ({ ...g, members: g.members.flatMap(remap) }))
    .filter(g => g.members.length >= 2)
  if (!level.editorGroups.length) delete level.editorGroups
}

/** Deletions compact an object's collection; retain the identity of later members. */
export function removeEditorGroupMember(level: JumpLevel, removed: Selection) {
  remapEditorGroups(level, s => s.kind !== removed.kind ? [s] : s.index === removed.index ? []
    : [{ ...s, index: s.index > removed.index ? s.index - 1 : s.index }])
}
