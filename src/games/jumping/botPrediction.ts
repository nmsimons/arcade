import type { RobotState, Run } from './challenge.ts'
import type { Vec } from './geometry.ts'
import { lineBlocked } from './geometry.ts'
import { botLastHeard } from './botHearing.ts'
import { botOwnRouteTree, botReturnable, botRouteTree } from './botNavigation.ts'
import { pressurePlatePosition } from './pressurePlateMount.ts'
import { resolveSwitchStates } from './switchPower.ts'
import { withTriggerActive } from './toggleGroups.ts'
import { repulsorBotChestY } from './repulsorBotRig.ts'
import { groundAt } from './terrain.ts'
import { botWaterPoint } from './botWaterNavigation.ts'
import { TUNING } from './model.ts'
import { gravityAtPoint, waterAtPoint } from './gravity.ts'

/**
 * Reading the level the way a player must: what is still to collect, what powers the exit, and the exit itself.
 * The hunter uses that map knowledge, and only what it has seen or heard of the player, to guess where they are
 * heading and get there first. It never reads the player's hidden position.
 */
export interface Objective { key: string; kind: 'coin' | 'pickup' | 'switch' | 'exit' | 'last'; x: number; y: number; value: number
  /** The exit cannot open without it: every coin, when the exit's coin switch asks for all of them. */
  required?: boolean }
export interface Prediction {
  kind: 'intercept' | 'objective'
  /** Where the bot should go. */
  x: number; y: number
  objective: Objective
  /** When the player is expected there, from now, and when the bot can be. */
  playerTime: number; botTime: number
}
interface Clue { x: number; y: number; vx: number; vy: number; time: number; airborne?: boolean; thrown?: boolean; walled?: boolean }

/** A player's pace along the planner's route costs, with climbs, jumps and hesitation; and the bot's own. */
export const PLAYER_ROUTE_PACE = 260, BOT_ROUTE_PACE = 300
/** A place checked and found empty is passed over this long (the exit, which the player must reach, less). */
const CHECKED_SECONDS = 18, EXIT_CHECKED_SECONDS = 7

interface Belief { known: Set<number>; checked: Map<string, number>; switchCache?: { time: number; keys: Set<number> }
  /** The exit's lamp and each plate as last seen: a change made out of sight is learnt only on seeing it. */
  exitLit?: boolean; plates?: { active: boolean }[]
  /** Float switches, level gauges and gate-shut contacts likewise, as last seen. */
  floats?: { active: boolean }[]; gauges?: { active: boolean; highActive?: boolean }[]; shut?: { active: boolean }[] }
const beliefs = new WeakMap<RobotState, Belief>()
const belief = (robot: RobotState) => {
  let found = beliefs.get(robot)
  if (!found) beliefs.set(robot, found = { known: new Set(), checked: new Map() })
  return found
}

const solidsFor = (run: Run) => [...run.terrain, ...run.mechanisms.map(m => ({ ...m.definition, x: m.x, y: m.y }))]
const sees = (run: Run, robot: RobotState, point: { x: number; y: number }, solids = solidsFor(run)) =>
  Math.abs(point.x - robot.x) < 850 && Math.abs(point.y - robot.y) < 480
  && !lineBlocked([robot.x, repulsorBotChestY(robot)], [point.x, point.y - 20], solids)

/** The exit's lamp and the plates as the run began: what every bot knows before it has seen any change. */
const starts = new WeakMap<Run, { exitLit: boolean; plates: { active: boolean }[]; floats: { active: boolean }[];
  gauges: { active: boolean; highActive?: boolean }[]; shut: { active: boolean }[] }>()
export function rememberStartState(run: Run) {
  if (!starts.has(run)) starts.set(run, { exitLit: run.goalLit, plates: run.triggers.map(trigger => ({ active: trigger.active })),
    floats: run.floatSwitches.map(float => ({ active: float.active })),
    gauges: (run.levelGauges ?? []).map(gauge => ({ active: gauge.active, highActive: gauge.highActive })),
    shut: (run.gateShut ?? []).map(contact => ({ active: contact.active })) })
}

