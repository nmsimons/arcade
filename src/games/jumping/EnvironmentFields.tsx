import { copyLevel, levelHeight } from './level'
import { WALL_FINISHES } from './wallFinish'
import type { WallFinish } from './wallFinish'
import { STAIN_LEVELS } from './wallWear'
import type { StainSetting } from './wallWear'
import type { JumpLevel } from './level'
import { usesRegionLighting } from './environment'
import { setBackground, setLightingLayout } from './environmentEditor'
import { BuilderSelect } from './BuilderSelect'
import { NumberField } from './NumberField'
import { objectLabel } from './objectLabels'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, InspectorButton, pressedStyle } from './StudioFields'
import { cn } from '@/lib/utils'

export function EnvironmentFields({ level, onChange, selectedWall, onSelectWall, onCreateWall }: {
  level: JumpLevel; onChange: (level: JumpLevel) => void; selectedWall: number | null
  onSelectWall: (index: number) => void; onCreateWall: () => void
}) {
  const environment = level.environment, regional = usesRegionLighting(level)
  return <div className="builder-environment grid gap-3">
    <BuilderSelect label="Background" value={environment?.kind ?? 'interior'} options={[{ value: 'interior', label: 'Indoor wall' }, { value: 'landscape', label: 'Blue sky' }]}
      onChange={kind => onChange(setBackground(level, kind as 'interior' | 'landscape'))} />
    {/* The indoor wall's finish. Building walls against the sky are painted instead (paintedWall.ts). */}
    <BuilderSelect label="Wall finish" value={level.wallFinish ?? 'course'} options={WALL_FINISHES.map(finish => ({ value: finish.id, label: finish.label }))}
      onChange={finish => {
        // The ordinary course wall is saved by leaving the field out.
        const next = copyLevel(level)
        if (finish === 'course') delete next.wallFinish
        else next.wallFinish = finish as Exclude<WallFinish, 'course'>
        onChange(next)
      }} />
    {/* How much water has stained the room: the wall panels and the rust from pipe joints. */}
    <BuilderSelect label="Stains" value={level.stains ?? 'heavy'} options={STAIN_LEVELS.map(stains => ({ value: stains.id, label: stains.label }))}
      onChange={stains => {
        // Heavy is saved by leaving the field out.
        const next = copyLevel(level)
        if (stains === 'heavy') delete next.stains
        else next.stains = stains as StainSetting
        onChange(next)
      }} />
    <BuilderSelect label="Lighting layout" value={regional ? 'regions' : 'uniform'} options={[{ value: 'uniform', label: 'Whole level' }, { value: 'regions', label: 'Day and night regions' }]}
      onChange={layout => onChange(setLightingLayout(level, layout as 'uniform' | 'regions'))} />
    {regional && environment && <>
      <BuilderSelect label="Outside regions" value={environment.baseLighting ?? 'day'} options={[{ value: 'day', label: 'Day' }, { value: 'night', label: 'Night' }]}
        onChange={baseLighting => onChange({ ...level, environment: { ...environment, baseLighting: baseLighting as 'day' | 'night' } })} />
      <p className="builder-hint">Choose day or night for each back wall. Light carries through unobstructed openings. Background choice does not change collision.</p>
    </>}
    <div className="builder-back-wall-heading flex items-center justify-between gap-2"><h3 className="m-0 text-sm font-semibold">Back walls</h3><Badge variant="secondary" className="tabular-nums">{environment?.walls.length ?? 0} / 40</Badge></div>
    {(environment?.walls.length ?? 0) > 1 && <p className="builder-hint">Front to back. Select a wall to edit its shape, light, or layer.</p>}
    {environment?.walls.length ? <div className="builder-back-wall-list grid max-h-60 gap-1 overflow-auto" role="group" aria-label="Back walls">
      {[...environment.walls.entries()].reverse().map(([i, wall]) => <Button key={i} variant="outline" size="sm" aria-pressed={selectedWall === i} onClick={() => onSelectWall(i)}
        className={cn('h-auto min-h-8 w-full justify-between py-1 text-left whitespace-normal', pressedStyle)}>
        <span className="min-w-0 [overflow-wrap:anywhere]">{objectLabel(level, { kind: 'back-wall', index: i })}</span>
        <Badge variant={(wall.lighting ?? 'night') === 'night' ? 'default' : 'outline'} className={'builder-region-badge capitalize builder-region-' + (wall.lighting ?? 'night')}>{wall.lighting ?? 'night'}</Badge>
      </Button>)}
    </div> : <p className="builder-hint">Back walls shape the background and define lit or dark areas. Draw one, then use the regular object and node tools to edit it.</p>}
    <InspectorButton disabled={(environment?.walls.length ?? 0) >= 40} onClick={onCreateWall}>Draw back wall</InspectorButton>
    {environment?.kind === 'landscape' && <details className="builder-sky-settings grid gap-2.5"><summary className="cursor-pointer text-sm font-semibold">Sky</summary>
      <Field>Cloud baseline<NumberField label="Cloud baseline" value={environment.horizon} min={0} max={levelHeight(level)} step={20} onPreview={() => {}}
        onCommit={horizon => onChange({ ...level, environment: { ...environment, horizon } })} /></Field>
      <p className="builder-hint">Move the cloud layer up or down. The blue sky remains flat.</p>
    </details>}
  </div>
}
