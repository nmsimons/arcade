import { profileStart, profileEnd } from './profiling.ts'
import type { Vector2 } from './types'
import { raycastCavern } from './worldGeometry.ts'
import type { CavernMap } from './worldGeometry'
import { TRANSFER_RADIATION_SOURCES } from './transferRadiation.ts'
import { SHIELD_REPAIR_TIME } from './tuning.ts'

export const RADIATION_CAPACITY = 100
export const RADIATION_DRAIN = 12.5
// Preserve Haven's full-refill time, now also available anywhere without exposure.
export const RADIATION_RECHARGE_TIME = SHIELD_REPAIR_TIME
export const RADIATION_HULL_LIMIT = 2
export interface RadiationSource { id: string; name: string; pos: Vector2; bodyRadius: number; coreRange: number; range: number; strength?: number }
export const RADIATION_SOURCES: readonly RadiationSource[] = [
  { id: 'reactor-breach', name: 'BREACHED REACTOR', pos: { x: 2630, y: 1130 }, bodyRadius: 30, coreRange: 90, range: 280 },
  { id: 'fuel-unit', name: 'DAMAGED FUEL UNIT', pos: { x: 2550, y: 1510 }, bodyRadius: 26, coreRange: 70, range: 210 },
  { id: 'field-containment', name: 'FRACTURED FIELD CASING', pos: { x: 5470, y: 3370 }, bodyRadius: 30, coreRange: 70, range: 240 },
  { id: 'ignition-feed', name: 'EXPOSED IGNITION FEED', pos: { x: 5060, y: 4310 }, bodyRadius: 26, coreRange: 75, range: 240 },
  ...TRANSFER_RADIATION_SOURCES,
]
export const RADIATION_HOUSINGS = RADIATION_SOURCES.map(source => Array.from({ length: 8 }, (_, i) => {
  const angle = i * Math.PI / 4
  return { x: source.pos.x + Math.cos(angle) * source.bodyRadius, y: source.pos.y + Math.sin(angle) * source.bodyRadius }
}))

export function radiationReach(source: RadiationSource, angle: number, map?: CavernMap): number {
  if (!map) return source.range
  const direction = { x: Math.cos(angle), y: Math.sin(angle) }
  // Emission begins at the casing, so its own physical housing casts no shadow.
  const start = source.bodyRadius + 1
  const origin = { x: source.pos.x + direction.x * start, y: source.pos.y + direction.y * start }
  return start + raycastCavern(origin, direction, source.range - start, map)
}

export function radiationAt(pos: Vector2, map?: CavernMap) {
  const profileTime = profileStart()
  try {
    let intensity = 0, strongest = 0
    let source: RadiationSource | undefined
    for (const emitter of RADIATION_SOURCES) {
      if (map?.containedRadiation?.includes(emitter.id)) continue
      const dx = pos.x - emitter.pos.x, dy = pos.y - emitter.pos.y
      const distance = Math.hypot(dx, dy)
      if (distance >= emitter.range || distance > radiationReach(emitter, Math.atan2(dy, dx), map) + 0.01) continue
      const falloff = Math.max(0, (distance - emitter.coreRange) / (emitter.range - emitter.coreRange))
      const strength = (1 - falloff * falloff * (3 - 2 * falloff)) * (emitter.strength ?? 1)
      intensity += strength
      if (strength > strongest) { strongest = strength; source = emitter }
    }
    return { intensity: Math.min(1, intensity), source }
  } finally { profileEnd('radiation-dose', profileTime) }
}
export const inRadiation = (pos: Vector2, map?: CavernMap) => radiationAt(pos, map).intensity > 0

const footprintCache = new WeakMap<CavernMap, Map<string, Vector2[]>>()
const localFootprintCache = new WeakMap<readonly Vector2[], Map<string, { signature: string; points: Vector2[] }>>()
/** Maps are immutable geometry snapshots. A distant moving door cannot affect
 * these rays; retain the last local footprint across fresh map identities. */
