import { useState } from 'react'
import { levelHeight } from './level'
import type { JumpLevel } from './level'
import { parseEnvironment } from './environment'
import { BuilderSelect } from './BuilderSelect'
import { NumberField } from './NumberField'
import { lightingForLevel } from './lightingDefinition'

export function EnvironmentFields({ level, onChange, editingWall, onEditOutline }: {
  level: JumpLevel; onChange: (level: JumpLevel) => void
  editingWall: number | null; onEditOutline: (index: number | null) => void
}) {
  const [error, setError] = useState('')
  const environment = level.environment
  function apply(value: unknown) {
    try {
      onChange({ ...level, version: 2, lighting: structuredClone(lightingForLevel(level)), environment: parseEnvironment(value, level.width, levelHeight(level)) })
      setError('')
    } catch (error) { setError((error as Error).message) }
  }
  return <>
    <BuilderSelect label="Environment" value={environment ? 'landscape' : 'interior'} options={[{ value: 'interior', label: 'Interior' }, { value: 'landscape', label: 'Landscape / caves' }]}
      onChange={kind => {
        if (kind === 'interior') { const next = { ...level }; delete next.environment; onEditOutline(null); onChange(next) }
        else apply({ kind, horizon: Math.round(levelHeight(level) * .55), walls: [] })
      }} />
    {environment && <>
      <label>Horizon Y<NumberField label="Horizon Y" value={environment.horizon} min={0} max={levelHeight(level)} step={20} onPreview={() => {}} onCommit={horizon => apply({ ...environment, horizon })} /></label>
      <p className="builder-hint">Open areas show daylight. Facility and cave back walls enclose only their authored outlines; Night mode lights those enclosed areas.</p>
      {environment.walls.map((wall, i) => <fieldset key={i}><legend>Back wall {i + 1}</legend>
        <BuilderSelect label={`Back wall ${i + 1} type`} value={wall.kind} options={[{ value: 'facility', label: 'Facility' }, { value: 'cave', label: 'Cave' }]}
          onChange={kind => apply({ ...environment, walls: environment.walls.map((w, index) => index === i ? { ...w, kind } : w) })} />
        <button aria-label={editingWall === i ? `Finish editing back wall ${i + 1} outline` : `Edit back wall ${i + 1} outline`} aria-pressed={editingWall === i}
          onClick={() => onEditOutline(editingWall === i ? null : i)}>{editingWall === i ? 'Done editing outline' : 'Edit outline on canvas'}</button>
        <p className="builder-hint">Drag the outline’s points on the canvas. Click a blue edge to add a point. Select a point and press Delete to remove it. Arrow keys nudge; Esc finishes.</p>
        <details><summary>Back wall {i + 1} coordinates</summary>
        <div className="builder-dimensions">{(['x', 'y', 'w', 'h'] as const).map(axis => <label key={axis}>{axis.toUpperCase()}<NumberField label={`Back wall ${i + 1} ${axis}`} value={wall[axis]} min={axis === 'w' || axis === 'h' ? 10 : 0} max={axis === 'x' || axis === 'w' ? level.width : levelHeight(level)} step={20} onPreview={() => {}}
          onCommit={value => apply({ ...environment, walls: environment.walls.map((w, index) => index === i ? { ...w, [axis]: value } : w) })} /></label>)}</div>
        <label>Outline points (optional)<textarea aria-label={`Back wall ${i + 1} outline`} key={JSON.stringify(wall.polygon)} defaultValue={wall.polygon ? JSON.stringify(wall.polygon) : ''} rows={3} onBlur={e => {
          try { const next = { ...wall }; if (e.target.value.trim()) next.polygon = JSON.parse(e.target.value); else delete next.polygon
            apply({ ...environment, walls: environment.walls.map((w, index) => index === i ? next : w) })
          } catch { setError('Use an array of local [x, y] outline points.') }
        }} /></label>
        </details>
        <button onClick={() => { onEditOutline(null); apply({ ...environment, walls: environment.walls.filter((_, index) => index !== i) }) }}>Remove back wall {i + 1}</button>
      </fieldset>)}
      <button disabled={environment.walls.length >= 40} onClick={() => apply({ ...environment, walls: [...environment.walls, { kind: 'cave', x: 0, y: Math.round(levelHeight(level) / 2), w: level.width, h: Math.floor(levelHeight(level) / 2) }] })}>Add back wall</button>
      <label>Ground cover spans<textarea aria-label="Ground cover spans" key={JSON.stringify(environment.groundCover)} defaultValue={JSON.stringify(environment.groundCover ?? [])} rows={3} onBlur={e => {
        try { apply({ ...environment, groundCover: JSON.parse(e.target.value) }) } catch { setError('Use an array of { x, y, w } ground cover spans.') }
      }} /></label>
    </>}
    {error && <p role="alert">{error}</p>}
  </>
}
