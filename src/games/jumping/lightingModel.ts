import { ambientExposure, nightModeEnabled } from './ambientLight.ts'
export { ambientExposure } from './ambientLight.ts'
import type { Run } from './challenge.ts'
import type { Platform, Player } from './model.ts'
import type { Vec } from './geometry.ts'
import { lineBlocked, nearestBoundary, pointInside, polygonPoints } from './geometry.ts'
import { ballShape, boxShape } from './propGeometry.ts'
import { robotPlatforms } from './robotPhysics.ts'
import { robotHeadlightPose, ROBOT_HEADLIGHT_SPREAD } from './robotHeadlight.ts'
import { levelHeight, triggerTargets } from './level.ts'
import type { JumpLevel } from './level.ts'
import { athleteCasters } from './athleteShadow.ts'
import { goalEase } from './goal.ts'
import { terrainBoundary, terrainShadowsPoint } from './lightingBoundary.ts'
import type { TerrainEdge } from './lightingBoundary.ts'
import { mechanismCornerRadii } from './mechanismAppearance.ts'
import { lightFlicker } from './lightFlicker.ts'
import type { CornerRadii } from './mechanismAppearance.ts'

import type { LevelLight, LightingDefinition } from './lightingDefinition.ts'
export type { LevelLight, LightingDefinition } from './lightingDefinition.ts'
export interface LightSource extends LevelLight { fade: number; robot?: number }
export type CasterGroup = readonly Platform[] & { opacity?: number; player?: true; mechanism?: true; boundary?: readonly TerrainEdge[] }
export type LightingWorld = Run | { level: JumpLevel; player: Player; props: []; mechanisms: []; robots: []; triggers: []; empRemaining: number; exit: null }
export const playgroundLightingWorld = (level: JumpLevel, player: Player): LightingWorld => ({ level, player, props: [], mechanisms: [], robots: [], triggers: [], empRemaining: 0, exit: null })
export const clamp01 = (n: number) => Math.max(0, Math.min(1, n))
const smooth = (n: number) => { const t = clamp01(n); return t * t * (3 - 2 * t) }
// A narrow angular feather near the source, capped in world units farther away.
// Otherwise an unlimited cone can wash a broad gradient across an entire actor.
export const SPOT_EDGE_WIDTH = 2
const edgeFalloff = (fraction: number) => 1 - smooth((fraction - .95) / .05)

/** Constant interior intensity; only the boundary softens, never more than two units. */
export function angularFalloff(light: Pick<LevelLight, 'spread'>, x: number, y: number) {
  const half = light.spread * Math.PI / 360
  const angular = edgeFalloff(Math.abs(Math.atan2(y, x)) / half)
  const inside = x * Math.sin(half) - Math.abs(y) * Math.cos(half)
  return Math.max(angular, smooth(inside / SPOT_EDGE_WIDTH))
}
export function lightContribution(light: LightSource, x: number, y: number) {
  const angle = light.direction * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle)
  const dx = x - light.x, dy = y - light.y
  return angularFalloff(light, dx * c + dy * s, dy * c - dx * s) * light.fade
}
export function combineExposure(ambient: number, contributions: readonly number[]) {
  const a = ambientExposure(ambient)
  return a + (1 - a) * contributions.reduce((max, value) => Math.max(max, clamp01(value)), 0)
}
export function sourceCovered(light: Pick<LevelLight, 'x' | 'y'>, groups: readonly CasterGroup[]) {
  return groups.some(group => (group.opacity ?? 1) === 1 && group.some(shape => pointInside(shape, light.x, light.y)))
}
export function exposureAt(ambient: number, sources: readonly LightSource[], groups: readonly CasterGroup[], x: number, y: number, bounds?: { width: number; height: number }) {
  if (bounds && (x < 0 || y < 0 || x >= bounds.width || y >= bounds.height)) return combineExposure(ambient, [])
  return combineExposure(ambient, sources.map(light => {
    const value = lightContribution(light, x, y)
    if (!value || sourceCovered(light, groups)) return 0
    return groups.reduce((transmission, group) => {
      const blocked = group.boundary ? terrainShadowsPoint(light, group.boundary, x, y)
        : !group.some(shape => pointInside(shape, x, y)) && lineBlocked([light.x, light.y], [x, y], group)
      if (!blocked) return transmission
      return transmission * (1 - (group.opacity ?? 1))
    }, value)
  }))
}