function footprintSignature(source: RadiationSource, map: CavernMap, sourceKey: string) {
  const reach=source.range+1,left=source.pos.x-reach,right=source.pos.x+reach,top=source.pos.y-reach,bottom=source.pos.y+reach
  let signature=sourceKey
  for(const polygon of map.obstacles) {
    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity
    for(const p of polygon){minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y)}
    // AABB overlap is conservative, including long edges with no nearby vertex.
    if(maxX<left||minX>right||maxY<top||minY>bottom)continue
    signature+='|'+polygon.map(p=>`${p.x},${p.y}`).join(';')
  }
  return signature
}
/** Use the same wall raycasts for the visible footprint and the actual dose. */
export function radiationFootprint(source: RadiationSource, map: CavernMap): Vector2[] {
  const profileTime = profileStart()
  try {
    let cached = footprintCache.get(map)
    if (!cached) { cached = new Map(); footprintCache.set(map, cached) }
    const sourceKey=`${source.id}:${source.pos.x},${source.pos.y},${source.bodyRadius},${source.range}`
    const existing = cached.get(sourceKey)
    if (existing) return existing
    let local=localFootprintCache.get(map.boundary)
    if(!local){local=new Map();localFootprintCache.set(map.boundary,local)}
    const signature=footprintSignature(source,map,sourceKey),previous=local.get(source.id)
    if(previous?.signature===signature){cached.set(sourceKey,previous.points);return previous.points}
    const angles = Array.from({ length: 96 }, (_, i) => i * Math.PI / 48 - Math.PI)
    for (const point of [...map.boundary, ...map.obstacles.flat()]) {
      if (Math.hypot(point.x - source.pos.x, point.y - source.pos.y) > source.range + 1) continue
      const angle = Math.atan2(point.y - source.pos.y, point.x - source.pos.x)
      angles.push(angle - 0.0001, angle, angle + 0.0001)
    }
    angles.sort((a, b) => a - b)
    const points = angles.map(angle => {
      const distance = radiationReach(source, angle, map)
      return { x: source.pos.x + Math.cos(angle) * distance, y: source.pos.y + Math.sin(angle) * distance }
    })
    cached.set(sourceKey, points)
    // One entry per emitter per boundary, not one per door animation frame.
    local.set(source.id,{signature,points})
    return points
  } finally { profileEnd('radiation-footprint', profileTime) }
}

export interface RadiationFeedback { intensity: number; draining: boolean; unprotected: boolean; pulse: number; tickIn: number; source?: RadiationSource }
export const freshRadiationFeedback = (): RadiationFeedback => ({ intensity: 0, draining: false, unprotected: false, pulse: 0, tickIn: 0 })
export interface RadiationState { upgrades: readonly string[]; radiationCharge: number; radiationExposure: number }
export const radiationFraction = (state: RadiationState) => state.radiationCharge / RADIATION_CAPACITY
export function rechargeRadiation(state: RadiationState) {
  state.radiationCharge = state.upgrades.includes('radiation') ? RADIATION_CAPACITY : 0
  state.radiationExposure = 0
}
export function stepRadiationRecharge(state: RadiationState, dt: number) {
  if (!state.upgrades.includes('radiation') || dt <= 0) return
  const capacity = RADIATION_CAPACITY
  state.radiationCharge = Math.min(capacity, state.radiationCharge + capacity * dt / RADIATION_RECHARGE_TIME)
}
export function stepRadiation(state: RadiationState, pos: Vector2, dt: number, map?: CavernMap) {
  state.radiationCharge ??= state.upgrades.includes('radiation') ? RADIATION_CAPACITY : 0
  state.radiationExposure ??= 0
  const { intensity, source } = radiationAt(pos, map)
  const exposed = intensity > 0
  if (!exposed) {
    stepRadiationRecharge(state, dt)
    state.radiationExposure = Math.max(0, state.radiationExposure - dt)
    return { exposed, intensity, source, drained: 0, failed: false }
  }
  const drainRate = RADIATION_DRAIN * intensity
  const protectedTime = state.upgrades.includes('radiation') ? Math.min(dt, state.radiationCharge / drainRate) : 0
  const drained = Math.min(state.radiationCharge, protectedTime * drainRate)
  state.radiationCharge = Math.max(0, state.radiationCharge - drained)
  state.radiationExposure += (dt - protectedTime) * intensity
  return { exposed, intensity, source, drained, failed: state.radiationExposure >= RADIATION_HULL_LIMIT }
}

/** Detector cadence is driven by simulation time, so pausing never queues clicks. */
export function stepRadiationFeedback(feedback: RadiationFeedback, dose: ReturnType<typeof stepRadiation>, state: RadiationState, dt: number) {
  const wasExposed = feedback.intensity > 0
  const wasUnprotected = feedback.unprotected
  feedback.intensity = dose.intensity
  feedback.source = dose.source
  feedback.draining = dose.drained > 0
  feedback.unprotected = dose.exposed && (!state.upgrades.includes('radiation') || state.radiationCharge <= 0)
  if (!dose.exposed) {
    feedback.pulse = 0; feedback.tickIn = 0
    return { tick: false, stopped: wasExposed, urgency: 0 }
  }
  const lowReserve = Math.max(0, 1 - radiationFraction(state) / .3)
  const urgency = Math.min(1, dose.intensity * 0.65 + lowReserve * 0.35)
  feedback.pulse *= Math.exp(-8 * dt)
  feedback.tickIn -= dt
  const tick = feedback.tickIn <= 0 || (!wasUnprotected && feedback.unprotected)
  if (tick) {
    feedback.tickIn = 0.65 - urgency * 0.55
    feedback.pulse = 1
  }
  return { tick, stopped: false, urgency }
}
