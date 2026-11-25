import { robotTouchesPlayer } from './robotPhysics.ts'
// Rbot in lasting weightlessness. Nothing walks there, so the ground graph (botNavigation.ts) has nothing to offer: the
// robot flies on its booster boots with the player's own controls (Left/Right in proportion, Up and Down on or off),
// through a coarse grid of the open weightless space, and skates along a surface it stands on by pressing into it.
// It never reads animation. See Repulsorbots in docs/jumping-physics.md.
import type { Run, RobotState } from './challenge.ts'
import type { JumpInput, Platform, Player } from './model.ts'
import { NEUTRAL_INPUT, TUNING } from './model.ts'
import { nearbyBoundary, pointInside } from './geometry.ts'
import { gravityAtPoint, isWeightless, sideGravityAtPoint } from './gravity.ts'
import { forceFieldPlatforms } from './forceField.ts'
import { bodySize } from './sizeFrame.ts'
import { wallFrameAngle } from './wallFrame.ts'

type Point = { x: number; y: number }
/** Grid spacing of the open weightless space, in world units. */
const CELL = 40
/** Replan at least this often, and whenever the goal moves by `REGOAL`. */
const REPLAN = .5, REGOAL = 40
/** Cruising speed: a hunt flies near the boots' top speed, a patrol at an unhurried drift. */
const HUNT_SPEED = 330, PATROL_SPEED = 150, SKATE_SPEED = 140
/** Braking the controller plans on: under the boots' braking against a drift (TUNING.zeroGravityBrake), so it stops short. */
const PLANNED_BRAKE = .55
/** How quickly the controller asks to close the gap between its velocity and the one it wants. */
const RESPONSE = .3
/** Up or Down engages above this share of full vertical thrust and lets go below the lower one, so the boots do not flicker. */
const VERTICAL_ON = .4, VERTICAL_OFF = .15
/** A turn to face the other way needs this much Left or Right; smaller corrections against the facing coast instead. */
const TURN_DEMAND = .35
/** Seen, the hunter holds off at this distance with a clear line, where it can wind up a shot. */
const STANDOFF = 230
/** Closer than this to the player's middle (times its size), it backs off rather than come to rest against them. */
const KEEP_AWAY = 105
/** Patrol pauses at each end of its beat, as a ground patrol turns at its end. */
const PATROL_PAUSE = .8

interface FloatGrid { columns: number; rows: number; open: Uint8Array; key: string }
interface FloatState { path: Point[]; age: number; goal?: Point; vertical: number; patrolEnd: number; pause: number
  stuck: number; last: Point; avoided: Map<number, number> }

const grids = new WeakMap<Run, Map<number, FloatGrid>>()
const states = new WeakMap<RobotState, FloatState>()

/**
 * Whether a body is weightless and free to fly. The robot takes to its boots from the first weightless step: the
 * ground planner would hold a direction that lifts it off before zero-g handling settles (TUNING.zeroGravitySettle).
 */
export const botFloating = (actor: Player) => (actor.weightless ?? 0) > 0
  && !actor.climbing && !actor.hang && !actor.mantle && !actor.waterMotion

/** A point in weightlessness: no pull down or sideways beyond zero g's five percent. */
export const weightlessPoint = (run: Run, x: number, y: number) => !!run.gravityField
  && isWeightless(gravityAtPoint(run.gravityField, x, y)) && isWeightless(sideGravityAtPoint(run.gravityField, x, y))

const solidsFor = (run: Run): Platform[] => [...run.terrain, ...forceFieldPlatforms(run.forceFields, 'objects'),
  ...run.mechanisms.map(m => ({ ...m.definition, x: m.x, y: m.y }))]

/** Room for a floating body around its middle: about its width, since it turns to lie along its travel. */
const clearance = (k: number) => TUNING.width * k * .9
function roomAt(solids: readonly Platform[], x: number, y: number, radius: number) {
  for (const solid of solids) {
    if (x < solid.x - radius || x > solid.x + solid.w + radius || y < solid.y - radius || y > solid.y + solid.h + radius) continue
    if (pointInside(solid, x, y)) return false
    const edge = nearbyBoundary(solid, x, y, radius)
    if (edge && edge.distance < radius) return false
  }
  return true
}

/** The middle of the body, in the world, in whichever frame it stands or floats. */
export function floatCenter(actor: Player): Point {
  const half = TUNING.height * bodySize(actor) / 2 * (actor.inverted ? -1 : 1), angle = wallFrameAngle(actor.wall)
  return { x: actor.x + half * Math.sin(angle), y: actor.y - half * Math.cos(angle) }
}

