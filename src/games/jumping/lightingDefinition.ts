import { nightModeEnabled } from './ambientLight.ts'
import type { JumpLevel } from './level.ts'
import type { NamedObject } from './objectNames.ts'
import { OBJECT_NAME_MAX_LENGTH } from './objectNames.ts'
import { nearestBoundary, pointInside, polygonPoints } from './geometry.ts'
import { mechanismOpenPosition } from './mechanisms.ts'

export interface LevelLight extends NamedObject {
  id: string; x: number; y: number; intensity: number
  direction: number; spread: number; power: 'always' | 'switched'; mount?: string
}
export interface LightingDefinition { nightMode?: boolean; ambient: number; lights: LevelLight[] }
export const MAX_LIGHTS = 16, MAX_MOUNTED_LIGHTS = 4, LIGHT_RADIUS = 10
export const lightBounds = (light: Pick<LevelLight, 'x' | 'y'>) => ({ x: light.x - LIGHT_RADIUS, y: light.y - LIGHT_RADIUS, w: LIGHT_RADIUS * 2, h: LIGHT_RADIUS * 2 })
export function lightTravelBounds(level: JumpLevel, light: LevelLight) {
  const b = lightBounds(light), host = level.mechanisms?.find(m => m.id === light.mount)
  if (!host) return b
  const open = mechanismOpenPosition(host), dx = open.x - host.x, dy = open.y - host.y
  return { x: b.x + Math.min(0, dx), y: b.y + Math.min(0, dy), w: b.w + Math.abs(dx), h: b.h + Math.abs(dy) }
}
export function lightingProblems(level: JumpLevel): string[] {
  const lighting = level.lighting
  if (!lighting) return level.version === 2 ? ['Version 2 levels need lighting settings.'] : []
  const issues: string[] = [], height = level.floor ?? level.height ?? 1020
  const ids = [...(level.mechanisms ?? []).map(m => m.id), ...lighting.lights.map(l => l.id)]
  if (new Set(ids).size !== ids.length) issues.push('Lights and mechanisms must have unique IDs.')
  if (lighting.lights.length > MAX_LIGHTS) issues.push('Use at most 16 lights per level.')
  if (lighting.lights.filter(l => l.mount).length > MAX_MOUNTED_LIGHTS) issues.push('Use at most 4 mounted lights per level.')
  for (const light of lighting.lights) {
    const name = light.name || light.id, b = lightTravelBounds(level, light)
    if (b.x < 0 || b.y < 0 || b.x + b.w > level.width || b.y + b.h > height) issues.push(`Keep light “${name}” and its travel inside the level.`)
    if (light.mount) {
      const host = level.mechanisms?.find(m => m.id === light.mount)
      if (!host) issues.push(`Connect light “${name}” to an existing mechanism or detach it.`)
      else if (pointInside(host, light.x, light.y) || nearestBoundary(host, light.x, light.y).distance > 20.001) issues.push(`Place light “${name}” outside and within one tile of its mount.`)
    }
    if (light.power === 'switched' && !level.triggers?.some(t => (t.targets ?? [t.target]).includes(light.id))) issues.push(`Connect switched light “${name}” to a pressure plate or coin switch.`)
  }
  if (level.triggers?.some(t => {
    const targets = t.targets ?? (t.target ? [t.target] : [])
    return !targets.length || targets.some(id => !level.mechanisms?.some(m => m.id === id)
      && !lighting.lights.some(l => l.id === id && l.power === 'switched'))
  })) issues.push('Connect each switch to existing mechanisms or switched lights.')
  if (nightModeEnabled(lighting) && lighting.lights.length) {
    // Conservative whole-room bounds: unlimited lights can reach distant geometry.
    const edges = level.platforms.reduce((sum, p) => sum + polygonPoints(p).length, 16)
    if (edges > 4096 || edges * lighting.lights.length > 32768) issues.push('This lighting setup is too complex. Simplify terrain or use fewer lights (4,096 edges per light; 32,768 total).')
  }
  return issues
}

/** Bounded reconstruction; shared levels never supply drawing commands or resources. */
export function parseLighting(value: unknown): LightingDefinition {
  const fail = (): never => { throw new Error('Invalid lighting settings. Check ambient, spotlight properties and light limits.') }
  const object = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : fail()
  const number = (v: unknown, min: number, max: number, integer = false): number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max && (!integer || Number.isInteger(v)) ? v : fail()
  const id = (v: unknown): string => typeof v === 'string' && v.trim().length > 0 && v.length <= 100 ? v : fail()
  const v = object(value)
  if (!Array.isArray(v.lights) || v.lights.length > MAX_LIGHTS) return fail()
  const lights = v.lights.map((item): LevelLight => {
    const l = object(item)
    if (l.power !== 'always' && l.power !== 'switched') return fail()
    if (l.name !== undefined && (typeof l.name !== 'string' || l.name.length > OBJECT_NAME_MAX_LENGTH)) return fail()
    // Accept older files, but authored spotlights always use full intensity.
    if (l.intensity !== undefined) number(l.intensity, 1, 100, true)
    return { id: id(l.id), x: number(l.x, 0, 20000), y: number(l.y, 0, 6000),
      intensity: 100, direction: number(l.direction, -180, 180), spread: number(l.spread, 20, 160),
      power: l.power, ...(l.name ? { name: (l.name as string).trim() } : {}), ...(l.mount === undefined ? {} : { mount: id(l.mount) }) }
  })
  const ambient = number(v.ambient, 0, 100, true)
  if (v.nightMode !== undefined && typeof v.nightMode !== 'boolean') return fail()
  return { nightMode: v.nightMode === undefined ? ambient < 100 : v.nightMode, ambient, lights }
}
