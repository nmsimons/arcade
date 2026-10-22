import type { RobotState, Run } from './challenge.ts'
import type { ContactWorld } from './playerContacts.ts'
import { followPropGrip, playerContactBody } from './playerContacts.ts'
import { createPlayer, gaitPose, NEUTRAL_INPUT, stepPlayer, TUNING } from './model.ts'
import type { JumpInput } from './model.ts'
import type { Player, Platform } from './model.ts'
import { bodyIntersects, bodyPolygon, lineBlocked } from './geometry.ts'
import type { Vec } from './geometry.ts'
import { pulseHit } from './gadgets.ts'
import { advanceDryTurn, athletePose, captureDryTurn } from './athlete.ts'
import { repulseProp } from './propPhysics.ts'
import { ballShape, boxShape, propHeight } from './propGeometry.ts'
import { forceFieldPlatforms } from './forceField.ts'
import { faceRobotToward, repulseRobot, robotPlatforms, robotSensesPlayer, robotSightObstacles, robotTouchesPlayer } from './robotPhysics.ts'
import { botActive, visibleShovebotRival } from './botCombat.ts'
import { botMovement } from './botNavigation.ts'
import { rightArmSupporting } from './armSupport.ts'
import { createRope } from './climbables.ts'
import { REPULSOR_BOT_WIDTH_SCALE } from './repulsorBotRig.ts'
import { disablePlatformLedges } from './terrainLedges.ts'
export { REPULSOR_BOT_WIDTH_SCALE } from './repulsorBotRig.ts'
import { botSeesProp, chooseBotTactic } from './botTactics.ts'
import type { BotSighting, BotTactic } from './botTactics.ts'
import { hearPlayer } from './botHearing.ts'
import { BOT_AIR_SPEED_SCALE } from './botMovementTuning.ts'
import { repulsePlayer } from './actorImpulse.ts'
import { advanceShove, beginShove, BOT_SHOVE_WINDUP, canShove, SHOVE_RECOVERY, shoveReaches } from './shove.ts'
import { AWAKENING_SECONDS } from './goal.ts'
export { repulsePlayer, REPULSOR_BOT_IMPULSE } from './actorImpulse.ts'
export { botLastHeard } from './botHearing.ts'

export const REPULSOR_BOT_WINDUP = .8
export const REPULSOR_BOT_RECOVERY = 1.4
export const REPULSOR_BOT_RANGE = 1000
const memories = new WeakMap<RobotState, BotSighting>(), plans = new WeakMap<RobotState, BotTactic>()
const turnedToNoise = new WeakMap<RobotState, number>()
const rivalTargets = new WeakMap<RobotState, RobotState>()
export const botLastSighting = (robot: RobotState) => { const memory = memories.get(robot); return memory && { ...memory } }

export function createRepulsorActor(x: number, y: number) {
  const actor = createPlayer({ x, y }); actor.facing = -1
  actor.armAim = { angle: Math.PI, aiming: false }
  return actor
}

/** The same horizontal proportion transform is used by artwork and the muzzle. */
export function repulsorBotHand(robot: RobotState) {
  const actor = robot.actor!, pose = athletePose(actor), arm = actor.facing < 0 ? pose.backArm : pose.frontArm
  const flip = actor.inverted ? -1 : 1, angle = Math.atan2((arm.end[1] - arm.joint[1]) * flip, (arm.end[0] - arm.joint[0]) * actor.facing)
  const dx = Math.cos(angle), dy = Math.sin(angle), palm = arm.hand ?? arm.end
  return { from: [actor.x + palm[0] * actor.facing * REPULSOR_BOT_WIDTH_SCALE, actor.y + palm[1] * flip] as Vec,
    direction: [dx * REPULSOR_BOT_WIDTH_SCALE / Math.hypot(dx * REPULSOR_BOT_WIDTH_SCALE, dy),
      dy / Math.hypot(dx * REPULSOR_BOT_WIDTH_SCALE, dy)] as Vec }
}

