import { createPlayer, finishPlayerStep, NEUTRAL_INPUT } from './model.ts'
import type { Player, Platform } from './model.ts'
import { staticContactWorld } from './playerContacts.ts'
import { goalEase } from './goal.ts'
import type { Goal } from './goal.ts'

export const BUS_ENDING_SECONDS = 16.3
export const BUS_DEPARTURE_START_SECONDS = 6.2
export const BUS_REAR_PIVOT_Y = -79
export const BUS_REAR_WHEEL_BOTTOM_Y = 8
export type EndingCamera = { x: number; y: number; zoom: number }
export interface BusEnding {
  elapsed: number
  edge: number
  ground: number
  from: { x: number; y: number }
  camera: EndingCamera
  player: Player
  terrain: Platform[]
  cameraLocked?: boolean
}
const mix = (a: number, b: number, t: number) => a + (b - a) * t
const progress = (time: number, start: number, end: number) => Math.max(0, Math.min(1, (time - start) / (end - start)))

/** Presentation only: the real run is already complete and saved. */
export function createBusEnding(edge: number, ground: number, player: Player, camera: EndingCamera): BusEnding {
  const actor = createPlayer({ x: player.x, y: player.y })
  actor.stride = player.stride; actor.gait = player.gait ? { ...player.gait } : null
  const terrain = [{ x: edge - 500, y: ground, w: 5000, h: 300 }]
  actor.terrain = terrain
  return { elapsed: 0, edge, ground, from: { x: player.x, y: player.y }, camera: { ...camera }, player: actor, terrain }
}

/** Boarding happened under normal controls; retain that exact level view. */
export function createBusDeparture(goal: Goal, player: Player, camera: EndingCamera): BusEnding {
  const ending = createBusEnding(goal.x - 640, goal.y, player, camera)
  ending.elapsed = BUS_DEPARTURE_START_SECONDS
  ending.cameraLocked = true
  return ending
}

/** Shared geometry for the live scene, preview, and frame-independent checks. */
export function busEndingFrame(ending: Pick<BusEnding, 'elapsed' | 'edge' | 'ground' | 'from'>) {
  const { elapsed: t, edge, ground, from } = ending
  const walk = progress(t, 0, 3.8), board = goalEase(progress(t, 4.2, 5.6))
  const departure = goalEase(progress(t, 8.3, 14.3))
  const busScale = 1 - departure, parkedCenterY = ground + 24 + BUS_REAR_PIVOT_Y
  const wheelOffset = BUS_REAR_WHEEL_BOTTOM_Y - BUS_REAR_PIVOT_Y
  const contactScale = (ground - parkedCenterY) / wheelOffset
  const beyondHorizon = busScale <= contactScale
  const drop = goalEase(progress(busScale, contactScale, 0))
  // Start lowering exactly when scaling brings the wheel bottoms to ground.
  // Compensate for continued shrink, then sink briskly so the bus disappears
  // while its rear silhouette still has a readable size.
  const busY = Math.max(parkedCenterY, ground - wheelOffset * busScale) + 96 * drop
  const phase = t < 3.8 ? 'Walking to the bus stop' : t < 4.2 ? 'At the bus stop'
    : t < 5.6 ? 'Boarding the bus' : t < 6.2 ? 'Doors closing' : t < 8.3 ? 'Settling into the back seat'
      : t < 14.3 ? 'Riding away' : 'On your way'
  return {
    phase, complete: t >= BUS_ENDING_SECONDS,
    playerX: t < 3.8 ? mix(from.x, edge + 560, walk) : mix(edge + 560, edge + 606, board),
    playerY: mix(from.y, ground, goalEase(progress(t, 0, .65))) - 12 * board,
    playerAlpha: 1 - goalEase(progress(t, 5.2, 5.6)),
    passengerAlpha: goalEase(progress(t, 5.6, 6.2)),
    busX: edge + 640, busY, busScale,
    horizonY: ground, beyondHorizon,
    door: 1 - goalEase(progress(t, 5.6, 6.2)),
    busVisible: t < 14.3,
  }
}

export function busEndingCamera(ending: BusEnding, width: number, height: number): EndingCamera {
  if (ending.cameraLocked) return { ...ending.camera }
  const pan = goalEase(progress(ending.elapsed, 0, 4.4))
  // Hold the rear window in frame as the bus travels away from the game plane.
  const baseZoom = Math.max(.6, Math.min(1.1, height / 850, width / 1100))
  const zoom = mix(ending.camera.zoom, baseZoom, pan)
  return { zoom, x: mix(ending.camera.x, ending.edge + 640 - width / zoom * .54, pan),
    y: mix(ending.camera.y, ending.ground - height / zoom * .76, pan) }
}

export function advanceBusEnding(ending: BusEnding, dt: number) {
  // Use small pose steps even when a preview seeks or the browser misses a frame.
  const target = Math.min(BUS_ENDING_SECONDS, ending.elapsed + Math.max(0, dt))
  if (ending.elapsed >= 5.6) { ending.elapsed = target; return busEndingFrame(ending).complete }
  let remaining = target - ending.elapsed
  const world = staticContactWorld(ending.terrain), actor = ending.player
  while (remaining > 1e-9) {
    const step = Math.min(1 / 120, remaining), from: [number, number] = [actor.x, actor.y]
    ending.elapsed = Math.min(BUS_ENDING_SECONDS, ending.elapsed + step)
    const frame = busEndingFrame(ending)
    actor.x = frame.playerX; actor.y = frame.playerY
    actor.vx = (actor.x - from[0]) / step
    actor.grounded = (ending.from.y >= ending.ground - .1 || ending.elapsed >= .65) && ending.elapsed < 4.5
    finishPlayerStep(actor, NEUTRAL_INPUT, step, world, from)
    remaining -= step
  }
  ending.elapsed = target
  return busEndingFrame(ending).complete
}
