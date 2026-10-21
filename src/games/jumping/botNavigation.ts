import type { Run, RobotState } from './challenge.ts'
import { NEUTRAL_INPUT, TUNING } from './model.ts'
import type { JumpInput, Player, Platform } from './model.ts'
import { bodyIntersects } from './geometry.ts'
import { groundAt, platformSurfaces } from './terrain.ts'
import { canGrip } from './friction.ts'
import { ballShape, boxShape } from './propGeometry.ts'
import { forceFieldPlatforms } from './forceField.ts'
import { robotPlatforms } from './robotPhysics.ts'
import { ledgeExposed, platformLedges } from './terrainLedges.ts'
import { botRopeApproach } from './botRopeApproach.ts'
import { BOT_AIR_SPEED, BOT_AIR_SPEED_SCALE, botJumpReach, botJumpTakeoffSpeed } from './botMovementTuning.ts'
import { ladderLanding } from './ladderGeometry.ts'

type Node = { x: number; y: number; climb?: string }
type Edge = { to: number; jump: boolean; climb: boolean; cost: number; strength?: number; takeoff?: Node }
interface Graph { nodes: Node[]; edges: Edge[][]; solids: readonly Platform[] }
interface Navigation { path: number[]; age: number; jumpCooldown: number; goal: Node; previousX: number; stuck: number; patrol: number; avoided: Map<number, number>; trying: boolean;
  previousY?: number; pinned?: number; backoff?: { side: number; time: number; jump: boolean };
  entranceChecked: boolean;
  runup?: Node & { side: number };
  progress: number; distances: Map<number, number>;
  leg?: Edge;
  runningJump?: boolean;
  descendingJump?: boolean;
  departureY?: number;
  ropeDescent?: { index: number; distance: number; blocked: number };
  ladderBlocked?: { index: number; distance: number; blocked: number };
  flight?: { to: Node; catchX?: number; reach?: number; side: number };
  transition?: { key: string; x: number; y: number; progress: number; blocked: number; releasing: boolean } }
const graphs = new WeakMap<Run, Graph>(), navigation = new WeakMap<RobotState, Navigation>()
const distance = (a: Node, b: Node) => Math.hypot(a.x - b.x, a.y - b.y)
const jumpRise = TUNING.directedJumpSpeed ** 2 / (2 * TUNING.gravity)
// The controller can catch while the feet are up to 90 units below the lip.
// Keep the ordinary margin, using more of that real window for near-apex grips.
const catchReachFor = (dy: number) => dy < -(jumpRise + TUNING.hangReach - 20) ? TUNING.hangReach + 10 : TUNING.hangReach - 20
function jumpFlight(from: Node, to: Node, strength: number, catchReach = 0) {
  const speed = TUNING.jumpSpeed + (TUNING.directedJumpSpeed - TUNING.jumpSpeed) * strength
  const discriminant = speed ** 2 + 2 * TUNING.gravity * (to.y - from.y + catchReach)
  return discriminant < 0 ? 0 : (speed + Math.sqrt(discriminant)) / TUNING.gravity
}
function jumpDestination(graph: Graph, from: Node, to: Node) {
  const side = Math.sign(to.x - from.x)
  const lip = to.y < from.y - 190 ? graph.solids.flatMap(platformLedges).find(ledge => ledge.side === side
    && Math.abs(ledge.edgeY - to.y) < 3 && (to.x - ledge.edgeX) * side >= 0 && (to.x - ledge.edgeX) * side < 60
    && ledgeExposed(graph.solids, ledge)) : undefined
  return { to, side, ...(lip ? { catchX: lip.edgeX - side * 20,
    reach: Math.max(TUNING.hangReach, catchReachFor(to.y - from.y)) } : {}) }
}
export const botRouteProgress = (robot: RobotState) => navigation.get(robot)?.progress ?? 0
export function botNavigationRoute(run: Run, robot: RobotState) {
  const state = navigation.get(robot), graph = botNavigationGraph(run)
  return state && { goal: { ...state.goal }, waypoints: state.path.map(index => ({ ...graph.nodes[index] })) }
}
const barriersFor = (run: Run): Platform[] => [...forceFieldPlatforms(run.forceFields, 'objects'),
  ...run.mechanisms.map(m => ({ ...m.definition, x: m.x, y: m.y }))]