function fire(run: Run, robot: RobotState) {
  const { from, direction } = repulsorBotHand(robot), body = playerContactBody(run.player, true)
  const points = bodyPolygon(body.x, body.y, body.height, run.player.inverted ? -1 : 1, 0, body.outline)
  const x = Math.min(...points.map(p => p[0])), y = Math.min(...points.map(p => p[1]))
  const playerShape: Platform = { x, y, w: Math.max(...points.map(p => p[0])) - x, h: Math.max(...points.map(p => p[1])) - y,
    polygon: points.map(p => [p[0] - x, p[1] - y]) }
  const targets = [
    ...run.terrain.map(shape => ({ shape, prop: null, robot: null, player: false })),
    ...run.mechanisms.map(m => ({ shape: { ...m.definition, x: m.x, y: m.y }, prop: null, robot: null, player: false })),
    ...forceFieldPlatforms(run.forceFields, 'objects').map(shape => ({ shape, prop: null, robot: null, player: false })),
    ...run.props.map(prop => ({ shape: prop.kind === 'ball' ? ballShape(prop) : boxShape(prop), prop, robot: null, player: false })),
    ...run.robots.filter(other => other !== robot).flatMap(other => robotPlatforms(other).map(shape => ({ shape, prop: null, robot: other, player: false }))),
    { shape: playerShape, prop: null, robot: null, player: true },
  ]
  const shapes = targets.map(target => target.shape)
  const blockedArm = lineBlocked([robot.x, robot.y - 42], from, shapes.filter((_, i) => !targets[i].player))
  const hit = pulseHit(from, direction, shapes, blockedArm ? 0 : REPULSOR_BOT_RANGE), target = blockedArm ? undefined : targets[hit.index]
  if (target?.player) repulsePlayer(run.player, direction)
  if (target?.prop) repulseProp(run, target.prop, direction)
  if (target?.robot) repulseRobot(target.robot, direction[0], robot.x)
  run.gadgets.pulses.push({ from, to: hit.point, age: 0 })
  robot.shots = (robot.shots ?? 0) + 1
}

function hasFiringLine(run: Run, robot: RobotState, target: Vec, prop?: Run['props'][number], obstruction?: RobotState) {
  const angle = Math.atan2(target[1] - (robot.y - 42), target[0] - robot.x)
  const actor = { ...robot.actor!, facing: Math.cos(angle) < 0 ? -1 : 1,
    armAim: { angle: Math.atan2(Math.sin(angle), Math.cos(angle) / REPULSOR_BOT_WIDTH_SCALE), aiming: true } }
  const { from } = repulsorBotHand({ ...robot, actor })
  const solids = [...run.terrain, ...run.mechanisms.map(m => ({ ...m.definition, x: m.x, y: m.y })),
    ...forceFieldPlatforms(run.forceFields, 'objects'), ...run.props.filter(p => p !== prop && !p.gadget).map(p => p.kind === 'ball' ? ballShape(p) : boxShape(p)),
    ...run.robots.filter(r => r !== robot && r !== obstruction).flatMap(robotPlatforms)]
  return Math.hypot(target[0] - from[0], target[1] - from[1]) <= REPULSOR_BOT_RANGE
    && !lineBlocked([robot.x, robot.y - 42], from, solids) && !lineBlocked(from, target, solids)
}

const stepOffSides = new WeakMap<RobotState, number>()
const airborneFacings = new WeakMap<Player, number>()