/** Project past every visible receiver. Reach is a rendering bound, not a light range. */
export function shadowQuad(light: Pick<LevelLight, 'x' | 'y'>, a: Vec, b: Vec, reach: number): Vec[] {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const t = clamp01(((light.x - a[0]) * dx + (light.y - a[1]) * dy) / (dx * dx + dy * dy || 1))
  const distance = Math.hypot(a[0] + t * dx - light.x, a[1] + t * dy - light.y)
  const scale = 1 + 2 * reach / Math.max(.001, distance)
  const extend = (p: Vec): Vec => [light.x + (p[0] - light.x) * scale, light.y + (p[1] - light.y) * scale]
  return [a, b, extend(b), extend(a)]
}
/** Conservative bounds retain offscreen blockers between a source and the camera. */
export const betweenLightAndView = (shape: Platform, light: Pick<LevelLight, 'x' | 'y'>, view: { x: number; y: number; w: number; h: number }) =>
  shape.x <= Math.max(light.x, view.x + view.w) && shape.x + shape.w >= Math.min(light.x, view.x)
  && shape.y <= Math.max(light.y, view.y + view.h) && shape.y + shape.h >= Math.min(light.y, view.y)

/** Reject cones facing entirely away from the view; no distance cutoff. */
export function lightReachesView(light: LevelLight, view: { x: number; y: number; w: number; h: number }) {
  const angle = light.direction * Math.PI / 180, half = light.spread * Math.PI / 360
  const c = Math.cos(angle), s = Math.sin(angle), sh = Math.sin(half), ch = Math.cos(half)
  const points = [view.x, view.x + view.w].flatMap(x => [view.y, view.y + view.h].map(y => {
    const dx = x - light.x, dy = y - light.y
    return [dx * c + dy * s, dy * c - dx * s]
  }))
  return [-1, 1].every(side => points.some(([x, y]) => x * sh + side * y * ch >= 0))
}

