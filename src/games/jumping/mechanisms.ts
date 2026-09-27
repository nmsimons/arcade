import type { Mechanism } from './level.ts'

export const MECHANISM_THICKNESS = 20
export const isHorizontalGate = (m: Mechanism) => m.kind === 'gate' && m.orientation === 'horizontal'
export const mechanismTravel = (m: Mechanism) => m.kind === 'gate' ? isHorizontalGate(m) ? m.w : m.h : m.travel
export const mechanismLabel = (m: Mechanism) => m.kind === 'lift' ? m.orientation === 'horizontal' ? 'Moving platform' : 'Elevator' : isHorizontalGate(m) ? 'Horizontal gate' : 'Gate'

/** Preserve gate centers and elevator standing surfaces when loading older sizes. */
export function prepareMechanism(m: Mechanism, floor: number): Mechanism {
  if (m.kind === 'gate') return isHorizontalGate(m)
    ? { ...m, y: Math.min(m.y + (m.h - MECHANISM_THICKNESS) / 2, floor - MECHANISM_THICKNESS), h: MECHANISM_THICKNESS, travel: m.w }
    : { ...m, x: m.x + (m.w - MECHANISM_THICKNESS) / 2, w: MECHANISM_THICKNESS, travel: m.h }
  return m.h !== MECHANISM_THICKNESS
    ? { ...m, y: Math.min(m.y, floor - MECHANISM_THICKNESS), h: MECHANISM_THICKNESS } : m
}

export const mechanismOpenPosition = (m: Mechanism) => m.orientation === 'horizontal'
  ? { x: m.x + (m.flipX ? 1 : -1) * mechanismTravel(m), y: m.y }
  : { x: m.x, y: m.y - mechanismTravel(m) }

export const mechanismRopeEnd = (m: Mechanism, position: { x: number; y: number } = m) => isHorizontalGate(m)
  ? { x: position.x + (m.flipX ? m.w : 0), y: position.y + m.h / 2 }
  : { x: position.x + m.w / 2, y: position.y }

export const mechanismAnchor = (m: Mechanism) => mechanismRopeEnd(m, mechanismOpenPosition(m))

export const mechanismShape = (m: { definition: Mechanism; x: number; y: number }) => ({ ...m.definition, x: m.x, y: m.y })

export function mechanismSweep(m: Mechanism) {
  const open = mechanismOpenPosition(m)
  return { x: Math.min(m.x, open.x), y: Math.min(m.y, open.y), w: m.w + Math.abs(open.x - m.x), h: m.h + Math.abs(open.y - m.y) }
}
