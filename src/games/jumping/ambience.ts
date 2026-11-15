/**
 * The sound of a level standing still. A facility is never silent: its air handling runs, its machines hum, its
 * lights and displays buzz, its force fields crackle, its idle robots whir and its water laps; outdoors there is the
 * air. Each of these is one bed (sound.ts), whatever the number of things making it: its loudness is the power sum
 * of every source within earshot, and its bearing their loudness-weighted mean, so a level full of lamps costs no
 * more to play than one with a single lamp. A power cut takes every electrical bed's power away, and sound.ts lets
 * the machinery run down rather than stop dead; the water and the air go on. Presentation only: nothing in the
 * simulation reads it.
 */
import type { Run } from './challenge.ts'
import type { Player } from './model.ts'
import { powerOut } from './power.ts'
import { gravityPlateActive } from './gravity.ts'
import { goalBounds } from './goal.ts'
import { wallLightBounds } from './wallLight.ts'
import { WALL_TIMER_HEIGHT, WALL_TIMER_WIDTH } from './wallTimer.ts'
import { waterControlId } from './waterLevel.ts'
import { pointInside } from './geometry.ts'
import { waterAtPoint } from './gravity.ts'
import { playerContactBody } from './playerContacts.ts'
import { playerTurnAngle } from './ropeGravity.ts'

/**
 * `hvac` is a facility's air handling and `air` the open air (or a cave's stillness); `hum` is powered machinery
 * (lifts, gates, the exit, charging pods), `gravity` gravity plates, `buzz` lights and displays, `field` force
 * fields, `whir` idle robots, and `water` the lapping of pools. `underwater` is the water around a listener whose head
 * is under it, and `engine` the exit bus's diesel.
 */
export type AmbientKind = 'hvac' | 'air' | 'hum' | 'gravity' | 'buzz' | 'field' | 'whir' | 'water' | 'underwater' | 'engine'
export const AMBIENT_KINDS: readonly AmbientKind[] = ['hvac', 'air', 'hum', 'gravity', 'buzz', 'field', 'whir', 'water', 'underwater', 'engine']
/**
 * `volume` 0 to 1 is how much of the bed reaches the listener; `power` 0 or 1 whether what makes it has power; and
 * `pace` 0 to 1, where a bed has one, how hard its sources are working: the gravity plates' strength, the engine's revs.
 */
export interface AmbientBed { volume: number; pan: number; power: number; pace?: number }
export type Ambience = Partial<Record<AmbientKind, AmbientBed>>

const clamp = (n: number, min = 0, max = 1) => Math.max(min, Math.min(max, n))
interface Area { x: number; y: number; w: number; h: number }

/**
 * How much of a source this listener hears, by the falloff of soundPosition (audioState.ts) over the distance to its
 * nearest point: standing beside a long force field is standing at it. `reach` shrinks the distances of a source
 * heard further off, and grows those of one heard only close to, as a lamp's buzz is.
 */
export function earshot(area: Area, ear: { x: number; y: number }, reach = 1) {
  const x = clamp(ear.x, area.x, area.x + area.w), y = clamp(ear.y, area.y, area.y + area.h)
  const distance = Math.hypot(x - ear.x, y - ear.y) / reach
  return { volume: clamp((1400 - distance) / 500) / (1 + (distance / 400) ** 2), pan: clamp((x - ear.x) / 600, -.8, .8) }
}

class Bed {
  energy = 0; bearing = 0; effort = 0; paced = false
  add(area: Area, ear: { x: number; y: number }, weight: number, reach = 1, pace?: number) {
    const heard = earshot(area, ear, reach), energy = (heard.volume * weight) ** 2
    this.energy += energy; this.bearing += energy * heard.pan
    if (pace !== undefined) { this.effort += energy * pace; this.paced = true }
  }
  bed(power: number): AmbientBed {
    const bed: AmbientBed = { volume: Math.min(1, Math.sqrt(this.energy)), pan: this.energy > 0 ? this.bearing / this.energy : 0, power }
    if (this.paced && this.energy > 0) bed.pace = this.effort / this.energy
    return bed
  }
}

const point = (x: number, y: number, size = 0): Area => ({ x: x - size / 2, y: y - size / 2, w: size, h: size })

/** The room around the listener: a facility's air handling, the open air, or a cave's stillness, which is the air, faint. */
function room(run: Run | null, ear: { x: number; y: number }) {
  const environment = run?.level.environment
  if (!environment) return { hvac: 1, air: 0 }
  for (let i = environment.walls.length - 1; i >= 0; i--) {
    const wall = environment.walls[i]
    if (pointInside(wall, ear.x, ear.y)) return wall.kind === 'cave' ? { hvac: 0, air: .45 } : { hvac: 1, air: 0 }
  }
  return environment.kind === 'landscape' ? { hvac: 0, air: 1 } : { hvac: 1, air: 0 }
}

/** Whether the listener hears the open sky: a landscape's, outside its walls and caves, where birds sing. */
export const underOpenSky = (run: Run | null, listener: Pick<Player, 'x' | 'y'>) => room(run, { x: listener.x, y: listener.y - 30 }).air === 1

/**
 * How far under water the player's head is, 0 to 1: nothing while it is above the water, all of it once the whole
 * head is under. Sampled at the top of the head and a little below it, along the body, so it is the same however the
 * body is turned.
 */