function touching(a: Platform, b: Platform) {
  if (a.x > b.x + b.w || b.x > a.x + a.w || a.y > b.y + b.h || b.y > a.y + a.h) return false
  const pointsA = polygonPoints(a), pointsB = polygonPoints(b)
  return pointsA.some(([x, y]) => pointInside(b, x, y) || nearestBoundary(b, x, y).distance < .001)
    || pointsB.some(([x, y]) => pointInside(a, x, y) || nearestBoundary(a, x, y).distance < .001)
    || pointsA.some((p, i) => lineBlocked(p, pointsA[(i + 1) % pointsA.length], [b]))
}
/** Connected terrain shares an exposed outline, so tile seams never cast shadows. */
export function groupTerrain(shapes: readonly Platform[]): CasterGroup[] {
  const parents = shapes.map((_, i) => i)
  const root = (i: number): number => parents[i] === i ? i : (parents[i] = root(parents[i]))
  for (let i = 0; i < shapes.length; i++) for (let j = 0; j < i; j++) {
    if (root(i) !== root(j) && touching(shapes[i], shapes[j])) parents[root(i)] = root(j)
  }
  const groups = new Map<number, Platform[]>()
  shapes.forEach((shape, i) => { const key = root(i); if (!groups.has(key)) groups.set(key, []); groups.get(key)!.push(shape) })
  return [...groups.values()].map(group => Object.assign(group, { boundary: terrainBoundary(group) }))
}
export function staticCasters(run: Pick<LightingWorld, 'level'>): CasterGroup[] {
  const { width } = run.level, height = levelHeight(run.level), margin = 1200
  // Finite boundaries replace the collision system's ten-million-unit half spaces.
  return groupTerrain([...run.level.platforms,
    { x: -margin, y: height, w: width + margin * 2, h: margin },
    { x: -margin, y: -margin, w: width + margin * 2, h: margin },
    { x: -margin, y: 0, w: margin, h: height }, { x: width, y: 0, w: margin, h: height }])
}
/** Match the rounded artwork without changing the rectangular collision hulls. */
function roundedCaster(rect: Platform, radius: number | CornerRadii): Platform {
  const corners = polygonPoints(rect), points: Vec[] = []
  for (let i = 0; i < corners.length; i++) {
    const p = corners[i], previous = corners[(i + 3) % 4], next = corners[(i + 1) % 4]
    const before = Math.hypot(previous[0] - p[0], previous[1] - p[1]), after = Math.hypot(next[0] - p[0], next[1] - p[1])
    const r = Math.min(typeof radius === 'number' ? radius : radius[i], before / 2, after / 2)
    if (r === 0) { points.push(p); continue }
    const u = [(previous[0] - p[0]) / before, (previous[1] - p[1]) / before]
    const v = [(next[0] - p[0]) / after, (next[1] - p[1]) / after]
    for (let step = 0; step <= 6; step++) {
      const angle = step * Math.PI / 12
      points.push([p[0] + r * (u[0] * (1 - Math.sin(angle)) + v[0] * (1 - Math.cos(angle))),
        p[1] + r * (u[1] * (1 - Math.sin(angle)) + v[1] * (1 - Math.cos(angle)))])
    }
  }
  return { ...rect, polygon: points.map(([x, y]) => [x - rect.x, y - rect.y]) }
}
export function dynamicCasters(run: LightingWorld, objectShadows = true): CasterGroup[] {
  const corners = mechanismCornerRadii(run)
  const opacity = run.exit ? 1 - goalEase((run.exit.elapsed - .25) / .5) : 1
  return [...(objectShadows ? run.props.map(prop => [prop.kind === 'ball' ? ballShape(prop) : roundedCaster(boxShape(prop), 2)]) : []),
    ...run.mechanisms.map((m, i) => Object.assign([roundedCaster({ x: m.x, y: m.y, w: m.definition.w, h: m.definition.h }, corners[i])], { mechanism: true as const })),
    ...(objectShadows ? run.robots.map(robot => robotPlatforms(robot).map((shape, i) => i === 0 ? roundedCaster(shape, 4) : shape)) : []),
    ...(objectShadows && opacity > 0 ? [Object.assign(athleteCasters(run.player), { player: true as const, opacity })] : [])]
}
export class LightingState {
  private fades = new Map<string, number>()
  private time = 0
  reset() { this.fades.clear(); this.time = 0 }

  sources(definition: LightingDefinition, run: LightingWorld, dt: number): LightSource[] {
    this.time += dt
    const sources: LightSource[] = []
    const lights: (LevelLight & { robot?: number })[] = [...definition.lights]
    const ids = new Set(definition.lights.map(light => light.id))
    if (nightModeEnabled(definition)) for (const [index, robot] of run.robots.entries()) {
      if (!robot.definition.headlight) continue
      let id = `shovebot-headlight:${index}`
      // Authored lamp IDs are unrestricted; keep generated source IDs distinct.
      while (ids.has(id)) id = `_${id}`
      ids.add(id)
      lights.push({ id, ...robotHeadlightPose(robot), robot: index, intensity: 100, spread: ROBOT_HEADLIGHT_SPREAD, power: 'always' })
    }
    for (const id of this.fades.keys()) if (!ids.has(id)) this.fades.delete(id)
    for (const light of lights) {
      const target = Number(run.empRemaining <= 0
        && (light.power === 'always' || run.level.triggers?.some((t, i) => run.triggers[i]?.active && triggerTargets(t).includes(light.id))))
      const previous = this.fades.get(light.id) ?? target
      const fade = previous + Math.max(-dt / .2, Math.min(dt / .2, target - previous))
      this.fades.set(light.id, fade)
      sources.push({ ...light, intensity: 100, fade: fade * (light.flicker ? lightFlicker(light.id, this.time) : 1) })
    }
    return sources
  }
}
