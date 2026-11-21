import type { JumpLevel } from './level'
import { BuilderSelect } from './BuilderSelect'
import { ObjectNameField } from './ObjectNameField'
import { addPlateToggleGroup, deleteToggleGroup, renameToggleGroup, setPlateToggleGroup } from './toggleGroupEditor'
import { MAX_TOGGLE_GROUPS } from './toggleGroups'
import { triggerStartsOn } from './toggleGroups'
import { setPlateBehavior } from './editor'
import { PlusIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, InspectorButton } from './StudioFields'

export function ToggleGroupFields({ level, index, onChange }: { level: JumpLevel; index: number; onChange: (level: JumpLevel) => void }) {
  const plate = level.triggers![index]
  if (plate.mode === 'coins' || plate.behavior !== 'toggle') return null
  const group = level.toggleGroups?.find(g => g.id === plate.toggleGroup)
  const members = group ? level.triggers!.filter(t => t.mode !== 'coins' && t.toggleGroup === group.id).length : 0
  return <div className="builder-toggle-group grid min-w-0 gap-3" role="group" aria-label="Shared toggle">
    <div className="builder-toggle-group-picker grid grid-cols-[minmax(0,1fr)_auto] items-end gap-1.5">
      <BuilderSelect label="Toggle group" value={plate.toggleGroup ?? ''}
        options={[{ value: '', label: 'Independent' }, ...(level.toggleGroups ?? []).map(g => ({ value: g.id, label: g.name }))]}
        onChange={value => onChange(setPlateToggleGroup(level, index, value || null))} />
      <Button variant="outline" size="icon" aria-label="New toggle group" title="Create a new shared toggle group" disabled={(level.toggleGroups?.length ?? 0) >= MAX_TOGGLE_GROUPS}
        onClick={() => onChange(addPlateToggleGroup(level, index))}><PlusIcon aria-hidden="true" /></Button>
    </div>
    <BuilderSelect label={group ? 'Group starts' : 'Starts'} accessibleLabel="Pressure plate initial state" value={triggerStartsOn(level, plate) ? 'on' : 'off'}
      options={[{ value: 'off', label: 'Off' }, { value: 'on', label: 'On' }]}
      onChange={value => onChange(setPlateBehavior(level, index, 'toggle', value === 'on'))} />
    {group && <details className="builder-inspector-subsection group/sub min-w-0"><summary aria-label="Group settings" className="flex min-h-8 cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium [&::-webkit-details-marker]:hidden">
      <span aria-hidden="true" className="w-3">{'+'}</span>Group settings<span className="builder-hint ml-auto" aria-hidden="true">{members} {members === 1 ? 'switch' : 'switches'}</span></summary><div className="grid gap-3 pt-1 pb-2">
      <Field>Group name<ObjectNameField key={group.id} label="Toggle group name" value={group.name} placeholder="Group name"
        title="Name this shared toggle group. Enter applies; Esc cancels."
        onCommit={name => onChange(renameToggleGroup(level, group.id, name))} /></Field>
      <p className="builder-hint">Any member flips the whole group. Group starts applies to every member.</p>
      <InspectorButton variant="destructive" className="builder-delete" title="Make all members independent, keeping the group's starting state" onClick={() => onChange(deleteToggleGroup(level, group.id))}>Delete toggle group</InspectorButton>
    </div></details>}
  </div>
}
