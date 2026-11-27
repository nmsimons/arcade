import type { Prop, RobotState, Run } from './challenge.ts'
import type { Vec } from './geometry.ts'
import { lineBlocked } from './geometry.ts'
import { groundAt } from './terrain.ts'
import { ballShape, boxShape, propHeight, propLoadsPlate } from './propGeometry.ts'
import { pressurePlatePosition } from './pressurePlateMount.ts'
import { withTriggerActive } from './toggleGroups.ts'
import { botCanReach, botNavigationGraph, botOwnRouteTree, botRouteProgress, botSearchPlaces } from './botNavigation.ts'
import { believedStates, believedSwitches, checkVisibleObjectives, landingOf, markChecked, playerObjectives, predictPlayer, resetPrediction, BOT_ROUTE_PACE } from './botPrediction.ts'
import type { Objective } from './botPrediction.ts'
import { bodySize } from './sizeFrame.ts'
import { botFloating } from './botFloatNavigation.ts'
import { botWaterPoint } from './botWaterNavigation.ts'
import { forceFieldPlatforms } from './forceField.ts'
import { robotPlatforms, robotSensesPlayer, robotSize } from './robotPhysics.ts'
import { repulsorBotChestY } from './repulsorBotRig.ts'
import { createPlayer, TUNING } from './model.ts'
/** How far across and up or down Rbot takes a shot at the player it sees, wherever it is. */
export const SHOT_REACH_X = 600, SHOT_REACH_Y = 240
/** From a firing position chosen for a player it cannot reach, it shoots this much farther, up to this far in all. */
export const VANTAGE_REACH_X = 650, VANTAGE_REACH_Y = 400, SHOT_REACH = 720

export interface BotSighting { x: number; y: number; vx: number; vy: number; inverted: boolean; time: number; support?: string
  /** Seen in the air, with nothing holding them up: they will come down somewhere. */
  airborne?: boolean
  /** Flying from a hit, not moving of their own accord. */
  thrown?: boolean
  /** Braced on a wall or kicking off one: climbing a shaft, not falling where an arc would put them. */
  walled?: boolean }
export interface BotTactic { kind: 'pursue' | 'intercept' | 'ambush' | 'search' | 'operate' | 'dislodge' | 'clear' | 'vantage'; x: number; y: number; trigger?: number; prop?: Prop; robot?: RobotState; blocker?: Vec
  /** The player's objective a prediction expects them at. */
  objective?: Objective
  /** Where the player was when this firing position was chosen. */
  focus?: Vec
  /** A sweep that has started round again: kept until reached, though it can be seen from here. */
  round?: boolean
  /** A step back the other way at a place reached, to look behind before going on. */
  look?: boolean
  /** A post kept by a place the player must still come to, on a cold trail: the objective's key. */
  guard?: string }
interface Thinking { age: number; plan?: BotTactic; lastX: number; lastY: number; blocked: number; progress: number; distance: number; routeProgress: number;
  evidenceTime: number;
  /** Where the bot last moved a body length from, and when: standing at one spot too long is a stall however it looks. */
  anchor: { x: number; y: number; time: number }
  /** The place it last turned round at. */
  lookedFor?: BotTactic
  /** Objectives given up on the way, by key: two in a row and it sets that one aside a while. */
  abandoned?: Map<string, number>
  /** When the current kind of plan was taken up. */
  since?: number
  /** On an old trail, it alternates checking where the player was likely going with sweeping places not yet seen. */
  sweep?: boolean; toggledFor?: BotTactic
  searched: Map<string, { x: number; y: number; remaining: number }>; rejected: Map<number, number> }
const thoughts = new WeakMap<RobotState, Thinking>()

/** How much pressing (or releasing) a plate would hurt the player near the clue. `now` is the wiring as the bot
 * believes it stands (believedSwitches): a gate or field changed out of its sight is not known to have changed. */
