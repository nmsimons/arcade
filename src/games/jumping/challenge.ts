import { bodyIntersects, moveBody, polygonIntersects, polygonPoints } from './geometry.ts'
import { cancelJumpInput, finishPlayerStep, NEUTRAL_INPUT, STEP, stepPlayer, TUNING } from './model.ts'
import type { JumpInput, Platform, Player } from './model.ts'
import { levelPlayer, levelTerrain, prepareLevelRopes, triggerTargets } from './level.ts'
import type { PuzzleLevel, Mechanism, Pusher } from './level.ts'
export type { PuzzleLevel } from './level.ts'
import { moveRobot, prepareRobots, robotPlatforms, robotSensesPlayer, robotSightObstacles, robotTouchesProps } from './robotPhysics.ts'
import { groundAt } from './terrain.ts'
import { GOAL_PLATE_WIDTH, GOAL_OPEN_SECONDS, GOAL_EXIT_SECONDS, goalDoor, goalExitPosition } from './goal.ts'
import type { GoalExit } from './goal.ts'
import { stepPickups } from './pickups.ts'
import type { PickupState } from './pickups.ts'
import { planLiftPropMotion, prepareProps, propBlocksMechanism, stepPropPhysics } from './propPhysics.ts'
import { ballShape, boxShape, propLoadsPlate } from './propGeometry.ts'
import { playerContacts, translatePlayer } from './playerContacts.ts'
import type { ContactWorld, PlayerCollider, PlayerContacts } from './playerContacts.ts'
import { mechanismOpenPosition, mechanismShape, mechanismSweep, prepareMechanism } from './mechanisms.ts'
import { canHangFromBox } from './boxSupport.ts'
import { disablePlatformLedges, platformLedges } from './terrainLedges.ts'

