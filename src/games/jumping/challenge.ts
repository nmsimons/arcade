import { bodyIntersects, moveBody, polygonIntersects, polygonPoints } from './geometry.ts'
import { cancelJumpInput, finishPlayerStep, NEUTRAL_INPUT, STEP, stepPlayer, TUNING } from './model.ts'
import type { JumpInput, Platform, Player } from './model.ts'
import { levelPlayer, levelTerrain, prepareLevelRopes, triggerTargets } from './level.ts'
import type { PuzzleLevel, Mechanism, Pusher } from './level.ts'
export type { PuzzleLevel } from './level.ts'
import { moveRobot, prepareRobots } from './robotPhysics.ts'
import { GOAL_PLATE_WIDTH, GOAL_OPEN_SECONDS, GOAL_EXIT_SECONDS, goalDoor, goalExitPosition } from './goal.ts'
import type { GoalExit } from './goal.ts'
import { stepPickups } from './pickups.ts'
import type { PickupState } from './pickups.ts'
import { planLiftPropMotion, prepareProps, propBlocksMechanism, stepPropPhysics } from './propPhysics.ts'
import { ballShape, boxShape, propLoadsPlate } from './propGeometry.ts'
import { playerContacts, translatePlayer } from './playerContacts.ts'
import type { ContactWorld, PlayerContacts } from './playerContacts.ts'
import { mechanismOpenPosition, mechanismShape, mechanismSweep, prepareMechanism } from './mechanisms.ts'