function floatGrid(run: Run, k: number): FloatGrid {
  const solids = solidsFor(run)
  // Fields switch with power and mechanisms move: rebuild only when either changes.
  const key = `${run.mechanisms.map(m => `${Math.round(m.x / 10)},${Math.round(m.y / 10)}`).join(';')}|${run.forceFields.length}`
  let sized = grids.get(run)
  if (!sized) grids.set(run, sized = new Map())
  const cached = sized.get(k)
  if (cached && cached.key === key && fieldOf.get(cached) === run.gravityField) return cached
  const columns = Math.ceil(run.level.width / CELL), rows = Math.ceil(run.level.height / CELL), open = new Uint8Array(columns * rows), radius = clearance(k)
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const x = (column + .5) * CELL, y = (row + .5) * CELL
    open[row * columns + column] = Number(weightlessPoint(run, x, y) && roomAt(solids, x, y, radius))
  }
  const grid = { columns, rows, open, key }
  fieldOf.set(grid, run.gravityField); sized.set(k, grid)
  return grid
}
const fieldOf = new WeakMap<FloatGrid, unknown>()

const cellOf = (grid: FloatGrid, p: Point) => Math.max(0, Math.min(grid.rows - 1, Math.floor(p.y / CELL))) * grid.columns
  + Math.max(0, Math.min(grid.columns - 1, Math.floor(p.x / CELL)))
const cellPoint = (grid: FloatGrid, cell: number): Point => ({ x: (cell % grid.columns + .5) * CELL, y: (Math.floor(cell / grid.columns) + .5) * CELL })

/** The open cell nearest a point, searching outward ring by ring. */
function nearestOpen(grid: FloatGrid, p: Point, avoided?: ReadonlyMap<number, number>) {
  const column = Math.floor(p.x / CELL), row = Math.floor(p.y / CELL)
  for (let ring = 0; ring < Math.max(grid.columns, grid.rows); ring++) {
    let best = -1, bestDistance = Infinity
    for (let r = row - ring; r <= row + ring; r++) for (let c = column - ring; c <= column + ring; c++) {
      if (Math.max(Math.abs(r - row), Math.abs(c - column)) !== ring || r < 0 || c < 0 || r >= grid.rows || c >= grid.columns) continue
      const cell = r * grid.columns + c
      if (!grid.open[cell] || avoided?.has(cell)) continue
      const point = cellPoint(grid, cell), distance = Math.hypot(point.x - p.x, point.y - p.y)
      if (distance < bestDistance) { best = cell; bestDistance = distance }
    }
    if (best >= 0) return best
  }
  return -1
}

/** A* over open cells, eight ways, never cutting a blocked corner. */
function searchCells(grid: FloatGrid, from: number, to: number, avoided: ReadonlyMap<number, number>) {
  const cost = new Float64Array(grid.open.length).fill(Infinity), previous = new Int32Array(grid.open.length).fill(-1), closed = new Uint8Array(grid.open.length)
  const goal = cellPoint(grid, to), estimate = (cell: number) => { const p = cellPoint(grid, cell); return Math.hypot(p.x - goal.x, p.y - goal.y) / CELL }
  const open: number[] = [from]; cost[from] = 0
  while (open.length) {
    let pick = 0
    for (let i = 1; i < open.length; i++) if (cost[open[i]] + estimate(open[i]) < cost[open[pick]] + estimate(open[pick])) pick = i
    const cell = open[pick]; open[pick] = open[open.length - 1]; open.pop()
    if (cell === to) break
    if (closed[cell]) continue
    closed[cell] = 1
    const column = cell % grid.columns, row = Math.floor(cell / grid.columns)
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue
      const r = row + dr, c = column + dc
      if (r < 0 || c < 0 || r >= grid.rows || c >= grid.columns) continue
      const next = r * grid.columns + c
      if (!grid.open[next] || closed[next] || dr && dc && (!grid.open[row * grid.columns + c] || !grid.open[r * grid.columns + column])) continue
      const step = (dr && dc ? Math.SQRT2 : 1) + (avoided.has(next) ? 6 : 0)
      if (cost[cell] + step < cost[next]) { cost[next] = cost[cell] + step; previous[next] = cell; open.push(next) }
    }
  }
  if (!Number.isFinite(cost[to])) return undefined
  const cells = [to]
  while (previous[cells[0]] >= 0) cells.unshift(previous[cells[0]])
  return cells
}

/** Whether a body can fly straight from a to b: every sample in the open, both on and off the grid. */
function flightClear(run: Run, solids: readonly Platform[], a: Point, b: Point, k: number, leaving = false) {
  const length = Math.hypot(b.x - a.x, b.y - a.y), steps = Math.max(1, Math.ceil(length / (CELL / 2))), radius = clearance(k) * .85
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t
    if (!roomAt(solids, x, y, radius) || !leaving && !weightlessPoint(run, x, y)) return false
  }
  return true
}

