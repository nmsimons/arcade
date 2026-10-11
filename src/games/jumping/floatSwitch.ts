import type { NamedObject } from './objectNames.ts'
import type { Prop } from './challenge.ts'
import { drawWallLight, WALL_LIGHT_RADIUS } from './wallLight.ts'
import { paintNormally } from './worldPaint.ts'
import type { WorldPaint } from './worldPaint.ts'

export interface FloatSwitch extends NamedObject {
  id: string; x: number; y: number; armLength: number; size: number; targets: string[]
  travelAngle?: number; flipX?: boolean; startsRaised?: boolean; activeWhen?: 'raised' | 'lowered'
}
export interface FloatSwitchState { definition: FloatSwitch; prop: Prop; raised: boolean; active: boolean }
export const MAX_FLOAT_SWITCHES = 16
export const floatTravel = (definition: FloatSwitch) => (definition.travelAngle ?? 45) * Math.PI / 180
export function floatBallCenter(definition: FloatSwitch, angle = definition.startsRaised ? -floatTravel(definition) : floatTravel(definition)) {
  return { x: definition.x + (definition.flipX ? -1 : 1) * Math.cos(angle) * definition.armLength,
    y: definition.y + Math.sin(angle) * definition.armLength }
}
export function floatSwitchBounds(definition: FloatSwitch) {
  const r = definition.size / 2, horizontal = definition.armLength + r
  const vertical = Math.sin(floatTravel(definition)) * definition.armLength + r
  return { x: definition.x - (definition.flipX ? horizontal : WALL_LIGHT_RADIUS), y: definition.y - vertical,
    w: horizontal + WALL_LIGHT_RADIUS, h: vertical * 2 }
}
export function createFloatSwitch(definition: FloatSwitch): FloatSwitchState {
  const center = floatBallCenter(definition), raised = !!definition.startsRaised
  const prop: Prop = { kind: 'ball', x: center.x, y: center.y + definition.size / 2, size: definition.size,
    vx: 0, vy: 0, angle: 0, angularVelocity: 0, grounded: false, floatSwitch: definition }
  return { definition, prop, raised, active: definition.activeWhen === 'lowered' ? !raised : raised }
}
/** Mechanical hysteresis: a small bob around the pivot cannot chatter the contact. */
export function updateFloatSwitch(state: FloatSwitchState, powered: boolean) {
  const gap = Math.sin(3 * Math.PI / 180) * state.definition.armLength
  const height = state.definition.y - (state.prop.y - state.prop.size / 2)
  if (height >= gap) state.raised = true
  else if (height <= -gap) state.raised = false
  state.active = powered && (state.definition.activeWhen === 'lowered' ? !state.raised : state.raised)
}
/** One thin arm and a wall-light pivot; the normal ball keeps its small dark dot. */
export function drawFloatSwitchArm(ctx: CanvasRenderingContext2D, state: FloatSwitchState, paint: WorldPaint = paintNormally) {
  const d = state.definition
  ctx.save()
  paint(ctx, 0, () => {
    ctx.strokeStyle = '#667b72'; ctx.lineWidth = 4
    ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(state.prop.x, state.prop.y - state.prop.size / 2); ctx.stroke()
  })
  drawWallLight(ctx, d, state.active, paint)
  ctx.restore()
}
