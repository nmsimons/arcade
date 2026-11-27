import type { Run, RobotState } from './challenge.ts'
import { NEUTRAL_INPUT, TUNING } from './model.ts'
import type { JumpInput, Player, Platform } from './model.ts'
import { bodyIntersects, moveBody, platformOutline } from './geometry.ts'
import { groundAt, platformSurfaces } from './terrain.ts'
import { canGrip, surfaceFriction, TERRAIN_FRICTION } from './friction.ts'
import { ropeGripLimit } from './climbables.ts'
import { ballShape, boxShape } from './propGeometry.ts'
import { forceFieldPlatforms } from './forceField.ts'
import { robotPlatforms } from './robotPhysics.ts'
import { ledgeExposed, platformLedges } from './terrainLedges.ts'
import { botRopeApproach } from './botRopeApproach.ts'
import { BOT_AIR_SPEED, BOT_AIR_SPEED_SCALE, botJumpReach, botJumpTakeoffSpeed } from './botMovementTuning.ts'
import { ladderLanding } from './ladderGeometry.ts'
import { botSwimClear, botWaterDetour, botWaterGraphKey, botWaterNodes, botWaterPoint, botWaterPosition, botWaterSurface, MAX_BOT_WATER_NODES } from './botWaterNavigation.ts'
import { isWeightless, playerSwimStrength } from './gravity.ts'
import { bodySize, sizedBodyOutline } from './sizeFrame.ts'
import { botFloatMovement, botFloating } from './botFloatNavigation.ts'

type Node = { x: number; y: number; climb?: string; swim?: boolean }
type Edge = { to: number; jump: boolean; climb: boolean; swim?: boolean; cost: number; strength?: number; takeoff?: Node; catchX?: number; catchReach?: number;
  // Walking off the footing's end at x, at this pace, and falling to the next footing, without a jump.
  drop?: { x: number; speed: number } }
interface Graph { nodes: Node[]; edges: Edge[][]; solids: readonly Platform[]; waterKey: string; size: number }
interface Navigation { path: number[]; age: number; jumpCooldown: number; goal: Node; previousX: number; stuck: number; patrol: number; avoided: Map<number, number>; trying: boolean;
  graph?: Graph;
  waterExit?: { node?: number; goal: Node; tries?: number; since?: number };
  waterDetour?: ReturnType<typeof botWaterDetour>;
  waterJumpHold?: number;
  shoreTarget?: { goal: Node; age: number };
  previousY?: number; pinned?: number; backoff?: { side: number; time: number; jump: boolean };
  // The way it last pressed to move: -1, 0 or 1.
  pressed?: number;
  entranceChecked: boolean;
  // The ladder it is on, the span of heights it has covered there, and since when.
  ladderStay?: { x: number; top: number; bottom: number; since: number };
  // Until when it is climbing back off a ladder it gave up on.
  ladderLeave?: number;
  // How many times each ladder has turned it back, blocked at the far end.
  ladderBacks?: Map<number, number>;
  // How long it has stood short of its target pressing nothing.
  idle?: number;
  // Ledges caught lately, by edge: how many times in a row, and when last.
  ledgeTries: Map<string, { count: number; time: number }>;
  runup?: Node & { side: number };
  progress: number; distances: Map<number, number>;
  leg?: Edge;
  launchFrom?: Node;
  launchSetup?: Node & { time: number };
  runningJump?: boolean;
  descendingJump?: boolean;
  departureY?: number;
  ropeDescent?: { index: number; distance: number; blocked: number };
  // Held at a rope's top below the ledge it is climbing to: how long, and how long to swing out before trying again.
  ropeTop?: { index: number; distance: number; held: number; swing: number };
  // The rope a planned leap just left and the height it left from, until the bot lands or takes hold of something.
  leftRope?: { index: number; y: number };
  ladderBlocked?: { index: number; distance: number; blocked: number };
  // Stuck wading with no dry route on: it is swimming out, until it is out of the water.
  wadingEscape?: boolean;
  flight?: { to: Node; catchX?: number; reach?: number; side: number; water?: boolean };
  transition?: { key: string; x: number; y: number; progress: number; blocked: number; releasing: boolean; reversals: number; backing: boolean } }
/** The steepest surface a corner's footing goes on, as an angle. */
const CORNER_FOOTING_SLOPE = 35 * Math.PI / 180
const MAX_BOT_NODES = 400
const graphs = new WeakMap<Run, Map<number, Graph>>(), navigation = new WeakMap<RobotState, Navigation>()
const distance = (a: Node, b: Node) => Math.hypot(a.x - b.x, a.y - b.y)
/*
 * A larger bot (sizeFrame.ts) plans with its own body, `k` times the player's: its clearance, hand reach,
 * step and catch geometry, and how high it rises are k times as large. repulsorBot.ts steers it at its
 * size's share, so its ground and air speeds stay the player's, and its accelerations, like its gravity
 * and jump speed, are k times the player's: a jump takes as long and rises k times as high.
 */
const jumpRise = TUNING.directedJumpSpeed ** 2 / (2 * TUNING.gravity)
/** Whether a body of size k standing at x, y is clear of every solid. */
const bodyClear = (solids: readonly Platform[], x: number, y: number, k: number) =>
  !solids.some(s => bodyIntersects(x, y, s, TUNING.height * k, 1, 0, k === 1 ? undefined : sizedBodyOutline(k)))
/** Where a jump puts the feet t seconds after leaving the ground: k times the player's rise. */
const jumpY = (fromY: number, speed: number, t: number, k: number) => fromY + k * (-speed * t + TUNING.gravity * t * t / 2)
const jumpSpeedFor = (strength: number) => TUNING.jumpSpeed + (TUNING.directedJumpSpeed - TUNING.jumpSpeed) * strength
// The controller can catch while the feet are up to 90 units below the lip.
// Keep the ordinary margin, using more of that real window for near-apex grips.
const catchReachFor = (dy: number, k: number) => k * (dy / k < -(jumpRise + TUNING.hangReach - 20) ? TUNING.hangReach + 10 : TUNING.hangReach - 20)
function jumpFlight(from: Node, to: Node, strength: number, catchReach = 0, k = 1) {
  const speed = jumpSpeedFor(strength)
  const discriminant = speed ** 2 + 2 * TUNING.gravity * (to.y - from.y + catchReach) / k
  return discriminant < 0 ? 0 : (speed + Math.sqrt(discriminant)) / TUNING.gravity
}
function jumpDestination(graph: Graph, from: Node, to: Node, edge?: Edge) {
  const side = Math.sign(to.x - from.x), k = graph.size
  if (edge?.catchX !== undefined) return { to, side, catchX: edge.catchX, reach: Math.max(TUNING.hangReach * k, edge.catchReach ?? 0) }
  const lip = to.y < from.y - 190 * k ? graph.solids.flatMap(platformLedges).find(ledge => ledge.side === side
    && Math.abs(ledge.edgeY - to.y) < 3 && (to.x - ledge.edgeX) * side >= 0 && (to.x - ledge.edgeX) * side < 60 * k
    && ledgeExposed(graph.solids, ledge)) : undefined
  return { to, side, ...(lip ? { catchX: lip.edgeX - side * 20 * k,
    reach: Math.max(TUNING.hangReach * k, catchReachFor(to.y - from.y, k)) } : {}) }
}
/**
 * Whether the bot is in the water as navigation sees it: wet, with its middle under the water. Shallow water a
 * larger bot (sizeFrame.ts) wades through is ground to it, as the graph's water points say, and so is the air
 * above it: jumping from the shallows, or holding a rope that hangs into them, it is not swimming. Counted as a
 * swimmer there, its way out was the floor beneath the rope, and it let go as soon as it took hold.
 */
export function botInWater(run: Run, actor: Player) {
  if (playerSwimStrength(run.gravityField, actor) <= .05) return false
  return botWaterPoint(run, botWaterPosition(actor), bodySize(actor))
}
export const botRouteProgress = (robot: RobotState) => navigation.get(robot)?.progress ?? 0
export const botEscapingWater = (robot: RobotState) => !!navigation.get(robot)?.waterExit
export function botNavigationRoute(run: Run, robot: RobotState) {
  const state = navigation.get(robot), graph = botNavigationGraph(run, bodySize(robot.actor!))
  return state && { goal: { ...state.goal }, waypoints: state.path.map(index => ({ ...graph.nodes[index] })) }
}
const barriersFor = (run: Run): Platform[] => [...forceFieldPlatforms(run.forceFields, 'objects'),
  ...run.mechanisms.map(m => ({ ...m.definition, x: m.x, y: m.y }))]

function edgeClear(a: Node, b: Node, edge: Edge, barriers: readonly Platform[], k: number) {
  if (!barriers.length) return true
  a = edge.takeoff ?? a
  const dy = b.y - a.y, catching = edge.jump && (edge.catchX !== undefined || dy < -190 * k)
  const speed = jumpSpeedFor(edge.strength ?? 1)
  const flight = edge.jump ? (speed + Math.sqrt(speed ** 2 + 2 * TUNING.gravity * (dy + (catching ? edge.catchReach ?? catchReachFor(dy, k) : 0)) / k)) / TUNING.gravity : 0
  for (let step = 0; step <= 16; step++) {
    const fraction = step / 16, t = flight * fraction
    const x = a.x + ((edge.catchX ?? b.x - (catching ? Math.sign(b.x - a.x) * 32 * k : 0)) - a.x) * fraction
    const y = edge.jump ? jumpY(a.y, speed, t, k) : a.y + dy * fraction
    if (!bodyClear(barriers, x, y - .05, k)) return false
  }
  return true
}