/** The route to a goal (the body's middle), as world points, the first ones dropped once a straight flight passes them. */
function plan(run: Run, grid: FloatGrid, solids: readonly Platform[], from: Point, goal: Point, k: number, avoided: ReadonlyMap<number, number>) {
  const start = nearestOpen(grid, from), end = nearestOpen(grid, goal, avoided)
  if (start < 0 || end < 0) return []
  const cells = searchCells(grid, start, end, avoided) ?? []
  const points = cells.map(cell => cellPoint(grid, cell))
  // The goal itself, where the open space reaches it; a goal beyond the field is left to straight flight and gravity.
  if (flightClear(run, solids, points.at(-1) ?? from, goal, k, true)) points.push(goal)
  return points
}

/** Inputs that thrust toward `want` (a world acceleration), within what the controls can say. */
function thrustInput(actor: Player, state: FloatState, ax: number, ay: number): JumpInput {
  const k = bodySize(actor), horizontal = TUNING.zeroGravityThrust, vertical = TUNING.zeroGravityThrust * k
  let move = Math.max(-1, Math.min(1, ax / horizontal))
  // Small corrections against the facing coast rather than turn the body round and back.
  if (move * actor.facing < 0 && Math.abs(move) < TURN_DEMAND) move = 0
  if (Math.abs(move) < .08) move = 0
  const share = ay / vertical
  if (state.vertical && share * state.vertical < VERTICAL_OFF) state.vertical = 0
  if (!state.vertical && Math.abs(share) > VERTICAL_ON) state.vertical = Math.sign(share)
  return { ...NEUTRAL_INPUT, move, climb: state.vertical < 0, descend: state.vertical > 0 }
}

/**
 * Steer the body's middle to `to`: a velocity toward it that it can still brake from, and the thrust to reach it.
 * `arrive` brakes to a stop there; otherwise it flies through at `speed`.
 */
function steer(actor: Player, state: FloatState, to: Point, speed: number, arrive: boolean, carried: Point = { x: 0, y: 0 }) {
  const at = floatCenter(actor), dx = to.x - at.x, dy = to.y - at.y, distance = Math.hypot(dx, dy)
  const brake = TUNING.zeroGravityThrust * TUNING.zeroGravityBrake * PLANNED_BRAKE
  const wanted = distance < 1 ? 0 : Math.min(speed, arrive ? Math.sqrt(2 * brake * Math.max(0, distance - 6)) : speed)
  // A goal that moves (a standoff from a drifting player) is met at its own velocity, not overshot.
  const vx = (distance < 1 ? 0 : dx / distance * wanted) + carried.x, vy = (distance < 1 ? 0 : dy / distance * wanted) + carried.y
  if (arrive && distance < 10 && Math.hypot(actor.vx - carried.x, actor.vy - carried.y) < 20) return { ...NEUTRAL_INPUT }
  return thrustInput(actor, state, (vx - actor.vx) / RESPONSE, (vy - actor.vy) / RESPONSE)
}

/** The surface a standing body is on, as the world direction pressing into it. */
function intoSurface(actor: Player): Point | undefined {
  if (!actor.grounded) return
  const angle = wallFrameAngle(actor.wall), flip = actor.inverted ? -1 : 1
  return { x: -Math.sin(angle) * flip, y: Math.cos(angle) * flip }
}

/**
 * Skate along the floor-frame surface underfoot to x: Left or Right with Down held into the floor drives the boots
 * along it; letting go grips and stops (TUNING.zeroGravityGrip). Only an upright standing body skates.
 */
function skate(actor: Player, x: number, speed: number) {
  const dx = x - actor.x, wanted = Math.sign(dx) * Math.min(speed, Math.sqrt(2 * TUNING.zeroGravityThrust * .5 * Math.max(0, Math.abs(dx) - 4)))
  const move = Math.abs(dx) < 6 ? 0 : Math.max(0, Math.min(1, (wanted - actor.vx) * Math.sign(dx) / (TUNING.zeroGravityThrust * RESPONSE))) * Math.sign(dx)
  return { ...NEUTRAL_INPUT, move, descend: !!move }
}

/**
 * Rbot's movement while it floats: hunting a clue (`target`, feet on the ground as the ground graph takes them, with
 * `inverted` for a body standing on a ceiling) or patrolling its beat between its definition's left and right, at
 * its home height. Called from botMovement while botFloating holds.
 */
