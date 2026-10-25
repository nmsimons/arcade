import type { JumpLevel } from './level.ts'
import { triggerStartsOn } from './toggleGroups.ts'
import type { Selection } from './editor.ts'
import type { Vec } from './geometry.ts'
import { itemDefinition } from './objectLabels.ts'
import { resolveSwitchStates, switchSources, switchedItems, switchTargets } from './switchPower.ts'
import type { WallWiringSettings } from './switchPower.ts'
import { goalBounds, goalPoleX, GOAL_LIGHT_HEIGHT } from './goal.ts'
import { coinSwitchBounds } from './coins.ts'
import { LOGIC_RELAY_WIDTH, LOGIC_RELAY_HEIGHT } from './logicRelay.ts'
import { WALL_LIGHT_RADIUS } from './wallLight.ts'
import { LIGHT_RADIUS } from './lightingDefinition.ts'
import { nightModeEnabled } from './ambientLight.ts'
import { paintNormally } from './worldPaint.ts'
import type { WorldPaint } from './worldPaint.ts'

export interface WallWire { source: Selection; target: string; points: Vec[] }
export const DEFAULT_WIRE_HEIGHT = 160
export const WALL_WIRE_INACTIVE = '#9aa89c', WALL_WIRE_ENERGIZED = '#a1bf86'
export interface WallWireState {
  triggers: readonly { active: boolean }[]
  floatSwitches: readonly { active: boolean }[]
  switchStates: ReadonlyMap<string, boolean>
  empRemaining: number
}
const TERMINAL_GAP = 18, TERMINAL_RADIUS = 3.5
function fixtureBounds(level: JumpLevel, item: Selection) {
  const round = (x: number, y: number, r: number) => ({ x: x - r, y: y - r, w: r * 2, h: r * 2 })
  if (item.kind === 'goal') return round(goalPoleX(level.goal!), level.goal!.y - GOAL_LIGHT_HEIGHT, WALL_LIGHT_RADIUS)
  if (item.kind === 'trigger') {
    const plate = level.triggers![item.index]
    return plate.mode === 'coins' ? coinSwitchBounds(plate) : { x: plate.x, y: plate.y - (plate.ceiling ? 0 : 8), w: plate.w, h: 8 }
  }
  const d = itemDefinition(level, item) as { x: number; y: number; w?: number; h?: number }
  if (item.kind === 'light') return round(d.x, d.y, LIGHT_RADIUS)
  if (item.kind === 'wall-light' || item.kind === 'float-switch') return round(d.x, d.y, WALL_LIGHT_RADIUS)
  if (item.kind === 'logic-relay') return { x: d.x, y: d.y, w: LOGIC_RELAY_WIDTH, h: LOGIC_RELAY_HEIGHT }
  return { x: d.x, y: d.y, w: d.w ?? 0, h: d.h ?? 0 }
}
/** A separate wall jack leaves a visible gap to the equipment at either end. */
function terminal(level: JumpLevel, item: Selection, lane: number, approachX?: number): Vec {
  const custom = (itemDefinition(level, item) as WallWiringSettings | undefined)?.wireTerminal
  if (custom) return [custom.x, custom.y]
  const b = fixtureBounds(level, item), x = b.x + b.w / 2, y = b.y + b.h / 2
  const above: Vec = [x, b.y - TERMINAL_GAP], below: Vec = [x, b.y + b.h + TERMINAL_GAP]
  const left: Vec = [b.x - TERMINAL_GAP, y], right: Vec = [b.x + b.w + TERMINAL_GAP, y]
  let candidates = lane < b.y ? [above, left, right, below] : lane > b.y + b.h ? [below, left, right, above] : [left, right, above, below]
  if (item.kind === 'goal') {
    // The pole occupies the space below its lamp, and the door occupies one
    // side. Keep a low incoming run outside the complete exit assembly.
    const assembly = goalBounds(level.goal!)
    const leftJack: Vec = [assembly.x - TERMINAL_GAP, y]
    const rightJack: Vec = [assembly.x + assembly.w + TERMINAL_GAP, y]
    const sides = (approachX ?? x) < assembly.x + assembly.w / 2 ? [leftJack, rightJack] : [rightJack, leftJack]
    candidates = lane < b.y ? [above, ...sides] : [...sides, above]
  }
  const height = level.floor ?? level.height ?? 1020
  const fits = ([px, py]: Vec) => px >= 4 && px <= level.width - 4 && py >= 4 && py <= height - 4
  return candidates.find(fits) ?? [Math.max(4, Math.min(level.width - 4, x)), Math.max(4, Math.min(height - 4, y))]
}

