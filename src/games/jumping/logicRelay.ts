import type { NamedObject } from './objectNames.ts'
import type { SwitchSettings } from './switchPower.ts'

/** Position belongs to the studio diagram; this device has no world geometry. */
export interface LogicRelay extends NamedObject, SwitchSettings { id: string; x: number; y: number }
export const MAX_LOGIC_RELAYS = 40
export const LOGIC_RELAY_WIDTH = 60
export const LOGIC_RELAY_HEIGHT = 40
export const logicRelayBounds = (relay: Pick<LogicRelay, 'x' | 'y'>) => ({
  x: relay.x - LOGIC_RELAY_WIDTH / 2, y: relay.y - LOGIC_RELAY_HEIGHT / 2, w: LOGIC_RELAY_WIDTH, h: LOGIC_RELAY_HEIGHT,
})

/** Studio artwork only: never call this from the playable world renderer. */
export function drawLogicRelay(ctx: CanvasRenderingContext2D, relay: LogicRelay, active: boolean) {
  const b = logicRelayBounds(relay)
  ctx.save()
  ctx.fillStyle = active ? '#d9e7d3' : '#eeeee6'; ctx.strokeStyle = '#60826a'; ctx.lineWidth = 2
  ctx.fillRect(b.x + 6, b.y + 2, b.w - 12, b.h - 4); ctx.strokeRect(b.x + 6, b.y + 2, b.w - 12, b.h - 4)
  ctx.beginPath()
  for (const y of [relay.y - 8, relay.y + 8]) { ctx.moveTo(b.x, y); ctx.lineTo(b.x + 6, y) }
  ctx.moveTo(b.x + b.w - 6, relay.y); ctx.lineTo(b.x + b.w, relay.y); ctx.stroke()
  ctx.fillStyle = '#365541'; ctx.font = 'bold 12px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(`${relay.switchReversed ? '¬' : ''}${(relay.switchLogic ?? 'or').toUpperCase()}`, relay.x, relay.y)
  ctx.restore()
}