export function listenerUnderwater(run: Run | null, player: Player) {
  if (!run?.gravityField.hasWater) return 0
  const body = playerContactBody(player), up = player.inverted ? -1 : 1, angle = playerTurnAngle(player)
  const at = (height: number) => waterAtPoint(run.gravityField, body.x + height * up * Math.sin(angle), body.y - height * up * Math.cos(angle))
  return (at(body.height) + at(body.height * .8)) / 2
}

/**
 * The ambience this listener hears in this run, or in a level played without one (the facility's air alone).
 * `underwater` (listenerUnderwater) trades the lapping at the surface for the water around the listener.
 */
export function levelAmbience(run: Run | null, listener: Pick<Player, 'x' | 'y'>, underwater = 0): Ambience {
  const ear = { x: listener.x, y: listener.y - 30 }, surroundings = room(run, ear)
  if (!run) return { hvac: { volume: surroundings.hvac, pan: 0, power: 1 } }
  const powered = powerOut(run) ? 0 : 1, level = run.level, states = run.switchStates
  const disabled = (device: object) => run.gadgets.disabled.has(device)
  const hum = new Bed(), gravity = new Bed(), buzz = new Bed(), field = new Bed(), whir = new Bed(), water = new Bed()

  // Machinery holds its motors ready while the level has power, a little louder when it is switched on.
  for (const m of run.mechanisms) if (!disabled(m)) {
    hum.add({ x: m.x, y: m.y, w: m.definition.w, h: m.definition.h }, ear, (m.definition.kind === 'lift' ? .7 : .45) * (m.active ? 1 : .6))
  }
  // A gravity plate drones over its whole area, so the listener inside one is at it; a stronger pull, either way, works it harder.
  for (const plate of run.water.plates) if (plate.effect !== 'water' && !disabled(plate) && gravityPlateActive(plate, states)) {
    gravity.add(plate, ear, .8, 1, clamp(Math.abs(plate.gravity) / 3))
  }
  if (level.goal && run.goalLit && level.goal.kind !== 'bus') hum.add(goalBounds(level.goal), ear, .45, .8)
  if (level.entrance.kind === 'charging-bay') hum.add(point(level.entrance.x, level.entrance.y - 45, 60), ear, .35, .7)
  for (const pod of level.vacantPods ?? []) hum.add(point(pod.x, pod.y - 45, 60), ear, .3, .7)

  for (const light of level.wallLights ?? []) if (states.get(light.id)) buzz.add(wallLightBounds(light), ear, .5, .55)
  for (const light of level.lighting?.lights ?? []) if (light.power === 'always' || states.get(light.id)) buzz.add(point(light.x, light.y, 20), ear, .35, .5)
  for (const timer of level.timers ?? []) buzz.add({ x: timer.x, y: timer.y, w: WALL_TIMER_WIDTH, h: WALL_TIMER_HEIGHT }, ear, .35, .5)
  for (const board of level.evaluationBoards ?? []) buzz.add(board, ear, .3, .5)
  for (const door of [...level.courseDoors ?? [], ...level.bulkheads ?? []]) buzz.add(point(door.x, door.y - 100, 40), ear, .25, .5)

  for (const f of run.forceFields) if (f.active && !disabled(f)) field.add(f.platform, ear, 1, .9)

  for (const robot of run.robots) {
    if (robot.deactivated || disabled(robot) || (robot.collapse ?? 0) >= 1) continue
    whir.add(point(robot.x, robot.y - 40, 40), ear, robot.actor ? .55 : .45, .7)
  }

  // Pools lap at their surface; under it, the listener is in them.
  for (const pool of run.water.pools) if (pool.region.h > 0) water.add(pool.region, ear, clamp(.55 + pool.region.w / 1500, .55, 1))

  const beds: Ambience = {}
  if (surroundings.hvac) beds.hvac = { volume: surroundings.hvac, pan: 0, power: powered }
  if (surroundings.air) beds.air = { volume: surroundings.air, pan: 0, power: 1 }
  const sources: [AmbientKind, Bed, number][] = [['hum', hum, powered], ['gravity', gravity, powered], ['buzz', buzz, powered], ['field', field, powered], ['whir', whir, powered], ['water', water, 1]]
  for (const [kind, bed, power] of sources) if (bed.energy > 0) beds[kind] = bed.bed(power)
  if (beds.water && underwater > 0) beds.water.volume *= 1 - underwater
  if (underwater > 0) beds.underwater = { volume: underwater, pan: 0, power: 1 }
  // The bus waits with its engine idling, whatever the facility's power: it is a bus.
  if (level.goal?.kind === 'bus') {
    const engine = new Bed(); engine.add(goalBounds(level.goal), ear, .9)
    if (engine.energy > 0) beds.engine = { ...engine.bed(1), pace: 0 }
  }
  return beds
}

/**
 * The pumps filling or draining each pool: running while the level has power, a pump is switched on and its pool has
 * room to move. Heard from the bottom of the reservoir.
 */
export function runningPumps(run: Run) {
  if (powerOut(run)) return []
  return run.water.pools.flatMap((pool, index) => {
    const direction = Number(!!run.switchStates.get(waterControlId(pool.definition.id, 'fill')))
      - Number(!!run.switchStates.get(waterControlId(pool.definition.id, 'drain')))
    const room = direction > 0 ? pool.level < 100 : pool.level > (pool.definition.waterMinLevel ?? 0)
    if (!direction || !room) return []
    const d = pool.definition
    return [{ index, x: d.x + d.w / 2, y: d.y + d.h, rate: d.waterRate ?? 10, filling: direction > 0 }]
  })
}