function walkClear(a: Node, b: Node, solids: readonly Platform[], k: number) {
  if (Math.abs(b.x - a.x) > 180 || Math.abs(b.y - a.y) > 45 * k) return false
  for (let step = 1; step <= 9; step++) {
    const t = step / 9, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t
    const support = groundAt(solids, x, y, 12 * k)
    // Follow the actual surface around shallow corners. A chord between
    // samples can run inside a convex crest even though walking clears it.
    if (!support || !canGrip(support.angle) || !bodyClear(solids, x, support.y - .05, k)) return false
  }
  return true
}

/**
 * A walk off the end of the footing down to lower footing, where even the smallest hop would rise into a low
 * ceiling. The body walks to where its footing ends and falls on at its pace, landing on footing it can stand on
 * and walk from to b. The slowest pace that does so is the drop.
 */
function dropArc(a: Node, b: Node, solids: readonly Platform[], k: number) {
  const side = Math.sign(b.x - a.x)
  if (!side || b.y - a.y <= 15 * k) return undefined
  let edge = a.x
  while ((b.x - edge) * side > 4 && groundAt(solids, edge + side * 4, a.y, 6 * k)) edge += side * 4
  // Footing all the way across is a walk, not a drop.
  if ((b.x - edge) * side <= 4) return undefined
  // The walk out follows the footing's surface.
  for (let step = 1; step <= 4; step++) {
    const x = a.x + (edge - a.x) * step / 4, support = groundAt(solids, x, a.y, 6 * k)
    if (!support || !bodyClear(solids, x, support.y - .05, k)) return undefined
  }
  // Past the end, the body slides off the corner until its side clears it, then falls.
  const leave = groundAt(solids, edge, a.y, 6 * k)!.y, clearOf = edge + side * (TUNING.width / 2 * k + 1)
  for (const speed of [TUNING.walkSpeed, 200, 300, TUNING.runSpeed]) {
    // In the world a larger body falls k times as fast (sizeFrame.ts).
    for (let t = 1 / 60; t < 1.5; t += 1 / 60) {
      const x = clearOf + side * speed * t, y = Math.min(b.y, leave + k * TUNING.gravity * t * t / 2)
      // Landing a little past b, on the same footing, is as good: it walks back. (Scaffold I's upper deck ends just
      // inside the floor below; its only way down lands a few units beyond that floor's end waypoint.)
      if ((x - b.x) * side > 60 * k) break
      if (y === b.y || !bodyClear(solids, x, y - .05, k)) {
        // It meets footing: one it can stand on, with a clear walk on to b, completes the drop.
        const footing = groundAt(solids, x, y, 12 * k)
        if (footing && canGrip(footing.angle) && walkClear({ x, y: footing.y }, b, solids, k)) return { x: edge, speed }
        break
      }
    }
  }
  return undefined
}

/** Check the actual launch, including momentum, rather than only its graph sample. */
function launchClear(actor: Player, strength: number, move: number, solids: readonly Platform[]) {
  let x = actor.x, y = actor.y, vx = actor.vx
  const orientation = actor.inverted ? -1 : 1, k = bodySize(actor)
  const speed = jumpSpeedFor(strength)
  const target = move * BOT_AIR_SPEED, dt = 1 / 120
  for (let frame = 1; frame * dt <= speed / TUNING.gravity; frame++) {
    vx += Math.max(-TUNING.airAcceleration * k * dt, Math.min(TUNING.airAcceleration * k * dt, target - vx))
    const nextY = actor.y + orientation * k * (-speed * frame * dt + TUNING.gravity * (frame * dt) ** 2 / 2)
    const sweep = moveBody([x, y], [x + vx * dt, nextY], solids, TUNING.height * k, orientation, 0, k === 1 ? undefined : sizedBodyOutline(k, TUNING.height, orientation))
    if (sweep.contacts.some(contact => contact.normal[1] * orientation > .5)) return false
    x = sweep.x; y = sweep.y
  }
  return true
}

/** A bounded shared graph suggests controls; the real player controller decides
 * every contact and landing. Moving obstacles never become teleport routes. */