/** Bring what the bot believes of the exit's lamp and the plates up to date with what it can see now. */
function lookAround(run: Run, robot: RobotState, memo: Belief, solids: ReturnType<typeof solidsFor>) {
  rememberStartState(run)
  const goal = run.level.goal, start = starts.get(run)!
  memo.exitLit ??= start.exitLit
  if (goal && sees(run, robot, { x: goal.x, y: goal.y - 40 }, solids)) memo.exitLit = run.goalLit
  memo.plates ??= start.plates.map(plate => ({ ...plate }))
  memo.floats ??= start.floats.map(float => ({ ...float }))
  memo.gauges ??= start.gauges.map(gauge => ({ ...gauge }))
  memo.shut ??= start.shut.map(contact => ({ ...contact }))
  for (const [index, float] of run.floatSwitches.entries())
    if (sees(run, robot, { x: float.definition.x, y: float.definition.y }, solids)) memo.floats[index] = { active: float.active }
  for (const [index, gauge] of (run.levelGauges ?? []).entries()) {
    const d = gauge.definition, y = d.y ?? d.low!.y
    if (sees(run, robot, { x: d.x, y }, solids)) memo.gauges[index] = { active: gauge.active, highActive: gauge.highActive }
  }
  for (const [index, contact] of (run.gateShut ?? []).entries()) {
    const gate = run.mechanisms[index]
    if (gate && sees(run, robot, { x: gate.x + gate.definition.w / 2, y: gate.y + gate.definition.h }, solids)) memo.shut[index] = { active: contact.active }
  }
  for (const [index, plate] of run.level.triggers.entries()) {
    const position = pressurePlatePosition(plate, run.mechanisms)
    if (sees(run, robot, { x: position.x + plate.w / 2, y: position.y }, solids)) memo.plates[index] = { active: run.triggers[index].active }
  }
}

/** Plates and buttons that would light the exit if pressed now, read from the ordinary wiring and the plates as the
 * bot last saw them. */
function exitSwitches(run: Run, memo: Belief) {
  if (memo.switchCache && run.activeTime - memo.switchCache.time < 1) return memo.switchCache.keys
  const keys = new Set<number>(), goal = run.level.goal, plates = memo.plates ?? run.triggers
  if (goal && goal.power === 'switched' && !memo.exitLit) {
    for (const [index, plate] of run.level.triggers.entries()) {
      if (plate.mode === 'coins' || plates[index].active) continue
      const behavior = plate.behavior ?? 'pressure', active = behavior === 'switch' ? !plate.startsOn : true
      const states = resolveSwitchStates(run.level, withTriggerActive(run.level, plates, index, active), memo.floats, undefined, memo.gauges, memo.shut)
      if (states.get(goal.id ?? '')) keys.add(index)
    }
  }
  memo.switchCache = { time: run.activeTime, keys }
  return keys
}

/** The exit's lamp and the plates as this bot believes them: as they began, changed only by what it has seen. */
export function believedSwitches(run: Run, robot: RobotState) {
  const memo = belief(robot)
  lookAround(run, robot, memo, solidsFor(run))
  return { exitLit: !!memo.exitLit, plates: memo.plates!, floats: memo.floats!, gauges: memo.gauges!, shut: memo.shut! }
}
/** The wiring's states as this bot believes them, with these plates. */
export function believedStates(run: Run, robot: RobotState, plates: readonly { active: boolean }[]) {
  const memo = belief(robot)
  return resolveSwitchStates(run.level, plates, memo.floats ?? run.floatSwitches, undefined, memo.gauges ?? run.levelGauges, memo.shut ?? run.gateShut)
}