export type Medal = 'Gold' | 'Silver' | 'Bronze' | 'No medal'
export interface Prop {
  kind: 'box' | 'ball'; x: number; y: number; size: number; vx: number; vy: number; angle: number; angularVelocity: number; grounded: boolean
}
export interface MechanismState { definition: Mechanism; x: number; y: number; direction: number; wait: number; active: boolean; safetyHold: number | null }
export interface RobotState { definition: Pusher; x: number; y: number; angle: number; facing: number; phase: 'patrol' | 'chase' | 'windup' | 'charge' | 'recover'; time: number; hit: boolean }
export interface Run {
  level: PuzzleLevel; player: Player; props: Prop[]; platforms: Platform[]; terrain: Platform[]
  mechanisms: MechanismState[]; triggers: { held: number; active: boolean; depression: number }[]; robots: RobotState[]; shoveCooldown: number
  pickups: PickupState[]; activeTime: number; timeStopRemaining: number
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
  level = prepareLevelRopes(level)
  const run: Run = { level, player: levelPlayer(level), props: level.props.map(p => ({ ...p, vx: 0, vy: 0, angle: 0, angularVelocity: 0, grounded: true })),
    terrain: levelTerrain(level), platforms: [],
    mechanisms: level.mechanisms.map(m => {
      const definition = prepareMechanism(m, level.floor)
      return { definition, x: definition.x, y: definition.y, direction: -1, wait: 0, active: false, safetyHold: null }
    }),
    triggers: level.triggers.map(() => ({ held: 0, active: false, depression: 0 })),
    robots: level.robots.map(definition => ({ definition, x: definition.x, y: definition.y, angle: 0, facing: -1, phase: 'patrol', time: 0, hit: false })),
    pickups: (level.pickups ?? []).map(definition => ({ definition, collectedAge: null })), activeTime: 0, timeStopRemaining: 0,
    shoveCooldown: 0, elapsed: 0, started: false, goalLit: false, goalElapsed: 0, exit: null, finished: false, goalDepression: 0, medal: null }
  prepareProps(run); syncPlatforms(run)
  prepareRobots(run.platforms, run.robots)
  return run
}
function syncPlatforms(run: Run): ContactWorld {
  const colliders = [...run.terrain.map((platform, i) => ({ id: `terrain:${i}`, platform })),
    ...run.mechanisms.map((m, i) => ({ id: `mechanism:${i}`, platform: mechanismShape(m) })),
    ...['box', 'ball'].flatMap(kind => run.props.flatMap((prop, i) => prop.kind === kind
      ? [{ id: `prop:${i}`, prop, platform: prop.kind === 'box' ? boxShape(prop) : ballShape(prop) }] : []))]
  run.platforms = colliders.map(c => c.platform)
  return { platforms: run.platforms, colliders }
}
const approach = (from: number, to: number, delta: number) => from + Math.max(-delta, Math.min(delta, to - from))
const bodyOverlap = (p: Player, b: Platform, dy = 0) => bodyIntersects(p.x, p.y + dy, b)
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
      || p.hang?.platform === platformIndex || !!p.mantle && Math.abs(p.mantle.edgeY - m.y) < .2 && p.mantle.edgeX >= m.x && p.mantle.edgeX <= m.x + def.w
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
    if (m.x === target.x && m.y === target.y) continue
    const before = mechanismShape(m)
    let x = approach(m.x, target.x, 130 * dt), y = approach(m.y, target.y, 130 * dt)
    let dx = x - m.x, dy = y - m.y
    const nextShape = { ...def, x, y }
    const playerBlocked = rider ? obstacles.some(b => bodyOverlap({ ...p, x: p.x + dx }, b, dy)) : bodyOverlap(p, nextShape)
    const propsBlocked = run.props.some(b => !passengers.includes(b) && propBlocksMechanism(b, before, nextShape)) || passengerBlocked(dx, dy)
    let motion = !playerBlocked && propsBlocked && def.kind === 'lift'
      ? planLiftPropMotion(run, index, nextShape, passengers, !!rider, support?.prop, dt) : null
    // Near the crown of a ball, a short downward step needs much more rolling
    // travel. Shorten that step before declaring a genuinely blocked lift.
    if (!playerBlocked && propsBlocked && def.kind === 'lift' && !motion) for (let part = 2; part <= 32; part *= 2) {
      motion = planLiftPropMotion(run, index, { ...nextShape, x: m.x + dx / part, y: m.y + dy / part }, passengers, !!rider, support?.prop, dt)
      if (motion) { dx /= part; dy /= part; x = m.x + dx; y = m.y + dy; break }
    }
    const blocked = playerBlocked || propsBlocked && !motion
    if (blocked) {
      if (def.kind === 'gate' && !opening) m.safetyHold = 0
      continue
    }
    m.x = x; m.y = y
    if (motion) translatePlayer(p, motion.player.x - p.x, motion.player.y - p.y)
    else if (rider) translatePlayer(p, dx, dy)
    for (const b of passengers) { b.x += dx; b.y += dy }
    for (const moved of motion?.balls ?? []) {
      const b = moved.prop, shiftX = moved.x - b.x, shiftY = moved.y - b.y
      b.x = moved.x; b.y = moved.y; b.angle += shiftX / (b.size / 2)
      // Preserve existing momentum, adding only the velocity needed to yield
      // to the platform. A failed trial never imparts a force or a displacement.
      if (Math.abs(shiftX) > .001 && b.vx * Math.sign(shiftX) < Math.abs(shiftX) / dt) b.vx = shiftX / dt
      if (Math.abs(shiftY) > .001 && b.vy * Math.sign(shiftY) < Math.abs(shiftY) / dt) b.vy = shiftY / dt
    }
    if (x === target.x && y === target.y && def.kind === 'lift') { m.direction *= -1; m.wait = opening ? 3 : 2 }
  }
}
function stepProps(run: Run, contacts: PlayerContacts, dt: number) {
  if (!run.props.length) return
  // Fixed small steps stabilize corners; fast linear or angular motion takes
  // additional steps so even a small prop cannot skip a thin wall or another prop.
  const travel = Math.max(175, ...run.props.map(b => Math.hypot(b.vx, b.vy) + Math.abs(b.angularVelocity) * b.size + TUNING.gravity * dt)) * dt
  const steps = Math.max(1, Math.ceil(dt * 240), Math.ceil(travel / (Math.min(...run.props.map(b => b.size)) * .15))), h = dt / steps
  for (let step = 0; step < steps; step++) stepPropPhysics(run, contacts, h)
}
function stepTriggers(run: Run, dt: number) {
  const activeTargets = new Set<string>()
  run.level.triggers.forEach((plate, index) => {
    const sensor = run.triggers[index]
    const weighted = run.props.some(b => propLoadsPlate(b, plate.x, plate.y, plate.w))
    const touched = run.player.grounded && Math.abs(run.player.y - plate.y) < 3 && run.player.x >= plate.x && run.player.x <= plate.x + plate.w
    sensor.held = weighted || touched ? sensor.held + dt : 0
    sensor.active = sensor.held >= .15
    if (sensor.active) for (const id of triggerTargets(plate)) activeTargets.add(id)
    sensor.depression = approach(sensor.depression, weighted || touched ? 1 : 0, dt / .12)
  })
  // Any held plate can power a shared mechanism; released plates never latch it on.
  for (const mechanism of run.mechanisms) mechanism.active = activeTargets.has(mechanism.definition.id)
}
function stepRobots(run: Run, dt: number) {
  const p = run.player
  run.shoveCooldown = Math.max(0, run.shoveCooldown - dt)
  for (const r of run.robots) {
    const bounds = r.definition, gap = p.x - r.x
    const seesPlayer = Math.abs(p.y - r.y) < 240 && Math.abs(gap) < 850 && p.x >= bounds.left - 200 && p.x <= bounds.right + 200
    r.time += dt
    let speed = 0
    if (r.phase === 'patrol' || r.phase === 'chase') {
      r.phase = seesPlayer ? 'chase' : 'patrol'
      if (seesPlayer) {
        r.facing = Math.sign(gap) || r.facing
        if (Math.abs(gap) < 145 && Math.abs(p.y - r.y) < 95) { r.phase = 'windup'; r.time = 0; r.hit = false }
      }
      speed = r.phase === 'chase' ? 235 : r.phase === 'patrol' ? 92 : 0
    } else if (r.phase === 'windup' && r.time >= .22) { r.phase = 'charge'; r.time = 0 }
    else if (r.phase === 'charge') {
      speed = 540
      if (!r.hit && run.shoveCooldown === 0 && Math.abs(p.x - r.x) < 52 && p.y > r.y - 52 && p.y - 62 < r.y && !p.mantle) {
        p.hang = null; p.climbing = null; p.wallBrace = null; p.wallJump = null; p.grabCooldown = .5
        p.knockback = r.facing * 510; p.vx = p.knockback; p.vy = -170; p.grounded = false; p.footwork = null
        cancelJumpInput(p); r.hit = true; run.shoveCooldown = .8
      }
      for (const b of run.props) if (Math.abs(b.x - r.x) < b.size / 2 + 34 && Math.abs(b.y - r.y) < 60) b.vx = r.facing * (b.kind === 'ball' ? 500 : 280)
      if (r.time >= .52 || r.x <= bounds.left || r.x >= bounds.right) { r.phase = 'recover'; r.time = 0 }
    } else if (r.phase === 'recover' && r.time >= .34) { r.phase = 'chase'; r.time = 0 }
    if (speed) {
      const x = Math.max(bounds.left, Math.min(bounds.right, r.x + r.facing * speed * dt))
      const blocked = !moveRobot(run.platforms, r, x)
      if ((blocked || x === bounds.left || x === bounds.right) && r.phase === 'patrol') r.facing *= -1
    }
  }
}
/** Only feet/bottom contact loads the plate; passing through the light or over it does not. */
function goalPressed(run: Run) {
  const goal = run.level.goal, half = GOAL_PLATE_WIDTH / 2
  const contact = (body: { x: number; y: number; grounded: boolean }, footprint: number) =>
    body.grounded && Math.abs(body.y - goal.y) < 2 && Math.abs(body.x - goal.x) < half + footprint - 2
  return contact(run.player, TUNING.width / 2) || run.props.some(prop => propLoadsPlate(prop, goal.x - half, goal.y, GOAL_PLATE_WIDTH))
}
export function stepRun(run: Run, input: JumpInput, dt = STEP) {
  if (run.finished) return
  if (!run.started && (Math.abs(input.move) > .01 || input.jump || input.climb || input.descend)) run.started = true
  if (!run.started) { run.timeStopRemaining += stepPickups(run.pickups, run.player, dt, true); return }
  run.activeTime += dt
  if (run.goalLit) run.goalElapsed = Math.min(GOAL_OPEN_SECONDS, run.goalElapsed + dt)
  if (!run.exit) {
    const stopped = Math.min(dt, run.timeStopRemaining)
    run.timeStopRemaining = Math.max(0, run.timeStopRemaining - stopped)
    run.elapsed += dt - stopped
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
  stepTriggers(run, dt); stepMechanisms(run, dt, playerContacts(run.player, input, world))
  world = syncPlatforms(run)
  stepRobots(run, dt)
  stepProps(run, playerContacts(run.player, input, world), dt)
  world = syncPlatforms(run)
  stepPlayer(run.player, input, dt, run.platforms, run.level.climbables, { checkpoints: [], fallY: Infinity }, world)
  // Pickups remain available until entry, including one touched on the entry step.
  run.timeStopRemaining += stepPickups(run.pickups, run.player, dt, true)
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
