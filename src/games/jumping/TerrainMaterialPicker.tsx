import { TERRAIN_MATERIALS } from './terrainMaterials'
import type { TerrainMaterial } from './terrainMaterials'

export function TerrainMaterialPicker({ label, value = 'stone', onChange }: {
  label: string; value?: TerrainMaterial; onChange: (value: TerrainMaterial) => void
}) {
  return <fieldset className="builder-materials">
    <legend>{label}</legend>
    <div>
      {TERRAIN_MATERIALS.map(material => <button key={material.id} type="button" aria-pressed={value === material.id}
        onClick={() => { if (value !== material.id) onChange(material.id) }}>
        <svg viewBox="0 0 80 40" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <rect width="80" height="40" fill={material.color} />
          {material.marks.map(([x, y, width, height], i) => <rect key={i} x={x} y={y} width={width} height={height} fill={material.ink} />)}
        </svg>
        <span>{material.label}</span>
      </button>)}
    </div>
  </fieldset>
}