export function stepRepulsorBot(run: Run, robot: RobotState, dt: number, world: ContactWorld, powered = true) {
  // Other bots may already have moved this step. A stale chassis at a ladder
  // exit lets a growing mantle envelope enter its actual wheel/body position.
  const colliders = [...world.colliders.filter(collider => !collider.robot),
    ...run.robots.flatMap((other, index) => robotPlatforms(other).map((platform, piece) => ({ id: `robot:${index}:${piece}`, platform, robot: other })))]
  world = { ...world, colliders, platforms: colliders.map(collider => collider.platform) }
  const actor = robot.actor ??= createRepulsorActor(robot.x, robot.y)
  actor.facing = robot.facing
  if (robot.awakening && (robot.recoilVx || actor.stagger || actor.shoveDrift)) robot.awakening.triggered = true
  if (robot.recoilVx) { repulsePlayer(actor, [robot.recoilVx / 1100, 0]); robot.recoilVx = 0 }
  if (!powered) actor.shove = undefined
  advanceShove(run, actor, [run.player], dt, world)
  if (!powered || (actor.stagger ?? 0) > 0) {
    actor.shove = undefined; actor.armAim = { angle: robot.aim ?? 0, aiming: false }
    robot.phase = 'recover'; robot.time = powered ? REPULSOR_BOT_RECOVERY : 0
    moveRepulsorActor(run, robot, dt, world, NEUTRAL_INPUT)
    return
  }
  let memory = memories.get(robot)
  const noise = hearPlayer(run, robot)
  if (noise && noise.serial !== turnedToNoise.get(robot)) {
    if ((!memory || noise.time > memory.time) && robot.phase !== 'windup') faceRobotToward(robot, noise.x)
    turnedToNoise.set(robot, noise.serial)
  }
  let seen = robotSensesPlayer(robot, run.player, robotSightObstacles(world, robot))
  // An alerted hunter checks behind itself too, but cover still prevents a new
  // sighting. This avoids losing a visible player merely because a route turns.
  if (!seen && (memory || noise) && robot.phase !== 'windup'
    && robotSensesPlayer({ ...robot, facing: -robot.facing }, run.player, robotSightObstacles(world, robot))) {
    seen = true; faceRobotToward(robot, run.player.x)
  }
  robot.seesPlayer = seen
  if (seen) {
    const support = run.player.contacts?.support?.collider.id, index = support?.startsWith('mechanism:') ? Number(support.split(':')[1]) : -1
    memory = { x: run.player.x, y: run.player.y, vx: run.player.vx, vy: run.player.vy, inverted: !!run.player.inverted,
      time: run.activeTime, support: run.mechanisms[index]?.definition.id }
    memories.set(robot, memory)
  }
  // Hearing supplies a remembered search point, never a confirmed sighting or
  // hidden velocity. Keep pursuing that clue through cover while making progress.
  const clue = noise && (!memory || noise.time > memory.time) ? { ...noise, vx: 0, vy: 0, inverted: false } : memory
  const hunting = !!clue
  // A nearby rival can demand a fight even before the player has been seen.
  // Keep the player's last real sighting intact while dealing with that threat.
  const lockedRival = robot.phase === 'windup' ? rivalTargets.get(robot) : undefined
  const rival = lockedRival && run.robots.includes(lockedRival) && botActive(run, lockedRival) ? lockedRival
    : robot.phase === 'windup' ? undefined : visibleShovebotRival(run, robot, world)
  // A docked robot does not patrol toward the entrance before the encounter.
  // Only normal senses or physical disturbance wake it; the player keeps control.
  const awakening = robot.awakening
  if (awakening && awakening.elapsed < AWAKENING_SECONDS) {
    awakening.triggered ||= !!clue || !!rival || robotTouchesPlayer(robot, run.player)
    if (awakening.triggered) awakening.elapsed = Math.min(AWAKENING_SECONDS, awakening.elapsed + dt)
    robot.phase = 'patrol'; robot.time = 0; actor.armAim = { angle: Math.PI, aiming: false }
    moveRepulsorActor(run, robot, dt, world, NEUTRAL_INPUT)
    return
  }
  const standingOnPlayer = actor.contacts?.support?.collider.id === 'player'
  const free = !standingOnPlayer && !rightArmSupporting(actor) && !actor.climbing && !actor.hang && !actor.mantle
  const touchingRival = rival && Math.abs(rival.y - actor.y) < 30 && robotTouchesPlayer(rival, actor)
  if (touchingRival && !actor.shove) faceRobotToward(robot, rival.x)
  if (!actor.shove && canShove(actor) && (seen && shoveReaches(run, actor, run.player, actor.facing, world)
    || touchingRival)) {
    beginShove(actor, BOT_SHOVE_WINDUP)
    robot.phase = 'recover'; robot.time = REPULSOR_BOT_RECOVERY - BOT_SHOVE_WINDUP - SHOVE_RECOVERY
  }
  const playerTarget: Vec | undefined = seen ? [run.player.x, run.player.y - (run.player.inverted ? -1 : 1) * TUNING.height / 2] : undefined
  // A rope leaves the player exposed: take an available shot before following
  // the climb route or diverting to a control, cargo, or another bot.
  const ropeShot = actor.grounded && free && run.player.climbing?.kind === 'rope' && !!playerTarget
    && hasFiringLine(run, robot, playerTarget)
  const plan = robot.phase === 'windup' ? plans.get(robot) : clue ? chooseBotTactic(run, robot, clue, seen, dt) : undefined
  if (plan) plans.set(robot, plan)
  const prop = !ropeShot && !rival && plan?.kind === 'dislodge' && plan.prop && run.props.includes(plan.prop) && botSeesProp(run, robot, plan.prop) ? plan.prop : undefined
  const obstruction = !ropeShot ? rival ?? (plan?.kind === 'clear' && plan.robot && run.robots.includes(plan.robot) ? plan.robot : undefined) : undefined
  const approachingControl = !ropeShot && !rival && plan?.kind === 'operate' && Math.hypot(robot.x - plan.x, robot.y - plan.y) > 40
  const shotTarget: Vec | undefined = obstruction ? [obstruction.x, obstruction.y - 28] : prop ? [prop.x, prop.y - propHeight(prop) / 2] : playerTarget
  robot.time += dt
  if ((robot.phase === 'patrol' || robot.phase === 'chase') && actor.grounded && free && !approachingControl
    && (ropeShot || obstruction || prop || seen && Math.abs(run.player.x - robot.x) <= 600 && Math.abs(run.player.y - robot.y) < 240)
    && shotTarget && (ropeShot || hasFiringLine(run, robot, shotTarget, prop, obstruction))) {
    robot.phase = 'windup'; robot.time = 0
    if (rival && !ropeShot) rivalTargets.set(robot, rival)
    else rivalTargets.delete(robot)
  }
  let movement: JumpInput = { ...NEUTRAL_INPUT }
  if (robot.phase === 'windup') {
    movement = { ...movement, move: 0, jump: false, climb: false, descend: false, crouch: false }
    if (shotTarget && robot.time < REPULSOR_BOT_WINDUP * .55) {
      robot.aim = Math.atan2(shotTarget[1] - (robot.y - 42), shotTarget[0] - robot.x)
      actor.facing = Math.cos(robot.aim) < 0 ? -1 : 1
    }
    if (!free || !actor.grounded) { robot.phase = 'chase'; robot.time = 0 }
    else if (robot.time >= REPULSOR_BOT_WINDUP) { fire(run, robot); robot.phase = 'recover'; robot.time = 0 }
  } else if (robot.phase === 'recover') {
    movement = { ...movement, move: 0, jump: false, climb: false, descend: false, crouch: false }
    if (robot.time >= REPULSOR_BOT_RECOVERY) { robot.phase = hunting ? 'chase' : 'patrol'; robot.time = 0 }
  } else { robot.phase = hunting ? 'chase' : 'patrol'; movement = botMovement(run, robot, dt, plan ?? clue) }
  if (standingOnPlayer) {
    // A person is temporary support, not a firing perch. Step to the clear side
    // through the ordinary motor instead of charging forever on their head.
    // Keep that choice until stepping off; crossing the room's center must
    // not reverse it on every frame.
    const preferred = stepOffSides.get(robot) ?? (actor.x < run.level.width / 2 ? 1 : -1)
    const clear = (side: number) => !world.platforms.some(platform => bodyIntersects(actor.x + side * 45, actor.y, platform, TUNING.height))
    const side = clear(preferred) ? preferred : -preferred
    stepOffSides.set(robot, side)
    movement = { ...NEUTRAL_INPUT, move: side * .6 }
  }
  if (!standingOnPlayer) stepOffSides.delete(robot)
  const aiming = robot.phase === 'windup' && free
  actor.armAim = { angle: Math.atan2(Math.sin(robot.aim ?? 0), Math.cos(robot.aim ?? 0) / REPULSOR_BOT_WIDTH_SCALE), aiming }
  moveRepulsorActor(run, robot, dt, world, movement)
}

