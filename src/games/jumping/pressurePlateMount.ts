import type { JumpLevel, Trigger } from './level.ts'

export interface PressurePlateMount { mechanism: string; x: number }

/** Mounted plates stay on their host's top throughout its actual travel. */
export function pressurePlatePosition(plate: Trigger, mechanisms: readonly { definition: { id: string }; x: number; y: number }[]) {
  const host = plate.mode !== 'coins' && plate.mount ? mechanisms.find(m => m.definition.id === plate.mount!.mechanism) : undefined
  return host && plate.mode !== 'coins' && plate.mount ? { x: host.x + plate.mount.x, y: host.y } : { x: plate.x, y: plate.y }
}

/** Editor copies keep absolute authored positions and local mount offsets in sync. */
export function syncPressurePlateMounts(level: JumpLevel) {
  for (const plate of level.triggers ?? []) {
    if (plate.mode === 'coins' || !plate.mount) continue
    const host = level.mechanisms?.find(m => m.id === plate.mount!.mechanism && m.kind === 'lift')
    if (!host || host.w < plate.w) { delete plate.mount; continue }
    plate.mount.x = Math.max(0, Math.min(host.w - plate.w, plate.mount.x))
    plate.x = host.x + plate.mount.x; plate.y = host.y
  }
}

/** Placing or sliding a plate onto a lift attaches it; moving away detaches it. */
export function attachPressurePlateOnSurface(level: JumpLevel, plate: Trigger) {
  if (plate.mode === 'coins') return
  const host = level.mechanisms?.find(m => m.kind === 'lift' && Math.abs(m.y - plate.y) < .15
    && plate.x >= m.x - .01 && plate.x + plate.w <= m.x + m.w + .01)
  if (host) {
    plate.mount = { mechanism: host.id, x: Math.max(0, Math.min(host.w - plate.w, plate.x - host.x)) }
    plate.x = host.x + plate.mount.x; plate.y = host.y
  } else delete plate.mount
}
