import { TERRAIN_MATERIALS } from './terrainMaterials'
import type { TerrainMaterial } from './terrainMaterials'
import { Button } from '@/components/ui/button'
import { pressedStyle } from './StudioFields'
import { cn } from '@/lib/utils'

export function TerrainMaterialPicker({ label, value = 'stone', onChange }: {
  label: string; value?: TerrainMaterial; onChange: (value: TerrainMaterial) => void
}) {
  return <fieldset className="builder-materials m-0 grid min-w-0 gap-1.5 border-0 p-0">
    <legend className="mb-1.5 p-0 text-xs font-medium">{label}</legend>
    <div className="grid grid-cols-3 gap-1.5">
      {TERRAIN_MATERIALS.map(material => <Button key={material.id} type="button" variant="outline" title={`${material.label} material`} aria-pressed={value === material.id}
        className={cn('h-auto flex-col items-stretch gap-1 p-1 text-xs font-normal', pressedStyle)}
        onClick={() => { if (value !== material.id) onChange(material.id) }}>
        <svg viewBox="0 0 80 40" preserveAspectRatio="xMidYMid slice" aria-hidden="true" className="h-6 w-full rounded-sm">
          <rect width="80" height="40" fill={material.color} />
          {material.marks.map(([x, y, width, height], i) => <rect key={i} x={x} y={y} width={width} height={height} fill={material.ink} />)}
        </svg>
        <span className="truncate">{material.label}</span>
      </Button>)}
    </div>
  </fieldset>
}
