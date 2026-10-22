import type { Run } from './challenge.ts'
import { repulsePlayer } from './actorImpulse.ts'
import { robotTouchesPlayer } from './robotPhysics.ts'

export const CONTACT_EMP_SECONDS = 2

/** Electrical contact suppresses control, never the collision/physics step. */
export function applyContactEmp(run: Run) {
  if (run.empRemaining > 0) return
  for (const robot of run.robots) {
    if (robot.definition.mode !== 'emp' || robot.deactivated || run.gadgets.disabled.has(robot)) continue
    if (robotTouchesPlayer(robot, run.player)) {
      // Release supporting hands on the first shock without a launch impulse.
      if (!run.gadgets.disabled.has(run.player)) repulsePlayer(run.player, [0, 0])
      run.gadgets.disabled.set(run.player, CONTACT_EMP_SECONDS)
      run.gadgets.aiming = false
      if (run.player.heldTool) run.player.heldTool.aiming = false
    }
    for (const rival of run.robots) if (rival.actor && robotTouchesPlayer(robot, rival.actor)) {
      if (!run.gadgets.disabled.has(rival)) repulsePlayer(rival.actor, [0, 0])
      run.gadgets.disabled.set(rival, Math.max(CONTACT_EMP_SECONDS, run.gadgets.disabled.get(rival) ?? 0))
      rival.actor.shove = undefined; rival.actor.shoveDrift = true
      if (rival.actor.armAim) rival.actor.armAim.aiming = false
      rival.phase = 'recover'; rival.time = 0
    }
  }
}
