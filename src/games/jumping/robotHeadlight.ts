import type { RobotState } from './challenge.ts'
import { robotTop } from './robotPhysics.ts'
import { presentedAthletePose } from './athlete.ts'
import { REPULSOR_BOT_WIDTH_SCALE } from './repulsorBotRig.ts'

export const ROBOT_HEADLIGHT_X = 27, ROBOT_HEADLIGHT_SPREAD = 40, ROBOT_HEADLIGHT_TILT = 15
export const robotHeadlightY = (robot: Pick<RobotState, 'phase'>) => robotTop(robot) + 19

/** Mount just outside the front face, keeping the bot out of its own beam. */
export function robotHeadlightPose(robot: Pick<RobotState, 'x' | 'y' | 'angle' | 'facing' | 'phase'> & Partial<Pick<RobotState, 'actor'>>) {
  if (robot.actor) {
    const head = presentedAthletePose(robot.actor).head, flip = robot.actor.inverted ? -1 : 1
    return { x: robot.x + (head[0] * REPULSOR_BOT_WIDTH_SCALE + 11) * robot.facing, y: robot.y + head[1] * flip,
      direction: robot.facing < 0 ? 165 : 15 }
  }
  const x = ROBOT_HEADLIGHT_X * robot.facing, y = robotHeadlightY(robot) + 9
  const c = Math.cos(robot.angle), s = Math.sin(robot.angle)
  return { x: robot.x + x * c - y * s, y: robot.y - 9 + x * s + y * c,
    direction: ((robot.angle * 180 / Math.PI + (robot.facing < 0 ? 180 - ROBOT_HEADLIGHT_TILT : ROBOT_HEADLIGHT_TILT) + 540) % 360) - 180 }
}