export function botNavigationGraph(run: Run, k = 1): Graph {
  const sizes = graphs.get(run) ?? new Map<number, Graph>(), saved = sizes.get(k), waterKey = botWaterGraphKey(run)
  graphs.set(run, sizes)
  if (saved && saved.waterKey === waterKey) return saved
  const nodes: Node[] = [], solids = run.terrain
  // Footing just past an edge: the player's 18, until a larger body's half-width needs more.
  const inset = Math.max(18, 13 * k)
  const clear = (x: number, y: number) => bodyClear(solids, x, y - .05, k)
  const lips = solids.flatMap(platformLedges).filter(ledge => ledgeExposed(solids, ledge))
  // A bound on the graph's size (route searches are quadratic in it). It is generous: running out drops whatever
  // comes last, the ladders and ropes, and a cave as large as Spelunk III's had none on its map at 160.
  const add = (node: Node, limit = MAX_BOT_NODES) => {
    if (nodes.length < limit && node.x >= 20 && node.x <= run.level.width - 20 && node.y >= TUNING.height * k
      && !nodes.some(n => distance(n, node) < 12 * k && n.climb === node.climb)) nodes.push({ ...node, ...(botWaterPoint(run, node, k) && !node.climb ? { swim: true } : {}) })
  }
  for (const solid of solids) {
    const left = Math.max(20, solid.x + inset), right = Math.min(run.level.width - 20, solid.x + solid.w - inset)
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
    add({ x: ladder.x, y: (landing?.y ?? ladder.top) + 35 * k, climb: `ladder:${i}` })
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
    // Bots plan around ropes that hang from one anchor; a tied rope is not on their map.
    if (rope.end) continue
    // Nodes describe feet, while a rope is caught at the hands. A dangling end
    // can be reached with the body below it, including the final Aloft gap.
    add({ x: rope.x, y: rope.y + rope.length, climb: `rope:${i}` })
    add({ x: rope.x, y: Math.min(run.level.floor, rope.y + rope.length + 50 * k), climb: `rope:${i}` })
    add({ x: rope.x, y: rope.y + 70 * k, climb: `rope:${i}` })
    for (const lip of lips) if (Math.abs(lip.edgeX - rope.x) < 32 * k && lip.edgeY > rope.y
      && lip.edgeY + 70 * k < rope.y + rope.length) add({ x: rope.x, y: lip.edgeY + 70 * k, climb: `rope:${i}` })
  }
  // Uniform samples can miss the usable end of a broad, irregular mass. Add
  // actual exposed-lip footing after the existing climb nodes, preserving
  // their indices and the graph's bounded size. The same body-clearance and
  // jump checks still decide which connections are physically possible.
  for (const lip of lips) {
    const x = lip.edgeX + lip.side * inset, y = lip.edgeY + (lip.slope ?? 0) * inset
    const support = groundAt(solids, x, y, 5 * k, surface => canGrip(surface.angle))
    if (support && clear(x, support.y)) add({ x, y: support.y })
  }
  // A ground outline's corners (the foot of a steep rise in a slope, the top of it) are where a jump up it is taken
  // and landed. Samples every 140 can fall on the rise itself, where the body does not stand clear, and leave the
  // nearest footing too far back for any jump to clear the corner: the whole slope below it then looks like a pit.
  // Add footing either side of each sharp corner, where nothing stands near already.
  for (const solid of solids) {
    if (!solid.polygon) continue
    const points = platformOutline(solid)
    for (const [i, [vx, vy]] of points.entries()) {
      const before = points[(i + points.length - 1) % points.length], after = points[(i + 1) % points.length]
      // Only a bend in the walkable top of the outline (both edges are surfaces, as platformSurfaces counts them):
      // not the foot of a wall or an overhang, where footing tucked against the rock is a corner to get stuck in.
      if (!(vx - before[0] > 1e-7 && after[0] - vx > 1e-7)) continue
      const turn = Math.abs(Math.atan2(after[1] - vy, after[0] - vx) - Math.atan2(vy - before[1], vx - before[0]))
      if (Math.min(turn, Math.PI * 2 - turn) < .3) continue
      // Footing it can take off from, too: the sides of a narrow V (Ascent I's notch by its bottom ledge) grip a body
      // standing still but are too steep to walk to a takeoff on, and a route starting there jumped from the wrong side.
      for (const x of [vx - inset, vx + inset]) for (const surface of platformSurfaces(solid, x)) {
        if (Math.abs(surface.y - vy) > 60 * k || surface.y > run.level.floor || Math.abs(surface.angle) > CORNER_FOOTING_SLOPE || !clear(x, surface.y)
          || nodes.some(n => !n.climb && Math.hypot(n.x - x, n.y - surface.y) < 60 * k)) continue
        add({ x, y: surface.y })
      }
    }
  }
  // Keep the original surface/rope/ladder topology and its stable indices.
  // Large maps must not lose their final rope merely because they have a pool.
  for (const node of botWaterNodes(run, solids, k)) add(node, MAX_BOT_NODES + MAX_BOT_WATER_NODES)
  const edges = nodes.map((): Edge[] => [])
  for (const [i, a] of nodes.entries()) for (const [j, b] of nodes.entries()) {
    if (i === j) continue
    const dx = Math.abs(b.x - a.x), dy = b.y - a.y
    if (a.climb && a.climb === b.climb) { edges[i].push({ to: j, climb: true, jump: false, cost: Math.abs(dy) * 2 }); continue }
    if (a.swim && b.swim && botSwimClear(run, a, b, solids, k)) {
      edges[i].push({ to: j, climb: false, jump: false, swim: true, cost: distance(a, b) * TUNING.runSpeed / TUNING.swimHorizontalSpeed }); continue
    }
    // Submerged jumps cannot follow a dry ballistic arc. Surface waypoints
    // retain ordinary jump/ledge edges for leaving the pool.
    if (a.swim && b.swim || a.swim && run.water.pools.some(({ region: p }) => p.h > 0 && a.x >= p.x && a.x <= p.x + p.w && a.y > p.y + (TUNING.height + 15) * k)) continue
    if ((a.climb?.startsWith('ladder:') && !b.climb || b.climb?.startsWith('ladder:') && !a.climb)
      && Math.abs(dy) < 1 && walkClear(a, b, solids, k)) {
      edges[i].push({ to: j, climb: true, jump: false, cost: distance(a, b) + 15 }); continue
    }
    // A climb ends with a hand-to-ledge transfer, not a standing-body jump
    // through the underside of its supporting platform. Match an exposed lip;
    // the ordinary controller still performs and checks the actual pull-up.
    if (a.climb && !b.climb && dy < -15 * k && dy > -110 * k && dx < 60 * k && clear(b.x, b.y)
      && lips.some(lip => Math.abs(lip.edgeX - a.x) < 32 * k && Math.abs(lip.edgeY - b.y) < 3
        && (b.x - lip.edgeX) * lip.side >= 10 * k && (b.x - lip.edgeX) * lip.side < 60 * k)) {
      edges[i].push({ to: j, jump: false, climb: true, cost: distance(a, b) + 80 }); continue
    }
    // The same exposed lip also permits the ordinary lowering animation onto
    // its rope. An ascending-only graph makes a hunter see the room as a trap
    // even when the doorway and a usable rope exit are open.
    if (!a.climb && b.climb && dy > 15 * k && dy < 110 * k && dx < 60 * k && clear(a.x, a.y)
      && lips.some(lip => Math.abs(lip.edgeX - b.x) < 32 * k && Math.abs(lip.edgeY - a.y) < 3
        && (a.x - lip.edgeX) * lip.side >= 10 * k && (a.x - lip.edgeX) * lip.side < 60 * k)) {
      edges[i].push({ to: j, jump: false, climb: true, cost: distance(a, b) + 80 }); continue
    }
    const catchReach = catchReachFor(dy, k)
    const ropeTarget = b.climb?.startsWith('rope:')
    if (dx > (ropeTarget || a.climb?.startsWith('rope:') ? 500 * BOT_AIR_SPEED_SCALE : 360) || dy < -(jumpRise * k + catchReach) || dy > 450 * k) continue
    const side = Math.sign(b.x - a.x)
    // Even a modest rise can need a hand catch to cross beneath a ceiling.
    // Requiring a feet-first landing rejects usable low-arc jumps at cave lips.
    const landingLip = !b.climb && dy < -15 * k && dy >= -190 * k ? lips.find(lip => lip.side === side && Math.abs(lip.edgeY - b.y) < 3
      && (b.x - lip.edgeX) * side >= 0 && (b.x - lip.edgeX) * side < 60 * k) : undefined
    const landingX = landingLip ? landingLip.edgeX - side * 20 * k : undefined
    const launchLip = ropeTarget && !a.climb && dx > 320 ? lips.find(lip => lip.side === -side && Math.abs(lip.edgeY - a.y) < 3
      && (lip.edgeX - a.x) * side >= 0 && (lip.edgeX - a.x) * side < 30 * k) : undefined
    const takeoff = launchLip ? { x: launchLip.edgeX, y: launchLip.edgeY } : undefined
    const walk = walkClear(a, b, solids, k)
    let strength: number | undefined, catchX: number | undefined
    if (!walk) {
      // Prefer the established feet-first arc. Try a lower hand catch only
      // when that landing cannot be reached or its jump hits the ceiling.
      for (const handCatch of landingLip ? [false, true] : [false]) {
        // A rope waypoint already stands 50k below the grip it is caught by (see the rope nodes above): the arms
        // reach the rest of the way, and must not be counted twice.
        const catching = handCatch || dy < -190 * k, landingY = dy + (catching ? Math.max(0, catchReach - (ropeTarget ? 50 * k : 0)) : 0)
        for (const candidate of [0, .5, 1]) {
          const speed = jumpSpeedFor(candidate)
          const discriminant = speed ** 2 + 2 * TUNING.gravity * landingY / k
          if (discriminant < 0) continue
          const flight = (speed + Math.sqrt(discriminant)) / TUNING.gravity
          const travel = dx - (takeoff ? distance(a, takeoff) : 0) - (ropeTarget ? 35 * k : 0)
          if (travel > botJumpReach(flight, undefined, k) * (ropeTarget ? .98 : .85) || dx < 20 && !a.climb && !b.climb) continue
          let blocked = false
          for (let step = 1; step < 16; step++) {
            const t = flight * step / 16
            const start = takeoff ?? a, endX = handCatch ? landingX! : b.x - side * (catching ? 32 * k : ropeTarget ? 20 * k : 0)
            if (!clear(start.x + (endX - start.x) * step / 16, jumpY(start.y, speed, t, k))) { blocked = true; break }
          }
          if (!blocked) { strength = candidate; catchX = handCatch ? landingX : undefined; break }
        }
        if (strength !== undefined) break
      }
      if (strength === undefined) {
        // Under a low ceiling a hop rises into the rock; walking off the end drops beneath it.
        const drop = !a.climb && !b.climb && !a.swim && !b.swim ? dropArc(a, b, solids, k) : undefined
        if (drop) edges[i].push({ to: j, jump: false, climb: false, drop, cost: distance(a, b) + 60 })
        continue
      }
    }
    edges[i].push({ to: j, jump: !walk, climb: false, cost: distance(a, b) + (walk ? 0 : 140), ...(strength === undefined ? {} : { strength }), ...(takeoff ? { takeoff } : {}),
      ...(catchX !== undefined ? { catchX, catchReach } : {}) })
  }
  const graph = { nodes, edges, solids, waterKey, size: k }; sizes.set(k, graph); return graph
}

const closestNode = (graph: Graph, point: Node, left: number, right: number) => graph.nodes.reduce((best, node, index) =>
  node.x >= left && node.x <= right && distance(node, point) < distance(graph.nodes[best], point) ? index : best, 0)

/** The nodes with a route on to any of these, by the graph's own edges. */
function returnable(graph: Graph, to: readonly number[]) {
  const incoming = graph.nodes.map((): number[] => [])
  for (const [from, edges] of graph.edges.entries()) for (const edge of edges) incoming[edge.to].push(from)
  const found = new Set(to), queue = [...to]
  while (queue.length) for (const from of incoming[queue.pop()!]) if (!found.has(from)) { found.add(from); queue.push(from) }
  return found
}

function routeTree(run: Run, graph: Graph, actor: Player, left: number, right: number, avoided: ReadonlyMap<number, number>, barriers: readonly Platform[], target = -1, allowSwimming = true) {
  const costs = graph.nodes.map(() => Infinity), previous = graph.nodes.map(() => -1), visited = new Set<number>(), k = graph.size
  // Plan from the actual position, with several directly reachable roots. A
  // nearest-node reset used to pull the bot backward each time it replanned.
  const climb = actor.climbing && `${actor.climbing.kind}:${actor.climbing.index}`
  const solids = barriers.length ? [...graph.solids, ...barriers] : graph.solids
  for (const [i, node] of graph.nodes.entries()) if (!avoided.has(i) && (allowSwimming || !botWaterPoint(run, node, k)) && (climb ? node.climb === climb
    && edgeClear(actor, node, { to: i, jump: false, climb: true, cost: 0 }, barriers, k)
    : node.swim && botSwimClear(run, actor, node, solids, k) || walkClear(actor, node, solids, k))) costs[i] = distance(actor, node)
  if (graph.nodes.length && !costs.some(Number.isFinite) && (allowSwimming || !botInWater(run, actor))) {
    const root = graph.nodes.reduce((best, node, index) => (allowSwimming || !botWaterPoint(run, node, k))
      && (best < 0 || distance(node, actor) < distance(graph.nodes[best], actor)) ? index : best, -1)
    if (root >= 0) costs[root] = 0
  }
  for (let pass = 0; pass < graph.nodes.length; pass++) {
    let next = -1
    for (let i = 0; i < costs.length; i++) if (!visited.has(i) && (next < 0 || costs[i] < costs[next])) next = i
    if (next < 0 || !Number.isFinite(costs[next]) || next === target) break
    visited.add(next)
    for (const edge of graph.edges[next]) {
      const node = graph.nodes[edge.to]
      if (avoided.has(edge.to) || node.x < left || node.x > right || costs[next] + edge.cost >= costs[edge.to]
        || !allowSwimming && (botWaterPoint(run, node, k) || botWaterPoint(run, graph.nodes[next], k))
        || edge.swim && !botSwimClear(run, graph.nodes[next], node, solids, k)
        || !edgeClear(graph.nodes[next], node, edge, barriers, k)) continue
      costs[edge.to] = costs[next] + edge.cost; previous[edge.to] = next
    }
  }
  return { costs, previous }
}

const dryFooting = (run: Run, graph: Graph, node: Node, solids: readonly Platform[]) => !node.climb && !botWaterPoint(run, node, graph.size)
  && !!groundAt(graph.solids, node.x, node.y, 1, surface => canGrip(surface.angle))
  && bodyClear(solids, node.x, node.y - .05, graph.size)