function edgeClear(a: Node, b: Node, edge: Edge, barriers: readonly Platform[]) {
  if (!barriers.length) return true
  a = edge.takeoff ?? a
  const dy = b.y - a.y, catching = edge.jump && dy < -190
  const speed = TUNING.jumpSpeed + (TUNING.directedJumpSpeed - TUNING.jumpSpeed) * (edge.strength ?? 1)
  const flight = edge.jump ? (speed + Math.sqrt(speed ** 2 + 2 * TUNING.gravity * (dy + (catching ? catchReachFor(dy) : 0)))) / TUNING.gravity : 0
  for (let step = 0; step <= 16; step++) {
    const fraction = step / 16, t = flight * fraction
    const x = a.x + (b.x - (catching ? Math.sign(b.x - a.x) * 32 : 0) - a.x) * fraction
    const y = edge.jump ? a.y - speed * t + TUNING.gravity * t * t / 2 : a.y + dy * fraction
    if (barriers.some(s => bodyIntersects(x, y - .05, s, TUNING.height))) return false
  }
  return true
}

function walkClear(a: Node, b: Node, solids: readonly Platform[]) {
  if (Math.abs(b.x - a.x) > 180 || Math.abs(b.y - a.y) > 45) return false
  for (let step = 1; step <= 9; step++) {
    const t = step / 9, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t
    const support = groundAt(solids, x, y, 12)
    // Follow the actual surface around shallow corners. A chord between
    // samples can run inside a convex crest even though walking clears it.
    if (!support || !canGrip(support.angle) || solids.some(s => bodyIntersects(x, support.y - .05, s, TUNING.height))) return false
  }
  return true
}

/** A bounded shared graph suggests controls; the real player controller decides
 * every contact and landing. Moving obstacles never become teleport routes. */
