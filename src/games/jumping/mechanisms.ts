import type { Mechanism } from './level.ts'

export const MECHANISM_THICKNESS = 20

/** Preserve gate centers and elevator standing surfaces when loading older sizes. */
export function prepareMechanism(m: Mechanism, floor: number): Mechanism {
  if (m.kind === 'gate') return m.w !== MECHANISM_THICKNESS
    ? { ...m, x: m.x + (m.w - MECHANISM_THICKNESS) / 2, w: MECHANISM_THICKNESS } : m
  return m.h !== MECHANISM_THICKNESS
    ? { ...m, y: Math.min(m.y, floor - MECHANISM_THICKNESS), h: MECHANISM_THICKNESS } : m
}

export const mechanismAnchor = (m: Mechanism) => ({ x: m.x + m.w / 2, y: m.y - m.travel })