function route(run: Run, graph: Graph, actor: Player, goal: Node, left: number, right: number, avoided: ReadonlyMap<number, number> = new Map(), barriers: readonly Platform[] = [], allowSwimming = false) {
  if (!graph.nodes.length) return []
  let target = closestNode(graph, goal, left, right)
  const { costs, previous } = routeTree(run, graph, actor, left, right, avoided, barriers, target, allowSwimming)
  if (!Number.isFinite(costs[target])) {
    target = closestNode(graph, actor, left, right)
    if (!Number.isFinite(costs[target])) target = costs.findIndex(Number.isFinite)
    if (target < 0) return []
    // The goal is out of reach: get as near it as it can, but only where it can come back from. A one-way drop
    // taken just to be nearer a place it cannot reach anyway is a pit for good (on Spelunk III, a corridor that
    // goes on only as a crawlspace too low for it).
    const back = returnable(graph, graph.nodes.flatMap((_, index) => Number.isFinite(costs[index]) && previous[index] < 0 ? [index] : []))
    if (!back.has(target)) target = [...back].find(i => Number.isFinite(costs[i])) ?? target
    for (const [i, node] of graph.nodes.entries()) if (Number.isFinite(costs[i]) && back.has(i) && distance(node, goal) < distance(graph.nodes[target], goal)) target = i
  }
  const path = [target]
  while (previous[path[0]] >= 0) path.unshift(previous[path[0]])
  return path
}

/** One graph search supplies actual route costs for every place worth checking. */
export function botSearchPlaces(run: Run, robot: RobotState) {
  const graph = botNavigationGraph(run, bodySize(robot.actor!)), state = navigation.get(robot)
  const { costs, previous } = routeTree(run, graph, robot.actor!, 20, run.level.width - 20, state?.avoided ?? new Map(), barriersFor(run), -1,
    botEscapingWater(robot) || botInWater(run, robot.actor!))
  // Places it could come back from, as a patrol prefers: a search is no reason to drop into a pit for good.
  const back = returnable(graph, graph.nodes.flatMap((_, index) => Number.isFinite(costs[index]) && previous[index] < 0 ? [index] : []))
  const places = graph.nodes.flatMap((node, index) => !node.climb && Number.isFinite(costs[index]) ? [{ ...node, cost: costs[index], back: back.has(index) }] : [])
  return places.some(place => place.back) ? places.filter(place => place.back) : places
}

/**
 * Route costs over the player-size graph from any standing point, for reasoning about where the player there could
 * go: the costs, the tree back to the start, and the graph they index.
 */
export function botRouteTree(run: Run, robot: RobotState, from: Node) {
  // At the player's own size: what is open to them is not what is open to a larger bot.
  const actor = robot.actor!, graph = botNavigationGraph(run, 1)
  const standing = { ...actor, size: 1, x: from.x, y: from.y, climbing: null, hang: null, mantle: null, waterMotion: undefined } as Player
  // Someone else's route, the player's: they swim where the bot would not.
  return { graph, ...routeTree(run, graph, standing, 20, run.level.width - 20, new Map(), barriersFor(run), -1, true) }
}

/** The nodes from which the bot could get back to where it stands now: going anywhere else is a one-way trip. */
export function botReturnable(run: Run, robot: RobotState, tree: { costs: readonly number[]; previous: readonly number[] }) {
  const graph = botNavigationGraph(run, bodySize(robot.actor!))
  return returnable(graph, graph.nodes.flatMap((_, index) => Number.isFinite(tree.costs[index]) && tree.previous[index] < 0 ? [index] : []))
}

/** The bot's own route costs to every node from where it stands, as the planner would use them. */
export function botOwnRouteTree(run: Run, robot: RobotState) {
  const graph = botNavigationGraph(run, bodySize(robot.actor!)), state = navigation.get(robot)
  return { graph, ...routeTree(run, graph, robot.actor!, 20, run.level.width - 20, state?.avoided ?? new Map(), barriersFor(run), -1,
    botEscapingWater(robot) || botInWater(run, robot.actor!)) }
}

export function botMovement(run: Run, robot: RobotState, dt: number, target?: Node & { inverted?: boolean; vx?: number; vy?: number }): JumpInput {
  const input = steer(run, robot, dt, target), state = navigation.get(robot), actor = robot.actor!
  if (state) state.pressed = Math.abs(input.move) > .1 ? Math.sign(input.move) : 0
  // Pressing Up or Down on footing is trying too: a ladder or edge that will not take the body must count as stuck,
  // or the bot stands there pressing it for good.
  // Only within reach of a ladder's boarding (or over an edge to lower from) does pressing count: short of the
  // ladder it is still walking there.
  const boardable = run.level.climbables.ladders.some(ladder => Math.abs(actor.x - ladder.x) < 25 && actor.y >= ladder.top - 5 && actor.y <= ladder.bottom + 5)
  if (state && actor.grounded && !actor.climbing && (input.climb || input.descend) && !input.jump
    && (boardable || input.descend)) state.trying = true
  // On the same ladder, climbing, pulling up and lowering again without getting a body length and a half along it
  // (someone standing at its foot, say), it climbs back up and sets that ladder aside, for longer each time.
  const ladderX = actor.climbing?.ladder?.x ?? (actor.mantle?.ladder ? actor.mantle.edgeX : undefined)
  if (state && ladderX !== undefined) {
    const stay = state.ladderStay, kk = bodySize(actor)
    if (!stay || Math.abs(stay.x - ladderX) > 1) state.ladderStay = { x: ladderX, top: actor.y, bottom: actor.y, since: run.activeTime }
    else {
      stay.top = Math.min(stay.top, actor.y); stay.bottom = Math.max(stay.bottom, actor.y)
      if (stay.bottom - stay.top > 90 * kk) state.ladderStay = { x: ladderX, top: actor.y, bottom: actor.y, since: run.activeTime }
      else if (run.activeTime - stay.since > 3 && state.graph) {
        const index = run.level.climbables.ladders.findIndex(ladder => Math.abs(ladder.x - ladderX) < 1)
        const backs = (state.ladderBacks ??= new Map()), count = (backs.get(index) ?? 0) + 1
        backs.set(index, count)
        const away = count < 2 ? 8 : count < 3 ? 15 : 30
        for (const [node, place] of state.graph.nodes.entries()) if (place.climb === `ladder:${index}`) state.avoided.set(node, away)
        state.path = []; state.leg = undefined; state.age = 1; state.ladderStay = undefined
        state.ladderLeave = run.activeTime + 1
      }
    }
  } else if (state && !actor.climbing && !actor.mantle) state.ladderStay = undefined
  if (state?.ladderLeave !== undefined) {
    if (run.activeTime < state.ladderLeave && (actor.climbing?.ladder || actor.mantle?.ladder)) return { ...NEUTRAL_INPUT, climb: true }
    state.ladderLeave = undefined
  }
  // Under a ceiling too low to stand in (knocked under a shelf, say), it crouches and goes on toward its target.
  const k0 = bodySize(actor)
  if (target && actor.grounded && !actor.climbing && !input.jump && !bodyClear(botNavigationGraph(run, k0).solids, actor.x, actor.y - .05, k0))
    return { ...input, crouch: true, move: Math.sign(target.x - actor.x) || actor.facing, climb: false, descend: false }
  // Standing on footing short of its target and pressing nothing (a jump it judged blocked, a route it has run out
  // of): after a moment that way is given up, the nearest point toward the target set aside, and it plans again.
  const k = bodySize(actor)
  if (state && target && actor.grounded && !actor.climbing && Math.abs(actor.vx) < 1 && !input.move && !input.jump && !input.climb && !input.descend
    && distance(actor, target) > 45 * k) {
    state.idle = (state.idle ?? 0) + dt
    if (state.idle > 1.5 && state.graph) {
      const near = state.graph.nodes.reduce((best, node, index) => best < 0 || distance(node, target) < distance(state.graph!.nodes[best], target) ? index : best, -1)
      if (near >= 0) state.avoided.set(near, 5)
      state.path = []; state.leg = undefined; state.age = 1; state.idle = 0
    }
  } else if (state) state.idle = 0
  return input
}