/** What the player still has to do, as far as this bot knows. */
export function playerObjectives(run: Run, robot: RobotState): Objective[] {
  const memo = belief(robot), solids = solidsFor(run), heard = botLastHeard(robot)
  lookAround(run, robot, memo, solids)
  // A collected pickup is known gone once the bot can see its place, or heard it chime there.
  for (const [index, pickup] of run.pickups.entries()) {
    if (pickup.collectedAge === null || memo.known.has(index)) continue
    const d = pickup.definition
    if (sees(run, robot, d, solids) || heard?.kind === 'pickup' && Math.hypot(heard.x - d.x, heard.y - d.y) < 160) memo.known.add(index)
  }
  const coinPlates = run.level.triggers.some(plate => plate.mode === 'coins')
  // A level's own arithmetic, known to anyone who has read it: an exit switch asking for every coin on the level makes
  // each one a place the player must come to.
  const goalId = run.level.goal?.id, coins = run.pickups.filter(pickup => pickup.definition.kind === 'coin').length
  const everyCoin = !!goalId && coins > 0 && run.level.triggers.some(plate => plate.mode === 'coins' && !!plate.targets?.includes(goalId) && (plate.threshold ?? 0) >= coins)
  const objectives: Objective[] = []
  for (const [index, pickup] of run.pickups.entries()) {
    if (memo.known.has(index) || pickup.lostAge !== undefined) continue
    const d = pickup.definition, coin = d.kind === 'coin'
    if (d.kind === 'time-penalty') continue
    objectives.push({ key: `pickup:${index}`, kind: coin ? 'coin' : 'pickup', x: d.x, y: d.y + 20, value: coin ? coinPlates ? 4 : 2.5 : 1.5,
      ...coin && everyCoin ? { required: true } : {} })
  }
  for (const index of exitSwitches(run, memo)) {
    const plate = run.level.triggers[index], position = pressurePlatePosition(plate, run.mechanisms)
    objectives.push({ key: `switch:${index}`, kind: 'switch', x: position.x + plate.w / 2, y: position.y, value: 5 })
  }
  const goal = run.level.goal
  if (goal) objectives.push({ key: 'exit', kind: 'exit', x: goal.x, y: goal.y, value: memo.exitLit ? 9 : 3 })
  return objectives
}

/** The bot has looked here and the player was not: pass it over for a while. */
export function markChecked(run: Run, robot: RobotState, objective: Objective) {
  belief(robot).checked.set(objective.key, run.activeTime + (objective.kind === 'exit' ? EXIT_CHECKED_SECONDS : CHECKED_SECONDS))
}

/** Objectives in plain view with no player there count as checked, as a search rules out what it can see. */
export function checkVisibleObjectives(run: Run, robot: RobotState, objectives: readonly Objective[]) {
  const solids = solidsFor(run)
  for (const objective of objectives) if (Math.hypot(objective.x - robot.x, objective.y - robot.y) < 500 && sees(run, robot, objective, solids)) markChecked(run, robot, objective)
}

export function resetPrediction(robot: RobotState) { belief(robot).checked.clear() }

/**
 * Where to go to meet the player. From the clue (the last sighting or sound), the player's likely objectives are
 * weighed by their value, how far they are by route, and the way the player was heading. Along the route to each of
 * the likeliest, the first place the bot can reach before the player is the intercept; failing that, the objective
 * itself, where the player has to spend time.
 */
/**
 * A player seen in the air comes down somewhere: follow the arc to the first footing under it (a rough arc, with the
 * last velocity and no steering), and reason from there, as from when they land.
 */