function disruption(run: Run, memory: BotSighting, states: ReadonlyMap<string, boolean>, now: ReadonlyMap<string, boolean>, exitLit: boolean) {
  let score = 0, blocker: Vec | undefined
  const consider = (value: number, x: number, y: number) => {
    if (Math.hypot(x - memory.x, y - memory.y) > 900 || value <= score) return
    score = value; blocker = [x, y]
  }
  for (const mechanism of run.mechanisms) {
    const d = mechanism.definition
    if (d.power === 'always' || !now.get(d.id) || states.get(d.id)) continue
    if (d.kind === 'gate') consider(650, d.x + d.w / 2, d.y + d.h)
    else if (memory.support === d.id) consider(550, mechanism.x + d.w / 2, mechanism.y)
  }
  for (const field of run.forceFields) if (field.definition.mode !== 'objects' && !now.get(field.definition.id) && states.get(field.definition.id)) {
    const d = field.definition; consider(600, d.x + d.w / 2, d.y + d.h / 2)
  }
  const goal = run.level.goal
  if (goal && exitLit && goal.power === 'switched' && !states.get(goal.id ?? '')) consider(750, goal.x, goal.y)
  return { score, blocker }
}

export function botSeesProp(run: Run, robot: RobotState, prop: Prop) {
  const from: Vec = [robot.x, repulsorBotChestY(robot)], to: Vec = [prop.x, prop.y - propHeight(prop) / 2]
  return Math.hypot(to[0] - from[0], to[1] - from[1]) < 850 && !lineBlocked(from, to,
    [...run.terrain, ...run.mechanisms.map(m => ({ ...m.definition, x: m.x, y: m.y })),
      ...forceFieldPlatforms(run.forceFields, 'objects'), ...run.props.filter(p => p !== prop).map(p => p.kind === 'ball' ? ballShape(p) : boxShape(p))])
}

/** Read the map and ordinary wiring, then choose a physical action. No switch,
 * mechanism, object transform, or hidden player position is changed here. */
/** Whether the bot, standing at a point, would have a clear shot at a target. */
export type FiringCheck = (at: { x: number; y: number }, target: Vec) => boolean
/** How cold a trail is before the bot keeps watch by a place the player must come to, how far it paces about it, and
 * how few such places must be left for one to be worth the wait (with a dozen coins still to take, hunting is). */
const GUARD_AFTER = 8, GUARD_RADIUS = 400, GUARD_MAX_LEFT = 3

/** The next post by the must-visit place the bot can stand beside soonest, or none: from afar, the place itself; there,
 * the far end of the ground about it, so it walks a beat rather than stand or turn on the spot. */
function guardPost(run: Run, robot: RobotState, objectives: readonly Objective[], old: BotTactic | undefined, stalled: boolean): BotTactic | undefined {
  const required = objectives.filter(objective => objective.required)
  if (!required.length || required.length > GUARD_MAX_LEFT) return undefined
  const places = botSearchPlaces(run, robot)
  let target: Objective | undefined, cost = Infinity
  for (const objective of required) for (const place of places)
    if (place.cost < cost && Math.hypot(place.x - objective.x, place.y - objective.y) < 160) { target = objective; cost = place.cost }
  if (!target) return undefined
  if (old?.guard === target.key && !stalled && Math.hypot(robot.x - old.x, robot.y - old.y) > 45) return old
  const k = bodySize(robot.actor!), away = (place: { x: number; y: number }) => Math.hypot(place.x - target.x, place.y - target.y)
  // A post that has stopped getting closer is not walked at again.
  const usable = places.filter(place => !(stalled && old && Math.hypot(place.x - old.x, place.y - old.y) < 60))
  if (Math.hypot(robot.x - target.x, robot.y - target.y) > GUARD_RADIUS) {
    const nearest = usable.filter(place => away(place) < 160).sort((a, b) => away(a) - away(b))[0]
    return nearest && { kind: 'search', x: nearest.x, y: nearest.y, guard: target.key }
  }
  const beat = usable.filter(place => away(place) <= GUARD_RADIUS && Math.hypot(place.x - robot.x, place.y - robot.y) > 90 * k)
    .sort((a, b) => Math.hypot(b.x - robot.x, b.y - robot.y) - Math.hypot(a.x - robot.x, a.y - robot.y))[0]
  return beat && { kind: 'search', x: beat.x, y: beat.y, guard: target.key }
}

