import { levelHeight } from './level'
import type { JumpLevel } from './level'
import { usesRegionLighting } from './environment'
import { setBackground, setLightingLayout } from './environmentEditor'
import { BuilderSelect } from './BuilderSelect'
import { NumberField } from './NumberField'
import { objectLabel } from './objectLabels'

export function EnvironmentFields({ level, onChange, selectedWall, onSelectWall, onCreateWall }: {
  level: JumpLevel; onChange: (level: JumpLevel) => void; selectedWall: number | null
  onSelectWall: (index: number) => void; onCreateWall: () => void
}) {
  const environment = level.environment, regional = usesRegionLighting(level)
  return <div className="builder-environment">
    <BuilderSelect label="Background" value={environment?.kind ?? 'interior'} options={[{ value: 'interior', label: 'Indoor wall' }, { value: 'landscape', label: 'Blue sky' }]}
      onChange={kind => onChange(setBackground(level, kind as 'interior' | 'landscape'))} />
    <BuilderSelect label="Lighting layout" value={regional ? 'regions' : 'uniform'} options={[{ value: 'uniform', label: 'Whole level' }, { value: 'regions', label: 'Day and night regions' }]}
      onChange={layout => onChange(setLightingLayout(level, layout as 'uniform' | 'regions'))} />
    {regional && environment && <>
      <BuilderSelect label="Outside regions" value={environment.baseLighting ?? 'day'} options={[{ value: 'day', label: 'Day' }, { value: 'night', label: 'Night' }]}
        onChange={baseLighting => onChange({ ...level, environment: { ...environment, baseLighting: baseLighting as 'day' | 'night' } })} />
      <p className="builder-hint">Choose day or night for each back wall. Light carries through unobstructed openings. Background choice does not change collision.</p>
    </>}
    <div className="builder-back-wall-heading"><h3>Back walls</h3><span>{environment?.walls.length ?? 0} / 40</span></div>
    {(environment?.walls.length ?? 0) > 1 && <p className="builder-hint">Front to back. Select a wall to edit its shape, light, or layer.</p>}
    {environment?.walls.length ? <div className="builder-back-wall-list" role="group" aria-label="Back walls">
      {[...environment.walls.entries()].reverse().map(([i, wall]) => <button key={i} aria-pressed={selectedWall === i} onClick={() => onSelectWall(i)}>
        <span>{objectLabel(level, { kind: 'back-wall', index: i })}</span><span className={'builder-region-badge builder-region-' + (wall.lighting ?? 'night')}>{wall.lighting ?? 'night'}</span>
      </button>)}
    </div> : <p className="builder-hint">Back walls shape the background and define lit or dark areas. Draw one, then use the regular object and node tools to edit it.</p>}
    <button className="builder-property-action" disabled={(environment?.walls.length ?? 0) >= 40} onClick={onCreateWall}>Draw back wall</button>
    {environment?.kind === 'landscape' && <details className="builder-sky-settings"><summary>Sky</summary>
      <label>Cloud baseline<NumberField label="Cloud baseline" value={environment.horizon} min={0} max={levelHeight(level)} step={20} onPreview={() => {}}
        onCommit={horizon => onChange({ ...level, environment: { ...environment, horizon } })} /></label>
      <p className="builder-hint">Move the cloud layer up or down. The blue sky remains flat.</p>
    </details>}
  </div>
}
