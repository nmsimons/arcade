import { bodyIntersects, lineBlocked, moveBody, polygonIntersects, polygonPoints } from './geometry.ts'
import { ropePath } from './climbables.ts'
import { cancelJumpInput, finishPlayerStep, NEUTRAL_INPUT, STEP, stepPlayer, TUNING } from './model.ts'
import type { JumpInput, Platform, Player } from './model.ts'
import { levelHeight, levelPlayer, levelTerrain, prepareLevelRopes } from './level.ts'
import { resolveSwitchStates } from './switchPower.ts'
import { triggerStartsOn, triggerToggleGroup } from './toggleGroups.ts'
import { pressurePlatePosition } from './pressurePlateMount.ts'
import type { PuzzleLevel, Mechanism, Pusher, PropDefinition } from './level.ts'
export type { PuzzleLevel } from './level.ts'
import { faceRobotToward, moveRobot, prepareRobots, robotPlatforms, robotPreviewPose, robotSensesPlayer, robotSightObstacles, robotTouchesPlayer, robotTouchesProps, settleRobot, stepRobotFall, stepRobotRecoil } from './robotPhysics.ts'
import { groundAt } from './terrain.ts'
import { canGrip } from './friction.ts'
import { advanceEntranceAnimation, createEntranceAnimation, entranceDuration, entranceFits, GOAL_OPEN_SECONDS, GOAL_EXIT_SECONDS, goalDoor, goalExitPosition } from './goal.ts'
import type { EntranceAnimation, GoalExit } from './goal.ts'
import { stepPickups } from './pickups.ts'
import { gradeFor, gradeTimes } from './grading.ts'
import type { Grade } from './grading.ts'
export { gradeFor } from './grading.ts'
import type { PickupState } from './pickups.ts'
import { planMechanismMotion, prepareProps, propBlocksMechanism, stepPropPhysics } from './propPhysics.ts'
import { ballShape, boxShape, propLoadsPlate } from './propGeometry.ts'
import { followPropGrip, playerContacts, translatePlayer } from './playerContacts.ts'
import { advanceFootwork } from './footwork.ts'
import type { ContactWorld, PlayerCollider, PlayerContacts } from './playerContacts.ts'
import { mechanismOpenPosition, mechanismShape, mechanismSweep, prepareMechanism } from './mechanisms.ts'
import { canHangFromBox } from './boxSupport.ts'
import { disablePlatformLedges } from './terrainLedges.ts'

import { createGravityField, playerFieldCoverage, playerFloatDrag, playerGravity, playerSwimStrength, playerSwimDepth, propGravity, setPlayerGravity, swimmingAcceleration, updateGravityField } from './gravity.ts'
import { waterBobAcceleration } from './waterBob.ts'
import { advanceWaterSurface, createWaterSurface, setWaterSurfaceEnabled } from './waterSurface.ts'
import type { WaterSurfaceState } from './waterSurface.ts'
import { advanceWaterLevels, createWaterLevels } from './waterLevel.ts'
import type { WaterLevels } from './waterLevel.ts'
import { waterSpace } from './waterTerrain.ts'
import type { GravityPlate } from './gravity.ts'
import { propWeightScale } from './propWeight.ts'
import type { WaterBob } from './waterBob.ts'
import type { GravityField } from './gravity.ts'
import { createForceField, forceFieldPlatforms, updateForceFields } from './forceField.ts'
import type { ForceFieldState } from './forceField.ts'
import { mirrorPlatform } from './gravityFrame.ts'
import { advanceGadgetDisables, createGadgetState, finishGadgetMotion, heldToolFrame, prepareGadgets, toolShape } from './gadgets.ts'
import type { GadgetState } from './gadgets.ts'
import { createRepulsorActor, stepRepulsorBot } from './repulsorBot.ts'
import { applyContactEmp } from './contactEmp.ts'
import { chooseShovebotTarget, ramRival } from './botCombat.ts'
import { recordPlayerNoise, resetPlayerNoise } from './botHearing.ts'
import { preparePlayerShove } from './shove.ts'

import { createFloatSwitch, updateFloatSwitch } from './floatSwitch.ts'
import type { FloatSwitch, FloatSwitchState } from './floatSwitch.ts'

