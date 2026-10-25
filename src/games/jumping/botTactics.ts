import type { Prop, RobotState, Run } from './challenge.ts'
import type { Vec } from './geometry.ts'
import { lineBlocked } from './geometry.ts'
import { ballShape, boxShape, propHeight, propLoadsPlate } from './propGeometry.ts'
import { pressurePlatePosition } from './pressurePlateMount.ts'
import { resolveSwitchStates } from './switchPower.ts'
import { withTriggerActive } from './toggleGroups.ts'
import { botCanReach, botNavigationGraph, botRouteProgress, botSearchPlaces } from './botNavigation.ts'
import { forceFieldPlatforms } from './forceField.ts'
import { robotPlatforms } from './robotPhysics.ts'
import { TUNING } from './model.ts'

export interface BotSighting { x: number; y: number; vx: number; vy: number; inverted: boolean; time: number; support?: string }
export interface BotTactic { kind: 'pursue' | 'intercept' | 'search' | 'operate' | 'dislodge' | 'clear'; x: number; y: number; trigger?: number; prop?: Prop; robot?: RobotState; blocker?: Vec }
interface Thinking { age: number; plan?: BotTactic; lastX: number; lastY: number; blocked: number; progress: number; distance: number; routeProgress: number;
  evidenceTime: number;
  searched: Map<string, { x: number; y: number; remaining: number }>; rejected: Map<number, number> }
const thoughts = new WeakMap<RobotState, Thinking>()

function disruption(run: Run, memory: BotSighting, states: ReadonlyMap<string, boolean>) {
  let score = 0, blocker: Vec | undefined
  const consider = (value: number, x: number, y: number) => {
    if (Math.hypot(x - memory.x, y - memory.y) > 900 || value <= score) return
    score = value; blocker = [x, y]
  }
  for (const mechanism of run.mechanisms) {
    const d = mechanism.definition
    if (d.power === 'always' || !mechanism.active || states.get(d.id)) continue
    if (d.kind === 'gate') consider(650, d.x + d.w / 2, d.y + d.h)
    else if (memory.support === d.id) consider(550, mechanism.x + d.w / 2, mechanism.y)
  }
  for (const field of run.forceFields) if (field.definition.mode !== 'objects' && !field.active && states.get(field.definition.id)) {
    const d = field.definition; consider(600, d.x + d.w / 2, d.y + d.h / 2)
  }
  if (run.goalLit && run.level.goal.power === 'switched' && !states.get(run.level.goal.id ?? '')) consider(750, run.level.goal.x, run.level.goal.y)
  return { score, blocker }
}

export function botSeesProp(run: Run, robot: RobotState, prop: Prop) {
  const from: Vec = [robot.x, robot.y - 42], to: Vec = [prop.x, prop.y - propHeight(prop) / 2]
  return Math.hypot(to[0] - from[0], to[1] - from[1]) < 850 && !lineBlocked(from, to,
    [...run.terrain, ...run.mechanisms.map(m => ({ ...m.definition, x: m.x, y: m.y })),
      ...forceFieldPlatforms(run.forceFields, 'objects'), ...run.props.filter(p => p !== prop).map(p => p.kind === 'ball' ? ballShape(p) : boxShape(p))])
}

/** Read the map and ordinary wiring, then choose a physical action. No switch,
 * mechanism, object transform, or hidden player position is changed here. */