export function chooseBotTactic(run: Run, robot: RobotState, memory: BotSighting, seen: boolean, dt: number, canFire?: FiringCheck): BotTactic {
  let thought = thoughts.get(robot)
  if (!thought) { thought = { age: 1, lastX: robot.x, lastY: robot.y, blocked: 0, progress: 0, distance: Infinity, routeProgress: 0,
    evidenceTime: -Infinity, searched: new Map(), rejected: new Map(), anchor: { x: robot.x, y: robot.y, time: run.activeTime } }; thoughts.set(robot, thought) }
  // Holding an ambush on a player it can see is waiting on purpose, not a stall.
  const holding = seen && thought.plan?.kind === 'ambush'
  if (Math.hypot(robot.x - thought.anchor.x, robot.y - thought.anchor.y) > 60 * bodySize(robot.actor!) || robot.phase === 'windup' || robot.phase === 'recover' || holding) thought.anchor = { x: robot.x, y: robot.y, time: run.activeTime }
  const still = run.activeTime - thought.anchor.time > 2.5
  thought.age += dt
  for (const [index, time] of thought.rejected) if (time <= dt) thought.rejected.delete(index); else thought.rejected.set(index, time - dt)
  for (const [key, visit] of thought.searched) if (visit.remaining <= dt) thought.searched.delete(key); else visit.remaining -= dt
  const newClue = !seen && memory.time > thought.evidenceTime
  thought.evidenceTime = memory.time
  if (newClue) { thought.age = 1; thought.searched.clear(); thought.progress = 0; thought.distance = Infinity; resetPrediction(robot) }
  const old = newClue ? undefined : thought.plan
  const remaining = old ? Math.hypot(robot.x - old.x, robot.y - old.y) : Infinity
  const routeProgress = botRouteProgress(robot)
  if (seen || remaining < thought.distance - 12 || routeProgress !== thought.routeProgress) { thought.progress = 0; thought.distance = remaining }
  else thought.progress += dt
  thought.routeProgress = routeProgress
  // A route that has stopped closing in is given up quickly: standing still is the one thing a hunter must not do.
  const stalled = thought.progress > 2.5
  const remember = (point: { x: number; y: number }) => thought.searched.set(`${Math.round(point.x)}:${Math.round(point.y)}`, { ...point, remaining: 60 })
  if (!seen && old && (old.kind === 'search' && remaining <= 45 || stalled)) remember(old)
  if (seen) { thought.searched.clear(); resetPrediction(robot) }
  const operating = old?.kind === 'operate' && Math.hypot(robot.x - old.x, robot.y - old.y) < 45
  const recent = run.activeTime - memory.time < 4
  if (operating && recent && run.triggers[old.trigger!].pressed && old.blocker && Math.hypot(memory.x - old.blocker[0], memory.y - old.blocker[1]) < 900) return old
  if (old?.kind === 'operate' && Math.hypot(robot.x - thought.lastX, robot.y - thought.lastY) < .05 && !operating) thought.blocked += dt
  else thought.blocked = 0
  thought.lastX = robot.x; thought.lastY = robot.y
  if (thought.blocked > 3 && old?.trigger !== undefined) { thought.rejected.set(old.trigger, 6); thought.age = 1 }
  if (thought.age < .5 && old && !stalled && !(old.kind === 'search' && remaining <= 45)) return old
  // A jump in the air is committed to: changing its mind mid-flight steers it short, into a gap or a pool.
  const actor = robot.actor!
  if (old && !actor.grounded && !actor.climbing && !actor.waterMotion && !actor.hang && !actor.mantle && !botFloating(actor)) return old
  // So is a climb under way, on a guess: turning back halfway up a ladder for a slightly better hunch undoes the climb.
  if (old && !seen && (actor.climbing || actor.mantle) && !stalled && !(old.kind === 'search' && remaining <= 45)) return old
  thought.age = 0
  const select = (plan: BotTactic) => {
    if (!old || Math.hypot(plan.x - old.x, plan.y - old.y) > 40 || plan.kind !== old.kind || stalled) {
      thought.progress = 0; thought.distance = Math.hypot(robot.x - plan.x, robot.y - plan.y)
    }
    if (!old || plan.kind !== old.kind) thought.since = run.activeTime
    thought.plan = plan; return plan
  }
  const direction = Math.sign(memory.x - robot.x)
  const obstruction = run.robots.find(other => !other.actor && other !== robot && Math.abs(other.y - robot.y) < 60
    && (other.x - robot.x) * direction > 45 && (other.x - robot.x) * direction < 260
    && Math.abs(other.x - robot.x) < Math.abs(memory.x - robot.x)
    && !lineBlocked([robot.x, repulsorBotChestY(robot)], [other.x, other.y - 28 * robotSize(other)], [...run.terrain,
      ...run.mechanisms.map(m => ({ ...m.definition, x: m.x, y: m.y })), ...forceFieldPlatforms(run.forceFields, 'objects'),
      ...run.props.filter(prop => !prop.gadget).map(prop => prop.kind === 'ball' ? ballShape(prop) : boxShape(prop)),
      ...run.robots.filter(candidate => candidate !== robot && candidate !== other).flatMap(robotPlatforms)]))
  if (obstruction) return select({ kind: 'clear', x: memory.x, y: memory.y, robot: obstruction })
  let best: BotTactic | undefined, bestScore = 0
  const believed = believedSwitches(run, robot), plates = believed.plates
  const now = believedStates(run, robot, plates)
  for (const [index, plate] of run.level.triggers.entries()) {
    if (!recent || plate.mode === 'coins' || plate.ceiling || plate.facing || thought.rejected.has(index)) continue
    const position = pressurePlatePosition(plate, run.mechanisms), x = position.x + plate.w / 2, y = position.y
    if (Math.hypot(x - robot.x, y - robot.y) > 500) continue
    // The plate as the bot last saw it, not as it is now out of sight.
    const behavior = plate.behavior ?? 'pressure', current = { pressed: plates[index].active && behavior === 'pressure', active: plates[index].active }
    if (!current.pressed) {
      const active = behavior === 'pressure' ? true : behavior === 'switch' ? !plate.startsOn : !current.active
      const states = believedStates(run, robot, withTriggerActive(run.level, plates, index, active))
      const effect = disruption(run, memory, states, now, believed.exitLit), score = effect.score - Math.hypot(x - robot.x, y - robot.y) * .35
      if (score > bestScore && botCanReach(run, robot, { x, y })) { bestScore = score; best = { kind: 'operate', x, y, trigger: index, blocker: effect.blocker } }
    }
    if (behavior !== 'pressure' || !current.active) continue
    const loads = run.props.filter(prop => !prop.gadget && !prop.floatSwitch && propLoadsPlate(prop, position.x, position.y, plate.w))
    if (loads.length !== 1) continue
    const prop = loads[0], states = believedStates(run, robot, plates.map((s, i) => i === index ? { active: false } : s))
    const effect = disruption(run, memory, states, now, believed.exitLit), score = effect.score - Math.hypot(prop.x - robot.x, prop.y - robot.y) * .2
    if (score > bestScore && botSeesProp(run, robot, prop)) {
      bestScore = score; best = { kind: 'dislodge', x: robot.x, y: robot.y, prop, trigger: index, blocker: effect.blocker }
    }
  }
  if (best) return select(best)
  const age = run.activeTime - memory.time
  const graph = botNavigationGraph(run, bodySize(robot.actor!))
  const occluders = !seen ? [...run.terrain, ...run.mechanisms.map(m => ({ ...m.definition, x: m.x, y: m.y })),
    ...run.props.filter(prop => !prop.gadget).map(prop => prop.kind === 'ball' ? ballShape(prop) : boxShape(prop)),
    ...run.robots.filter(other => other !== robot).flatMap(robotPlatforms)] : []
  // A hunter can rule out empty places it can already see. It need not walk to
  // every point along the same open floor before looking behind cover or up a rope.
  const visible = (point: { x: number; y: number; inverted?: boolean }) => Math.abs(point.x - robot.x) < 850 && Math.abs(point.y - robot.y) < 480
    && !lineBlocked([robot.x + Math.sign(point.x - robot.x) * 13.5, robot.y - 49.5],
      [point.x, point.y - TUNING.height / 2 * (point.inverted ? -1 : 1)], occluders)
  // Without weight nothing walks: the ground routes say nothing, and the flying hunter (botFloatNavigation.ts) goes
  // straight for its clue.
  const weightless = (actor.weightless ?? 0) > 0 || botFloating(actor)
  if (weightless) { /* the clue itself, below */ }
  else if (seen) {
    // A firing position or ambush just taken up is kept a couple of seconds, while it still offers a shot or a
    // watch: swapping every half second with chasing (over a swimmer bobbing at the surface) gets it nowhere.
    const target: Vec = [memory.x, memory.y - TUNING.height / 2]
    // A long ambush with no shot looks for somewhere that has one.
    if (old?.kind === 'ambush' && run.activeTime - (thought.since ?? run.activeTime) > 10) {
      const own = botOwnRouteTree(run, robot), spot = vantage(run, robot, landingOf(run, memory), own, canFire, true)
      if (spot && (!canFire || canFire(spot, target))) return select({ kind: 'vantage', x: spot.x, y: spot.y, focus: [memory.x, memory.y] })
    }
    if (old && (old.kind === 'vantage' || old.kind === 'ambush') && !stalled && run.activeTime - (thought.since ?? -Infinity) < (old.kind === 'vantage' ? 4 : 2)
      && (old.kind !== 'vantage' || !canFire || canFire(old, target))) return old
    // In view but out of reach (a shelf above, the far side of a gap): find somewhere with a clear shot, or get
    // ahead of where they are going, rather than stand beneath them.
    const own = botOwnRouteTree(run, robot), landing = landingOf(run, memory)
    let gap = Infinity, direct = Infinity
    for (const [index, node] of own.graph.nodes.entries()) if (Number.isFinite(own.costs[index]) && !node.climb) {
      const d = Math.hypot(node.x - landing.x, node.y - landing.y)
      if (d < gap) { gap = d; direct = own.costs[index] }
    }
    // A swimmer is not reached from the bank: the bot does not dive after them.
    // Nor is a player the bot has stopped getting any closer to, however near they look (a gap too narrow for it).
    const reachable = gap < 70 * bodySize(robot.actor!) && !botWaterPoint(run, landing, bodySize(robot.actor!)) && !stalled && !still
    const prediction = !reachable || direct > 700 ? predictPlayer(run, robot, memory, true, old?.objective?.key) : undefined
    // A firing position already chosen is kept until reached, while the player stays about where it was chosen for.
    if (!reachable && old?.kind === 'vantage' && old.focus && !stalled && remaining > 30 * bodySize(actor)
      && Math.hypot(old.focus[0] - landing.x, old.focus[1] - landing.y) < 150) return old
    if (!reachable) {
      // Standing still in plain view of a player it can neither reach nor shoot, it moves somewhere else that might.
      const spot = vantage(run, robot, memory, own, canFire, still)
      if (spot && (still || !prediction || spot.cost / BOT_ROUTE_PACE < prediction.botTime + 1.5)) {
        thought.anchor = { x: robot.x, y: robot.y, time: run.activeTime }
        return select({ kind: 'vantage', x: spot.x, y: spot.y, focus: [landing.x, landing.y] })
      }
    }
    // Cutting a player off is for one on the move; one standing in reach is gone after directly.
    const moving = Math.hypot(memory.vx, memory.vy) > 60
    // Already at the point on their way, with them in view and out of reach, it holds there: an ambush, facing them,
    // ready to wind up the moment they come within reach.
    const at = (point: { x: number; y: number }) => Math.hypot(robot.x - point.x, robot.y - point.y) < 60 * bodySize(actor)
    const ambush = (point: BotTactic) => !reachable && at(point) ? { ...point, kind: 'ambush' as const } : point
    if (prediction?.kind === 'intercept' && (!reachable || moving && prediction.botTime * BOT_ROUTE_PACE < direct * .6))
      return select(ambush({ kind: 'intercept', x: prediction.x, y: prediction.y, objective: prediction.objective }))
    if (!reachable && prediction) return select(ambush({ kind: 'intercept', x: prediction.x, y: prediction.y, objective: prediction.objective }))
  } else if (!seen) {
    const objectives = playerObjectives(run, robot)
    // Where the player should already have been and is not, they were not going there.
    if (age > 3) checkVisibleObjectives(run, robot, objectives)
    // Nor are they still where they were last seen, if the bot, looking with its own eyes either way, sees that
    // spot empty. (A rougher line of sight can rule out a spot the bot could not actually see someone standing in.)
    const sightLines = [...run.terrain, ...run.mechanisms.map(m => ({ ...m.definition, x: m.x, y: m.y })),
      ...run.props.filter(prop => !prop.gadget).map(prop => prop.kind === 'ball' ? ballShape(prop) : boxShape(prop))]
    // A player seen in the air is looked for where they come down, not where they were in flight.
    const down = landingOf(run, memory)
    // A fresh body standing there, built from the clue alone: nothing of the live player goes into the look.
    const standIn = createPlayer({ x: down.x, y: down.y }); standIn.inverted = memory.inverted
    // Only a close look counts: from afar, a player mid-hop or just round a corner of a heard place is easily missed.
    if (Math.hypot(down.x - robot.x, down.y - robot.y) < 250 && [1, -1].some(facing => robotSensesPlayer({ ...robot, facing }, standIn, sightLines)))
      markChecked(run, robot, { key: 'last', kind: 'last', x: down.x, y: down.y, value: 0 })
    // Arrived means standing there: hanging below a deck at the top of its ladder is not having looked across it.
    const arrived = old && remaining <= 60 * bodySize(robot.actor!) && actor.grounded
    // Reaching a place it came to look at, it turns to look the other way too, before it rules the place out.
    // The step back stays on the footing it stands on: stopped at the end of a ledge, a point a stride behind was over
    // the drop, and it hopped down and climbed back up, again at every look (Ascent I's bottom ledge).
    if (arrived && old && old.kind === 'search' && !old.look && thought.lookedFor !== old) {
      thought.lookedFor = old
      const k = bodySize(actor), solids = [...run.terrain, ...run.mechanisms.map(m => ({ ...m.definition, x: m.x, y: m.y }))]
      let x = robot.x, y = robot.y
      while (Math.abs(x - robot.x) < 70 * k) {
        const next = groundAt(solids, x - actor.facing * 4, y, 6 * k)
        if (!next) break
        x -= actor.facing * 4; y = next.y
      }
      return select({ ...old, kind: 'search', x, y, look: true })
    }
    if (old?.look && !arrived && !stalled && thought.age < 1) return old
    // Getting to an objective with nobody there rules it out; the last-seen spot needs an actual look (below), since
    // arriving on top of, or above, someone is not seeing them.
    if (old?.objective && (arrived && old.kind === 'search' && old.objective.kind !== 'last' || stalled)) markChecked(run, robot, old.objective)
    // Fresh tracks are followed, unless the hunter had already decided to cut the player off or shoot from cover.
    // A firing position or ambush taken up for a player who has just slipped from view is held a few seconds more:
    // over a swimmer bobbing out of sight and back, chasing the last glimpse and returning gets nowhere.
    if (old && (old.kind === 'vantage' || old.kind === 'ambush') && !stalled && age < 4) return old
    const committed = !!old && (!!old.objective || old.kind === 'vantage') && !arrived && !stalled
    const fresh = !committed && age < 1.2 && Math.hypot(robot.x - memory.x, robot.y - memory.y) > 70 && !visible(memory)
    // A cold trail, and a place the player must still come to (a coin the exit cannot open without): rather than
    // sweep places they have no reason to be, it keeps watch there, pacing about it, until it sees or hears them.
    if (!fresh && age > GUARD_AFTER) {
      const post = guardPost(run, robot, objectives, old, stalled)
      if (post) return select(post)
    }
    // An old trail: each place reached (or given up) hands over between the objectives and a sweep of the rest.
    if (age > 8 && old && (arrived || stalled) && thought.toggledFor !== old) { thought.sweep = !thought.sweep; thought.toggledFor = old }
    if (age <= 8) thought.sweep = false
    if (!fresh && !thought.sweep) {
      const prediction = predictPlayer(run, robot, memory, false, old?.objective?.key)
      // Turning away from an objective before reaching it, twice, means the way there is not working out (a route
      // the controller cannot finish): pass it over for a while rather than keep coming back to it.
      if (prediction && old?.objective && prediction.objective.key !== old.objective.key && !arrived) {
        const abandoned = thought.abandoned ??= new Map(), count = (abandoned.get(old.objective.key) ?? 0) + 1
        abandoned.set(old.objective.key, count)
        if (count >= 2) { markChecked(run, robot, old.objective); abandoned.delete(old.objective.key) }
      }
      if (prediction && arrived && prediction.objective.key === old?.objective?.key) thought.abandoned?.delete(old.objective.key)
      if (prediction) return select({ kind: prediction.kind === 'intercept' ? 'intercept' : 'search', x: prediction.x, y: prediction.y, objective: prediction.objective })
    }
  }
  if (!seen && (old?.kind === 'search' || stalled || thought.sweep || Math.hypot(robot.x - memory.x, robot.y - memory.y) < 70 || visible(memory))) {
    for (const node of graph.nodes) if (!node.climb && visible(node)) remember(node)
    if (old?.kind === 'search' && !old.objective && remaining > 45 && !stalled && (old.round || !visible(old))) return old
    // Sweep outward from the last actual sighting, including other floors. A
    // failed route is one place to skip, never a reason to abandon the hunt.
    const nodes = botSearchPlaces(run, robot).filter(n => Math.hypot(n.x - robot.x, n.y - robot.y) > 70
      && ![...thought.searched.values()].some(visit => Math.hypot(n.x - visit.x, n.y - visit.y) < 100))
    // Everything has been looked at: go round again, to the place looked at longest ago and away from here, rather
    // than stand still or shuttle between neighbours.
    if (!nodes.length) {
      const lastLook = (node: { x: number; y: number }) => Math.max(0, ...[...thought.searched.values()]
        .filter(visit => Math.hypot(node.x - visit.x, node.y - visit.y) < 100).map(visit => visit.remaining))
      const again = botSearchPlaces(run, robot).filter(n => Math.hypot(n.x - robot.x, n.y - robot.y) > 70)
      again.sort((a, b) => lastLook(a) - lastLook(b) || Math.hypot(a.x - memory.x, a.y - memory.y) - Math.hypot(b.x - memory.x, b.y - memory.y))
      // With every place it can reach in view (shut in a cage, say), none is looked at longer ago than another, and
      // the one nearest the clue is the same place each time: it went there, looked back, and went there again, a
      // few steps each way, turning several times a second. It paces from end to end instead.
      if (again[0] && visible(again[0])) again.sort((a, b) => Math.hypot(b.x - robot.x, b.y - robot.y) - Math.hypot(a.x - robot.x, a.y - robot.y))
      if (again[0]) return select({ kind: 'search', x: again[0].x, y: again[0].y, round: true })
    }
    const score = (node: typeof nodes[number]) => Math.hypot(node.x - memory.x, node.y - memory.y) + node.cost * .4
      + (Math.abs(memory.vy) > 40 && (node.y - memory.y) * memory.vy < -80 * Math.abs(memory.vy) ? 500 : 0)
    nodes.sort((a, b) => score(a) - score(b))
    const node = nodes[0]
    if (node) return select({ kind: 'search', x: node.x, y: node.y })
  }
  const lead = Math.abs(memory.vx) > 80 && age < 1 ? Math.max(-220, Math.min(220, memory.vx * .6)) : 0
  const goal = { x: Math.max(20, Math.min(run.level.width - 20, memory.x + lead)), y: memory.y }
  const intercept = lead && botCanReach(run, robot, goal)
  // Close to a player it can see, it closes in from the side it is on, rather than aim at their middle (which their
  // body keeps it from reaching) and turn back and forth across them.
  const k = bodySize(robot.actor!), side = Math.sign(robot.x - memory.x) || -robot.facing
  const close = seen && robot.actor!.grounded && Math.abs(memory.x - robot.x) < 100 * k && Math.abs(memory.y - robot.y) < 60 * k
  if (close) return select({ kind: 'pursue', x: memory.x + side * 24 * k, y: memory.y })
  return select({ kind: intercept ? 'intercept' : 'pursue', ...(intercept ? goal : { x: memory.x, y: memory.y }) })
}