export function botNavigationGraph(run: Run): Graph {
  const saved = graphs.get(run)
  if (saved) return saved
  const nodes: Node[] = [], solids = run.terrain
  const clear = (x: number, y: number) => !solids.some(s => bodyIntersects(x, y - .05, s, TUNING.height))
  const lips = solids.flatMap(platformLedges).filter(ledge => ledgeExposed(solids, ledge))
  const add = (node: Node) => {
    if (nodes.length < 160 && node.x >= 20 && node.x <= run.level.width - 20 && node.y >= TUNING.height
      && !nodes.some(n => distance(n, node) < 12 && n.climb === node.climb)) nodes.push(node)
  }
  for (const solid of solids) {
    const left = Math.max(20, solid.x + 18), right = Math.min(run.level.width - 20, solid.x + solid.w - 18)
    if (right < left) continue
    const samples = Math.max(1, Math.ceil((right - left) / 140))
    for (let sample = 0; sample <= samples; sample++) {
      const x = left + (right - left) * sample / samples
      for (const surface of platformSurfaces(solid, x)) if (surface.y <= run.level.floor && canGrip(surface.angle) && clear(x, surface.y)) add({ x, y: surface.y })
    }
  }
  for (const [i, ladder] of run.level.climbables.ladders.entries()) {
    const landing = ladderLanding(ladder, solids)
    add({ x: ladder.x, y: ladder.bottom, climb: `ladder:${i}` })
    add({ x: ladder.x, y: (landing?.y ?? ladder.top) + 35, climb: `ladder:${i}` })
    // Each clear floor crossing is a boarding/exit point. The vertical leg
    // belongs to the ladder and may pass through any intervening terrain.
    for (const solid of solids) for (const surface of platformSurfaces(solid, ladder.x)) {
      if (ladder.x < solid.x || ladder.x > solid.x + solid.w || surface.y < (landing?.y ?? ladder.top)
        || surface.y > ladder.bottom || !canGrip(surface.angle) || !clear(ladder.x, surface.y)) continue
      add({ x: ladder.x, y: surface.y })
      add({ x: ladder.x, y: surface.y, climb: `ladder:${i}` })
    }
  }
  for (const [i, rope] of run.level.climbables.ropes.entries()) {
    // Nodes describe feet, while a rope is caught at the hands. A dangling end
    // can be reached with the body below it, including the final Aloft gap.
    add({ x: rope.x, y: rope.y + rope.length, climb: `rope:${i}` })
    add({ x: rope.x, y: Math.min(run.level.floor, rope.y + rope.length + 50), climb: `rope:${i}` })
    add({ x: rope.x, y: rope.y + 70, climb: `rope:${i}` })
    for (const lip of lips) if (Math.abs(lip.edgeX - rope.x) < 32 && lip.edgeY > rope.y
      && lip.edgeY + 70 < rope.y + rope.length) add({ x: rope.x, y: lip.edgeY + 70, climb: `rope:${i}` })
  }
  const edges = nodes.map((): Edge[] => [])
  for (const [i, a] of nodes.entries()) for (const [j, b] of nodes.entries()) {
    if (i === j) continue
    const dx = Math.abs(b.x - a.x), dy = b.y - a.y
    if (a.climb && a.climb === b.climb) { edges[i].push({ to: j, climb: true, jump: false, cost: Math.abs(dy) * 2 }); continue }
    if ((a.climb?.startsWith('ladder:') && !b.climb || b.climb?.startsWith('ladder:') && !a.climb)
      && Math.abs(dy) < 1 && walkClear(a, b, solids)) {
      edges[i].push({ to: j, climb: true, jump: false, cost: distance(a, b) + 15 }); continue
    }
    // A climb ends with a hand-to-ledge transfer, not a standing-body jump
    // through the underside of its supporting platform. Match an exposed lip;
    // the ordinary controller still performs and checks the actual pull-up.
    if (a.climb && !b.climb && dy < -15 && dy > -110 && dx < 60 && clear(b.x, b.y)
      && lips.some(lip => Math.abs(lip.edgeX - a.x) < 32 && Math.abs(lip.edgeY - b.y) < 3
        && (b.x - lip.edgeX) * lip.side >= 10 && (b.x - lip.edgeX) * lip.side < 60)) {
      edges[i].push({ to: j, jump: false, climb: true, cost: distance(a, b) + 80 }); continue
    }
    // The same exposed lip also permits the ordinary lowering animation onto
    // its rope. An ascending-only graph makes a hunter see the room as a trap
    // even when the doorway and a usable rope exit are open.
    if (!a.climb && b.climb && dy > 15 && dy < 110 && dx < 60 && clear(a.x, a.y)
      && lips.some(lip => Math.abs(lip.edgeX - b.x) < 32 && Math.abs(lip.edgeY - a.y) < 3
        && (a.x - lip.edgeX) * lip.side >= 10 && (a.x - lip.edgeX) * lip.side < 60)) {
      edges[i].push({ to: j, jump: false, climb: true, cost: distance(a, b) + 80 }); continue
    }
    const catchReach = catchReachFor(dy)
    const ropeTarget = b.climb?.startsWith('rope:')
    if (dx > (ropeTarget || a.climb?.startsWith('rope:') ? 500 * BOT_AIR_SPEED_SCALE : 360) || dy < -(jumpRise + catchReach) || dy > 450) continue
    const side = Math.sign(b.x - a.x)
    const launchLip = ropeTarget && !a.climb && dx > 320 ? lips.find(lip => lip.side === -side && Math.abs(lip.edgeY - a.y) < 3
      && (lip.edgeX - a.x) * side >= 0 && (lip.edgeX - a.x) * side < 30) : undefined
    const takeoff = launchLip ? { x: launchLip.edgeX, y: launchLip.edgeY } : undefined
    const walk = walkClear(a, b, solids)
    let strength: number | undefined
    if (!walk) {
      const catching = dy < -190, landingY = dy + (catching ? catchReach : 0)
      for (const candidate of [0, .5, 1]) {
        const speed = TUNING.jumpSpeed + (TUNING.directedJumpSpeed - TUNING.jumpSpeed) * candidate
        const discriminant = speed ** 2 + 2 * TUNING.gravity * landingY
        if (discriminant < 0) continue
        const flight = (speed + Math.sqrt(discriminant)) / TUNING.gravity
        const travel = dx - (takeoff ? distance(a, takeoff) : 0) - (ropeTarget ? 35 : 0)
        if (travel > botJumpReach(flight) * (ropeTarget ? .98 : .85) || dx < 20 && !a.climb && !b.climb) continue
        let blocked = false
        for (let step = 1; step < 16; step++) {
          const t = flight * step / 16
          const start = takeoff ?? a, catchX = b.x - side * (catching ? 32 : ropeTarget ? 20 : 0)
          if (!clear(start.x + (catchX - start.x) * step / 16, start.y - speed * t + TUNING.gravity * t * t / 2)) { blocked = true; break }
        }
        if (!blocked) { strength = candidate; break }
      }
      if (strength === undefined) continue
    }
    edges[i].push({ to: j, jump: !walk, climb: false, cost: distance(a, b) + (walk ? 0 : 140), ...(strength === undefined ? {} : { strength }), ...(takeoff ? { takeoff } : {}) })
  }
  const graph = { nodes, edges, solids }; graphs.set(run, graph); return graph
}

const closestNode = (graph: Graph, point: Node, left: number, right: number) => graph.nodes.reduce((best, node, index) =>
  node.x >= left && node.x <= right && distance(node, point) < distance(graph.nodes[best], point) ? index : best, 0)