export interface Prop extends PropDefinition {
  gadgetCooldown?: number
  floatSwitch?: FloatSwitch
  gravity?: number
  waterBob?: WaterBob
  waterImmersion?: number
  vx: number; vy: number; angle: number; angularVelocity: number; grounded: boolean
}
export interface MechanismState { definition: Mechanism; x: number; y: number; direction: number; wait: number; active: boolean; safetyHold: number | null }
export interface RobotState { definition: Pusher; x: number; y: number; vx: number; angle: number; facing: number; phase: 'patrol' | 'chase' | 'windup' | 'charge' | 'recover'; time: number; seesPlayer: boolean; recoilVx?: number; fallVelocity?: number; deactivated?: boolean; actor?: Player; aim?: number; shots?: number; rams?: number; entrance?: EntranceAnimation; awakening?: { elapsed: number; triggered: boolean } }
export interface Run {
  gadgets: GadgetState
  level: PuzzleLevel; player: Player; props: Prop[]; platforms: Platform[]; terrain: Platform[]
  mechanisms: MechanismState[]; triggers: { held: number; pressed: boolean; active: boolean; depression: number }[]; robots: RobotState[]
  forceFields: ForceFieldState[]
  floatSwitches: FloatSwitchState[]
  switchStates: Map<string, boolean>; gravityField: GravityField
  toggleGroupStates: Map<string, boolean>
  waterSurface?: WaterSurfaceState
  water: WaterLevels; waterSpaces: Map<GravityPlate, ReturnType<typeof waterSpace>>; waterEffectsEnabled: boolean
  pickups: PickupState[]; pickupTime: number; coinsCollected: number; activeTime: number; timeStopRemaining: number; timeFastRemaining: number; empRemaining: number
  elapsed: number; started: boolean; entrance: EntranceAnimation | null; goalLit: boolean; goalElapsed: number; exit: GoalExit | null
  finished: boolean; grade: Grade | null; failed: boolean
}
export const BEST_TIME_KEY = 'arcade.jumping.times.v1'
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
/** Placement ghosts and complete worlds start from the same robot rig and state. */
export function createRobotState(definition: Pusher): RobotState {
  return { definition, x: definition.x, y: definition.y, vx: 0, angle: 0, facing: -1, phase: 'patrol', time: 0, seesPlayer: false,
    ...(definition.kind === 'repulsor' ? { actor: createRepulsorActor(definition.x, definition.y),
      ...(definition.chargingBay ? { awakening: { elapsed: 0, triggered: false } } : {}) } : {}) }
}
export function setWaterEffectsEnabled(run: Run, enabled: boolean) {
  if (run.waterEffectsEnabled === enabled) return
  run.waterEffectsEnabled = enabled
  if (enabled) run.waterSurface = createWaterSurface(run.water.plates, run.terrain, run.player, run.props, run.gravityField, run.waterSurface)
  if (run.waterSurface) setWaterSurfaceEnabled(run.waterSurface, run.player, run.props, run.gravityField, enabled)
}
function createInitialWorld(level: PuzzleLevel, preview = false): Run {
  const floats = (level.floatSwitches ?? []).map(createFloatSwitch)
  const run: Run = { gadgets: createGadgetState(), floatSwitches: floats, level, player: levelPlayer(level, preview), props: level.props.map(p => ({ ...p, vx: 0, vy: 0, angle: 0, angularVelocity: 0, grounded: true })),
    terrain: levelTerrain(level), platforms: [],
    mechanisms: level.mechanisms.map(m => {
      const definition = prepareMechanism(m, level.floor)
      return { definition, x: definition.x, y: definition.y, direction: -1, wait: 0, active: false, safetyHold: null }
    }),
    triggers: level.triggers.map(t => ({ held: 0, pressed: false, active: triggerStartsOn(level, t), depression: 0 })),
    toggleGroupStates: new Map((level.toggleGroups ?? []).map(g => [g.id, !!g.startsOn])),
    robots: level.robots.map(createRobotState),
    pickups: (level.pickups ?? []).map(definition => ({ definition, collectedAge: null })), pickupTime: 0, coinsCollected: 0, activeTime: 0, timeStopRemaining: 0, timeFastRemaining: 0, empRemaining: 0,
    water: createWaterLevels(level.gravityPlates ?? []), waterSpaces: new Map(), waterEffectsEnabled: true,
    forceFields: (level.forceFields ?? []).map(createForceField), switchStates: new Map(), gravityField: createGravityField(), elapsed: 0, started: false, entrance: null, goalLit: false, goalElapsed: 0, exit: null, finished: false, grade: null, failed: false }
  run.props.push(...floats.map(f => f.prop))
  for (const pool of run.water.pools) run.waterSpaces.set(pool.region, waterSpace({ ...pool.definition, y: pool.definition.y - 6, h: pool.definition.h + 6 }, run.terrain))
  updateSwitchTargets(run)
  if (run.goalLit) run.goalElapsed = GOAL_OPEN_SECONDS
  if (!preview) {
    prepareProps(run); syncPlatforms(run)
    prepareRobots([...run.platforms, ...forceFieldPlatforms(run.forceFields, 'objects')], run.robots)
  } else if (run.robots.length) {
    syncPlatforms(run)
    const solids = [...run.platforms, ...forceFieldPlatforms(run.forceFields, 'objects')]
    for (const robot of run.robots) if (!robot.actor) Object.assign(robot, robotPreviewPose(solids, robot))
  }
  if (run.robots.length) {
    const world = syncPlatforms(run)
    for (const robot of run.robots) robot.seesPlayer = robotSensesPlayer(robot, run.player, robotSightObstacles(world, robot))
  }
  // Publish the ready frame from the final prepared geometry. This is a
  // contact query, not a simulation tick: clocks, props and ropes stay still.
  const world = syncPlatforms(run), p = run.player
  const ground = groundAt(world.platforms, p.x, p.y, .2, surface => canGrip(surface.angle))
  p.grounded = !!ground
  p.groundAngle = ground?.angle ?? 0
  p.contacts = playerContacts(p, NEUTRAL_INPUT, world)
  p.terrain = world.platforms
  advanceFootwork(p, 0, p.x, world.platforms)
  resetPlayerNoise(run)
  run.waterSurface = createWaterSurface(run.water.plates, run.terrain, p, run.props, run.gravityField)
  if (!preview) {
    run.entrance = createEntranceAnimation(p, world.platforms, level.entrance)
    // Presentation uses ordinary object geometry, without the bots' own bodies.
    // Unsupported or obstructed authored starts stay in place for manual repair.
    const solids = [...run.platforms, ...forceFieldPlatforms(run.forceFields, 'objects')]
    for (const robot of run.robots) if (robot.actor && !robot.definition.chargingBay
      && entranceFits(robot.definition, solids, level.width, levelHeight(level)))
      robot.entrance = createEntranceAnimation(robot.actor, solids)
  }
  return run
}
function syncPlatforms(run: Run): ContactWorld {
  const colliders: PlayerCollider[] = [...run.terrain.map((platform, i) => ({ id: `terrain:${i}`, platform })),
    ...run.mechanisms.map((m, i) => ({ id: `mechanism:${i}`, platform: mechanismShape(m) })),
    ...['box', 'ball'].flatMap(kind => run.props.flatMap((prop, i) => prop.kind === kind && !prop.gadget
      ? [{ id: `prop:${i}`, prop, platform: prop.kind === 'box' ? boxShape(prop) : ballShape(prop) }] : []))]
  run.platforms = colliders.map(c => c.platform)
  const objectFields = forceFieldPlatforms(run.forceFields, 'objects')
  const supports = objectFields.length ? [...run.platforms, ...objectFields] : run.platforms
  for (const collider of colliders) if (collider.prop && !canHangFromBox(collider.prop, supports.filter(b => b !== collider.platform))) disablePlatformLedges(collider.platform)
  // Keep the bots out of their own navigation geometry and prop solver. The
  // player receives their full hulls with stable identities and drive velocity.
  for (const [i, robot] of run.robots.entries()) for (const [piece, platform] of robotPlatforms(robot).entries()) {
    colliders.push({ id: `robot:${i}:${piece}`, platform, robot })
  }
  // Humanoid actors use the player's rope contact path, including after release.
  // Reintroducing their body as a rope obstacle at a ledge exit kicks the rope.
  const ropePlatforms = colliders.filter(c => !c.robot?.actor).map(c => c.platform)
  if (!run.forceFields.length) return { platforms: colliders.map(c => c.platform), ropePlatforms, colliders }
  ropePlatforms.push(...objectFields)
  for (const [i, field] of run.forceFields.entries()) if (field.active && field.definition.mode !== 'objects') colliders.push({ id: `force-field:${i}`, platform: field.platform, playerOnly: true })
  return { platforms: colliders.map(c => c.platform), colliders, ropePlatforms }
}
const approach = (from: number, to: number, delta: number) => from + Math.max(-delta, Math.min(delta, to - from))
const bodyOverlap = (p: Player, b: Platform, dy = 0) => bodyIntersects(p.x, p.y + dy, b, p.crouching ? TUNING.crouchHeight : TUNING.height, p.inverted ? -1 : 1)
const contactShift = (correction: number, carry: number) => {
  const travel = correction + carry
  return travel - Math.max(Math.min(0, carry), Math.min(Math.max(0, carry), travel))
}
function reverseLift(m: MechanismState) {
  m.wait = m.direction < 0 ? 3 : 2
  m.direction *= -1
}
function stepMechanisms(run: Run, dt: number, contacts: PlayerContacts) {
  const objectFields = forceFieldPlatforms(run.forceFields, 'objects')
  for (const [index, m] of run.mechanisms.entries()) {
    if (run.gadgets.disabled.has(m)) continue
    const def = m.definition
    if (def.kind === 'lift' && !m.active) continue
    if (m.wait > 0) { m.wait -= dt; continue }
    const p = run.player, open = mechanismOpenPosition(def)
    const platformIndex = run.terrain.length + index
    const support = contacts.support?.collider
    const passengers = run.props.filter(b => propLoadsPlate(b, m.x, m.y, def.w)
      || propLoadsPlate(b, m.x, m.y + def.h, def.w, true) && propGravity(run.gravityField, b) < 0)
    const onProp = support?.prop && passengers.includes(support.prop)
    const rider = onProp || support?.id === `mechanism:${index}`
      || p.hang?.platform === platformIndex || !!p.mantle && !p.mantle.step && Math.abs(p.mantle.edgeY - m.y) < .2 && p.mantle.edgeX >= m.x && p.mantle.edgeX <= m.x + def.w
    const obstacles = [...run.platforms.filter((b, i) => i !== platformIndex && b !== support?.platform), ...forceFieldPlatforms(run.forceFields)]
    const solids = [...run.terrain, ...run.mechanisms.filter(other => other !== m).map(mechanismShape), ...objectFields]
    const passengerBlocked = (dx: number, dy: number) => passengers.some(b => solids.some(s => propBlocksMechanism(b, s, { ...s, x: s.x - dx, y: s.y - dy })))
    if (m.safetyHold != null && m.x === open.x && m.y === open.y) {
      // After reversing, wait for the whole closing path to clear. A small pause
      // gives the player time to step out instead of trapping them on each retry.
      const path = mechanismSweep(def)
      const occupied = bodyOverlap(p, path) || run.props.some(b => polygonIntersects(polygonPoints(b.kind === 'box' ? boxShape(b) : ballShape(b)), path, .01))
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
      && polygonIntersects(liftHull, s, .01)) || objectFields.some(s => polygonIntersects(polygonPoints(nextShape), s, .01))
    // A rising top can meet airborne feet between player steps. Board it just
    // like a landing; side/underside contact can still obstruct the mechanism.
    const boarding = def.kind === 'lift' && !p.inverted && !rider && dy < 0 && p.y <= m.y + .01 && bodyOverlap(p, nextShape)
    const cargoBlocked = passengerBlocked(dx, dy)
    const carryBlocked = (rider || boarding) && obstacles.some(b => bodyOverlap({ ...p, x: p.x + dx }, b, boarding ? y - p.y : dy)) || cargoBlocked
    const playerBlocked = !rider && !boarding && bodyOverlap(p, nextShape)
    const propsBlocked = run.props.some(b => !passengers.includes(b) && propBlocksMechanism(b, before, nextShape))
    const needsMotion = !terrainBlocked && !playerBlocked && (carryBlocked || propsBlocked) && (def.kind === 'lift' || !propsBlocked)
    let motion = needsMotion ? planMechanismMotion(run, index, nextShape, passengers, !!rider, support?.prop, dt, boarding) : null
    // Near the crown of a ball, a short downward step needs much more rolling
    // travel. Shorten that step before declaring a genuinely blocked lift.
    if (needsMotion && (propsBlocked || cargoBlocked) && def.kind === 'lift' && !motion) for (let part = 2; part <= 32; part *= 2) {
      motion = planMechanismMotion(run, index, { ...nextShape, x: m.x + dx / part, y: m.y + dy / part }, passengers, !!rider, support?.prop, dt, boarding)
      if (motion) { dx /= part; dy /= part; x = m.x + dx; y = m.y + dy; break }
    }
    const blocked = terrainBlocked || playerBlocked || (carryBlocked || propsBlocked) && !motion
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
    for (const moved of motion?.props ?? []) {
      const b = moved.prop, shiftX = moved.x - b.x, shiftY = moved.y - b.y
      b.x = moved.x; b.y = moved.y
      if (b.kind === 'ball') b.angle += shiftX / (b.size / 2)
      // Preserve existing momentum, adding only the velocity needed to yield
      // to actual contact. Clipping carried travel against a wall must not
      // invent a backward kick. Failed trials never impart any motion.
      const carried = passengers.includes(b)
      const contactX = contactShift(shiftX, carried ? dx : 0), contactY = contactShift(shiftY, carried ? dy : 0)
      if (Math.abs(contactX) > .001 && b.vx * Math.sign(contactX) < Math.abs(contactX) / dt) b.vx = contactX / dt
      if (Math.abs(contactY) > .001 && b.vy * Math.sign(contactY) < Math.abs(contactY) / dt) b.vy = contactY / dt
    }
    if (x === target.x && y === target.y && def.kind === 'lift') reverseLift(m)
  }
}
function stepProps(run: Run, contacts: PlayerContacts, dt: number, powered: boolean) {
  if (!run.props.length) return
  // Fixed small steps stabilize corners; fast linear or angular motion takes
  // additional steps so even a small prop cannot skip a thin wall or another prop.
  const travel = Math.max(175, ...run.props.map(b => Math.hypot(b.vx, b.vy) + Math.abs(b.angularVelocity) * b.size
    + TUNING.gravity * (run.gravityField.maxMultiplier + Math.abs(1 / propWeightScale(b) - 1) * (run.gravityField.maxPropLift ?? 0)) * dt)) * dt
  const steps = Math.max(1, Math.ceil(dt * 240), Math.ceil(travel / (Math.min(...run.props.map(b => b.size)) * .15))), h = dt / steps
  for (let step = 0; step < steps; step++) stepPropPhysics(run, contacts, h, powered)
}
function stepTriggers(run: Run, dt: number, powered = run.empRemaining === 0) {
  const toggledGroups = new Set<string>()
  run.level.triggers.forEach((plate, index) => {
    const sensor = run.triggers[index]
    if (plate.mode === 'coins') {
      // Coins still fill the meter without power. Once switched, it is latched
      // independently of the supply, including when another EMP is collected.
      sensor.active ||= powered && run.coinsCollected >= plate.threshold
      return
    }
    const position = pressurePlatePosition(plate, run.mechanisms)
    const weighted = run.props.some(b => propLoadsPlate(b, position.x, position.y, plate.w, plate.ceiling))
    const loads = (actor: Player) => !!actor.inverted === !!plate.ceiling && actor.grounded && Math.abs(actor.y - position.y) < 3 && actor.x >= position.x && actor.x <= position.x + plate.w
    const touched = loads(run.player) || run.robots.some(robot => robot.actor && loads(robot.actor))
    sensor.held = weighted || touched ? sensor.held + dt : 0
    const pressed = sensor.held >= .15, behavior = plate.behavior ?? 'pressure'
    if (behavior === 'pressure') sensor.active = powered && pressed
    else if (powered && pressed && !sensor.pressed) {
      const group = triggerToggleGroup(plate)
      if (group) toggledGroups.add(group)
      else sensor.active = behavior === 'switch' ? !plate.startsOn : !sensor.active
    }
    // Track the physical press separately: the final-position sample cannot
    // toggle twice, and another load cannot retrigger an already held plate.
    sensor.pressed = pressed
    sensor.depression = approach(sensor.depression, weighted || touched || behavior === 'switch' && sensor.active !== !!plate.startsOn ? 1 : 0, dt / .12)
  })
  // Simultaneous presses are one shared action, independent of member order.
  for (const id of toggledGroups) run.toggleGroupStates.set(id, !run.toggleGroupStates.get(id))
  run.level.triggers.forEach((plate, index) => {
    const group = triggerToggleGroup(plate)
    if (group) run.triggers[index].active = !!run.toggleGroupStates.get(group)
  })
  updateSwitchTargets(run)
}
function updateSwitchTargets(run: Run) {
  for (const state of run.floatSwitches) updateFloatSwitch(state, run.empRemaining === 0)
  const states = resolveSwitchStates(run.level, run.triggers, run.floatSwitches)
  run.switchStates = states
  updateForceFields(run.forceFields, run.player, states, run.empRemaining === 0, platform => {
    const held = heldToolFrame(run.player)
    if (held && polygonIntersects(polygonPoints(toolShape(held)), platform, .001)) return true
    if (run.props.some(b => polygonIntersects(polygonPoints(b.kind === 'box' ? boxShape(b) : ballShape(b)), platform, .001))
      || run.robots.some(r => robotPlatforms(r).some(b => polygonIntersects(polygonPoints(b), platform, .001)))
      || run.mechanisms.some(m => polygonIntersects(polygonPoints(mechanismShape(m)), platform, .001))) return true
    return (run.player.ropes ?? []).some(rope => {
      const path = ropePath(rope.definition, rope)
      return path.slice(1).some((point, i) => lineBlocked(path[i], point, [platform]))
    })
  }, field => run.gadgets.disabled.has(field))
  updateGravityField(run.gravityField, run.water.plates, states, run.empRemaining === 0, run.water.revision, plate => run.gadgets.disabled.has(plate))
  for (const mechanism of run.mechanisms) mechanism.active = mechanism.definition.kind === 'lift' && mechanism.definition.power === 'always' || !!states.get(mechanism.definition.id)
  run.goalLit = !!run.exit || run.level.goal.power !== 'switched' || !!states.get(run.level.goal.id ?? '')
}
function faceContactedRobots(player: Player, contacts: PlayerContacts | null, robots: readonly RobotState[]) {
  const face = (collider?: PlayerCollider) => { if (collider?.robot) faceRobotToward(collider.robot, player.x) }
  face(contacts?.support?.collider)
  if (contacts?.push?.hands && !contacts.push.anticipation) face(contacts.push.collider)
  for (const contact of contacts?.body ?? []) face(contact.collider)
  for (const robot of robots) if (robotTouchesPlayer(robot, player)) faceRobotToward(robot, player.x)
}
function stepRobots(run: Run, dt: number, world: ContactWorld, powered = true) {
  if (!run.robots.length) return
  const p = run.player
  const oldX = p.x
  const playerFields = forceFieldPlatforms(run.forceFields), objectFields = forceFieldPlatforms(run.forceFields, 'objects')
  for (const r of run.robots) {
    const active = powered && !run.gadgets.disabled.has(r)
    if (r.definition.kind === 'repulsor') {
      // EMP stops decisions; an external physical shove can still move the body.
      if (active || r.actor?.shoveDrift) stepRepulsorBot(run, r, dt, world, active)
      else { if (r.actor) r.actor.shove = undefined; r.vx = 0 }
      continue
    }
    if (!active) { r.vx = 0; continue }
    settleRobot(run.platforms, r, dt, p, playerFields, objectFields)
    if (r.recoilVx || r.fallVelocity !== undefined) {
      const obstacles = [...run.props.filter(prop => !prop.gadget).map(b => b.kind === 'box' ? boxShape(b) : ballShape(b)),
        ...run.robots.filter(other => other !== r).flatMap(robotPlatforms)]
      stepRobotRecoil(run.platforms, r, dt, obstacles, p, playerFields, objectFields)
      if (r.fallVelocity !== undefined) {
        stepRobotFall(run.platforms, r, dt, obstacles, p, playerFields, objectFields)
        r.phase = 'recover'; r.time = 0
        continue
      }
    }
    if (r.deactivated) { r.vx = 0; r.seesPlayer = false; r.phase = 'recover'; r.time = 0; continue }
    const bounds = r.definition
    // Reuse the current collision shapes and publish this result for rendering.
    const target = chooseShovebotTarget(run, r, world), gap = target ? target.x - r.x : 0
    if (!target && (r.phase === 'chase' || r.phase === 'windup' || r.phase === 'charge')) { r.phase = 'patrol'; r.time = 0 }
    r.time += dt
    let speed = 0
    if (r.phase === 'patrol' || r.phase === 'chase') {
      r.phase = target ? 'chase' : 'patrol'
      if (target) {
        r.facing = Math.sign(gap) || r.facing
        if (Math.abs(gap) < 145 && Math.abs(target.y - r.y) < 95) { r.phase = 'windup'; r.time = 0 }
      }
      speed = r.phase === 'chase' ? 235 : r.phase === 'patrol' ? 92 : 0
    } else if (r.phase === 'windup' && r.time >= .22) { r.phase = 'charge'; r.time = 0 }
    else if (r.phase === 'charge') {
      speed = 540
      if (r.time >= .52 || r.x <= bounds.left || r.x >= bounds.right) { r.phase = 'recover'; r.time = 0 }
    } else if (r.phase === 'recover' && r.time >= .34) { r.phase = 'chase'; r.time = 0 }
    if (speed) {
      const x = approach(r.x, Math.max(bounds.left, Math.min(bounds.right, r.x + r.facing * speed * dt)), speed * dt)
      const props = [...run.props.filter(prop => !prop.gadget).map(b => b.kind === 'box' ? boxShape(b) : ballShape(b)),
        ...run.robots.filter(other => other !== r).flatMap(robotPlatforms)]
      const blocked = !moveRobot(run.platforms, r, x, props, p, undefined, playerFields, objectFields)
      if ((blocked && !robotTouchesProps(r, props, 3) || x === bounds.left || x === bounds.right) && r.phase === 'patrol') r.facing *= -1
    }
    ramRival(run, r)
  }
  // Contact imparts only the motion actually resolved, with no launch impulse
  // or proximity trigger. Ground friction handles the subsequent slowdown.
  const pushed = (p.x - oldX) / dt
  if (pushed > 0) p.vx = Math.max(p.vx, pushed)
  else if (pushed < 0) p.vx = Math.min(p.vx, pushed)
}
function collectPickups(run: Run, dt: number) {
  const collected = stepPickups(run.pickups, run.player, dt, true, !run.failed)
  run.timeStopRemaining += collected.seconds
  run.timeFastRemaining += collected.fastSeconds
  run.empRemaining += collected.empSeconds
  if (collected.empSeconds) for (const robot of run.robots) robot.vx = 0
  run.coinsCollected += collected.coins
  if (run.level.timing !== 'untimed') run.elapsed = Math.max(0, run.elapsed + collected.timeAdded - collected.timeOff)
}
export function stepRun(run: Run, input: JumpInput, dt = STEP) {
  if (run.finished) return
  if (!run.started) {
    if (!run.entrance) return // Static previews never activate.
    const elapsed = run.entrance.elapsed
    dt = advanceEntranceAnimation(run.entrance, dt, syncPlatforms(run))
    for (const robot of run.robots) if (robot.entrance) {
      advanceEntranceAnimation(robot.entrance, run.entrance.elapsed - elapsed)
      if (robot.entrance.elapsed + 1e-9 >= entranceDuration(robot.entrance)) delete robot.entrance
    }
    if (run.entrance.elapsed + 1e-9 < entranceDuration(run.entrance)) return
    run.entrance = null; run.started = true
    if (dt < 1e-9) return
  }
  run.entrance = null
  if (run.pickups.length) run.pickupTime += dt
  run.activeTime += dt
  run.goalElapsed = approach(run.goalElapsed, run.goalLit ? GOAL_OPEN_SECONDS : 0, dt)
  if (!run.exit) {
    const stopped = Math.min(dt, run.timeStopRemaining)
    // Both effects expire in gameplay time. Only the unfrozen part of a
    // fast-watch interval earns extra time, including partial final steps.
    const fast = Math.min(dt, run.timeFastRemaining)
    run.timeStopRemaining = Math.max(0, run.timeStopRemaining - stopped)
    run.timeFastRemaining = Math.max(0, run.timeFastRemaining - dt)
    if (run.level.timing !== 'untimed') run.elapsed += dt - stopped + Math.max(0, fast - stopped)
    run.failed ||= run.level.timing !== 'untimed' && run.elapsed > gradeTimes(run.level).d + 1e-7
  }
  if (run.exit) {
    const p = run.player, from: [number, number] = [p.x, p.y]
    run.exit.elapsed = Math.min(GOAL_EXIT_SECONDS, run.exit.elapsed + dt)
    p.x = goalExitPosition(run.exit); p.vx = (p.x - from[0]) / dt
    finishPlayerStep(p, NEUTRAL_INPUT, dt, syncPlatforms(run), from)
    stepPickups(run.pickups, p, dt, false)
    run.finished = run.exit.elapsed >= GOAL_EXIT_SECONDS
    return
  }
  // Collect intent, advance the contacted world, then solve player motion once.
  // Geometry is refreshed after moving bodies; the contact policy is shared.
  applyContactEmp(run)
  if (run.gadgets.disabled.has(run.player)) input = NEUTRAL_INPUT
  const shoving = preparePlayerShove(run, input, dt, () => syncPlatforms(run))
  input = prepareGadgets(run, shoving ? { ...input, use: false } : input, dt)
  const toolBefore = heldToolFrame(run.player)
  let world = syncPlatforms(run)
  const poweredDt = dt > run.empRemaining + 1e-9 ? dt - run.empRemaining : 0, powered = poweredDt > 0
  stepTriggers(run, poweredDt, powered)
  if (advanceWaterLevels(run.water, run.switchStates, poweredDt)) {
    updateGravityField(run.gravityField, run.water.plates, run.switchStates, powered, run.water.revision, plate => run.gadgets.disabled.has(plate))
    if (run.waterEffectsEnabled) run.waterSurface = createWaterSurface(run.water.plates, run.terrain, run.player, run.props, run.gravityField, run.waterSurface)
  }
  if (run.forceFields.length) world = syncPlatforms(run)
  const swimStrength = playerSwimStrength(run.gravityField, run.player)
  run.player.gravity = playerGravity(run.gravityField, run.player) + (run.player.waterBob && swimStrength ? waterBobAcceleration(run.player.waterBob, playerFloatDrag(run.gravityField, run.player)) : 0)
  run.player.swimAcceleration = swimmingAcceleration(run.player, input, swimStrength, playerFieldCoverage(run.gravityField, run.player), playerSwimDepth(run.gravityField, run.player))
  setPlayerGravity(run.player, run.player.gravity, run.player.gravity + run.player.swimAcceleration)
  if (powered) stepMechanisms(run, poweredDt, playerContacts(run.player, input, world, dt))
  world = syncPlatforms(run)
  const beforeContacts = playerContacts(run.player, input, world, dt), rider = beforeContacts.support
  if (powered && run.robots.length) faceContactedRobots(run.player, beforeContacts, run.robots)
  const robotStarts = run.robots.map(r => r.x)
  if (powered) stepRobots(run, poweredDt, world)
  else if (run.robots.some(r => r.actor?.shoveDrift)) stepRobots(run, dt, world, false)
  applyContactEmp(run)
  if (run.gadgets.disabled.has(run.player)) input = NEUTRAL_INPUT
  stepProps(run, playerContacts(run.player, input, world, dt), dt, powered)
  run.robots.forEach((r, i) => { r.vx = (r.x - robotStarts[i]) / dt })
  world = syncPlatforms(run)
  if (rider?.collider.robot && run.player.grounded) {
    const next = world.colliders.find(c => c.id === rider.collider.id)!
    const p = run.player, surface = groundAt([p.inverted ? mirrorPlatform(next.platform) : next.platform], p.x, p.inverted ? -p.y : p.y, 20)
    if (surface) {
      // Follow the contacted surface's height/tilt; friction supplies horizontal transport.
      // A ceiling can stop the carry; it must never push the rider through it.
      const safe = moveBody([p.x, p.y], [p.x, p.inverted ? -surface.y : surface.y], world.colliders.filter(c => c.robot !== rider.collider.robot).map(c => c.platform), p.crouching ? TUNING.crouchHeight : TUNING.height, p.inverted ? -1 : 1)
      translatePlayer(p, safe.x - p.x, safe.y - p.y)
    } else p.grounded = false
  }
  followPropGrip(run.player, world)
  if (run.gadgets.disabled.has(run.player)) run.player.grabCooldown = Math.max(run.player.grabCooldown, dt + .05)
  stepPlayer(run.player, input, dt, world.platforms, run.level.climbables, { checkpoints: [], fallY: Infinity }, world, run.gravityField,
    undefined, 1, undefined, { ropeRiders: run.robots.flatMap(r => r.actor ? [r.actor] : []), water: run.water })
  if (powered && run.robots.length) faceContactedRobots(run.player, run.player.contacts, run.robots)
  applyContactEmp(run)
  finishGadgetMotion(run, toolBefore)
  recordPlayerNoise(run, dt)
  if (run.waterSurface) advanceWaterSurface(run.waterSurface, run.player, run.props, swimStrength, dt)
  // EMP time is gameplay time, independent of every clock collectible. Spend
  // the old duration before collection so a fresh pulse gets its full five seconds.
  run.empRemaining = Math.max(0, run.empRemaining - dt)
  if (run.empRemaining < 1e-9) run.empRemaining = 0
  advanceGadgetDisables(run, dt)
  // Pickups remain available until entry, including one touched on the entry step.
  collectPickups(run, dt)
  run.failed ||= run.level.timing !== 'untimed' && run.elapsed > gradeTimes(run.level).d + 1e-7
  stepTriggers(run, 0)
  const p = run.player
  if (run.level.goal.kind === 'walk-off') {
    if (!p.inverted && p.x >= run.level.width + TUNING.width && p.y <= run.level.goal.y + .15 && !p.hang && !p.mantle && !p.climbing) {
      run.finished = true; run.grade = null; p.vx = 0; p.vy = 0
      cancelJumpInput(p)
    }
    return
  }
  if (run.level.goal.kind === 'overlook') {
    if (input.climb && p.grounded && !p.hang && !p.climbing && Math.abs(p.x - run.level.goal.x) < 45 && Math.abs(p.y - run.level.goal.y) < 2) {
      run.finished = true; run.grade = null; p.vx = 0; p.vy = 0
      cancelJumpInput(p)
    }
    return
  }
  const exitObstacles = run.forceFields.length ? [...run.platforms, ...forceFieldPlatforms(run.forceFields)] : run.platforms
  const door = goalDoor(run.level.goal)
  if (!p.inverted && run.goalLit && run.goalElapsed >= GOAL_OPEN_SECONDS && p.grounded && !p.hang && !p.mantle && !p.climbing
    && Math.abs(p.y - run.level.goal.y) < 2 && p.x + TUNING.width / 2 > door.x + 4 && p.x - TUNING.width / 2 < door.x + door.w - 4
    && !exitObstacles.some(b => bodyOverlap(p, b))) {
    // This is a doorway in the back wall. Reaching it permits entry even when
    // a loose prop blocks a sideways step toward its center.
    const intoDoor = moveBody([p.x, p.y], [door.x + door.w / 2, p.y], exitObstacles)
    run.exit = { elapsed: 0, fromX: p.x, toX: intoDoor.x }
    run.gadgets.held = null; run.gadgets.aiming = false; delete p.heldTool
    run.grade = run.level.timing === 'untimed' ? null : run.failed ? 'F' : gradeFor(run.elapsed, run.level)
    p.vx = 0; p.vy = 0; p.pushing = null; p.wallBrace = null; p.sliding = null; p.freeFall = null; p.ragdoll = null
    cancelJumpInput(p)
  }
}