export function landingOf(run: Run, clue: Clue): Clue {
  // Only an ordinary arc is followed: where gravity is changed at that spot (a gravity plate, but not water), leave it.
  const ordinary = Math.abs(gravityAtPoint(run.gravityField, clue.x, clue.y - 30) - TUNING.gravity) < 1 || !!waterAtPoint(run.gravityField, clue.x, clue.y - 30)
  // Nor is a player working up a wall (braced, or kicking off it, between two walls): they are climbing, and the
  // fall an arc predicts is the one thing they are not doing.
  if (!clue.airborne && Math.abs(clue.vy) < 60 || !ordinary || clue.walled) return clue
  let x = clue.x, y = clue.y, vy = clue.vy
  const vx = Math.max(-TUNING.runSpeed, Math.min(TUNING.runSpeed, clue.vx)), dt = 1 / 30
  for (let t = dt; t < 2.5; t += dt) {
    const nextY = y + vy * dt + TUNING.gravity * dt * dt / 2, nextX = Math.max(20, Math.min(run.level.width - 20, x + vx * dt))
    vy += TUNING.gravity * dt
    const ground = vy > 0 ? groundAt(run.terrain, nextX, nextY, Math.max(12, nextY - y + 2), surface => surface.y >= y - 2) : null
    if (ground) return { x: nextX, y: ground.y, vx, vy: 0, time: clue.time + t, airborne: false }
    x = nextX; y = nextY
    if (y > run.level.height + 200) break
  }
  return clue
}

/** A clue this old says little about the route: the player could be at any objective by now. */
const STALE_CLUE = 6
/** A player who reaches an objective spends about this long there (picking up, pressing, going through). */
const DWELL = 1.5
/** A current target is kept unless another is this much better, so the hunter does not dither between them. */
const KEEP = 1.3

