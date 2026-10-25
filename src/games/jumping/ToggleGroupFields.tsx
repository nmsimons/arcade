import type { JumpLevel } from './level'
import { BuilderSelect } from './BuilderSelect'
import { ObjectNameField } from './ObjectNameField'
import { addPlateToggleGroup, deleteToggleGroup, renameToggleGroup, setPlateToggleGroup } from './toggleGroupEditor'
import { MAX_TOGGLE_GROUPS } from './toggleGroups'
import { triggerStartsOn } from './toggleGroups'
import { setPlateBehavior } from './editor'

export function ToggleGroupFields({ level, index, onChange }: { level: JumpLevel; index: number; onChange: (level: JumpLevel) => void }) {
  const plate = level.triggers![index]
  if (plate.mode === 'coins' || plate.behavior !== 'toggle') return null
  const group = level.toggleGroups?.find(g => g.id === plate.toggleGroup)
  const members = group ? level.triggers!.filter(t => t.mode !== 'coins' && t.toggleGroup === group.id).length : 0
  return <div className="builder-toggle-group" role="group" aria-label="Shared toggle">
    <div className="builder-toggle-group-picker">
      <BuilderSelect label="Toggle group" value={plate.toggleGroup ?? ''}
        options={[{ value: '', label: 'Independent' }, ...(level.toggleGroups ?? []).map(g => ({ value: g.id, label: g.name }))]}
        onChange={value => onChange(setPlateToggleGroup(level, index, value || null))} />
      <button aria-label="New toggle group" title="Create a new shared toggle group" disabled={(level.toggleGroups?.length ?? 0) >= MAX_TOGGLE_GROUPS}
        onClick={() => onChange(addPlateToggleGroup(level, index))}><svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 4v12M4 10h12" /></svg></button>
    </div>
    <BuilderSelect label={group ? 'Group starts' : 'Starts'} accessibleLabel="Pressure plate initial state" value={triggerStartsOn(level, plate) ? 'on' : 'off'}
      options={[{ value: 'off', label: 'Off' }, { value: 'on', label: 'On' }]}
      onChange={value => onChange(setPlateBehavior(level, index, 'toggle', value === 'on'))} />
    {group && <details className="builder-inspector-subsection"><summary aria-label="Group settings">Group settings<span className="builder-hint" aria-hidden="true">{members} {members === 1 ? 'switch' : 'switches'}</span></summary><div>
      <label>Group name<ObjectNameField key={group.id} label="Toggle group name" value={group.name} placeholder="Group name"
        title="Name this shared toggle group. Enter applies; Esc cancels."
        onCommit={name => onChange(renameToggleGroup(level, group.id, name))} /></label>
      <p className="builder-hint">Any member flips the whole group. Group starts applies to every member.</p>
      <button className="builder-delete" title="Make all members independent, keeping the group's starting state" onClick={() => onChange(deleteToggleGroup(level, group.id))}>Delete toggle group</button>
    </div></details>}
  </div>
}
