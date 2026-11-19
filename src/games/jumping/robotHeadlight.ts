import type { RobotState } from './challenge.ts'
import { robotTop } from './robotPhysics.ts'
import { repulsorBotPoint, repulsorBotPose, repulsorBotWidthScale } from './repulsorBotRig.ts'
import { wallFrameAngle } from './wallFrame.ts'

export const ROBOT_HEADLIGHT_X = 27, ROBOT_HEADLIGHT_SPREAD = 40, ROBOT_HEADLIGHT_TILT = 15
export const robotHeadlightY = (robot: Pick<RobotState, 'phase'>) => robotTop(robot) + 19

/** Mount just outside the front face, keeping the bot out of its own beam. */
export function robotHeadlightPose(robot: Pick<RobotState, 'x' | 'y' | 'angle' | 'facing' | 'phase'> & Partial<Pick<RobotState, 'actor'>>) {
  if (robot.actor) {
    const actor = robot.actor, head = repulsorBotPose(actor).head, width = repulsorBotWidthScale(actor)
    // Just ahead of the face, in the robot's own (wall) frame.
    const [x, y] = repulsorBotPoint(actor, [head[0] + 11 / width, head[1]], width), turn = wallFrameAngle(actor.wall) * 180 / Math.PI
    return { x, y, direction: (((robot.facing < 0 ? 165 : 15) + turn + 540) % 360) - 180 }
  }
  const x = ROBOT_HEADLIGHT_X * robot.facing, y = robotHeadlightY(robot) + 9
  const c = Math.cos(robot.angle), s = Math.sin(robot.angle)
  return { x: robot.x + x * c - y * s, y: robot.y - 9 + x * s + y * c,
    direction: ((robot.angle * 180 / Math.PI + (robot.facing < 0 ? 180 - ROBOT_HEADLIGHT_TILT : ROBOT_HEADLIGHT_TILT) + 540) % 360) - 180 }
}
