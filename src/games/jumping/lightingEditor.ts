import { nightModeEnabled } from './ambientLight.ts'
import { copyLevel } from './level.ts'
import type { JumpLevel } from './level.ts'
import type { LevelLight } from './lightingDefinition.ts'
import { nearestBoundary, pointInside } from './geometry.ts'

export function setLevelNightMode(level: JumpLevel, enabled: boolean): JumpLevel {
  if (nightModeEnabled(level.lighting) === enabled) return level
  const next = copyLevel(level)
  next.version = 2; next.lighting ??= { ambient: 100, lights: [] }
  next.lighting.nightMode = enabled
  return next
}
export function setLevelAmbient(level: JumpLevel, value: number): JumpLevel {
  if (!Number.isFinite(value)) return level
  const ambient = Math.max(0, Math.min(100, Math.round(value)))
  if (ambient === (level.lighting?.ambient ?? 100)) return level
  const next = copyLevel(level)
  next.version = 2; next.lighting ??= { nightMode: false, ambient: 100, lights: [] }; next.lighting.nightMode = nightModeEnabled(level.lighting); next.lighting.ambient = ambient
  return next
}
export function editLight(level: JumpLevel, index: number, patch: Partial<Pick<LevelLight, 'direction' | 'spread' | 'power' | 'mount'>>): JumpLevel {
  if (!level.lighting?.lights[index]) return level
  const next = copyLevel(level), light = next.lighting!.lights[index]
  for (const field of ['direction', 'spread'] as const) {
    const value = patch[field]
    if (value === undefined || !Number.isFinite(value)) continue
    const [min, max] = field === 'direction' ? [-180, 180] : [20, 160]
    light[field] = Math.max(min, Math.min(max, value))
  }
  if (patch.power === 'always' || patch.power === 'switched') {
    light.power = patch.power
    if (light.power === 'always') for (const trigger of next.triggers ?? []) {
      if (trigger.targets) trigger.targets = trigger.targets.filter(id => id !== light.id)
      else if (trigger.target === light.id) trigger.target = ''
    }
  }
  if ('mount' in patch) {
    const host = next.mechanisms?.find(m => m.id === patch.mount)
    if (host) {
      light.mount = host.id
      if (pointInside(host, light.x, light.y) || nearestBoundary(host, light.x, light.y).distance > 20) {
        light.x = host.x + host.w / 2; light.y = host.y - 10
      }
    } else delete light.mount
  }
  return next
}

export function lightHandles(light: LevelLight, zoom: number) {
  const radius = 60 / zoom, direction = light.direction * Math.PI / 180, half = light.spread * Math.PI / 360
  return [0, -1, 1].map(side => ({ kind: side === 0 ? 'aim' as const : 'spread' as const, side,
    x: light.x + Math.cos(direction + side * half) * radius,
    y: light.y + Math.sin(direction + side * half) * radius }))
}
