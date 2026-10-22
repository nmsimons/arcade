import type { RobotState, Run } from './challenge.ts'
import type { ContactWorld } from './playerContacts.ts'
import type { Player } from './model.ts'
import { lineBlocked } from './geometry.ts'
import { faceRobotToward, robotSensesPlayer, robotSightObstacles, robotTop, robotTouchesPlayer } from './robotPhysics.ts'
import { repulsePlayer, REPULSOR_BOT_IMPULSE } from './actorImpulse.ts'

const chargeTargets = new WeakMap<RobotState, Player>()
export const shovebotTarget = (robot: RobotState) => chargeTargets.get(robot)
export const botsAreEnemies = (a: RobotState, b: RobotState) => (a.definition.kind === 'repulsor') !== (b.definition.kind === 'repulsor')
export const botActive = (run: Run, robot: RobotState) => !robot.deactivated && run.empRemaining === 0 && !run.gadgets.disabled.has(robot)

function* rivalSightObstacles(world: ContactWorld, observer: RobotState, rival: RobotState) {
  for (const collider of world.colliders) if (collider.robot !== observer && collider.robot !== rival && !collider.playerOnly) yield collider.platform
}

/** Hostility uses ordinary forward sight and cover, never hidden player data. */
export function visibleShovebotRival(run: Run, robot: RobotState, world: ContactWorld, range = 300) {
  let closest: RobotState | undefined, distance = range
  for (const other of run.robots) {
    if (other === robot || !botsAreEnemies(robot, other) || !botActive(run, other)) continue
    const dx = other.x - robot.x, dy = other.y - robot.y, gap = Math.hypot(dx, dy)
    const touching = !!robot.actor && robotTouchesPlayer(other, robot.actor)
    if ((!touching && dx * robot.facing <= 0) || Math.abs(dy) > 100 || gap > distance) continue
    if (!touching && lineBlocked([robot.x + robot.facing * 13.5, robot.y - 42], [other.x, other.y + robotTop(other) / 2], rivalSightObstacles(world, robot, other))) continue
    closest = other; distance = gap
  }
  return closest
}

/** Nearest visible opponent, retaining a charge target through small distance ties. */
export function chooseShovebotTarget(run: Run, robot: RobotState, world: ContactWorld) {
  const rivals = run.robots.filter(other => other.actor && botsAreEnemies(robot, other))
  const old = chargeTargets.get(robot)
  const contact = rivals.find(other => robotTouchesPlayer(robot, other.actor!))
  if (contact) faceRobotToward(robot, contact.x)
  const candidates: Player[] = []
  robot.seesPlayer = robotSensesPlayer(robot, run.player, robotSightObstacles(world, robot))
  if (robot.seesPlayer) candidates.push(run.player)
  for (const rival of rivals) if (botActive(run, rival)
    && (rival === contact || robotSensesPlayer(robot, rival.actor!, rivalSightObstacles(world, robot, rival)))) candidates.push(rival.actor!)
  candidates.sort((a, b) => Math.hypot(a.x - robot.x, a.y - robot.y) - Math.hypot(b.x - robot.x, b.y - robot.y))
  let target = candidates[0]
  if (old && candidates.includes(old) && (robot.phase === 'windup' || robot.phase === 'charge'
    || Math.hypot(old.x - robot.x, old.y - robot.y) <= Math.hypot(target.x - robot.x, target.y - robot.y) * 1.2)) target = old
  if (target) chargeTargets.set(robot, target)
  else chargeTargets.delete(robot)
  return target
}

/** A real chassis impact, resolved as velocity by the humanoid's normal motor. */
export function ramRival(run: Run, robot: RobotState) {
  if (robot.phase !== 'charge' || !botActive(run, robot)) return
  const rival = run.robots.find(other => other.actor && botsAreEnemies(robot, other)
    && (other.x - robot.x) * robot.facing >= 0 && robotTouchesPlayer(robot, other.actor!))
  if (!rival) return
  const actor = rival.actor!
  repulsePlayer(actor, [robot.facing * 540 / REPULSOR_BOT_IMPULSE, -(actor.inverted ? -1 : 1) * 90 / REPULSOR_BOT_IMPULSE])
  actor.stagger = Math.max(actor.stagger ?? 0, .25); actor.shoveDrift = true
  faceRobotToward(rival, robot.x)
  rival.phase = 'recover'; rival.time = 0
  if (actor.armAim) actor.armAim.aiming = false
  // The heavy body stops the charge. Let the drive reset before the next ram,
  // rather than stun-locking the hunter faster than its palm can charge.
  robot.phase = 'recover'; robot.time = -.6
  robot.rams = (robot.rams ?? 0) + 1
}
