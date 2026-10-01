import { nightModeEnabled } from './ambientLight.ts'
import { copyLevel } from './level.ts'
import type { JumpLevel } from './level.ts'
import type { LevelLight } from './lightingDefinition.ts'

export function setLevelNightMode(level: JumpLevel, enabled: boolean): JumpLevel {
  if (nightModeEnabled(level.lighting) === enabled) return level
  const next = copyLevel(level)
  next.version = 2; next.lighting ??= { ambient: 0, lights: [] }
  next.lighting.nightMode = enabled
  next.lighting.ambient = 0
  return next
}
export function editLight(level: JumpLevel, index: number, patch: Partial<Pick<LevelLight, 'direction' | 'spread' | 'power' | 'flicker'>>): JumpLevel {
  if (!level.lighting?.lights[index]) return level
  const next = copyLevel(level), light = next.lighting!.lights[index]
  for (const field of ['direction', 'spread'] as const) {
    const value = patch[field]
    if (value === undefined || !Number.isFinite(value)) continue
    const [min, max] = field === 'direction' ? [-180, 180] : [20, 160]
    light[field] = Math.max(min, Math.min(max, Math.round(value)))
  }
  if (patch.power === 'always' || patch.power === 'switched') {
    light.power = patch.power
    if (light.power === 'always') for (const trigger of next.triggers ?? []) {
      if (trigger.targets) trigger.targets = trigger.targets.filter(id => id !== light.id)
      else if (trigger.target === light.id) trigger.target = ''
    }
  }
  if (patch.flicker === true) light.flicker = true
  else if (patch.flicker === false) delete light.flicker
  return next
}

export function lightHandles(light: LevelLight, zoom: number) {
  const radius = 60 / zoom, direction = light.direction * Math.PI / 180, half = light.spread * Math.PI / 360
  return [0, -1, 1].map(side => ({ kind: side === 0 ? 'aim' as const : 'spread' as const, side,
    x: light.x + Math.cos(direction + side * half) * radius,
    y: light.y + Math.sin(direction + side * half) * radius }))
}