export function predictPlayer(run: Run, robot: RobotState, sighting: Clue, seen: boolean, keep?: string): Prediction | undefined {
  const memo = belief(robot), clue = landingOf(run, sighting)
  // Going faster than anyone runs, they were thrown (a shot, a shove), not heading anywhere: they will be lying where
  // they come down for a moment, and the way they flew says nothing of where they mean to go.
  const thrown = !!sighting.thrown || Math.abs(sighting.vx) > TUNING.runSpeed * 1.15
  const elapsed = Math.max(0, run.activeTime - clue.time), speed = thrown ? 0 : Math.hypot(sighting.vx, sighting.vy)
  const stale = !seen && elapsed > STALE_CLUE
  // They may simply still be there: likely for a player who was standing still, less so the longer ago and the faster
  // they were going.
  const stay: Objective = { key: 'last', kind: 'last', x: clue.x, y: clue.y,
    value: (speed < 60 ? 7 : 2.5) * Math.exp(-elapsed / (speed < 60 ? 10 : 2.5)) }
  const objectives = [...playerObjectives(run, robot), ...seen ? [] : [stay]].filter(o => seen || (memo.checked.get(o.key) ?? -Infinity) < run.activeTime)
  if (!objectives.length) return undefined
  // The player's routes are the player's, at their own size: through crawlspaces and gaps too small for the bot.
  // Where the bot goes, and what it can come back from, is its own graph; the two meet by place.
  const player = botRouteTree(run, robot, clue), own = botOwnRouteTree(run, robot), nodes = player.graph.nodes, ownNodes = own.graph.nodes
  // Guessing, it goes only where it can come back from: a drop into a pit on a hunch would end the hunt. A player in
  // view is worth following anywhere.
  const back = seen ? undefined : botReturnable(run, robot, own)
  const k = own.graph.size, dry = (index: number) => !ownNodes[index].climb && !ownNodes[index].swim && !botWaterPoint(run, ownNodes[index], k)
    && (!back || back.has(index))
  const nearest = (point: { x: number; y: number }, costs: readonly number[], footing = false, reach = 160) => {
    let best = -1, bestCost = Infinity
    for (const [index, node] of (footing ? ownNodes : nodes).entries()) {
      if (node.climb || !Number.isFinite(costs[index]) || footing && !dry(index)) continue
      const gap = Math.hypot(node.x - point.x, node.y - point.y)
      if (gap > reach) continue
      const cost = costs[index] + gap * 1.5
      if (cost < bestCost) { best = index; bestCost = cost }
    }
    return { index: best, cost: bestCost }
  }
  const travelled = elapsed * PLAYER_ROUTE_PACE
  let best: Prediction | undefined, bestValue = 0
  for (const objective of objectives) {
    const end = nearest(objective, player.costs), goal = nearest(objective, own.costs, true)
    // An objective the bot cannot get near (down a crawlspace) can still be cut off on the player's way to it. One the
    // routes cannot get the player to (they crawl and wall jump where the graph does not go) is still somewhere they
    // may be going: odds by its value and the bot's own trip, as for an old clue.
    if (goal.index < 0 && (end.index < 0 || objective.kind === 'last')) continue
    const unknown = end.index < 0, endCost = unknown ? 750 : end.cost
    // Heading: a player running or climbing one way is going that way. A stale heading says nothing.
    const dx = objective.x - clue.x, dy = objective.y - clue.y
    let heading = 1
    if (!thrown && !stale && Math.abs(clue.vx) > 60 && Math.abs(dx) > 40) heading *= Math.sign(dx) === Math.sign(clue.vx) ? 1.6 : .55
    if (!thrown && !stale && Math.abs(clue.vy) > 150 && Math.abs(dy) > 60) heading *= Math.sign(dy) === Math.sign(clue.vy) ? 1.4 : .7
    // A pickup right where the player was is probably already theirs.
    const taken = (objective.kind === 'coin' || objective.kind === 'pickup') && Math.hypot(dx, dy) < 50 && elapsed > .5 ? .2 : 1
    // A stale clue is odds over the objectives, not a distance along a route to them.
    const weight = objective.value * heading * taken * Math.exp(-(stale || unknown ? Math.min(endCost, 750) : endCost) / 750)
    // A player who has had time to get there is there, not somewhere past it.
    const progress = Math.min(travelled, endCost + DWELL * PLAYER_ROUTE_PACE)
    let intercept: Prediction | undefined
    // Where they were last is not somewhere they are going, and a stale clue has no route left to cut. Nor does a
    // player seen on a wall: the routes have no wall jumps, so the way they will come out is not on them.
    if (objective.kind !== 'last' && !stale && !sighting.walled && !unknown) {
      const path = [end.index]
      while (player.previous[path[0]] >= 0) path.unshift(player.previous[path[0]])
      for (const index of path) {
        const ahead = player.costs[index] - progress
        if (ahead < 0 || nodes[index].climb || nodes[index].swim) continue
        // The bot waits for them on its own footing beside their way: it does not swim out to meet them, nor wait
        // where it cannot stand (a crawlspace the player passes through).
        const wait = nearest(nodes[index], own.costs, true, 50 * k)
        if (wait.index < 0) continue
        const playerTime = ahead / PLAYER_ROUTE_PACE, botTime = own.costs[wait.index] / BOT_ROUTE_PACE
        if (botTime <= playerTime + .5) { intercept = { kind: 'intercept', x: ownNodes[wait.index].x, y: ownNodes[wait.index].y, objective, playerTime, botTime }; break }
      }
    }
    if (!intercept && goal.index < 0) continue
    // Where they were last is a standing spot itself: go to it, not the nearest route point.
    const spot = objective.kind === 'last' ? objective : ownNodes[goal.index]
    const choice: Prediction = intercept ?? { kind: 'objective', x: spot.x, y: spot.y, objective,
      playerTime: Math.max(0, endCost - progress) / PLAYER_ROUTE_PACE, botTime: goal.cost / BOT_ROUTE_PACE }
    // Meeting the player on the way beats arriving after them; a long trip for the bot counts against a place, and
    // the current target is kept unless another is clearly better.
    const value = weight * (intercept ? 1.5 : 1) / (1 + choice.botTime / 4) * (objective.key === keep ? KEEP : 1)
    if (value > bestValue) { best = choice; bestValue = value }
  }
  return best
}

export const predictionTarget = (prediction: Prediction): Vec => [prediction.x, prediction.y]