export function chooseBotTactic(run: Run, robot: RobotState, memory: BotSighting, seen: boolean, dt: number): BotTactic {
  let thought = thoughts.get(robot)
  if (!thought) { thought = { age: 1, lastX: robot.x, lastY: robot.y, blocked: 0, progress: 0, distance: Infinity, routeProgress: 0,
    evidenceTime: -Infinity, searched: new Map(), rejected: new Map() }; thoughts.set(robot, thought) }
  thought.age += dt
  for (const [index, time] of thought.rejected) if (time <= dt) thought.rejected.delete(index); else thought.rejected.set(index, time - dt)
  for (const [key, visit] of thought.searched) if (visit.remaining <= dt) thought.searched.delete(key); else visit.remaining -= dt
  const newClue = !seen && memory.time > thought.evidenceTime
  thought.evidenceTime = memory.time
  if (newClue) { thought.age = 1; thought.searched.clear(); thought.progress = 0; thought.distance = Infinity }
  const old = newClue ? undefined : thought.plan
  const remaining = old ? Math.hypot(robot.x - old.x, robot.y - old.y) : Infinity
  const routeProgress = botRouteProgress(robot)
  if (seen || remaining < thought.distance - 12 || routeProgress !== thought.routeProgress) { thought.progress = 0; thought.distance = remaining }
  else thought.progress += dt
  thought.routeProgress = routeProgress
  const stalled = thought.progress > 4
  const remember = (point: { x: number; y: number }) => thought.searched.set(`${Math.round(point.x)}:${Math.round(point.y)}`, { ...point, remaining: 60 })
  if (!seen && old && (old.kind === 'search' && remaining <= 45 || stalled)) remember(old)
  if (seen) thought.searched.clear()
  const operating = old?.kind === 'operate' && Math.hypot(robot.x - old.x, robot.y - old.y) < 45
  const recent = run.activeTime - memory.time < 4
  if (operating && recent && run.triggers[old.trigger!].pressed && old.blocker && Math.hypot(memory.x - old.blocker[0], memory.y - old.blocker[1]) < 900) return old
  if (old?.kind === 'operate' && Math.hypot(robot.x - thought.lastX, robot.y - thought.lastY) < .05 && !operating) thought.blocked += dt
  else thought.blocked = 0
  thought.lastX = robot.x; thought.lastY = robot.y
  if (thought.blocked > 3 && old?.trigger !== undefined) { thought.rejected.set(old.trigger, 6); thought.age = 1 }
  if (thought.age < .5 && old && !stalled && !(old.kind === 'search' && remaining <= 45)) return old
  thought.age = 0
  const select = (plan: BotTactic) => {
    if (!old || Math.hypot(plan.x - old.x, plan.y - old.y) > 40 || plan.kind !== old.kind || stalled) {
      thought.progress = 0; thought.distance = Math.hypot(robot.x - plan.x, robot.y - plan.y)
    }
    thought.plan = plan; return plan
  }
  const direction = Math.sign(memory.x - robot.x)
  const obstruction = run.robots.find(other => !other.actor && other !== robot && Math.abs(other.y - robot.y) < 60
    && (other.x - robot.x) * direction > 45 && (other.x - robot.x) * direction < 260
    && Math.abs(other.x - robot.x) < Math.abs(memory.x - robot.x)
    && !lineBlocked([robot.x, robot.y - 42], [other.x, other.y - 28], [...run.terrain,
      ...run.mechanisms.map(m => ({ ...m.definition, x: m.x, y: m.y })), ...forceFieldPlatforms(run.forceFields, 'objects'),
      ...run.props.filter(prop => !prop.gadget).map(prop => prop.kind === 'ball' ? ballShape(prop) : boxShape(prop)),
      ...run.robots.filter(candidate => candidate !== robot && candidate !== other).flatMap(robotPlatforms)]))
  if (obstruction) return select({ kind: 'clear', x: memory.x, y: memory.y, robot: obstruction })
  let best: BotTactic | undefined, bestScore = 0
  for (const [index, plate] of run.level.triggers.entries()) {
    if (!recent || plate.mode === 'coins' || plate.ceiling || thought.rejected.has(index)) continue
    const position = pressurePlatePosition(plate, run.mechanisms), x = position.x + plate.w / 2, y = position.y
    if (Math.hypot(x - robot.x, y - robot.y) > 500) continue
    const behavior = plate.behavior ?? 'pressure', current = run.triggers[index]
    if (!current.pressed) {
      const active = behavior === 'pressure' ? true : behavior === 'switch' ? !plate.startsOn : !current.active
      const states = resolveSwitchStates(run.level, withTriggerActive(run.level, run.triggers, index, active), run.floatSwitches)
      const effect = disruption(run, memory, states), score = effect.score - Math.hypot(x - robot.x, y - robot.y) * .35
      if (score > bestScore && botCanReach(run, robot, { x, y })) { bestScore = score; best = { kind: 'operate', x, y, trigger: index, blocker: effect.blocker } }
    }
    if (behavior !== 'pressure' || !current.active) continue
    const loads = run.props.filter(prop => !prop.gadget && !prop.floatSwitch && propLoadsPlate(prop, position.x, position.y, plate.w))
    if (loads.length !== 1) continue
    const prop = loads[0], states = resolveSwitchStates(run.level, run.triggers.map((s, i) => i === index ? { active: false } : s), run.floatSwitches)
    const effect = disruption(run, memory, states), score = effect.score - Math.hypot(prop.x - robot.x, prop.y - robot.y) * .2
    if (score > bestScore && botSeesProp(run, robot, prop)) {
      bestScore = score; best = { kind: 'dislodge', x: robot.x, y: robot.y, prop, trigger: index, blocker: effect.blocker }
    }
  }
  if (best) return select(best)
  const age = run.activeTime - memory.time
  const graph = botNavigationGraph(run)
  const occluders = !seen ? [...run.terrain, ...run.mechanisms.map(m => ({ ...m.definition, x: m.x, y: m.y })),
    ...run.props.filter(prop => !prop.gadget).map(prop => prop.kind === 'ball' ? ballShape(prop) : boxShape(prop)),
    ...run.robots.filter(other => other !== robot).flatMap(robotPlatforms)] : []
  // A hunter can rule out empty places it can already see. It need not walk to
  // every point along the same open floor before looking behind cover or up a rope.
  const visible = (point: { x: number; y: number; inverted?: boolean }) => Math.abs(point.x - robot.x) < 850 && Math.abs(point.y - robot.y) < 480
    && !lineBlocked([robot.x + Math.sign(point.x - robot.x) * 13.5, robot.y - 49.5],
      [point.x, point.y - TUNING.height / 2 * (point.inverted ? -1 : 1)], occluders)
  if (!seen && (old?.kind === 'search' || stalled || Math.hypot(robot.x - memory.x, robot.y - memory.y) < 70 || visible(memory))) {
    for (const node of graph.nodes) if (!node.climb && visible(node)) remember(node)
    if (old?.kind === 'search' && remaining > 45 && !stalled && !visible(old)) return old
    // Sweep outward from the last actual sighting, including other floors. A
    // failed route is one place to skip, never a reason to abandon the hunt.
    const nodes = botSearchPlaces(run, robot).filter(n => Math.hypot(n.x - robot.x, n.y - robot.y) > 70
      && ![...thought.searched.values()].some(visit => Math.hypot(n.x - visit.x, n.y - visit.y) < 100))
    const score = (node: typeof nodes[number]) => Math.hypot(node.x - memory.x, node.y - memory.y) + node.cost * .4
      + (Math.abs(memory.vy) > 40 && (node.y - memory.y) * memory.vy < -80 * Math.abs(memory.vy) ? 500 : 0)
    nodes.sort((a, b) => score(a) - score(b))
    const node = nodes[0]
    if (node) return select({ kind: 'search', x: node.x, y: node.y })
  }
  const lead = Math.abs(memory.vx) > 80 && age < 1 ? Math.max(-220, Math.min(220, memory.vx * .6)) : 0
  const goal = { x: Math.max(20, Math.min(run.level.width - 20, memory.x + lead)), y: memory.y }
  const intercept = lead && botCanReach(run, robot, goal)
  return select({ kind: intercept ? 'intercept' : 'pursue', ...(intercept ? goal : { x: memory.x, y: memory.y }) })
}