function moveRepulsorActor(run: Run, robot: RobotState, dt: number, world: ContactWorld, movement: JumpInput) {
  const actor = robot.actor!
  const airborneFacing = airborneFacings.get(actor) ?? actor.facing
  const turning = !!actor.releaseTurn
  run.player.ropes ??= run.level.climbables.ropes.map(createRope)
  actor.ropes = run.player.ropes
  const colliders = [...world.colliders.filter(c => c.robot !== robot && !c.playerOnly),
    ...forceFieldPlatforms(run.forceFields, 'objects').map((platform, i) => ({ id: `red:${i}`, platform })),
    { id: 'player', platform: playerShapeForNavigation(run.player) }]
  const botWorld = { colliders, platforms: colliders.map(c => c.platform), ropePlatforms: world.ropePlatforms }
  followPropGrip(actor, botWorld)
  stepPlayer(actor, movement, dt, botWorld.platforms, run.level.climbables, { checkpoints: [], fallY: Infinity }, botWorld, run.gravityField,
    undefined, 1, undefined, { advanceRopes: false, airSpeedScale: BOT_AIR_SPEED_SCALE })
  // Air braking and a fresh sighting can point in opposite directions. Turn
  // with real travel, retaining the heading through small landing corrections.
  if (!turning && !actor.releaseTurn && !actor.grounded && !actor.climbing && !actor.hang && !actor.mantle
    && !actor.wallBrace?.active && !actor.wallJump && !actor.shove) {
    const facing = Math.abs(actor.vx) > 60 ? Math.sign(actor.vx) : airborneFacing
    if (actor.facing !== facing) {
      const intent = { ...movement, move: facing }, before = captureDryTurn(actor, intent)
      actor.facing = facing
      advanceDryTurn(actor, intent, dt, before)
    }
  }
  airborneFacings.set(actor, actor.facing)
  // A blocked shove must not freeze an EMP-disabled body in its incoming run pose.
  if (actor.grounded && (actor.contacts?.motion.speed ?? Math.abs(actor.vx)) < .01) actor.gait = gaitPose(0)
  robot.x = actor.x; robot.y = actor.y; robot.vx = actor.vx; robot.facing = actor.facing; robot.angle = actor.groundAngle
  if (actor.grounded && Math.abs(actor.vx) < 1 && Math.abs(actor.vy) < 1) actor.shoveDrift = false
}

function playerShapeForNavigation(player: Player): Platform {
  const body = playerContactBody(player)
  const shape = { x: body.x - TUNING.width / 2, y: player.inverted ? body.y : body.y - body.height, w: TUNING.width, h: body.height }
  // A moving person is a collision body, never a fixed ledge to latch onto.
  disablePlatformLedges(shape)
  return shape
}
