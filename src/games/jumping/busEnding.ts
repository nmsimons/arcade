import { createPlayer, finishPlayerStep, NEUTRAL_INPUT } from './model.ts'
import type { Player, Platform } from './model.ts'
import { staticContactWorld } from './playerContacts.ts'
import { goalEase, GOAL_EXIT_SECONDS } from './goal.ts'
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
  /** The robot inside the bus, walking on its own floor at y = 0 in body units (see busCabin). */
  passenger: Player
  cameraLocked?: boolean
}
const mix = (a: number, b: number, t: number) => a + (b - a) * t
const progress = (time: number, start: number, end: number) => Math.max(0, Math.min(1, (time - start) / (end - start)))

/**
 * Inside the bus, seen through its rear window in the bus's own units. The robot comes up the steps at the
 * left-side door after it has closed, walks along the back row behind the seat backs, turns its back to us
 * and sits down on the right-hand seat, a little nearer the glass, then rides away with the bus.
 */
export const BUS_CABIN = {
  enter: 6.25, stop: 7.5, turn: [7.35, 7.75], sit: [7.7, 8.15], settle: [8.05, 8.5],
  fromX: -78, seatX: 32,
  /**
   * The aisle is further back than the back seat, so the robot looks a little smaller there. Seated, it is nearer
   * the glass and its feet are lower in the window, so only its head and shoulders clear the seat back.
   */
  aisle: { floor: -84, scale: .84 }, seat: { floor: -86, scale: .9 },
} as const
const RIDE_START = 8.3
/** Walking pace along the row, then easing to a stop at the seat: position along the way for 0 to 1 of the time. */
function walkAlong(u: number) {
  const cruise = .62, speed = 2 / (1 + cruise)
  if (u <= cruise) return speed * u
  const s = u - cruise
  return speed * (cruise + s - s * s / (2 * (1 - cruise)))
}
/** The bus door closes behind the robot once it is on the steps. */
const busDoor = (t: number) => 1 - goalEase(progress(t, 5.6, 6.2))
/** Scene time while the level's own exit plays at the bus door: it ends where the departure starts. */
export const boardingSceneTime = (exitElapsed: number) => BUS_DEPARTURE_START_SECONDS - GOAL_EXIT_SECONDS + exitElapsed
/** The door as the robot boards under normal controls, before the departure takes over. */
export const boardingDoor = (exitElapsed: number) => busDoor(boardingSceneTime(exitElapsed))

/** Where the passenger is and how far through turning and sitting, or null before it is aboard. */
export function busCabin(t: number) {
  if (t < BUS_CABIN.enter) return null
  const c = BUS_CABIN, walk = walkAlong(progress(t, c.enter, c.stop)), sit = progress(t, c.sit[0], c.sit[1])
  const depth = goalEase(sit)
  // Sitting drops it into the cushion; it gives a little and comes back up.
  const settle = Math.sin(Math.PI * progress(t, c.settle[0], c.settle[1])) * (1 - progress(t, c.settle[0], c.settle[1])) * 1.6
  // As the bus pulls away the head lags, then the ride rocks it gently.
  const ride = t - RIDE_START, pull = ride > 0 ? Math.sin(Math.PI * Math.min(1, ride / .6)) * .9 : 0
  const rocking = ride > 0 ? Math.sin(ride * 2 * Math.PI * 1.4) * .35 * Math.min(1, ride / 1.2) : 0
  return {
    x: mix(c.fromX, c.seatX, walk),
    floor: mix(c.aisle.floor, c.seat.floor, depth), scale: mix(c.aisle.scale, c.seat.scale, depth),
    turn: progress(t, c.turn[0], c.turn[1]), sit,
    settle: settle + rocking, lag: pull,
  }
}

/** Presentation only: the real run is already complete and saved. */
export function createBusEnding(edge: number, ground: number, player: Player, camera: EndingCamera): BusEnding {
  const actor = createPlayer({ x: player.x, y: player.y })
  actor.anim.stride = player.anim.stride; actor.anim.gait = player.anim.gait ? { ...player.anim.gait } : null
  const terrain = [{ x: edge - 500, y: ground, w: 5000, h: 300 }]
  actor.terrain = terrain
  const passenger = createPlayer({ x: BUS_CABIN.fromX / BUS_CABIN.aisle.scale, y: 0 })
  passenger.terrain = [{ x: -1000, y: 0, w: 2000, h: 50 }]
  return { elapsed: 0, edge, ground, from: { x: player.x, y: player.y }, camera: { ...camera }, player: actor, terrain, passenger }
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
    cabin: busCabin(t),
    busX: edge + 640, busY, busScale,
    horizonY: ground, beyondHorizon,
    door: busDoor(t),
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
  const world = staticContactWorld(ending.terrain), actor = ending.player
  const cabinWorld = staticContactWorld(ending.passenger.terrain!), passenger = ending.passenger
  while (target - ending.elapsed > 1e-9) {
    // The robot walks outside until it boards, then inside until it sits. Between and after, time alone poses the scene.
    const before = ending.elapsed
    if (before >= 5.6 && before < BUS_CABIN.enter) { ending.elapsed = Math.min(target, BUS_CABIN.enter); continue }
    if (before >= BUS_CABIN.sit[1]) { ending.elapsed = target; break }
    const step = Math.min(1 / 120, target - before)
    ending.elapsed = before + step
    const frame = busEndingFrame(ending)
    if (before < 5.6) {
      const from: [number, number] = [actor.x, actor.y]
      actor.x = frame.playerX; actor.y = frame.playerY
      actor.vx = (actor.x - from[0]) / step
      actor.grounded = (ending.from.y >= ending.ground - .1 || ending.elapsed >= .65) && ending.elapsed < 4.5
      finishPlayerStep(actor, NEUTRAL_INPUT, step, world, from)
    }
    if (frame.cabin) {
      // The walk is in the aisle's scale; the feet keep their footing on the cabin floor.
      const from: [number, number] = [passenger.x, passenger.y]
      passenger.x = frame.cabin.x / BUS_CABIN.aisle.scale; passenger.y = 0; passenger.grounded = true
      passenger.vx = (passenger.x - from[0]) / step
      finishPlayerStep(passenger, NEUTRAL_INPUT, step, cabinWorld, from)
    }
  }
  ending.elapsed = target
  return busEndingFrame(ending).complete
}
