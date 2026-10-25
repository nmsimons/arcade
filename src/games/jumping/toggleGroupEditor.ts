import { copyLevel, newLevelId } from './level.ts'
import type { JumpLevel } from './level.ts'
import { OBJECT_NAME_MAX_LENGTH } from './objectNames.ts'
import { MAX_TOGGLE_GROUPS, triggerStartsOn } from './toggleGroups.ts'

export function setPlateToggleGroup(level: JumpLevel, index: number, groupId: string | null): JumpLevel {
  const plate = level.triggers?.[index]
  if (!plate || plate.mode === 'coins' || plate.behavior !== 'toggle'
    || groupId !== null && !level.toggleGroups?.some(g => g.id === groupId)) return level
  const next = copyLevel(level), member = next.triggers![index]
  if (member.mode === 'coins') return level
  if (groupId) { member.toggleGroup = groupId; delete member.startsOn }
  else { member.startsOn = triggerStartsOn(level, plate); delete member.toggleGroup }
  return next
}

export function addPlateToggleGroup(level: JumpLevel, index: number): JumpLevel {
  const plate = level.triggers?.[index]
  if (!plate || plate.mode === 'coins' || plate.behavior !== 'toggle' || (level.toggleGroups?.length ?? 0) >= MAX_TOGGLE_GROUPS) return level
  const next = copyLevel(level), groups = next.toggleGroups ??= []
  let number = 1
  while (groups.some(g => g.name === `Toggle group ${number}`)) number++
  const group = { id: newLevelId(), name: `Toggle group ${number}`, startsOn: triggerStartsOn(level, plate) }
  groups.push(group)
  return setPlateToggleGroup(next, index, group.id)
}

export function renameToggleGroup(level: JumpLevel, id: string, value: string): JumpLevel {
  const name = value.trim().slice(0, OBJECT_NAME_MAX_LENGTH)
  if (!name || !level.toggleGroups?.some(g => g.id === id)) return level
  const next = copyLevel(level)
  next.toggleGroups!.find(g => g.id === id)!.name = name
  return next
}

export function deleteToggleGroup(level: JumpLevel, id: string): JumpLevel {
  const group = level.toggleGroups?.find(g => g.id === id)
  if (!group) return level
  const next = copyLevel(level)
  next.toggleGroups = next.toggleGroups!.filter(g => g.id !== id)
  if (!next.toggleGroups.length) delete next.toggleGroups
  for (const plate of next.triggers ?? []) if (plate.mode !== 'coins' && plate.toggleGroup === id) {
    plate.startsOn = !!group.startsOn; delete plate.toggleGroup
  }
  return next
}