/** Trace actual outgoing connections only. Wires have no electrical or physical behavior. */
export function wallWires(level: JumpLevel): WallWire[] {
  const height = level.floor ?? level.height ?? 1020, targets = new Map(switchedItems(level).map(item => [item.id, item]))
  const clampY = (y: number) => Math.max(4, Math.min(height - 4, y))
  return switchSources(level).flatMap(source => {
    if (!source.definition.showWires) return []
    const lane = clampY(height - (source.definition.wireHeight ?? DEFAULT_WIRE_HEIGHT))
    const start = terminal(level, source, lane)
    return switchTargets(source.definition).flatMap(id => {
      const target = targets.get(id)
      if (!target) return [] // Invalid connections remain repairable in the studio.
      const end = terminal(level, target, lane, start[0])
      return [{ source: { kind: source.kind, index: source.index }, target: id,
        points: [start, [start[0], lane], [end[0], lane], end] as Vec[] }]
    })
  })
}
const routes = new WeakMap<JumpLevel, WallWire[]>()
function levelWires(level: JumpLevel) {
  let wires = routes.get(level)
  if (!wires) { wires = wallWires(level); routes.set(level, wires) }
  return wires
}
export interface WallTerminal { owner: Selection; x: number; y: number }
/** A custom port joins every incoming and outgoing wire for its item. */
export function wallTerminals(level: JumpLevel): WallTerminal[] {
  const targets = new Map(switchedItems(level).map(item => [item.id, item]))
  const points = new Map<string, WallTerminal>()
  for (const wire of levelWires(level)) {
    const destination = targets.get(wire.target)
    if (!destination) continue
    for (const [owner, point] of [[wire.source, wire.points[0]], [destination, wire.points.at(-1)!]] as const)
      points.set(`${owner.kind}:${owner.index}:${point[0]}:${point[1]}`, { owner: { kind: owner.kind, index: owner.index }, x: point[0], y: point[1] })
  }
  return [...points.values()]
}
const initialStates = new WeakMap<JumpLevel, WallWireState>()
function initialState(level: JumpLevel): WallWireState {
  let state = initialStates.get(level)
  if (!state) {
    const triggers = (level.triggers ?? []).map(t => ({ active: triggerStartsOn(level, t) }))
    const floats = (level.floatSwitches ?? []).map(f => ({ active: f.activeWhen === 'lowered' ? !f.startsRaised : !!f.startsRaised }))
    state = { triggers, floatSwitches: floats, switchStates: resolveSwitchStates(level, triggers, floats), empRemaining: 0 }
    initialStates.set(level, state)
  }
  return state
}
/** A wire carries its source's output, before the destination combines inputs. */
export function wallWireEnergized(level: JumpLevel, wire: WallWire, state: WallWireState): boolean {
  if (state.empRemaining > 0) return false
  if (wire.source.kind === 'trigger') return !!state.triggers[wire.source.index]?.active
  if (wire.source.kind === 'float-switch') return !!state.floatSwitches[wire.source.index]?.active
  const definition = itemDefinition(level, wire.source) as { id?: string }
  return !!state.switchStates.get(definition.id ?? '')
}
export function hasWallWiring(level: JumpLevel) { return levelWires(level).length > 0 }
export function drawWallWiring(ctx: CanvasRenderingContext2D, level: JumpLevel, state?: WallWireState, paint: WorldPaint = paintNormally, nightMode = nightModeEnabled(level.lighting)) {
  const wires = levelWires(level)
  if (!wires.length) return
  const signals = state ?? initialState(level)
  const active = wires.filter(wire => wallWireEnergized(level, wire, signals))
  const inactive = wires.filter(wire => !wallWireEnergized(level, wire, signals))
  ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round'
  const energizedInk = (draw: () => void) => {
    ctx.save()
    if (nightMode) { ctx.shadowColor = 'rgba(161,191,134,.45)'; ctx.shadowBlur = 3 }
    draw(); ctx.restore()
  }
  const stroke = (group: WallWire[], color: string) => {
    ctx.beginPath()
    for (const { points } of group) {
      ctx.moveTo(...points[0])
      for (let i = 1; i < points.length - 1; i++) {
        const previous = points[i - 1], corner = points[i], next = points[i + 1]
        const incoming = Math.hypot(corner[0] - previous[0], corner[1] - previous[1])
        const outgoing = Math.hypot(next[0] - corner[0], next[1] - corner[1])
        const radius = Math.min(8, incoming / 2, outgoing / 2)
        if (!radius) { ctx.lineTo(...corner); continue }
        ctx.lineTo(corner[0] + (previous[0] - corner[0]) * radius / incoming, corner[1] + (previous[1] - corner[1]) * radius / incoming)
        ctx.quadraticCurveTo(...corner, corner[0] + (next[0] - corner[0]) * radius / outgoing, corner[1] + (next[1] - corner[1]) * radius / outgoing)
      }
      ctx.lineTo(...points.at(-1)!)
    }
    ctx.strokeStyle = color; ctx.lineWidth = 1.25; ctx.stroke()
  }
  // An energized run wins wherever routes share a segment.
  paint(ctx, 0, () => stroke(inactive, WALL_WIRE_INACTIVE))
  paint(ctx, .65, () => energizedInk(() => stroke(active, WALL_WIRE_ENERGIZED)))
  const terminals = new Map(wires.flatMap(wire => [wire.points[0], wire.points.at(-1)!]).map(point => [point.join(':'), point]))
  paint(ctx, 0, () => {
    ctx.lineWidth = 1
    for (const point of terminals.values()) {
      ctx.fillStyle = '#56645c'; ctx.strokeStyle = '#8b998b'
      ctx.beginPath(); ctx.arc(...point, TERMINAL_RADIUS, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#27352d'; ctx.beginPath(); ctx.arc(...point, 1.25, 0, Math.PI * 2); ctx.fill()
    }
  })
  const liveTerminals = new Map(active.flatMap(wire => [wire.points[0], wire.points.at(-1)!]).map(point => [point.join(':'), point]))
  paint(ctx, .65, () => energizedInk(() => {
    ctx.fillStyle = WALL_WIRE_ENERGIZED
    for (const point of liveTerminals.values()) { ctx.beginPath(); ctx.arc(...point, 1.25, 0, Math.PI * 2); ctx.fill() }
  }))
  ctx.restore()
}