function routeTree(graph: Graph, actor: Player, left: number, right: number, avoided: ReadonlyMap<number, number>, barriers: readonly Platform[], target = -1) {
  const costs = graph.nodes.map(() => Infinity), previous = graph.nodes.map(() => -1), visited = new Set<number>()
  // Plan from the actual position, with several directly reachable roots. A
  // nearest-node reset used to pull the bot backward each time it replanned.
  const climb = actor.climbing && `${actor.climbing.kind}:${actor.climbing.index}`
  const solids = barriers.length ? [...graph.solids, ...barriers] : graph.solids
  for (const [i, node] of graph.nodes.entries()) if (!avoided.has(i) && (climb ? node.climb === climb
    && edgeClear(actor, node, { to: i, jump: false, climb: true, cost: 0 }, barriers) : walkClear(actor, node, solids))) costs[i] = distance(actor, node)
  if (graph.nodes.length && !costs.some(Number.isFinite)) costs[closestNode(graph, actor, left, right)] = 0
  for (let pass = 0; pass < graph.nodes.length; pass++) {
    let next = -1
    for (let i = 0; i < costs.length; i++) if (!visited.has(i) && (next < 0 || costs[i] < costs[next])) next = i
    if (next < 0 || !Number.isFinite(costs[next]) || next === target) break
    visited.add(next)
    for (const edge of graph.edges[next]) {
      const node = graph.nodes[edge.to]
      if (avoided.has(edge.to) || node.x < left || node.x > right || costs[next] + edge.cost >= costs[edge.to]
        || !edgeClear(graph.nodes[next], node, edge, barriers)) continue
      costs[edge.to] = costs[next] + edge.cost; previous[edge.to] = next
    }
  }
  return { costs, previous }
}

function route(graph: Graph, actor: Player, goal: Node, left: number, right: number, avoided: ReadonlyMap<number, number> = new Map(), barriers: readonly Platform[] = []) {
  if (!graph.nodes.length) return []
  let target = closestNode(graph, goal, left, right)
  const { costs, previous } = routeTree(graph, actor, left, right, avoided, barriers, target)
  if (!Number.isFinite(costs[target])) {
    target = closestNode(graph, actor, left, right)
    if (!Number.isFinite(costs[target])) target = costs.findIndex(Number.isFinite)
    if (target < 0) return []
    for (const [i, node] of graph.nodes.entries()) if (Number.isFinite(costs[i]) && distance(node, goal) < distance(graph.nodes[target], goal)) target = i
  }
  const path = [target]
  while (previous[path[0]] >= 0) path.unshift(previous[path[0]])
  return path
}

/** One graph search supplies actual route costs for every place worth checking. */
export function botSearchPlaces(run: Run, robot: RobotState) {
  const graph = botNavigationGraph(run), state = navigation.get(robot)
  const { costs } = routeTree(graph, robot.actor!, 20, run.level.width - 20, state?.avoided ?? new Map(), barriersFor(run))
  return graph.nodes.flatMap((node, index) => !node.climb && Number.isFinite(costs[index]) ? [{ ...node, cost: costs[index] }] : [])
}

