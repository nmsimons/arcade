import { nightModeEnabled } from './ambientLight.ts'
import type { JumpLevel } from './level.ts'
import type { NamedObject } from './objectNames.ts'
import { parseObjectName } from './objectNames.ts'
import { objectReference } from './objectLabels.ts'
import { polygonPoints } from './geometry.ts'
import { parseSwitchSettings, switchWiringProblems } from './switchPower.ts'
import type { SwitchSettings } from './switchPower.ts'

export interface LevelLight extends NamedObject, SwitchSettings {
  id: string; x: number; y: number; intensity: number
  direction: number; spread: number; power: 'always' | 'switched'
  flicker?: boolean
}
export interface LightingDefinition { nightMode?: boolean; ambient: number; lights: LevelLight[] }
export const MAX_LIGHTS = 16, LIGHT_RADIUS = 10
export const levelLightCount = (level: JumpLevel) => (level.lighting?.lights.length ?? 0) + (level.robots?.filter(robot => robot.headlight).length ?? 0)
export const lightBounds = (light: Pick<LevelLight, 'x' | 'y'>) => ({ x: light.x - LIGHT_RADIUS, y: light.y - LIGHT_RADIUS, w: LIGHT_RADIUS * 2, h: LIGHT_RADIUS * 2 })
export function lightingProblems(level: JumpLevel): string[] {
  const issues: string[] = switchWiringProblems(level)
  if (level.goal?.power === 'switched' && !level.goal.id) issues.push(`Give ${objectReference(level, 'goal')} an ID for its switch connections.`)
  if (level.goal?.id && [...level.mechanisms ?? [], ...level.lighting?.lights ?? [], ...level.wallLights ?? []].some(item => item.id === level.goal!.id)) {
    issues.push(`${objectReference(level, 'goal')} must have a unique ID.`)
  }
  const ids = new Map<string, string>()
  for (const kind of ['mechanism', 'light', 'wall-light'] as const) {
    for (const [i, item] of (kind === 'light' ? level.lighting?.lights ?? [] : kind === 'wall-light' ? level.wallLights ?? [] : level.mechanisms ?? []).entries()) {
      const label = objectReference(level, kind, i), existing = ids.get(item.id)
      if (existing) issues.push(`${existing} and ${label} must have unique IDs.`)
      else ids.set(item.id, label)
    }
  }
  const lighting = level.lighting
  if (!lighting) return level.version === 2 ? [...issues, 'Version 2 levels need lighting settings.'] : issues
  const height = level.floor ?? level.height ?? 1020
  if (lighting.lights.length > MAX_LIGHTS) issues.push('Use at most 16 lights per level.')
  for (const [i, light] of lighting.lights.entries()) {
    const name = objectReference(level, 'light', i), b = lightBounds(light)
    if (b.x < 0 || b.y < 0 || b.x + b.w > level.width || b.y + b.h > height) issues.push(`Keep ${name} inside the level.`)
  }
  const lightCount = levelLightCount(level)
  if (nightModeEnabled(lighting) && lightCount) {
    // Conservative whole-room bounds: unlimited lights can reach distant geometry.
    const edges = level.platforms.reduce((sum, p) => sum + polygonPoints(p).length, 16)
    if (edges > 4096 || edges * lightCount > 32768) issues.push('This lighting setup is too complex. Simplify terrain or use fewer lights (4,096 edges per light; 32,768 total).')
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
    if (l.flicker !== undefined && typeof l.flicker !== 'boolean') return fail()
    const name = parseObjectName(l.name, fail)
    // Accept older files, but authored spotlights always use full intensity.
    if (l.intensity !== undefined) number(l.intensity, 1, 100, true)
    // Retired mechanism mounts are ignored; saved world coordinates remain fixed.
    return { id: id(l.id), x: number(l.x, 0, 20000), y: number(l.y, 0, 6000),
      intensity: 100, direction: number(l.direction, -180, 180), spread: number(l.spread, 20, 160),
      power: l.power, ...parseSwitchSettings(l, fail), ...(l.flicker ? { flicker: true } : {}), ...name }
  })
  const ambient = number(v.ambient, 0, 100, true)
  if (v.nightMode !== undefined && typeof v.nightMode !== 'boolean') return fail()
  // Infer older day/night files before normalizing the retired ambient setting.
  return { nightMode: v.nightMode === undefined ? ambient < 100 : v.nightMode, ambient: 0, lights }
}