/**
 * Somewhere the bot can stand and shoot at a player it cannot reach: in range of its pulse, with a clear line from
 * its chest to them, as cheap to get to as possible.
 */
function vantage(run: Run, robot: RobotState, player: { x: number; y: number }, own: ReturnType<typeof botOwnRouteTree>, canFire?: FiringCheck, elsewhere = false) {
  const k = bodySize(robot.actor!), chest = robot.y - repulsorBotChestY(robot)
  const solids = [...run.terrain, ...run.mechanisms.map(m => ({ ...m.definition, x: m.x, y: m.y })), ...forceFieldPlatforms(run.forceFields, 'objects')]
  const target: Vec = [player.x, player.y - TUNING.height / 2]
  // Where it stands already has the shot: stay.
  const actor = robot.actor!, dx = Math.abs(player.x - robot.x), dy = Math.abs(player.y - robot.y)
  if (!elsewhere && actor.grounded && dx <= VANTAGE_REACH_X - 40 && dy < VANTAGE_REACH_Y - 20 && Math.hypot(dx, dy) < SHOT_REACH - 30
    && !lineBlocked([robot.x, robot.y - chest], target, solids) && (!canFire || canFire(robot, target))) return { x: robot.x, y: robot.y, cost: 0 }
  const candidates = own.graph.nodes.flatMap((node, index) => !node.climb && Number.isFinite(own.costs[index])
    && Math.abs(node.x - player.x) <= VANTAGE_REACH_X - 40 && Math.abs(node.y - player.y) < VANTAGE_REACH_Y - 20
    && Math.hypot(node.x - player.x, node.y - player.y) < SHOT_REACH - 30 && Math.abs(node.x - player.x) > 40 * k
    && (!elsewhere || Math.hypot(node.x - robot.x, node.y - robot.y) > 100 * k)
    ? [{ x: node.x, y: node.y, cost: own.costs[index] + Math.abs(Math.hypot(node.x - player.x, node.y - player.y) - 300) * .5 }] : [])
    .sort((a, b) => a.cost - b.cost)
  const clear = candidates.slice(0, 12).find(node => !lineBlocked([node.x, node.y - chest], target, solids) && (!canFire || canFire(node, target)))
  // Nowhere with a clear shot: a stalled bot still moves on, to the nearest other spot within reach of the player,
  // watching where they could come out; failing that, the reachable footing nearest them.
  if (clear || !elsewhere) return clear
  if (candidates[0]) return candidates[0]
  let nearest: { x: number; y: number; cost: number } | undefined, gap = Infinity
  for (const [index, node] of own.graph.nodes.entries()) {
    if (node.climb || node.swim || !Number.isFinite(own.costs[index]) || Math.hypot(node.x - robot.x, node.y - robot.y) < 100 * k) continue
    const d = Math.hypot(node.x - player.x, node.y - player.y)
    if (d < gap) { gap = d; nearest = { x: node.x, y: node.y, cost: own.costs[index] } }
  }
  return nearest
}