export function botMovement(run: Run, robot: RobotState, dt: number, target?: Node): JumpInput {
  const actor = robot.actor!, graph = botNavigationGraph(run), left = 20, right = run.level.width - 20, barriers = barriersFor(run)
  const walkingSolids = barriers.length ? [...graph.solids, ...barriers] : graph.solids
  let state = navigation.get(robot)
  if (!state) { state = { path: [], age: 1, jumpCooldown: 0, goal: { x: actor.x, y: actor.y }, previousX: actor.x, stuck: 0, patrol: 0, avoided: new Map(), trying: false,
    entranceChecked: false, progress: 0, distances: new Map() }; navigation.set(robot, state) }
  if (actor.grounded) state.departureY = actor.y
  if (actor.grounded || actor.climbing) state.descendingJump = false
  state.age += dt; state.jumpCooldown = Math.max(0, state.jumpCooldown - dt)
  if (actor.grounded || actor.climbing || actor.hang || actor.mantle) { state.runningJump = false; state.flight = undefined }
  const transfer = actor.mantle ?? actor.hang
  if (transfer) {
    if (actor.mantle?.ladder) {
      const descending = !!target && target.y > actor.mantle.edgeY + 110
      return { ...NEUTRAL_INPUT, climb: !descending, descend: descending }
    }
    const key = `${transfer.edgeX}:${transfer.edgeY}:${transfer.side}`, progress = actor.mantle?.time ?? 0
    const old = state.transition
    const blocked = old?.key === key && Math.hypot(actor.x - old.x, actor.y - old.y) < .05 && Math.abs(progress - old.progress) < .001 ? old.blocked + dt : 0
    const releasing = !!old?.releasing || blocked > 1.5
    state.transition = { key, x: actor.x, y: actor.y, progress, blocked, releasing }
    if (releasing && state.path.length) state.avoided.set(state.path[0], 5)
    const landing = state.path.map(index => graph.nodes[index]).find(node => !node.climb)
    const descendingRoute = !!landing && landing.y > (state.departureY ?? transfer.edgeY) + 110 && landing.y > transfer.edgeY + 110
      && !actor.hang?.caught.climbing && (!target || target.y > transfer.edgeY + 300)
      && graph.solids.some(platform => platform.h <= 30 && transfer.edgeX >= platform.x - 1
        && transfer.edgeX <= platform.x + platform.w + 1 && Math.abs(platform.y - transfer.edgeY) < 31)
    if (actor.mantle?.step && descendingRoute) {
      return { ...NEUTRAL_INPUT, move: -transfer.side * .7, descend: true, detach: true }
    }
    const dropping = !!actor.hang && (!!state.descendingJump || descendingRoute)
    const descending = !!actor.mantle?.descending || dropping
    // Finish the accepted climb before accepting another waypoint. Reversing
    // move midway used to repeatedly cancel the ordinary step-up animation.
    // Lowering keeps Down until the ordinary ladder/rope handoff completes;
    // a caught ledge on a downward route can release without climbing back up.
    return { ...NEUTRAL_INPUT, move: descending ? 0 : transfer.side * (releasing ? -.7 : .7),
      climb: !releasing && !descending, descend: releasing || descending, detach: releasing || dropping }
  }
  if (state.transition) { state.transition = undefined; state.path = []; state.leg = undefined; state.age = 1 }
  // A rounded prop against a wall can hold the swept body without providing
  // standing footing. Back out with normal movement, then try the route again;
  // waiting for grounded stuck detection here leaves the bot suspended forever.
  const pinned = state.trying && !actor.grounded && !actor.climbing
    && Math.hypot(actor.x - state.previousX, actor.y - (state.previousY ?? actor.y)) < 1
  state.pinned = pinned ? (state.pinned ?? 0) + dt : 0
  state.previousY = actor.y
  if (state.pinned > .5 && !state.backoff) {
    state.backoff = { side: -actor.facing, time: .8, jump: true }
    state.runningJump = false; state.flight = undefined
  }
  if (state.backoff) {
    state.backoff.time -= dt; state.previousX = actor.x; state.pinned = 0
    if (!actor.grounded && !actor.climbing && state.backoff.time > 0) {
      const jump = state.backoff.jump; state.backoff.jump = false
      return { ...NEUTRAL_INPUT, move: state.backoff.side * .8, jump, jumpStrength: 1, climb: true }
    }
    state.backoff = undefined; state.path = []; state.leg = undefined; state.age = 1
  }
  if (state.trying && Math.abs(actor.x - state.previousX) < .05 && actor.grounded) state.stuck += dt; else state.stuck = 0
  state.previousX = actor.x
  for (const [node, time] of state.avoided) if (time <= dt) state.avoided.delete(node); else state.avoided.set(node, time - dt)
  if (state.stuck > 1.5 && state.path.length) {
    state.avoided.set(state.path[0], 5); state.path = []; state.age = 1; state.stuck = 0
  }
  // Checking the entrance must finish on its floor, facing the actual doorway.
  // Otherwise a final ladder node can count as arrival before the rider gets off.
  const checkingEntrance = state.goal.x === run.level.entrance.x && state.goal.y === run.level.entrance.y
  const patrolArrived = checkingEntrance ? actor.grounded && distance(actor, state.goal) < 12
    : distance(actor, state.goal) < 45 || state.path.length === 1 && distance(actor, graph.nodes[state.path[0]]) < 45
  if (!target && (patrolArrived || !state.path.length && state.age > 2)) {
    // The entrance is known map information, independent of any player sighting.
    // Check it before a general patrol; sight acquisition can interrupt this trip.
    // A closed door can temporarily block the destination. Still approach the
    // nearest reachable point instead of abandoning the entrance immediately.
    const entrance = !state.entranceChecked && distance(actor, run.level.entrance) > 60
      && botCanReach(run, robot, run.level.entrance, []) ? run.level.entrance : undefined
    state.entranceChecked = true
    const candidates = graph.nodes.filter(n => n.x >= left && n.x <= right && !n.climb)
    const phase = state.patrol % 3
    candidates.sort((a, b) => phase === 0 ? a.y - b.y || distance(a, actor) - distance(b, actor)
      : (phase === 2 ? a.x - b.x : b.x - a.x) || a.y - b.y)
    state.goal = entrance ? { x: entrance.x, y: entrance.y } : candidates.find(n => {
      if (distance(n, actor) <= 60) return false
      const path = route(graph, actor, n, left, right, state.avoided, barriers)
      return path.length > 1 && graph.nodes[path.at(-1)!] === n
    })
      ?? { x: actor.x < (left + right) / 2 ? right : left, y: actor.y }
    if (!entrance) state.patrol++
    state.age = 1; state.path = []; state.distances.clear()
  }
  const changedGoal = !!target && distance(target, state.goal) > 60
  if ((state.age >= .35 && (changedGoal || !state.path.length) || state.age >= 1.5) && (actor.grounded || actor.climbing || !state.path.length)) {
    if (changedGoal) state.distances.clear()
    state.goal = target ?? state.goal; state.path = route(graph, actor, state.goal, left, right, state.avoided, barriers); state.leg = undefined; state.age = 0
  }
  const launchEdge = state.path.length > 1 && graph.edges[state.path[0]].find(edge => edge.to === state!.path[1])
  if (actor.grounded && launchEdge && launchEdge.takeoff && !state.runup) {
    const lip = launchEdge.takeoff, to = graph.nodes[launchEdge.to], side = Math.sign(to.x - lip.x)
    const time = jumpFlight(lip, to, launchEdge.strength ?? 1)
    const required = botJumpTakeoffSpeed(Math.max(0, Math.abs(to.x - lip.x) - 35), time) + 20
    const room = Math.max(0, (lip.x - actor.x) * side - 12)
    const available = Math.sqrt(Math.max(0, actor.vx * side) ** 2 + 2 * TUNING.acceleration * room)
    if (Math.abs(actor.y - lip.y) < 3 && required > available) {
      const point = [100, 80, 60].map(back => ({ x: lip.x - side * back, y: lip.y, side }))
        .find(point => walkClear(actor, point, [...graph.solids, ...barriers]))
      if (point) state.runup = point
    }
  }
  if (state.runup) {
    const point = state.runup
    if (!actor.grounded || changedGoal) state.runup = undefined
    else if ((actor.x - point.x) * point.side > 4) return { ...NEUTRAL_INPUT, move: -point.side }
    else { state.runup = undefined; return { ...NEUTRAL_INPUT, move: point.side } }
  }
  while (state.path.length > 1) {
    const node = graph.nodes[state.path[0]]
    const next = graph.nodes[state.path[1]]
    const departure = graph.edges[state.path[0]].find(edge => edge.to === state!.path[1])
    const approach = departure?.takeoff ?? node
    const advance = () => { const from = state.path.shift()!; state.leg = graph.edges[from].find(edge => edge.to === state!.path[0]) }
    if (actor.climbing && node.climb === `${actor.climbing.kind}:${actor.climbing.index}` && next.climb === node.climb) { advance(); continue }
    const passing = !actor.grounded && !node.climb && actor.y < node.y - 30 && Math.abs(actor.x - node.x) < 45
      && (next.x - actor.x) * actor.vx > 0
    const launchApproach = actor.grounded && !node.climb && graph.edges[state.path[0]].some(edge => edge.to === state!.path[1] && edge.jump)
    if (!passing && (Math.abs(actor.x - approach.x) > (departure?.takeoff ? 4 : launchApproach ? 12 : 30) || Math.abs(actor.y - approach.y) > 50)) break
    advance()
  }
  let routeNode = graph.nodes[state.path[0]] ?? target ?? state.goal
  // Graph samples lead onto the destination surface. Finish the remaining
  // clear walk to the actual target instead of stopping at a coarse sample.
  const destination = target ?? state.goal
  if (state.path.length <= 1 && (!routeNode.climb || actor.grounded) && walkClear(actor, destination, walkingSolids)) routeNode = destination
  const departure = state.path.length > 1 && graph.edges[state.path[0]].find(edge => edge.to === state!.path[1])
  const waypoint = departure && departure.takeoff ? { ...routeNode, ...departure.takeoff } : routeNode
  const ropeApproach = botRopeApproach(run, actor, waypoint, barriers)
  const node = ropeApproach ?? waypoint
  const key = state.path[0] ?? -1, remaining = distance(actor, node), best = state.distances.get(key)
  if (best === undefined || remaining < best - 12) {
    if (best !== undefined) state.progress++
    state.distances.set(key, remaining)
  }
  const dx = node.x - actor.x, dy = node.y - actor.y
  const input: JumpInput = { ...NEUTRAL_INPUT, move: Math.abs(dx) > 9 ? Math.sign(dx) * (target ? 1 : .45) : 0 }
  const approachingJump = state.path.length > 1 && graph.edges[state.path[0]].find(edge => edge.to === state!.path[1] && edge.jump)
  if (actor.grounded && approachingJump && Math.abs(dx) > 9) {
    const landing = jumpDestination(graph, node, graph.nodes[approachingJump.to])
    const time = jumpFlight(node, landing.to, approachingJump.strength ?? 1, landing.reach ?? 0)
    // Arrive at takeoff with the speed this arc needs. A long descent needs a
    // run-up; a nearly vertical ledge catch needs room to brake before its lip.
    const speed = Math.min(TUNING.runSpeed, Math.abs((landing.catchX ?? landing.to.x) - node.x) / Math.max(.1, time))
    input.move = Math.sign(dx) * Math.max(.15, speed / TUNING.runSpeed)
  }
  else if (actor.grounded && Math.abs(dy) < 30) input.move *= Math.min(1, Math.abs(dx) / 85)
  state.trying = Math.abs(input.move) > .1
  if (actor.climbing || node.climb && Math.abs(dx) < 30) {
    const ladder = actor.climbing?.ladder || node.climb?.startsWith('ladder:')
    input.climb = dy < (ladder ? 0 : 10); input.descend = dy > (ladder ? 0 : 20)
    if (actor.climbing) input.move = actor.climbing.rope ? Math.sign(dx) * .5
      : !node.climb && Math.abs(dy) < 5 ? Math.sign(dx) * .6 : 0
    if (actor.climbing?.ladder && (input.climb || input.descend)) {
      const grip = actor.climbing, old = state.ladderBlocked
      const blocked = old?.index === grip.index && Math.abs(grip.distance - old.distance) < .05 ? old.blocked + dt : 0
      state.ladderBlocked = { index: grip.index, distance: grip.distance, blocked }
      // A person or prop can occupy the landing. Step off into clear air and
      // approach beside it, using the ordinary release and falling contacts.
      if (blocked > .6 && !walkingSolids.some(s => bodyIntersects(actor.x, actor.y, s, TUNING.height))) {
        state.ladderBlocked = undefined; state.path = []; state.leg = undefined; state.age = 1
        return { ...NEUTRAL_INPUT, move: Math.sign(dx) || actor.facing, detach: true }
      }
    } else state.ladderBlocked = undefined
    // Rope grip distance and the actor's feet use different origins. Near the
    // floor the next walking node can sit inside the vertical deadband: let go
    // through the ordinary controller instead of holding the last handhold.
    if (actor.climbing && !node.climb && dy >= -10 && groundAt(run.terrain, actor.x, actor.y, actor.climbing.ladder ? 5 : 90)
      && (!actor.climbing.ladder || !walkingSolids.some(s => bodyIntersects(actor.x, actor.y, s, TUNING.height)))) {
      input.climb = false; input.descend = true; input.detach = true
    }
    if (actor.climbing?.rope && node.climb && dy > 20 && input.descend && Math.abs(dx) < 60) {
      // Keep the body outside the decks beside an end rope while lowering.
      // Steering toward its anchor can pin the rider against the next shelf.
      const clear = (side: number) => !walkingSolids.some(s => bodyIntersects(actor.x + side * 30, actor.y + 30, s, TUNING.height))
      const leftClear = clear(-1), rightClear = clear(1)
      if (leftClear !== rightClear) input.move = leftClear ? -.6 : .6
      const grip = actor.climbing, old = state.ropeDescent
      const blocked = old?.index === grip.index && Math.abs(grip.distance - old.distance) < .05 ? old.blocked + dt : 0
      state.ropeDescent = { index: grip.index, distance: grip.distance, blocked }
      if (blocked > .8) {
        // A shelf can block the rider even when the rope continues below it.
        // Let go to pass its end, then plan again from the real falling body.
        state.path = []; state.leg = undefined; state.age = 1; state.ropeDescent = undefined
        return { ...NEUTRAL_INPUT, move: (actor.x >= node.x ? 1 : -1) * .8, detach: true, descend: true }
      }
    }
    else state.ropeDescent = undefined
  }
  else { state.ropeDescent = undefined; state.ladderBlocked = undefined }
  const next = state.path.length > 1 ? graph.nodes[state.path[1]] : node
  const obstacles = [...run.props.filter(prop => !prop.gadget).map(prop => prop.kind === 'ball' ? ballShape(prop) : boxShape(prop)),
    ...run.robots.filter(other => other !== robot).flatMap(robotPlatforms)]
  const obstacle = obstacles.some(shape => {
    const gap = Math.sign(dx) > 0 ? shape.x - actor.x - TUNING.width / 2 : actor.x - TUNING.width / 2 - shape.x - shape.w
    return gap >= -2 && gap < 75 && shape.y < actor.y - 15 && shape.y + shape.h > actor.y - TUNING.height
  })
  const leavingClimb = actor.climbing && state.leg?.jump && node.climb !== `${actor.climbing.kind}:${actor.climbing.index}`
  const followingWalk = state.leg && !state.leg.jump && !state.leg.climb
    || !state.leg && actor.grounded && !node.climb && dy < -30 && walkClear(actor, node, walkingSolids)
  // A clear narrow opening needs a controlled step down. A jump overshoots
  // the hatch and lands back on its upper deck.
  const droppingThrough = actor.grounded && !obstacle && !actor.contacts?.support?.collider.prop && !node.climb && dy > 110 && Math.abs(dx) < 180
    && run.level.climbables.ladders.some(ladder => Math.abs(ladder.x - node.x) < 20 && ladder.top <= actor.y && ladder.bottom >= node.y - 30)
    && !groundAt(walkingSolids, node.x, actor.y, 12)
    && Array.from({ length: 9 }, (_, i) => actor.y + dy * (i + 1) / 9)
      .every(y => !walkingSolids.some(s => bodyIntersects(node.x, y - .05, s, TUNING.height)))
  const needJump = (state.leg?.jump || dy < -30 && !followingWalk || obstacle || state.stuck > .28 || !(departure && departure.takeoff)
    && dy < 30 && Math.abs(dx) > 20 && !groundAt(run.terrain, actor.x + Math.sign(dx) * 35, actor.y, 35))
    && !actor.climbing && !droppingThrough && !(node.climb?.startsWith('ladder:') && Math.abs(dx) < 25 && !state.leg?.jump)
  if (droppingThrough && !actor.climbing) {
    input.move = Math.abs(dx) < 6 ? 0 : Math.max(-.45, Math.min(.45, dx / 85))
    input.descend = true; input.climb = false; state.runningJump = false; state.descendingJump = true
  }
  const plannedFlight = state.leg?.jump && !obstacle ? jumpDestination(graph, actor, node) : undefined
  const flightTime = plannedFlight ? jumpFlight(actor, node, state.leg?.strength ?? 1, plannedFlight.reach ?? 0) : 0
  const takeoffSpeed = plannedFlight ? botJumpTakeoffSpeed(Math.abs((plannedFlight.catchX ?? node.x) - actor.x), flightTime) : 0
  const preparing = actor.grounded && needJump && plannedFlight && actor.vx * plannedFlight.side < takeoffSpeed - 15
    && groundAt(run.terrain, actor.x + plannedFlight.side * 12, actor.y, 12)
  if (preparing) input.move = plannedFlight.side * Math.min(1, Math.max(.2, (takeoffSpeed + 40) / TUNING.runSpeed))
  const canLaunch = actor.grounded || !!(state.leg?.takeoff && actor.coyote > 0)
  if ((canLaunch && needJump && !preparing || leavingClimb) && !state.jumpCooldown) {
    input.jump = true; input.jumpStrength = obstacle ? 1 : state.leg?.strength ?? 1
    if (plannedFlight) state.flight = plannedFlight
    state.jumpCooldown = .55; state.leg = undefined
    input.climb = false; input.descend = false; input.detach = false
    state.runningJump = !!leavingClimb || dy >= -30 && !obstacle
    state.descendingJump = dy > 110 && !obstacle
    if (state.runningJump) input.move = Math.sign(dx)
  }
  if (state.runningJump && !actor.climbing && Math.abs(dx) > 9) input.move = Math.sign(dx)
  if (state.flight?.catchX !== undefined && !actor.climbing) {
    const flight = state.flight, catchX = flight.catchX!, speed = input.jump ? -(TUNING.jumpSpeed + (TUNING.directedJumpSpeed - TUNING.jumpSpeed) * input.jumpStrength!) : actor.vy
    const discriminant = speed ** 2 + 2 * TUNING.gravity * (flight.to.y + (flight.reach ?? TUNING.hangReach) - actor.y)
    const time = discriminant >= 0 ? Math.max(.08, (-speed + Math.sqrt(discriminant)) / TUNING.gravity) : .08
    const velocity = ((catchX - actor.x) * flight.side > 0 ? (catchX - actor.x) / time : flight.side * 5)
    input.move = Math.max(-1, Math.min(1, velocity / BOT_AIR_SPEED))
  }
  if (ropeApproach) {
    input.descend = false; input.detach = false
    if (input.jump) input.jumpStrength = Math.max(input.jumpStrength ?? 0, ropeApproach.strength)
    else input.climb = true
    if (!actor.grounded) input.move = Math.max(-1, Math.min(1, dx / Math.max(.12, ropeApproach.time) / BOT_AIR_SPEED))
  }
  if (!actor.grounded && !actor.climbing) {
    const wanted = node.climb ?? next.climb
    const nearby = run.level.climbables.ladders.findIndex(ladder => Math.abs(actor.x - ladder.x) < 25
      && actor.y >= ladder.top && actor.y <= ladder.bottom + 5)
    // Up now catches ladders even during a held jump. Request that grip only
    // at the planned ladder, rather than catching an incidental one en route.
    // Ropes retain their automatic airborne catches without this Up request.
    if (nearby >= 0) input.climb = wanted === `ladder:${nearby}`
  }
  return input
}

export function botCanReach(run: Run, robot: RobotState, goal: Node, barriers: readonly Platform[] = barriersFor(run)) {
  const graph = botNavigationGraph(run), path = route(graph, robot.actor!, goal, 20, run.level.width - 20, undefined, barriers)
  const last = graph.nodes[path.at(-1) ?? -1]
  return !!last && (distance(last, goal) < 35 || walkClear(last, goal, [...graph.solids, ...barriers]))
}