export function botFloatMovement(run: Run, robot: RobotState, dt: number, target?: Point & { inverted?: boolean; vx?: number; vy?: number }, seen = false): JumpInput {
  const actor = robot.actor!, k = bodySize(actor), grid = floatGrid(run, k), solids = solidsFor(run), at = floatCenter(actor)
  let state = states.get(robot)
  if (!state) states.set(robot, state = { path: [], age: Infinity, vertical: 0, patrolEnd: actor.x < (robot.definition.left + robot.definition.right) / 2 ? 1 : 0,
    pause: 0, stuck: 0, last: at, avoided: new Map() })
  state.age += dt
  for (const [cell, time] of state.avoided) if (time <= dt) state.avoided.delete(cell); else state.avoided.set(cell, time - dt)
  // Pinned (against a prop or another body the grid does not know): stop using where it is heading for a while.
  const moved = Math.hypot(at.x - state.last.x, at.y - state.last.y)
  state.stuck = state.path.length && moved < 25 * dt ? state.stuck + dt : 0
  state.last = at
  if (state.stuck > 1 && state.path[0]) { state.avoided.set(cellOf(grid, state.path[0]), 3); state.age = Infinity; state.stuck = 0 }

  const height = TUNING.height
  // It does not come to rest on the player: against them, or about to be, it backs off on its boots. It knows they
  // are there only by seeing them or touching them: an unseen player near it is not something it can steer by.
  const player = run.player, body = { x: player.x, y: player.y - (player.inverted ? -1 : 1) * height / 2 }
  const apart = Math.hypot(at.x - body.x, at.y - body.y)
  const touching = actor.contacts?.support?.collider.id === 'player' || actor.contacts?.push?.collider.id === 'player' || robotTouchesPlayer(robot, player)
  if (touching || seen && apart < KEEP_AWAY * k) {
    const away = apart > 1 ? { x: (at.x - body.x) / apart, y: (at.y - body.y) / apart } : { x: -actor.facing, y: 0 }
    state.age = Infinity
    return steer(actor, state, { x: body.x + away.x * KEEP_AWAY * k * 1.4, y: body.y + away.y * KEEP_AWAY * k * 1.4 }, HUNT_SPEED, true, { x: player.vx, y: player.vy })
  }
  let goal: Point, speed: number, carried: Point = { x: 0, y: 0 }
  if (target) {
    const middle = { x: target.x, y: target.y - (target.inverted ? -1 : 1) * height / 2 }
    // Seen, it stands off on its own side at the clue's height, where a clear line lets it wind up.
    const side = Math.sign(at.x - middle.x) || -actor.facing
    const standoff = { x: middle.x + side * STANDOFF, y: middle.y }
    const holding = seen && weightlessPoint(run, standoff.x, standoff.y) && flightClear(run, solids, standoff, middle, k, true)
    goal = holding ? standoff : middle
    if (holding) carried = { x: target.vx ?? 0, y: target.vy ?? 0 }
    speed = HUNT_SPEED; state.pause = 0
  } else {
    const { left, right, y } = robot.definition, inset = 40 * k
    const end = state.patrolEnd ? right - inset : left + inset
    goal = { x: end, y: y - height * k / 2 }; speed = PATROL_SPEED
    // Home from the floor of its beat, it skates; anywhere else it flies there and lands.
    const into = intoSurface(actor)
    const home = into && !actor.wall && !actor.inverted && Math.abs(actor.y - y) < 20 * k
    // At the end of its beat it pauses and turns for the other: on its floor, or hovering just off it there (lifted
    // a little by a side field, say), which otherwise held it at that end for good.
    const hovering = !home && Math.hypot(at.x - goal.x, at.y - goal.y) < 20 * k
    if (home && Math.abs(actor.x - end) < 12 * k || hovering) {
      state.pause += dt
      if (state.pause >= PATROL_PAUSE) { state.patrolEnd = 1 - state.patrolEnd; state.pause = 0 }
      if (home) return { ...NEUTRAL_INPUT }
    }
    if (home && flightClear(run, solids, at, goal, k)) { state.path = []; return skate(actor, end, SKATE_SPEED) }
  }
  if (!state.goal || state.age >= REPLAN || Math.hypot(goal.x - state.goal.x, goal.y - state.goal.y) > REGOAL) {
    state.goal = goal; state.age = 0; state.path = plan(run, grid, solids, at, goal, k, state.avoided)
  }
  // Fly at the farthest route point in clear view, and drop the ones already passed.
  let aim = -1
  for (let i = state.path.length - 1; i >= 0; i--) if (flightClear(run, solids, at, state.path[i], k, i === state.path.length - 1)) { aim = i; break }
  if (aim > 0) state.path.splice(0, aim)
  const next = state.path[0] ?? goal, last = state.path.length <= 1
  const input = steer(actor, state, next, speed, last, last ? carried : undefined)
  // Standing on a surface the route leaves, a held direction lifts the body off on its boots. One that only skims
  // along it would press nowhere and lift nothing: lean it away from the surface.
  const into = intoSurface(actor)
  if (into && !input.climb && !input.descend && !input.move && Math.hypot(next.x - at.x, next.y - at.y) > 20 * k) {
    const away = { x: -into.x, y: -into.y }
    return thrustInput(actor, state, away.x * TUNING.zeroGravityThrust, away.y * TUNING.zeroGravityThrust * k)
  }
  return input
}