function steer(run: Run, robot: RobotState, dt: number, target?: Node & { inverted?: boolean; vx?: number; vy?: number }): JumpInput {
  const actor = robot.actor!, k = bodySize(actor), graph = botNavigationGraph(run, k), left = 20, right = run.level.width - 20, barriers = barriersFor(run)
  const walkingSolids = barriers.length ? [...graph.solids, ...barriers] : graph.solids
  let state = navigation.get(robot)
  if (!state) { state = { path: [], age: 1, jumpCooldown: 0, goal: { x: actor.x, y: actor.y }, previousX: actor.x, stuck: 0, patrol: 0, avoided: new Map(), trying: false,
    entranceChecked: false, progress: 0, distances: new Map(), ledgeTries: new Map() }; navigation.set(robot, state) }
  if (state.graph !== graph) {
    state.graph = graph; state.path = []; state.leg = undefined; state.flight = undefined; state.shoreTarget = undefined; state.waterDetour = undefined
    if (state.waterExit) state.waterExit = { goal: state.waterExit.goal }
    state.avoided.clear(); state.distances.clear(); state.age = 1
  }
  // Nothing walks without weight: the robot flies on its boots instead. The ground route starts afresh once it has
  // weight again, from wherever it lands.
  // A ledge is no way up without weight: a hand that catches one passing lets go again, rather than pull the body up
  // onto a shelf it was only flying past.
  if ((actor.weightless ?? 0) > 0 && (actor.hang || actor.mantle && !actor.mantle.ladder)) return { ...NEUTRAL_INPUT, detach: true, drop: true, descend: true }
  if (botFloating(actor)) {
    state.path = []; state.leg = undefined; state.flight = undefined; state.age = 1; state.runningJump = false
    state.runup = undefined; state.launchSetup = undefined; state.backoff = undefined; state.stuck = 0; state.trying = false
    return botFloatMovement(run, robot, dt, target, robot.seesPlayer)
  }
  // Wading counts as ground only while it leads on. Stuck in the shallows with no dry route, it swims out like any
  // other swimmer, and keeps at that until it is out of the water.
  const wet = !!actor.waterMotion && playerSwimStrength(run.gravityField, actor) > .05, wading = actor.grounded && wet
  if (!wet) state.wadingEscape = false
  else if (wading && state.stuck > 1 && !state.path.length) state.wadingEscape = true
  const inWater = botInWater(run, actor) || wading && !!state.wadingEscape
  if (state.waterJumpHold !== undefined) {
    state.waterJumpHold -= dt
    if (state.waterJumpHold <= 0 || actor.grounded || actor.climbing || actor.hang || actor.mantle || actor.vy >= 0) state.waterJumpHold = undefined
  }
  const swimming = !actor.climbing && inWater && !(state.flight?.water && (actor.waterJump || actor.vy < 0))
  if (state.waterExit && actor.grounded && !inWater) {
    state.waterExit = undefined; state.waterDetour = undefined; state.path = []; state.leg = undefined; state.age = 1; state.distances.clear()
  }
  if (inWater && !state.waterExit) {
    state.waterExit = { goal: botWaterPosition(actor) }
    state.path = []; state.leg = undefined; state.shoreTarget = undefined; state.age = 1; state.distances.clear()
  }
  if (swimming) { state.flight = undefined; state.runningJump = false; state.runup = undefined; state.launchSetup = undefined; state.backoff = undefined }
  if (actor.grounded) state.departureY = actor.y
  // A jump down ends on footing, a hold or in water. Out of water, a caught ledge is the way up, never a drop.
  if (actor.grounded || actor.climbing || actor.waterMotion) state.descendingJump = false
  state.age += dt; state.jumpCooldown = Math.max(0, state.jumpCooldown - dt)
  if (state.waterExit && inWater && state.age >= .35 && !actor.hang && !actor.mantle) {
    // Escape takes priority over a moving sighting. Search all reachable dry
    // footing once, retaining the chosen bank until it becomes obstructed.
    const { costs, previous } = routeTree(run, graph, actor, left, right, state.avoided, barriers)
    const bank = (index: number) => Number.isFinite(costs[index]) && dryFooting(run, graph, graph.nodes[index], walkingSolids)
    // Out first, then the hunt: the quickest way out, leaning toward a player it can see.
    const score = (index: number) => costs[index] + (target && robot.seesPlayer ? distance(graph.nodes[index], target) * .25 : 0)
    let exit = state.waterExit.node
    // A bank it has leapt for again and again and fallen back from is no way out: it tries another.
    // So is one it has been working toward for a long while, by a rope or a ledge, without getting out.
    if (exit !== undefined && ((state.waterExit.tries ?? 0) >= 3 || run.activeTime - (state.waterExit.since ?? run.activeTime) > 6)) {
      state.avoided.set(exit, 10); exit = undefined
    }
    if (exit === undefined || !bank(exit)) exit = graph.nodes.reduce((best, _, index) =>
      bank(index) && (best < 0 || score(index) < score(best)) ? index : best, -1)
    // A temporarily closed pool still has a useful surface destination. Keep
    // floating and reconsider live barriers instead of following a deep target.
    if (exit < 0) exit = graph.nodes.reduce((best, node, index) =>
      node.swim && Number.isFinite(costs[index]) && (best < 0 || node.y < graph.nodes[best].y - 1
        || Math.abs(node.y - graph.nodes[best].y) < 1 && costs[index] < costs[best]) ? index : best, -1)
    const goal = graph.nodes[exit]
    // A replan must not send a swimmer back to a surface sample it has already
    // left for takeoff. Keep that clear departure while approaching its bank;
    // live barriers and changed exits still replace the route normally.
    const departing = goal && state.waterExit.node === exit && state.leg?.jump && state.launchFrom?.swim && state.path.length
      && edgeClear(state.launchFrom, graph.nodes[state.path[0]], state.leg, barriers, k)
      && botSwimClear(run, actor, state.launchFrom, walkingSolids, k)
    if (departing) state.age = 0
    else if (goal) {
      const same = state.waterExit.node === exit, tries = same ? state.waterExit.tries : 0, since = same ? state.waterExit.since : run.activeTime
      if (!same) state.distances.clear()
      state.waterExit = { node: exit, goal, tries, since }
      state.goal = goal; state.path = [exit]; state.leg = undefined; state.age = 0
      while (previous[state.path[0]] >= 0) state.path.unshift(previous[state.path[0]])
    } else {
      state.waterExit = { goal: botWaterSurface(run, botWaterPosition(actor), k) ?? botWaterPosition(actor) }
      state.goal = state.waterExit.goal; state.path = []; state.leg = undefined; state.age = 0
    }
  }
  if (state.waterExit) target = state.waterExit.goal
  else if (target && botWaterPoint(run, target, k)) {
    // Pursue a submerged player from reachable footing. Diving back after the
    // same clue would undo a completed escape and repeat it indefinitely.
    if (state.shoreTarget) state.shoreTarget.age += dt
    if (!state.shoreTarget || state.shoreTarget.age >= .5) {
      const { costs } = routeTree(run, graph, actor, left, right, state.avoided, barriers, -1, false)
      const clue = target, score = (index: number) => distance(graph.nodes[index], clue) + costs[index] * .1
      const shore = graph.nodes.reduce((best, node, index) => Number.isFinite(costs[index]) && dryFooting(run, graph, node, walkingSolids)
        && (best < 0 || score(index) < score(best)) ? index : best, -1)
      state.shoreTarget = { goal: graph.nodes[shore] ?? { x: actor.x, y: actor.y }, age: 0 }
    }
    target = state.shoreTarget.goal
  } else state.shoreTarget = undefined
  if (actor.grounded || actor.climbing || actor.hang || actor.mantle) { state.runningJump = false; state.flight = undefined; state.leftRope = undefined }
  if (state.launchSetup) {
    const point = state.launchSetup, dx = point.x - actor.x
    point.time += dt
    if (point.time > 1) {
      if (state.path.length) state.avoided.set(state.path[0], 1.5)
      state.launchSetup = undefined; state.path = []; state.leg = undefined; state.age = 1
    }
    else if (!actor.grounded || actor.climbing || target && distance(target, state.goal) > 60) state.launchSetup = undefined
    else if (Math.abs(dx) > 2) return { ...NEUTRAL_INPUT, move: Math.max(-.45, Math.min(.45, dx / 35)) }
    else if (Math.abs(actor.vx) > 15) return { ...NEUTRAL_INPUT }
    else state.launchSetup = undefined
  }
  const transfer = actor.mantle ?? actor.hang
  if (transfer) {
    const key = `${transfer.edgeX}:${transfer.edgeY}:${transfer.side}`, progress = actor.mantle?.time ?? 0
    const old = state.transition
    // The same ledge caught again and again without getting up it (a ball on top, a body in the way) is let go and
    // left alone for a while, rather than caught for good.
    if (old?.key !== key) {
      const tries = state.ledgeTries.get(key), recent = tries && run.activeTime - tries.time < 8
      state.ledgeTries.set(key, { count: recent ? tries.count + 1 : 1, time: run.activeTime })
    }
    const repeated = (state.ledgeTries.get(key)?.count ?? 0) >= 3
    const blocked = old?.key === key && Math.hypot(actor.x - old.x, actor.y - old.y) < .05 && Math.abs(progress - old.progress) < .001 ? old.blocked + dt : 0
    // A pull-up the controller keeps turning back (no room at the top) rocks to and fro without stopping: count the
    // turns back and give it up after the second.
    const reversals = old?.key === key ? old.reversals + (progress < old.progress - .001 && !old.backing && !actor.mantle?.descending ? 1 : 0) : 0
    const backing = old?.key === key && progress < old.progress - .001
    const releasing = !!old?.releasing || blocked > (actor.mantle?.ladder ? 1.2 : 1.5) || repeated || reversals >= 2
    state.transition = { key, x: actor.x, y: actor.y, progress, blocked, releasing, reversals, backing }
    if (actor.mantle?.ladder) {
      if (releasing && state.path.length) state.avoided.set(state.path[0], 5)
      // A pull-up off the top of a ladder that cannot finish goes back down the ladder.
      const descending = releasing || !!target && target.y > actor.mantle.edgeY + 110 * k
      return { ...NEUTRAL_INPUT, climb: !descending, descend: descending }
    }
    if (repeated && state.path.length) state.avoided.set(state.path[0], 8)
    if (releasing && state.path.length) state.avoided.set(state.path[0], 5)
    const landing = state.path.map(index => graph.nodes[index]).find(node => !node.climb)
    const descendingRoute = !!landing && landing.y > (state.departureY ?? transfer.edgeY) + 110 * k && landing.y > transfer.edgeY + 110 * k
      && !actor.hang?.caught.climbing && (!target || target.y > transfer.edgeY + 300 * k)
      && graph.solids.some(platform => platform.h <= 30 && transfer.edgeX >= platform.x - 1
        && transfer.edgeX <= platform.x + platform.w + 1 && Math.abs(platform.y - transfer.edgeY) < 31)
    if (actor.mantle?.step && descendingRoute) {
      return { ...NEUTRAL_INPUT, move: -transfer.side * .7, descend: true, detach: true }
    }
    // Catching the very edge it just stepped off, on the way down to somewhere well below, is a slip of the hands:
    // let go and carry on down, rather than climb back up and walk off it again.
    const leftHere = !!actor.hang && state.departureY !== undefined && Math.abs(state.departureY - transfer.edgeY) < 6 * k
      && !!target && target.y > transfer.edgeY + 110 * k && !actor.hang.caught.climbing
    const dropping = !!actor.hang && (!!state.descendingJump || descendingRoute || leftHere)
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
  const pinned = !swimming && state.trying && !actor.grounded && !actor.climbing
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
  // Pressing one way and creeping the other, at a crawl, is stuck too: on a frictionless crest the feet cannot
  // drive, and the slow slide back down never looked still. (Turning round at speed is not: it is quick about it.)
  const moved = actor.x - state.previousX
  const slipping = !!state.pressed && moved * state.pressed < .05 && Math.abs(actor.vx) < 20
  if (state.trying && (Math.abs(moved) < .05 || slipping) && actor.grounded) state.stuck += dt; else state.stuck = 0
  state.previousX = actor.x
  for (const [node, time] of state.avoided) if (time <= dt) state.avoided.delete(node); else state.avoided.set(node, time - dt)
  if (state.stuck > 1.5 && state.path.length) {
    state.avoided.set(state.path[0], 5); state.path = []; state.age = 1; state.stuck = 0
  }
  // Checking the entrance must finish on its floor, facing the actual doorway.
  // Otherwise a final ladder node can count as arrival before the rider gets off.
  const checkingEntrance = state.goal.x === run.level.entrance.x && state.goal.y === run.level.entrance.y
  const patrolArrived = checkingEntrance ? actor.grounded && distance(actor, state.goal) < 12 * k
    : distance(actor, state.goal) < 45 * k || state.path.length === 1 && distance(actor, graph.nodes[state.path[0]]) < 45 * k
  if (!target && (patrolArrived || !state.path.length && state.age > 2)) {
    // The entrance is known map information, independent of any player sighting.
    // Check it before a general patrol; sight acquisition can interrupt this trip.
    // A closed door can temporarily block the destination. Still approach the
    // nearest reachable point instead of abandoning the entrance immediately.
    const entrance = !state.entranceChecked && distance(actor, run.level.entrance) > 60
      && botCanReach(run, robot, run.level.entrance, []) ? run.level.entrance : undefined
    state.entranceChecked = true
    const candidates = graph.nodes.filter(n => n.x >= left && n.x <= right && !n.climb && !botWaterPoint(run, n, k))
    const phase = state.patrol % 3
    candidates.sort((a, b) => phase === 0 ? a.y - b.y || distance(a, actor) - distance(b, actor)
      : (phase === 2 ? a.x - b.x : b.x - a.x) || a.y - b.y)
    // One search answers every patrol candidate. Searching again for each
    // unreachable shelf makes disconnected cave regions expensive to patrol.
    const reachable = new Set<Node>(), returning = new Set<Node>()
    if (!entrance) {
      const { costs, previous } = routeTree(run, graph, actor, left, right, state.avoided, barriers, -1, false)
      // A patrol prefers ground it can come back from. A drop or jump down it cannot climb back from would
      // leave it pacing a pit for good. Only where every way on is one way does it take one.
      const here = graph.nodes.flatMap((_, index) => Number.isFinite(costs[index]) && previous[index] < 0 ? [index] : [])
      const back = returnable(graph, here)
      for (const [index, node] of graph.nodes.entries()) if (Number.isFinite(costs[index]) && previous[index] >= 0) {
        reachable.add(node)
        if (back.has(index)) returning.add(node)
      }
    }
    state.goal = entrance ? { x: entrance.x, y: entrance.y } : candidates.find(n => distance(n, actor) > 60 && returning.has(n))
      ?? candidates.find(n => distance(n, actor) > 60 && reachable.has(n)) ?? { x: actor.x < (left + right) / 2 ? right : left, y: actor.y }
    if (!entrance) state.patrol++
    state.age = 1; state.path = []; state.distances.clear()
  }
  const changedGoal = !!target && distance(target, state.goal) > 60
  if ((state.age >= .35 && (changedGoal || !state.path.length) || state.age >= 1.5) && (swimming || actor.grounded || actor.climbing || !state.path.length && !state.flight)) {
    if (changedGoal) state.distances.clear()
    state.goal = target ?? state.goal; state.path = route(run, graph, actor, state.goal, left, right, state.avoided, barriers, !!state.waterExit); state.leg = undefined; state.age = 0
  }
  const launchEdge = state.path.length > 1 && graph.edges[state.path[0]].find(edge => edge.to === state!.path[1])
  // Any planned jump, not only one from a marked takeoff: standing at the lip of a long jump, it backs up for a run.
  if (actor.grounded && launchEdge && (launchEdge.takeoff || launchEdge.jump) && !state.runup) {
    const lip = launchEdge.takeoff ?? graph.nodes[state.path[0]], to = graph.nodes[launchEdge.to], side = Math.sign(to.x - lip.x)
    const time = jumpFlight(lip, to, launchEdge.strength ?? 1, 0, k)
    const required = botJumpTakeoffSpeed(Math.max(0, Math.abs(to.x - lip.x) - 35 * k), time, k) + 20
    const room = Math.max(0, (lip.x - actor.x) * side - 12 * k)
    const available = Math.sqrt(Math.max(0, actor.vx * side) ** 2 + 2 * TUNING.acceleration * k * room)
    if (Math.abs(actor.y - lip.y) < 3 && required > available) {
      // The run starts from a stop, so it backs up only over level footing that grips: stopped on a slope, or on
      // frictionless footing, it could not get going again.
      const solids = [...graph.solids, ...barriers]
      const level = (point: Node) => {
        if (!side) return false
        for (let x = lip.x; (x - point.x) * side >= 0; x -= side * 4) {
          const ground = groundAt(solids, x, lip.y, 6 * k)
          if (!ground || Math.abs(ground.y - lip.y) > 2 || Math.abs(ground.angle) > .1
            || surfaceFriction(ground.platform).grip < TERRAIN_FRICTION.grip) return false
        }
        return true
      }
      const point = [100, 80, 60].map(back => ({ x: lip.x - side * back, y: lip.y, side }))
        .find(point => walkClear(actor, point, solids, k) && level(point))
      if (point) state.runup = point
    }
  }
  if (state.runup) {
    const point = state.runup, short = (actor.x - point.x) * point.side, backing = Math.max(0, -actor.vx * point.side)
    if (!actor.grounded || changedGoal) state.runup = undefined
    // It turns for the run while it can still stop by the point: turning only on reaching it at a run carried it a
    // body length past, off the end of the footing it had checked.
    else if (short > 4 + backing ** 2 / (2 * TUNING.acceleration * k)) return { ...NEUTRAL_INPUT, move: -point.side }
    else {
      if (!backing) state.runup = undefined
      return { ...NEUTRAL_INPUT, move: point.side }
    }
  }
  while (state.path.length > 1 && state.flight?.catchX === undefined) {
    const node = graph.nodes[state.path[0]]
    const next = graph.nodes[state.path[1]]
    const departure = graph.edges[state.path[0]].find(edge => edge.to === state!.path[1])
    const approach = departure?.takeoff ?? node
    const advance = () => {
      const from = state.path.shift()!; state.leg = graph.edges[from].find(edge => edge.to === state!.path[0])
      state.launchFrom = state.leg?.jump ? state.leg.takeoff ?? graph.nodes[from] : undefined
    }
    if (state.waterExit && node.climb?.startsWith('rope:') && !actor.climbing) break
    if (actor.climbing && node.climb === `${actor.climbing.kind}:${actor.climbing.index}` && next.climb === node.climb) { advance(); continue }
    // A rope catch can put the feet below its graph sample. Keep climbing
    // until the actual release can reach the next ledge, rather than jumping
    // from the broad waypoint arrival window and falling back into the pool.
    if (state.waterExit && actor.climbing && node.climb && departure?.jump
      && !jumpFlight(actor, next, departure.strength ?? 1, jumpDestination(graph, actor, next).reach ?? 0, k)) break
    // Passing above a setup does not provide footing for its next jump.
    const passing = !departure?.jump && !actor.grounded && !node.climb && actor.y < node.y - 30 * k && Math.abs(actor.x - node.x) < 45 * k
      && (next.x - actor.x) * actor.vx > 0
    const launchApproach = actor.grounded && !node.climb && graph.edges[state.path[0]].some(edge => edge.to === state!.path[1] && edge.jump)
    // Holding the waypoint's rope, the rope carries the body wherever it swings: the grip's height is the arrival,
    // and so is the last handhold for a waypoint below the rope's end.
    const onRope = !!actor.climbing?.rope && node.climb === `rope:${actor.climbing.index}` && !departure?.takeoff
    const ropeEnd = onRope && actor.climbing!.distance >= ropeGripLimit(actor.climbing!.rope!.definition) - .5 && node.y >= actor.y
    if (!passing && !ropeEnd && ((!onRope && Math.abs(actor.x - approach.x) > (departure?.takeoff ? 4 : launchApproach ? 12 : 30 * k)) || Math.abs(actor.y - approach.y) > 50 * k)) break
    advance()
  }
  let routeNode = graph.nodes[state.path[0]] ?? target ?? state.goal
  // Graph samples lead onto the destination surface. Finish the remaining
  // clear walk to the actual target instead of stopping at a coarse sample.
  const destination = target ?? state.goal
  if (state.path.length <= 1 && (!routeNode.climb || actor.grounded) && (walkClear(actor, destination, walkingSolids, k)
    || swimming && botSwimClear(run, actor, destination, walkingSolids, k))) {
    // The walk to the target replaces the last leg: a jump planned toward an earlier goal no longer applies.
    if (state.leg && graph.nodes[state.leg.to] !== destination) state.leg = undefined
    routeNode = destination
  }
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
  if (swimming) {
    // The shared motor normalizes diagonals, brakes to a depth hold and handles
    // all contacts. A surface jump is a normal buffered jump, never a lift.
    const position = botWaterPosition(actor)
    let detour = state.waterDetour
    if (detour && !botSwimClear(run, position, { x: detour.x, y: detour.cleared ? detour.surfaceY : detour.y }, walkingSolids, k)) detour = undefined
    if (detour && Math.abs(actor.x - detour.x) < 12 * k) detour.cleared = true
    if (detour?.cleared && position.y <= detour.surfaceY + 12 * k) detour = undefined
    detour ??= botWaterDetour(run, actor, node, walkingSolids, k)
    state.waterDetour = detour
    const swimNode = detour ? { x: detour.x, y: detour.cleared ? detour.surfaceY : detour.y } : node
    input.move = Math.max(-1, Math.min(1, (swimNode.x - actor.x - actor.vx * .2) / 70))
    const swimDy = swimNode.y - position.y
    input.swimVertical = Math.max(-1, Math.min(1, (swimDy - actor.vy * .2) / 60))
    const leaving = !detour && !botWaterPoint(run, node, k) && dy < -20 * k
    input.climb = leaving || !detour && !!node.climb && Math.abs(dx) < 30 * k && dy < 10 * k
    input.descend = !detour && !!node.climb && Math.abs(dx) < 30 * k && dy > 20 * k
    if (leaving) input.swimVertical = -1
    // A bank that overhangs the water stops a leap from beneath it: rise only where the body, a little way
    // toward the bank, clears everything up to the bank's height, and back out from under it first.
    const overhung = leaving && Math.abs(dx) < (actor.grounded ? 180 : 100) && !Array.from({ length: 6 }, (_, i) => actor.y + (node.y - actor.y) * (i + 1) / 6)
      .every(y => bodyClear(walkingSolids, actor.x + Math.sign(dx) * 20 * k, y, k))
    if (overhung) input.move = -Math.sign(dx)
    // Pressed against the bank's face it is as near as it gets: a farther waypoint on top is no reason to wait.
    const againstBank = leaving && !bodyClear(walkingSolids, actor.x + Math.sign(dx) * 6 * k, actor.y - .05, k)
    if (leaving && !overhung && Math.abs(dx) < (actor.grounded || againstBank ? 180 : 100) && !state.jumpCooldown
      && (actor.grounded || isWeightless(actor.gravity ?? TUNING.gravity))) {
      input.jump = true; input.jumpStrength = 1; state.jumpCooldown = .65
      if (state.waterExit) state.waterExit.tries = (state.waterExit.tries ?? 0) + 1
      if (node.climb || dy < -190 * k || actor.grounded) {
        state.flight = { ...jumpDestination(graph, actor, node), water: true }
        input.swimVertical = 0
      }
      // In the shallows, hold the ordinary ground jump through its lift;
      // otherwise swimming resumes on the next frame and damps the takeoff.
      if (actor.grounded) { input.jumpStrength = undefined; state.waterJumpHold = TUNING.jumpHoldTime }
    }
    state.trying = Math.hypot(input.move, input.swimVertical) > .1
    return input
  }
  const approachingJump = state.path.length > 1 && graph.edges[state.path[0]].find(edge => edge.to === state!.path[1] && edge.jump)
  if (actor.grounded && approachingJump && Math.abs(dx) > 9) {
    const landing = jumpDestination(graph, node, graph.nodes[approachingJump.to], approachingJump)
    const time = jumpFlight(node, landing.to, approachingJump.strength ?? 1, landing.reach ?? 0, k)
    // Arrive at takeoff with the speed this arc needs. A long descent needs a
    // run-up; a nearly vertical ledge catch needs room to brake before its lip.
    const speed = Math.min(TUNING.runSpeed, Math.abs((landing.catchX ?? landing.to.x) - node.x) / Math.max(.1, time))
    // That pace is for the takeoff: run on until there is just room to slow to it.
    const slowing = (TUNING.runSpeed ** 2 - speed ** 2) / (2 * TUNING.braking * k) + 20 * k
    input.move = Math.sign(dx) * (target && Math.abs(dx) > slowing ? 1 : Math.max(.15, speed / TUNING.runSpeed))
  }
  // Easing off before a waypoint keeps a thin platform under it; a ladder's waypoint wants the body over the
  // ladder itself, inside its narrow boarding window, so it walks right up to it.
  else if (actor.grounded && Math.abs(dy) < 30 * k) input.move *= node.climb?.startsWith('ladder:') ? Math.min(1, Math.max(.25, Math.abs(dx) / 40)) : Math.min(1, Math.abs(dx) / 85)
  state.trying = Math.abs(input.move) > .1
  if (actor.climbing || node.climb && Math.abs(dx) < 30 * k) {
    const ladder = actor.climbing?.ladder || node.climb?.startsWith('ladder:')
    input.climb = dy < (ladder ? 0 : 10 * k); input.descend = dy > (ladder ? 0 : 20 * k)
    // Down at a rope's last handhold lets go. Only a planned drop below does that (it holds Detach too).
    const held = actor.climbing
    if (held?.rope && held.distance >= ropeGripLimit(held.rope.definition) - .5) input.descend = false
    if (actor.climbing) input.move = actor.climbing.rope ? Math.sign(dx) * .5
      : !node.climb && Math.abs(dy) < 5 * k ? Math.sign(dx) * .6 : 0
    // At the top of a rope hanging against the face below a ledge, the body hangs too close to the face to catch
    // the lip, and the climb can go no higher. Swing out from the face, then come back holding Up: the returning
    // swing carries the hands to the lip from outside, as a person would pump a rope.
    const grip = actor.climbing
    if (grip?.rope && !node.climb && input.climb) {
      const top = state.ropeTop?.index === grip.index && Math.abs(grip.distance - state.ropeTop.distance) < .05 ? state.ropeTop : undefined
      state.ropeTop = { index: grip.index, distance: grip.distance, held: top ? top.held + dt : 0, swing: top?.swing ?? 0 }
      if (state.ropeTop.held > .6) state.ropeTop.swing = .5
    } else if (!state.ropeTop?.swing) state.ropeTop = undefined
    if (state.ropeTop?.swing && grip?.rope) {
      state.ropeTop.swing = Math.max(0, state.ropeTop.swing - dt); state.ropeTop.held = 0; state.ropeTop.distance = grip.distance
      input.climb = false; input.descend = false; input.move = -Math.sign(dx)
    } else if (state.ropeTop?.swing) state.ropeTop = undefined
    if (actor.climbing?.ladder && (input.climb || input.descend)) {
      const grip = actor.climbing, old = state.ladderBlocked
      const blocked = old?.index === grip.index && Math.abs(grip.distance - old.distance) < .05 ? old.blocked + dt : 0
      state.ladderBlocked = { index: grip.index, distance: grip.distance, blocked }
      // A person or prop can occupy the landing. Step off into clear air and
      // approach beside it, using the ordinary release and falling contacts.
      if (blocked > .6 && bodyClear(walkingSolids, actor.x, actor.y, k)) {
        state.ladderBlocked = undefined; state.path = []; state.leg = undefined; state.age = 1
        return { ...NEUTRAL_INPUT, move: Math.sign(dx) || actor.facing, detach: true }
      }
      // No room to step off (the ladder runs through a floor here): go back the way it came and find another way.
      if (blocked > 1.5) {
        // Each time the same ladder turns it back it is given up for longer.
        const backs = (state.ladderBacks ??= new Map()), count = (backs.get(grip.index) ?? 0) + 1
        backs.set(grip.index, count)
        const away = count < 2 ? 6 : count < 3 ? 15 : 30
        for (const [index, node] of graph.nodes.entries()) if (node.climb === `ladder:${grip.index}`) state.avoided.set(index, away)
        if (state.path.length) state.avoided.set(state.path[0], away)
        state.ladderBlocked = undefined; state.path = []; state.leg = undefined; state.age = 1
        return { ...NEUTRAL_INPUT, climb: !input.climb, descend: input.climb }
      }
    } else state.ladderBlocked = undefined
    // Rope grip distance and the actor's feet use different origins. Near the
    // floor the next walking node can sit inside the vertical deadband: let go
    // through the ordinary controller instead of holding the last handhold.
    if (actor.climbing && !node.climb && dy >= -10 * k && groundAt(run.terrain, actor.x, actor.y, (actor.climbing.ladder ? 5 : 90) * k)
      && (!actor.climbing.ladder || bodyClear(walkingSolids, actor.x, actor.y, k))) {
      input.climb = false; input.descend = true; input.detach = true
    }
    if (actor.climbing?.rope && node.climb && dy > 20 * k && input.descend && Math.abs(dx) < 60 * k) {
      // Keep the body outside the decks beside an end rope while lowering.
      // Steering toward its anchor can pin the rider against the next shelf.
      const clear = (side: number) => bodyClear(walkingSolids, actor.x + side * 30 * k, actor.y + 30 * k, k)
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
    const gap = Math.sign(dx) > 0 ? shape.x - actor.x - TUNING.width * k / 2 : actor.x - TUNING.width * k / 2 - shape.x - shape.w
    return gap >= -2 && gap < 75 * k && shape.y < actor.y - 15 * k && shape.y + shape.h > actor.y - TUNING.height * k
  })
  const leavingClimb = actor.climbing && state.leg?.jump && node.climb !== `${actor.climbing.kind}:${actor.climbing.index}`
  if (leavingClimb && actor.climbing?.ladder && dy > 110 * k) {
    // Leave a descending ladder below the floor instead of jumping back into
    // its underside. Stay attached until the ordinary body has room to fall.
    input.climb = false; input.descend = true
    input.detach = bodyClear(walkingSolids, actor.x, actor.y, k)
    return input
  }
  const followingWalk = state.leg && !state.leg.jump && !state.leg.climb
    || !state.leg && actor.grounded && !node.climb && dy < -30 * k && walkClear(actor, node, walkingSolids, k)
  // A clear narrow opening needs a controlled step down. A jump overshoots
  // the hatch and lands back on its upper deck.
  const droppingThrough = actor.grounded && !obstacle && !actor.contacts?.support?.collider.prop && !node.climb && dy > 110 * k && Math.abs(dx) < 180
    && run.level.climbables.ladders.some(ladder => Math.abs(ladder.x - node.x) < 20 * k && ladder.top <= actor.y && ladder.bottom >= node.y - 30 * k)
    && !groundAt(walkingSolids, node.x, actor.y, 12 * k)
    && Array.from({ length: 9 }, (_, i) => actor.y + dy * (i + 1) / 9)
      .every(y => bodyClear(walkingSolids, node.x, y - .05, k))
  const needJump = (state.leg?.jump || dy < -30 * k && !followingWalk || obstacle || state.stuck > .28 || !(departure && departure.takeoff)
    // Footing short of the waypoint is walked to: the probe goes no farther than the waypoint.
    && dy < 30 * k && Math.abs(dx) > 20 && !state.leg?.drop && !groundAt(run.terrain, actor.x + Math.sign(dx) * Math.min(35 * k, Math.abs(dx)), actor.y, 35 * k))
    && !actor.climbing && !droppingThrough && !(node.climb?.startsWith('ladder:') && Math.abs(dx) < 25 * k && !state.leg?.jump)
  if (droppingThrough && !actor.climbing) {
    input.move = Math.abs(dx) < 6 ? 0 : Math.max(-.45, Math.min(.45, dx / 85))
    input.descend = true; input.climb = false; state.runningJump = false; state.descendingJump = true
  }
  const plannedFlight = state.leg?.jump && !obstacle ? jumpDestination(graph, actor, node, state.leg) : undefined
  const flightTime = plannedFlight ? jumpFlight(actor, node, state.leg?.strength ?? 1, plannedFlight.reach ?? 0, k) : 0
  const takeoffSpeed = plannedFlight ? botJumpTakeoffSpeed(Math.abs((plannedFlight.catchX ?? node.x) - actor.x), flightTime, k) : 0
  const preparing = actor.grounded && needJump && plannedFlight && actor.vx * plannedFlight.side < takeoffSpeed - 15
    && groundAt(run.terrain, actor.x + plannedFlight.side * 12 * k, actor.y, 12 * k)
  if (preparing) input.move = plannedFlight.side * Math.min(1, Math.max(.2, (takeoffSpeed + 40) / TUNING.runSpeed))
  const canLaunch = actor.grounded || !!(state.leg?.takeoff && actor.coyote > 0)
  if ((canLaunch && needJump && !preparing || leavingClimb) && !state.jumpCooldown) {
    input.jump = true; input.jumpStrength = obstacle ? 1 : state.leg?.strength ?? 1
    if (actor.grounded && !launchClear(actor, input.jumpStrength, input.move, [...walkingSolids, ...obstacles])) {
      // The setup sample was clear, but this actual position or momentum is
      // not. Settle at that takeoff before trying another route.
      if (state.launchFrom && distance(actor, state.launchFrom) < 100 * k && walkClear(actor, state.launchFrom, walkingSolids, k)) {
        state.launchSetup = { ...state.launchFrom, time: 0 }; state.launchFrom = undefined
      } else {
        if (state.path.length) state.avoided.set(state.path[0], 1.5)
        state.path = []; state.leg = undefined; state.age = 1
      }
      input.jump = false
      return input
    }
    if (plannedFlight) state.flight = plannedFlight
    if (leavingClimb && actor.climbing?.rope) state.leftRope = { index: actor.climbing.index, y: actor.y }
    state.jumpCooldown = .55; state.leg = undefined
    input.climb = false; input.descend = false; input.detach = false
    // Planned arcs use running-speed reach even during a quiet patrol. Keep
    // that air control on rising jumps too; patrol walking pace falls short.
    state.runningJump = !!plannedFlight || !!leavingClimb || dy >= -30 * k && !obstacle
    state.descendingJump = dy > 110 * k && !obstacle
    if (state.runningJump) input.move = Math.sign(dx)
  }
  if (state.runningJump && !actor.climbing && Math.abs(dx) > 9) input.move = Math.sign(dx)
  // A drop walks off the end of its footing at the pace its fall needs, then steers its landing like a jump.
  const drop = state.leg?.drop
  if (drop && !actor.climbing && !swimming) {
    if (actor.grounded) input.move = Math.sign(dx) * Math.min(1, (drop.speed + 30) / TUNING.runSpeed)
    else state.flight ??= { to: node, side: Math.sign(node.x - actor.x) || actor.facing }
  }
  // Steer the arc to arrive where it means to: a ledge catch at the hands' reach, a landing on the feet. Pushing
  // on at full speed until overhead carries a long drop well past its landing.
  if (state.flight && (state.flight.catchX !== undefined || !state.flight.water) && !actor.climbing) {
    const flight = state.flight, player = run.player, landing = flight.catchX === undefined
    // Coming down where the player stands, it lands beside them on the near side, not on their head.
    // Only a player it can see: where an unseen one stands is not its to know.
    const besidePlayer = landing && robot.seesPlayer && Math.abs(player.y - flight.to.y) < 40 * k && Math.abs(player.x - flight.to.x) < 36 * k
    const catchX = flight.catchX ?? (besidePlayer ? player.x - flight.side * 36 * k : flight.to.x)
    const reach = landing ? 0 : flight.reach ?? TUNING.hangReach * k
    // In the world, a larger body leaves the ground and falls k times as fast as the player.
    const speed = input.jump ? -jumpSpeedFor(input.jumpStrength!) * k : actor.vy, gravity = TUNING.gravity * k
    const discriminant = speed ** 2 + 2 * gravity * (flight.to.y + reach - actor.y)
    const time = discriminant >= 0 ? Math.max(.08, (-speed + Math.sqrt(discriminant)) / gravity) : .08
    const acceleration = 2 * (catchX - actor.x - actor.vx * time) / (time * time)
    let velocity = actor.vx + Math.max(-TUNING.airAcceleration * k, Math.min(TUNING.airAcceleration * k, acceleration)) * dt
    // Brake while still facing the direction of travel. Tiny corrections near
    // a handhold must not spin the body back and forth on successive frames.
    if (velocity * flight.side < 5) velocity = flight.side * 5
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
    const nearby = run.level.climbables.ladders.findIndex(ladder => Math.abs(actor.x - ladder.x) < 25 * k
      && actor.y >= ladder.top && actor.y <= ladder.bottom + 5 * k)
    // Up now catches ladders even during a held jump. Request that grip only
    // at the planned ladder, rather than catching an incidental one en route.
    // Ropes retain their automatic airborne catches without this Up request.
    if (nearby >= 0) input.climb = wanted === `ladder:${nearby}`
    // A leap off a rope toward somewhere level or lower must not snatch that same rope again as it passes,
    // once its grab cooldown runs out; holding Detach declines the catch while the rope is still within reach.
    // Leaping for somewhere above, a fresh grip higher up the same rope is a way up, so it stays allowed.
    const leaving = state.leftRope
    const left = leaving && wanted !== `rope:${leaving.index}` && node.y > leaving.y - 40 * k ? actor.ropes?.[leaving.index] : undefined
    if (left) {
      const probe = [actor.x + actor.facing * 10 * k, actor.y - 56 * k]
      if (left.nodes.some(node => Math.hypot(node.x - probe[0], node.y - probe[1]) < 45 * k)) input.detach = true
    }
  }
  if (inWater && state.flight?.water && actor.vy < 0) input.swimVertical = 0
  if (state.waterJumpHold !== undefined) { input.jump = true; input.jumpStrength = undefined; input.swimVertical = 0 }
  return input
}

export function botCanReach(run: Run, robot: RobotState, goal: Node, barriers: readonly Platform[] = barriersFor(run)) {
  const k = bodySize(robot.actor!), graph = botNavigationGraph(run, k), path = route(run, graph, robot.actor!, goal, 20, run.level.width - 20, undefined, barriers,
    botEscapingWater(robot) || botInWater(run, robot.actor!))
  const last = graph.nodes[path.at(-1) ?? -1]
  return !!(last && (distance(last, goal) < 35 * k || walkClear(last, goal, [...graph.solids, ...barriers], k)
    || last.swim && botSwimClear(run, last, goal, [...graph.solids, ...barriers], k)))
}
