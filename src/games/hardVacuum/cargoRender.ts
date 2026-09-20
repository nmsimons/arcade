import { CACHES } from './expedition.ts'
import { drawExpeditionObject } from './objectModels.ts'
import type { Vector2 } from './types'

const MEDICAL_CARGO = new Set(['manifest-cache','triage-cache','ward-cache','medical-cache'])

/** Cargo keeps its model, color and tumble phase when Haven takes custody. */
export function drawCargo(ctx: CanvasRenderingContext2D, id: string, pos: Vector2, options: {time: number; active?: boolean; scale?: number; laserGlow?: number}) {
  const kind = id === 'impact' || id === 'radiation' || id === 'blaster' || id === 'teleporter' || id === 'core' ? id : 'cache'
  drawExpeditionObject(ctx,kind,pos,{
    ...options,
    variant: Math.max(0,CACHES.findIndex(cache=>cache.id===id)),
    medical: MEDICAL_CARGO.has(id),
  })
}