export type Medal = 'Gold' | 'Silver' | 'Bronze' | 'No medal'
export interface Prop {
  kind: 'box' | 'ball'; x: number; y: number; size: number; vx: number; vy: number; angle: number; angularVelocity: number; grounded: boolean
}
export interface MechanismState { definition: Mechanism; x: number; y: number; direction: number; wait: number; active: boolean; safetyHold: number | null }
export interface RobotState { definition: Pusher; x: number; y: number; vx: number; angle: number; facing: number; phase: 'patrol' | 'chase' | 'windup' | 'charge' | 'recover'; time: number; seesPlayer: boolean }
export interface Run {
  level: PuzzleLevel; player: Player; props: Prop[]; platforms: Platform[]; terrain: Platform[]
  mechanisms: MechanismState[]; triggers: { held: number; active: boolean; depression: number }[]; robots: RobotState[]
  pickups: PickupState[]; pickupTime: number; coinsCollected: number; activeTime: number; timeStopRemaining: number; timeFastRemaining: number; empRemaining: number
  elapsed: number; started: boolean; goalLit: boolean; goalElapsed: number; exit: GoalExit | null
  finished: boolean; goalDepression: number; medal: Medal | null
}
export const BEST_TIME_KEY = 'arcade.jumping.times.v1'
export function medalFor(seconds: number, level: PuzzleLevel): Medal {
  return seconds <= level.times.gold ? 'Gold' : seconds <= level.times.silver ? 'Silver' : seconds <= level.times.bronze ? 'Bronze' : 'No medal'
}
export function formatTime(seconds: number) {
  const centiseconds = Math.floor((Math.abs(seconds) + 1e-7) * 100)
  return `${seconds < 0 && centiseconds ? '-' : ''}${Math.floor(centiseconds / 6000)}:${String(Math.floor(centiseconds / 100) % 60).padStart(2, '0')}.${String(centiseconds % 100).padStart(2, '0')}`
}
export function readBest(storage: Pick<Storage, 'getItem'>, id: string): number | null {
  try { const value = JSON.parse(storage.getItem(BEST_TIME_KEY) ?? '{}')[id]; return typeof value === 'number' && Number.isFinite(value) ? value : null } catch { return null }
}
export function saveBest(storage: Pick<Storage, 'getItem' | 'setItem'>, seconds: number, id: string): number {
  const best = Math.min(readBest(storage, id) ?? Infinity, seconds)
  let values: Record<string, unknown> = {}
  try { const parsed: unknown = JSON.parse(storage.getItem(BEST_TIME_KEY) ?? '{}'); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) values = parsed as Record<string, unknown> } catch { /* Replace an unreadable record. */ }
  storage.setItem(BEST_TIME_KEY, JSON.stringify({ ...values, [id]: best }))
  return best
}
export function createRun(level: PuzzleLevel): Run {
  return createInitialWorld(prepareLevelRopes(level))
}
/** Static editor drawing must not run the rope settling simulation. */
export function createPreviewRun(level: PuzzleLevel): Run {
  return createInitialWorld(level, true)
}
function createInitialWorld(level: PuzzleLevel, preview = false): Run {
  const run: Run = { level, player: levelPlayer(level, preview), props: level.props.map(p => ({ ...p, vx: 0, vy: 0, angle: 0, angularVelocity: 0, grounded: true })),
    terrain: levelTerrain(level), platforms: [],
    mechanisms: level.mechanisms.map(m => {
      const definition = prepareMechanism(m, level.floor)
      return { definition, x: definition.x, y: definition.y, direction: -1, wait: 0, active: false, safetyHold: null }
    }),
    triggers: level.triggers.map(() => ({ held: 0, active: false, depression: 0 })),
    robots: level.robots.map(definition => ({ definition, x: definition.x, y: definition.y, vx: 0, angle: 0, facing: -1, phase: 'patrol', time: 0, seesPlayer: false })),
    pickups: (level.pickups ?? []).map(definition => ({ definition, collectedAge: null })), pickupTime: 0, coinsCollected: 0, activeTime: 0, timeStopRemaining: 0, timeFastRemaining: 0, empRemaining: 0,
    elapsed: 0, started: false, goalLit: false, goalElapsed: 0, exit: null, finished: false, goalDepression: 0, medal: null }
  if (!preview) {
    prepareProps(run); syncPlatforms(run)
    prepareRobots(run.platforms, run.robots)
  }
  if (run.robots.length) {
    const world = syncPlatforms(run)
    for (const robot of run.robots) robot.seesPlayer = robotSensesPlayer(robot, run.player, robotSightObstacles(world, robot))
  }
  return run
}
function syncPlatforms(run: Run): ContactWorld {
  const colliders: PlayerCollider[] = [...run.terrain.map((platform, i) => ({ id: `terrain:${i}`, platform })),
    ...run.mechanisms.map((m, i) => ({ id: `mechanism:${i}`, platform: mechanismShape(m) })),
    ...['box', 'ball'].flatMap(kind => run.props.flatMap((prop, i) => prop.kind === kind
      ? [{ id: `prop:${i}`, prop, platform: prop.kind === 'box' ? boxShape(prop) : ballShape(prop) }] : []))]
  run.platforms = colliders.map(c => c.platform)
  for (const collider of colliders) if (collider.prop && !canHangFromBox(collider.prop, run.platforms.filter(b => b !== collider.platform))) disablePlatformLedges(collider.platform)
  // Keep the bots out of their own navigation geometry and prop solver. The
  // player receives their full hulls with stable identities and drive velocity.
  for (const [i, robot] of run.robots.entries()) for (const [piece, platform] of robotPlatforms(robot).entries()) {
    colliders.push({ id: `robot:${i}:${piece}`, platform, robot })
  }
  return { platforms: colliders.map(c => c.platform), colliders }
}
const approach = (from: number, to: number, delta: number) => from + Math.max(-delta, Math.min(delta, to - from))
const bodyOverlap = (p: Player, b: Platform, dy = 0) => bodyIntersects(p.x, p.y + dy, b, p.crouching ? TUNING.crouchHeight : TUNING.height)
function reverseLift(m: MechanismState) {
  m.wait = m.direction < 0 ? 3 : 2
  m.direction *= -1
}
function stepMechanisms(run: Run, dt: number, contacts: PlayerContacts) {
  for (const [index, m] of run.mechanisms.entries()) {
    const def = m.definition
    if (def.kind === 'lift' && !m.active) continue
    if (m.wait > 0) { m.wait -= dt; continue }
    const p = run.player, open = mechanismOpenPosition(def)
    const platformIndex = run.terrain.length + index
    const support = contacts.support?.collider
    const passengers = run.props.filter(b => propLoadsPlate(b, m.x, m.y, def.w))
    const onProp = support?.prop && passengers.includes(support.prop)
    const rider = onProp || support?.id === `mechanism:${index}`
      || p.hang?.platform === platformIndex || !!p.mantle && !p.mantle.step && Math.abs(p.mantle.edgeY - m.y) < .2 && p.mantle.edgeX >= m.x && p.mantle.edgeX <= m.x + def.w
    const obstacles = run.platforms.filter((b, i) => i !== platformIndex && b !== support?.platform)
    const solids = [...run.terrain, ...run.mechanisms.filter(other => other !== m).map(mechanismShape)]
    const passengerBlocked = (dx: number, dy: number) => passengers.some(b => solids.some(s => propBlocksMechanism(b, s, { ...s, x: s.x - dx, y: s.y - dy })))
    if (m.safetyHold != null && m.x === open.x && m.y === open.y) {
      // After reversing, wait for the whole closing path to clear. A small pause
      // gives the player time to step out instead of trapping them on each retry.
      const path = mechanismSweep(def), dx = def.x - m.x, dy = def.y - m.y
      const carry = rider ? moveBody([p.x, p.y], [p.x + dx, p.y + dy], obstacles, p.crouching ? TUNING.crouchHeight : TUNING.height) : null
      let occupied = bodyOverlap(p, path) || run.props.some(b => !passengers.includes(b) && polygonIntersects(polygonPoints(b.kind === 'box' ? boxShape(b) : ballShape(b)), path, .01))
        || !!carry && Math.hypot(carry.x - p.x - dx, carry.y - p.y - dy) > .01
      // Sample passenger travel as well as its destination so a carried box
      // cannot repeatedly run into a wall halfway through the closing stroke.
      const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 8))
      for (let i = 1; !occupied && passengers.length && i <= steps; i++) occupied = passengerBlocked(dx * i / steps, dy * i / steps)
      m.safetyHold = occupied ? 0 : m.safetyHold + dt
      if (m.safetyHold >= .6) m.safetyHold = null
    }
    const opening = def.kind === 'gate' ? m.active || m.safetyHold != null : m.direction < 0
    const target = opening ? open : def
    if (m.x === target.x && m.y === target.y) {
      if (def.kind === 'lift') reverseLift(m)
      continue
    }
    const before = mechanismShape(m)
    const speed = def.kind === 'gate' && !opening ? 65 : 130
    let x = approach(m.x, target.x, speed * dt), y = approach(m.y, target.y, speed * dt)
    let dx = x - m.x, dy = y - m.y
    const nextShape = { ...def, x, y }
    const liftHull = def.kind === 'lift' ? polygonPoints(nextShape) : null
    const terrainBlocked = liftHull && solids.some(s => x < s.x + s.w && x + def.w > s.x && y < s.y + s.h && y + def.h > s.y
      && polygonIntersects(liftHull, s, .01))
    // A rising top can meet airborne feet between player steps. Board it just
    // like a landing; only side/underside contact or a blocked carry ends a trip.
    const boarding = def.kind === 'lift' && !rider && dy < 0 && p.y <= m.y + .01 && bodyOverlap(p, nextShape)
    const playerBlocked = rider || boarding
      ? obstacles.some(b => bodyOverlap({ ...p, x: p.x + dx }, b, boarding ? y - p.y : dy))
      : bodyOverlap(p, nextShape)
    const propsBlocked = run.props.some(b => !passengers.includes(b) && propBlocksMechanism(b, before, nextShape)) || passengerBlocked(dx, dy)
    let motion = !terrainBlocked && !playerBlocked && propsBlocked && def.kind === 'lift'
      ? planLiftPropMotion(run, index, nextShape, passengers, !!rider, support?.prop, dt, boarding) : null
    // Near the crown of a ball, a short downward step needs much more rolling
    // travel. Shorten that step before declaring a genuinely blocked lift.
    if (!terrainBlocked && !playerBlocked && propsBlocked && def.kind === 'lift' && !motion) for (let part = 2; part <= 32; part *= 2) {
      motion = planLiftPropMotion(run, index, { ...nextShape, x: m.x + dx / part, y: m.y + dy / part }, passengers, !!rider, support?.prop, dt, boarding)
      if (motion) { dx /= part; dy /= part; x = m.x + dx; y = m.y + dy; break }
    }
    const blocked = terrainBlocked || playerBlocked || propsBlocked && !motion
    if (blocked) {
      if (def.kind === 'gate' && !opening) m.safetyHold = 0
      // An obstruction is this trip's endpoint, not a permanent shortened path.
      // Retry the full stroke next cycle so moving obstacles can free it again.
      if (def.kind === 'lift') reverseLift(m)
      continue
    }
    m.x = x; m.y = y
    if (motion) translatePlayer(p, motion.player.x - p.x, motion.player.y - p.y)
    else if (rider) translatePlayer(p, dx, dy)
    else if (boarding) translatePlayer(p, dx, Math.min(0, y - p.y))
    for (const b of passengers) { b.x += dx; b.y += dy }
    for (const moved of motion?.balls ?? []) {
      const b = moved.prop, shiftX = moved.x - b.x, shiftY = moved.y - b.y
      b.x = moved.x; b.y = moved.y; b.angle += shiftX / (b.size / 2)
      // Preserve existing momentum, adding only the velocity needed to yield
      // to the platform. A failed trial never imparts a force or a displacement.
      if (Math.abs(shiftX) > .001 && b.vx * Math.sign(shiftX) < Math.abs(shiftX) / dt) b.vx = shiftX / dt
      if (Math.abs(shiftY) > .001 && b.vy * Math.sign(shiftY) < Math.abs(shiftY) / dt) b.vy = shiftY / dt
    }
    if (x === target.x && y === target.y && def.kind === 'lift') reverseLift(m)
  }
}
function stepProps(run: Run, contacts: PlayerContacts, dt: number, powered: boolean) {
  if (!run.props.length) return
  // Fixed small steps stabilize corners; fast linear or angular motion takes
  // additional steps so even a small prop cannot skip a thin wall or another prop.
  const travel = Math.max(175, ...run.props.map(b => Math.hypot(b.vx, b.vy) + Math.abs(b.angularVelocity) * b.size + TUNING.gravity * dt)) * dt
  const steps = Math.max(1, Math.ceil(dt * 240), Math.ceil(travel / (Math.min(...run.props.map(b => b.size)) * .15))), h = dt / steps
  for (let step = 0; step < steps; step++) stepPropPhysics(run, contacts, h, powered)
}
function stepTriggers(run: Run, dt: number, powered = run.empRemaining === 0) {
  const activeTargets = new Set<string>()
  run.level.triggers.forEach((plate, index) => {
    const sensor = run.triggers[index]
    if (plate.mode === 'coins') {
      // Coins still fill the meter without power. Once switched, it is latched
      // independently of the supply, including when another EMP is collected.
      sensor.active ||= powered && run.coinsCollected >= plate.threshold
      if (sensor.active) for (const id of triggerTargets(plate)) activeTargets.add(id)
      return
    }
    const weighted = run.props.some(b => propLoadsPlate(b, plate.x, plate.y, plate.w))
    const touched = run.player.grounded && Math.abs(run.player.y - plate.y) < 3 && run.player.x >= plate.x && run.player.x <= plate.x + plate.w
    sensor.held = weighted || touched ? sensor.held + dt : 0
    sensor.active = powered && sensor.held >= .15
    if (sensor.active) for (const id of triggerTargets(plate)) activeTargets.add(id)
    sensor.depression = approach(sensor.depression, weighted || touched ? 1 : 0, dt / .12)
  })
  // Any active switch can power a shared mechanism.
  for (const mechanism of run.mechanisms) mechanism.active = activeTargets.has(mechanism.definition.id)
}
function stepRobots(run: Run, dt: number, world: ContactWorld) {
  const p = run.player
  const oldX = p.x
  for (const r of run.robots) {
    const bounds = r.definition, gap = p.x - r.x
    // Reuse the current collision shapes and publish this result for rendering.
    const seesPlayer = r.seesPlayer = robotSensesPlayer(r, p, robotSightObstacles(world, r))
    if (!seesPlayer && (r.phase === 'chase' || r.phase === 'windup' || r.phase === 'charge')) { r.phase = 'patrol'; r.time = 0 }
    r.time += dt
    let speed = 0
    if (r.phase === 'patrol' || r.phase === 'chase') {
      r.phase = seesPlayer ? 'chase' : 'patrol'
      if (seesPlayer) {
        r.facing = Math.sign(gap) || r.facing
        if (Math.abs(gap) < 145 && Math.abs(p.y - r.y) < 95) { r.phase = 'windup'; r.time = 0 }
      }
      speed = r.phase === 'chase' ? 235 : r.phase === 'patrol' ? 92 : 0
    } else if (r.phase === 'windup' && r.time >= .22) { r.phase = 'charge'; r.time = 0 }
    else if (r.phase === 'charge') {
      speed = 540
      if (r.time >= .52 || r.x <= bounds.left || r.x >= bounds.right) { r.phase = 'recover'; r.time = 0 }
    } else if (r.phase === 'recover' && r.time >= .34) { r.phase = 'chase'; r.time = 0 }
    if (speed) {
      const x = approach(r.x, Math.max(bounds.left, Math.min(bounds.right, r.x + r.facing * speed * dt)), speed * dt)
      const props = run.props.map(b => b.kind === 'box' ? boxShape(b) : ballShape(b))
      const blocked = !moveRobot(run.platforms, r, x, props, p)
      if ((blocked && !robotTouchesProps(r, props, 3) || x === bounds.left || x === bounds.right) && r.phase === 'patrol') r.facing *= -1
    }
  }
  // Contact imparts only the motion actually resolved, with no launch impulse
  // or proximity trigger. Ground friction handles the subsequent slowdown.
  const pushed = (p.x - oldX) / dt
  if (pushed > 0) p.vx = Math.max(p.vx, pushed)
  else if (pushed < 0) p.vx = Math.min(p.vx, pushed)
}
/** Only feet/bottom contact loads the plate; passing through the light or over it does not. */
function goalPressed(run: Run) {
  const goal = run.level.goal, half = GOAL_PLATE_WIDTH / 2
  const contact = (body: { x: number; y: number; grounded: boolean }, footprint: number) =>
    body.grounded && Math.abs(body.y - goal.y) < 2 && Math.abs(body.x - goal.x) < half + footprint - 2
  return contact(run.player, TUNING.width / 2) || run.props.some(prop => propLoadsPlate(prop, goal.x - half, goal.y, GOAL_PLATE_WIDTH))
}
function collectPickups(run: Run, dt: number) {
  const collected = stepPickups(run.pickups, run.player, dt, true)
  run.timeStopRemaining += collected.seconds
  run.timeFastRemaining += collected.fastSeconds
  run.empRemaining += collected.empSeconds
  if (collected.empSeconds) for (const robot of run.robots) robot.vx = 0
  run.coinsCollected += collected.coins
  run.elapsed = Math.max(0, run.elapsed + collected.timeAdded - collected.timeOff)
}
export function stepRun(run: Run, input: JumpInput, dt = STEP) {
  if (run.finished) return
  if (run.pickups.length) run.pickupTime += dt
  if (!run.started && (Math.abs(input.move) > .01 || input.jump || input.climb || input.descend || input.crouch)) run.started = true
  if (!run.started) { collectPickups(run, dt); stepTriggers(run, 0); return }
  run.activeTime += dt
  if (run.goalLit) run.goalElapsed = Math.min(GOAL_OPEN_SECONDS, run.goalElapsed + dt)
  if (!run.exit) {
    const stopped = Math.min(dt, run.timeStopRemaining)
    // Both effects expire in gameplay time. Only the unfrozen part of a
    // fast-watch interval earns extra time, including partial final steps.
    const fast = Math.min(dt, run.timeFastRemaining)
    run.timeStopRemaining = Math.max(0, run.timeStopRemaining - stopped)
    run.timeFastRemaining = Math.max(0, run.timeFastRemaining - dt)
    run.elapsed += dt - stopped + Math.max(0, fast - stopped)
  }
  if (run.exit) {
    const p = run.player, from: [number, number] = [p.x, p.y]
    run.exit.elapsed = Math.min(GOAL_EXIT_SECONDS, run.exit.elapsed + dt)
    p.x = goalExitPosition(run.exit); p.vx = (p.x - from[0]) / dt
    finishPlayerStep(p, NEUTRAL_INPUT, dt, syncPlatforms(run), from)
    stepPickups(run.pickups, p, dt, false)
    run.goalDepression = approach(run.goalDepression, 0, dt / .12)
    run.finished = run.exit.elapsed >= GOAL_EXIT_SECONDS
    return
  }
  // Collect intent, advance the contacted world, then solve player motion once.
  // Geometry is refreshed after moving bodies; the contact policy is shared.
  let world = syncPlatforms(run)
  const poweredDt = dt > run.empRemaining + 1e-9 ? dt - run.empRemaining : 0, powered = poweredDt > 0
  stepTriggers(run, poweredDt, powered)
  if (powered) stepMechanisms(run, poweredDt, playerContacts(run.player, input, world))
  world = syncPlatforms(run)
  const rider = playerContacts(run.player, input, world).support
  const robotStarts = run.robots.map(r => r.x)
  if (powered) stepRobots(run, poweredDt, world)
  stepProps(run, playerContacts(run.player, input, world), dt, powered)
  run.robots.forEach((r, i) => { r.vx = (r.x - robotStarts[i]) / dt })
  world = syncPlatforms(run)
  if (rider?.collider.robot && run.player.grounded) {
    const next = world.colliders.find(c => c.id === rider.collider.id)!
    const p = run.player, surface = groundAt([next.platform], p.x, p.y, 20)
    if (surface) {
      // Follow roof height/tilt, but let friction supply horizontal transport.
      // A ceiling can stop the carry; it must never push the rider through it.
      const safe = moveBody([p.x, p.y], [p.x, surface.y], world.colliders.filter(c => c.robot !== rider.collider.robot).map(c => c.platform), p.crouching ? TUNING.crouchHeight : TUNING.height)
      translatePlayer(p, safe.x - p.x, safe.y - p.y)
    } else p.grounded = false
  }
  const pGrip = run.player.hang ?? (run.player.mantle?.step ? null : run.player.mantle)
  const held = pGrip?.platform === undefined ? undefined : world.colliders[pGrip.platform]
  if (held?.prop && pGrip) {
    const edge = platformLedges(held.platform).find(e => e.side === pGrip.side)
    if (edge) translatePlayer(run.player, edge.edgeX - pGrip.edgeX, edge.edgeY - pGrip.edgeY)
    else { run.player.hang = null; run.player.mantle = null; run.player.grounded = false; run.player.grabCooldown = .25; cancelJumpInput(run.player) }
  }
  stepPlayer(run.player, input, dt, world.platforms, run.level.climbables, { checkpoints: [], fallY: Infinity }, world)
  // EMP time is gameplay time, independent of every clock collectible. Spend
  // the old duration before collection so a fresh pulse gets its full five seconds.
  run.empRemaining = Math.max(0, run.empRemaining - dt)
  if (run.empRemaining < 1e-9) run.empRemaining = 0
  // Pickups remain available until entry, including one touched on the entry step.
  collectPickups(run, dt)
  stepTriggers(run, 0)
  const pressed = goalPressed(run)
  run.goalDepression = approach(run.goalDepression, pressed ? 1 : 0, dt / .12)
  if (pressed) run.goalLit = true
  const p = run.player, door = goalDoor(run.level.goal)
  if (run.goalLit && run.goalElapsed >= GOAL_OPEN_SECONDS && p.grounded && !p.hang && !p.mantle && !p.climbing
    && Math.abs(p.y - run.level.goal.y) < 2 && p.x + TUNING.width / 2 > door.x + 4 && p.x - TUNING.width / 2 < door.x + door.w - 4
    && !run.platforms.some(b => bodyOverlap(p, b))) {
    // This is a doorway in the back wall. Reaching it permits entry even when
    // a loose prop blocks a sideways step toward its center.
    const intoDoor = moveBody([p.x, p.y], [door.x + door.w / 2, p.y], run.platforms)
    run.exit = { elapsed: 0, fromX: p.x, toX: intoDoor.x }
    run.medal = medalFor(run.elapsed, run.level)
    p.vx = 0; p.vy = 0; p.pushing = null; p.wallBrace = null; p.sliding = null
    cancelJumpInput(p)
  }
}
